import { Hono } from 'hono';
import { eq, and, or, ilike, desc, asc, sql, count, isNull, gte, lte, inArray, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import {
  users,
  videos,
  adminUsers,
  userSanctions,
  systemConfig,
  adminAuditLog,
  organizations,
  organizationMembers,
  domains,
  domainUsers,
  domainRoles,
  domainUserRoles,
  domainGroups,
  domainGroupMembers,
  domainDnsRecords,
  domainHealthChecks,
  domainHealthSummaries,
  type AdminUser,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import {
  ensureSystemDomainRoles,
  getDomainPermissionCatalog,
  getEffectiveDomainAccess,
  getLegacyDomainRole,
  listInheritedGlobalAdmins,
} from '../services/domain-access.js';
import { broadcastAdminActivity } from '../websocket/admin.js';
import {
  dnsValidationService,
  domainHealthService,
} from '../services/domain-health.js';

// Domain-specific sub-routers extracted from this file
import { adminUsersRouter, sanitizeSearchQuery } from './admin-users.js';
import { adminOrgsRouter } from './admin-orgs.js';
import { adminVideosRouter } from './admin-videos.js';
import { adminAnalyticsRouter } from './admin-analytics.js';
import { adminAuditRouter } from './admin-audit.js';

export const adminRouter = new Hono();

// Apply admin auth to all routes
adminRouter.use('*', adminAuthMiddleware);

// Mount domain-specific sub-routers
adminRouter.route('/', adminUsersRouter);
adminRouter.route('/', adminOrgsRouter);
adminRouter.route('/', adminVideosRouter);
adminRouter.route('/', adminAnalyticsRouter);
adminRouter.route('/', adminAuditRouter);

// ============================================
// Session & Access
// ============================================

// Get current admin session
adminRouter.get('/io.exprsn.admin.getSession', async (c) => {
  const adminUser = c.get('adminUser');
  const permissions = c.get('adminPermissions');
  const did = c.get('did');

  // Get user info
  const [user] = await db.select().from(users).where(eq(users.did, did)).limit(1);

  return c.json({
    admin: {
      id: adminUser.id,
      role: adminUser.role,
      permissions,
      lastLoginAt: adminUser.lastLoginAt,
    },
    user: user
      ? {
          did: user.did,
          handle: user.handle,
          displayName: user.displayName,
          avatar: user.avatar,
        }
      : null,
  });
});

// Validate admin access for specific permission
adminRouter.post('/io.exprsn.admin.validateAccess', async (c) => {
  const body = await c.req.json<{ permission: string }>();
  const permissions = c.get('adminPermissions');

  return c.json({
    hasAccess: permissions.includes(body.permission),
  });
});

// ============================================
// Federation Management
// ============================================

// Get federation settings
adminRouter.get(
  '/io.exprsn.admin.federation.getSettings',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const [federation] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, 'federation'))
      .limit(1);

    const [cache] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, 'cache'))
      .limit(1);

    const [serviceAuth] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, 'serviceAuth'))
      .limit(1);

    return c.json({
      federation: federation?.value || null,
      cache: cache?.value || null,
      serviceAuth: serviceAuth?.value || null,
    });
  }
);

// Update federation settings
adminRouter.post(
  '/io.exprsn.admin.federation.updateSettings',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      federation?: unknown;
      cache?: unknown;
      serviceAuth?: unknown;
    }>();
    const adminUser = c.get('adminUser');

    const updates: string[] = [];

    if (body.federation !== undefined) {
      await db
        .update(systemConfig)
        .set({ value: body.federation, updatedBy: adminUser.id, updatedAt: new Date() })
        .where(eq(systemConfig.key, 'federation'));
      updates.push('federation');
    }

    if (body.cache !== undefined) {
      await db
        .update(systemConfig)
        .set({ value: body.cache, updatedBy: adminUser.id, updatedAt: new Date() })
        .where(eq(systemConfig.key, 'cache'));
      updates.push('cache');
    }

    if (body.serviceAuth !== undefined) {
      await db
        .update(systemConfig)
        .set({ value: body.serviceAuth, updatedBy: adminUser.id, updatedAt: new Date() })
        .where(eq(systemConfig.key, 'serviceAuth'));
      updates.push('serviceAuth');
    }

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'federation.updateSettings',
      targetType: 'config',
      targetId: 'federation',
      details: { updatedKeys: updates },
      createdAt: new Date(),
    });

    return c.json({ success: true, updated: updates });
  }
);

// Get service registry
adminRouter.get(
  '/io.exprsn.admin.federation.getServices',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const type = c.req.query('type');
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    // Import serviceRegistry table
    const { serviceRegistry } = await import('../db/schema.js');

    let conditions = [];
    if (type) conditions.push(eq(serviceRegistry.type, type));
    if (status) conditions.push(eq(serviceRegistry.status, status));

    const services = await db
      .select()
      .from(serviceRegistry)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(serviceRegistry.createdAt))
      .limit(limit);

    return c.json({ services });
  }
);

// Register a service
adminRouter.post(
  '/io.exprsn.admin.federation.registerService',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      type: 'pds' | 'relay' | 'appview' | 'labeler';
      endpoint: string;
      did?: string;
      certificateId?: string;
      region?: string;
      capabilities?: string[];
    }>();
    const adminUser = c.get('adminUser');

    if (!body.type || !body.endpoint) {
      return c.json({ error: 'InvalidRequest', message: 'type and endpoint are required' }, 400);
    }

    const { serviceRegistry } = await import('../db/schema.js');

    const serviceId = nanoid();
    await db.insert(serviceRegistry).values({
      id: serviceId,
      type: body.type,
      endpoint: body.endpoint,
      did: body.did,
      certificateId: body.certificateId,
      region: body.region,
      capabilities: body.capabilities || [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'federation.registerService',
      targetType: 'service',
      targetId: serviceId,
      details: { type: body.type, endpoint: body.endpoint },
      createdAt: new Date(),
    });

    return c.json({ success: true, serviceId });
  }
);

// Update service status
adminRouter.post(
  '/io.exprsn.admin.federation.updateService',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      serviceId: string;
      status?: 'active' | 'inactive' | 'unhealthy';
      certificateId?: string;
      capabilities?: string[];
    }>();
    const adminUser = c.get('adminUser');

    if (!body.serviceId) {
      return c.json({ error: 'InvalidRequest', message: 'serviceId is required' }, 400);
    }

    const { serviceRegistry } = await import('../db/schema.js');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) updates.status = body.status;
    if (body.certificateId) updates.certificateId = body.certificateId;
    if (body.capabilities) updates.capabilities = body.capabilities;

    await db
      .update(serviceRegistry)
      .set(updates)
      .where(eq(serviceRegistry.id, body.serviceId));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'federation.updateService',
      targetType: 'service',
      targetId: body.serviceId,
      details: updates,
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// Get relay subscribers
adminRouter.get(
  '/io.exprsn.admin.federation.getSubscribers',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    const { relaySubscribers } = await import('../db/schema.js');

    let conditions = [];
    if (status) conditions.push(eq(relaySubscribers.status, status));

    const subscribers = await db
      .select()
      .from(relaySubscribers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(relaySubscribers.createdAt))
      .limit(limit);

    return c.json({ subscribers });
  }
);

// Get federation sync state
adminRouter.get(
  '/io.exprsn.admin.federation.getSyncState',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const { federationSyncState } = await import('../db/schema.js');

    const syncStates = await db
      .select()
      .from(federationSyncState)
      .orderBy(desc(federationSyncState.updatedAt))
      .limit(50);

    return c.json({ syncStates });
  }
);

// Get DID cache stats
adminRouter.get(
  '/io.exprsn.admin.federation.getDidCacheStats',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const { didCache } = await import('../db/schema.js');

    const [totalCount] = await db.select({ count: count() }).from(didCache);

    const now = new Date();
    const [expiredCount] = await db
      .select({ count: count() })
      .from(didCache)
      .where(lte(didCache.expiresAt, now));

    // Get sample of recent entries
    const recentEntries = await db
      .select({
        did: didCache.did,
        handle: didCache.handle,
        pdsEndpoint: didCache.pdsEndpoint,
        resolvedAt: didCache.resolvedAt,
        expiresAt: didCache.expiresAt,
      })
      .from(didCache)
      .orderBy(desc(didCache.resolvedAt))
      .limit(10);

    return c.json({
      stats: {
        totalEntries: totalCount?.count || 0,
        expiredEntries: expiredCount?.count || 0,
        activeEntries: (totalCount?.count || 0) - (expiredCount?.count || 0),
      },
      recentEntries,
    });
  }
);

// Clear DID cache
adminRouter.post(
  '/io.exprsn.admin.federation.clearDidCache',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ expiredOnly?: boolean }>();
    const adminUser = c.get('adminUser');

    const { didCache } = await import('../db/schema.js');

    let deletedCount = 0;
    if (body.expiredOnly) {
      // Count before deleting
      const [countResult] = await db.select({ count: count() }).from(didCache).where(lte(didCache.expiresAt, new Date()));
      deletedCount = countResult?.count || 0;
      await db.delete(didCache).where(lte(didCache.expiresAt, new Date()));
    } else {
      // Count before deleting
      const [countResult] = await db.select({ count: count() }).from(didCache);
      deletedCount = countResult?.count || 0;
      await db.delete(didCache);
    }

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'federation.clearDidCache',
      targetType: 'cache',
      targetId: 'didCache',
      details: { expiredOnly: body.expiredOnly, deletedCount },
      createdAt: new Date(),
    });

    return c.json({ success: true, deletedCount });
  }
);

// ============================================
// PLC Directory Administration
// ============================================

// Get PLC configuration
adminRouter.get(
  '/io.exprsn.admin.plc.getConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, 'plc'))
      .limit(1);

    const defaultConfig = {
      enabled: false,
      mode: 'standalone',
      externalPlcUrl: null,
      domain: 'plc.exprsn.io',
      handleSuffix: 'exprsn',
      orgHandleSuffix: 'org.exprsn',
      allowCustomHandles: false,
      requireInviteCode: false,
    };

    return c.json({
      config: config?.value || defaultConfig,
    });
  }
);

// Update PLC configuration
adminRouter.post(
  '/io.exprsn.admin.plc.updateConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser') as AdminUser;
    const body = await c.req.json<{
      enabled?: boolean;
      mode?: 'standalone' | 'external';
      externalPlcUrl?: string;
      domain?: string;
      handleSuffix?: string;
      orgHandleSuffix?: string;
      allowCustomHandles?: boolean;
      requireInviteCode?: boolean;
    }>();

    // Get existing config
    const [existing] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, 'plc'))
      .limit(1);

    const currentConfig = (existing?.value || {}) as Record<string, unknown>;
    const newConfig = { ...currentConfig, ...body };

    await db
      .insert(systemConfig)
      .values({
        key: 'plc',
        value: newConfig,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value: newConfig,
          updatedAt: new Date(),
        },
      });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'plc.updateConfig',
      targetType: 'config',
      targetId: 'plc',
      details: { previous: currentConfig, new: newConfig },
      createdAt: new Date(),
    });

    return c.json({ success: true, config: newConfig });
  }
);

// Get PLC statistics
adminRouter.get(
  '/io.exprsn.admin.plc.getStats',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const { plcIdentities, plcOperations, plcHandleReservations } = await import('../db/schema.js');

    const [identityCount] = await db.select({ count: count() }).from(plcIdentities);
    const [operationCount] = await db.select({ count: count() }).from(plcOperations);
    const [reservationCount] = await db
      .select({ count: count() })
      .from(plcHandleReservations)
      .where(eq(plcHandleReservations.status, 'active'));

    // Get recent operations
    const recentOperations = await db
      .select()
      .from(plcOperations)
      .orderBy(desc(plcOperations.createdAt))
      .limit(10);

    return c.json({
      totalIdentities: identityCount?.count || 0,
      totalOperations: operationCount?.count || 0,
      activeReservations: reservationCount?.count || 0,
      recentOperations: recentOperations.map((op) => ({
        did: op.did,
        cid: op.cid,
        createdAt: op.createdAt.toISOString(),
      })),
    });
  }
);

// List PLC identities
adminRouter.get(
  '/io.exprsn.admin.plc.listIdentities',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const { plcIdentities } = await import('../db/schema.js');

    const rawQuery = c.req.query('q');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const cursor = c.req.query('cursor');

    // Sanitize search query
    const query = sanitizeSearchQuery(rawQuery);

    let dbQuery = db.select().from(plcIdentities);

    if (query) {
      dbQuery = dbQuery.where(
        or(ilike(plcIdentities.did, `%${query}%`), ilike(plcIdentities.handle, `%${query}%`))
      ) as typeof dbQuery;
    }

    const identities = await dbQuery.orderBy(desc(plcIdentities.createdAt)).limit(limit);

    return c.json({
      identities: identities.map((id) => ({
        did: id.did,
        handle: id.handle,
        pdsEndpoint: id.pdsEndpoint,
        createdAt: id.createdAt.toISOString(),
        updatedAt: id.updatedAt.toISOString(),
      })),
    });
  }
);

// List handle reservations
adminRouter.get(
  '/io.exprsn.admin.plc.listReservations',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const { plcHandleReservations } = await import('../db/schema.js');

    const reservations = await db
      .select()
      .from(plcHandleReservations)
      .orderBy(desc(plcHandleReservations.reservedAt))
      .limit(100);

    return c.json({
      reservations: reservations.map((r) => ({
        id: r.id,
        handle: r.handle,
        handleType: r.handleType,
        organizationId: r.organizationId,
        status: r.status,
        reservedAt: r.reservedAt.toISOString(),
        expiresAt: r.expiresAt?.toISOString(),
      })),
    });
  }
);

// Get PLC audit log
adminRouter.get(
  '/io.exprsn.admin.plc.getAuditLog',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const did = c.req.query('did');
    const limit = parseInt(c.req.query('limit') || '100', 10);

    const { plcAuditLog } = await import('../db/schema.js');

    let query = db.select().from(plcAuditLog);

    if (did) {
      query = query.where(eq(plcAuditLog.did, did)) as typeof query;
    }

    const entries = await query
      .orderBy(desc(plcAuditLog.createdAt))
      .limit(limit);

    return c.json({
      entries: entries.map((e) => ({
        id: e.id,
        did: e.did,
        action: e.action,
        operationCid: e.operationCid,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  }
);

// Get detailed identity information
adminRouter.get(
  '/io.exprsn.admin.plc.getIdentity',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
    }

    const { plcIdentities, plcOperations, plcAuditLog } = await import('../db/schema.js');

    // Get identity
    const [identity] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    if (!identity) {
      return c.json({ error: 'NotFound', message: 'Identity not found' }, 404);
    }

    // Get operation count
    const [opCount] = await db
      .select({ count: count() })
      .from(plcOperations)
      .where(eq(plcOperations.did, did));

    // Get recent operations
    const operations = await db
      .select()
      .from(plcOperations)
      .where(eq(plcOperations.did, did))
      .orderBy(desc(plcOperations.createdAt))
      .limit(10);

    // Get audit log entries
    const auditEntries = await db
      .select()
      .from(plcAuditLog)
      .where(eq(plcAuditLog.did, did))
      .orderBy(desc(plcAuditLog.createdAt))
      .limit(20);

    // Check if linked to a user
    const [user] = await db
      .select({
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        followerCount: users.followerCount,
        videoCount: users.videoCount,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.did, did))
      .limit(1);

    return c.json({
      identity: {
        did: identity.did,
        handle: identity.handle,
        pdsEndpoint: identity.pdsEndpoint,
        signingKey: identity.signingKey,
        rotationKeys: identity.rotationKeys,
        alsoKnownAs: identity.alsoKnownAs,
        services: identity.services,
        lastOperationCid: identity.lastOperationCid,
        status: identity.status,
        tombstonedAt: identity.tombstonedAt?.toISOString(),
        tombstonedBy: identity.tombstonedBy,
        tombstoneReason: identity.tombstoneReason,
        createdAt: identity.createdAt.toISOString(),
        updatedAt: identity.updatedAt.toISOString(),
      },
      user: user || null,
      operationCount: opCount?.count || 0,
      recentOperations: operations.map((op) => ({
        id: op.id,
        cid: op.cid,
        operation: op.operation,
        nullified: op.nullified,
        createdAt: op.createdAt.toISOString(),
      })),
      auditLog: auditEntries.map((e) => ({
        id: e.id,
        action: e.action,
        operationCid: e.operationCid,
        previousState: e.previousState,
        newState: e.newState,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  }
);

// Get operation details
adminRouter.get(
  '/io.exprsn.admin.plc.getOperation',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const cid = c.req.query('cid');
    const id = c.req.query('id');

    if (!cid && !id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing cid or id' }, 400);
    }

    const { plcOperations } = await import('../db/schema.js');

    let query = db.select().from(plcOperations);
    if (cid) {
      query = query.where(eq(plcOperations.cid, cid)) as typeof query;
    } else if (id) {
      query = query.where(eq(plcOperations.id, parseInt(id, 10))) as typeof query;
    }

    const [operation] = await query.limit(1);

    if (!operation) {
      return c.json({ error: 'NotFound', message: 'Operation not found' }, 404);
    }

    // Get previous and next operations in the chain
    const [prevOp] = await db
      .select()
      .from(plcOperations)
      .where(
        and(
          eq(plcOperations.did, operation.did),
          sql`${plcOperations.id} < ${operation.id}`
        )
      )
      .orderBy(desc(plcOperations.id))
      .limit(1);

    const [nextOp] = await db
      .select()
      .from(plcOperations)
      .where(
        and(
          eq(plcOperations.did, operation.did),
          sql`${plcOperations.id} > ${operation.id}`
        )
      )
      .orderBy(asc(plcOperations.id))
      .limit(1);

    return c.json({
      operation: {
        id: operation.id,
        did: operation.did,
        cid: operation.cid,
        operation: operation.operation,
        nullified: operation.nullified,
        createdAt: operation.createdAt.toISOString(),
      },
      previousOperation: prevOp
        ? {
            id: prevOp.id,
            cid: prevOp.cid,
            createdAt: prevOp.createdAt.toISOString(),
          }
        : null,
      nextOperation: nextOp
        ? {
            id: nextOp.id,
            cid: nextOp.cid,
            createdAt: nextOp.createdAt.toISOString(),
          }
        : null,
    });
  }
);

// List all operations for a DID
adminRouter.get(
  '/io.exprsn.admin.plc.listOperations',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
    }

    const { plcOperations } = await import('../db/schema.js');

    const operations = await db
      .select()
      .from(plcOperations)
      .where(eq(plcOperations.did, did))
      .orderBy(desc(plcOperations.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: count() })
      .from(plcOperations)
      .where(eq(plcOperations.did, did));

    return c.json({
      operations: operations.map((op) => ({
        id: op.id,
        cid: op.cid,
        operation: op.operation,
        nullified: op.nullified,
        createdAt: op.createdAt.toISOString(),
      })),
      total: totalCount?.count || 0,
      hasMore: offset + operations.length < (totalCount?.count || 0),
    });
  }
);

// Tombstone an identity (admin action)
adminRouter.post(
  '/io.exprsn.admin.plc.tombstoneIdentity',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const adminUser = c.get('adminUser') as AdminUser;
    const body = await c.req.json<{
      did: string;
      reason: string;
    }>();

    if (!body.did || !body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did or reason' }, 400);
    }

    const { plcIdentities, plcAuditLog } = await import('../db/schema.js');

    // Get existing identity
    const [identity] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, body.did))
      .limit(1);

    if (!identity) {
      return c.json({ error: 'NotFound', message: 'Identity not found' }, 404);
    }

    if (identity.status === 'tombstoned') {
      return c.json({ error: 'AlreadyTombstoned', message: 'Identity is already tombstoned' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');

    // Update identity status
    await db
      .update(plcIdentities)
      .set({
        status: 'tombstoned',
        tombstonedAt: new Date(),
        tombstonedBy: adminUser.id,
        tombstoneReason: body.reason,
        updatedAt: new Date(),
      })
      .where(eq(plcIdentities.did, body.did));

    // Add audit log entry
    await db.insert(plcAuditLog).values({
      did: body.did,
      action: 'admin_tombstone',
      previousState: { status: identity.status },
      newState: { status: 'tombstoned', reason: body.reason },
      ipAddress,
      userAgent,
    });

    // Add to admin audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'plc.tombstoneIdentity',
      targetType: 'identity',
      targetId: body.did,
      details: { reason: body.reason },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// Reactivate a tombstoned identity (admin action)
adminRouter.post(
  '/io.exprsn.admin.plc.reactivateIdentity',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const adminUser = c.get('adminUser') as AdminUser;
    const body = await c.req.json<{
      did: string;
      reason: string;
    }>();

    if (!body.did || !body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did or reason' }, 400);
    }

    const { plcIdentities, plcAuditLog } = await import('../db/schema.js');

    // Get existing identity
    const [identity] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, body.did))
      .limit(1);

    if (!identity) {
      return c.json({ error: 'NotFound', message: 'Identity not found' }, 404);
    }

    if (identity.status === 'active') {
      return c.json({ error: 'AlreadyActive', message: 'Identity is already active' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');

    // Update identity status
    await db
      .update(plcIdentities)
      .set({
        status: 'active',
        tombstonedAt: null,
        tombstonedBy: null,
        tombstoneReason: null,
        updatedAt: new Date(),
      })
      .where(eq(plcIdentities.did, body.did));

    // Add audit log entry
    await db.insert(plcAuditLog).values({
      did: body.did,
      action: 'admin_reactivate',
      previousState: { status: identity.status, reason: identity.tombstoneReason },
      newState: { status: 'active', reason: body.reason },
      ipAddress,
      userAgent,
    });

    // Add to admin audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'plc.reactivateIdentity',
      targetType: 'identity',
      targetId: body.did,
      details: { reason: body.reason, previousStatus: identity.status },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// ============================================
// PLC Test Endpoints
// ============================================

// Test PLC server connectivity
adminRouter.get(
  '/io.exprsn.admin.plc.test.connectivity',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains } = await import('../db/schema.js');

    // Get domain config
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const plcConfig = domain.plcConfig;
    let plcUrl: string;

    if (plcConfig?.selfHostedPlc?.enabled && plcConfig?.selfHostedPlc?.url) {
      plcUrl = plcConfig.selfHostedPlc.url;
    } else if (plcConfig?.externalPlcUrl) {
      plcUrl = plcConfig.externalPlcUrl;
    } else {
      plcUrl = process.env.PLC_URL || 'http://localhost:3002/plc';
    }

    try {
      // Test connectivity by fetching health or a known endpoint
      const response = await fetch(`${plcUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      // If health endpoint doesn't exist, try fetching the root
      if (!response || !response.ok) {
        const rootResponse = await fetch(plcUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);

        if (rootResponse && rootResponse.ok) {
          return c.json({
            connected: true,
            plcUrl,
            latency: 'OK',
            message: 'PLC server is reachable',
          });
        }
      }

      if (response && response.ok) {
        const data = await response.json().catch(() => ({}));
        return c.json({
          connected: true,
          plcUrl,
          health: data,
          message: 'PLC server is healthy',
        });
      }

      // Even if we can't get health, if we got any response, it's reachable
      if (response) {
        return c.json({
          connected: true,
          plcUrl,
          statusCode: response.status,
          message: 'PLC server responded',
        });
      }

      return c.json({
        connected: false,
        plcUrl,
        message: 'Failed to connect to PLC server',
      }, 503);
    } catch (error) {
      return c.json({
        connected: false,
        plcUrl,
        error: error instanceof Error ? error.message : 'Connection failed',
        message: 'Failed to connect to PLC server',
      }, 503);
    }
  }
);

// Test DID resolution
adminRouter.get(
  '/io.exprsn.admin.plc.test.resolve-did',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const did = c.req.query('did');
    const domainId = c.req.query('domainId');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
    }

    const { domains, plcIdentities } = await import('../db/schema.js');

    // First check local database
    const [localIdentity] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    if (localIdentity) {
      return c.json({
        resolved: true,
        source: 'local',
        did,
        document: {
          did,
          handle: localIdentity.handle,
          pdsEndpoint: localIdentity.pdsEndpoint,
          status: localIdentity.status,
          createdAt: localIdentity.createdAt,
        },
      });
    }

    // Try external resolution
    try {
      const { DIDResolver } = await import('../services/identity/DIDResolver.js');
      const resolver = new DIDResolver({ db });
      const resolution = await resolver.resolve(did);

      if (resolution) {
        return c.json({
          resolved: true,
          source: resolution.source || 'external',
          did,
          document: resolution.document,
        });
      }

      return c.json({
        resolved: false,
        did,
        message: 'DID not found',
      }, 404);
    } catch (error) {
      return c.json({
        resolved: false,
        did,
        error: error instanceof Error ? error.message : 'Resolution failed',
      }, 500);
    }
  }
);

// Test handle resolution
adminRouter.get(
  '/io.exprsn.admin.plc.test.resolve-handle',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const handle = c.req.query('handle');
    const domainId = c.req.query('domainId');

    if (!handle) {
      return c.json({ error: 'InvalidRequest', message: 'Missing handle' }, 400);
    }

    const { plcIdentities, users } = await import('../db/schema.js');

    // Check local database for handle
    const [localIdentity] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.handle, handle))
      .limit(1);

    if (localIdentity) {
      return c.json({
        resolved: true,
        source: 'plcIdentities',
        handle,
        did: localIdentity.did,
        pdsEndpoint: localIdentity.pdsEndpoint,
        status: localIdentity.status,
      });
    }

    // Check users table
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.handle, handle))
      .limit(1);

    if (user) {
      return c.json({
        resolved: true,
        source: 'users',
        handle,
        did: user.did,
        displayName: user.displayName,
      });
    }

    // Try DNS resolution for external handles
    try {
      const dnsHandle = handle.replace(/^@/, '');
      // Check _atproto TXT record
      const dnsRecordUrl = `https://dns.google/resolve?name=_atproto.${dnsHandle}&type=TXT`;
      const dnsRes = await fetch(dnsRecordUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (dnsRes.ok) {
        const dnsData = await dnsRes.json() as Record<string, unknown>;
        const answers = (dnsData.Answer || []) as Array<{ data?: string }>;
        const didRecord = answers.find((a: any) => a.data?.includes('did='));

        if (didRecord) {
          const didMatch = didRecord.data?.match(/did=([^\s"]+)/);
          if (didMatch) {
            return c.json({
              resolved: true,
              source: 'dns',
              handle,
              did: didMatch[1],
              dnsRecord: didRecord.data,
            });
          }
        }
      }

      return c.json({
        resolved: false,
        handle,
        message: 'Handle not found in local database or DNS',
      }, 404);
    } catch (error) {
      return c.json({
        resolved: false,
        handle,
        error: error instanceof Error ? error.message : 'Resolution failed',
        message: 'Failed to resolve handle',
      }, 500);
    }
  }
);

// ============================================
// Content Limits Configuration
// ============================================

// Get content limits configuration
adminRouter.get(
  '/io.exprsn.admin.config.getContentLimits',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, 'contentLimits'))
      .limit(1);

    const defaultLimits = {
      maxPostLength: 300, // Characters for text posts
      maxVideoLength: 180, // Seconds
      maxVideoSize: 500, // MB
      maxBioLength: 160,
      maxDisplayNameLength: 64,
      maxHashtagsPerPost: 10,
      maxMentionsPerPost: 20,
      maxLinksPerPost: 5,
      maxUploadsPerDay: 50,
      maxVideosPerDay: 10,
    };

    return c.json({
      limits: config?.value || defaultLimits,
    });
  }
);

// Update content limits configuration
adminRouter.post(
  '/io.exprsn.admin.config.updateContentLimits',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser') as AdminUser;
    const body = await c.req.json<{
      maxPostLength?: number;
      maxVideoLength?: number;
      maxVideoSize?: number;
      maxBioLength?: number;
      maxDisplayNameLength?: number;
      maxHashtagsPerPost?: number;
      maxMentionsPerPost?: number;
      maxLinksPerPost?: number;
      maxUploadsPerDay?: number;
      maxVideosPerDay?: number;
    }>();

    // Get existing config
    const [existing] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, 'contentLimits'))
      .limit(1);

    const currentLimits = (existing?.value || {}) as Record<string, unknown>;
    const newLimits = { ...currentLimits, ...body };

    await db
      .insert(systemConfig)
      .values({
        key: 'contentLimits',
        value: newLimits,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value: newLimits,
          updatedAt: new Date(),
        },
      });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'config.updateContentLimits',
      targetType: 'config',
      targetId: 'contentLimits',
      details: { previous: currentLimits, new: newLimits },
      createdAt: new Date(),
    });

    return c.json({ success: true, limits: newLimits });
  }
);









// ============================================
// Domain Management
// ============================================

// List all domains
adminRouter.get(
  '/io.exprsn.admin.domains.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const rawQ = c.req.query('q');
    const type = c.req.query('type') as 'hosted' | 'federated' | undefined;
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const cursor = c.req.query('cursor');

    // Sanitize search query
    const q = sanitizeSearchQuery(rawQ);

    const { domains } = await import('../db/schema.js');

    let conditions = [];

    if (q) {
      conditions.push(
        or(
          ilike(domains.name, `%${q}%`),
          ilike(domains.domain, `%${q}%`)
        )
      );
    }

    if (type) {
      conditions.push(eq(domains.type, type));
    }

    if (status) {
      conditions.push(eq(domains.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const domainList = await db
      .select()
      .from(domains)
      .where(whereClause)
      .orderBy(desc(domains.createdAt))
      .limit(limit + 1);

    const hasMore = domainList.length > limit;
    const items = hasMore ? domainList.slice(0, -1) : domainList;

    // Get health summaries for all domains
    const domainIds = items.map((d) => d.id);
    const healthSummaries = domainIds.length > 0
      ? await db
          .select()
          .from(domainHealthSummaries)
          .where(sql`${domainHealthSummaries.domainId} IN (${sql.join(domainIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];

    const healthMap = new Map(healthSummaries.map((h) => [h.domainId, h]));

    // Get stats
    const [stats] = await db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${domains.status} = 'active')`,
        pending: sql<number>`count(*) filter (where ${domains.status} = 'pending' or ${domains.status} = 'verifying')`,
        hosted: sql<number>`count(*) filter (where ${domains.type} = 'hosted')`,
        federated: sql<number>`count(*) filter (where ${domains.type} = 'federated')`,
      })
      .from(domains);

    return c.json({
      domains: items.map((d) => {
        const health = healthMap.get(d.id);
        return {
          id: d.id,
          name: d.name,
          domain: d.domain,
          type: d.type,
          status: d.status,
          userCount: d.userCount,
          groupCount: d.groupCount,
          certificateCount: d.certificateCount,
          verifiedAt: d.verifiedAt?.toISOString(),
          createdAt: d.createdAt.toISOString(),
          health: health
            ? {
                overallStatus: health.overallStatus,
                dnsStatus: health.dnsStatus,
                lastHealthCheck: health.lastHealthCheck?.toISOString(),
                lastDnsCheck: health.lastDnsCheck?.toISOString(),
                uptimePercentage: health.uptimePercentage,
              }
            : undefined,
        };
      }),
      stats: {
        total: stats?.total || 0,
        active: stats?.active || 0,
        pending: stats?.pending || 0,
        hosted: stats?.hosted || 0,
        federated: stats?.federated || 0,
      },
      cursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : undefined,
    });
  }
);

// Get domain details
adminRouter.get(
  '/io.exprsn.admin.domains.get',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domains, domainUsers, domainGroups, domainActivityLog, caIntermediateCertificates, caEntityCertificates } = await import('../db/schema.js');

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, id))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Get user count by role
    const userStatsByRole = await db
      .select({
        role: domainUsers.role,
        count: count(),
      })
      .from(domainUsers)
      .where(eq(domainUsers.domainId, id))
      .groupBy(domainUsers.role);

    // Get total and active user counts
    const [totalUsersResult] = await db
      .select({ count: count() })
      .from(domainUsers)
      .where(eq(domainUsers.domainId, id));

    const [activeUsersResult] = await db
      .select({ count: count() })
      .from(domainUsers)
      .where(
        and(
          eq(domainUsers.domainId, id),
          eq(domainUsers.isActive, true)
        )
      );

    // Build userStats object with expected structure
    const roleBreakdown = userStatsByRole.reduce((acc, s) => ({ ...acc, [s.role]: Number(s.count) }), {} as Record<string, number>);
    const userStats = {
      total: Number(totalUsersResult?.count || 0),
      active: Number(activeUsersResult?.count || 0),
      admins: roleBreakdown.admin || 0,
      moderators: roleBreakdown.moderator || 0,
      members: roleBreakdown.member || 0,
      ...roleBreakdown,
    };

    // Get group count
    const [groupCount] = await db
      .select({ count: count() })
      .from(domainGroups)
      .where(eq(domainGroups.domainId, id));

    // Get intermediate certificate if linked
    let intermediateCert = null;
    if (domain.intermediateCertId) {
      const [cert] = await db
        .select()
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.id, domain.intermediateCertId))
        .limit(1);
      if (cert) {
        intermediateCert = {
          id: cert.id,
          commonName: cert.commonName,
          status: cert.status,
          notBefore: cert.notBefore.toISOString(),
          notAfter: cert.notAfter.toISOString(),
        };
      }
    }

    // Get entity certificate count
    const [entityCertCount] = await db
      .select({ count: count() })
      .from(caEntityCertificates)
      .where(
        and(
          eq(caEntityCertificates.issuerId, domain.intermediateCertId || ''),
          eq(caEntityCertificates.issuerType, 'intermediate')
        )
      );

    // Get recent activity
    const recentActivity = await db
      .select()
      .from(domainActivityLog)
      .where(eq(domainActivityLog.domainId, id))
      .orderBy(desc(domainActivityLog.createdAt))
      .limit(10);

    return c.json({
      domain: {
        id: domain.id,
        name: domain.name,
        domain: domain.domain,
        type: domain.type,
        status: domain.status,
        handleSuffix: domain.handleSuffix,
        pdsEndpoint: domain.pdsEndpoint,
        federationDid: domain.federationDid,
        features: domain.features,
        rateLimits: domain.rateLimits,
        branding: domain.branding,
        dnsVerificationToken: domain.dnsVerificationToken,
        dnsVerifiedAt: domain.dnsVerifiedAt?.toISOString(),
        ownerOrgId: domain.ownerOrgId,
        ownerUserDid: domain.ownerUserDid,
        plcConfig: domain.plcConfig,
        federationConfig: domain.federationConfig,
        userCount: domain.userCount,
        groupCount: domain.groupCount,
        certificateCount: domain.certificateCount,
        identityCount: domain.identityCount,
        verifiedAt: domain.verifiedAt?.toISOString(),
        createdAt: domain.createdAt.toISOString(),
        updatedAt: domain.updatedAt.toISOString(),
      },
      userStats,
      groupCount: groupCount?.count || 0,
      intermediateCert,
      entityCertCount: entityCertCount?.count || 0,
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        actorDid: a.actorDid,
        targetType: a.targetType,
        targetId: a.targetId,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  }
);

