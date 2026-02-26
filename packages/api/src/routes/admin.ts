import { Hono } from 'hono';
import { eq, and, or, ilike, desc, asc, sql, count, isNull, gte, lte, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  users,
  videos,
  comments,
  adminUsers,
  contentReports,
  moderationActions,
  userSanctions,
  featuredContent,
  systemConfig,
  adminAuditLog,
  analyticsSnapshots,
  organizations,
  organizationMembers,
  organizationActivity,
  sessions,
  type AdminUser,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  superAdminMiddleware,
  ADMIN_PERMISSIONS,
  getAdminPermissions,
} from '../auth/middleware.js';
import {
  exportUsers,
  exportReports,
  exportAuditLogs,
  exportAnalytics,
  exportPayments,
  exportRenderJobs,
  exportOrganizations,
  exportSanctions,
  type ExportFormat,
} from '../services/export/index.js';
import { broadcastAdminActivity, notifyAdmins } from '../websocket/admin.js';

export const adminRouter = new Hono();

// Apply admin auth to all routes
adminRouter.use('*', adminAuthMiddleware);

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
// User Management (Sprint 2)
// ============================================

// List users with filters
adminRouter.get(
  '/io.exprsn.admin.users.list',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const query = c.req.query('q');
    const status = c.req.query('status'); // active, suspended, banned
    const verified = c.req.query('verified');
    const sort = c.req.query('sort') || 'recent'; // recent, followers, videos
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const cursor = c.req.query('cursor');

    let conditions = [];

    if (query) {
      conditions.push(
        or(ilike(users.handle, `%${query}%`), ilike(users.displayName, `%${query}%`))
      );
    }

    if (verified === 'true') {
      conditions.push(eq(users.verified, true));
    } else if (verified === 'false') {
      conditions.push(eq(users.verified, false));
    }

    // Build order by
    let orderBy;
    switch (sort) {
      case 'followers':
        orderBy = desc(users.followerCount);
        break;
      case 'videos':
        orderBy = desc(users.videoCount);
        break;
      case 'recent':
      default:
        orderBy = desc(users.createdAt);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const userList = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        followerCount: users.followerCount,
        videoCount: users.videoCount,
        verified: users.verified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit + 1);

    const hasMore = userList.length > limit;
    const items = hasMore ? userList.slice(0, -1) : userList;

    // Get active sanctions for each user
    const userDids = items.map((u) => u.did);
    const activeSanctions = userDids.length > 0
      ? await db
          .select({
            userDid: userSanctions.userDid,
            sanctionType: userSanctions.sanctionType,
          })
          .from(userSanctions)
          .where(
            and(
              inArray(userSanctions.userDid, userDids),
              or(isNull(userSanctions.expiresAt), gte(userSanctions.expiresAt, new Date()))
            )
          )
      : [];

    const sanctionMap = new Map<string, string>();
    for (const s of activeSanctions) {
      // Keep the most severe sanction
      const current = sanctionMap.get(s.userDid);
      if (!current || severityOrder(s.sanctionType) > severityOrder(current)) {
        sanctionMap.set(s.userDid, s.sanctionType);
      }
    }

    return c.json({
      users: items.map((u) => ({
        ...u,
        status: sanctionMap.get(u.did) || 'active',
      })),
      cursor: hasMore && items[items.length - 1] ? items[items.length - 1]!.did : undefined,
    });
  }
);

// Get user details
adminRouter.get(
  '/io.exprsn.admin.users.get',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    const [user] = await db.select().from(users).where(eq(users.did, did)).limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    // Get user's sanctions
    const sanctions = await db
      .select()
      .from(userSanctions)
      .where(eq(userSanctions.userDid, did))
      .orderBy(desc(userSanctions.createdAt))
      .limit(20);

    // Get user's recent videos
    const recentVideos = await db
      .select({
        uri: videos.uri,
        caption: videos.caption,
        thumbnailUrl: videos.thumbnailUrl,
        viewCount: videos.viewCount,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .where(eq(videos.authorDid, did))
      .orderBy(desc(videos.createdAt))
      .limit(10);

    // Get report count against this user
    const [reportCount] = await db
      .select({ count: count() })
      .from(contentReports)
      .where(
        and(eq(contentReports.contentType, 'user'), eq(contentReports.contentUri, did))
      );

    return c.json({
      user,
      sanctions,
      recentVideos,
      reportCount: reportCount?.count || 0,
    });
  }
);

// Update user (verify, etc.)
adminRouter.post(
  '/io.exprsn.admin.users.update',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      did: string;
      verified?: boolean;
      displayName?: string;
      bio?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    const updates: Partial<typeof users.$inferInsert> = {};
    if (body.verified !== undefined) updates.verified = body.verified;
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.bio !== undefined) updates.bio = body.bio;
    updates.updatedAt = new Date();

    await db.update(users).set(updates).where(eq(users.did, body.did));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.update',
      targetType: 'user',
      targetId: body.did,
      details: updates,
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// Issue sanction
adminRouter.post(
  '/io.exprsn.admin.users.sanction',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
      reason: string;
      expiresAt?: string;
    }>();
    const adminUser = c.get('adminUser');
    const permissions = c.get('adminPermissions');

    if (!body.userDid || !body.sanctionType || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'userDid, sanctionType, and reason are required' },
        400
      );
    }

    // Ban requires special permission
    if (body.sanctionType === 'ban' && !permissions.includes(ADMIN_PERMISSIONS.USERS_BAN)) {
      return c.json(
        { error: 'Forbidden', message: 'Ban permission required' },
        403
      );
    }

    const sanctionId = nanoid();
    await db.insert(userSanctions).values({
      id: sanctionId,
      userDid: body.userDid,
      adminId: adminUser.id,
      sanctionType: body.sanctionType,
      reason: body.reason,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdAt: new Date(),
    });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: `user.sanction.${body.sanctionType}`,
      targetType: 'user',
      targetId: body.userDid,
      details: { sanctionId, reason: body.reason },
      createdAt: new Date(),
    });

    return c.json({ success: true, sanctionId });
  }
);

// Remove sanction
adminRouter.post(
  '/io.exprsn.admin.users.removeSanction',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{ sanctionId: string; reason?: string }>();
    const adminUser = c.get('adminUser');

    if (!body.sanctionId) {
      return c.json({ error: 'InvalidRequest', message: 'sanctionId is required' }, 400);
    }

    const [sanction] = await db
      .select()
      .from(userSanctions)
      .where(eq(userSanctions.id, body.sanctionId))
      .limit(1);

    if (!sanction) {
      return c.json({ error: 'NotFound', message: 'Sanction not found' }, 404);
    }

    // Set expiry to now to effectively remove it
    await db
      .update(userSanctions)
      .set({ expiresAt: new Date() })
      .where(eq(userSanctions.id, body.sanctionId));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.sanction.remove',
      targetType: 'user',
      targetId: sanction.userDid,
      details: { sanctionId: body.sanctionId, reason: body.reason },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// Get user's sanction history
adminRouter.get(
  '/io.exprsn.admin.users.getSanctions',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const userDid = c.req.query('userDid');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    if (!userDid) {
      return c.json({ error: 'InvalidRequest', message: 'userDid is required' }, 400);
    }

    const sanctions = await db
      .select()
      .from(userSanctions)
      .where(eq(userSanctions.userDid, userDid))
      .orderBy(desc(userSanctions.createdAt))
      .limit(limit);

    return c.json({ sanctions });
  }
);

// ============================================
// Bulk User Actions
// ============================================

