import { Hono } from 'hono';
import { eq, and, or, ilike, desc, asc, sql, count, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  users,
  adminAuditLog,
  organizations,
  organizationMembers,
  organizationActivity,
  domains,
} from '../db/schema.js';
import {
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { sanitizeSearchQuery } from './admin-users.js';

export const adminOrgsRouter = new Hono();

// ============================================
// Organization Admin
// ============================================

adminOrgsRouter.get(
  '/io.exprsn.admin.orgs.list',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const rawQ = c.req.query('q');
    const type = c.req.query('type');
    const verified = c.req.query('verified');
    const apiAccess = c.req.query('apiAccess');
    const sort = c.req.query('sort') || 'recent';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    const q = sanitizeSearchQuery(rawQ);

    let conditions = [];

    if (q) {
      conditions.push(
        or(
          ilike(organizations.name, `%${q}%`),
          ilike(organizations.description, `%${q}%`)
        )
      );
    }

    if (type) {
      conditions.push(eq(organizations.type, type));
    }

    if (verified === 'true') {
      conditions.push(eq(organizations.verified, true));
    } else if (verified === 'false') {
      conditions.push(eq(organizations.verified, false));
    }

    if (apiAccess === 'enabled') {
      conditions.push(eq(organizations.apiAccessEnabled, true));
    } else if (apiAccess === 'disabled') {
      conditions.push(eq(organizations.apiAccessEnabled, false));
    }

    let orderBy;
    switch (sort) {
      case 'members':
        orderBy = desc(organizations.memberCount);
        break;
      case 'name':
        orderBy = asc(organizations.name);
        break;
      default:
        orderBy = desc(organizations.createdAt);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orgs = await db
      .select({
        org: organizations,
        owner: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(organizations)
      .leftJoin(users, eq(users.did, organizations.ownerDid))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit + 1);

    const hasMore = orgs.length > limit;
    const results = hasMore ? orgs.slice(0, -1) : orgs;

    return c.json({
      organizations: results.map(({ org, owner }) => ({
        id: org.id,
        name: org.name,
        type: org.type,
        description: org.description,
        avatar: org.avatar,
        status: org.status,
        verified: org.verified,
        memberCount: org.memberCount,
        apiAccessEnabled: org.apiAccessEnabled,
        domainId: org.domainId,
        parentOrganizationId: org.parentOrganizationId,
        owner,
        createdAt: org.createdAt.toISOString(),
      })),
      cursor: hasMore ? results[results.length - 1]?.org.createdAt.toISOString() : undefined,
    });
  }
);

adminOrgsRouter.post(
  '/io.exprsn.admin.orgs.create',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      name: string;
      handle?: string;
      type: 'team' | 'enterprise' | 'nonprofit' | 'business' | 'company' | 'network' | 'label' | 'brand' | 'channel';
      description?: string;
      website?: string;
      ownerDid: string;
      visibility?: 'public' | 'private' | 'unlisted';
      domainId?: string | null;
      parentOrganizationId?: string | null;
      contactEmail?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.name || body.name.length < 2 || body.name.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Organization name must be 2-100 characters' }, 400);
    }

    if (!body.ownerDid) {
      return c.json({ error: 'InvalidRequest', message: 'Owner DID is required' }, 400);
    }

    const validTypes = ['team', 'enterprise', 'nonprofit', 'business', 'company', 'network', 'label', 'brand', 'channel'];
    if (!validTypes.includes(body.type)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid organization type' }, 400);
    }

    const owner = await db
      .select()
      .from(users)
      .where(eq(users.did, body.ownerDid))
      .limit(1);

    if (!owner[0]) {
      return c.json({ error: 'InvalidRequest', message: 'Owner user not found' }, 400);
    }

    if (body.handle) {
      const handleRegex = /^[a-z0-9-_]+$/;
      if (!handleRegex.test(body.handle)) {
        return c.json({ error: 'InvalidRequest', message: 'Handle must contain only lowercase letters, numbers, hyphens, and underscores' }, 400);
      }

      const existingHandle = await db
        .select()
        .from(organizations)
        .where(eq(organizations.handle, body.handle))
        .limit(1);

      if (existingHandle[0]) {
        return c.json({ error: 'InvalidRequest', message: 'Handle already taken' }, 400);
      }
    }

    if (body.domainId) {
      const domain = await db
        .select()
        .from(domains)
        .where(eq(domains.id, body.domainId))
        .limit(1);

      if (!domain[0]) {
        return c.json({ error: 'InvalidRequest', message: 'Domain not found' }, 400);
      }
    }

    if (body.parentOrganizationId) {
      const parentOrg = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, body.parentOrganizationId))
        .limit(1);

      if (!parentOrg[0]) {
        return c.json({ error: 'InvalidRequest', message: 'Parent organization not found' }, 400);
      }
    }

    const orgId = nanoid();
    const now = new Date();
    const isPublic = body.visibility === 'private' ? false : true;

    await db.insert(organizations).values({
      id: orgId,
      ownerDid: body.ownerDid,
      name: body.name,
      handle: body.handle,
      type: body.type,
      description: body.description,
      website: body.website,
      isPublic,
      memberCount: 1,
      domainId: body.domainId,
      parentOrganizationId: body.parentOrganizationId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(organizationMembers).values({
      id: nanoid(),
      organizationId: orgId,
      userDid: body.ownerDid,
      role: 'owner',
      permissions: ['*'],
      joinedAt: now,
    });

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.create',
      targetType: 'organization',
      targetId: orgId,
      details: {
        name: body.name,
        type: body.type,
        ownerDid: body.ownerDid,
        domainId: body.domainId,
        parentOrganizationId: body.parentOrganizationId,
      },
      createdAt: now,
    });

    return c.json({
      success: true,
      organization: {
        id: orgId,
        name: body.name,
        handle: body.handle,
        type: body.type,
      },
    });
  }
);