// Get domain analytics
adminRouter.get(
  '/io.exprsn.admin.domains.analytics.get',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const period = (c.req.query('period') || 'month') as 'day' | 'week' | 'month' | 'year';

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains, domainUsers, videos, likes, comments } = await import('../db/schema.js');

    // Verify domain exists
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Calculate date ranges based on period
    const now = new Date();
    let startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get total users
    const [totalUsersResult] = await db
      .select({ count: count() })
      .from(domainUsers)
      .where(eq(domainUsers.domainId, domainId));

    // Get active users (active in last 30 days)
    const activeDate = new Date();
    activeDate.setDate(activeDate.getDate() - 30);
    const [activeUsersResult] = await db
      .select({ count: count() })
      .from(domainUsers)
      .where(
        and(
          eq(domainUsers.domainId, domainId),
          eq(domainUsers.isActive, true)
        )
      );

    // Get new users in period
    const [newUsersResult] = await db
      .select({ count: count() })
      .from(domainUsers)
      .where(
        and(
          eq(domainUsers.domainId, domainId),
          gte(domainUsers.createdAt, startDate)
        )
      );

    // Get total videos for domain users
    const [totalVideosResult] = await db
      .select({ count: count() })
      .from(videos)
      .innerJoin(domainUsers, eq(videos.authorDid, domainUsers.userDid))
      .where(eq(domainUsers.domainId, domainId));

    // Get total views (sum of video view counts)
    const videosList = await db
      .select({ viewCount: videos.viewCount })
      .from(videos)
      .innerJoin(domainUsers, eq(videos.authorDid, domainUsers.userDid))
      .where(eq(domainUsers.domainId, domainId));

    const totalViews = videosList.reduce((sum, v) => sum + (v.viewCount || 0), 0);

    // Get total likes
    const [totalLikesResult] = await db
      .select({ count: count() })
      .from(likes)
      .innerJoin(videos, eq(likes.videoUri, videos.uri))
      .innerJoin(domainUsers, eq(videos.authorDid, domainUsers.userDid))
      .where(eq(domainUsers.domainId, domainId));

    // Get total comments
    const [totalCommentsResult] = await db
      .select({ count: count() })
      .from(comments)
      .innerJoin(videos, eq(comments.videoUri, videos.uri))
      .innerJoin(domainUsers, eq(videos.authorDid, domainUsers.userDid))
      .where(eq(domainUsers.domainId, domainId));

    // Get top content (most viewed videos)
    const topContent = await db
      .select({
        uri: videos.uri,
        title: videos.caption,
        thumbnail: videos.thumbnailUrl,
        views: videos.viewCount,
        authorDid: videos.authorDid,
      })
      .from(videos)
      .innerJoin(domainUsers, eq(videos.authorDid, domainUsers.userDid))
      .where(eq(domainUsers.domainId, domainId))
      .orderBy(desc(videos.viewCount))
      .limit(10);

    // Get top creators (users with most followers)
    const topCreators = await db
      .select({
        did: domainUsers.userDid,
      })
      .from(domainUsers)
      .where(eq(domainUsers.domainId, domainId))
      .limit(10);

    const totalUsers = Number(totalUsersResult?.count || 0);
    const totalContent = Number(totalVideosResult?.count || 0);
    const totalLikes = Number(totalLikesResult?.count || 0);

    return c.json({
      stats: {
        totalUsers,
        activeUsers: Number(activeUsersResult?.count || 0),
        totalContent,
        totalViews: totalViews,
        totalLikes,
        newUsersToday: 0, // TODO: Calculate based on today
        newUsersWeek: Number(newUsersResult?.count || 0),
        engagementRate: totalContent > 0 ? (totalLikes / totalContent) * 100 : 0,
      },
      trends: {
        users: [],
        content: [],
        engagement: [],
      },
      topContent: topContent.map((v) => ({
        uri: v.uri,
        title: v.title,
        thumbnail: v.thumbnail,
        views: v.views || 0,
      })),
      topCreators: [], // TODO: Implement with user data
    });
  }
);

// Get domain render stats
adminRouter.get(
  '/io.exprsn.admin.domains.render.stats',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains, domainUsers, renderJobs, renderWorkers } = await import('../db/schema.js');

    // Verify domain exists
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);

    // Get render job stats for domain users
    const [queuedResult] = await db
      .select({ count: count() })
      .from(renderJobs)
      .innerJoin(domainUsers, eq(renderJobs.userDid, domainUsers.userDid))
      .where(
        and(
          eq(domainUsers.domainId, domainId),
          or(
            eq(renderJobs.status, 'pending'),
            eq(renderJobs.status, 'queued')
          )
        )
      );

    const [processingResult] = await db
      .select({ count: count() })
      .from(renderJobs)
      .innerJoin(domainUsers, eq(renderJobs.userDid, domainUsers.userDid))
      .where(
        and(
          eq(domainUsers.domainId, domainId),
          eq(renderJobs.status, 'rendering')
        )
      );

    const [completedTodayResult] = await db
      .select({ count: count() })
      .from(renderJobs)
      .innerJoin(domainUsers, eq(renderJobs.userDid, domainUsers.userDid))
      .where(
        and(
          eq(domainUsers.domainId, domainId),
          eq(renderJobs.status, 'completed'),
          gte(renderJobs.renderCompletedAt, dayAgo)
        )
      );

    const [failedTodayResult] = await db
      .select({ count: count() })
      .from(renderJobs)
      .innerJoin(domainUsers, eq(renderJobs.userDid, domainUsers.userDid))
      .where(
        and(
          eq(domainUsers.domainId, domainId),
          eq(renderJobs.status, 'failed'),
          gte(renderJobs.updatedAt, dayAgo)
        )
      );

    // Get average processing time for completed jobs today
    const [avgTimeResult] = await db
      .select({ avg: sql`AVG(${renderJobs.actualDurationSeconds})` })
      .from(renderJobs)
      .innerJoin(domainUsers, eq(renderJobs.userDid, domainUsers.userDid))
      .where(
        and(
          eq(domainUsers.domainId, domainId),
          eq(renderJobs.status, 'completed'),
          gte(renderJobs.renderCompletedAt, dayAgo)
        )
      );

    // Get recent jobs
    const recentJobs = await db
      .select({
        id: renderJobs.id,
        type: renderJobs.format,
        status: renderJobs.status,
        progress: renderJobs.progress,
        createdAt: renderJobs.createdAt,
        workerId: renderJobs.workerId,
      })
      .from(renderJobs)
      .innerJoin(domainUsers, eq(renderJobs.userDid, domainUsers.userDid))
      .where(eq(domainUsers.domainId, domainId))
      .orderBy(desc(renderJobs.createdAt))
      .limit(50);

    // Get worker stats (global, but included for context)
    const [totalWorkersResult] = await db
      .select({ count: count() })
      .from(renderWorkers);

    const [activeWorkersResult] = await db
      .select({ count: count() })
      .from(renderWorkers)
      .where(eq(renderWorkers.status, 'active'));

    return c.json({
      stats: {
        queuedJobs: Number(queuedResult?.count || 0),
        processingJobs: Number(processingResult?.count || 0),
        completedToday: Number(completedTodayResult?.count || 0),
        failedToday: Number(failedTodayResult?.count || 0),
        avgProcessingTime: Number(avgTimeResult?.avg || 0),
        workers: Number(activeWorkersResult?.count || 0),
        workerCapacity: Number(totalWorkersResult?.count || 0),
      },
      queue: recentJobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress || 0,
        createdAt: job.createdAt.toISOString(),
        workerId: job.workerId,
      })),
      workers: [], // TODO: Add worker details if needed
    });
  }
);

// Create domain
adminRouter.post(
  '/io.exprsn.admin.domains.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      name: string;
      domain: string;
      type: 'hosted' | 'federated';
      handleSuffix?: string;
      pdsEndpoint?: string;
      features?: Record<string, boolean>;
      rateLimits?: Record<string, number>;
      ownerOrgId?: string;
      ownerUserDid?: string;
      // Certificate options
      autoCreateCertificates?: boolean;
      certificateOptions?: {
        organization?: string;
        validityDays?: number;
        additionalSans?: string[];
      };
    }>();

    const { domains, domainActivityLog } = await import('../db/schema.js');

    // Validate required fields
    if (!body.name || !body.domain || !body.type) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    // Check if domain already exists
    const [existing] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.domain, body.domain))
      .limit(1);

    if (existing) {
      return c.json({ error: 'AlreadyExists', message: 'Domain already exists' }, 409);
    }

    const domainId = nanoid();
    const dnsVerificationToken = `exprsn-verify=${nanoid(32)}`;
    let intermediateCertId: string | undefined;
    const certificatesCreated: { type: string; id: string; commonName: string }[] = [];

    // Auto-create certificates if requested (default: true)
    const shouldCreateCerts = body.autoCreateCertificates !== false;

    if (shouldCreateCerts) {
      try {
        const { CertificateManager } = await import('../services/ca/index.js');
        const certManager = new CertificateManager();

        // 1. Ensure Root CA exists
        await certManager.ensureRootCA();

        // 2. Create Intermediate CA for this domain
        const intermediateCA = await certManager.createIntermediateCA({
          commonName: `${body.name} Intermediate CA`,
          organization: body.certificateOptions?.organization || body.name,
          validityDays: body.certificateOptions?.validityDays || 3650, // 10 years
        });
        intermediateCertId = intermediateCA.id;

        // 3. Create Server certificate with SANs
        const serverSans = [
          `DNS:${body.domain}`,
          `DNS:*.${body.domain}`,
          `DNS:pds.${body.domain}`,
          `DNS:api.${body.domain}`,
          `DNS:relay.${body.domain}`,
          ...(body.certificateOptions?.additionalSans?.map(san => `DNS:${san}`) || []),
        ];

        const serverCert = await certManager.issueEntityCertificate({
          commonName: body.domain,
          organization: body.certificateOptions?.organization || body.name,
          type: 'server',
          subjectAltNames: serverSans,
          validityDays: body.certificateOptions?.validityDays || 365,
          intermediateId: intermediateCA.id,
          serviceId: `domain:${domainId}`,
        });

        certificatesCreated.push({
          type: 'server',
          id: serverCert.id,
          commonName: body.domain,
        });

        // 4. Create Code Signing certificate
        const codeSigningCert = await certManager.issueEntityCertificate({
          commonName: `${body.name} Code Signing`,
          organization: body.certificateOptions?.organization || body.name,
          type: 'code_signing',
          validityDays: body.certificateOptions?.validityDays || 365,
          intermediateId: intermediateCA.id,
          serviceId: `domain:${domainId}:code_signing`,
        });

        certificatesCreated.push({
          type: 'code_signing',
          id: codeSigningCert.id,
          commonName: `${body.name} Code Signing`,
        });
      } catch (certError) {
        console.error('Certificate creation error:', certError);
        // Continue with domain creation even if cert creation fails
        // The admin can manually create certificates later
      }
    }

    await db.insert(domains).values({
      id: domainId,
      name: body.name,
      domain: body.domain,
      type: body.type,
      status: 'pending',
      handleSuffix: body.handleSuffix || `.${body.domain}`,
      pdsEndpoint: body.pdsEndpoint,
      dnsVerificationToken,
      features: body.features as any,
      rateLimits: body.rateLimits as any,
      ownerOrgId: body.ownerOrgId,
      ownerUserDid: body.ownerUserDid,
      intermediateCertId,
    });

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId,
      actorDid: adminDid,
      action: 'domain_created',
      metadata: {
        name: body.name,
        domain: body.domain,
        type: body.type,
        certificatesCreated: certificatesCreated.length,
      },
    });

    return c.json({
      domain: {
        id: domainId,
        name: body.name,
        domain: body.domain,
        type: body.type,
        status: 'pending',
        dnsVerificationToken,
        intermediateCertId,
      },
      certificatesCreated,
    });
  }
);

// Update domain
adminRouter.post(
  '/io.exprsn.admin.domains.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      name?: string;
      domain?: string;
      status?: string;
      handleSuffix?: string;
      dnsVerificationToken?: string;
      features?: Record<string, boolean>;
      rateLimits?: Record<string, number>;
      branding?: Record<string, string>;
      pdsEndpoint?: string;
      ownerOrgId?: string;
      ownerUserDid?: string;
      plcConfig?: Record<string, unknown>;
      federationConfig?: Record<string, unknown>;
    }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domains, domainActivityLog } = await import('../db/schema.js');

    const [existing] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.id))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const updates: any = { updatedAt: new Date() };
    if (body.name) updates.name = body.name;
    if (body.domain) updates.domain = body.domain;
    if (body.status) updates.status = body.status;
    if (body.handleSuffix !== undefined) updates.handleSuffix = body.handleSuffix;
    if (body.dnsVerificationToken !== undefined) updates.dnsVerificationToken = body.dnsVerificationToken;
    if (body.features) updates.features = body.features;
    if (body.rateLimits) updates.rateLimits = body.rateLimits;
    if (body.branding) updates.branding = body.branding;
    if (body.pdsEndpoint !== undefined) updates.pdsEndpoint = body.pdsEndpoint;
    if (body.ownerOrgId !== undefined) updates.ownerOrgId = body.ownerOrgId;
    if (body.ownerUserDid !== undefined) updates.ownerUserDid = body.ownerUserDid;
    if (body.plcConfig) {
      updates.plcConfig = {
        ...(existing.plcConfig || {}),
        ...body.plcConfig,
      };
    }
    if (body.federationConfig) {
      updates.federationConfig = {
        ...(existing.federationConfig || {}),
        ...body.federationConfig,
      };
    }

    await db.update(domains).set(updates).where(eq(domains.id, body.id));

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.id,
      actorDid: adminDid,
      action: 'domain_updated',
      targetType: 'settings',
      metadata: { updates: Object.keys(updates) },
    });

    return c.json({ success: true });
  }
);