// Bulk sanction users
adminRouter.post(
  '/io.exprsn.admin.users.bulkSanction',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{
      userDids: string[];
      sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
      reason: string;
      expiresAt?: string;
    }>();
    const adminUser = c.get('adminUser');
    const permissions = c.get('adminPermissions');

    if (!body.userDids || !Array.isArray(body.userDids) || body.userDids.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'userDids array is required' }, 400);
    }

    if (!body.sanctionType || !body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'sanctionType and reason are required' }, 400);
    }

    // Limit bulk operations to 100 users at a time
    if (body.userDids.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 users per bulk operation' }, 400);
    }

    // Ban requires special permission
    if (body.sanctionType === 'ban' && !permissions.includes(ADMIN_PERMISSIONS.USERS_BAN)) {
      return c.json({ error: 'Forbidden', message: 'Ban permission required' }, 403);
    }

    const results: { did: string; success: boolean; sanctionId?: string; error?: string }[] = [];
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    // Verify all users exist first
    const existingUsers = await db
      .select({ did: users.did })
      .from(users)
      .where(inArray(users.did, body.userDids));

    const existingDids = new Set(existingUsers.map((u) => u.did));

    // Process each user
    for (const userDid of body.userDids) {
      if (!existingDids.has(userDid)) {
        results.push({ did: userDid, success: false, error: 'User not found' });
        continue;
      }

      try {
        const sanctionId = nanoid();
        await db.insert(userSanctions).values({
          id: sanctionId,
          userDid,
          adminId: adminUser.id,
          sanctionType: body.sanctionType,
          reason: body.reason,
          expiresAt,
          createdAt: new Date(),
        });

        // Audit log for each user
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: `user.bulkSanction.${body.sanctionType}`,
          targetType: 'user',
          targetId: userDid,
          details: { sanctionId, reason: body.reason, bulkOperation: true },
          createdAt: new Date(),
        });

        results.push({ did: userDid, success: true, sanctionId });
      } catch (err) {
        results.push({ did: userDid, success: false, error: 'Failed to apply sanction' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    // Broadcast activity to admins
    if (successCount > 0) {
      const user = await db.query.users.findFirst({
        where: eq(users.did, adminUser.userDid),
        columns: { handle: true },
      });

      broadcastAdminActivity({
        adminDid: adminUser.userDid,
        adminHandle: user?.handle || 'unknown',
        action: `bulk_sanction_${body.sanctionType}`,
        targetType: 'users',
        targetId: `${successCount} users`,
      });

      notifyAdmins({
        type: 'sanction',
        title: 'Bulk Sanction Applied',
        message: `${user?.handle || 'Admin'} applied ${body.sanctionType} to ${successCount} user(s)`,
        severity: body.sanctionType === 'ban' ? 'error' : 'warning',
        data: { successCount, sanctionType: body.sanctionType },
      });
    }

    return c.json({
      success: failureCount === 0,
      summary: {
        total: body.userDids.length,
        succeeded: successCount,
        failed: failureCount,
      },
      results,
    });
  }
);

// Bulk password reset
adminRouter.post(
  '/io.exprsn.admin.users.bulkResetPassword',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDids: string[];
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDids || !Array.isArray(body.userDids) || body.userDids.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'userDids array is required' }, 400);
    }

    // Limit bulk operations to 100 users at a time
    if (body.userDids.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 users per bulk operation' }, 400);
    }

    const results: { did: string; success: boolean; temporaryPassword?: string; error?: string }[] = [];

    // Get existing users from actorRepos
    const existingUsers = await db
      .select({ did: actorRepos.did, handle: actorRepos.handle })
      .from(actorRepos)
      .where(inArray(actorRepos.did, body.userDids));

    const existingMap = new Map(existingUsers.map((u) => [u.did, u]));

    // Process each user
    for (const userDid of body.userDids) {
      const user = existingMap.get(userDid);
      if (!user) {
        results.push({ did: userDid, success: false, error: 'User account not found' });
        continue;
      }

      try {
        // Generate a random temporary password
        const tempPassword = `temp_${nanoid(12)}`;
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // Update the password
        await db
          .update(actorRepos)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(actorRepos.did, userDid));

        // Invalidate all existing sessions
        await db.delete(sessions).where(eq(sessions.did, userDid));

        // Audit log
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'user.bulkResetPassword',
          targetType: 'user',
          targetId: userDid,
          details: { handle: user.handle, bulkOperation: true },
          createdAt: new Date(),
        });

        results.push({ did: userDid, success: true, temporaryPassword: tempPassword });
      } catch (err) {
        results.push({ did: userDid, success: false, error: 'Failed to reset password' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return c.json({
      success: failureCount === 0,
      summary: {
        total: body.userDids.length,
        succeeded: successCount,
        failed: failureCount,
      },
      results,
    });
  }
);

// Bulk delete users
adminRouter.post(
  '/io.exprsn.admin.users.bulkDelete',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      userDids: string[];
      reason: string;
      hardDelete?: boolean; // If true, permanently delete; otherwise soft delete (ban + deactivate)
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDids || !Array.isArray(body.userDids) || body.userDids.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'userDids array is required' }, 400);
    }

    if (!body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'reason is required' }, 400);
    }

    // Limit bulk operations to 50 users for deletion (more destructive)
    if (body.userDids.length > 50) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 50 users per bulk delete operation' }, 400);
    }

    const results: { did: string; success: boolean; error?: string }[] = [];

    // Verify all users exist first
    const existingUsers = await db
      .select({ did: users.did, handle: users.handle })
      .from(users)
      .where(inArray(users.did, body.userDids));

    const existingMap = new Map(existingUsers.map((u) => [u.did, u]));

    // Process each user
    for (const userDid of body.userDids) {
      const user = existingMap.get(userDid);
      if (!user) {
        results.push({ did: userDid, success: false, error: 'User not found' });
        continue;
      }

      try {
        if (body.hardDelete) {
          // Hard delete - remove user and related data
          // Delete sessions first
          await db.delete(sessions).where(eq(sessions.did, userDid));

          // Delete sanctions
          await db.delete(userSanctions).where(eq(userSanctions.userDid, userDid));

          // Mark videos as removed
          await db
            .update(videos)
            .set({ visibility: 'removed' })
            .where(eq(videos.authorDid, userDid));

          // Delete actor repo
          await db.delete(actorRepos).where(eq(actorRepos.did, userDid));

          // Delete user record
          await db.delete(users).where(eq(users.did, userDid));
        } else {
          // Soft delete - ban the user and deactivate account
          const sanctionId = nanoid();
          await db.insert(userSanctions).values({
            id: sanctionId,
            userDid,
            adminId: adminUser.id,
            sanctionType: 'ban',
            reason: `Account deleted: ${body.reason}`,
            expiresAt: null, // Permanent
            createdAt: new Date(),
          });

          // Invalidate all sessions
          await db.delete(sessions).where(eq(sessions.did, userDid));

          // Update actor repo status if it exists
          await db
            .update(actorRepos)
            .set({ status: 'deactivated', updatedAt: new Date() })
            .where(eq(actorRepos.did, userDid));
        }

        // Audit log
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: body.hardDelete ? 'user.bulkHardDelete' : 'user.bulkSoftDelete',
          targetType: 'user',
          targetId: userDid,
          details: { handle: user.handle, reason: body.reason, bulkOperation: true },
          createdAt: new Date(),
        });

        results.push({ did: userDid, success: true });
      } catch (err) {
        results.push({ did: userDid, success: false, error: 'Failed to delete user' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return c.json({
      success: failureCount === 0,
      summary: {
        total: body.userDids.length,
        succeeded: successCount,
        failed: failureCount,
        deleteType: body.hardDelete ? 'hard' : 'soft',
      },
      results,
    });
  }
);

// Bulk force logout
adminRouter.post(
  '/io.exprsn.admin.users.bulkForceLogout',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDids: string[];
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDids || !Array.isArray(body.userDids) || body.userDids.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'userDids array is required' }, 400);
    }

    // Limit bulk operations to 100 users at a time
    if (body.userDids.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 users per bulk operation' }, 400);
    }

    const results: { did: string; success: boolean; sessionsInvalidated: number; error?: string }[] = [];

    for (const userDid of body.userDids) {
      try {
        // Count existing sessions
        const [sessionCount] = await db
          .select({ count: count() })
          .from(sessions)
          .where(eq(sessions.did, userDid));

        // Delete all sessions for the user
        await db.delete(sessions).where(eq(sessions.did, userDid));

        // Audit log
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'user.bulkForceLogout',
          targetType: 'user',
          targetId: userDid,
          details: { sessionsInvalidated: sessionCount?.count || 0, bulkOperation: true },
          createdAt: new Date(),
        });

        results.push({
          did: userDid,
          success: true,
          sessionsInvalidated: sessionCount?.count || 0,
        });
      } catch (err) {
        results.push({ did: userDid, success: false, sessionsInvalidated: 0, error: 'Failed to invalidate sessions' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalSessionsInvalidated = results.reduce((sum, r) => sum + r.sessionsInvalidated, 0);

    return c.json({
      success: true,
      summary: {
        total: body.userDids.length,
        succeeded: successCount,
        failed: body.userDids.length - successCount,
        totalSessionsInvalidated,
      },
      results,
    });
  }
);

// Preview bulk action (dry run)
adminRouter.post(
  '/io.exprsn.admin.users.bulkActionPreview',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const body = await c.req.json<{
      userDids: string[];
      action: 'sanction' | 'resetPassword' | 'delete' | 'forceLogout';
      sanctionType?: 'warning' | 'mute' | 'suspend' | 'ban';
    }>();

    if (!body.userDids || !Array.isArray(body.userDids) || body.userDids.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'userDids array is required' }, 400);
    }

    if (!body.action) {
      return c.json({ error: 'InvalidRequest', message: 'action is required' }, 400);
    }

    // Get user details for preview
    const userDetails = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        followerCount: users.followerCount,
        videoCount: users.videoCount,
        verified: users.verified,
      })
      .from(users)
      .where(inArray(users.did, body.userDids));

    const foundDids = new Set(userDetails.map((u) => u.did));
    const notFoundDids = body.userDids.filter((did) => !foundDids.has(did));

    // Get current sanction status for each user
    const activeSanctions = await db
      .select({
        userDid: userSanctions.userDid,
        sanctionType: userSanctions.sanctionType,
      })
      .from(userSanctions)
      .where(
        and(
          inArray(userSanctions.userDid, body.userDids),
          or(isNull(userSanctions.expiresAt), gte(userSanctions.expiresAt, new Date()))
        )
      );

    const sanctionMap = new Map<string, string>();
    for (const s of activeSanctions) {
      const current = sanctionMap.get(s.userDid);
      if (!current || severityOrder(s.sanctionType) > severityOrder(current)) {
        sanctionMap.set(s.userDid, s.sanctionType);
      }
    }

    // Build warnings
    const warnings: string[] = [];

    if (notFoundDids.length > 0) {
      warnings.push(`${notFoundDids.length} user(s) not found and will be skipped`);
    }

    if (body.action === 'sanction' && body.sanctionType) {
      const alreadySanctioned = userDetails.filter((u) => {
        const currentSanction = sanctionMap.get(u.did);
        return currentSanction && severityOrder(currentSanction) >= severityOrder(body.sanctionType!);
      });
      if (alreadySanctioned.length > 0) {
        warnings.push(
          `${alreadySanctioned.length} user(s) already have equal or higher sanctions`
        );
      }
    }

    if (body.action === 'delete') {
      const verifiedUsers = userDetails.filter((u) => u.verified);
      if (verifiedUsers.length > 0) {
        warnings.push(`${verifiedUsers.length} verified user(s) will be deleted`);
      }

      const totalFollowers = userDetails.reduce((sum, u) => sum + (u.followerCount || 0), 0);
      if (totalFollowers > 1000) {
        warnings.push(`Users have combined ${totalFollowers} followers`);
      }
    }

    return c.json({
      preview: {
        action: body.action,
        sanctionType: body.sanctionType,
        affectedCount: userDetails.length,
        notFoundCount: notFoundDids.length,
        users: userDetails.map((u) => ({
          ...u,
          currentSanction: sanctionMap.get(u.did) || null,
        })),
        notFoundDids,
      },
      warnings,
      canProceed: userDetails.length > 0,
    });
  }
);