adminOrgsRouter.get(
  '/io.exprsn.admin.orgs.get',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const orgId = c.req.query('id');

    if (!orgId) {
      return c.json({ error: 'InvalidRequest', message: 'Organization ID required' }, 400);
    }

    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const org = result[0];
    if (!org) {
      return c.json({ error: 'NotFound', message: 'Organization not found' }, 404);
    }

    const ownerResult = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.did, org.ownerDid))
      .limit(1);

    const memberStats = await db
      .select({
        total: count(),
        active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
        suspended: sql<number>`COUNT(*) FILTER (WHERE status = 'suspended')`,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    const recentActivity = await db
      .select({
        activity: organizationActivity,
        actor: {
          did: users.did,
          handle: users.handle,
        },
      })
      .from(organizationActivity)
      .leftJoin(users, eq(users.did, organizationActivity.actorDid))
      .where(eq(organizationActivity.organizationId, orgId))
      .orderBy(desc(organizationActivity.createdAt))
      .limit(10);

    return c.json({
      organization: {
        id: org.id,
        name: org.name,
        type: org.type,
        description: org.description,
        website: org.website,
        avatar: org.avatar,
        status: org.status,
        verified: org.verified,
        memberCount: org.memberCount,
        domainId: org.domainId,
        parentOrganizationId: org.parentOrganizationId,
        hierarchyPath: org.hierarchyPath,
        hierarchyLevel: org.hierarchyLevel,
        suspendedAt: org.suspendedAt?.toISOString(),
        suspendedBy: org.suspendedBy,
        suspendedReason: org.suspendedReason,
        rateLimitPerMinute: org.rateLimitPerMinute,
        burstLimit: org.burstLimit,
        dailyRequestLimit: org.dailyRequestLimit,
        apiAccessEnabled: org.apiAccessEnabled,
        allowedScopes: org.allowedScopes,
        webhooksEnabled: org.webhooksEnabled,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
      },
      owner: ownerResult[0] || null,
      stats: {
        totalMembers: memberStats[0]?.total || 0,
        activeMembers: memberStats[0]?.active || 0,
        suspendedMembers: memberStats[0]?.suspended || 0,
      },
      recentActivity: recentActivity.map(({ activity, actor }) => ({
        id: activity.id,
        action: activity.action,
        details: activity.details,
        actor,
        createdAt: activity.createdAt.toISOString(),
      })),
    });
  }
);