// Delete domain
adminRouter.post(
  '/io.exprsn.admin.domains.delete',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_DELETE),
  async (c) => {
    const body = await c.req.json<{ id: string }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domains } = await import('../db/schema.js');

    const [existing] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.id))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    await db.delete(domains).where(eq(domains.id, body.id));

    return c.json({ success: true });
  }
);

// Verify domain (DNS verification)
adminRouter.post(
  '/io.exprsn.admin.domains.verify',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ id: string; force?: boolean }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domains, domainActivityLog } = await import('../db/schema.js');

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.id))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Perform actual DNS verification
    const dnsResults = await dnsValidationService.verifyDomainDns(body.id);

    // Check if TXT verification record is valid
    const txtRecord = dnsResults.find(r => r.recordType === 'TXT' && r.expectedValue);
    const txtVerified = txtRecord?.status === 'valid';

    // Check if basic DNS records exist (A or CNAME)
    const hasValidDns = dnsResults.some(r =>
      (r.recordType === 'A' || r.recordType === 'CNAME') && r.status === 'valid'
    );

    // Domain is verified if TXT record matches OR force flag is set (for testing)
    const isVerified = txtVerified || body.force === true;

    if (!isVerified) {
      return c.json({
        success: false,
        verified: false,
        error: 'DNS verification failed',
        message: txtRecord?.errorMessage || 'TXT verification record not found',
        dnsResults: dnsResults.map(r => ({
          recordType: r.recordType,
          name: r.name,
          status: r.status,
          expectedValue: r.expectedValue,
          actualValue: r.actualValue,
          errorMessage: r.errorMessage,
        })),
      }, 400);
    }

    // Mark domain as verified
    await db.update(domains).set({
      status: hasValidDns ? 'active' : 'pending_dns',
      dnsVerifiedAt: new Date(),
      verifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(domains.id, body.id));

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.id,
      actorDid: adminDid,
      action: 'domain_verified',
      metadata: {
        domain: domain.domain,
        dnsResults: dnsResults.map(r => ({ type: r.recordType, status: r.status })),
      },
    });

    return c.json({
      success: true,
      verified: true,
      dnsResults: dnsResults.map(r => ({
        recordType: r.recordType,
        name: r.name,
        status: r.status,
        actualValue: r.actualValue,
      })),
    });
  }
);

// DNS Status - Check DNS configuration for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.dnsStatus',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, id))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    try {
      // Run DNS validation
      const dnsResults = await dnsValidationService.verifyDomainDns(id);

      // Get saved DNS records from database
      const savedRecords = await db
        .select()
        .from(domainDnsRecords)
        .where(eq(domainDnsRecords.domainId, id))
        .orderBy(domainDnsRecords.recordType, domainDnsRecords.name);

      // Get DNS status summary
      const [summary] = await db
        .select()
        .from(domainHealthSummaries)
        .where(eq(domainHealthSummaries.domainId, id))
        .limit(1);

      return c.json({
        domain: {
          id: domain.id,
          name: domain.name,
          domain: domain.domain,
        },
        dnsStatus: summary?.dnsStatus ?? 'unknown',
        lastChecked: summary?.lastDnsCheck,
        records: savedRecords.map((record) => ({
          recordType: record.recordType,
          name: record.name,
          expectedValue: record.expectedValue,
          actualValue: record.actualValue,
          status: record.status,
          errorMessage: record.errorMessage,
          lastChecked: record.lastChecked,
          validatedAt: record.validatedAt,
        })),
        summary: {
          total: savedRecords.length,
          valid: savedRecords.filter((r) => r.status === 'valid').length,
          invalid: savedRecords.filter((r) => r.status === 'invalid').length,
          missing: savedRecords.filter((r) => r.status === 'missing').length,
          error: savedRecords.filter((r) => r.status === 'error').length,
        },
      });
    } catch (error) {
      console.error('DNS status check failed:', error);
      return c.json(
        {
          error: 'InternalError',
          message: error instanceof Error ? error.message : 'DNS check failed',
        },
        500
      );
    }
  }
);

// Health Check - Run health check on domain services
adminRouter.post(
  '/io.exprsn.admin.domains.healthCheck',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const body = await c.req.json<{ id: string }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.id))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    try {
      // Run health checks
      const healthResults = await domainHealthService.checkDomainHealth(body.id);

      // Get updated health summary
      const [summary] = await db
        .select()
        .from(domainHealthSummaries)
        .where(eq(domainHealthSummaries.domainId, body.id))
        .limit(1);

      return c.json({
        domain: {
          id: domain.id,
          name: domain.name,
          domain: domain.domain,
        },
        overallStatus: summary?.overallStatus ?? 'unknown',
        lastChecked: summary?.lastHealthCheck,
        checks: healthResults.map((result) => ({
          checkType: result.checkType,
          status: result.status,
          responseTime: result.responseTime,
          statusCode: result.statusCode,
          errorMessage: result.errorMessage,
          details: result.details,
        })),
        summary: {
          pdsStatus: summary?.pdsStatus ?? 'unknown',
          apiStatus: summary?.apiStatus ?? 'unknown',
          certificateStatus: summary?.certificateStatus ?? 'unknown',
          federationStatus: summary?.federationStatus ?? 'unknown',
          uptimePercentage: summary?.uptimePercentage ?? 100,
          incidentCount24h: summary?.incidentCount24h ?? 0,
          avgResponseTime: summary?.avgResponseTime,
        },
      });
    } catch (error) {
      console.error('Health check failed:', error);
      return c.json(
        {
          error: 'InternalError',
          message: error instanceof Error ? error.message : 'Health check failed',
        },
        500
      );
    }
  }
);

// Health History - Get health check history
adminRouter.get(
  '/io.exprsn.admin.domains.healthHistory',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const id = c.req.query('id');
    const checkType = c.req.query('checkType') as 'pds' | 'api' | 'certificate' | 'federation' | undefined;
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const limit = parseInt(c.req.query('limit') ?? '100', 10);

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, id))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    try {
      const history = await domainHealthService.getHealthHistory(id, {
        checkType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit,
      });

      // Group by check type for easier visualization
      const groupedByType: Record<string, typeof history> = {};
      for (const check of history) {
        if (!groupedByType[check.checkType]) {
          groupedByType[check.checkType] = [];
        }
        groupedByType[check.checkType]!.push(check);
      }

      // Calculate uptime stats per type
      const stats: Record<string, { total: number; healthy: number; uptime: number }> = {};
      for (const [type, checks] of Object.entries(groupedByType)) {
        const total = checks.length;
        const healthy = checks.filter((c) => c.status === 'healthy').length;
        stats[type] = {
          total,
          healthy,
          uptime: total > 0 ? Math.round((healthy / total) * 100) : 100,
        };
      }

      return c.json({
        domain: {
          id: domain.id,
          name: domain.name,
          domain: domain.domain,
        },
        history: history.map((check) => ({
          id: check.id,
          checkType: check.checkType,
          status: check.status,
          responseTime: check.responseTime,
          statusCode: check.statusCode,
          errorMessage: check.errorMessage,
          details: check.details,
          checkedAt: check.checkedAt,
        })),
        stats,
        total: history.length,
      });
    } catch (error) {
      console.error('Failed to get health history:', error);
      return c.json(
        {
          error: 'InternalError',
          message: error instanceof Error ? error.message : 'Failed to get health history',
        },
        500
      );
    }
  }
);

async function syncDomainUserRoleAssignments(
  domainId: string,
  domainUserId: string,
  userDid: string,
  assignedBy: string | undefined,
  roleIds?: string[],
  legacyRole?: string
) {
  const { domainRoles, domainUserRoles, domainUsers } = await import('../db/schema.js');

  const roles = await ensureSystemDomainRoles(domainId);
  const roleSet = new Set(roles.map((role) => role.id));
  let nextRoleIds = (roleIds || []).filter((roleId) => roleSet.has(roleId));

  if (nextRoleIds.length === 0 && legacyRole) {
    const matchingRole = roles.find((role) => role.name === legacyRole);
    if (matchingRole) {
      nextRoleIds = [matchingRole.id];
    }
  }

  await db.delete(domainUserRoles).where(eq(domainUserRoles.domainUserId, domainUserId));

  if (nextRoleIds.length > 0) {
    await db.insert(domainUserRoles).values(
      nextRoleIds.map((roleId) => ({
        id: nanoid(),
        domainUserId,
        roleId,
        assignedBy,
        createdAt: new Date(),
      }))
    );
  }

  const access = await getEffectiveDomainAccess(domainId, userDid);
  await db
    .update(domainUsers)
    .set({
      role: getLegacyDomainRole(access),
      updatedAt: new Date(),
    })
    .where(eq(domainUsers.id, domainUserId));
}

async function syncDomainGroupRoleAssignments(
  domainId: string,
  groupId: string,
  assignedBy: string | undefined,
  roleIds?: string[]
) {
  const { domainRoles, domainGroupRoles } = await import('../db/schema.js');

  if (!roleIds) {
    return;
  }

  const roles = await ensureSystemDomainRoles(domainId);
  const roleSet = new Set(roles.map((role) => role.id));
  const nextRoleIds = roleIds.filter((roleId) => roleSet.has(roleId));

  await db.delete(domainGroupRoles).where(eq(domainGroupRoles.groupId, groupId));

  if (nextRoleIds.length > 0) {
    await db.insert(domainGroupRoles).values(
      nextRoleIds.map((roleId) => ({
        id: nanoid(),
        groupId,
        roleId,
        assignedBy,
        createdAt: new Date(),
      }))
    );
  }
}

async function serializeDomainUser(
  domainId: string,
  base: {
    id: string;
    userDid: string;
    role: string;
    permissions: string[] | null;
    handle: string | null;
    isActive: boolean;
    createdAt: Date;
    user: {
      did?: string | null;
      handle: string | null;
      displayName?: string | null;
      avatar?: string | null;
    } | null;
  }
) {
  const access = await getEffectiveDomainAccess(domainId, base.userDid);

  return {
    id: base.id,
    userDid: base.userDid,
    role: getLegacyDomainRole(access),
    permissions: access?.effectivePermissions || [],
    directPermissions: access?.directPermissions || ((base.permissions || []) as string[]),
    assignedRoles: access?.assignedRoles || [],
    groups: access?.groups || [],
    effectivePermissions: access?.effectivePermissions || [],
    handle: base.handle || undefined,
    isActive: base.isActive,
    source: access?.source || 'domain',
    createdAt: base.createdAt.toISOString(),
    user: {
      did: base.user?.did || base.userDid,
      handle: base.user?.handle || '',
      displayName: base.user?.displayName || undefined,
      avatar: base.user?.avatar || undefined,
    },
  };
}

async function serializeInheritedAdmin(
  domainId: string,
  inheritedAdmin: Awaited<ReturnType<typeof listInheritedGlobalAdmins>>[number]
) {
  const access = await getEffectiveDomainAccess(domainId, inheritedAdmin.admin.userDid);

  return {
    id: `global:${inheritedAdmin.admin.id}`,
    userDid: inheritedAdmin.admin.userDid,
    role: 'admin',
    permissions: access?.effectivePermissions || [],
    directPermissions: access?.directPermissions || [],
    assignedRoles: access?.assignedRoles || [],
    groups: access?.groups || [],
    effectivePermissions: access?.effectivePermissions || [],
    handle: undefined,
    isActive: true,
    source: 'global_inherited' as const,
    createdAt: inheritedAdmin.admin.createdAt.toISOString(),
    user: {
      did: inheritedAdmin.user?.did || inheritedAdmin.admin.userDid,
      handle: inheritedAdmin.user?.handle || '',
      displayName: inheritedAdmin.user?.displayName || undefined,
      avatar: inheritedAdmin.user?.avatar || undefined,
    },
  };
}

async function serializeDomainGroup(
  domainId: string,
  group: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[] | null;
    memberCount: number;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }
) {
  const { domainGroupRoles, domainRoles } = await import('../db/schema.js');

  const assignedRoles = await db
    .select({ role: domainRoles })
    .from(domainGroupRoles)
    .innerJoin(domainRoles, eq(domainRoles.id, domainGroupRoles.roleId))
    .where(eq(domainGroupRoles.groupId, group.id));

  return {
    id: group.id,
    name: group.name,
    description: group.description || undefined,
    permissions: (group.permissions || []) as string[],
    directPermissions: (group.permissions || []) as string[],
    assignedRoles: assignedRoles.map(({ role }) => ({
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description || undefined,
      isSystem: role.isSystem,
      priority: role.priority,
      permissions: (role.permissions || []) as string[],
    })),
    memberCount: group.memberCount,
    isDefault: group.isDefault,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

async function refreshDomainGroupMemberCounts(groupIds: string[]) {
  if (groupIds.length === 0) {
    return;
  }

  const { domainGroupMembers, domainGroups } = await import('../db/schema.js');
  const uniqueGroupIds = [...new Set(groupIds)];

  for (const groupId of uniqueGroupIds) {
    const [memberCountResult] = await db
      .select({ count: count() })
      .from(domainGroupMembers)
      .where(eq(domainGroupMembers.groupId, groupId));

    await db
      .update(domainGroups)
      .set({
        memberCount: memberCountResult?.count || 0,
        updatedAt: new Date(),
      })
      .where(eq(domainGroups.id, groupId));
  }
}

const DEFAULT_DOMAIN_SSO_POLICIES = {
  sessionTimeout: 24,
  sessionTimeoutUnit: 'hours',
  idleTimeout: 30,
  idleTimeoutUnit: 'minutes',
  maxConcurrentSessions: 0,
  singleSessionEnforcement: false,
  mfaRequired: false,
  mfaGracePeriod: 7,
  mfaMethods: ['totp'],
  deviceTrustEnabled: false,
  allowUnknownDevices: true,
  requireDeviceApproval: false,
  ipRestrictionEnabled: false,
  allowedIPs: [],
  blockedIPs: [],
  riskBasedAuthEnabled: false,
  highRiskActions: ['password_reset', 'admin_action'],
  ssoEnforced: false,
  passwordLoginAllowed: true,
  passwordLoginAdminsOnly: false,
};

function getDomainSsoFeatureState(features: unknown) {
  const featureMap = ((features || {}) as unknown) as Record<string, unknown>;
  const sso = ((featureMap as any).sso || {}) as Record<string, unknown>;

  return {
    emailDomains: (sso.emailDomains || {}) as Record<string, Record<string, unknown>>,
    policies: {
      ...DEFAULT_DOMAIN_SSO_POLICIES,
      ...(((sso.policies || {}) as Record<string, unknown>) || {}),
    },
  };
}

function mergeDomainSsoFeatureState(
  features: unknown,
  updates: {
    emailDomains?: Record<string, Record<string, unknown>>;
    policies?: Record<string, unknown>;
  }
) {
  const featureMap = { ...(((features || {}) as unknown) as Record<string, unknown>) };
  const existingSso = ((featureMap as any).sso || {}) as Record<string, unknown>;

  return {
    ...featureMap,
    sso: {
      ...existingSso,
      ...(updates.emailDomains ? { emailDomains: updates.emailDomains } : {}),
      ...(updates.policies ? { policies: updates.policies } : {}),
    },
  };
}

function slugifyProviderKey(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'provider'
  );
}

// Domain permission catalog
adminRouter.get(
  '/io.exprsn.admin.domains.permissions.catalog',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    return c.json({ permissions: getDomainPermissionCatalog() });
  }
);

// List domain users
adminRouter.get(
  '/io.exprsn.admin.domains.users.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const role = c.req.query('role');
    const includeInherited = c.req.query('includeInherited') === 'true';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainUsers } = await import('../db/schema.js');

    const conditions = [eq(domainUsers.domainId, domainId)];

    const userList = await db
      .select({
        id: domainUsers.id,
        userDid: domainUsers.userDid,
        role: domainUsers.role,
        permissions: domainUsers.permissions,
        handle: domainUsers.handle,
        isActive: domainUsers.isActive,
        createdAt: domainUsers.createdAt,
        user: {
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(domainUsers)
      .leftJoin(users, eq(users.did, domainUsers.userDid))
      .where(and(...conditions))
      .orderBy(desc(domainUsers.createdAt))
      .limit(limit);

    const serializedUsers = await Promise.all(
      userList.map((user) => serializeDomainUser(domainId, user))
    );

    let inheritedAdmins: Awaited<ReturnType<typeof serializeInheritedAdmin>>[] = [];
    if (includeInherited) {
      const inheritedAdminRows = await listInheritedGlobalAdmins(domainId);
      inheritedAdmins = await Promise.all(
        inheritedAdminRows.map((admin) => serializeInheritedAdmin(domainId, admin))
      );
    }

    const combinedUsers = [...serializedUsers, ...inheritedAdmins]
      .filter((user) => !role || user.role === role)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);

    return c.json({
      users: combinedUsers,
    });
  }
);

// Add user to domain
adminRouter.post(
  '/io.exprsn.admin.domains.users.add',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      userDid?: string;
      userHandle?: string;
      role: 'admin' | 'moderator' | 'member';
      permissions?: string[];
      directPermissions?: string[];
      roleIds?: string[];
      groupIds?: string[];
    }>();

    if (!body.domainId || (!body.userDid && !body.userHandle) || !body.role) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domains, domainUsers, domainActivityLog, domainGroupMembers, domainGroups } = await import('../db/schema.js');

    let userDid = body.userDid;
    if (!userDid && body.userHandle) {
      const [user] = await db
        .select({ did: users.did })
        .from(users)
        .where(eq(users.handle, body.userHandle))
        .limit(1);
      if (!user) {
        return c.json({ error: 'NotFound', message: 'User not found' }, 404);
      }
      userDid = user.did;
    }

    // Check domain exists
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check if user already assigned
    const [existing] = await db
      .select({ id: domainUsers.id })
      .from(domainUsers)
      .where(and(
        eq(domainUsers.domainId, body.domainId),
        eq(domainUsers.userDid, userDid!)
      ))
      .limit(1);

    if (existing) {
      return c.json({ error: 'AlreadyExists', message: 'User already assigned to domain' }, 409);
    }

    const userId = nanoid();
    await db.insert(domainUsers).values({
      id: userId,
      domainId: body.domainId,
      userDid: userDid!,
      role: body.role,
      permissions: body.directPermissions || body.permissions || [],
    });

    const adminDid = c.get('did');
    await syncDomainUserRoleAssignments(
      body.domainId,
      userId,
      userDid!,
      adminDid,
      body.roleIds,
      body.role
    );

    if (body.groupIds && body.groupIds.length > 0) {
      const allowedGroups = await db
        .select({ id: domainGroups.id })
        .from(domainGroups)
        .where(and(eq(domainGroups.domainId, body.domainId), inArray(domainGroups.id, body.groupIds)));

      if (allowedGroups.length > 0) {
        await db.insert(domainGroupMembers).values(
          allowedGroups.map((group) => ({
            id: nanoid(),
            groupId: group.id,
            userDid: userDid!,
            addedBy: adminDid,
            createdAt: new Date(),
          }))
        ).onConflictDoNothing();
        await refreshDomainGroupMemberCounts(allowedGroups.map((group) => group.id));
      }
    }

    // Update domain user count
    await db.update(domains).set({
      userCount: sql`${domains.userCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(domains.id, body.domainId));

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'user_added',
      targetType: 'user',
      targetId: userDid!,
      metadata: { role: body.role, roleIds: body.roleIds || [], groupIds: body.groupIds || [] },
    });

    return c.json({ success: true, id: userId });
  }
);

// Remove user from domain
adminRouter.post(
  '/io.exprsn.admin.domains.users.remove',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; userDid: string }>();

    if (!body.domainId || !body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domains, domainUsers, domainActivityLog, domainGroupMembers, domainGroups } = await import('../db/schema.js');

    const groupMemberships = await db
      .select({
        membershipId: domainGroupMembers.id,
        groupId: domainGroups.id,
      })
      .from(domainGroupMembers)
      .innerJoin(domainGroups, eq(domainGroups.id, domainGroupMembers.groupId))
      .where(and(eq(domainGroups.domainId, body.domainId), eq(domainGroupMembers.userDid, body.userDid)));

    await db.delete(domainUsers).where(
      and(
        eq(domainUsers.domainId, body.domainId),
        eq(domainUsers.userDid, body.userDid)
      )
    );

    if (groupMemberships.length > 0) {
      await db.delete(domainGroupMembers).where(
        inArray(
          domainGroupMembers.id,
          groupMemberships.map((membership) => membership.membershipId)
        )
      );

      await refreshDomainGroupMemberCounts(groupMemberships.map((membership) => membership.groupId));
    }

    // Update domain user count
    await db.update(domains).set({
      userCount: sql`GREATEST(${domains.userCount} - 1, 0)`,
      updatedAt: new Date(),
    }).where(eq(domains.id, body.domainId));

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'user_removed',
      targetType: 'user',
      targetId: body.userDid,
    });

    return c.json({ success: true });
  }
);

// Update user role in domain
adminRouter.post(
  '/io.exprsn.admin.domains.users.updateRole',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      userDid: string;
      role: 'admin' | 'moderator' | 'member';
      permissions?: string[];
      directPermissions?: string[];
      roleIds?: string[];
      groupIds?: string[];
    }>();

    if (!body.domainId || !body.userDid || !body.role) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainUsers, domainActivityLog, domainGroupMembers, domainGroups } = await import('../db/schema.js');

    const [existingUser] = await db
      .select({ id: domainUsers.id })
      .from(domainUsers)
      .where(
        and(
          eq(domainUsers.domainId, body.domainId),
          eq(domainUsers.userDid, body.userDid)
        )
      )
      .limit(1);

    if (!existingUser) {
      return c.json({ error: 'NotFound', message: 'User not assigned to domain' }, 404);
    }

    await db.update(domainUsers).set({
      role: body.role,
      permissions: body.directPermissions || body.permissions || [],
      updatedAt: new Date(),
    }).where(
      and(
        eq(domainUsers.domainId, body.domainId),
        eq(domainUsers.userDid, body.userDid)
      )
    );

    const adminDid = c.get('did');
    await syncDomainUserRoleAssignments(
      body.domainId,
      existingUser.id,
      body.userDid,
      adminDid,
      body.roleIds,
      body.role
    );

    if (body.groupIds) {
      const existingMemberships = await db
        .select({
          membershipId: domainGroupMembers.id,
          groupId: domainGroups.id,
        })
        .from(domainGroupMembers)
        .innerJoin(domainGroups, eq(domainGroups.id, domainGroupMembers.groupId))
        .where(and(eq(domainGroups.domainId, body.domainId), eq(domainGroupMembers.userDid, body.userDid)));

      const affectedGroupIds = new Set(existingMemberships.map((membership) => membership.groupId));

      if (existingMemberships.length > 0) {
        await db.delete(domainGroupMembers).where(
          inArray(
            domainGroupMembers.id,
            existingMemberships.map((membership) => membership.membershipId)
          )
        );
      }

      if (body.groupIds.length > 0) {
        const allowedGroups = await db
          .select({ id: domainGroups.id })
          .from(domainGroups)
          .where(and(eq(domainGroups.domainId, body.domainId), inArray(domainGroups.id, body.groupIds)));

        if (allowedGroups.length > 0) {
          for (const group of allowedGroups) {
            affectedGroupIds.add(group.id);
          }
          await db.insert(domainGroupMembers).values(
            allowedGroups.map((group) => ({
              id: nanoid(),
              groupId: group.id,
              userDid: body.userDid,
              addedBy: adminDid,
              createdAt: new Date(),
            }))
          ).onConflictDoNothing();
        }
      }

      await refreshDomainGroupMemberCounts([...affectedGroupIds]);
    }

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'user_role_updated',
      targetType: 'user',
      targetId: body.userDid,
      metadata: { role: body.role, roleIds: body.roleIds || [], groupIds: body.groupIds },
    });

    return c.json({ success: true });
  }
);

// List domain groups
adminRouter.get(
  '/io.exprsn.admin.domains.groups.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainGroups } = await import('../db/schema.js');

    const groups = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.domainId, domainId))
      .orderBy(desc(domainGroups.createdAt));

    return c.json({
      groups: await Promise.all(groups.map((group) => serializeDomainGroup(domainId, group))),
    });
  }
);

// Create domain group
adminRouter.post(
  '/io.exprsn.admin.domains.groups.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      name: string;
      description?: string;
      permissions?: string[];
      directPermissions?: string[];
      isDefault?: boolean;
      roleIds?: string[];
    }>();

    if (!body.domainId || !body.name) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domains, domainGroups, domainActivityLog } = await import('../db/schema.js');

    const groupId = nanoid();
    await db.insert(domainGroups).values({
      id: groupId,
      domainId: body.domainId,
      name: body.name,
      description: body.description,
      permissions: body.directPermissions || body.permissions || [],
      isDefault: body.isDefault || false,
    });

    const adminDid = c.get('did');
    await syncDomainGroupRoleAssignments(body.domainId, groupId, adminDid, body.roleIds);

    // Update domain group count
    await db.update(domains).set({
      groupCount: sql`${domains.groupCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(domains.id, body.domainId));

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'group_created',
      targetType: 'group',
      targetId: groupId,
      metadata: { name: body.name, roleIds: body.roleIds || [] },
    });

    return c.json({ success: true, id: groupId });
  }
);

