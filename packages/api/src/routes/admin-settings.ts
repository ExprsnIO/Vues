/**
 * Admin Settings Routes
 * Comprehensive administration settings for auth, CA, and moderation
 */

import { Hono } from 'hono';
import { eq, and, desc, lt, gt, count, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  adminUsers,
  adminAuditLog,
  adminPermissionAudit,
  adminSessions,
  sessions,
  caConfig,
  caRootCertificates,
  caIntermediateCertificates,
  caEntityCertificates,
  caCertificateRevocationLists,
  moderationConfig,
  moderationAiAgents,
  moderationBannedWords,
  moderationBannedTags,
  moderationItems,
  moderationAppeals,
  moderationUserActions,
  authConfig,
  users,
  type AdminUser,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  superAdminMiddleware,
  ADMIN_PERMISSIONS,
  getAdminPermissions,
  ROLE_PERMISSIONS,
} from '../auth/middleware.js';

export const adminSettingsRouter = new Hono();

// Apply admin auth to all routes
adminSettingsRouter.use('*', adminAuthMiddleware);

// ============================================
// Helper Functions
// ============================================

async function logAudit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  c: { req: { header: (name: string) => string | undefined } }
) {
  await db.insert(adminAuditLog).values({
    id: nanoid(),
    adminId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    userAgent: c.req.header('user-agent'),
  });
}

// ============================================
// AUTH SETTINGS
// ============================================