adminOrgsRouter.post(
  '/io.exprsn.admin.orgs.update',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      verified?: boolean;
      status?: 'active' | 'suspended' | 'pending';
      apiAccessEnabled?: boolean;
      rateLimitPerMinute?: number | null;
      burstLimit?: number | null;
      dailyRequestLimit?: number | null;
      allowedScopes?: string[] | null;
      webhooksEnabled?: boolean;
      domainId?: string | null;
      parentOrganizationId?: string | null;
      suspendedReason?: string | null;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Organization ID required' }, 400);
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.id))
      .limit(1);

    if (!org[0]) {
      return c.json({ error: 'NotFound', message: 'Organization not found' }, 404);
    }

    const updates: Partial<typeof organizations.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.verified !== undefined) updates.verified = body.verified;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'suspended') {
        updates.suspendedAt = new Date();
        updates.suspendedBy = adminUser.userDid;
        updates.suspendedReason = body.suspendedReason ?? 'Administrative action';
      } else if (body.status === 'active') {
        updates.suspendedAt = null;
        updates.suspendedBy = null;
        updates.suspendedReason = null;
      }
    }
    if (body.apiAccessEnabled !== undefined) updates.apiAccessEnabled = body.apiAccessEnabled;
    if (body.rateLimitPerMinute !== undefined) updates.rateLimitPerMinute = body.rateLimitPerMinute;
    if (body.burstLimit !== undefined) updates.burstLimit = body.burstLimit;
    if (body.dailyRequestLimit !== undefined) updates.dailyRequestLimit = body.dailyRequestLimit;
    if (body.allowedScopes !== undefined) updates.allowedScopes = body.allowedScopes;
    if (body.webhooksEnabled !== undefined) updates.webhooksEnabled = body.webhooksEnabled;
    if (body.domainId !== undefined) updates.domainId = body.domainId;
    if (body.parentOrganizationId !== undefined) updates.parentOrganizationId = body.parentOrganizationId;

    await db.update(organizations).set(updates).where(eq(organizations.id, body.id));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.update',
      targetType: 'organization',
      targetId: body.id,
      details: { updates: Object.keys(updates).filter((k) => k !== 'updatedAt') },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

adminOrgsRouter.post(
  '/io.exprsn.admin.orgs.bulkVerify',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      orgIds: string[];
      verified: boolean;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.orgIds || !Array.isArray(body.orgIds) || body.orgIds.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'orgIds array is required' }, 400);
    }

    if (body.orgIds.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 organizations per bulk operation' }, 400);
    }

    const existingOrgs = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(inArray(organizations.id, body.orgIds));

    const existingIds = new Set(existingOrgs.map((o) => o.id));
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const orgId of body.orgIds) {
      if (!existingIds.has(orgId)) {
        results.push({ id: orgId, success: false, error: 'Organization not found' });
        continue;
      }

      try {
        await db
          .update(organizations)
          .set({ verified: body.verified, updatedAt: new Date() })
          .where(eq(organizations.id, orgId));

        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: body.verified ? 'organization.bulkVerify' : 'organization.bulkUnverify',
          targetType: 'organization',
          targetId: orgId,
          details: { bulkOperation: true },
          createdAt: new Date(),
        });

        results.push({ id: orgId, success: true });
      } catch (err) {
        results.push({ id: orgId, success: false, error: 'Failed to update' });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return c.json({
      success: true,
      summary: {
        total: body.orgIds.length,
        succeeded: successCount,
        failed: body.orgIds.length - successCount,
        action: body.verified ? 'verified' : 'unverified',
      },
      results,
    });
  }
);