// Update domain group
adminRouter.post(
  '/io.exprsn.admin.domains.groups.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      groupId: string;
      domainId?: string;
      name?: string;
      description?: string;
      permissions?: string[];
      directPermissions?: string[];
      isDefault?: boolean;
      roleIds?: string[];
    }>();

    if (!body.groupId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing groupId' }, 400);
    }

    const { domainGroups } = await import('../db/schema.js');

    const [existingGroup] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!existingGroup) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    const updates: any = { updatedAt: new Date() };
    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.permissions || body.directPermissions) updates.permissions = body.directPermissions || body.permissions;
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

    await db.update(domainGroups).set(updates).where(eq(domainGroups.id, body.groupId));
    await syncDomainGroupRoleAssignments(
      existingGroup.domainId,
      body.groupId,
      c.get('did'),
      body.roleIds
    );

    return c.json({ success: true });
  }
);

// Delete domain group
adminRouter.post(
  '/io.exprsn.admin.domains.groups.delete',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ groupId: string; domainId: string }>();

    if (!body.groupId || !body.domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domains, domainGroups, domainActivityLog } = await import('../db/schema.js');

    await db.delete(domainGroups).where(eq(domainGroups.id, body.groupId));

    // Update domain group count
    await db.update(domains).set({
      groupCount: sql`GREATEST(${domains.groupCount} - 1, 0)`,
      updatedAt: new Date(),
    }).where(eq(domains.id, body.domainId));

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'group_deleted',
      targetType: 'group',
      targetId: body.groupId,
    });

    return c.json({ success: true });
  }
);

// List domain group members
adminRouter.get(
  '/io.exprsn.admin.domains.groups.members.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const groupId = c.req.query('groupId');

    if (!groupId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing groupId' }, 400);
    }

    const { domainGroups, domainGroupMembers } = await import('../db/schema.js');

    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    const members = await db
      .select({
        userDid: domainGroupMembers.userDid,
        createdAt: domainGroupMembers.createdAt,
        user: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(domainGroupMembers)
      .leftJoin(users, eq(users.did, domainGroupMembers.userDid))
      .where(eq(domainGroupMembers.groupId, groupId))
      .orderBy(desc(domainGroupMembers.createdAt));

    const serializedMembers = await Promise.all(
      members.map(async (member) => {
        const access = await getEffectiveDomainAccess(group.domainId, member.userDid);
        return {
          userDid: member.userDid,
          createdAt: member.createdAt.toISOString(),
          role: getLegacyDomainRole(access),
          effectivePermissions: access?.effectivePermissions || [],
          user: member.user,
        };
      })
    );

    return c.json({ members: serializedMembers });
  }
);

// Add user to domain group
adminRouter.post(
  '/io.exprsn.admin.domains.groups.members.add',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ groupId: string; userDid: string }>();

    if (!body.groupId || !body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainGroups, domainGroupMembers, domainUsers } = await import('../db/schema.js');

    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    const [domainUser] = await db
      .select({ id: domainUsers.id })
      .from(domainUsers)
      .where(and(eq(domainUsers.domainId, group.domainId), eq(domainUsers.userDid, body.userDid)))
      .limit(1);

    if (!domainUser) {
      return c.json({ error: 'InvalidRequest', message: 'User must belong to the domain before joining a group' }, 400);
    }

    await db.insert(domainGroupMembers).values({
      id: nanoid(),
      groupId: body.groupId,
      userDid: body.userDid,
      addedBy: c.get('did'),
      createdAt: new Date(),
    }).onConflictDoNothing();

    const [memberCountResult] = await db
      .select({ count: count() })
      .from(domainGroupMembers)
      .where(eq(domainGroupMembers.groupId, body.groupId));

    await db
      .update(domainGroups)
      .set({
        memberCount: memberCountResult?.count || 0,
        updatedAt: new Date(),
      })
      .where(eq(domainGroups.id, body.groupId));

    return c.json({ success: true });
  }
);

// Remove user from domain group
adminRouter.post(
  '/io.exprsn.admin.domains.groups.members.remove',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ groupId: string; userDid: string }>();

    if (!body.groupId || !body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainGroups, domainGroupMembers } = await import('../db/schema.js');

    await db
      .delete(domainGroupMembers)
      .where(and(eq(domainGroupMembers.groupId, body.groupId), eq(domainGroupMembers.userDid, body.userDid)));

    const [memberCountResult] = await db
      .select({ count: count() })
      .from(domainGroupMembers)
      .where(eq(domainGroupMembers.groupId, body.groupId));

    await db
      .update(domainGroups)
      .set({
        memberCount: memberCountResult?.count || 0,
        updatedAt: new Date(),
      })
      .where(eq(domainGroups.id, body.groupId));

    return c.json({ success: true });
  }
);

// Bulk replace domain group membership
adminRouter.post(
  '/io.exprsn.admin.domains.groups.members.bulkSet',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ groupId: string; userDids: string[] }>();

    if (!body.groupId || !Array.isArray(body.userDids)) {
      return c.json({ error: 'InvalidRequest', message: 'groupId and userDids are required' }, 400);
    }

    const { domainGroups, domainGroupMembers, domainUsers } = await import('../db/schema.js');

    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    const allowedUsers = body.userDids.length
      ? await db
          .select({ userDid: domainUsers.userDid })
          .from(domainUsers)
          .where(and(eq(domainUsers.domainId, group.domainId), inArray(domainUsers.userDid, body.userDids)))
      : [];

    await db.delete(domainGroupMembers).where(eq(domainGroupMembers.groupId, body.groupId));

    if (allowedUsers.length > 0) {
      await db.insert(domainGroupMembers).values(
        allowedUsers.map((user) => ({
          id: nanoid(),
          groupId: body.groupId,
          userDid: user.userDid,
          addedBy: c.get('did'),
          createdAt: new Date(),
        }))
      );
    }

    await db
      .update(domainGroups)
      .set({
        memberCount: allowedUsers.length,
        updatedAt: new Date(),
      })
      .where(eq(domainGroups.id, body.groupId));

    return c.json({ success: true, memberCount: allowedUsers.length });
  }
);

// Permission catalog for domain roles
adminRouter.get(
  '/io.exprsn.admin.domains.roles.permissions',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    return c.json({ permissions: getDomainPermissionCatalog() });
  }
);

// List domain roles
adminRouter.get(
  '/io.exprsn.admin.domains.roles.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainRoles, domainUserRoles, domainGroupRoles } = await import('../db/schema.js');
    const roles = await ensureSystemDomainRoles(domainId);

    const userAssignments = await db
      .select({
        roleId: domainUserRoles.roleId,
        count: count(),
      })
      .from(domainUserRoles)
      .innerJoin(domainRoles, eq(domainRoles.id, domainUserRoles.roleId))
      .where(eq(domainRoles.domainId, domainId))
      .groupBy(domainUserRoles.roleId);

    const groupAssignments = await db
      .select({
        roleId: domainGroupRoles.roleId,
        count: count(),
      })
      .from(domainGroupRoles)
      .innerJoin(domainRoles, eq(domainRoles.id, domainGroupRoles.roleId))
      .where(eq(domainRoles.domainId, domainId))
      .groupBy(domainGroupRoles.roleId);

    const usageMap = new Map<string, number>();
    for (const assignment of userAssignments) {
      usageMap.set(assignment.roleId, assignment.count);
    }
    for (const assignment of groupAssignments) {
      usageMap.set(assignment.roleId, (usageMap.get(assignment.roleId) || 0) + assignment.count);
    }

    const sortedRoles = [...roles].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

    return c.json({
      roles: sortedRoles.map((role) => ({
        id: role.id,
        name: role.name,
        displayName: role.displayName,
        description: role.description || '',
        isSystem: role.isSystem,
        priority: role.priority,
        permissions: role.permissions || [],
        userCount: usageMap.get(role.id) || 0,
        createdAt: role.createdAt.toISOString(),
      })),
    });
  }
);

// Create domain role
adminRouter.post(
  '/io.exprsn.admin.domains.roles.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      name: string;
      displayName?: string;
      description?: string;
      permissions?: string[];
      priority?: number;
    }>();

    if (!body.domainId || !body.name) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and name are required' }, 400);
    }

    const { domainRoles } = await import('../db/schema.js');
    await ensureSystemDomainRoles(body.domainId);

    const roleId = nanoid();
    await db.insert(domainRoles).values({
      id: roleId,
      domainId: body.domainId,
      name: body.name,
      displayName: body.displayName || body.name,
      description: body.description,
      isSystem: false,
      priority: body.priority ?? 50,
      permissions: body.permissions || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return c.json({ id: roleId });
  }
);

// Update domain role
adminRouter.post(
  '/io.exprsn.admin.domains.roles.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      roleId: string;
      name?: string;
      displayName?: string;
      description?: string;
      permissions?: string[];
      priority?: number;
    }>();

    if (!body.domainId || !body.roleId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and roleId are required' }, 400);
    }

    const { domainRoles } = await import('../db/schema.js');
    const [role] = await db
      .select()
      .from(domainRoles)
      .where(and(eq(domainRoles.id, body.roleId), eq(domainRoles.domainId, body.domainId)))
      .limit(1);

    if (!role) {
      return c.json({ error: 'NotFound', message: 'Role not found' }, 404);
    }

    if (role.isSystem) {
      return c.json({ error: 'Forbidden', message: 'System roles cannot be modified' }, 403);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.description !== undefined) updates.description = body.description;
    if (body.permissions !== undefined) updates.permissions = body.permissions;
    if (body.priority !== undefined) updates.priority = body.priority;

    await db.update(domainRoles).set(updates).where(eq(domainRoles.id, body.roleId));
    return c.json({ success: true });
  }
);

// Delete domain role
adminRouter.post(
  '/io.exprsn.admin.domains.roles.delete',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; roleId: string }>();

    if (!body.domainId || !body.roleId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and roleId are required' }, 400);
    }

    const { domainRoles } = await import('../db/schema.js');
    const [role] = await db
      .select()
      .from(domainRoles)
      .where(and(eq(domainRoles.id, body.roleId), eq(domainRoles.domainId, body.domainId)))
      .limit(1);

    if (!role) {
      return c.json({ error: 'NotFound', message: 'Role not found' }, 404);
    }

    if (role.isSystem) {
      return c.json({ error: 'Forbidden', message: 'System roles cannot be deleted' }, 403);
    }

    await db.delete(domainRoles).where(eq(domainRoles.id, body.roleId));
    return c.json({ success: true });
  }
);

// Assign role to domain user
adminRouter.post(
  '/io.exprsn.admin.domains.roles.assignUser',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; userDid: string; roleIds: string[] }>();

    if (!body.domainId || !body.userDid || !Array.isArray(body.roleIds)) {
      return c.json({ error: 'InvalidRequest', message: 'domainId, userDid, and roleIds are required' }, 400);
    }

    const { domainUsers } = await import('../db/schema.js');
    const [domainUser] = await db
      .select()
      .from(domainUsers)
      .where(and(eq(domainUsers.domainId, body.domainId), eq(domainUsers.userDid, body.userDid)))
      .limit(1);

    if (!domainUser) {
      return c.json({ error: 'NotFound', message: 'Domain user not found' }, 404);
    }

    await syncDomainUserRoleAssignments(
      body.domainId,
      domainUser.id,
      body.userDid,
      c.get('did'),
      body.roleIds
    );

    return c.json({ success: true });
  }
);

// Assign role to domain group
adminRouter.post(
  '/io.exprsn.admin.domains.roles.assignGroup',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; groupId: string; roleIds: string[] }>();

    if (!body.domainId || !body.groupId || !Array.isArray(body.roleIds)) {
      return c.json({ error: 'InvalidRequest', message: 'domainId, groupId, and roleIds are required' }, 400);
    }

    await syncDomainGroupRoleAssignments(body.domainId, body.groupId, c.get('did'), body.roleIds);
    return c.json({ success: true });
  }
);

// Effective access for a user within a domain
adminRouter.get(
  '/io.exprsn.admin.domains.users.access',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const userDid = c.req.query('userDid');

    if (!domainId || !userDid) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and userDid are required' }, 400);
    }

    const access = await getEffectiveDomainAccess(domainId, userDid);
    if (!access) {
      return c.json({ error: 'NotFound', message: 'Access record not found' }, 404);
    }

    return c.json({ access });
  }
);

// Get effective permissions with breakdown for a user in a domain
adminRouter.get(
  '/io.exprsn.admin.domains.users.effectivePermissions',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const userId = c.req.query('userId');

    if (!domainId || !userId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and userId are required' }, 400);
    }

    const { domainUsers, domainUserRoles, domainRoles, domainGroupMembers, domainGroups } = await import('../db/schema.js');

    // Get the domain user
    const [domainUser] = await db
      .select()
      .from(domainUsers)
      .where(and(eq(domainUsers.domainId, domainId), eq(domainUsers.id, userId)))
      .limit(1);

    if (!domainUser) {
      return c.json({ error: 'NotFound', message: 'User not found in domain' }, 404);
    }

    // Get direct permissions
    const directPermissions: string[] = (domainUser.permissions || []) as string[];

    // Get role permissions
    const userRoles = await db
      .select({ role: domainRoles })
      .from(domainUserRoles)
      .innerJoin(domainRoles, eq(domainUserRoles.roleId, domainRoles.id))
      .where(eq(domainUserRoles.domainUserId, domainUser.id));

    const fromRoles = userRoles.map((ur) => ({
      roleId: ur.role.id,
      roleName: ur.role.displayName || ur.role.name,
      permissions: (ur.role.permissions || []) as string[],
    }));

    // Get group permissions
    const userGroups = await db
      .select({ group: domainGroups })
      .from(domainGroupMembers)
      .innerJoin(domainGroups, eq(domainGroupMembers.groupId, domainGroups.id))
      .where(eq(domainGroupMembers.userDid, domainUser.id));

    const fromGroups = userGroups.map((ug) => ({
      groupId: ug.group.id,
      groupName: ug.group.name,
      permissions: (ug.group.permissions || []) as string[],
    }));

    // Compute effective permissions (unique set)
    const allPermissions = new Set<string>([
      ...directPermissions,
      ...fromRoles.flatMap((r) => r.permissions),
      ...fromGroups.flatMap((g) => g.permissions),
    ]);

    return c.json({
      effectivePermissions: Array.from(allPermissions),
      breakdown: {
        direct: directPermissions,
        fromRoles,
        fromGroups,
      },
    });
  }
);

// ============================================
// Domain User Moderation
// ============================================

// Suspend user in a domain
adminRouter.post(
  '/io.exprsn.admin.domain.users.suspend',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      userDid: string;
      reason: string;
      duration?: number; // Duration in hours (optional, if not provided = indefinite)
      note?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.domainId || !body.userDid || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'domainId, userDid and reason are required' },
        400
      );
    }

    // Check if user exists
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    // Verify domain exists and admin has access
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check if user has admin access to this domain
    const access = await getEffectiveDomainAccess(body.domainId, adminUser.userDid);
    if (!access) {
      return c.json({ error: 'Forbidden', message: 'No access to this domain' }, 403);
    }

    // Calculate expiry date if duration provided
    const expiresAt = body.duration
      ? new Date(Date.now() + body.duration * 60 * 60 * 1000)
      : null;

    // Create suspension sanction
    const sanctionId = nanoid();
    await db.insert(userSanctions).values({
      id: sanctionId,
      userDid: body.userDid,
      adminId: adminUser.id,
      sanctionType: 'suspend',
      reason: body.reason,
      expiresAt,
      createdAt: new Date(),
    });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'domain.user.suspend',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        domainId: body.domainId,
        sanctionId,
        reason: body.reason,
        duration: body.duration,
        expiresAt: expiresAt?.toISOString(),
        note: body.note,
      },
      createdAt: new Date(),
    });

    // Broadcast to admins
    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'domain_user_suspend',
      targetType: 'user',
      targetId: user.handle,
    });

    return c.json({
      success: true,
      sanctionId,
      expiresAt: expiresAt?.toISOString(),
    });
  }
);

// Unsuspend user in a domain
adminRouter.post(
  '/io.exprsn.admin.domain.users.unsuspend',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      userDid: string;
      reason?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.domainId || !body.userDid) {
      return c.json(
        { error: 'InvalidRequest', message: 'domainId and userDid are required' },
        400
      );
    }

    // Verify domain exists and admin has access
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check if user has admin access to this domain
    const access = await getEffectiveDomainAccess(body.domainId, adminUser.userDid);
    if (!access) {
      return c.json({ error: 'Forbidden', message: 'No access to this domain' }, 403);
    }

    // Find active suspension
    const [suspension] = await db
      .select()
      .from(userSanctions)
      .where(
        and(
          eq(userSanctions.userDid, body.userDid),
          eq(userSanctions.sanctionType, 'suspend'),
          or(
            isNull(userSanctions.expiresAt),
            gte(userSanctions.expiresAt, new Date())
          )
        )
      )
      .orderBy(desc(userSanctions.createdAt))
      .limit(1);

    if (!suspension) {
      return c.json(
        { error: 'NotFound', message: 'No active suspension found for this user' },
        404
      );
    }

    // Expire the suspension immediately
    await db
      .update(userSanctions)
      .set({ expiresAt: new Date() })
      .where(eq(userSanctions.id, suspension.id));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'domain.user.unsuspend',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        domainId: body.domainId,
        originalSanctionId: suspension.id,
        reason: body.reason || 'Suspension lifted',
      },
      createdAt: new Date(),
    });

    // Get user for notification
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    // Broadcast to admins
    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'domain_user_unsuspend',
      targetType: 'user',
      targetId: user?.handle || body.userDid,
    });

    return c.json({ success: true });
  }
);

// Ban user in a domain
adminRouter.post(
  '/io.exprsn.admin.domain.users.ban',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      userDid: string;
      reason: string;
      note?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.domainId || !body.userDid || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'domainId, userDid and reason are required' },
        400
      );
    }

    // Check if user exists
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    // Verify domain exists and admin has access
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check if user has admin access to this domain
    const access = await getEffectiveDomainAccess(body.domainId, adminUser.userDid);
    if (!access) {
      return c.json({ error: 'Forbidden', message: 'No access to this domain' }, 403);
    }

    // Create permanent ban sanction (no expiry)
    const sanctionId = nanoid();
    await db.insert(userSanctions).values({
      id: sanctionId,
      userDid: body.userDid,
      adminId: adminUser.id,
      sanctionType: 'ban',
      reason: body.reason,
      expiresAt: null, // Permanent ban
      createdAt: new Date(),
    });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'domain.user.ban',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        domainId: body.domainId,
        sanctionId,
        reason: body.reason,
        note: body.note,
        permanent: true,
      },
      createdAt: new Date(),
    });

    // Broadcast to admins
    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'domain_user_ban',
      targetType: 'user',
      targetId: user.handle,
    });

    return c.json({
      success: true,
      sanctionId,
    });
  }
);

// Unban user in a domain
adminRouter.post(
  '/io.exprsn.admin.domain.users.unban',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      userDid: string;
      reason?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.domainId || !body.userDid) {
      return c.json(
        { error: 'InvalidRequest', message: 'domainId and userDid are required' },
        400
      );
    }

    // Verify domain exists and admin has access
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check if user has admin access to this domain
    const access = await getEffectiveDomainAccess(body.domainId, adminUser.userDid);
    if (!access) {
      return c.json({ error: 'Forbidden', message: 'No access to this domain' }, 403);
    }

    // Find active ban
    const [ban] = await db
      .select()
      .from(userSanctions)
      .where(
        and(
          eq(userSanctions.userDid, body.userDid),
          eq(userSanctions.sanctionType, 'ban'),
          or(
            isNull(userSanctions.expiresAt),
            gte(userSanctions.expiresAt, new Date())
          )
        )
      )
      .orderBy(desc(userSanctions.createdAt))
      .limit(1);

    if (!ban) {
      return c.json(
        { error: 'NotFound', message: 'No active ban found for this user' },
        404
      );
    }

    // Expire the ban immediately
    await db
      .update(userSanctions)
      .set({ expiresAt: new Date() })
      .where(eq(userSanctions.id, ban.id));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'domain.user.unban',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        domainId: body.domainId,
        originalSanctionId: ban.id,
        reason: body.reason || 'Ban lifted',
      },
      createdAt: new Date(),
    });

    // Get user for notification
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    // Broadcast to admins
    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'domain_user_unban',
      targetType: 'user',
      targetId: user?.handle || body.userDid,
    });

    return c.json({ success: true });
  }
);

// List organizations for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.organizations.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const search = c.req.query('search');
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '25', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const conditions = [eq(organizations.domainId, domainId)];
    if (search) {
      conditions.push(
        or(
          ilike(organizations.name, `%${search}%`),
          ilike(organizations.handle, `%${search}%`),
          ilike(organizations.description, `%${search}%`)
        )!
      );
    }
    if (status) {
      const statuses = status.split(',').filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(organizations.status, statuses[0]!));
      } else if (statuses.length > 1) {
        conditions.push(inArray(organizations.status, statuses));
      }
    }

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(organizations)
        .where(and(...conditions))
        .orderBy(desc(organizations.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(organizations)
        .where(and(...conditions)),
    ]);

    return c.json({
      organizations: rows.map((organization) => ({
        id: organization.id,
        name: organization.name,
        handle: organization.handle || '',
        description: organization.description || undefined,
        memberCount: organization.memberCount,
        verified: organization.verified,
        status: organization.status,
        avatar: organization.avatar || undefined,
        createdAt: organization.createdAt.toISOString(),
      })),
      total: totalRows[0]?.total || 0,
    });
  }
);

// Domain SSO config summary
adminRouter.get(
  '/io.exprsn.admin.domains.sso.config.get',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainSsoConfig, externalIdentities, externalIdentityProviders, ssoAuditLog } = await import('../db/schema.js');
    const [config] = await db
      .select()
      .from(domainSsoConfig)
      .where(eq(domainSsoConfig.domainId, domainId))
      .limit(1);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [loginCount, linkedUsers] = await Promise.all([
      db
        .select({ count: count() })
        .from(ssoAuditLog)
        .where(and(eq(ssoAuditLog.domainId, domainId), gte(ssoAuditLog.createdAt, since), eq(ssoAuditLog.success, true))),
      db
        .select({ count: count() })
        .from(externalIdentities)
        .innerJoin(externalIdentityProviders, eq(externalIdentityProviders.id, externalIdentities.providerId))
        .where(eq(externalIdentityProviders.domainId, domainId)),
    ]);

    return c.json({
      config: {
        enabled: config ? config.ssoMode !== 'disabled' : false,
        enforced: config?.ssoMode === 'required',
        jitProvisioning: config?.jitProvisioning ?? true,
        ssoMode: config?.ssoMode || 'disabled',
        primaryIdpId: config?.primaryIdpId || undefined,
        allowedIdpIds: (config?.allowedIdpIds || []) as string[],
        allowedEmailDomains: (config?.allowedEmailDomains || []) as string[],
      },
      stats: {
        logins24h: loginCount[0]?.count || 0,
        linkedUsers: linkedUsers[0]?.count || 0,
      },
    });
  }
);