// ============================================
// Organization Admin
// ============================================

// List all organizations
adminRouter.get(
  '/io.exprsn.admin.orgs.list',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const q = c.req.query('q');
    const type = c.req.query('type'); // team, enterprise, nonprofit, business
    const verified = c.req.query('verified'); // true, false
    const apiAccess = c.req.query('apiAccess'); // enabled, disabled
    const sort = c.req.query('sort') || 'recent'; // recent, members, name
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const cursor = c.req.query('cursor');

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
        verified: org.verified,
        memberCount: org.memberCount,
        apiAccessEnabled: org.apiAccessEnabled,
        owner,
        createdAt: org.createdAt.toISOString(),
      })),
      cursor: hasMore ? results[results.length - 1]?.org.createdAt.toISOString() : undefined,
    });
  }
);

// Get organization details
adminRouter.get(
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

    // Get owner info
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

    // Get member stats
    const memberStats = await db
      .select({
        total: count(),
        active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
        suspended: sql<number>`COUNT(*) FILTER (WHERE status = 'suspended')`,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    // Get recent activity
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
        verified: org.verified,
        memberCount: org.memberCount,
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

// Update organization (admin)
adminRouter.post(
  '/io.exprsn.admin.orgs.update',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      verified?: boolean;
      apiAccessEnabled?: boolean;
      rateLimitPerMinute?: number | null;
      burstLimit?: number | null;
      dailyRequestLimit?: number | null;
      allowedScopes?: string[] | null;
      webhooksEnabled?: boolean;
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
    if (body.apiAccessEnabled !== undefined) updates.apiAccessEnabled = body.apiAccessEnabled;
    if (body.rateLimitPerMinute !== undefined) updates.rateLimitPerMinute = body.rateLimitPerMinute;
    if (body.burstLimit !== undefined) updates.burstLimit = body.burstLimit;
    if (body.dailyRequestLimit !== undefined) updates.dailyRequestLimit = body.dailyRequestLimit;
    if (body.allowedScopes !== undefined) updates.allowedScopes = body.allowedScopes;
    if (body.webhooksEnabled !== undefined) updates.webhooksEnabled = body.webhooksEnabled;

    await db.update(organizations).set(updates).where(eq(organizations.id, body.id));

    // Audit log
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

// Bulk verify organizations
adminRouter.post(
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

    // Verify orgs exist
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

        // Audit log
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

// Bulk update organization API access
adminRouter.post(
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
        const result = await db
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

// Bulk update organization members
adminRouter.post(
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

    // Check org exists
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
            // Check if user exists
            const user = await db
              .select()
              .from(users)
              .where(eq(users.did, memberAction.did))
              .limit(1);

            if (!user[0]) {
              results.push({ did: memberAction.did, action: 'add', success: false, error: 'User not found' });
              continue;
            }

            // Check if already a member
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
              invitedBy: adminUser.did,
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
            // Can't remove owner
            if (org[0].ownerDid === memberAction.did) {
              results.push({ did: memberAction.did, action: 'remove', success: false, error: 'Cannot remove owner' });
              continue;
            }

            const deleted = await db
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
            // Can't suspend owner
            if (org[0].ownerDid === memberAction.did) {
              results.push({ did: memberAction.did, action: 'suspend', success: false, error: 'Cannot suspend owner' });
              continue;
            }

            await db
              .update(organizationMembers)
              .set({
                status: 'suspended',
                suspendedAt: new Date(),
                suspendedBy: adminUser.did,
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

    // Audit log
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

// Delete organization (admin)
adminRouter.post(
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

    // Audit log before deletion
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'organization.delete',
      targetType: 'organization',
      targetId: body.id,
      details: { name: org[0].name, reason: body.reason },
      createdAt: new Date(),
    });

    // Delete organization (cascade will handle members)
    await db.delete(organizations).where(eq(organizations.id, body.id));

    return c.json({ success: true });
  }
);

// Bulk delete organizations
adminRouter.post(
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

        // Audit log
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'organization.bulkDelete',
          targetType: 'organization',
          targetId: orgId,
          details: { name: org[0].name, reason: body.reason, bulkOperation: true },
          createdAt: new Date(),
        });

        // Delete organization
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

// ============================================
// Content Moderation (Sprint 2)
// ============================================

// List content
adminRouter.get(
  '/io.exprsn.admin.content.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const type = c.req.query('type') || 'video'; // video, comment
    const authorDid = c.req.query('authorDid');
    const sort = c.req.query('sort') || 'recent';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    if (type === 'video') {
      let conditions = [];
      if (authorDid) conditions.push(eq(videos.authorDid, authorDid));

      const videoList = await db
        .select({
          uri: videos.uri,
          authorDid: videos.authorDid,
          caption: videos.caption,
          thumbnailUrl: videos.thumbnailUrl,
          viewCount: videos.viewCount,
          likeCount: videos.likeCount,
          commentCount: videos.commentCount,
          visibility: videos.visibility,
          createdAt: videos.createdAt,
        })
        .from(videos)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(videos.createdAt))
        .limit(limit);

      return c.json({ content: videoList, type: 'video' });
    }

    if (type === 'comment') {
      let conditions = [];
      if (authorDid) conditions.push(eq(comments.authorDid, authorDid));

      const commentList = await db
        .select({
          uri: comments.uri,
          authorDid: comments.authorDid,
          videoUri: comments.videoUri,
          text: comments.text,
          likeCount: comments.likeCount,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(comments.createdAt))
        .limit(limit);

      return c.json({ content: commentList, type: 'comment' });
    }

    return c.json({ error: 'InvalidRequest', message: 'Invalid content type' }, 400);
  }
);

// Remove content
adminRouter.post(
  '/io.exprsn.admin.content.remove',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      contentType: 'video' | 'comment';
      contentUri: string;
      reason: string;
      reportId?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.contentType || !body.contentUri || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'contentType, contentUri, and reason are required' },
        400
      );
    }

    // Record moderation action
    const actionId = nanoid();
    await db.insert(moderationActions).values({
      id: actionId,
      adminId: adminUser.id,
      contentType: body.contentType,
      contentUri: body.contentUri,
      actionType: 'remove',
      reason: body.reason,
      reportId: body.reportId,
      createdAt: new Date(),
    });

    // Update content visibility
    if (body.contentType === 'video') {
      await db
        .update(videos)
        .set({ visibility: 'removed' })
        .where(eq(videos.uri, body.contentUri));
    }

    // If there's a report, update its status
    if (body.reportId) {
      await db
        .update(contentReports)
        .set({
          status: 'actioned',
          reviewedBy: adminUser.id,
          reviewedAt: new Date(),
          actionTaken: 'removed',
        })
        .where(eq(contentReports.id, body.reportId));
    }

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: `content.remove`,
      targetType: body.contentType,
      targetId: body.contentUri,
      details: { reason: body.reason, reportId: body.reportId },
      createdAt: new Date(),
    });

    return c.json({ success: true, actionId });
  }
);