adminOrgsRouter.post(
  '/io.exprsn.admin.orgs.bulkUpdateApiAccess',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      orgIds: string[];
      apiAccessEnabled: boolean;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.orgIds || !Array.isArray(body.orgIds) || body.orgIds.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'orgIds array is required' }, 400);
    }

    if (body.orgIds.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 organizations per bulk operation' }, 400);
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const orgId of body.orgIds) {
      try {
        await db
          .update(organizations)
          .set({ apiAccessEnabled: body.apiAccessEnabled, updatedAt: new Date() })
          .where(eq(organizations.id, orgId));

        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: body.apiAccessEnabled ? 'organization.bulkEnableApi' : 'organization.bulkDisableApi',
          targetType: 'organization',
          targetId: orgId,
          details: { bulkOperation: true },
          createdAt: new Date(),
        });

        results.push({ id: orgId, success: true });
      } catch (err) {
        results.push({ id: orgId, success: false, error: 'Failed to update' });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return c.json({
      success: true,
      summary: {
        total: body.orgIds.length,
        succeeded: successCount,
        failed: body.orgIds.length - successCount,
        action: body.apiAccessEnabled ? 'enabled' : 'disabled',
      },
      results,
    });
  }
);

adminOrgsRouter.post(
  '/io.exprsn.admin.orgs.bulkUpdateMembers',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      orgId: string;
      members: Array<{
        did: string;
        action: 'add' | 'remove' | 'suspend' | 'activate';
        role?: 'admin' | 'member';
      }>;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.orgId || !body.members || !Array.isArray(body.members)) {
      return c.json({ error: 'InvalidRequest', message: 'orgId and members array required' }, 400);
    }

    if (body.members.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 members per bulk operation' }, 400);
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.orgId))
      .limit(1);

    if (!org[0]) {
      return c.json({ error: 'NotFound', message: 'Organization not found' }, 404);
    }

    const results: { did: string; action: string; success: boolean; error?: string }[] = [];

    for (const memberAction of body.members) {
      try {
        switch (memberAction.action) {
          case 'add': {
            const user = await db
              .select()
              .from(users)
              .where(eq(users.did, memberAction.did))
              .limit(1);

            if (!user[0]) {
              results.push({ did: memberAction.did, action: 'add', success: false, error: 'User not found' });
              continue;
            }

            const existing = await db
              .select()
              .from(organizationMembers)
              .where(
                and(
                  eq(organizationMembers.organizationId, body.orgId),
                  eq(organizationMembers.userDid, memberAction.did)
                )
              )
              .limit(1);

            if (existing[0]) {
              results.push({ did: memberAction.did, action: 'add', success: false, error: 'Already a member' });
              continue;
            }

            const role = memberAction.role || 'member';
            const permissions = role === 'admin' ? ['bulk_import', 'manage_members', 'edit_settings'] : [];

            await db.insert(organizationMembers).values({
              id: nanoid(),
              organizationId: body.orgId,
              userDid: memberAction.did,
              role,
              permissions,
              invitedBy: adminUser.userDid,
              joinedAt: new Date(),
            });

            await db
              .update(organizations)
              .set({ memberCount: sql`${organizations.memberCount} + 1`, updatedAt: new Date() })
              .where(eq(organizations.id, body.orgId));

            results.push({ did: memberAction.did, action: 'add', success: true });
            break;
          }

          case 'remove': {
            if (org[0].ownerDid === memberAction.did) {
              results.push({ did: memberAction.did, action: 'remove', success: false, error: 'Cannot remove owner' });
              continue;
            }

            await db
              .delete(organizationMembers)
              .where(
                and(
                  eq(organizationMembers.organizationId, body.orgId),
                  eq(organizationMembers.userDid, memberAction.did)
                )
              );

            await db
              .update(organizations)
              .set({ memberCount: sql`GREATEST(${organizations.memberCount} - 1, 0)`, updatedAt: new Date() })
              .where(eq(organizations.id, body.orgId));

            results.push({ did: memberAction.did, action: 'remove', success: true });
            break;
          }

          case 'suspend': {
            if (org[0].ownerDid === memberAction.did) {
              results.push({ did: memberAction.did, action: 'suspend', success: false, error: 'Cannot suspend owner' });
              continue;
            }

            await db
              .update(organizationMembers)
              .set({
                status: 'suspended',
                suspendedAt: new Date(),
                suspendedBy: adminUser.userDid,
                suspendedReason: 'Admin action',
              })
              .where(
                and(
                  eq(organizationMembers.organizationId, body.orgId),
                  eq(organizationMembers.userDid, memberAction.did)
                )
              );

            results.push({ did: memberAction.did, action: 'suspend', success: true });
            break;
          }

          case 'activate': {
            await db
              .update(organizationMembers)
              .set({
                status: 'active',
                suspendedAt: null,
                suspendedBy: null,
                suspendedReason: null,
              })
              .where(
                and(
                  eq(organizationMembers.organizationId, body.orgId),
                  eq(organizationMembers.userDid, memberAction.did)
                )
              );

            results.push({ did: memberAction.did, action: 'activate', success: true });
            break;
          }

          default:
            results.push({ did: memberAction.did, action: memberAction.action, success: false, error: 'Invalid action' });
        }
      } catch (err) {
        results.push({ did: memberAction.did, action: memberAction.action, success: false, error: 'Operation failed' });
      }
    }

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.bulkUpdateMembers',
      targetType: 'organization',
      targetId: body.orgId,
      details: {
        memberCount: body.members.length,
        actions: body.members.map((m) => m.action),
      },
      createdAt: new Date(),
    });

    const successCount = results.filter((r) => r.success).length;

    return c.json({
      success: true,
      summary: {
        total: body.members.length,
        succeeded: successCount,
        failed: body.members.length - successCount,
      },
      results,
    });
  }
);