// Domain SSO config update
adminRouter.post(
  '/io.exprsn.admin.domains.sso.config.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      enabled?: boolean;
      enforced?: boolean;
      jitProvisioning?: boolean;
    }>();

    if (!body.domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainSsoConfig } = await import('../db/schema.js');
    const [existing] = await db
      .select()
      .from(domainSsoConfig)
      .where(eq(domainSsoConfig.domainId, body.domainId))
      .limit(1);

    const ssoMode =
      body.enabled === false
        ? 'disabled'
        : body.enforced
          ? 'required'
          : existing?.ssoMode === 'required' && body.enforced === false
            ? 'optional'
            : existing?.ssoMode === 'disabled'
              ? 'optional'
              : existing?.ssoMode || 'optional';

    if (existing) {
      await db
        .update(domainSsoConfig)
        .set({
          ssoMode,
          jitProvisioning: body.jitProvisioning ?? existing.jitProvisioning,
          updatedAt: new Date(),
          updatedBy: c.get('did'),
        })
        .where(eq(domainSsoConfig.domainId, body.domainId));
    } else {
      await db.insert(domainSsoConfig).values({
        id: nanoid(),
        domainId: body.domainId,
        ssoMode,
        jitProvisioning: body.jitProvisioning ?? true,
        defaultRole: 'member',
        emailDomainVerification: true,
        allowedIdpIds: [],
        allowedEmailDomains: [],
        forceReauthAfterHours: 24,
        updatedBy: c.get('did'),
      });
    }

    return c.json({ success: true });
  }
);

// List external SSO providers for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.sso.providers.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainSsoConfig, externalIdentityProviders, externalIdentities } = await import('../db/schema.js');
    const [config, providers, assignmentCounts] = await Promise.all([
      db
        .select()
        .from(domainSsoConfig)
        .where(eq(domainSsoConfig.domainId, domainId))
        .limit(1),
      db
        .select()
        .from(externalIdentityProviders)
        .where(eq(externalIdentityProviders.domainId, domainId))
        .orderBy(asc(externalIdentityProviders.priority), desc(externalIdentityProviders.createdAt)),
      db
        .select({
          providerId: externalIdentities.providerId,
          count: count(),
        })
        .from(externalIdentities)
        .groupBy(externalIdentities.providerId),
    ]);

    const usageMap = new Map(assignmentCounts.map((row) => [row.providerId, row.count]));
    const primaryIdpId = config[0]?.primaryIdpId;

    return c.json({
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.displayName || provider.name,
        type: provider.type as 'oidc' | 'saml' | 'oauth2',
        status: provider.status === 'active' ? 'active' : provider.status === 'inactive' ? 'inactive' : 'error',
        isPrimary: provider.id === primaryIdpId,
        issuer: provider.issuer || undefined,
        clientId: provider.clientId || undefined,
        entityId: provider.idpEntityId || undefined,
        lastSync: undefined,
        userCount: usageMap.get(provider.id) || 0,
        logo: provider.iconUrl || undefined,
      })),
    });
  }
);

// Get external SSO provider details
adminRouter.get(
  '/io.exprsn.admin.domains.sso.providers.get',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const providerId = c.req.query('providerId');

    if (!domainId || !providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { domainSsoConfig, externalIdentityProviders } = await import('../db/schema.js');
    const [[provider], [config]] = await Promise.all([
      db
        .select()
        .from(externalIdentityProviders)
        .where(and(eq(externalIdentityProviders.id, providerId), eq(externalIdentityProviders.domainId, domainId)))
        .limit(1),
      db
        .select()
        .from(domainSsoConfig)
        .where(eq(domainSsoConfig.domainId, domainId))
        .limit(1),
    ]);

    if (!provider) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    const claimMapping = (provider.claimMapping || {}) as Record<string, string>;

    return c.json({
      provider: {
        id: provider.id,
        name: provider.displayName || provider.name,
        type: provider.type as 'oidc' | 'saml' | 'oauth2',
        status: provider.status === 'active' ? 'active' : provider.status === 'inactive' ? 'inactive' : 'error',
        isPrimary: config?.primaryIdpId === provider.id,
        enabled: provider.status === 'active',
        clientId: provider.clientId || '',
        clientSecret: provider.clientSecret || '',
        issuer: provider.issuer || '',
        authorizationUrl: provider.authorizationEndpoint || '',
        tokenUrl: provider.tokenEndpoint || '',
        userInfoUrl: provider.userinfoEndpoint || '',
        scopes: (provider.scopes || []) as string[],
        entityId: provider.idpEntityId || '',
        ssoUrl: provider.ssoUrl || '',
        certificate: provider.idpCertificate || '',
        signRequests: false,
        attributeMapping: {
          email: claimMapping.email || 'email',
          name: claimMapping.name || 'name',
          avatar: claimMapping.picture || claimMapping.avatar || '',
          groups: claimMapping.groups || '',
        },
        jitConfig: (provider.jitConfig || {}) as Record<string, unknown>,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString(),
      },
    });
  }
);

// Create external SSO provider
adminRouter.post(
  '/io.exprsn.admin.domains.sso.providers.add',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<Record<string, any>>();
    const domainId = body.domainId as string | undefined;

    if (!domainId || !body.name || !body.type) {
      return c.json({ error: 'InvalidRequest', message: 'domainId, name, and type are required' }, 400);
    }

    const { externalIdentityProviders } = await import('../db/schema.js');
    const providerId = nanoid();
    const providerKey = `${slugifyProviderKey(body.name)}-${nanoid(6).toLowerCase()}`;

    const existingProviders = await db
      .select({ priority: externalIdentityProviders.priority })
      .from(externalIdentityProviders)
      .where(eq(externalIdentityProviders.domainId, domainId))
      .orderBy(desc(externalIdentityProviders.priority))
      .limit(1);

    const claimMapping = body.attributeMapping
      ? {
          email: body.attributeMapping.email,
          name: body.attributeMapping.name,
          picture: body.attributeMapping.avatar,
          groups: body.attributeMapping.groups,
        }
      : undefined;

    await db.insert(externalIdentityProviders).values({
      id: providerId,
      domainId,
      name: body.name,
      displayName: body.name,
      providerKey,
      type: body.type,
      clientId: body.clientId || null,
      clientSecret: body.clientSecret || null,
      issuer: body.issuer || null,
      authorizationEndpoint: body.authorizationUrl || null,
      tokenEndpoint: body.tokenUrl || null,
      userinfoEndpoint: body.userInfoUrl || null,
      scopes: body.scopes || ['openid', 'profile', 'email'],
      idpEntityId: body.entityId || null,
      ssoUrl: body.ssoUrl || null,
      idpCertificate: body.certificate || null,
      claimMapping,
      status: body.enabled === false ? 'inactive' : 'active',
      priority: (existingProviders[0]?.priority || 0) + 1,
      jitConfig: body.jitConfig || null,
      updatedAt: new Date(),
    });

    return c.json({ id: providerId });
  }
);

// Update external SSO provider
adminRouter.post(
  '/io.exprsn.admin.domains.sso.providers.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<Record<string, any>>();
    const domainId = body.domainId as string | undefined;
    const providerId = body.providerId as string | undefined;

    if (!domainId || !providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { externalIdentityProviders } = await import('../db/schema.js');
    const [provider] = await db
      .select()
      .from(externalIdentityProviders)
      .where(and(eq(externalIdentityProviders.id, providerId), eq(externalIdentityProviders.domainId, domainId)))
      .limit(1);

    if (!provider) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    const claimMapping = body.attributeMapping
      ? {
          email: body.attributeMapping.email,
          name: body.attributeMapping.name,
          picture: body.attributeMapping.avatar,
          groups: body.attributeMapping.groups,
        }
      : provider.claimMapping;

    await db
      .update(externalIdentityProviders)
      .set({
        name: body.name ?? provider.name,
        displayName: body.name ?? provider.displayName,
        clientId: body.clientId ?? provider.clientId,
        clientSecret: body.clientSecret ?? provider.clientSecret,
        issuer: body.issuer ?? provider.issuer,
        authorizationEndpoint: body.authorizationUrl ?? provider.authorizationEndpoint,
        tokenEndpoint: body.tokenUrl ?? provider.tokenEndpoint,
        userinfoEndpoint: body.userInfoUrl ?? provider.userinfoEndpoint,
        scopes: body.scopes ?? provider.scopes,
        idpEntityId: body.entityId ?? provider.idpEntityId,
        ssoUrl: body.ssoUrl ?? provider.ssoUrl,
        idpCertificate: body.certificate ?? provider.idpCertificate,
        claimMapping,
        status: body.enabled === undefined
          ? body.status ?? provider.status
          : body.enabled
            ? 'active'
            : 'inactive',
        jitConfig: body.jitConfig ?? provider.jitConfig,
        updatedAt: new Date(),
      })
      .where(eq(externalIdentityProviders.id, providerId));

    return c.json({ success: true });
  }
);

// Remove external SSO provider
adminRouter.post(
  '/io.exprsn.admin.domains.sso.providers.remove',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; providerId: string }>();

    if (!body.domainId || !body.providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { domainSsoConfig, externalIdentityProviders } = await import('../db/schema.js');
    await db
      .delete(externalIdentityProviders)
      .where(and(eq(externalIdentityProviders.id, body.providerId), eq(externalIdentityProviders.domainId, body.domainId)));

    const [config] = await db
      .select()
      .from(domainSsoConfig)
      .where(eq(domainSsoConfig.domainId, body.domainId))
      .limit(1);

    if (config) {
      await db
        .update(domainSsoConfig)
        .set({
          primaryIdpId: config.primaryIdpId === body.providerId ? null : config.primaryIdpId,
          allowedIdpIds: (config.allowedIdpIds || []).filter((id) => id !== body.providerId),
          updatedAt: new Date(),
          updatedBy: c.get('did'),
        })
        .where(eq(domainSsoConfig.domainId, body.domainId));
    }

    return c.json({ success: true });
  }
);

// Toggle external SSO provider
adminRouter.post(
  '/io.exprsn.admin.domains.sso.providers.toggle',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; providerId: string; enabled: boolean }>();

    if (!body.domainId || !body.providerId || body.enabled === undefined) {
      return c.json({ error: 'InvalidRequest', message: 'domainId, providerId, and enabled are required' }, 400);
    }

    const { externalIdentityProviders } = await import('../db/schema.js');
    await db
      .update(externalIdentityProviders)
      .set({
        status: body.enabled ? 'active' : 'inactive',
        updatedAt: new Date(),
      })
      .where(and(eq(externalIdentityProviders.id, body.providerId), eq(externalIdentityProviders.domainId, body.domainId)));

    return c.json({ success: true });
  }
);

// Set primary external SSO provider
adminRouter.post(
  '/io.exprsn.admin.domains.sso.providers.setPrimary',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; providerId: string }>();

    if (!body.domainId || !body.providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { domainSsoConfig } = await import('../db/schema.js');
    const [config] = await db
      .select()
      .from(domainSsoConfig)
      .where(eq(domainSsoConfig.domainId, body.domainId))
      .limit(1);

    if (config) {
      await db
        .update(domainSsoConfig)
        .set({
          primaryIdpId: body.providerId,
          allowedIdpIds: Array.from(new Set([...(config.allowedIdpIds || []), body.providerId])),
          updatedAt: new Date(),
          updatedBy: c.get('did'),
        })
        .where(eq(domainSsoConfig.domainId, body.domainId));
    } else {
      await db.insert(domainSsoConfig).values({
        id: nanoid(),
        domainId: body.domainId,
        ssoMode: 'optional',
        primaryIdpId: body.providerId,
        allowedIdpIds: [body.providerId],
        jitProvisioning: true,
        defaultRole: 'member',
        emailDomainVerification: true,
        allowedEmailDomains: [],
        forceReauthAfterHours: 24,
        updatedBy: c.get('did'),
      });
    }

    return c.json({ success: true });
  }
);

// Test external SSO provider configuration
adminRouter.post(
  '/io.exprsn.admin.domains.sso.providers.test',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const body = await c.req.json<{ domainId: string; providerId: string }>();

    if (!body.domainId || !body.providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { externalIdentityProviders } = await import('../db/schema.js');
    const [provider] = await db
      .select()
      .from(externalIdentityProviders)
      .where(and(eq(externalIdentityProviders.id, body.providerId), eq(externalIdentityProviders.domainId, body.domainId)))
      .limit(1);

    if (!provider) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    const startedAt = Date.now();
    const hasMinimumConfig = provider.type === 'saml'
      ? !!provider.ssoUrl && !!provider.idpCertificate
      : !!provider.clientId && (!!provider.issuer || !!provider.authorizationEndpoint) && !!provider.tokenEndpoint;

    return c.json({
      success: hasMinimumConfig,
      responseTime: Date.now() - startedAt,
      error: hasMinimumConfig ? undefined : 'Provider configuration is incomplete',
    });
  }
);

// Stats for one external SSO provider
adminRouter.get(
  '/io.exprsn.admin.domains.sso.providers.stats',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const providerId = c.req.query('providerId');

    if (!domainId || !providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { externalIdentities, ssoAuditLog } = await import('../db/schema.js');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [linkedUsers, loginCount, lastLogin] = await Promise.all([
      db
        .select({ count: count() })
        .from(externalIdentities)
        .where(eq(externalIdentities.providerId, providerId)),
      db
        .select({ count: count() })
        .from(ssoAuditLog)
        .where(and(eq(ssoAuditLog.domainId, domainId), eq(ssoAuditLog.providerId, providerId), gte(ssoAuditLog.createdAt, since), eq(ssoAuditLog.success, true))),
      db
        .select({ createdAt: ssoAuditLog.createdAt })
        .from(ssoAuditLog)
        .where(and(eq(ssoAuditLog.domainId, domainId), eq(ssoAuditLog.providerId, providerId), eq(ssoAuditLog.success, true)))
        .orderBy(desc(ssoAuditLog.createdAt))
        .limit(1),
    ]);

    return c.json({
      stats: {
        logins24h: loginCount[0]?.count || 0,
        linkedUsers: linkedUsers[0]?.count || 0,
        lastLogin: lastLogin[0]?.createdAt?.toISOString(),
      },
    });
  }
);

// Linked users for one external SSO provider
adminRouter.get(
  '/io.exprsn.admin.domains.sso.providers.users',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const providerId = c.req.query('providerId');

    if (!domainId || !providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { externalIdentities, externalIdentityProviders, ssoAuditLog } = await import('../db/schema.js');
    const linkedUsers = await db
      .select({
        identity: externalIdentities,
        user: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
        },
      })
      .from(externalIdentities)
      .innerJoin(externalIdentityProviders, eq(externalIdentityProviders.id, externalIdentities.providerId))
      .leftJoin(users, eq(users.did, externalIdentities.userDid))
      .where(and(eq(externalIdentityProviders.domainId, domainId), eq(externalIdentities.providerId, providerId)))
      .orderBy(desc(externalIdentities.linkedAt));

    const lastLogins = await db
      .select({
        userDid: ssoAuditLog.userDid,
        createdAt: ssoAuditLog.createdAt,
      })
      .from(ssoAuditLog)
      .where(and(eq(ssoAuditLog.domainId, domainId), eq(ssoAuditLog.providerId, providerId), eq(ssoAuditLog.success, true)))
      .orderBy(desc(ssoAuditLog.createdAt));

    const lastLoginMap = new Map<string, string>();
    for (const row of lastLogins) {
      if (row.userDid && !lastLoginMap.has(row.userDid)) {
        lastLoginMap.set(row.userDid, row.createdAt.toISOString());
      }
    }

    return c.json({
      users: linkedUsers.map(({ identity, user }) => ({
        id: identity.userDid,
        displayName: user?.displayName || user?.handle || identity.displayName || identity.email || identity.externalId,
        email: identity.email || '',
        externalId: identity.externalId,
        linkedAt: identity.linkedAt.toISOString(),
        lastLogin: lastLoginMap.get(identity.userDid),
      })),
    });
  }
);

// Domain SSO email domain list
adminRouter.get(
  '/io.exprsn.admin.domains.sso.emailDomains.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainSsoConfig, domains, externalIdentityProviders } = await import('../db/schema.js');
    const [[config], [domain], providers] = await Promise.all([
      db
        .select()
        .from(domainSsoConfig)
        .where(eq(domainSsoConfig.domainId, domainId))
        .limit(1),
      db
        .select()
        .from(domains)
        .where(eq(domains.id, domainId))
        .limit(1),
      db
        .select()
        .from(externalIdentityProviders)
        .where(eq(externalIdentityProviders.domainId, domainId)),
    ]);

    const featureState = getDomainSsoFeatureState(domain?.features);
    const metadata = featureState.emailDomains;
    const domainsFromConfig = (config?.allowedEmailDomains || []) as string[];
    const domainsFromProviders = providers
      .map((provider) => provider.requiredEmailDomain)
      .filter((value): value is string => !!value);
    const allDomains = [...new Set([...domainsFromConfig, ...domainsFromProviders])];

    return c.json({
      domains: allDomains.map((emailDomain) => {
        const domainMeta = metadata[emailDomain] || {};
        const provider = providers.find((item) => item.requiredEmailDomain === emailDomain);

        return {
          id: emailDomain,
          domain: emailDomain,
          verified: domainMeta.verified === true,
          verificationMethod: 'dns' as const,
          verificationToken: (domainMeta.verificationToken as string | undefined) || undefined,
          autoJoin: domainMeta.autoJoin === true,
          defaultRole: (domainMeta.defaultRole as string | undefined) || config?.defaultRole || 'member',
          providerId: (domainMeta.providerId as string | undefined) || provider?.id || undefined,
          providerName: provider?.displayName || provider?.name || undefined,
          createdAt: (domainMeta.createdAt as string | undefined) || config?.createdAt?.toISOString() || new Date().toISOString(),
          verifiedAt: domainMeta.verifiedAt as string | undefined,
        };
      }),
    });
  }
);

// Add domain SSO email domain
adminRouter.post(
  '/io.exprsn.admin.domains.sso.emailDomains.add',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; domain: string; autoJoin?: boolean; defaultRole?: string; providerId?: string }>();

    if (!body.domainId || !body.domain) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and domain are required' }, 400);
    }

    const { domainSsoConfig, domains, externalIdentityProviders } = await import('../db/schema.js');
    const normalizedDomain = body.domain.toLowerCase().trim();
    const [[config], [domain]] = await Promise.all([
      db
        .select()
        .from(domainSsoConfig)
        .where(eq(domainSsoConfig.domainId, body.domainId))
        .limit(1),
      db
        .select()
        .from(domains)
        .where(eq(domains.id, body.domainId))
        .limit(1),
    ]);

    const allowedEmailDomains = Array.from(new Set([...(config?.allowedEmailDomains || []), normalizedDomain]));
    if (config) {
      await db
        .update(domainSsoConfig)
        .set({
          allowedEmailDomains,
          updatedAt: new Date(),
          updatedBy: c.get('did'),
        })
        .where(eq(domainSsoConfig.domainId, body.domainId));
    } else {
      await db.insert(domainSsoConfig).values({
        id: nanoid(),
        domainId: body.domainId,
        ssoMode: 'optional',
        allowedIdpIds: [],
        jitProvisioning: true,
        defaultRole: body.defaultRole || 'member',
        emailDomainVerification: true,
        allowedEmailDomains,
        forceReauthAfterHours: 24,
        updatedBy: c.get('did'),
      });
    }

    const featureState = getDomainSsoFeatureState(domain?.features);
    const verificationToken = nanoid(24);
    const emailDomainMetadata = {
      ...featureState.emailDomains,
      [normalizedDomain]: {
        ...(featureState.emailDomains[normalizedDomain] || {}),
        autoJoin: body.autoJoin === true,
        defaultRole: body.defaultRole || config?.defaultRole || 'member',
        providerId: body.providerId || undefined,
        verificationToken,
        verified: false,
        createdAt: new Date().toISOString(),
      },
    };

    await db
      .update(domains)
      .set({
        features: mergeDomainSsoFeatureState(domain?.features, {
          emailDomains: emailDomainMetadata,
        }) as any,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, body.domainId));

    if (body.providerId) {
      await db
        .update(externalIdentityProviders)
        .set({
          requiredEmailDomain: normalizedDomain,
          updatedAt: new Date(),
        })
        .where(and(eq(externalIdentityProviders.id, body.providerId), eq(externalIdentityProviders.domainId, body.domainId)));
    }

    return c.json({ id: normalizedDomain, verificationToken });
  }
);

// Update domain SSO email domain
adminRouter.post(
  '/io.exprsn.admin.domains.sso.emailDomains.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; emailDomainId: string; autoJoin?: boolean; defaultRole?: string; providerId?: string }>();

    if (!body.domainId || !body.emailDomainId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and emailDomainId are required' }, 400);
    }

    const { domains, externalIdentityProviders } = await import('../db/schema.js');
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const featureState = getDomainSsoFeatureState(domain.features);
    const domainMeta = featureState.emailDomains[body.emailDomainId] || {};
    const nextProviderId = (
      body.providerId === undefined ? domainMeta.providerId : body.providerId
    ) as string | undefined;

    const emailDomainMetadata = {
      ...featureState.emailDomains,
      [body.emailDomainId]: {
        ...domainMeta,
        ...(body.autoJoin !== undefined ? { autoJoin: body.autoJoin } : {}),
        ...(body.defaultRole !== undefined ? { defaultRole: body.defaultRole } : {}),
        ...(body.providerId !== undefined ? { providerId: body.providerId || undefined } : {}),
      },
    };

    await db
      .update(domains)
      .set({
        features: mergeDomainSsoFeatureState(domain.features, {
          emailDomains: emailDomainMetadata,
        }) as any,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, body.domainId));

    if (body.providerId !== undefined) {
      await db
        .update(externalIdentityProviders)
        .set({
          requiredEmailDomain: null,
          updatedAt: new Date(),
        })
        .where(and(eq(externalIdentityProviders.domainId, body.domainId), eq(externalIdentityProviders.requiredEmailDomain, body.emailDomainId)));

      if (nextProviderId) {
        await db
          .update(externalIdentityProviders)
          .set({
            requiredEmailDomain: body.emailDomainId,
            updatedAt: new Date(),
          })
          .where(and(eq(externalIdentityProviders.id, nextProviderId), eq(externalIdentityProviders.domainId, body.domainId)));
      }
    }

    return c.json({ success: true });
  }
);

// Verify domain SSO email domain
adminRouter.post(
  '/io.exprsn.admin.domains.sso.emailDomains.verify',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; emailDomainId: string }>();

    if (!body.domainId || !body.emailDomainId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and emailDomainId are required' }, 400);
    }

    const { domains } = await import('../db/schema.js');
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const featureState = getDomainSsoFeatureState(domain.features);
    const domainMeta = featureState.emailDomains[body.emailDomainId] || {};
    const emailDomainMetadata = {
      ...featureState.emailDomains,
      [body.emailDomainId]: {
        ...domainMeta,
        verified: true,
        verifiedAt: new Date().toISOString(),
      },
    };

    await db
      .update(domains)
      .set({
        features: mergeDomainSsoFeatureState(domain.features, {
          emailDomains: emailDomainMetadata,
        }) as any,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, body.domainId));

    return c.json({ success: true, verified: true });
  }
);

// Remove domain SSO email domain
adminRouter.post(
  '/io.exprsn.admin.domains.sso.emailDomains.remove',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; emailDomainId: string }>();

    if (!body.domainId || !body.emailDomainId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and emailDomainId are required' }, 400);
    }

    const { domainSsoConfig, domains, externalIdentityProviders } = await import('../db/schema.js');
    const [[config], [domain]] = await Promise.all([
      db
        .select()
        .from(domainSsoConfig)
        .where(eq(domainSsoConfig.domainId, body.domainId))
        .limit(1),
      db
        .select()
        .from(domains)
        .where(eq(domains.id, body.domainId))
        .limit(1),
    ]);

    if (config) {
      await db
        .update(domainSsoConfig)
        .set({
          allowedEmailDomains: (config.allowedEmailDomains || []).filter((domainName) => domainName !== body.emailDomainId),
          updatedAt: new Date(),
          updatedBy: c.get('did'),
        })
        .where(eq(domainSsoConfig.domainId, body.domainId));
    }

    if (domain) {
      const featureState = getDomainSsoFeatureState(domain.features);
      const emailDomainMetadata = { ...featureState.emailDomains };
      delete emailDomainMetadata[body.emailDomainId];

      await db
        .update(domains)
        .set({
          features: mergeDomainSsoFeatureState(domain.features, {
            emailDomains: emailDomainMetadata,
          }) as any,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, body.domainId));
    }

    await db
      .update(externalIdentityProviders)
      .set({
        requiredEmailDomain: null,
        updatedAt: new Date(),
      })
      .where(and(eq(externalIdentityProviders.domainId, body.domainId), eq(externalIdentityProviders.requiredEmailDomain, body.emailDomainId)));

    return c.json({ success: true });
  }
);