// Restore content
adminRouter.post(
  '/io.exprsn.admin.content.restore',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      contentType: 'video' | 'comment';
      contentUri: string;
      reason: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.contentType || !body.contentUri || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'contentType, contentUri, and reason are required' },
        400
      );
    }

    // Record moderation action
    const actionId = nanoid();
    await db.insert(moderationActions).values({
      id: actionId,
      adminId: adminUser.id,
      contentType: body.contentType,
      contentUri: body.contentUri,
      actionType: 'restore',
      reason: body.reason,
      createdAt: new Date(),
    });

    // Restore content visibility
    if (body.contentType === 'video') {
      await db
        .update(videos)
        .set({ visibility: 'public' })
        .where(eq(videos.uri, body.contentUri));
    }

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: `content.restore`,
      targetType: body.contentType,
      targetId: body.contentUri,
      details: { reason: body.reason },
      createdAt: new Date(),
    });

    return c.json({ success: true, actionId });
  }
);

// ============================================
// Reports (Sprint 2)
// ============================================

// List reports
adminRouter.get(
  '/io.exprsn.admin.reports.list',
  requirePermission(ADMIN_PERMISSIONS.REPORTS_VIEW),
  async (c) => {
    const status = c.req.query('status') || 'pending';
    const contentType = c.req.query('contentType');
    const reason = c.req.query('reason');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    let conditions = [eq(contentReports.status, status)];

    if (contentType) {
      conditions.push(eq(contentReports.contentType, contentType));
    }

    if (reason) {
      conditions.push(eq(contentReports.reason, reason));
    }

    const reports = await db
      .select()
      .from(contentReports)
      .where(and(...conditions))
      .orderBy(desc(contentReports.createdAt))
      .limit(limit);

    // Get reporter info
    const reporterDids = [...new Set(reports.map((r) => r.reporterDid))];
    const reporters = reporterDids.length > 0
      ? await db
          .select({
            did: users.did,
            handle: users.handle,
            displayName: users.displayName,
            avatar: users.avatar,
          })
          .from(users)
          .where(inArray(users.did, reporterDids))
      : [];

    const reporterMap = new Map(reporters.map((r) => [r.did, r]));

    return c.json({
      reports: reports.map((r) => ({
        ...r,
        reporter: reporterMap.get(r.reporterDid) || null,
      })),
    });
  }
);

// Get report details
adminRouter.get(
  '/io.exprsn.admin.reports.get',
  requirePermission(ADMIN_PERMISSIONS.REPORTS_VIEW),
  async (c) => {
    const reportId = c.req.query('id');

    if (!reportId) {
      return c.json({ error: 'InvalidRequest', message: 'id is required' }, 400);
    }

    const [report] = await db
      .select()
      .from(contentReports)
      .where(eq(contentReports.id, reportId))
      .limit(1);

    if (!report) {
      return c.json({ error: 'NotFound', message: 'Report not found' }, 404);
    }

    // Get reporter info
    const [reporter] = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.did, report.reporterDid))
      .limit(1);

    // Get content info based on type
    let content = null;
    if (report.contentType === 'video') {
      const [video] = await db
        .select()
        .from(videos)
        .where(eq(videos.uri, report.contentUri))
        .limit(1);
      content = video;
    } else if (report.contentType === 'comment') {
      const [comment] = await db
        .select()
        .from(comments)
        .where(eq(comments.uri, report.contentUri))
        .limit(1);
      content = comment;
    } else if (report.contentType === 'user') {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.did, report.contentUri))
        .limit(1);
      content = user;
    }

    // Get related reports (same content)
    const relatedReports = await db
      .select()
      .from(contentReports)
      .where(
        and(
          eq(contentReports.contentUri, report.contentUri),
          sql`${contentReports.id} != ${reportId}`
        )
      )
      .orderBy(desc(contentReports.createdAt))
      .limit(10);

    return c.json({
      report,
      reporter,
      content,
      relatedReports,
    });
  }
);