/**
 * Get auth configuration
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.auth.getConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    let config = await db.query.authConfig.findFirst({
      where: eq(authConfig.id, 'default'),
    });

    if (!config) {
      // Return defaults if no config exists
      config = {
        id: 'default',
        sessionDurationHours: 24,
        adminSessionDurationHours: 8,
        maxConcurrentSessions: 5,
        maxConcurrentAdminSessions: 3,
        accessTokenExpiryMinutes: 60,
        refreshTokenExpiryDays: 30,
        // Token type settings
        localTokensEnabled: true,
        oauthTokensEnabled: true,
        apiKeysEnabled: false,
        serviceTokensEnabled: true,
        // Security settings
        requireMfaForAdmins: false,
        allowedMfaMethods: ['totp', 'webauthn'],
        passwordMinLength: 12,
        passwordRequireUppercase: true,
        passwordRequireNumbers: true,
        passwordRequireSymbols: false,
        // Rate limiting - login
        maxLoginAttempts: 5,
        lockoutDurationMinutes: 15,
        // Rate limiting - API
        userRateLimitPerMinute: 60,
        adminRateLimitPerMinute: 120,
        anonymousRateLimitPerMinute: 30,
        userBurstLimit: 20,
        adminBurstLimit: 50,
        // Rate limiting - did:exprsn tier
        exprsnRateLimitPerMinute: 90,
        exprsnBurstLimit: 35,
        // OAuth settings
        oauthEnabled: true,
        allowedOauthProviders: ['atproto'],
        allowedOauthScopes: ['atproto', 'openid', 'profile', 'read', 'write'],
        defaultOauthScopes: ['atproto'],
        updatedBy: null,
        updatedAt: new Date(),
      };
    }

    return c.json(config);
  }
);

/**
 * Update auth configuration
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.auth.updateConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<Partial<typeof authConfig.$inferInsert>>();

    const updates = {
      ...body,
      id: 'default',
      updatedBy: adminUser.userDid,
      updatedAt: new Date(),
    };

    await db
      .insert(authConfig)
      .values(updates)
      .onConflictDoUpdate({
        target: authConfig.id,
        set: updates,
      });

    await logAudit(adminUser.id, 'auth_config_updated', 'auth_config', 'default', { changes: body }, c);

    const config = await db.query.authConfig.findFirst({
      where: eq(authConfig.id, 'default'),
    });

    return c.json(config);
  }
);

/**
 * List active admin sessions
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.auth.listAdminSessions',
  requirePermission(ADMIN_PERMISSIONS.ADMINS_MANAGE),
  async (c) => {
    const adminId = c.req.query('adminId');
    const includeExpired = c.req.query('includeExpired') === 'true';
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db
      .select({
        session: adminSessions,
        admin: {
          id: adminUsers.id,
          userDid: adminUsers.userDid,
          role: adminUsers.role,
        },
        user: {
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(adminSessions)
      .leftJoin(adminUsers, eq(adminSessions.adminId, adminUsers.id))
      .leftJoin(users, eq(adminUsers.userDid, users.did));

    const conditions = [];
    if (adminId) {
      conditions.push(eq(adminSessions.adminId, adminId));
    }
    if (!includeExpired) {
      conditions.push(gt(adminSessions.expiresAt, new Date()));
      conditions.push(sql`${adminSessions.revokedAt} IS NULL`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query
      .orderBy(desc(adminSessions.lastActivityAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      sessions: results.map(({ session, admin, user }) => ({
        id: session.id,
        adminId: session.adminId,
        admin: admin
          ? {
              id: admin.id,
              userDid: admin.userDid,
              role: admin.role,
              handle: user?.handle,
              displayName: user?.displayName,
              avatar: user?.avatar,
            }
          : null,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        deviceInfo: session.deviceInfo,
        lastActivityAt: session.lastActivityAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString(),
        revokedReason: session.revokedReason,
        createdAt: session.createdAt.toISOString(),
      })),
    });
  }
);

/**
 * Revoke an admin session
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.auth.revokeSession',
  requirePermission(ADMIN_PERMISSIONS.ADMINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { sessionId, reason } = await c.req.json<{ sessionId: string; reason?: string }>();

    if (!sessionId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing sessionId' }, 400);
    }

    const [session] = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json({ error: 'NotFound', message: 'Session not found' }, 404);
    }

    if (session.revokedAt) {
      return c.json({ error: 'AlreadyRevoked', message: 'Session already revoked' }, 400);
    }

    await db
      .update(adminSessions)
      .set({
        revokedAt: new Date(),
        revokedReason: reason || 'Revoked by admin',
      })
      .where(eq(adminSessions.id, sessionId));

    await logAudit(adminUser.id, 'admin_session_revoked', 'admin_session', sessionId, { reason }, c);

    return c.json({ success: true });
  }
);

/**
 * Revoke all sessions for an admin
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.auth.revokeAllSessions',
  requirePermission(ADMIN_PERMISSIONS.ADMINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { targetAdminId, reason } = await c.req.json<{ targetAdminId: string; reason?: string }>();

    if (!targetAdminId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing targetAdminId' }, 400);
    }

    const result = await db
      .update(adminSessions)
      .set({
        revokedAt: new Date(),
        revokedReason: reason || 'All sessions revoked by admin',
      })
      .where(
        and(
          eq(adminSessions.adminId, targetAdminId),
          sql`${adminSessions.revokedAt} IS NULL`
        )
      );

    await logAudit(adminUser.id, 'admin_sessions_revoked_all', 'admin', targetAdminId, { reason }, c);

    return c.json({ success: true });
  }
);

/**
 * List user sessions (not admin-specific)
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.auth.listUserSessions',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const userDid = c.req.query('userDid');
    const includeExpired = c.req.query('includeExpired') === 'true';
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db
      .select({
        session: sessions,
        user: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
        },
      })
      .from(sessions)
      .leftJoin(users, eq(sessions.did, users.did));

    const conditions = [];
    if (userDid) {
      conditions.push(eq(sessions.did, userDid));
    }
    if (!includeExpired) {
      conditions.push(gt(sessions.expiresAt, new Date()));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query.orderBy(desc(sessions.createdAt)).limit(limit).offset(offset);

    return c.json({
      sessions: results.map(({ session, user }) => ({
        id: session.id,
        did: session.did,
        user: user
          ? {
              handle: user.handle,
              displayName: user.displayName,
            }
          : null,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      })),
    });
  }
);

/**
 * Invalidate user sessions
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.auth.invalidateUserSessions',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { userDid, reason } = await c.req.json<{ userDid: string; reason?: string }>();

    if (!userDid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing userDid' }, 400);
    }

    // Delete all sessions for this user
    await db.delete(sessions).where(eq(sessions.did, userDid));

    await logAudit(adminUser.id, 'user_sessions_invalidated', 'user', userDid, { reason }, c);

    return c.json({ success: true });
  }
);

/**
 * Cleanup expired sessions
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.auth.cleanupExpiredSessions',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const now = new Date();

    // Cleanup user sessions
    const userSessionsDeleted = await db.delete(sessions).where(lt(sessions.expiresAt, now));

    // Cleanup admin sessions (mark as expired but don't delete for audit)
    const adminSessionsCount = await db
      .select({ count: count() })
      .from(adminSessions)
      .where(and(lt(adminSessions.expiresAt, now), sql`${adminSessions.revokedAt} IS NULL`));

    await db
      .update(adminSessions)
      .set({
        revokedAt: now,
        revokedReason: 'Expired - cleanup',
      })
      .where(and(lt(adminSessions.expiresAt, now), sql`${adminSessions.revokedAt} IS NULL`));

    await logAudit(adminUser.id, 'sessions_cleanup', 'system', null, {
      adminSessionsCleaned: adminSessionsCount[0]?.count || 0,
    }, c);

    return c.json({
      success: true,
      adminSessionsCleaned: adminSessionsCount[0]?.count || 0,
    });
  }
);

// ============================================
// ADMIN PERMISSION MANAGEMENT
// ============================================

/**
 * Get permission audit log
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.auth.getPermissionAudit',
  requirePermission(ADMIN_PERMISSIONS.ADMINS_MANAGE),
  async (c) => {
    const targetAdminId = c.req.query('targetAdminId');
    const performedBy = c.req.query('performedBy');
    const action = c.req.query('action');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db
      .select({
        audit: adminPermissionAudit,
        targetAdmin: {
          id: adminUsers.id,
          userDid: adminUsers.userDid,
          role: adminUsers.role,
        },
      })
      .from(adminPermissionAudit)
      .leftJoin(adminUsers, eq(adminPermissionAudit.targetAdminId, adminUsers.id));

    const conditions = [];
    if (targetAdminId) {
      conditions.push(eq(adminPermissionAudit.targetAdminId, targetAdminId));
    }
    if (performedBy) {
      conditions.push(eq(adminPermissionAudit.performedBy, performedBy));
    }
    if (action) {
      conditions.push(eq(adminPermissionAudit.action, action));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query
      .orderBy(desc(adminPermissionAudit.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      entries: results.map(({ audit, targetAdmin }) => ({
        id: audit.id,
        targetAdminId: audit.targetAdminId,
        targetAdmin: targetAdmin
          ? {
              id: targetAdmin.id,
              userDid: targetAdmin.userDid,
              role: targetAdmin.role,
            }
          : null,
        performedBy: audit.performedBy,
        action: audit.action,
        previousRole: audit.previousRole,
        newRole: audit.newRole,
        previousPermissions: audit.previousPermissions,
        newPermissions: audit.newPermissions,
        reason: audit.reason,
        ipAddress: audit.ipAddress,
        createdAt: audit.createdAt.toISOString(),
      })),
    });
  }
);

/**
 * Update admin role with audit
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.auth.updateAdminRole',
  superAdminMiddleware,
  async (c) => {
    const adminUser = c.get('adminUser');
    const { targetAdminId, newRole, reason } = await c.req.json<{
      targetAdminId: string;
      newRole: string;
      reason?: string;
    }>();

    if (!targetAdminId || !newRole) {
      return c.json({ error: 'InvalidRequest', message: 'Missing targetAdminId or newRole' }, 400);
    }

    const validRoles = ['super_admin', 'admin', 'moderator', 'support'];
    if (!validRoles.includes(newRole)) {
      return c.json({ error: 'InvalidRole', message: 'Invalid role' }, 400);
    }

    const [targetAdmin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, targetAdminId))
      .limit(1);

    if (!targetAdmin) {
      return c.json({ error: 'NotFound', message: 'Admin not found' }, 404);
    }

    if (targetAdmin.id === adminUser.id) {
      return c.json({ error: 'InvalidRequest', message: 'Cannot change own role' }, 400);
    }

    const previousRole = targetAdmin.role;

    // Update role
    await db.update(adminUsers).set({ role: newRole, updatedAt: new Date() }).where(eq(adminUsers.id, targetAdminId));

    // Log permission audit
    await db.insert(adminPermissionAudit).values({
      id: nanoid(),
      targetAdminId,
      performedBy: adminUser.id,
      action: 'role_change',
      previousRole,
      newRole,
      reason,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    await logAudit(adminUser.id, 'admin_role_changed', 'admin', targetAdminId, {
      previousRole,
      newRole,
      reason,
    }, c);

    return c.json({ success: true, previousRole, newRole });
  }
);

/**
 * Update admin permissions with audit
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.auth.updateAdminPermissions',
  superAdminMiddleware,
  async (c) => {
    const adminUser = c.get('adminUser');
    const { targetAdminId, permissions, reason } = await c.req.json<{
      targetAdminId: string;
      permissions: string[];
      reason?: string;
    }>();

    if (!targetAdminId || !permissions) {
      return c.json({ error: 'InvalidRequest', message: 'Missing targetAdminId or permissions' }, 400);
    }

    const [targetAdmin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, targetAdminId))
      .limit(1);

    if (!targetAdmin) {
      return c.json({ error: 'NotFound', message: 'Admin not found' }, 404);
    }

    const previousPermissions = targetAdmin.permissions || [];

    // Update permissions
    await db
      .update(adminUsers)
      .set({ permissions, updatedAt: new Date() })
      .where(eq(adminUsers.id, targetAdminId));

    // Log permission audit
    await db.insert(adminPermissionAudit).values({
      id: nanoid(),
      targetAdminId,
      performedBy: adminUser.id,
      action: 'grant',
      previousPermissions,
      newPermissions: permissions,
      reason,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    await logAudit(adminUser.id, 'admin_permissions_updated', 'admin', targetAdminId, {
      previousPermissions,
      newPermissions: permissions,
      reason,
    }, c);

    return c.json({ success: true, previousPermissions, newPermissions: permissions });
  }
);

/**
 * Get available permissions and roles
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.auth.getAvailablePermissions',
  requirePermission(ADMIN_PERMISSIONS.ADMINS_MANAGE),
  async (c) => {
    return c.json({
      permissions: Object.entries(ADMIN_PERMISSIONS).map(([key, value]) => ({
        key,
        value,
        description: getPermissionDescription(value),
      })),
      roles: Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({
        role,
        permissions,
      })),
    });
  }
);

function getPermissionDescription(permission: string): string {
  const descriptions: Record<string, string> = {
    'users:view': 'View user profiles and information',
    'users:edit': 'Edit user profiles and settings',
    'users:sanction': 'Apply sanctions (warn, mute, suspend)',
    'users:ban': 'Ban users permanently',
    'content:view': 'View content moderation queue',
    'content:moderate': 'Take moderation actions on content',
    'reports:view': 'View user reports',
    'reports:action': 'Take action on reports',
    'featured:manage': 'Manage featured content',
    'analytics:view': 'View platform analytics',
    'config:view': 'View system configuration',
    'config:edit': 'Edit system configuration',
    'admins:manage': 'Manage admin users and permissions',
  };
  return descriptions[permission] || permission;
}

// ============================================
// CA SETTINGS
// ============================================

/**
 * Get CA configuration
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.ca.getConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    let config = await db.query.caConfig.findFirst({
      where: eq(caConfig.id, 'default'),
    });

    if (!config) {
      config = {
        id: 'default',
        rootCertValidityDays: 7300,
        intermediateCertValidityDays: 3650,
        entityCertValidityDays: 365,
        defaultKeySize: 4096,
        defaultHashAlgorithm: 'SHA-256',
        crlAutoGenerate: true,
        crlGenerationIntervalHours: 24,
        crlValidityHours: 168,
        lastCrlGeneratedAt: null,
        renewalReminderDays: 30,
        autoRenewalEnabled: false,
        maxCertsPerUserPerDay: 5,
        maxServiceCertsPerDay: 50,
        ocspEnabled: false,
        ocspResponderUrl: null,
        updatedBy: null,
        updatedAt: new Date(),
      };
    }

    return c.json(config);
  }
);

/**
 * Update CA configuration
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.ca.updateConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<Partial<typeof caConfig.$inferInsert>>();

    const updates = {
      ...body,
      id: 'default',
      updatedBy: adminUser.userDid,
      updatedAt: new Date(),
    };

    await db
      .insert(caConfig)
      .values(updates)
      .onConflictDoUpdate({
        target: caConfig.id,
        set: updates,
      });

    await logAudit(adminUser.id, 'ca_config_updated', 'ca_config', 'default', { changes: body }, c);

    const config = await db.query.caConfig.findFirst({
      where: eq(caConfig.id, 'default'),
    });

    return c.json(config);
  }
);

/**
 * Get CA statistics
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.ca.getStats',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Root certificates
    const [rootStats] = await db
      .select({
        total: count(),
        active: sql<number>`COUNT(*) FILTER (WHERE ${caRootCertificates.status} = 'active')`,
        revoked: sql<number>`COUNT(*) FILTER (WHERE ${caRootCertificates.status} = 'revoked')`,
        expired: sql<number>`COUNT(*) FILTER (WHERE ${caRootCertificates.status} = 'expired')`,
      })
      .from(caRootCertificates);

    // Intermediate certificates
    const [intermediateStats] = await db
      .select({
        total: count(),
        active: sql<number>`COUNT(*) FILTER (WHERE ${caIntermediateCertificates.status} = 'active')`,
        revoked: sql<number>`COUNT(*) FILTER (WHERE ${caIntermediateCertificates.status} = 'revoked')`,
        expired: sql<number>`COUNT(*) FILTER (WHERE ${caIntermediateCertificates.status} = 'expired')`,
      })
      .from(caIntermediateCertificates);

    // Entity certificates
    const [entityStats] = await db
      .select({
        total: count(),
        active: sql<number>`COUNT(*) FILTER (WHERE ${caEntityCertificates.status} = 'active')`,
        revoked: sql<number>`COUNT(*) FILTER (WHERE ${caEntityCertificates.status} = 'revoked')`,
        expired: sql<number>`COUNT(*) FILTER (WHERE ${caEntityCertificates.status} = 'expired')`,
        client: sql<number>`COUNT(*) FILTER (WHERE ${caEntityCertificates.certType} = 'client')`,
        server: sql<number>`COUNT(*) FILTER (WHERE ${caEntityCertificates.certType} = 'server')`,
        codeSigning: sql<number>`COUNT(*) FILTER (WHERE ${caEntityCertificates.certType} = 'code_signing')`,
      })
      .from(caEntityCertificates);

    // Expiring soon (within 30 days)
    const [expiringSoon] = await db
      .select({ count: count() })
      .from(caEntityCertificates)
      .where(
        and(
          eq(caEntityCertificates.status, 'active'),
          lt(caEntityCertificates.notAfter, thirtyDaysFromNow),
          gt(caEntityCertificates.notAfter, now)
        )
      );

    // CRL info
    const [latestCrl] = await db
      .select()
      .from(caCertificateRevocationLists)
      .orderBy(desc(caCertificateRevocationLists.createdAt))
      .limit(1);

    return c.json({
      root: {
        total: rootStats?.total || 0,
        active: Number(rootStats?.active) || 0,
        revoked: Number(rootStats?.revoked) || 0,
        expired: Number(rootStats?.expired) || 0,
      },
      intermediate: {
        total: intermediateStats?.total || 0,
        active: Number(intermediateStats?.active) || 0,
        revoked: Number(intermediateStats?.revoked) || 0,
        expired: Number(intermediateStats?.expired) || 0,
      },
      entity: {
        total: entityStats?.total || 0,
        active: Number(entityStats?.active) || 0,
        revoked: Number(entityStats?.revoked) || 0,
        expired: Number(entityStats?.expired) || 0,
        byType: {
          client: Number(entityStats?.client) || 0,
          server: Number(entityStats?.server) || 0,
          codeSigning: Number(entityStats?.codeSigning) || 0,
        },
      },
      expiringSoon: expiringSoon?.count || 0,
      crl: latestCrl
        ? {
            lastGenerated: latestCrl.createdAt.toISOString(),
            nextUpdate: latestCrl.nextUpdate.toISOString(),
          }
        : null,
    });
  }
);

/**
 * Get certificates expiring soon
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.ca.getExpiringCertificates',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const days = parseInt(c.req.query('days') || '30', 10);
    const limit = parseInt(c.req.query('limit') || '50', 10);

    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const results = await db
      .select({
        cert: caEntityCertificates,
        user: {
          handle: users.handle,
          displayName: users.displayName,
        },
      })
      .from(caEntityCertificates)
      .leftJoin(users, eq(caEntityCertificates.subjectDid, users.did))
      .where(
        and(
          eq(caEntityCertificates.status, 'active'),
          lt(caEntityCertificates.notAfter, futureDate),
          gt(caEntityCertificates.notAfter, now)
        )
      )
      .orderBy(caEntityCertificates.notAfter)
      .limit(limit);

    return c.json({
      certificates: results.map(({ cert, user }) => ({
        id: cert.id,
        commonName: cert.commonName,
        certType: cert.certType,
        subjectDid: cert.subjectDid,
        serviceId: cert.serviceId,
        user: user
          ? {
              handle: user.handle,
              displayName: user.displayName,
            }
          : null,
        notAfter: cert.notAfter.toISOString(),
        daysUntilExpiry: Math.ceil((cert.notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      })),
    });
  }
);

// ============================================
// MODERATION SETTINGS
// ============================================

/**
 * Get moderation configuration
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.moderation.getConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    let config = await db.query.moderationConfig.findFirst({
      where: eq(moderationConfig.id, 'default'),
    });

    if (!config) {
      config = {
        id: 'default',
        autoApproveThreshold: 20,
        autoRejectThreshold: 80,
        requireReviewThreshold: 50,
        toxicityWeight: 100,
        nsfwWeight: 100,
        spamWeight: 80,
        violenceWeight: 100,
        hateSpeechWeight: 100,
        primaryAiProvider: 'claude',
        fallbackAiProvider: null,
        aiTimeoutMs: 30000,
        aiRetryAttempts: 2,
        maxQueueSize: 10000,
        escalationThresholdHours: 24,
        autoAssignEnabled: false,
        appealWindowDays: 30,
        maxAppealsPerUser: 3,
        appealCooldownDays: 7,
        defaultWarnExpiryDays: 90,
        defaultSuspensionDays: 7,
        notifyOnHighRisk: true,
        notifyOnAppeal: true,
        notifyOnEscalation: true,
        updatedBy: null,
        updatedAt: new Date(),
      };
    }

    return c.json(config);
  }
);

/**
 * Update moderation configuration
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.updateConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<Partial<typeof moderationConfig.$inferInsert>>();

    const updates = {
      ...body,
      id: 'default',
      updatedBy: adminUser.userDid,
      updatedAt: new Date(),
    };

    await db
      .insert(moderationConfig)
      .values(updates)
      .onConflictDoUpdate({
        target: moderationConfig.id,
        set: updates,
      });

    await logAudit(adminUser.id, 'moderation_config_updated', 'moderation_config', 'default', { changes: body }, c);

    const config = await db.query.moderationConfig.findFirst({
      where: eq(moderationConfig.id, 'default'),
    });

    return c.json(config);
  }
);

/**
 * List AI agents
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.moderation.listAgents',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const provider = c.req.query('provider');

    let query = db.select().from(moderationAiAgents);

    const conditions = [];
    if (status) {
      conditions.push(eq(moderationAiAgents.status, status));
    }
    if (provider) {
      conditions.push(eq(moderationAiAgents.provider, provider));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query.orderBy(desc(moderationAiAgents.priority));

    return c.json({
      agents: results.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        type: agent.type,
        status: agent.status,
        provider: agent.provider,
        model: agent.model,
        enabled: agent.enabled,
        autoAction: agent.autoAction,
        priority: agent.priority,
        appliesTo: agent.appliesTo,
        thresholdScores: agent.thresholdScores,
        performance: {
          totalExecutions: agent.totalExecutions,
          successfulExecutions: agent.successfulExecutions,
          failedExecutions: agent.failedExecutions,
          avgExecutionTimeMs: agent.avgExecutionTimeMs,
          lastExecutionAt: agent.lastExecutionAt?.toISOString(),
          lastError: agent.lastError,
          lastErrorAt: agent.lastErrorAt?.toISOString(),
        },
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      })),
    });
  }
);

/**
 * Create or update AI agent
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.upsertAgent',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      id?: string;
      name: string;
      description?: string;
      type: string;
      provider: string;
      model?: string;
      promptTemplate?: string;
      config?: Record<string, unknown>;
      thresholdScores?: Record<string, number>;
      appliesTo?: string[];
      priority?: number;
      enabled?: boolean;
      autoAction?: boolean;
    }>();

    if (!body.name || !body.type || !body.provider) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const id = body.id || nanoid();
    const isUpdate = !!body.id;

    const values = {
      id,
      name: body.name,
      description: body.description,
      type: body.type,
      provider: body.provider,
      model: body.model,
      promptTemplate: body.promptTemplate,
      config: body.config || {},
      thresholdScores: body.thresholdScores || {},
      appliesTo: body.appliesTo || [],
      priority: body.priority || 0,
      enabled: body.enabled ?? true,
      autoAction: body.autoAction ?? false,
      createdBy: adminUser.userDid,
      updatedAt: new Date(),
    };

    await db
      .insert(moderationAiAgents)
      .values(values)
      .onConflictDoUpdate({
        target: moderationAiAgents.id,
        set: {
          ...values,
          createdBy: undefined, // Don't update createdBy on update
        },
      });

    await logAudit(adminUser.id, isUpdate ? 'ai_agent_updated' : 'ai_agent_created', 'ai_agent', id, { agent: body }, c);

    const [agent] = await db.select().from(moderationAiAgents).where(eq(moderationAiAgents.id, id)).limit(1);

    return c.json(agent);
  }
);

/**
 * Delete AI agent
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.deleteAgent',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db.delete(moderationAiAgents).where(eq(moderationAiAgents.id, id));

    await logAudit(adminUser.id, 'ai_agent_deleted', 'ai_agent', id, {}, c);

    return c.json({ success: true });
  }
);

/**
 * List banned words
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.moderation.listBannedWords',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const category = c.req.query('category');
    const enabled = c.req.query('enabled');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db.select().from(moderationBannedWords);

    const conditions = [];
    if (category) {
      conditions.push(eq(moderationBannedWords.category, category));
    }
    if (enabled !== undefined) {
      conditions.push(eq(moderationBannedWords.enabled, enabled === 'true'));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query.orderBy(moderationBannedWords.word).limit(limit).offset(offset);

    const [countResult] = await db.select({ count: count() }).from(moderationBannedWords);

    return c.json({
      words: results,
      total: countResult?.count || 0,
    });
  }
);

/**
 * Add banned word
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.addBannedWord',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      word: string;
      category: string;
      severity?: string;
      action?: string;
    }>();

    if (!body.word || !body.category) {
      return c.json({ error: 'InvalidRequest', message: 'Missing word or category' }, 400);
    }

    const id = nanoid();

    try {
      await db.insert(moderationBannedWords).values({
        id,
        word: body.word.toLowerCase().trim(),
        category: body.category,
        severity: body.severity || 'medium',
        action: body.action || 'flag',
        enabled: true,
        createdBy: adminUser.userDid,
      });

      await logAudit(adminUser.id, 'banned_word_added', 'banned_word', id, { word: body.word }, c);

      return c.json({ success: true, id });
    } catch (error) {
      if ((error as Error).message.includes('unique')) {
        return c.json({ error: 'Duplicate', message: 'Word already exists' }, 400);
      }
      throw error;
    }
  }
);

/**
 * Update banned word
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.updateBannedWord',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      id: string;
      category?: string;
      severity?: string;
      action?: string;
      enabled?: boolean;
    }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const updates: Record<string, unknown> = {};
    if (body.category !== undefined) updates.category = body.category;
    if (body.severity !== undefined) updates.severity = body.severity;
    if (body.action !== undefined) updates.action = body.action;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    await db.update(moderationBannedWords).set(updates).where(eq(moderationBannedWords.id, body.id));

    await logAudit(adminUser.id, 'banned_word_updated', 'banned_word', body.id, updates, c);

    return c.json({ success: true });
  }
);

/**
 * Delete banned word
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.deleteBannedWord',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db.delete(moderationBannedWords).where(eq(moderationBannedWords.id, id));

    await logAudit(adminUser.id, 'banned_word_deleted', 'banned_word', id, {}, c);

    return c.json({ success: true });
  }
);

/**
 * Bulk import banned words
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.bulkImportBannedWords',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      words: Array<{
        word: string;
        category: string;
        severity?: string;
        action?: string;
      }>;
    }>();

    if (!body.words || !Array.isArray(body.words)) {
      return c.json({ error: 'InvalidRequest', message: 'Missing words array' }, 400);
    }

    let imported = 0;
    let skipped = 0;

    for (const wordItem of body.words) {
      try {
        await db.insert(moderationBannedWords).values({
          id: nanoid(),
          word: wordItem.word.toLowerCase().trim(),
          category: wordItem.category,
          severity: wordItem.severity || 'medium',
          action: wordItem.action || 'flag',
          enabled: true,
          createdBy: adminUser.userDid,
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    await logAudit(adminUser.id, 'banned_words_bulk_import', 'banned_words', null, { imported, skipped }, c);

    return c.json({ imported, skipped });
  }
);

/**
 * List banned tags
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.moderation.listBannedTags',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const enabled = c.req.query('enabled');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db.select().from(moderationBannedTags);

    if (enabled !== undefined) {
      query = query.where(eq(moderationBannedTags.enabled, enabled === 'true')) as typeof query;
    }

    const results = await query.orderBy(moderationBannedTags.tag).limit(limit).offset(offset);

    return c.json({ tags: results });
  }
);

/**
 * Add banned tag
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.addBannedTag',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      tag: string;
      reason?: string;
      action?: string;
    }>();

    if (!body.tag) {
      return c.json({ error: 'InvalidRequest', message: 'Missing tag' }, 400);
    }

    const id = nanoid();
    const normalizedTag = body.tag.toLowerCase().replace(/^#/, '').trim();

    try {
      await db.insert(moderationBannedTags).values({
        id,
        tag: normalizedTag,
        reason: body.reason,
        action: body.action || 'flag',
        enabled: true,
        createdBy: adminUser.userDid,
      });

      await logAudit(adminUser.id, 'banned_tag_added', 'banned_tag', id, { tag: normalizedTag }, c);

      return c.json({ success: true, id });
    } catch (error) {
      if ((error as Error).message.includes('unique')) {
        return c.json({ error: 'Duplicate', message: 'Tag already exists' }, 400);
      }
      throw error;
    }
  }
);

/**
 * Delete banned tag
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.deleteBannedTag',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db.delete(moderationBannedTags).where(eq(moderationBannedTags.id, id));

    await logAudit(adminUser.id, 'banned_tag_deleted', 'banned_tag', id, {}, c);

    return c.json({ success: true });
  }
);

// ============================================
// BULK MODERATION OPERATIONS
// ============================================

/**
 * Bulk approve content
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.bulkApprove',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { itemIds, reason } = await c.req.json<{ itemIds: string[]; reason?: string }>();

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'Missing or empty itemIds array' }, 400);
    }

    if (itemIds.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 items per bulk operation' }, 400);
    }

    await db
      .update(moderationItems)
      .set({
        status: 'approved',
        action: 'approve',
        reviewedBy: adminUser.userDid,
        reviewedAt: new Date(),
        reviewNotes: reason,
      })
      .where(inArray(moderationItems.id, itemIds));

    await logAudit(adminUser.id, 'bulk_approve', 'moderation_items', null, {
      itemCount: itemIds.length,
      reason,
    }, c);

    return c.json({ success: true, processed: itemIds.length });
  }
);

/**
 * Bulk reject content
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.bulkReject',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { itemIds, reason, action } = await c.req.json<{
      itemIds: string[];
      reason: string;
      action?: string;
    }>();

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'Missing or empty itemIds array' }, 400);
    }

    if (!reason) {
      return c.json({ error: 'InvalidRequest', message: 'Reason is required for bulk reject' }, 400);
    }

    if (itemIds.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 items per bulk operation' }, 400);
    }

    await db
      .update(moderationItems)
      .set({
        status: 'rejected',
        action: action || 'reject',
        reviewedBy: adminUser.userDid,
        reviewedAt: new Date(),
        reviewNotes: reason,
      })
      .where(inArray(moderationItems.id, itemIds));

    await logAudit(adminUser.id, 'bulk_reject', 'moderation_items', null, {
      itemCount: itemIds.length,
      reason,
      action,
    }, c);

    return c.json({ success: true, processed: itemIds.length });
  }
);

/**
 * Bulk escalate content
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.moderation.bulkEscalate',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { itemIds, reason } = await c.req.json<{ itemIds: string[]; reason: string }>();

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'Missing or empty itemIds array' }, 400);
    }

    if (!reason) {
      return c.json({ error: 'InvalidRequest', message: 'Reason is required for escalation' }, 400);
    }

    if (itemIds.length > 50) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 50 items per bulk escalation' }, 400);
    }

    await db
      .update(moderationItems)
      .set({
        status: 'escalated',
        action: 'escalate',
        reviewedBy: adminUser.userDid,
        reviewedAt: new Date(),
        reviewNotes: reason,
      })
      .where(inArray(moderationItems.id, itemIds));

    await logAudit(adminUser.id, 'bulk_escalate', 'moderation_items', null, {
      itemCount: itemIds.length,
      reason,
    }, c);

    return c.json({ success: true, processed: itemIds.length });
  }
);

// ============================================
// USER-FACING APPEALS
// ============================================

/**
 * Submit an appeal (user-facing, requires regular auth)
 * Note: This endpoint bypasses admin auth for user submissions
 */