// Domain SSO policies
adminRouter.get(
  '/io.exprsn.admin.domains.sso.policies.get',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains, domainSsoConfig } = await import('../db/schema.js');
    const [[domain], [config]] = await Promise.all([
      db
        .select()
        .from(domains)
        .where(eq(domains.id, domainId))
        .limit(1),
      db
        .select()
        .from(domainSsoConfig)
        .where(eq(domainSsoConfig.domainId, domainId))
        .limit(1),
    ]);

    const featureState = getDomainSsoFeatureState(domain?.features);

    return c.json({
      policies: {
        ...featureState.policies,
        ssoEnforced: config?.ssoMode === 'required' || featureState.policies.ssoEnforced,
      },
    });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.sso.policies.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<Record<string, any>>();
    const domainId = body.domainId as string | undefined;

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains, domainSsoConfig } = await import('../db/schema.js');
    const [[domain], [config]] = await Promise.all([
      db
        .select()
        .from(domains)
        .where(eq(domains.id, domainId))
        .limit(1),
      db
        .select()
        .from(domainSsoConfig)
        .where(eq(domainSsoConfig.domainId, domainId))
        .limit(1),
    ]);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const featureState = getDomainSsoFeatureState(domain.features);
    const nextPolicies = {
      ...featureState.policies,
      ...body,
    };
    delete (nextPolicies as Record<string, unknown>).domainId;

    await db
      .update(domains)
      .set({
        features: mergeDomainSsoFeatureState(domain.features, {
          policies: nextPolicies as Record<string, unknown>,
        }) as any,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId));

    const nextSsoMode = nextPolicies.ssoEnforced
      ? 'required'
      : config?.ssoMode === 'disabled'
        ? 'disabled'
        : 'optional';

    if (config) {
      await db
        .update(domainSsoConfig)
        .set({
          ssoMode: nextSsoMode,
          forceReauthAfterHours:
            nextPolicies.sessionTimeoutUnit === 'days'
              ? Number(nextPolicies.sessionTimeout || 24) * 24
              : nextPolicies.sessionTimeoutUnit === 'minutes'
                ? Math.max(1, Math.ceil(Number(nextPolicies.sessionTimeout || 24) / 60))
                : Number(nextPolicies.sessionTimeout || 24),
          updatedAt: new Date(),
          updatedBy: c.get('did'),
        })
        .where(eq(domainSsoConfig.domainId, domainId));
    } else {
      await db.insert(domainSsoConfig).values({
        id: nanoid(),
        domainId,
        ssoMode: nextSsoMode,
        allowedIdpIds: [],
        jitProvisioning: true,
        defaultRole: 'member',
        emailDomainVerification: true,
        allowedEmailDomains: [],
        forceReauthAfterHours:
          nextPolicies.sessionTimeoutUnit === 'days'
            ? Number(nextPolicies.sessionTimeout || 24) * 24
            : nextPolicies.sessionTimeoutUnit === 'minutes'
              ? Math.max(1, Math.ceil(Number(nextPolicies.sessionTimeout || 24) / 60))
              : Number(nextPolicies.sessionTimeout || 24),
        updatedBy: c.get('did'),
      });
    }

    return c.json({ success: true });
  }
);

// Domain SSO audit log
adminRouter.get(
  '/io.exprsn.admin.domains.sso.audit',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const providerId = c.req.query('providerId');
    const userDid = c.req.query('userDid');
    const eventType = c.req.query('eventType');
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { ssoAuditLog } = await import('../db/schema.js');
    const conditions = [eq(ssoAuditLog.domainId, domainId)];
    if (providerId) conditions.push(eq(ssoAuditLog.providerId, providerId));
    if (userDid) conditions.push(eq(ssoAuditLog.userDid, userDid));
    if (eventType) conditions.push(eq(ssoAuditLog.eventType, eventType));

    const logs = await db
      .select()
      .from(ssoAuditLog)
      .where(and(...conditions))
      .orderBy(desc(ssoAuditLog.createdAt))
      .limit(limit);

    return c.json({
      logs: logs.map((log) => ({
        id: log.id,
        eventType: log.eventType,
        userDid: log.userDid || undefined,
        clientId: log.clientId || undefined,
        providerId: log.providerId || undefined,
        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
        details: (log.details || {}) as Record<string, unknown>,
        success: log.success,
        errorMessage: log.errorMessage || undefined,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  }
);

// Hosted OIDC clients for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.oauth.clients.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { oauthClients } = await import('../db/schema.js');
    const clients = await db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.domainId, domainId))
      .orderBy(desc(oauthClients.createdAt));

    return c.json({
      clients: clients.map((client) => ({
        id: client.id,
        clientId: client.clientId,
        clientName: client.clientName,
        clientUri: client.clientUri || undefined,
        logoUri: client.logoUri || undefined,
        clientType: client.clientType as 'confidential' | 'public',
        applicationType: (client.applicationType || 'web') as 'web' | 'native' | 'spa',
        redirectUris: (client.redirectUris || []) as string[],
        grantTypes: (client.grantTypes || []) as string[],
        allowedScopes: (client.allowedScopes || []) as string[],
        requireConsent: client.requireConsent ?? true,
        requirePkce: client.requirePkce ?? true,
        status: (client.status || 'active') as 'active' | 'suspended' | 'pending_approval',
        createdAt: client.createdAt.toISOString(),
      })),
    });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.oauth.clients.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      clientName: string;
      clientUri?: string;
      logoUri?: string;
      applicationType?: 'web' | 'native' | 'spa';
      redirectUris: string[];
      allowedScopes?: string[];
      requireConsent?: boolean;
      requirePkce?: boolean;
    }>();

    if (!body.domainId || !body.clientName || !Array.isArray(body.redirectUris) || body.redirectUris.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'domainId, clientName, and redirectUris are required' }, 400);
    }

    const { OIDCProviderService } = await import('../services/sso/OIDCProviderService.js');
    const result = await OIDCProviderService.registerClient({
      clientName: body.clientName,
      clientUri: body.clientUri,
      logoUri: body.logoUri,
      redirectUris: body.redirectUris,
      allowedScopes: body.allowedScopes,
      requireConsent: body.requireConsent,
      requirePkce: body.requirePkce,
      applicationType: body.applicationType,
      domainId: body.domainId,
      ownerDid: c.get('did'),
    } as any);

    return c.json({
      client: {
        id: result.client.id,
        clientId: result.clientId,
        clientSecret: result.clientSecret,
        clientName: result.client.clientName,
      },
    });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.oauth.clients.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      clientId: string;
      clientName?: string;
      clientUri?: string;
      logoUri?: string;
      redirectUris?: string[];
      allowedScopes?: string[];
      requireConsent?: boolean;
      requirePkce?: boolean;
      status?: 'active' | 'suspended';
    }>();

    if (!body.domainId || !body.clientId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and clientId are required' }, 400);
    }

    const { oauthClients } = await import('../db/schema.js');
    await db
      .update(oauthClients)
      .set({
        ...(body.clientName !== undefined ? { clientName: body.clientName } : {}),
        ...(body.clientUri !== undefined ? { clientUri: body.clientUri } : {}),
        ...(body.logoUri !== undefined ? { logoUri: body.logoUri } : {}),
        ...(body.redirectUris !== undefined ? { redirectUris: body.redirectUris } : {}),
        ...(body.allowedScopes !== undefined ? { allowedScopes: body.allowedScopes } : {}),
        ...(body.requireConsent !== undefined ? { requireConsent: body.requireConsent } : {}),
        ...(body.requirePkce !== undefined ? { requirePkce: body.requirePkce } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(oauthClients.domainId, body.domainId), eq(oauthClients.id, body.clientId)));

    return c.json({ success: true });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.oauth.clients.delete',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; clientId: string }>();

    if (!body.domainId || !body.clientId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and clientId are required' }, 400);
    }

    const { oauthClients } = await import('../db/schema.js');
    await db
      .delete(oauthClients)
      .where(and(eq(oauthClients.domainId, body.domainId), eq(oauthClients.id, body.clientId)));

    return c.json({ success: true });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.oauth.clients.regenerateSecret',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; clientId: string }>();

    if (!body.domainId || !body.clientId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and clientId are required' }, 400);
    }

    const { oauthClients } = await import('../db/schema.js');
    const clientSecret = `secret_${nanoid(48)}`;
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    await db
      .update(oauthClients)
      .set({
        clientSecretHash,
        updatedAt: new Date(),
      })
      .where(and(eq(oauthClients.domainId, body.domainId), eq(oauthClients.id, body.clientId)));

    return c.json({ clientSecret });
  }
);

// Hosted SAML service providers for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.saml.providers.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { samlServiceProviders } = await import('../db/schema.js');
    const providers = await db
      .select()
      .from(samlServiceProviders)
      .where(eq(samlServiceProviders.domainId, domainId))
      .orderBy(desc(samlServiceProviders.createdAt));

    return c.json({
      providers: providers.map((provider) => ({
        id: provider.id,
        entityId: provider.entityId,
        name: provider.name,
        description: provider.description || undefined,
        assertionConsumerServiceUrl: provider.assertionConsumerServiceUrl,
        singleLogoutServiceUrl: provider.singleLogoutServiceUrl || undefined,
        nameIdFormat: provider.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        signAssertions: provider.signAssertions ?? true,
        signResponse: provider.signResponse ?? true,
        encryptAssertions: provider.encryptAssertions ?? false,
        status: (provider.status || 'active') as 'active' | 'suspended' | 'pending',
        createdAt: provider.createdAt.toISOString(),
      })),
    });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.saml.providers.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      name: string;
      entityId: string;
      assertionConsumerServiceUrl: string;
      singleLogoutServiceUrl?: string;
      nameIdFormat?: string;
      signAssertions?: boolean;
      signResponse?: boolean;
      encryptAssertions?: boolean;
      spCertificate?: string;
      attributeMapping?: Record<string, string>;
    }>();

    if (!body.domainId || !body.name || !body.entityId || !body.assertionConsumerServiceUrl) {
      return c.json({ error: 'InvalidRequest', message: 'domainId, name, entityId, and assertionConsumerServiceUrl are required' }, 400);
    }

    const { samlServiceProviders } = await import('../db/schema.js');
    const providerId = nanoid();

    await db.insert(samlServiceProviders).values({
      id: providerId,
      domainId: body.domainId,
      entityId: body.entityId,
      name: body.name,
      assertionConsumerServiceUrl: body.assertionConsumerServiceUrl,
      singleLogoutServiceUrl: body.singleLogoutServiceUrl,
      nameIdFormat: body.nameIdFormat,
      signAssertions: body.signAssertions ?? true,
      signResponse: body.signResponse ?? true,
      encryptAssertions: body.encryptAssertions ?? false,
      spCertificate: body.spCertificate,
      attributeMapping: body.attributeMapping,
      ownerDid: c.get('did'),
      status: 'active',
    });

    return c.json({
      provider: {
        id: providerId,
        entityId: body.entityId,
        name: body.name,
      },
    });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.saml.providers.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      providerId: string;
      name?: string;
      assertionConsumerServiceUrl?: string;
      singleLogoutServiceUrl?: string;
      nameIdFormat?: string;
      signAssertions?: boolean;
      signResponse?: boolean;
      encryptAssertions?: boolean;
      spCertificate?: string;
      status?: 'active' | 'suspended';
    }>();

    if (!body.domainId || !body.providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { samlServiceProviders } = await import('../db/schema.js');
    await db
      .update(samlServiceProviders)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.assertionConsumerServiceUrl !== undefined ? { assertionConsumerServiceUrl: body.assertionConsumerServiceUrl } : {}),
        ...(body.singleLogoutServiceUrl !== undefined ? { singleLogoutServiceUrl: body.singleLogoutServiceUrl } : {}),
        ...(body.nameIdFormat !== undefined ? { nameIdFormat: body.nameIdFormat } : {}),
        ...(body.signAssertions !== undefined ? { signAssertions: body.signAssertions } : {}),
        ...(body.signResponse !== undefined ? { signResponse: body.signResponse } : {}),
        ...(body.encryptAssertions !== undefined ? { encryptAssertions: body.encryptAssertions } : {}),
        ...(body.spCertificate !== undefined ? { spCertificate: body.spCertificate } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(samlServiceProviders.domainId, body.domainId), eq(samlServiceProviders.id, body.providerId)));

    return c.json({ success: true });
  }
);

adminRouter.post(
  '/io.exprsn.admin.domains.saml.providers.delete',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ domainId: string; providerId: string }>();

    if (!body.domainId || !body.providerId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId and providerId are required' }, 400);
    }

    const { samlServiceProviders } = await import('../db/schema.js');
    await db
      .delete(samlServiceProviders)
      .where(and(eq(samlServiceProviders.domainId, body.domainId), eq(samlServiceProviders.id, body.providerId)));

    return c.json({ success: true });
  }
);

adminRouter.get(
  '/io.exprsn.admin.domains.saml.metadata',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains } = await import('../db/schema.js');
    const [domain] = await db
      .select({ domain: domains.domain })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const { SAMLProviderService } = await import('../services/sso/SAMLProviderService.js');
    const metadata = SAMLProviderService.generateIdPMetadata().replace(/Exprsn/g, domain.domain);
    return c.json({ metadata });
  }
);

// Helper function for sanction severity ordering
function severityOrder(sanctionType: string): number {
  const order: Record<string, number> = {
    warning: 1,
    mute: 2,
    suspend: 3,
    ban: 4,
  };
  return order[sanctionType] || 0;
}

// ============================================
// Organization Administration
// ============================================

// List organizations (with filtering)
adminRouter.get(
  '/io.exprsn.admin.org.list',
  requirePermission(ADMIN_PERMISSIONS.ORGS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const parentId = c.req.query('parentId');
    const type = c.req.query('type');
    const cursor = c.req.query('cursor');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    const conditions = [];

    if (domainId) {
      conditions.push(eq(organizations.domainId, domainId));
    }

    if (parentId) {
      if (parentId === 'null' || parentId === 'root') {
        conditions.push(isNull(organizations.parentOrganizationId));
      } else {
        conditions.push(eq(organizations.parentOrganizationId, parentId));
      }
    }

    if (type) {
      conditions.push(eq(organizations.type, type as 'team' | 'enterprise' | 'nonprofit' | 'business'));
    }

    if (cursor) {
      conditions.push(lt(organizations.createdAt, new Date(cursor)));
    }

    const orgs = await db
      .select({
        org: organizations,
        ownerUser: users,
        childCount: sql<number>`(SELECT COUNT(*) FROM ${organizations} c WHERE c.parent_organization_id = ${organizations.id})`.as('childCount'),
      })
      .from(organizations)
      .leftJoin(users, eq(users.did, organizations.ownerDid))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(organizations.createdAt))
      .limit(limit + 1);

    const hasMore = orgs.length > limit;
    const results = hasMore ? orgs.slice(0, limit) : orgs;

    return c.json({
      organizations: results.map((row) => ({
        id: row.org.id,
        name: row.org.name,
        type: row.org.type,
        website: row.org.website,
        verified: row.org.verified,
        memberCount: row.org.memberCount,
        parentOrganizationId: row.org.parentOrganizationId,
        domainId: row.org.domainId,
        hierarchyLevel: row.org.hierarchyLevel,
        childCount: row.childCount,
        createdAt: row.org.createdAt.toISOString(),
        owner: row.ownerUser
          ? {
              did: row.ownerUser.did,
              handle: row.ownerUser.handle,
              displayName: row.ownerUser.displayName,
              avatar: row.ownerUser.avatar,
            }
          : null,
      })),
      cursor: hasMore && results.length > 0 ? results[results.length - 1]!.org.createdAt.toISOString() : undefined,
    });
  }
);

// Create organization (admin can create for any user)
adminRouter.post(
  '/io.exprsn.admin.org.create',
  requirePermission(ADMIN_PERMISSIONS.ORGS_CREATE),
  async (c) => {
    const adminDid = c.get('did');
    const body = await c.req.json<{
      name: string;
      handle?: string;
      description?: string;
      type: 'team' | 'enterprise' | 'nonprofit' | 'business' | 'standard';
      visibility?: 'public' | 'private' | 'unlisted';
      domainId?: string;
      parentOrganizationId?: string;
      ownerDid?: string;
      website?: string;
    }>();

    if (!body.name || !body.type) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    // Map 'standard' type to 'team' for backwards compatibility
    const orgType = body.type === 'standard' ? 'team' : body.type;

    const ownerDid = body.ownerDid || adminDid;

    // Verify owner exists
    const owner = await db
      .select()
      .from(users)
      .where(eq(users.did, ownerDid))
      .limit(1);

    if (!owner[0]) {
      return c.json({ error: 'NotFound', message: 'Owner user not found' }, 404);
    }

    // Verify domain exists if specified
    if (body.domainId) {
      const { domains } = await import('../db/schema.js');
      const domain = await db
        .select()
        .from(domains)
        .where(eq(domains.id, body.domainId))
        .limit(1);

      if (!domain[0]) {
        return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
      }
    }

    // Calculate hierarchy path and level
    let hierarchyPath = '';
    let hierarchyLevel = 0;

    if (body.parentOrganizationId) {
      const parent = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, body.parentOrganizationId))
        .limit(1);

      if (!parent[0]) {
        return c.json({ error: 'NotFound', message: 'Parent organization not found' }, 404);
      }

      hierarchyPath = parent[0].hierarchyPath || `/${body.parentOrganizationId}/`;
      hierarchyLevel = (parent[0].hierarchyLevel || 0) + 1;
    }

    const orgId = nanoid();
    hierarchyPath = `${hierarchyPath}${orgId}/`;
    if (!hierarchyPath.startsWith('/')) {
      hierarchyPath = `/${orgId}/`;
    }

    await db.insert(organizations).values({
      id: orgId,
      name: body.name,
      handle: body.handle,
      description: body.description,
      type: orgType,
      isPublic: body.visibility !== 'private',
      website: body.website,
      ownerDid,
      domainId: body.domainId,
      parentOrganizationId: body.parentOrganizationId,
      hierarchyPath,
      hierarchyLevel,
    });

    // Add owner as member
    await db.insert(organizationMembers).values({
      id: nanoid(),
      organizationId: orgId,
      userDid: ownerDid,
      role: 'owner',
      permissions: ['*'],
    });

    // Log admin activity
    const adminUser = c.get('adminUser');
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.create',
      targetType: 'organization',
      targetId: orgId,
      details: {
        name: body.name,
        type: body.type,
        ownerDid,
        domainId: body.domainId,
        parentOrganizationId: body.parentOrganizationId,
      },
      createdAt: new Date(),
    });

    const [createdOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!createdOrg) {
      return c.json({ error: 'InternalError', message: 'Failed to create organization' }, 500);
    }

    return c.json({
      organization: {
        id: createdOrg.id,
        name: createdOrg.name,
        type: createdOrg.type,
        website: createdOrg.website,
        verified: createdOrg.verified,
        memberCount: createdOrg.memberCount,
        parentOrganizationId: createdOrg.parentOrganizationId,
        domainId: createdOrg.domainId,
        hierarchyPath: createdOrg.hierarchyPath,
        hierarchyLevel: createdOrg.hierarchyLevel,
        createdAt: createdOrg.createdAt.toISOString(),
        owner: {
          did: owner[0].did,
          handle: owner[0].handle,
          displayName: owner[0].displayName,
          avatar: owner[0].avatar,
        },
      },
    });
  }
);

// Delete organization (admin bypass - no owner check)
adminRouter.post(
  '/io.exprsn.admin.org.delete',
  requirePermission(ADMIN_PERMISSIONS.ORGS_DELETE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      organizationId: string;
      childAction?: 'orphan' | 'reparent' | 'cascade';
      newParentId?: string;
    }>();

    if (!body.organizationId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing organizationId' }, 400);
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);

    if (!org[0]) {
      return c.json({ error: 'NotFound', message: 'Organization not found' }, 404);
    }

    // Get child organizations
    const childOrgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.parentOrganizationId, body.organizationId));

    const childAction = body.childAction || 'orphan';
    let orphanedCount = 0;
    let reparentedCount = 0;
    let deletedCount = 0;

    if (childOrgs.length > 0) {
      switch (childAction) {
        case 'orphan':
          await db
            .update(organizations)
            .set({
              parentOrganizationId: null,
              hierarchyPath: sql`'/' || id || '/'`,
              hierarchyLevel: 0,
            })
            .where(eq(organizations.parentOrganizationId, body.organizationId));
          orphanedCount = childOrgs.length;
          break;

        case 'reparent':
          if (!body.newParentId) {
            return c.json({ error: 'InvalidRequest', message: 'newParentId required for reparent action' }, 400);
          }
          const newParent = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, body.newParentId))
            .limit(1);

          if (!newParent[0]) {
            return c.json({ error: 'NotFound', message: 'New parent organization not found' }, 404);
          }

          const newParentPath = newParent[0].hierarchyPath || `/${body.newParentId}/`;
          const newParentLevel = (newParent[0].hierarchyLevel || 0) + 1;

          for (const child of childOrgs) {
            const childPath = `${newParentPath}${child.id}/`;
            await db
              .update(organizations)
              .set({
                parentOrganizationId: body.newParentId,
                hierarchyPath: childPath,
                hierarchyLevel: newParentLevel,
              })
              .where(eq(organizations.id, child.id));
          }
          reparentedCount = childOrgs.length;
          break;

        case 'cascade':
          deletedCount = await cascadeDeleteOrgAdmin(body.organizationId);
          await db.insert(adminAuditLog).values({
            id: nanoid(),
            adminId: adminUser.id,
            action: 'organization.delete',
            targetType: 'organization',
            targetId: body.organizationId,
            details: { name: org[0].name, childAction, deletedCount: deletedCount + 1 },
            createdAt: new Date(),
          });
          return c.json({ success: true, deletedCount: deletedCount + 1 });
      }
    }

    await db.delete(organizations).where(eq(organizations.id, body.organizationId));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.delete',
      targetType: 'organization',
      targetId: body.organizationId,
      details: { name: org[0].name, childAction, orphanedCount, reparentedCount },
      createdAt: new Date(),
    });

    return c.json({
      success: true,
      orphanedCount,
      reparentedCount,
      deletedCount: deletedCount + 1,
    });
  }
);

// Helper for admin cascade delete
async function cascadeDeleteOrgAdmin(orgId: string): Promise<number> {
  let deletedCount = 0;

  const children = await db
    .select()
    .from(organizations)
    .where(eq(organizations.parentOrganizationId, orgId));

  for (const child of children) {
    deletedCount += await cascadeDeleteOrgAdmin(child.id);
    await db.delete(organizations).where(eq(organizations.id, child.id));
    deletedCount++;
  }

  return deletedCount;
}

// Set organization hierarchy (admin)
adminRouter.post(
  '/io.exprsn.admin.org.setHierarchy',
  requirePermission(ADMIN_PERMISSIONS.ORGS_MANAGE_HIERARCHY),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      organizationId: string;
      parentOrganizationId?: string | null;
      domainId?: string | null;
    }>();

    if (!body.organizationId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing organizationId' }, 400);
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);

    if (!org[0]) {
      return c.json({ error: 'NotFound', message: 'Organization not found' }, 404);
    }

    const updates: Partial<typeof organizations.$inferSelect> = {};

    if (body.parentOrganizationId !== undefined) {
      if (body.parentOrganizationId) {
        const parent = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, body.parentOrganizationId))
          .limit(1);

        if (!parent[0]) {
          return c.json({ error: 'NotFound', message: 'Parent organization not found' }, 404);
        }

        // Prevent circular reference
        if (parent[0].hierarchyPath?.includes(`/${body.organizationId}/`)) {
          return c.json({ error: 'InvalidRequest', message: 'Cannot create circular hierarchy' }, 400);
        }

        const parentPath = parent[0].hierarchyPath || `/${body.parentOrganizationId}/`;
        updates.parentOrganizationId = body.parentOrganizationId;
        updates.hierarchyPath = `${parentPath}${body.organizationId}/`;
        updates.hierarchyLevel = (parent[0].hierarchyLevel || 0) + 1;
      } else {
        updates.parentOrganizationId = null;
        updates.hierarchyPath = `/${body.organizationId}/`;
        updates.hierarchyLevel = 0;
      }
    }

    if (body.domainId !== undefined) {
      if (body.domainId) {
        const { domains } = await import('../db/schema.js');
        const domain = await db
          .select()
          .from(domains)
          .where(eq(domains.id, body.domainId))
          .limit(1);

        if (!domain[0]) {
          return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
        }
      }
      updates.domainId = body.domainId;
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'No updates provided' }, 400);
    }

    await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, body.organizationId));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.setHierarchy',
      targetType: 'organization',
      targetId: body.organizationId,
      details: updates,
      createdAt: new Date(),
    });

    const [updatedOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);

    if (!updatedOrg) {
      return c.json({ error: 'InternalError', message: 'Failed to update organization' }, 500);
    }

    return c.json({
      organization: {
        id: updatedOrg.id,
        name: updatedOrg.name,
        type: updatedOrg.type,
        parentOrganizationId: updatedOrg.parentOrganizationId,
        domainId: updatedOrg.domainId,
        hierarchyPath: updatedOrg.hierarchyPath,
        hierarchyLevel: updatedOrg.hierarchyLevel,
      },
    });
  }
);