// Take action on report
adminRouter.post(
  '/io.exprsn.admin.reports.action',
  requirePermission(ADMIN_PERMISSIONS.REPORTS_ACTION),
  async (c) => {
    const body = await c.req.json<{
      reportId: string;
      action: 'remove' | 'warn' | 'restrict';
      reason: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.reportId || !body.action || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'reportId, action, and reason are required' },
        400
      );
    }

    const [report] = await db
      .select()
      .from(contentReports)
      .where(eq(contentReports.id, body.reportId))
      .limit(1);

    if (!report) {
      return c.json({ error: 'NotFound', message: 'Report not found' }, 404);
    }

    // Record moderation action
    const actionId = nanoid();
    await db.insert(moderationActions).values({
      id: actionId,
      adminId: adminUser.id,
      contentType: report.contentType,
      contentUri: report.contentUri,
      actionType: body.action,
      reason: body.reason,
      reportId: body.reportId,
      createdAt: new Date(),
    });

    // Update report status
    await db
      .update(contentReports)
      .set({
        status: 'actioned',
        reviewedBy: adminUser.id,
        reviewedAt: new Date(),
        actionTaken: body.action,
      })
      .where(eq(contentReports.id, body.reportId));

    // Apply the action
    if (body.action === 'remove' && report.contentType === 'video') {
      await db
        .update(videos)
        .set({ visibility: 'removed' })
        .where(eq(videos.uri, report.contentUri));
    }

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: `report.action.${body.action}`,
      targetType: 'report',
      targetId: body.reportId,
      details: { contentUri: report.contentUri, reason: body.reason },
      createdAt: new Date(),
    });

    return c.json({ success: true, actionId });
  }
);

// Dismiss report
adminRouter.post(
  '/io.exprsn.admin.reports.dismiss',
  requirePermission(ADMIN_PERMISSIONS.REPORTS_ACTION),
  async (c) => {
    const body = await c.req.json<{ reportId: string; reason?: string }>();
    const adminUser = c.get('adminUser');

    if (!body.reportId) {
      return c.json({ error: 'InvalidRequest', message: 'reportId is required' }, 400);
    }

    await db
      .update(contentReports)
      .set({
        status: 'dismissed',
        reviewedBy: adminUser.id,
        reviewedAt: new Date(),
      })
      .where(eq(contentReports.id, body.reportId));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'report.dismiss',
      targetType: 'report',
      targetId: body.reportId,
      details: { reason: body.reason },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// ============================================
// Analytics Dashboard
// ============================================

adminRouter.get(
  '/io.exprsn.admin.analytics.dashboard',
  requirePermission(ADMIN_PERMISSIONS.ANALYTICS_VIEW),
  async (c) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get counts
    const [
      [userCount],
      [videoCount],
      [commentCount],
      [pendingReportCount],
      [newUsersToday],
      [newUsersWeek],
      [newVideosToday],
      [newVideosWeek],
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(videos),
      db.select({ count: count() }).from(comments),
      db.select({ count: count() }).from(contentReports).where(eq(contentReports.status, 'pending')),
      db.select({ count: count() }).from(users).where(gte(users.createdAt, today)),
      db.select({ count: count() }).from(users).where(gte(users.createdAt, weekAgo)),
      db.select({ count: count() }).from(videos).where(gte(videos.createdAt, today)),
      db.select({ count: count() }).from(videos).where(gte(videos.createdAt, weekAgo)),
    ]);

    // Get total views and likes
    const [viewStats] = await db
      .select({
        totalViews: sql<number>`COALESCE(SUM(${videos.viewCount}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${videos.likeCount}), 0)`,
      })
      .from(videos);

    // Get top videos by views
    const topVideos = await db
      .select({
        uri: videos.uri,
        caption: videos.caption,
        authorDid: videos.authorDid,
        viewCount: videos.viewCount,
        likeCount: videos.likeCount,
        thumbnailUrl: videos.thumbnailUrl,
      })
      .from(videos)
      .orderBy(desc(videos.viewCount))
      .limit(5);

    // Get top creators by followers
    const topCreators = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        followerCount: users.followerCount,
        videoCount: users.videoCount,
        verified: users.verified,
      })
      .from(users)
      .orderBy(desc(users.followerCount))
      .limit(5);

    // Get recent activity
    const recentUsers = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(5);

    const recentVideos = await db
      .select({
        uri: videos.uri,
        caption: videos.caption,
        authorDid: videos.authorDid,
        thumbnailUrl: videos.thumbnailUrl,
        viewCount: videos.viewCount,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .orderBy(desc(videos.createdAt))
      .limit(5);

    // Get moderation stats
    const [actionedReports] = await db
      .select({ count: count() })
      .from(contentReports)
      .where(eq(contentReports.status, 'actioned'));

    const [dismissedReports] = await db
      .select({ count: count() })
      .from(contentReports)
      .where(eq(contentReports.status, 'dismissed'));

    return c.json({
      stats: {
        totalUsers: userCount?.count || 0,
        totalVideos: videoCount?.count || 0,
        totalComments: commentCount?.count || 0,
        totalViews: viewStats?.totalViews || 0,
        totalLikes: viewStats?.totalLikes || 0,
        pendingReports: pendingReportCount?.count || 0,
        actionedReports: actionedReports?.count || 0,
        dismissedReports: dismissedReports?.count || 0,
        newUsersToday: newUsersToday?.count || 0,
        newUsersWeek: newUsersWeek?.count || 0,
        newVideosToday: newVideosToday?.count || 0,
        newVideosWeek: newVideosWeek?.count || 0,
      },
      topVideos,
      topCreators,
      recentActivity: {
        users: recentUsers,
        videos: recentVideos,
      },
    });
  }
);

// ============================================
// System Config (Sprint 1 stub)
// ============================================

adminRouter.get(
  '/io.exprsn.admin.config.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const configs = await db.select().from(systemConfig);
    return c.json({ configs });
  }
);

adminRouter.post(
  '/io.exprsn.admin.config.set',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ key: string; value: unknown; description?: string }>();
    const adminUser = c.get('adminUser');

    if (!body.key) {
      return c.json({ error: 'InvalidRequest', message: 'key is required' }, 400);
    }

    await db
      .insert(systemConfig)
      .values({
        key: body.key,
        value: body.value,
        description: body.description,
        updatedBy: adminUser.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value: body.value,
          description: body.description,
          updatedBy: adminUser.id,
          updatedAt: new Date(),
        },
      });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'config.set',
      targetType: 'config',
      targetId: body.key,
      details: { value: body.value },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// ============================================
// Admin Management (Super Admin only)
// ============================================

adminRouter.get(
  '/io.exprsn.admin.admins.list',
  superAdminMiddleware,
  async (c) => {
    const admins = await db
      .select({
        admin: adminUsers,
        user: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(adminUsers)
      .leftJoin(users, eq(adminUsers.userDid, users.did))
      .orderBy(desc(adminUsers.createdAt));

    return c.json({
      admins: admins.map((a) => ({
        ...a.admin,
        user: a.user,
        permissions: getAdminPermissions(a.admin),
      })),
    });
  }
);

adminRouter.post(
  '/io.exprsn.admin.admins.add',
  superAdminMiddleware,
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      role: 'admin' | 'moderator' | 'support';
      permissions?: string[];
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.role) {
      return c.json({ error: 'InvalidRequest', message: 'userDid and role are required' }, 400);
    }

    // Check if user exists
    const [user] = await db.select().from(users).where(eq(users.did, body.userDid)).limit(1);
    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    // Check if already admin
    const [existing] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.userDid, body.userDid))
      .limit(1);

    if (existing) {
      return c.json({ error: 'AlreadyExists', message: 'User is already an admin' }, 400);
    }

    const adminId = nanoid();
    await db.insert(adminUsers).values({
      id: adminId,
      userDid: body.userDid,
      role: body.role,
      permissions: body.permissions || [],
      invitedBy: adminUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'admin.add',
      targetType: 'admin',
      targetId: adminId,
      details: { userDid: body.userDid, role: body.role },
      createdAt: new Date(),
    });

    return c.json({ success: true, adminId });
  }
);