adminSettingsRouter.post(
  '/io.exprsn.moderation.submitAppeal',
  async (c) => {
    // This endpoint uses regular user auth, not admin auth
    const userDid = c.req.header('x-user-did'); // Would be set by regular auth middleware

    if (!userDid) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const body = await c.req.json<{
      moderationItemId?: string;
      userActionId?: string;
      reason: string;
      additionalInfo?: string;
    }>();

    if (!body.moderationItemId && !body.userActionId) {
      return c.json({ error: 'InvalidRequest', message: 'Either moderationItemId or userActionId required' }, 400);
    }

    if (!body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'Reason is required' }, 400);
    }

    // Get moderation config for appeal limits
    const config = await db.query.moderationConfig.findFirst({
      where: eq(moderationConfig.id, 'default'),
    });

    const maxAppeals = config?.maxAppealsPerUser || 3;
    const cooldownDays = config?.appealCooldownDays || 7;

    // Check appeal limits
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

    const [recentAppeals] = await db
      .select({ count: count() })
      .from(moderationAppeals)
      .where(
        and(
          eq(moderationAppeals.userId, userDid),
          gt(moderationAppeals.submittedAt, cooldownDate)
        )
      );

    if ((recentAppeals?.count || 0) >= maxAppeals) {
      return c.json({
        error: 'AppealLimitReached',
        message: `You have reached the maximum of ${maxAppeals} appeals in the last ${cooldownDays} days`,
      }, 429);
    }

    // Create appeal
    const id = nanoid();

    await db.insert(moderationAppeals).values({
      id,
      moderationItemId: body.moderationItemId,
      userActionId: body.userActionId,
      userId: userDid,
      reason: body.reason,
      additionalInfo: body.additionalInfo,
      status: 'pending',
      submittedAt: new Date(),
    });

    return c.json({ success: true, appealId: id });
  }
);