// ============================================
// Identity Conversion Routes
// ============================================

// Convert a user from did:plc to did:exprsn with certificates
adminRouter.post(
  '/io.exprsn.admin.identity.convertToExprsn',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string; // Current DID of the user
      vanityId?: string; // Optional vanity identifier (e.g., "rickholland" for did:exprsn:rickholland)
      email?: string;
    }>();

    if (!body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing userDid' }, 400);
    }

    const { ExprsnDidService } = await import('../services/did/exprsn.js');
    const { certificateManager } = await import('../services/ca/CertificateManager.js');
    const { users, actorRepos, plcIdentities, exprsnDidCertificates, caEntityCertificates } = await import('../db/schema.js');

    // Get the existing user
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    if (!existingUser) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    try {
      // Ensure root CA exists
      await certificateManager.ensureRootCA();

      // Issue client auth certificate
      const clientCertResult = await certificateManager.issueEntityCertificate({
        commonName: `@${existingUser.handle}`,
        type: 'client',
        email: body.email,
        organization: 'Exprsn Creator',
        validityDays: 365,
      });

      // Issue code signing certificate
      const codeSigningCertResult = await certificateManager.issueEntityCertificate({
        commonName: `@${existingUser.handle} (Code Signing)`,
        type: 'code_signing',
        email: body.email,
        organization: 'Exprsn Creator',
        validityDays: 365,
      });

      // Generate DID - use vanity ID if provided, otherwise derive from fingerprint
      let newDid: string;
      if (body.vanityId) {
        newDid = `did:exprsn:${body.vanityId}`;
      } else {
        newDid = ExprsnDidService.generateDid(clientCertResult.fingerprint);
      }

      // Get certificate details
      const clientCertDetails = await certificateManager.getEntityCertificate(clientCertResult.id);
      const codeSigningCertDetails = await certificateManager.getEntityCertificate(codeSigningCertResult.id);

      // Get public key for multibase
      const [entityCert] = await db
        .select({ publicKey: caEntityCertificates.publicKey })
        .from(caEntityCertificates)
        .where(eq(caEntityCertificates.id, clientCertResult.id))
        .limit(1);

      const publicKeyMultibase = ExprsnDidService.publicKeyToMultibase(entityCert?.publicKey || '');

      // Store the DID-certificate link
      await db.insert(exprsnDidCertificates).values({
        id: nanoid(),
        did: newDid,
        certificateId: clientCertResult.id,
        certificateType: 'platform',
        publicKeyMultibase,
        status: 'active',
      });

      // Link code signing certificate to the same DID
      await db
        .update(caEntityCertificates)
        .set({ subjectDid: newDid })
        .where(eq(caEntityCertificates.id, codeSigningCertResult.id));

      // Update users table with new DID
      await db
        .update(users)
        .set({
          did: newDid,
          updatedAt: new Date(),
        })
        .where(eq(users.did, body.userDid));

      // Update actor_repos table
      const [existingRepo] = await db
        .select()
        .from(actorRepos)
        .where(eq(actorRepos.did, body.userDid))
        .limit(1);

      if (existingRepo) {
        await db
          .update(actorRepos)
          .set({
            did: newDid,
            signingKeyPublic: publicKeyMultibase,
            updatedAt: new Date(),
          })
          .where(eq(actorRepos.did, body.userDid));
      }

      // Create or update PLC identity record
      const [existingIdentity] = await db
        .select()
        .from(plcIdentities)
        .where(eq(plcIdentities.did, body.userDid))
        .limit(1);

      if (existingIdentity) {
        // Update existing identity
        await db
          .update(plcIdentities)
          .set({
            did: newDid,
            signingKey: publicKeyMultibase,
            rotationKeys: [publicKeyMultibase],
            certificateId: clientCertResult.id,
            certificateFingerprint: clientCertResult.fingerprint,
            updatedAt: new Date(),
          })
          .where(eq(plcIdentities.did, body.userDid));
      } else {
        // Create new identity
        await db.insert(plcIdentities).values({
          did: newDid,
          handle: existingUser.handle,
          signingKey: publicKeyMultibase,
          rotationKeys: [publicKeyMultibase],
          alsoKnownAs: [`at://${existingUser.handle}`],
          services: {
            atproto_pds: {
              type: 'AtprotoPersonalDataServer',
              endpoint: process.env.PDS_ENDPOINT || 'https://pds.exprsn.io',
            },
          },
          certificateId: clientCertResult.id,
          certificateFingerprint: clientCertResult.fingerprint,
          status: 'active',
        });
      }

      // Log activity
      const adminDid = c.get('did');
      const { domainActivityLog } = await import('../db/schema.js');
      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: 'domain_exprsn_io',
        actorDid: adminDid,
        action: 'identity_converted',
        targetType: 'user',
        targetId: newDid,
        metadata: {
          oldDid: body.userDid,
          newDid,
          handle: existingUser.handle,
          certificateId: clientCertResult.id,
        },
      });

      return c.json({
        success: true,
        oldDid: body.userDid,
        newDid,
        handle: existingUser.handle,
        certificate: {
          id: clientCertResult.id,
          fingerprint: clientCertResult.fingerprint,
          validUntil: clientCertDetails?.notAfter,
        },
        codeSigningCertificate: {
          id: codeSigningCertResult.id,
          fingerprint: codeSigningCertResult.fingerprint,
          validUntil: codeSigningCertDetails?.notAfter,
        },
        publicKeyMultibase,
      });
    } catch (error) {
      console.error('Identity conversion error:', error);
      return c.json({
        error: 'ConversionError',
        message: error instanceof Error ? error.message : 'Failed to convert identity'
      }, 500);
    }
  }
);

// ============================================
// Certificate Management Routes
// ============================================

// Issue a certificate
adminRouter.post(
  '/io.exprsn.admin.certificates.issue',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      issuerId: string; // Intermediate cert ID
      domainId: string;
      certType: 'client' | 'server' | 'code_signing';
      commonName: string;
      organization?: string;
      validityDays: number;
      subjectAltNames?: {
        dnsNames?: string[];
        ipAddresses?: string[];
        emails?: string[];
      };
      userDid?: string;
      serviceId?: string;
    }>();

    if (!body.issuerId || !body.commonName || !body.certType || !body.domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { CertificateManager } = await import('../services/ca/index.js');
    const { domains, domainActivityLog } = await import('../db/schema.js');

    // Verify domain exists
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    try {
      const certManager = new CertificateManager();

      // Build SANs array
      const subjectAltNames: string[] = [];
      if (body.subjectAltNames?.dnsNames) {
        subjectAltNames.push(...body.subjectAltNames.dnsNames.map(dns => `DNS:${dns}`));
      }
      if (body.subjectAltNames?.emails) {
        subjectAltNames.push(...body.subjectAltNames.emails.map(email => `email:${email}`));
      }

      const result = await certManager.issueEntityCertificate({
        commonName: body.commonName,
        organization: body.organization || domain.name,
        type: body.certType,
        subjectDid: body.userDid,
        serviceId: body.serviceId,
        subjectAltNames: subjectAltNames.length > 0 ? subjectAltNames : undefined,
        validityDays: body.validityDays || 365,
        intermediateId: body.issuerId,
      });

      // Log activity
      const adminDid = c.get('did');
      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: body.domainId,
        actorDid: adminDid,
        action: 'certificate_issued',
        metadata: {
          certId: result.id,
          certType: body.certType,
          commonName: body.commonName,
        },
      });

      return c.json({
        certificate: {
          id: result.id,
          serialNumber: result.serialNumber,
          fingerprint: result.fingerprint,
          certType: body.certType,
          commonName: body.commonName,
        },
      });
    } catch (error) {
      console.error('Certificate issue error:', error);
      return c.json({
        error: 'CertificateError',
        message: error instanceof Error ? error.message : 'Failed to issue certificate'
      }, 500);
    }
  }
);

// List certificates for a domain
adminRouter.get(
  '/io.exprsn.admin.certificates.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const certType = c.req.query('certType') as 'client' | 'server' | 'code_signing' | undefined;
    const status = c.req.query('status') || 'active';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains, caIntermediateCertificates, caEntityCertificates } = await import('../db/schema.js');

    // Get the domain's intermediate cert
    const [domain] = await db
      .select({ intermediateCertId: domains.intermediateCertId })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain || !domain.intermediateCertId) {
      return c.json({ certificates: [] });
    }

    // Build query conditions
    const conditions = [eq(caEntityCertificates.issuerId, domain.intermediateCertId)];
    if (certType) {
      conditions.push(eq(caEntityCertificates.certType, certType));
    }
    if (status) {
      conditions.push(eq(caEntityCertificates.status, status));
    }

    const certificates = await db
      .select({
        id: caEntityCertificates.id,
        commonName: caEntityCertificates.commonName,
        certType: caEntityCertificates.certType,
        serialNumber: caEntityCertificates.serialNumber,
        fingerprint: caEntityCertificates.fingerprint,
        status: caEntityCertificates.status,
        notBefore: caEntityCertificates.notBefore,
        notAfter: caEntityCertificates.notAfter,
        subjectDid: caEntityCertificates.subjectDid,
        serviceId: caEntityCertificates.serviceId,
        createdAt: caEntityCertificates.createdAt,
      })
      .from(caEntityCertificates)
      .where(and(...conditions))
      .orderBy(desc(caEntityCertificates.createdAt))
      .limit(limit);

    return c.json({ certificates });
  }
);

// Revoke a certificate
adminRouter.post(
  '/io.exprsn.admin.certificates.revoke',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      certId: string;
      reason?: string;
    }>();

    if (!body.certId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing certId' }, 400);
    }

    const { caEntityCertificates, domainActivityLog, domains } = await import('../db/schema.js');

    // Get the certificate
    const [cert] = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, body.certId))
      .limit(1);

    if (!cert) {
      return c.json({ error: 'NotFound', message: 'Certificate not found' }, 404);
    }

    if (cert.status === 'revoked') {
      return c.json({ error: 'AlreadyRevoked', message: 'Certificate is already revoked' }, 400);
    }

    // Revoke the certificate
    await db
      .update(caEntityCertificates)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revocationReason: body.reason || 'Administrative revocation',
      })
      .where(eq(caEntityCertificates.id, body.certId));

    // Find domain for logging (via intermediate cert)
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.intermediateCertId, cert.issuerId))
      .limit(1);

    if (domain) {
      const adminDid = c.get('did');
      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: domain.id,
        actorDid: adminDid,
        action: 'certificate_revoked',
        metadata: {
          certId: body.certId,
          commonName: cert.commonName,
          reason: body.reason,
        },
      });
    }

    return c.json({ success: true });
  }
);

// Download certificate (returns PEM)
adminRouter.get(
  '/io.exprsn.admin.certificates.download',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const certId = c.req.query('certId');
    const format = c.req.query('format') || 'pem'; // 'pem' | 'chain'

    if (!certId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing certId' }, 400);
    }

    const { caEntityCertificates, caIntermediateCertificates, caRootCertificates } = await import('../db/schema.js');

    // Get the certificate
    const [cert] = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certId))
      .limit(1);

    if (!cert) {
      return c.json({ error: 'NotFound', message: 'Certificate not found' }, 404);
    }

    if (format === 'chain') {
      // Get the full chain
      const [intermediate] = await db
        .select()
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.id, cert.issuerId))
        .limit(1);

      let chainPem = cert.certificate;

      if (intermediate) {
        chainPem += '\n' + intermediate.certificate;

        // Get root
        const [root] = await db
          .select()
          .from(caRootCertificates)
          .where(eq(caRootCertificates.id, intermediate.rootId))
          .limit(1);

        if (root) {
          chainPem += '\n' + root.certificate;
        }
      }

      return c.json({
        certificate: chainPem,
        format: 'chain',
      });
    }

    return c.json({
      certificate: cert.certificate,
      format: 'pem',
    });
  }
);

// Create and link an intermediate CA to a domain
adminRouter.post(
  '/io.exprsn.admin.domains.createIntermediateCA',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      commonName?: string;
      organization?: string;
      validityDays?: number;
    }>();

    if (!body.domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domains, domainActivityLog } = await import('../db/schema.js');

    // Get the domain
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check if domain already has an intermediate CA
    if (domain.intermediateCertId) {
      return c.json({ error: 'AlreadyExists', message: 'Domain already has an intermediate CA' }, 400);
    }

    try {
      const { CertificateManager } = await import('../services/ca/index.js');
      const certManager = new CertificateManager();

      // Create the intermediate CA
      const intermediateCA = await certManager.createIntermediateCA({
        commonName: body.commonName || `${domain.name} Intermediate CA`,
        organization: body.organization || 'Exprsn',
        validityDays: body.validityDays || 3650, // 10 years
      });

      // Link to domain
      await db
        .update(domains)
        .set({
          intermediateCertId: intermediateCA.id,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, body.domainId));

      // Log activity
      const adminDid = c.get('did');
      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: body.domainId,
        actorDid: adminDid,
        action: 'intermediate_ca_created',
        metadata: {
          certId: intermediateCA.id,
          commonName: body.commonName || `${domain.name} Intermediate CA`,
        },
      });

      return c.json({
        intermediateCert: {
          id: intermediateCA.id,
          commonName: body.commonName || `${domain.name} Intermediate CA`,
          serialNumber: intermediateCA.serialNumber,
          fingerprint: intermediateCA.fingerprint,
        },
      });
    } catch (error) {
      console.error('Failed to create intermediate CA:', error);
      return c.json({
        error: 'CertificateError',
        message: error instanceof Error ? error.message : 'Failed to create intermediate CA',
      }, 500);
    }
  }
);

// ============================================
// Domain Clusters Routes
// ============================================

// List clusters assigned to a domain
adminRouter.get(
  '/io.exprsn.admin.domains.clusters.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainClusters, renderClusters } = await import('../db/schema.js');

    const clusters = await db
      .select({
        id: domainClusters.id,
        clusterId: domainClusters.clusterId,
        isPrimary: domainClusters.isPrimary,
        priority: domainClusters.priority,
        createdAt: domainClusters.createdAt,
        cluster: {
          id: renderClusters.id,
          name: renderClusters.name,
          type: renderClusters.type,
          region: renderClusters.region,
          status: renderClusters.status,
          workerCount: renderClusters.workerCount,
          gpuEnabled: renderClusters.gpuEnabled,
        },
      })
      .from(domainClusters)
      .innerJoin(renderClusters, eq(domainClusters.clusterId, renderClusters.id))
      .where(eq(domainClusters.domainId, domainId))
      .orderBy(desc(domainClusters.isPrimary), domainClusters.priority);

    return c.json({ clusters });
  }
);

// List available clusters (not yet assigned to domain)
adminRouter.get(
  '/io.exprsn.admin.domains.clusters.available',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainClusters, renderClusters } = await import('../db/schema.js');

    // Get cluster IDs already assigned to this domain
    const assignedClusters = await db
      .select({ clusterId: domainClusters.clusterId })
      .from(domainClusters)
      .where(eq(domainClusters.domainId, domainId));

    const assignedIds = assignedClusters.map(c => c.clusterId);

    // Get all active clusters not assigned
    const availableClusters = await db
      .select({
        id: renderClusters.id,
        name: renderClusters.name,
        type: renderClusters.type,
        region: renderClusters.region,
        status: renderClusters.status,
        workerCount: renderClusters.workerCount,
        gpuEnabled: renderClusters.gpuEnabled,
      })
      .from(renderClusters)
      .where(
        and(
          eq(renderClusters.status, 'active'),
          assignedIds.length > 0 ? sql`${renderClusters.id} NOT IN (${sql.join(assignedIds.map(id => sql`${id}`), sql`,`)})` : sql`1=1`
        )
      );

    return c.json({ clusters: availableClusters });
  }
);

// Assign a cluster to a domain
adminRouter.post(
  '/io.exprsn.admin.domains.clusters.assign',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      clusterId: string;
      isPrimary?: boolean;
      priority?: number;
    }>();

    if (!body.domainId || !body.clusterId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainClusters, domains, renderClusters, domainActivityLog } = await import('../db/schema.js');

    // Verify domain exists
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Verify cluster exists
    const [cluster] = await db
      .select({ id: renderClusters.id })
      .from(renderClusters)
      .where(eq(renderClusters.id, body.clusterId))
      .limit(1);

    if (!cluster) {
      return c.json({ error: 'NotFound', message: 'Cluster not found' }, 404);
    }

    // Check if already assigned
    const [existing] = await db
      .select({ id: domainClusters.id })
      .from(domainClusters)
      .where(
        and(
          eq(domainClusters.domainId, body.domainId),
          eq(domainClusters.clusterId, body.clusterId)
        )
      )
      .limit(1);

    if (existing) {
      return c.json({ error: 'AlreadyExists', message: 'Cluster already assigned to domain' }, 409);
    }

    // If setting as primary, unset other primaries
    if (body.isPrimary) {
      await db
        .update(domainClusters)
        .set({ isPrimary: false })
        .where(eq(domainClusters.domainId, body.domainId));
    }

    const id = nanoid();
    await db.insert(domainClusters).values({
      id,
      domainId: body.domainId,
      clusterId: body.clusterId,
      isPrimary: body.isPrimary || false,
      priority: body.priority || 0,
    });

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'cluster_assigned',
      metadata: { clusterId: body.clusterId, isPrimary: body.isPrimary },
    });

    return c.json({ success: true, id });
  }
);

// Remove a cluster from a domain
adminRouter.post(
  '/io.exprsn.admin.domains.clusters.remove',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      clusterId: string;
    }>();

    if (!body.domainId || !body.clusterId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainClusters, domainActivityLog } = await import('../db/schema.js');

    await db
      .delete(domainClusters)
      .where(
        and(
          eq(domainClusters.domainId, body.domainId),
          eq(domainClusters.clusterId, body.clusterId)
        )
      );

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'cluster_removed',
      metadata: { clusterId: body.clusterId },
    });

    return c.json({ success: true });
  }
);

// Set primary cluster for a domain
adminRouter.post(
  '/io.exprsn.admin.domains.clusters.setPrimary',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      clusterId: string;
    }>();

    if (!body.domainId || !body.clusterId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainClusters } = await import('../db/schema.js');

    // Unset all primaries for this domain
    await db
      .update(domainClusters)
      .set({ isPrimary: false })
      .where(eq(domainClusters.domainId, body.domainId));

    // Set the specified cluster as primary
    await db
      .update(domainClusters)
      .set({ isPrimary: true })
      .where(
        and(
          eq(domainClusters.domainId, body.domainId),
          eq(domainClusters.clusterId, body.clusterId)
        )
      );

    return c.json({ success: true });
  }
);

// ============================================
// Domain Services (Platform Services) Routes
// ============================================

// List services for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.services.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainServices } = await import('../db/schema.js');

    const services = await db
      .select()
      .from(domainServices)
      .where(eq(domainServices.domainId, domainId));

    // Return all service types with their config (or default if not configured)
    const serviceTypes = ['pds', 'relay', 'appview', 'labeler'];
    const result = serviceTypes.map(type => {
      const existing = services.find(s => s.serviceType === type);
      return existing || {
        id: null,
        domainId,
        serviceType: type,
        enabled: false,
        endpoint: null,
        config: null,
        status: 'inactive',
        lastHealthCheck: null,
        errorMessage: null,
      };
    });

    return c.json({ services: result });
  }
);

// Configure a service for a domain
adminRouter.post(
  '/io.exprsn.admin.domains.services.configure',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      serviceType: 'pds' | 'relay' | 'appview' | 'labeler';
      enabled: boolean;
      endpoint?: string;
      config?: Record<string, unknown>;
    }>();

    if (!body.domainId || !body.serviceType) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainServices, domains, domainActivityLog } = await import('../db/schema.js');

    // Verify domain exists
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, body.domainId))
      .limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check if service already exists
    const [existing] = await db
      .select()
      .from(domainServices)
      .where(
        and(
          eq(domainServices.domainId, body.domainId),
          eq(domainServices.serviceType, body.serviceType)
        )
      )
      .limit(1);

    let serviceId: string;

    if (existing) {
      // Update existing
      await db
        .update(domainServices)
        .set({
          enabled: body.enabled,
          endpoint: body.endpoint,
          config: body.config as any,
          status: body.enabled ? 'starting' : 'inactive',
          updatedAt: new Date(),
        })
        .where(eq(domainServices.id, existing.id));
      serviceId = existing.id;
    } else {
      // Create new
      serviceId = nanoid();
      await db.insert(domainServices).values({
        id: serviceId,
        domainId: body.domainId,
        serviceType: body.serviceType,
        enabled: body.enabled,
        endpoint: body.endpoint,
        config: body.config as any,
        status: body.enabled ? 'starting' : 'inactive',
      });
    }

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'service_configured',
      metadata: {
        serviceType: body.serviceType,
        enabled: body.enabled,
        endpoint: body.endpoint,
      },
    });

    return c.json({ success: true, serviceId });
  }
);

// Get service health
adminRouter.get(
  '/io.exprsn.admin.domains.services.health',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const serviceType = c.req.query('serviceType');
    const skipCheck = c.req.query('skipCheck') === 'true';

    if (!domainId || !serviceType) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required parameters' }, 400);
    }

    const { domainServices } = await import('../db/schema.js');

    const [service] = await db
      .select()
      .from(domainServices)
      .where(
        and(
          eq(domainServices.domainId, domainId),
          eq(domainServices.serviceType, serviceType)
        )
      )
      .limit(1);

    if (!service) {
      return c.json({
        status: 'not_configured',
        enabled: false,
        lastHealthCheck: null,
        errorMessage: null,
      });
    }

    // Return cached status if skipCheck is true or service is disabled
    if (skipCheck || !service.enabled || !service.endpoint) {
      return c.json({
        status: service.status,
        enabled: service.enabled,
        endpoint: service.endpoint,
        lastHealthCheck: service.lastHealthCheck,
        errorMessage: service.errorMessage,
      });
    }

    // Perform actual health check
    const start = Date.now();
    let status: 'healthy' | 'degraded' | 'down' | 'error' = 'down';
    let responseTime: number | undefined;
    let statusCode: number | undefined;
    let errorMessage: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Determine health endpoint based on service type
      let healthEndpoint = service.endpoint;
      if (serviceType === 'pds') {
        healthEndpoint = `${service.endpoint}/xrpc/_health`;
      } else if (serviceType === 'api') {
        healthEndpoint = `${service.endpoint}/health`;
      } else if (serviceType === 'federation') {
        healthEndpoint = `${service.endpoint}/xrpc/com.atproto.server.describeServer`;
      }

      const response = await fetch(healthEndpoint, {
        signal: controller.signal,
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timeout);
      responseTime = Date.now() - start;
      statusCode = response.status;

      if (response.ok) {
        status = responseTime < 1000 ? 'healthy' : 'degraded';
      } else if (response.status < 500) {
        status = 'degraded';
      } else {
        status = 'down';
        errorMessage = `HTTP ${response.status}`;
      }
    } catch (error) {
      responseTime = Date.now() - start;
      status = 'error';
      errorMessage = error instanceof Error ? error.message : 'Health check failed';
    }

    // Update the service status in database
    await db
      .update(domainServices)
      .set({
        status,
        lastHealthCheck: new Date(),
        errorMessage: errorMessage || null,
        updatedAt: new Date(),
      })
      .where(eq(domainServices.id, service.id));

    return c.json({
      status,
      enabled: service.enabled,
      endpoint: service.endpoint,
      lastHealthCheck: new Date(),
      responseTime,
      statusCode,
      errorMessage,
    });
  }
);