adminRouter.post(
  '/io.exprsn.admin.admins.update',
  superAdminMiddleware,
  async (c) => {
    const body = await c.req.json<{
      adminId: string;
      role?: 'admin' | 'moderator' | 'support';
      permissions?: string[];
    }>();
    const currentAdmin = c.get('adminUser');

    if (!body.adminId) {
      return c.json({ error: 'InvalidRequest', message: 'adminId is required' }, 400);
    }

    // Cannot modify own role (safety)
    const [targetAdmin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, body.adminId))
      .limit(1);

    if (!targetAdmin) {
      return c.json({ error: 'NotFound', message: 'Admin not found' }, 404);
    }

    if (targetAdmin.role === 'super_admin') {
      return c.json({ error: 'Forbidden', message: 'Cannot modify super admin' }, 403);
    }

    const updates: Partial<typeof adminUsers.$inferInsert> = { updatedAt: new Date() };
    if (body.role) updates.role = body.role;
    if (body.permissions) updates.permissions = body.permissions;

    await db.update(adminUsers).set(updates).where(eq(adminUsers.id, body.adminId));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: currentAdmin.id,
      action: 'admin.update',
      targetType: 'admin',
      targetId: body.adminId,
      details: updates,
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

adminRouter.post(
  '/io.exprsn.admin.admins.remove',
  superAdminMiddleware,
  async (c) => {
    const body = await c.req.json<{ adminId: string }>();
    const currentAdmin = c.get('adminUser');

    if (!body.adminId) {
      return c.json({ error: 'InvalidRequest', message: 'adminId is required' }, 400);
    }

    const [targetAdmin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, body.adminId))
      .limit(1);

    if (!targetAdmin) {
      return c.json({ error: 'NotFound', message: 'Admin not found' }, 404);
    }

    if (targetAdmin.role === 'super_admin') {
      return c.json({ error: 'Forbidden', message: 'Cannot remove super admin' }, 403);
    }

    await db.delete(adminUsers).where(eq(adminUsers.id, body.adminId));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: currentAdmin.id,
      action: 'admin.remove',
      targetType: 'admin',
      targetId: body.adminId,
      details: { userDid: targetAdmin.userDid },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// ============================================
// Audit Log
// ============================================

adminRouter.get(
  '/io.exprsn.admin.audit.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const adminId = c.req.query('adminId');
    const action = c.req.query('action');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    let conditions = [];
    if (adminId) conditions.push(eq(adminAuditLog.adminId, adminId));
    if (action) conditions.push(ilike(adminAuditLog.action, `%${action}%`));

    const logs = await db
      .select()
      .from(adminAuditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit);

    // Get admin info
    const adminIds = [...new Set(logs.map((l) => l.adminId))];
    const admins = adminIds.length > 0
      ? await db
          .select({
            id: adminUsers.id,
            userDid: adminUsers.userDid,
            role: adminUsers.role,
          })
          .from(adminUsers)
          .where(inArray(adminUsers.id, adminIds))
      : [];

    const adminMap = new Map(admins.map((a) => [a.id, a]));

    return c.json({
      logs: logs.map((l) => ({
        ...l,
        admin: adminMap.get(l.adminId) || null,
      })),
    });
  }
);

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

    const query = c.req.query('q');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const cursor = c.req.query('cursor');

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
// Password Management (Admin)
// ============================================

import bcrypt from 'bcryptjs';
import { actorRepos, sessions } from '../db/schema.js';

// Set a new password for a user
adminRouter.post(
  '/io.exprsn.admin.users.setPassword',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      did: string;
      password: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.did || !body.password) {
      return c.json({ error: 'InvalidRequest', message: 'did and password are required' }, 400);
    }

    if (body.password.length < 8) {
      return c.json({ error: 'InvalidRequest', message: 'Password must be at least 8 characters' }, 400);
    }

    // Verify user exists
    const [user] = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, body.did))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(body.password, 10);

    // Update the password
    await db
      .update(actorRepos)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(actorRepos.did, body.did));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.setPassword',
      targetType: 'user',
      targetId: body.did,
      details: { handle: user.handle },
      createdAt: new Date(),
    });

    return c.json({ success: true, message: 'Password updated successfully' });
  }
);