/**
 * Get user's appeals (user-facing)
 */
adminSettingsRouter.get(
  '/io.exprsn.moderation.getMyAppeals',
  async (c) => {
    const userDid = c.req.header('x-user-did');

    if (!userDid) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const appeals = await db
      .select()
      .from(moderationAppeals)
      .where(eq(moderationAppeals.userId, userDid))
      .orderBy(desc(moderationAppeals.submittedAt))
      .limit(20);

    return c.json({
      appeals: appeals.map((appeal) => ({
        id: appeal.id,
        moderationItemId: appeal.moderationItemId,
        userActionId: appeal.userActionId,
        reason: appeal.reason,
        status: appeal.status,
        decision: appeal.decision,
        submittedAt: appeal.submittedAt.toISOString(),
        reviewedAt: appeal.reviewedAt?.toISOString(),
      })),
    });
  }
);

// ─── Rate Limit Management ──────────────────────────────────

/**
 * GET /xrpc/io.exprsn.admin.settings.getRateLimitStatus
 * Returns active rate limit tracking keys and blocked entries from Redis
 */
adminSettingsRouter.get(
  '/io.exprsn.admin.settings.getRateLimitStatus',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const { redis: redisClient } = await import('../cache/redis.js');
    const entries: Array<{
      key: string;
      currentCount: number;
      isBlocked: boolean;
      ttl: number;
    }> = [];

    try {
      // Find rate limit keys using the keys() method (works with both Redis and MemoryCache)
      const prefixes = ['rl:auth:*', 'ratelimit:*', 'auth:failed:*'];
      for (const pattern of prefixes) {
        const matchedKeys = await redisClient.keys(pattern);

        for (const key of matchedKeys) {
          const isBlocked = key.endsWith(':blocked');
          const isCount = key.endsWith(':count') || key.startsWith('auth:failed:');
          if (!isBlocked && !isCount) continue;

          const ttl = await redisClient.ttl(key);
          let currentCount = 0;

          if (isBlocked) {
            // Try to find the companion count key
            const countKey = key.replace(':blocked', ':count');
            const countVal = await redisClient.get(countKey);
            currentCount = countVal ? parseInt(countVal, 10) : 0;
          } else {
            const val = await redisClient.get(key);
            currentCount = val ? parseInt(val, 10) : 0;
          }

          entries.push({
            key,
            currentCount,
            isBlocked,
            ttl: Math.max(ttl, 0),
          });
        }
      }
    } catch (err) {
      console.warn('[admin] Failed to scan rate limit keys:', err);
    }

    return c.json({ entries });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.settings.unblockRateLimit
 * Remove a rate limit block from Redis
 */
adminSettingsRouter.post(
  '/io.exprsn.admin.settings.unblockRateLimit',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const { key } = await c.req.json<{ key: string }>();
    if (!key) {
      return c.json({ error: 'key is required' }, 400);
    }

    const { redis: redisClient } = await import('../cache/redis.js');

    try {
      // Delete the block key
      await redisClient.del(key);
      // Also delete the companion count key
      const countKey = key.replace(':blocked', ':count');
      await redisClient.del(countKey);

      // Audit log
      const adminUser = c.get('adminUser') as { id: string } | undefined;
      console.log(`[admin] Rate limit unblocked: key=${key} by=${adminUser?.id || 'unknown'}`);

      return c.json({ success: true });
    } catch (err) {
      console.error('[admin] Failed to unblock rate limit:', err);
      return c.json({ error: 'Failed to unblock' }, 500);
    }
  }
);

export default adminSettingsRouter;