// ============================================
// Domain Moderation
// ============================================

// List moderation queue for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.moderation.queue.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const status = c.req.query('status') || 'pending';
    const priority = c.req.query('priority');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainModerationQueue } = await import('../db/schema.js');

    const conditions = [eq(domainModerationQueue.domainId, domainId)];
    if (status) conditions.push(eq(domainModerationQueue.status, status));
    if (priority) conditions.push(eq(domainModerationQueue.priority, priority));

    const [items, countResult, stats] = await Promise.all([
      db
        .select()
        .from(domainModerationQueue)
        .where(and(...conditions))
        .orderBy(desc(domainModerationQueue.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(domainModerationQueue)
        .where(and(...conditions)),
      // Get stats by status
      db
        .select({
          status: domainModerationQueue.status,
          count: count(),
        })
        .from(domainModerationQueue)
        .where(eq(domainModerationQueue.domainId, domainId))
        .groupBy(domainModerationQueue.status),
    ]);

    const statsByStatus = {
      pending: 0,
      in_review: 0,
      escalated: 0,
      resolved: 0,
    };
    stats.forEach((s) => {
      if (s.status in statsByStatus) {
        statsByStatus[s.status as keyof typeof statsByStatus] = s.count;
      }
    });

    return c.json({
      items,
      total: countResult[0]?.total ?? 0,
      stats: statsByStatus,
    });
  }
);

// Claim a moderation queue item
adminRouter.post(
  '/io.exprsn.admin.domains.moderation.queue.claim',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ id: string }>();
    const adminDid = c.get('did');

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domainModerationQueue, domainActivityLog } = await import('../db/schema.js');

    // Get the item
    const [item] = await db
      .select()
      .from(domainModerationQueue)
      .where(eq(domainModerationQueue.id, body.id))
      .limit(1);

    if (!item) {
      return c.json({ error: 'NotFound', message: 'Queue item not found' }, 404);
    }

    if (item.status !== 'pending') {
      return c.json({ error: 'InvalidState', message: 'Item is not in pending status' }, 400);
    }

    // Claim the item
    await db
      .update(domainModerationQueue)
      .set({
        status: 'in_review',
        assignedTo: adminDid,
        updatedAt: new Date(),
      })
      .where(eq(domainModerationQueue.id, body.id));

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: item.domainId,
      actorDid: adminDid,
      action: 'moderation_claim',
      metadata: { queueItemId: body.id, contentType: item.contentType },
    });

    return c.json({ success: true });
  }
);

// Resolve a moderation queue item
adminRouter.post(
  '/io.exprsn.admin.domains.moderation.queue.resolve',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      resolution: 'approved' | 'removed' | 'warning' | 'ban';
      notes?: string;
    }>();
    const adminDid = c.get('did');

    if (!body.id || !body.resolution) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainModerationQueue, domainActivityLog } = await import('../db/schema.js');

    // Get the item
    const [item] = await db
      .select()
      .from(domainModerationQueue)
      .where(eq(domainModerationQueue.id, body.id))
      .limit(1);

    if (!item) {
      return c.json({ error: 'NotFound', message: 'Queue item not found' }, 404);
    }

    if (item.status === 'resolved') {
      return c.json({ error: 'InvalidState', message: 'Item is already resolved' }, 400);
    }

    // Resolve the item
    await db
      .update(domainModerationQueue)
      .set({
        status: 'resolved',
        resolution: body.resolution,
        resolvedBy: adminDid,
        resolvedAt: new Date(),
        notes: body.notes,
        updatedAt: new Date(),
      })
      .where(eq(domainModerationQueue.id, body.id));

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: item.domainId,
      actorDid: adminDid,
      action: 'moderation_resolve',
      metadata: {
        queueItemId: body.id,
        contentType: item.contentType,
        resolution: body.resolution,
      },
    });

    return c.json({ success: true });
  }
);

// Escalate a moderation queue item
adminRouter.post(
  '/io.exprsn.admin.domains.moderation.queue.escalate',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ id: string; notes?: string }>();
    const adminDid = c.get('did');

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domainModerationQueue, domainActivityLog } = await import('../db/schema.js');

    const [item] = await db
      .select()
      .from(domainModerationQueue)
      .where(eq(domainModerationQueue.id, body.id))
      .limit(1);

    if (!item) {
      return c.json({ error: 'NotFound', message: 'Queue item not found' }, 404);
    }

    await db
      .update(domainModerationQueue)
      .set({
        status: 'escalated',
        priority: 'critical',
        notes: body.notes ? `${item.notes || ''}\n[ESCALATED]: ${body.notes}` : item.notes,
        updatedAt: new Date(),
      })
      .where(eq(domainModerationQueue.id, body.id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: item.domainId,
      actorDid: adminDid,
      action: 'moderation_escalate',
      metadata: { queueItemId: body.id, contentType: item.contentType },
    });

    return c.json({ success: true });
  }
);

// ============================================
// Domain Banned Words
// ============================================

// List banned words for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.moderation.bannedWords.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const severity = c.req.query('severity');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainBannedWords } = await import('../db/schema.js');

    const conditions = [eq(domainBannedWords.domainId, domainId)];
    if (severity) conditions.push(eq(domainBannedWords.severity, severity));

    const words = await db
      .select()
      .from(domainBannedWords)
      .where(and(...conditions))
      .orderBy(domainBannedWords.word);

    return c.json({ words });
  }
);

// Add a banned word
adminRouter.post(
  '/io.exprsn.admin.domains.moderation.bannedWords.add',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      word: string;
      severity?: 'low' | 'medium' | 'high';
      action?: 'flag' | 'hide' | 'remove';
    }>();
    const adminDid = c.get('did');

    if (!body.domainId || !body.word) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainBannedWords, domainActivityLog } = await import('../db/schema.js');

    const id = nanoid();
    const normalizedWord = body.word.toLowerCase().trim();

    try {
      await db.insert(domainBannedWords).values({
        id,
        domainId: body.domainId,
        word: normalizedWord,
        severity: body.severity || 'medium',
        action: body.action || 'flag',
        createdBy: adminDid,
      });

      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: body.domainId,
        actorDid: adminDid,
        action: 'banned_word_add',
        metadata: { word: normalizedWord, severity: body.severity || 'medium' },
      });

      return c.json({ success: true, id });
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique violation
        return c.json({ error: 'AlreadyExists', message: 'Word already banned' }, 409);
      }
      throw error;
    }
  }
);

// Update a banned word
adminRouter.post(
  '/io.exprsn.admin.domains.moderation.bannedWords.update',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      severity?: 'low' | 'medium' | 'high';
      action?: 'flag' | 'hide' | 'remove';
      enabled?: boolean;
    }>();
    const adminDid = c.get('did');

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domainBannedWords, domainActivityLog } = await import('../db/schema.js');

    const [word] = await db
      .select()
      .from(domainBannedWords)
      .where(eq(domainBannedWords.id, body.id))
      .limit(1);

    if (!word) {
      return c.json({ error: 'NotFound', message: 'Banned word not found' }, 404);
    }

    const updates: any = {};
    if (body.severity !== undefined) updates.severity = body.severity;
    if (body.action !== undefined) updates.action = body.action;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    await db.update(domainBannedWords).set(updates).where(eq(domainBannedWords.id, body.id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: word.domainId,
      actorDid: adminDid,
      action: 'banned_word_update',
      metadata: { wordId: body.id, word: word.word, updates },
    });

    return c.json({ success: true });
  }
);

// Remove a banned word
adminRouter.delete(
  '/io.exprsn.admin.domains.moderation.bannedWords.remove',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const id = c.req.query('id');
    const adminDid = c.get('did');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domainBannedWords, domainActivityLog } = await import('../db/schema.js');

    const [word] = await db
      .select()
      .from(domainBannedWords)
      .where(eq(domainBannedWords.id, id))
      .limit(1);

    if (!word) {
      return c.json({ error: 'NotFound', message: 'Banned word not found' }, 404);
    }

    await db.delete(domainBannedWords).where(eq(domainBannedWords.id, id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: word.domainId,
      actorDid: adminDid,
      action: 'banned_word_remove',
      metadata: { word: word.word },
    });

    return c.json({ success: true });
  }
);

// ============================================
// Domain Banned Tags
// ============================================

// List banned tags for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.moderation.bannedTags.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const severity = c.req.query('severity');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainBannedTags } = await import('../db/schema.js');

    const conditions = [eq(domainBannedTags.domainId, domainId)];
    if (severity) conditions.push(eq(domainBannedTags.severity, severity));

    const tags = await db
      .select()
      .from(domainBannedTags)
      .where(and(...conditions))
      .orderBy(domainBannedTags.tag);

    return c.json({ tags });
  }
);

// Add a banned tag
adminRouter.post(
  '/io.exprsn.admin.domains.moderation.bannedTags.add',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      tag: string;
      severity?: 'low' | 'medium' | 'high';
      action?: 'flag' | 'hide' | 'remove';
    }>();
    const adminDid = c.get('did');

    if (!body.domainId || !body.tag) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainBannedTags, domainActivityLog } = await import('../db/schema.js');

    const id = nanoid();
    const normalizedTag = body.tag.toLowerCase().trim().replace(/^#/, '');

    try {
      await db.insert(domainBannedTags).values({
        id,
        domainId: body.domainId,
        tag: normalizedTag,
        severity: body.severity || 'medium',
        action: body.action || 'flag',
        createdBy: adminDid,
      });

      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: body.domainId,
        actorDid: adminDid,
        action: 'banned_tag_add',
        metadata: { tag: normalizedTag, severity: body.severity || 'medium' },
      });

      return c.json({ success: true, id });
    } catch (error: any) {
      if (error.code === '23505') {
        return c.json({ error: 'AlreadyExists', message: 'Tag already banned' }, 409);
      }
      throw error;
    }
  }
);

// Update a banned tag
adminRouter.post(
  '/io.exprsn.admin.domains.moderation.bannedTags.update',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      severity?: 'low' | 'medium' | 'high';
      action?: 'flag' | 'hide' | 'remove';
      enabled?: boolean;
    }>();
    const adminDid = c.get('did');

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domainBannedTags, domainActivityLog } = await import('../db/schema.js');

    const [tag] = await db
      .select()
      .from(domainBannedTags)
      .where(eq(domainBannedTags.id, body.id))
      .limit(1);

    if (!tag) {
      return c.json({ error: 'NotFound', message: 'Banned tag not found' }, 404);
    }

    const updates: any = {};
    if (body.severity !== undefined) updates.severity = body.severity;
    if (body.action !== undefined) updates.action = body.action;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    await db.update(domainBannedTags).set(updates).where(eq(domainBannedTags.id, body.id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: tag.domainId,
      actorDid: adminDid,
      action: 'banned_tag_update',
      metadata: { tagId: body.id, tag: tag.tag, updates },
    });

    return c.json({ success: true });
  }
);

// Remove a banned tag
adminRouter.delete(
  '/io.exprsn.admin.domains.moderation.bannedTags.remove',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const id = c.req.query('id');
    const adminDid = c.get('did');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domainBannedTags, domainActivityLog } = await import('../db/schema.js');

    const [tag] = await db
      .select()
      .from(domainBannedTags)
      .where(eq(domainBannedTags.id, id))
      .limit(1);

    if (!tag) {
      return c.json({ error: 'NotFound', message: 'Banned tag not found' }, 404);
    }

    await db.delete(domainBannedTags).where(eq(domainBannedTags.id, id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: tag.domainId,
      actorDid: adminDid,
      action: 'banned_tag_remove',
      metadata: { tag: tag.tag },
    });

    return c.json({ success: true });
  }
);

// ============================================
// Domain Identities (PLC)
// ============================================

// List identities for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.identities.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainIdentities } = await import('../db/schema.js');

    const conditions = [eq(domainIdentities.domainId, domainId)];
    if (status) conditions.push(eq(domainIdentities.status, status));

    const [identities, countResult] = await Promise.all([
      db
        .select()
        .from(domainIdentities)
        .where(and(...conditions))
        .orderBy(desc(domainIdentities.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(domainIdentities)
        .where(and(...conditions)),
    ]);

    return c.json({ identities, total: countResult[0]?.total ?? 0 });
  }
);

// Create a new identity
adminRouter.post(
  '/io.exprsn.admin.domains.identities.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      handle: string;
      pdsEndpoint?: string;
    }>();
    const adminDid = c.get('did');

    if (!body.domainId || !body.handle) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainIdentities, domains, domainActivityLog } = await import('../db/schema.js');

    // Get domain for handle suffix
    const [domain] = await db.select().from(domains).where(eq(domains.id, body.domainId)).limit(1);

    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const normalizedHandle = body.handle.toLowerCase().trim();
    const fullHandle = `${normalizedHandle}.${domain.domain}`;

    // Generate a DID (in production, this would involve PLC directory)
    const did = `did:plc:${nanoid(24)}`;
    const id = nanoid();

    try {
      await db.insert(domainIdentities).values({
        id,
        domainId: body.domainId,
        did,
        handle: fullHandle,
        pdsEndpoint: body.pdsEndpoint || domain.plcConfig?.defaultPdsEndpoint,
        status: 'active',
        createdBy: adminDid,
      });

      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: body.domainId,
        actorDid: adminDid,
        action: 'identity_create',
        metadata: { identityId: id, handle: fullHandle, did },
      });

      return c.json({ success: true, id, did, handle: fullHandle });
    } catch (error: any) {
      if (error.code === '23505') {
        return c.json({ error: 'AlreadyExists', message: 'Handle already exists' }, 409);
      }
      throw error;
    }
  }
);

// Update identity status
adminRouter.post(
  '/io.exprsn.admin.domains.identities.updateStatus',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      status: 'active' | 'deactivated' | 'tombstoned';
      reason?: string;
    }>();
    const adminDid = c.get('did');

    if (!body.id || !body.status) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainIdentities, domainActivityLog } = await import('../db/schema.js');

    const [identity] = await db
      .select()
      .from(domainIdentities)
      .where(eq(domainIdentities.id, body.id))
      .limit(1);

    if (!identity) {
      return c.json({ error: 'NotFound', message: 'Identity not found' }, 404);
    }

    const updates: any = {
      status: body.status,
      updatedAt: new Date(),
    };

    if (body.status === 'tombstoned') {
      updates.tombstonedAt = new Date();
      updates.tombstoneReason = body.reason;
    }

    await db.update(domainIdentities).set(updates).where(eq(domainIdentities.id, body.id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: identity.domainId,
      actorDid: adminDid,
      action: 'identity_status_update',
      metadata: { identityId: body.id, handle: identity.handle, status: body.status },
    });

    return c.json({ success: true });
  }
);

// Link identity to user
adminRouter.post(
  '/io.exprsn.admin.domains.identities.linkUser',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ identityId: string; userDid: string }>();
    const adminDid = c.get('did');

    if (!body.identityId || !body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainIdentities, domainActivityLog } = await import('../db/schema.js');

    const [identity] = await db
      .select()
      .from(domainIdentities)
      .where(eq(domainIdentities.id, body.identityId))
      .limit(1);

    if (!identity) {
      return c.json({ error: 'NotFound', message: 'Identity not found' }, 404);
    }

    await db
      .update(domainIdentities)
      .set({ userDid: body.userDid, updatedAt: new Date() })
      .where(eq(domainIdentities.id, body.identityId));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: identity.domainId,
      actorDid: adminDid,
      action: 'identity_link_user',
      metadata: { identityId: body.identityId, handle: identity.handle, linkedUserDid: body.userDid },
    });

    return c.json({ success: true });
  }
);

// ============================================
// Domain Handle Reservations
// ============================================

// List handle reservations for a domain
adminRouter.get(
  '/io.exprsn.admin.domains.handles.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const includeExpired = c.req.query('includeExpired') === 'true';
    const includeClaimed = c.req.query('includeClaimed') === 'true';

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainHandleReservations } = await import('../db/schema.js');

    const conditions = [eq(domainHandleReservations.domainId, domainId)];

    if (!includeExpired) {
      conditions.push(
        or(
          isNull(domainHandleReservations.expiresAt),
          gte(domainHandleReservations.expiresAt, new Date())
        )!
      );
    }

    if (!includeClaimed) {
      conditions.push(isNull(domainHandleReservations.claimedBy));
    }

    const reservations = await db
      .select()
      .from(domainHandleReservations)
      .where(and(...conditions))
      .orderBy(domainHandleReservations.handle);

    return c.json({ reservations });
  }
);

// Reserve a handle
adminRouter.post(
  '/io.exprsn.admin.domains.handles.reserve',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      handle: string;
      handleType?: 'user' | 'org';
      reason?: string;
      expiresAt?: string;
    }>();
    const adminDid = c.get('did');

    if (!body.domainId || !body.handle) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainHandleReservations, domainActivityLog } = await import('../db/schema.js');

    const id = nanoid();
    const normalizedHandle = body.handle.toLowerCase().trim();

    try {
      await db.insert(domainHandleReservations).values({
        id,
        domainId: body.domainId,
        handle: normalizedHandle,
        handleType: body.handleType || 'user',
        reason: body.reason,
        reservedBy: adminDid,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });

      await db.insert(domainActivityLog).values({
        id: nanoid(),
        domainId: body.domainId,
        actorDid: adminDid,
        action: 'handle_reserve',
        metadata: { handle: normalizedHandle, handleType: body.handleType || 'user' },
      });

      return c.json({ success: true, id });
    } catch (error: any) {
      if (error.code === '23505') {
        return c.json({ error: 'AlreadyExists', message: 'Handle already reserved' }, 409);
      }
      throw error;
    }
  }
);

// Release a handle reservation
adminRouter.delete(
  '/io.exprsn.admin.domains.handles.release',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const id = c.req.query('id');
    const adminDid = c.get('did');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const { domainHandleReservations, domainActivityLog } = await import('../db/schema.js');

    const [reservation] = await db
      .select()
      .from(domainHandleReservations)
      .where(eq(domainHandleReservations.id, id))
      .limit(1);

    if (!reservation) {
      return c.json({ error: 'NotFound', message: 'Handle reservation not found' }, 404);
    }

    if (reservation.claimedBy) {
      return c.json({ error: 'InvalidState', message: 'Handle has been claimed' }, 400);
    }

    await db.delete(domainHandleReservations).where(eq(domainHandleReservations.id, id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: reservation.domainId,
      actorDid: adminDid,
      action: 'handle_release',
      metadata: { handle: reservation.handle },
    });

    return c.json({ success: true });
  }
);

// Claim a reserved handle
adminRouter.post(
  '/io.exprsn.admin.domains.handles.claim',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const body = await c.req.json<{ id: string; claimedBy: string }>();
    const adminDid = c.get('did');

    if (!body.id || !body.claimedBy) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainHandleReservations, domainActivityLog } = await import('../db/schema.js');

    const [reservation] = await db
      .select()
      .from(domainHandleReservations)
      .where(eq(domainHandleReservations.id, body.id))
      .limit(1);

    if (!reservation) {
      return c.json({ error: 'NotFound', message: 'Handle reservation not found' }, 404);
    }

    if (reservation.claimedBy) {
      return c.json({ error: 'InvalidState', message: 'Handle already claimed' }, 400);
    }

    // Check if expired
    if (reservation.expiresAt && reservation.expiresAt < new Date()) {
      return c.json({ error: 'Expired', message: 'Handle reservation has expired' }, 400);
    }

    await db
      .update(domainHandleReservations)
      .set({ claimedBy: body.claimedBy, claimedAt: new Date() })
      .where(eq(domainHandleReservations.id, body.id));

    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: reservation.domainId,
      actorDid: adminDid,
      action: 'handle_claim',
      metadata: { handle: reservation.handle, claimedBy: body.claimedBy },
    });

    return c.json({ success: true });
  }
);

// ============================================
// Invite Codes Management
// ============================================

// Create invite code
adminRouter.post(
  '/io.exprsn.admin.inviteCodes.create',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const adminDid = c.get('did');
    const body = await c.req.json();

    const { inviteCodeService } = await import('../services/invites/InviteCodeService.js');

    try {
      const result = await inviteCodeService.createInviteCode({
        issuerDid: body.issuerDid || adminDid,
        domainId: body.domainId,
        maxUses: body.maxUses || 1,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        metadata: body.metadata,
        certificateId: body.certificateId,
      });

      return c.json({
        success: true,
        inviteCode: result,
      });
    } catch (error) {
      console.error('Failed to create invite code:', error);
      return c.json(
        {
          error: 'InviteCodeCreationFailed',
          message: error instanceof Error ? error.message : 'Failed to create invite code',
        },
        500
      );
    }
  }
);

// Batch create invite codes
adminRouter.post(
  '/io.exprsn.admin.inviteCodes.batchCreate',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const adminDid = c.get('did');
    const body = await c.req.json();

    if (!body.count || body.count < 1 || body.count > 100) {
      return c.json(
        {
          error: 'InvalidRequest',
          message: 'Count must be between 1 and 100',
        },
        400
      );
    }

    const { inviteCodeService } = await import('../services/invites/InviteCodeService.js');

    try {
      const result = await inviteCodeService.batchCreateInviteCodes({
        issuerDid: body.issuerDid || adminDid,
        domainId: body.domainId,
        count: body.count,
        maxUses: body.maxUses || 1,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        metadata: body.metadata,
        certificateId: body.certificateId,
      });

      return c.json({
        success: true,
        codes: result.codes,
        total: result.total,
      });
    } catch (error) {
      console.error('Failed to batch create invite codes:', error);
      return c.json(
        {
          error: 'BatchCreationFailed',
          message: error instanceof Error ? error.message : 'Failed to create invite codes',
        },
        500
      );
    }
  }
);

// List invite codes
adminRouter.get('/io.exprsn.admin.inviteCodes.list', async (c) => {
  const adminDid = c.get('did');
  const domainId = c.req.query('domainId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const { inviteCodeService } = await import('../services/invites/InviteCodeService.js');

  try {
    const result = await inviteCodeService.listInviteCodes({
      domainId,
      status,
      limit,
      offset,
    });

    return c.json({
      codes: result.codes,
      total: result.total,
      hasMore: result.codes.length === limit,
    });
  } catch (error) {
    console.error('Failed to list invite codes:', error);
    return c.json(
      {
        error: 'ListFailed',
        message: 'Failed to list invite codes',
      },
      500
    );
  }
});

// Get invite code details
adminRouter.get('/io.exprsn.admin.inviteCodes.get', async (c) => {
  const id = c.req.query('id');

  if (!id) {
    return c.json(
      {
        error: 'InvalidRequest',
        message: 'Missing invite code ID',
      },
      400
    );
  }

  const { inviteCodeService } = await import('../services/invites/InviteCodeService.js');

  const inviteCode = await inviteCodeService.getInviteCode(id);

  if (!inviteCode) {
    return c.json(
      {
        error: 'NotFound',
        message: 'Invite code not found',
      },
      404
    );
  }

  return c.json({ inviteCode });
});

// Revoke invite code
adminRouter.post(
  '/io.exprsn.admin.inviteCodes.revoke',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const adminDid = c.get('did');
    const body = await c.req.json();

    if (!body.id) {
      return c.json(
        {
          error: 'InvalidRequest',
          message: 'Missing invite code ID',
        },
        400
      );
    }

    const { inviteCodeService } = await import('../services/invites/InviteCodeService.js');

    try {
      await inviteCodeService.revokeInviteCode(
        body.id,
        adminDid,
        body.reason || 'Revoked by admin'
      );

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke invite code:', error);
      return c.json(
        {
          error: 'RevokeFailed',
          message: 'Failed to revoke invite code',
        },
        500
      );
    }
  }
);

// Get invite code statistics
adminRouter.get('/io.exprsn.admin.inviteCodes.stats', async (c) => {
  const domainId = c.req.query('domainId');

  const { inviteCodeService } = await import('../services/invites/InviteCodeService.js');

  try {
    const stats = await inviteCodeService.getInviteCodeStats({
      domainId: domainId || undefined,
    });

    return c.json({ stats });
  } catch (error) {
    console.error('Failed to get invite code stats:', error);
    return c.json(
      {
        error: 'StatsFailed',
        message: 'Failed to get invite code statistics',
      },
      500
    );
  }
});