// Generate a temporary password for a user
adminRouter.post(
  '/io.exprsn.admin.users.resetPassword',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      did: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    // Verify user exists
    const [user] = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, body.did))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    // Generate a random temporary password
    const tempPassword = `temp_${nanoid(12)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Update the password
    await db
      .update(actorRepos)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(actorRepos.did, body.did));

    // Invalidate all existing sessions
    await db.delete(sessions).where(eq(sessions.did, body.did));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.resetPassword',
      targetType: 'user',
      targetId: body.did,
      details: { handle: user.handle },
      createdAt: new Date(),
    });

    return c.json({
      success: true,
      temporaryPassword: tempPassword,
      message: 'Password reset. User must change password on next login.'
    });
  }
);

// Force logout a user (invalidate all sessions)
adminRouter.post(
  '/io.exprsn.admin.users.forceLogout',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      did: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    // Count existing sessions
    const [sessionCount] = await db
      .select({ count: count() })
      .from(sessions)
      .where(eq(sessions.did, body.did));

    // Delete all sessions for the user
    await db.delete(sessions).where(eq(sessions.did, body.did));

    // Audit log
    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.forceLogout',
      targetType: 'user',
      targetId: body.did,
      details: { sessionsInvalidated: sessionCount?.count || 0 },
      createdAt: new Date(),
    });

    return c.json({
      success: true,
      sessionsInvalidated: sessionCount?.count || 0,
      message: 'All sessions invalidated'
    });
  }
);

// Get account info (for password management UI)
adminRouter.get(
  '/io.exprsn.admin.users.getAccountInfo',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    // Get actor repo info
    const [actor] = await db
      .select({
        did: actorRepos.did,
        handle: actorRepos.handle,
        email: actorRepos.email,
        status: actorRepos.status,
        hasPassword: sql<boolean>`${actorRepos.passwordHash} IS NOT NULL`,
        createdAt: actorRepos.createdAt,
        updatedAt: actorRepos.updatedAt,
      })
      .from(actorRepos)
      .where(eq(actorRepos.did, did))
      .limit(1);

    if (!actor) {
      return c.json({ error: 'NotFound', message: 'User account not found' }, 404);
    }

    // Count active sessions
    const [sessionCount] = await db
      .select({ count: count() })
      .from(sessions)
      .where(eq(sessions.did, did));

    return c.json({
      account: {
        ...actor,
        activeSessions: sessionCount?.count || 0,
      },
    });
  }
);

// ============================================
// Export Functionality
// ============================================

// Export users
adminRouter.get(
  '/io.exprsn.admin.export.users',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const q = c.req.query('q');
    const verified = c.req.query('verified');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format. Use csv, xlsx, or sqlite' }, 400);
    }

    try {
      const result = await exportUsers({
        format,
        filters: { q, verified },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      // Audit log
      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.users',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount, filters: { q, verified } },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// Export reports
adminRouter.get(
  '/io.exprsn.admin.export.reports',
  requirePermission(ADMIN_PERMISSIONS.REPORTS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const status = c.req.query('status');
    const contentType = c.req.query('contentType');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format' }, 400);
    }

    try {
      const result = await exportReports({
        format,
        filters: { status, contentType },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.reports',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// Export audit logs
adminRouter.get(
  '/io.exprsn.admin.export.auditLogs',
  requirePermission(ADMIN_PERMISSIONS.ADMINS_MANAGE),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const adminId = c.req.query('adminId');
    const action = c.req.query('action');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format' }, 400);
    }

    try {
      const result = await exportAuditLogs({
        format,
        filters: { adminId, action },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.auditLogs',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// Export analytics
adminRouter.get(
  '/io.exprsn.admin.export.analytics',
  requirePermission(ADMIN_PERMISSIONS.ANALYTICS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const period = c.req.query('period');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format' }, 400);
    }

    try {
      const result = await exportAnalytics({
        format,
        filters: { period },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.analytics',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// Export payments
adminRouter.get(
  '/io.exprsn.admin.export.payments',
  requirePermission(ADMIN_PERMISSIONS.ANALYTICS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const status = c.req.query('status');
    const gateway = c.req.query('gateway');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format' }, 400);
    }

    try {
      const result = await exportPayments({
        format,
        filters: { status, gateway },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.payments',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// Export render jobs
adminRouter.get(
  '/io.exprsn.admin.export.renderJobs',
  requirePermission(ADMIN_PERMISSIONS.ANALYTICS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const status = c.req.query('status');
    const userId = c.req.query('userId');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format' }, 400);
    }

    try {
      const result = await exportRenderJobs({
        format,
        filters: { status, userId },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.renderJobs',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// Export organizations
adminRouter.get(
  '/io.exprsn.admin.export.organizations',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const type = c.req.query('type');
    const verified = c.req.query('verified');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format' }, 400);
    }

    try {
      const result = await exportOrganizations({
        format,
        filters: { type, verified },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.organizations',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// Export sanctions
adminRouter.get(
  '/io.exprsn.admin.export.sanctions',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const sanctionType = c.req.query('sanctionType');
    const userDid = c.req.query('userDid');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    if (!['csv', 'xlsx', 'sqlite'].includes(format)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid format' }, 400);
    }

    try {
      const result = await exportSanctions({
        format,
        filters: { sanctionType, userDid },
        dateRange: {
          from: dateFrom ? new Date(dateFrom) : undefined,
          to: dateTo ? new Date(dateTo) : undefined,
        },
      });

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'export.sanctions',
        targetType: 'export',
        targetId: result.filename,
        details: { format, rowCount: result.rowCount },
        createdAt: new Date(),
      });

      return new Response(result.buffer, {
        headers: {
          'Content-Type': result.mimeType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Row-Count': String(result.rowCount),
        },
      });
    } catch (err) {
      console.error('Export error:', err);
      return c.json({ error: 'ExportFailed', message: 'Failed to generate export' }, 500);
    }
  }
);

// ============================================
// Admin Utility Routes
// ============================================

// System diagnostics - health check and stats
adminRouter.get(
  '/io.exprsn.admin.system.diagnostics',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const startTime = Date.now();

    // Check database connectivity
    let dbStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatency = Date.now() - dbStart;
      if (dbLatency > 100) dbStatus = 'degraded';
    } catch {
      dbStatus = 'down';
    }

    // Check Redis connectivity (if available)
    let redisStatus: 'healthy' | 'degraded' | 'down' | 'not_configured' = 'not_configured';
    let redisLatency = 0;
    if (process.env.REDIS_URL) {
      try {
        const { Redis } = await import('ioredis');
        const redis = new Redis(process.env.REDIS_URL);
        const redisStart = Date.now();
        await redis.ping();
        redisLatency = Date.now() - redisStart;
        redisStatus = redisLatency > 50 ? 'degraded' : 'healthy';
        await redis.quit();
      } catch {
        redisStatus = 'down';
      }
    }

    // Get system stats
    const [
      [userCount],
      [videoCount],
      [pendingReports],
      [activeSessions],
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(videos),
      db.select({ count: count() }).from(contentReports).where(eq(contentReports.status, 'pending')),
      db.select({ count: count() }).from(sessions).where(sql`${sessions.expiresAt} > NOW()`),
    ]);

    return c.json({
      status: dbStatus === 'healthy' && (redisStatus === 'healthy' || redisStatus === 'not_configured') ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      latency: Date.now() - startTime,
      services: {
        database: { status: dbStatus, latency: dbLatency },
        redis: { status: redisStatus, latency: redisLatency },
        api: { status: 'healthy', uptime: process.uptime() },
      },
      stats: {
        totalUsers: userCount?.count || 0,
        totalVideos: videoCount?.count || 0,
        pendingReports: pendingReports?.count || 0,
        activeSessions: activeSessions?.count || 0,
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      },
    });
  }
);

// Admin activity feed - recent actions by all admins
adminRouter.get(
  '/io.exprsn.admin.activity.feed',
  requirePermission(ADMIN_PERMISSIONS.ANALYTICS_VIEW),
  async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    const adminDid = c.req.query('adminDid');
    const actionType = c.req.query('action');

    let query = db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt,
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
      .from(adminAuditLog)
      .innerJoin(adminUsers, eq(adminAuditLog.adminId, adminUsers.id))
      .leftJoin(users, eq(adminUsers.userDid, users.did))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply filters
    const conditions = [];
    if (adminDid) {
      conditions.push(eq(adminUsers.userDid, adminDid));
    }
    if (actionType) {
      conditions.push(sql`${adminAuditLog.action} LIKE ${actionType + '%'}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const activities = await query;

    // Group by time periods for the UI
    const grouped = activities.reduce((acc, activity) => {
      const date = new Date(activity.createdAt).toDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push({
        id: activity.id,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        details: activity.details,
        createdAt: activity.createdAt.toISOString(),
        admin: {
          did: activity.admin.userDid,
          role: activity.admin.role,
          handle: activity.user?.handle,
          displayName: activity.user?.displayName,
          avatar: activity.user?.avatar,
        },
      });
      return acc;
    }, {} as Record<string, any[]>);

    return c.json({
      activities: Object.entries(grouped).map(([date, items]) => ({ date, items })),
      pagination: { limit, offset, hasMore: activities.length === limit },
    });
  }
);

// Quick stats - lightweight endpoint for frequent polling
adminRouter.get(
  '/io.exprsn.admin.quickStats',
  requirePermission(ADMIN_PERMISSIONS.ANALYTICS_VIEW),
  async (c) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      [pendingReports],
      [newUsersToday],
      [activeUsersNow],
    ] = await Promise.all([
      db.select({ count: count() }).from(contentReports).where(eq(contentReports.status, 'pending')),
      db.select({ count: count() }).from(users).where(gte(users.createdAt, today)),
      db.select({ count: count() }).from(sessions).where(
        and(
          sql`${sessions.expiresAt} > NOW()`,
          gte(sessions.createdAt, new Date(now.getTime() - 15 * 60 * 1000)) // Active in last 15 min
        )
      ),
    ]);

    return c.json({
      pendingReports: pendingReports?.count || 0,
      newUsersToday: newUsersToday?.count || 0,
      activeUsersNow: activeUsersNow?.count || 0,
      timestamp: now.toISOString(),
    });
  }
);