adminOrgsRouter.post(
  '/io.exprsn.admin.orgs.delete',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      reason: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.id || !body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'Organization ID and reason required' }, 400);
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.id))
      .limit(1);

    if (!org[0]) {
      return c.json({ error: 'NotFound', message: 'Organization not found' }, 404);
    }

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.delete',
      targetType: 'organization',
      targetId: body.id,
      details: { name: org[0].name, reason: body.reason },
      createdAt: new Date(),
    });

    await db.delete(organizations).where(eq(organizations.id, body.id));

    return c.json({ success: true });
  }
);

adminOrgsRouter.post(
  '/io.exprsn.admin.orgs.bulkDelete',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      orgIds: string[];
      reason: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.orgIds || !Array.isArray(body.orgIds) || body.orgIds.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'orgIds array is required' }, 400);
    }

    if (!body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'reason is required' }, 400);
    }

    if (body.orgIds.length > 50) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 50 organizations per bulk delete' }, 400);
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const orgId of body.orgIds) {
      try {
        const org = await db
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1);

        if (!org[0]) {
          results.push({ id: orgId, success: false, error: 'Organization not found' });
          continue;
        }

        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'organization.bulkDelete',
          targetType: 'organization',
          targetId: orgId,
          details: { name: org[0].name, reason: body.reason, bulkOperation: true },
          createdAt: new Date(),
        });

        await db.delete(organizations).where(eq(organizations.id, orgId));

        results.push({ id: orgId, success: true });
      } catch (err) {
        results.push({ id: orgId, success: false, error: 'Failed to delete' });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return c.json({
      success: true,
      summary: {
        total: body.orgIds.length,
        succeeded: successCount,
        failed: body.orgIds.length - successCount,
      },
      results,
    });
  }
);