// Bulk verify users (for verified badge management)
adminRouter.post(
  '/io.exprsn.admin.users.bulkVerify',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDids: string[];
      verified: boolean;
      reason?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDids || !Array.isArray(body.userDids) || body.userDids.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'userDids array is required' }, 400);
    }

    if (body.userDids.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 users per bulk operation' }, 400);
    }

    const results: { did: string; success: boolean; error?: string }[] = [];

    for (const userDid of body.userDids) {
      try {
        await db
          .update(users)
          .set({
            verified: body.verified,
            verifiedAt: body.verified ? new Date() : null,
          })
          .where(eq(users.did, userDid));

        // Audit log
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: body.verified ? 'user.verify' : 'user.unverify',
          targetType: 'user',
          targetId: userDid,
          details: { reason: body.reason, bulkOperation: true },
          createdAt: new Date(),
        });

        results.push({ did: userDid, success: true });
      } catch (err) {
        results.push({ did: userDid, success: false, error: 'Failed to update user' });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return c.json({
      success: results.every((r) => r.success),
      summary: {
        total: body.userDids.length,
        succeeded: successCount,
        failed: body.userDids.length - successCount,
      },
      results,
    });
  }
);

// Search users with fuzzy matching
adminRouter.get(
  '/io.exprsn.admin.users.search',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const q = c.req.query('q');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

    if (!q || q.length < 2) {
      return c.json({ error: 'InvalidRequest', message: 'Query must be at least 2 characters' }, 400);
    }

    const searchPattern = `%${q}%`;

    const results = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        verified: users.verified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        or(
          ilike(users.handle, searchPattern),
          ilike(users.displayName, searchPattern),
          ilike(users.did, searchPattern)
        )
      )
      .orderBy(
        // Prioritize exact handle matches
        sql`CASE WHEN ${users.handle} = ${q} THEN 0
            WHEN ${users.handle} ILIKE ${q + '%'} THEN 1
            ELSE 2 END`,
        desc(users.createdAt)
      )
      .limit(limit);

    return c.json({
      users: results.map((u) => ({
        did: u.did,
        handle: u.handle,
        displayName: u.displayName,
        avatar: u.avatar,
        verified: u.verified,
        createdAt: u.createdAt.toISOString(),
      })),
    });
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
    const q = c.req.query('q');
    const type = c.req.query('type') as 'hosted' | 'federated' | undefined;
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const cursor = c.req.query('cursor');

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
      domains: items.map((d) => ({
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
      })),
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
    const userStats = await db
      .select({
        role: domainUsers.role,
        count: count(),
      })
      .from(domainUsers)
      .where(eq(domainUsers.domainId, id))
      .groupBy(domainUsers.role);

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
        userCount: domain.userCount,
        groupCount: domain.groupCount,
        certificateCount: domain.certificateCount,
        verifiedAt: domain.verifiedAt?.toISOString(),
        createdAt: domain.createdAt.toISOString(),
        updatedAt: domain.updatedAt.toISOString(),
      },
      userStats: userStats.reduce((acc, s) => ({ ...acc, [s.role]: s.count }), {}),
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
    });

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId,
      actorDid: adminDid,
      action: 'domain_created',
      metadata: { name: body.name, domain: body.domain, type: body.type },
    });

    return c.json({
      domain: {
        id: domainId,
        name: body.name,
        domain: body.domain,
        type: body.type,
        status: 'pending',
        dnsVerificationToken,
      },
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
      status?: string;
      features?: Record<string, boolean>;
      rateLimits?: Record<string, number>;
      branding?: Record<string, string>;
      pdsEndpoint?: string;
      ownerOrgId?: string;
      ownerUserDid?: string;
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
    if (body.status) updates.status = body.status;
    if (body.features) updates.features = body.features;
    if (body.rateLimits) updates.rateLimits = body.rateLimits;
    if (body.branding) updates.branding = body.branding;
    if (body.pdsEndpoint !== undefined) updates.pdsEndpoint = body.pdsEndpoint;
    if (body.ownerOrgId !== undefined) updates.ownerOrgId = body.ownerOrgId;
    if (body.ownerUserDid !== undefined) updates.ownerUserDid = body.ownerUserDid;

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
    const body = await c.req.json<{ id: string }>();

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

    // In a real implementation, this would check DNS TXT records
    // For now, we'll just mark it as verified
    await db.update(domains).set({
      status: 'active',
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
      metadata: { domain: domain.domain },
    });

    return c.json({ success: true, verified: true });
  }
);

// List domain users
adminRouter.get(
  '/io.exprsn.admin.domains.users.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const role = c.req.query('role');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    const { domainUsers } = await import('../db/schema.js');

    let conditions = [eq(domainUsers.domainId, domainId)];
    if (role) {
      conditions.push(eq(domainUsers.role, role));
    }

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

    return c.json({
      users: userList.map((u) => ({
        id: u.id,
        userDid: u.userDid,
        role: u.role,
        permissions: u.permissions,
        handle: u.handle,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        user: u.user,
      })),
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
      userDid: string;
      role: 'admin' | 'moderator' | 'member';
      permissions?: string[];
    }>();

    if (!body.domainId || !body.userDid || !body.role) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domains, domainUsers, domainActivityLog } = await import('../db/schema.js');

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
        eq(domainUsers.userDid, body.userDid)
      ))
      .limit(1);

    if (existing) {
      return c.json({ error: 'AlreadyExists', message: 'User already assigned to domain' }, 409);
    }

    const userId = nanoid();
    await db.insert(domainUsers).values({
      id: userId,
      domainId: body.domainId,
      userDid: body.userDid,
      role: body.role,
      permissions: body.permissions || [],
    });

    // Update domain user count
    await db.update(domains).set({
      userCount: sql`${domains.userCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(domains.id, body.domainId));

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'user_added',
      targetType: 'user',
      targetId: body.userDid,
      metadata: { role: body.role },
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

    const { domains, domainUsers, domainActivityLog } = await import('../db/schema.js');

    await db.delete(domainUsers).where(
      and(
        eq(domainUsers.domainId, body.domainId),
        eq(domainUsers.userDid, body.userDid)
      )
    );

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
    }>();

    if (!body.domainId || !body.userDid || !body.role) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

    const { domainUsers, domainActivityLog } = await import('../db/schema.js');

    await db.update(domainUsers).set({
      role: body.role,
      permissions: body.permissions,
      updatedAt: new Date(),
    }).where(
      and(
        eq(domainUsers.domainId, body.domainId),
        eq(domainUsers.userDid, body.userDid)
      )
    );

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'user_role_updated',
      targetType: 'user',
      targetId: body.userDid,
      metadata: { role: body.role },
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
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        permissions: g.permissions,
        memberCount: g.memberCount,
        isDefault: g.isDefault,
        createdAt: g.createdAt.toISOString(),
      })),
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
      isDefault?: boolean;
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
      permissions: body.permissions || [],
      isDefault: body.isDefault || false,
    });

    // Update domain group count
    await db.update(domains).set({
      groupCount: sql`${domains.groupCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(domains.id, body.domainId));

    // Log activity
    const adminDid = c.get('did');
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid: adminDid,
      action: 'group_created',
      targetType: 'group',
      targetId: groupId,
      metadata: { name: body.name },
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
      name?: string;
      description?: string;
      permissions?: string[];
      isDefault?: boolean;
    }>();

    if (!body.groupId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing groupId' }, 400);
    }

    const { domainGroups } = await import('../db/schema.js');

    const updates: any = { updatedAt: new Date() };
    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.permissions) updates.permissions = body.permissions;
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

    await db.update(domainGroups).set(updates).where(eq(domainGroups.id, body.groupId));

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
      conditions.push(sql`${organizations.createdAt} < ${new Date(cursor)}`);
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
      cursor: hasMore ? results[results.length - 1].org.createdAt.toISOString() : undefined,
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
      type: 'team' | 'enterprise' | 'nonprofit' | 'business';
      domainId?: string;
      parentOrganizationId?: string;
      ownerDid?: string;
      website?: string;
    }>();

    if (!body.name || !body.type) {
      return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
    }

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
      type: body.type,
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
