import { Hono } from 'hono';
import { eq, and, or, ilike, desc, sql, count, isNull, gte, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import {
  users,
  videos,
  comments,
  adminUsers,
  contentReports,
  moderationActions,
  userSanctions,
  adminAuditLog,
  organizations,
  organizationMembers,
  organizationActivity,
  sessions,
  domains,
  domainUsers,
  domainRoles,
  domainUserRoles,
  domainGroups,
  domainGroupMembers,
  actorRepos,
  caEntityCertificates,
  caIntermediateCertificates,
  exprsnDidCertificates,
  apiTokens,
  inviteCodes,
} from '../db/schema.js';
import {
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { broadcastAdminActivity, notifyAdmins } from '../websocket/admin.js';
import { certificateManager } from '../services/ca/CertificateManager.js';

export const adminUsersRouter = new Hono();

// ============================================
// Shared helpers
// ============================================

/**
 * Sanitize and validate search query input.
 * Limits length to prevent DoS and removes problematic characters.
 * Returns null if input is invalid/empty after sanitization.
 */
export function sanitizeSearchQuery(input: string | undefined, maxLength = 100): string | null {
  if (!input) return null;

  let sanitized = input.trim().slice(0, maxLength);
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  sanitized = sanitized.replace(/[%_]/g, '');

  if (sanitized.length === 0) return null;

  return sanitized;
}

/**
 * Return a numeric severity rank for a sanction type so the most severe
 * sanction can be selected when a user has multiple active sanctions.
 */
export function severityOrder(sanctionType: string): number {
  const order: Record<string, number> = {
    warning: 1,
    mute: 2,
    suspend: 3,
    ban: 4,
  };
  return order[sanctionType] || 0;
}

// ============================================
// User Management
// ============================================

adminUsersRouter.get(
  '/io.exprsn.admin.users.list',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const rawQuery = c.req.query('q');
    const verified = c.req.query('verified');
    const sort = c.req.query('sort') || 'recent';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    const query = sanitizeSearchQuery(rawQuery);

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

adminUsersRouter.get(
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

    const sanctions = await db
      .select()
      .from(userSanctions)
      .where(eq(userSanctions.userDid, did))
      .orderBy(desc(userSanctions.createdAt))
      .limit(20);

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

adminUsersRouter.post(
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

adminUsersRouter.post(
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

adminUsersRouter.post(
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

    await db
      .update(userSanctions)
      .set({ expiresAt: new Date() })
      .where(eq(userSanctions.id, body.sanctionId));

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

adminUsersRouter.get(
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
// User Suspension and Ban Management
// ============================================

adminUsersRouter.post(
  '/io.exprsn.admin.users.suspend',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      reason: string;
      duration?: number;
      note?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'userDid and reason are required' },
        400
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    const expiresAt = body.duration
      ? new Date(Date.now() + body.duration * 60 * 60 * 1000)
      : null;

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

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.suspend',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        sanctionId,
        reason: body.reason,
        duration: body.duration,
        expiresAt: expiresAt?.toISOString(),
        note: body.note,
      },
      createdAt: new Date(),
    });

    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'user_suspend',
      targetType: 'user',
      targetId: user.handle,
    });

    notifyAdmins({
      type: 'sanction',
      title: 'User Suspended',
      message: `${adminUserData?.handle || 'Admin'} suspended ${user.handle}${body.duration ? ` for ${body.duration} hours` : ' indefinitely'}`,
      severity: 'warning',
      data: { userDid: body.userDid, duration: body.duration },
    });

    return c.json({
      success: true,
      sanctionId,
      expiresAt: expiresAt?.toISOString(),
    });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.unsuspend',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      reason?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'userDid is required' }, 400);
    }

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

    await db
      .update(userSanctions)
      .set({ expiresAt: new Date() })
      .where(eq(userSanctions.id, suspension.id));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.unsuspend',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        originalSanctionId: suspension.id,
        reason: body.reason || 'Suspension lifted',
      },
      createdAt: new Date(),
    });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'user_unsuspend',
      targetType: 'user',
      targetId: user?.handle || body.userDid,
    });

    notifyAdmins({
      type: 'sanction',
      title: 'User Unsuspended',
      message: `${adminUserData?.handle || 'Admin'} removed suspension for ${user?.handle || body.userDid}`,
      severity: 'info',
      data: { userDid: body.userDid },
    });

    return c.json({ success: true });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.ban',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      reason: string;
      note?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.reason) {
      return c.json(
        { error: 'InvalidRequest', message: 'userDid and reason are required' },
        400
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    const sanctionId = nanoid();
    await db.insert(userSanctions).values({
      id: sanctionId,
      userDid: body.userDid,
      adminId: adminUser.id,
      sanctionType: 'ban',
      reason: body.reason,
      expiresAt: null,
      createdAt: new Date(),
    });

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.ban',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        sanctionId,
        reason: body.reason,
        note: body.note,
        permanent: true,
      },
      createdAt: new Date(),
    });

    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'user_ban',
      targetType: 'user',
      targetId: user.handle,
    });

    notifyAdmins({
      type: 'sanction',
      title: 'User Banned',
      message: `${adminUserData?.handle || 'Admin'} permanently banned ${user.handle}`,
      severity: 'error',
      data: { userDid: body.userDid },
    });

    return c.json({
      success: true,
      sanctionId,
    });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.unban',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      reason?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'userDid is required' }, 400);
    }

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

    await db
      .update(userSanctions)
      .set({ expiresAt: new Date() })
      .where(eq(userSanctions.id, ban.id));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.unban',
      targetType: 'user',
      targetId: body.userDid,
      details: {
        originalSanctionId: ban.id,
        reason: body.reason || 'Ban lifted',
      },
      createdAt: new Date(),
    });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, body.userDid))
      .limit(1);

    const adminUserData = await db.query.users.findFirst({
      where: eq(users.did, adminUser.userDid),
      columns: { handle: true },
    });

    broadcastAdminActivity({
      adminDid: adminUser.userDid,
      adminHandle: adminUserData?.handle || 'unknown',
      action: 'user_unban',
      targetType: 'user',
      targetId: user?.handle || body.userDid,
    });

    notifyAdmins({
      type: 'sanction',
      title: 'User Unbanned',
      message: `${adminUserData?.handle || 'Admin'} removed ban for ${user?.handle || body.userDid}`,
      severity: 'info',
      data: { userDid: body.userDid },
    });

    return c.json({ success: true });
  }
);

adminUsersRouter.get(
  '/io.exprsn.admin.users.moderationHistory',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const userDid = c.req.query('userDid');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');

    if (!userDid) {
      return c.json({ error: 'InvalidRequest', message: 'userDid is required' }, 400);
    }

    const sanctions = await db
      .select({
        id: userSanctions.id,
        sanctionType: userSanctions.sanctionType,
        reason: userSanctions.reason,
        expiresAt: userSanctions.expiresAt,
        appealStatus: userSanctions.appealStatus,
        appealNote: userSanctions.appealNote,
        createdAt: userSanctions.createdAt,
        adminId: userSanctions.adminId,
        adminHandle: users.handle,
      })
      .from(userSanctions)
      .leftJoin(adminUsers, eq(userSanctions.adminId, adminUsers.id))
      .leftJoin(users, eq(adminUsers.userDid, users.did))
      .where(eq(userSanctions.userDid, userDid))
      .orderBy(desc(userSanctions.createdAt))
      .limit(limit)
      .offset(offset);

    const actions = await db
      .select({
        id: moderationActions.id,
        actionType: moderationActions.actionType,
        contentType: moderationActions.contentType,
        contentUri: moderationActions.contentUri,
        reason: moderationActions.reason,
        createdAt: moderationActions.createdAt,
        adminId: moderationActions.adminId,
        adminHandle: users.handle,
      })
      .from(moderationActions)
      .leftJoin(adminUsers, eq(moderationActions.adminId, adminUsers.id))
      .leftJoin(users, eq(adminUsers.userDid, users.did))
      .where(eq(moderationActions.contentUri, userDid))
      .orderBy(desc(moderationActions.createdAt))
      .limit(limit)
      .offset(offset);

    const auditLogs = await db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt,
        adminId: adminAuditLog.adminId,
        adminHandle: users.handle,
      })
      .from(adminAuditLog)
      .leftJoin(adminUsers, eq(adminAuditLog.adminId, adminUsers.id))
      .leftJoin(users, eq(adminUsers.userDid, users.did))
      .where(
        and(
          eq(adminAuditLog.targetType, 'user'),
          eq(adminAuditLog.targetId, userDid)
        )
      )
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit)
      .offset(offset);

    const [sanctionCount] = await db
      .select({ count: count() })
      .from(userSanctions)
      .where(eq(userSanctions.userDid, userDid));

    const [actionCount] = await db
      .select({ count: count() })
      .from(moderationActions)
      .where(eq(moderationActions.contentUri, userDid));

    const [auditCount] = await db
      .select({ count: count() })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.targetType, 'user'),
          eq(adminAuditLog.targetId, userDid)
        )
      );

    const activeSanctions = await db
      .select()
      .from(userSanctions)
      .where(
        and(
          eq(userSanctions.userDid, userDid),
          or(
            isNull(userSanctions.expiresAt),
            gte(userSanctions.expiresAt, new Date())
          )
        )
      )
      .orderBy(desc(userSanctions.createdAt));

    return c.json({
      sanctions,
      moderationActions: actions,
      auditLog: auditLogs,
      activeSanctions,
      counts: {
        totalSanctions: sanctionCount?.count || 0,
        totalActions: actionCount?.count || 0,
        totalAuditEntries: auditCount?.count || 0,
      },
      pagination: {
        limit,
        offset,
      },
    });
  }
);

// ============================================
// Bulk User Actions
// ============================================

adminUsersRouter.post(
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

    if (body.userDids.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 users per bulk operation' }, 400);
    }

    if (body.sanctionType === 'ban' && !permissions.includes(ADMIN_PERMISSIONS.USERS_BAN)) {
      return c.json({ error: 'Forbidden', message: 'Ban permission required' }, 403);
    }

    const results: { did: string; success: boolean; sanctionId?: string; error?: string }[] = [];
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const existingUsers = await db
      .select({ did: users.did })
      .from(users)
      .where(inArray(users.did, body.userDids));

    const existingDids = new Set(existingUsers.map((u) => u.did));

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

    if (successCount > 0) {
      const adminHandleUser = await db.query.users.findFirst({
        where: eq(users.did, adminUser.userDid),
        columns: { handle: true },
      });

      broadcastAdminActivity({
        adminDid: adminUser.userDid,
        adminHandle: adminHandleUser?.handle || 'unknown',
        action: `bulk_sanction_${body.sanctionType}`,
        targetType: 'users',
        targetId: `${successCount} users`,
      });

      notifyAdmins({
        type: 'sanction',
        title: 'Bulk Sanction Applied',
        message: `${adminHandleUser?.handle || 'Admin'} applied ${body.sanctionType} to ${successCount} user(s)`,
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

adminUsersRouter.post(
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

    if (body.userDids.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 users per bulk operation' }, 400);
    }

    const results: { did: string; success: boolean; temporaryPassword?: string; error?: string }[] = [];

    const existingUsers = await db
      .select({ did: actorRepos.did, handle: actorRepos.handle })
      .from(actorRepos)
      .where(inArray(actorRepos.did, body.userDids));

    const existingMap = new Map(existingUsers.map((u) => [u.did, u]));

    for (const userDid of body.userDids) {
      const user = existingMap.get(userDid);
      if (!user) {
        results.push({ did: userDid, success: false, error: 'User account not found' });
        continue;
      }

      try {
        const tempPassword = `temp_${nanoid(12)}`;
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        await db
          .update(actorRepos)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(actorRepos.did, userDid));

        await db.delete(sessions).where(eq(sessions.did, userDid));

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

adminUsersRouter.post(
  '/io.exprsn.admin.users.bulkDelete',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{
      userDids: string[];
      reason: string;
      hardDelete?: boolean;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDids || !Array.isArray(body.userDids) || body.userDids.length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'userDids array is required' }, 400);
    }

    if (!body.reason) {
      return c.json({ error: 'InvalidRequest', message: 'reason is required' }, 400);
    }

    if (body.userDids.length > 50) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 50 users per bulk delete operation' }, 400);
    }

    const results: { did: string; success: boolean; error?: string }[] = [];

    const existingUsers = await db
      .select({ did: users.did, handle: users.handle })
      .from(users)
      .where(inArray(users.did, body.userDids));

    const existingMap = new Map(existingUsers.map((u) => [u.did, u]));

    for (const userDid of body.userDids) {
      const user = existingMap.get(userDid);
      if (!user) {
        results.push({ did: userDid, success: false, error: 'User not found' });
        continue;
      }

      try {
        if (body.hardDelete) {
          await db.delete(sessions).where(eq(sessions.did, userDid));
          await db.delete(userSanctions).where(eq(userSanctions.userDid, userDid));
          await db
            .update(videos)
            .set({ visibility: 'removed' })
            .where(eq(videos.authorDid, userDid));
          await db.delete(actorRepos).where(eq(actorRepos.did, userDid));
          await db.delete(users).where(eq(users.did, userDid));
        } else {
          const sanctionId = nanoid();
          await db.insert(userSanctions).values({
            id: sanctionId,
            userDid,
            adminId: adminUser.id,
            sanctionType: 'ban',
            reason: `Account deleted: ${body.reason}`,
            expiresAt: null,
            createdAt: new Date(),
          });

          await db.delete(sessions).where(eq(sessions.did, userDid));

          await db
            .update(actorRepos)
            .set({ status: 'deactivated', updatedAt: new Date() })
            .where(eq(actorRepos.did, userDid));
        }

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

adminUsersRouter.post(
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

    if (body.userDids.length > 100) {
      return c.json({ error: 'InvalidRequest', message: 'Maximum 100 users per bulk operation' }, 400);
    }

    const results: { did: string; success: boolean; sessionsInvalidated: number; error?: string }[] = [];

    for (const userDid of body.userDids) {
      try {
        const [sessionCount] = await db
          .select({ count: count() })
          .from(sessions)
          .where(eq(sessions.did, userDid));

        await db.delete(sessions).where(eq(sessions.did, userDid));

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

adminUsersRouter.post(
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

// Bulk verify users (verified badge management)
adminUsersRouter.post(
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
          })
          .where(eq(users.did, userDid));

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
adminUsersRouter.get(
  '/io.exprsn.admin.users.search',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const rawQ = c.req.query('q');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

    const q = sanitizeSearchQuery(rawQ);

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
// User Domain/Org/Role/Group Management
// ============================================

adminUsersRouter.get(
  '/io.exprsn.admin.users.getMemberships',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const userDid = c.req.query('did');

    if (!userDid) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    const domainMemberships = await db
      .select({
        domainUser: domainUsers,
        domain: {
          id: domains.id,
          name: domains.name,
          displayName: domains.name,
        },
      })
      .from(domainUsers)
      .innerJoin(domains, eq(domains.id, domainUsers.domainId))
      .where(eq(domainUsers.userDid, userDid));

    const domainUserIds = domainMemberships.map((dm) => dm.domainUser.id);
    const userRoles = domainUserIds.length > 0
      ? await db
          .select({
            domainUserId: domainUserRoles.domainUserId,
            role: {
              id: domainRoles.id,
              name: domainRoles.name,
              displayName: domainRoles.displayName,
              permissions: domainRoles.permissions,
            },
          })
          .from(domainUserRoles)
          .innerJoin(domainRoles, eq(domainRoles.id, domainUserRoles.roleId))
          .where(inArray(domainUserRoles.domainUserId, domainUserIds))
      : [];

    const rolesByDomainUser = new Map<string, typeof userRoles>();
    for (const ur of userRoles) {
      const existing = rolesByDomainUser.get(ur.domainUserId) || [];
      existing.push(ur);
      rolesByDomainUser.set(ur.domainUserId, existing);
    }

    const groupMemberships = await db
      .select({
        membership: domainGroupMembers,
        group: {
          id: domainGroups.id,
          name: domainGroups.name,
          description: domainGroups.description,
          domainId: domainGroups.domainId,
        },
        domain: {
          id: domains.id,
          name: domains.name,
        },
      })
      .from(domainGroupMembers)
      .innerJoin(domainGroups, eq(domainGroups.id, domainGroupMembers.groupId))
      .innerJoin(domains, eq(domains.id, domainGroups.domainId))
      .where(eq(domainGroupMembers.userDid, userDid));

    const orgMemberships = await db
      .select({
        member: organizationMembers,
        org: {
          id: organizations.id,
          name: organizations.name,
          type: organizations.type,
          avatar: organizations.avatar,
        },
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userDid, userDid));

    return c.json({
      domains: domainMemberships.map((dm) => ({
        id: dm.domainUser.id,
        domainId: dm.domain.id,
        domainName: dm.domain.name,
        domainDisplayName: dm.domain.displayName,
        role: dm.domainUser.role,
        handle: dm.domainUser.handle,
        isActive: dm.domainUser.isActive,
        createdAt: dm.domainUser.createdAt,
        roles: (rolesByDomainUser.get(dm.domainUser.id) || []).map((r) => r.role),
      })),
      groups: groupMemberships.map((gm) => ({
        id: gm.membership.id,
        groupId: gm.group.id,
        groupName: gm.group.name,
        groupDescription: gm.group.description,
        domainId: gm.domain.id,
        domainName: gm.domain.name,
        createdAt: gm.membership.createdAt,
      })),
      organizations: orgMemberships.map((om) => ({
        id: om.member.id,
        orgId: om.org.id,
        orgName: om.org.name,
        orgType: om.org.type,
        orgAvatar: om.org.avatar,
        role: om.member.role,
        permissions: om.member.permissions,
        joinedAt: om.member.joinedAt,
      })),
    });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.addToDomain',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      domainId: string;
      role?: string;
      handle?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.domainId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid and domainId are required' }, 400);
    }

    const [domain] = await db.select().from(domains).where(eq(domains.id, body.domainId)).limit(1);
    if (!domain) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const [user] = await db.select().from(users).where(eq(users.did, body.userDid)).limit(1);
    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    const [existing] = await db
      .select()
      .from(domainUsers)
      .where(and(eq(domainUsers.domainId, body.domainId), eq(domainUsers.userDid, body.userDid)))
      .limit(1);

    if (existing) {
      return c.json({ error: 'Conflict', message: 'User is already a member of this domain' }, 409);
    }

    const domainUserId = nanoid();
    await db.insert(domainUsers).values({
      id: domainUserId,
      domainId: body.domainId,
      userDid: body.userDid,
      role: body.role || 'member',
      handle: body.handle || user.handle,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.addToDomain',
      targetType: 'user',
      targetId: body.userDid,
      details: { domainId: body.domainId, role: body.role || 'member' },
      createdAt: new Date(),
    });

    return c.json({ success: true, domainUserId });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.removeFromDomain',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      domainId: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.domainId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid and domainId are required' }, 400);
    }

    await db
      .delete(domainUsers)
      .where(and(eq(domainUsers.domainId, body.domainId), eq(domainUsers.userDid, body.userDid)));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.removeFromDomain',
      targetType: 'user',
      targetId: body.userDid,
      details: { domainId: body.domainId },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.addToOrganization',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      organizationId: string;
      role?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.organizationId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid and organizationId are required' }, 400);
    }

    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, memberCount: organizations.memberCount })
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);
    if (!org) {
      return c.json({ error: 'NotFound', message: 'Organization not found' }, 404);
    }

    const [user] = await db.select().from(users).where(eq(users.did, body.userDid)).limit(1);
    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    const [existing] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, body.organizationId),
          eq(organizationMembers.userDid, body.userDid)
        )
      )
      .limit(1);

    if (existing) {
      return c.json({ error: 'Conflict', message: 'User is already a member of this organization' }, 409);
    }

    const memberId = nanoid();
    await db.insert(organizationMembers).values({
      id: memberId,
      organizationId: body.organizationId,
      userDid: body.userDid,
      role: body.role || 'member',
      permissions: [],
      joinedAt: new Date(),
    });

    await db
      .update(organizations)
      .set({ memberCount: org.memberCount + 1 })
      .where(eq(organizations.id, body.organizationId));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.addToOrganization',
      targetType: 'user',
      targetId: body.userDid,
      details: { organizationId: body.organizationId, role: body.role || 'member' },
      createdAt: new Date(),
    });

    return c.json({ success: true, memberId });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.removeFromOrganization',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      organizationId: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.organizationId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid and organizationId are required' }, 400);
    }

    const [org] = await db
      .select({ memberCount: organizations.memberCount })
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);

    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, body.organizationId),
          eq(organizationMembers.userDid, body.userDid)
        )
      );

    if (org && org.memberCount > 0) {
      await db
        .update(organizations)
        .set({ memberCount: org.memberCount - 1 })
        .where(eq(organizations.id, body.organizationId));
    }

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.removeFromOrganization',
      targetType: 'user',
      targetId: body.userDid,
      details: { organizationId: body.organizationId },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.assignDomainRole',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      domainId: string;
      roleId: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.domainId || !body.roleId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid, domainId, and roleId are required' }, 400);
    }

    const [domainUser] = await db
      .select()
      .from(domainUsers)
      .where(and(eq(domainUsers.domainId, body.domainId), eq(domainUsers.userDid, body.userDid)))
      .limit(1);

    if (!domainUser) {
      return c.json({ error: 'NotFound', message: 'User is not a member of this domain' }, 404);
    }

    const [role] = await db
      .select()
      .from(domainRoles)
      .where(and(eq(domainRoles.id, body.roleId), eq(domainRoles.domainId, body.domainId)))
      .limit(1);

    if (!role) {
      return c.json({ error: 'NotFound', message: 'Role not found in this domain' }, 404);
    }

    const [existing] = await db
      .select()
      .from(domainUserRoles)
      .where(
        and(eq(domainUserRoles.domainUserId, domainUser.id), eq(domainUserRoles.roleId, body.roleId))
      )
      .limit(1);

    if (existing) {
      return c.json({ error: 'Conflict', message: 'User already has this role' }, 409);
    }

    const userRoleId = nanoid();
    await db.insert(domainUserRoles).values({
      id: userRoleId,
      domainUserId: domainUser.id,
      roleId: body.roleId,
      assignedBy: adminUser.userDid,
      createdAt: new Date(),
    });

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.assignDomainRole',
      targetType: 'user',
      targetId: body.userDid,
      details: { domainId: body.domainId, roleId: body.roleId, roleName: role.name },
      createdAt: new Date(),
    });

    return c.json({ success: true, userRoleId });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.removeDomainRole',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      domainId: string;
      roleId: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.domainId || !body.roleId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid, domainId, and roleId are required' }, 400);
    }

    const [domainUser] = await db
      .select()
      .from(domainUsers)
      .where(and(eq(domainUsers.domainId, body.domainId), eq(domainUsers.userDid, body.userDid)))
      .limit(1);

    if (!domainUser) {
      return c.json({ error: 'NotFound', message: 'User is not a member of this domain' }, 404);
    }

    await db
      .delete(domainUserRoles)
      .where(
        and(eq(domainUserRoles.domainUserId, domainUser.id), eq(domainUserRoles.roleId, body.roleId))
      );

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.removeDomainRole',
      targetType: 'user',
      targetId: body.userDid,
      details: { domainId: body.domainId, roleId: body.roleId },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.addToGroup',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      groupId: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.groupId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid and groupId are required' }, 400);
    }

    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    const [user] = await db.select().from(users).where(eq(users.did, body.userDid)).limit(1);
    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    const [existing] = await db
      .select()
      .from(domainGroupMembers)
      .where(
        and(eq(domainGroupMembers.groupId, body.groupId), eq(domainGroupMembers.userDid, body.userDid))
      )
      .limit(1);

    if (existing) {
      return c.json({ error: 'Conflict', message: 'User is already a member of this group' }, 409);
    }

    const membershipId = nanoid();
    await db.insert(domainGroupMembers).values({
      id: membershipId,
      groupId: body.groupId,
      userDid: body.userDid,
      addedBy: adminUser.userDid,
      createdAt: new Date(),
    });

    await db
      .update(domainGroups)
      .set({ memberCount: group.memberCount + 1 })
      .where(eq(domainGroups.id, body.groupId));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.addToGroup',
      targetType: 'user',
      targetId: body.userDid,
      details: { groupId: body.groupId, groupName: group.name },
      createdAt: new Date(),
    });

    return c.json({ success: true, membershipId });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.removeFromGroup',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      groupId: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid || !body.groupId) {
      return c.json({ error: 'InvalidRequest', message: 'userDid and groupId are required' }, 400);
    }

    const [group] = await db
      .select({ memberCount: domainGroups.memberCount })
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    await db
      .delete(domainGroupMembers)
      .where(
        and(eq(domainGroupMembers.groupId, body.groupId), eq(domainGroupMembers.userDid, body.userDid))
      );

    if (group && group.memberCount > 0) {
      await db
        .update(domainGroups)
        .set({ memberCount: group.memberCount - 1 })
        .where(eq(domainGroups.id, body.groupId));
    }

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'user.removeFromGroup',
      targetType: 'user',
      targetId: body.userDid,
      details: { groupId: body.groupId },
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// Get available domains for assignment
adminUsersRouter.get(
  '/io.exprsn.admin.domains.listAll',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const rawQ = c.req.query('q');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    const q = sanitizeSearchQuery(rawQ);

    let conditions = [];
    if (q) {
      conditions.push(or(ilike(domains.name, `%${q}%`), ilike(domains.domain, `%${q}%`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const domainList = await db
      .select({
        id: domains.id,
        name: domains.name,
        displayName: domains.name,
        userCount: domains.userCount,
        status: domains.status,
      })
      .from(domains)
      .where(whereClause)
      .orderBy(domains.name)
      .limit(limit);

    return c.json({ domains: domainList });
  }
);

// Get available organizations for assignment
adminUsersRouter.get(
  '/io.exprsn.admin.organizations.listAll',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const rawQ = c.req.query('q');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    const q = sanitizeSearchQuery(rawQ);

    let conditions = [];
    if (q) {
      conditions.push(or(ilike(organizations.name, `%${q}%`), ilike(organizations.description, `%${q}%`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orgList = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        avatar: organizations.avatar,
        memberCount: organizations.memberCount,
        verified: organizations.verified,
      })
      .from(organizations)
      .where(whereClause)
      .orderBy(organizations.name)
      .limit(limit);

    return c.json({ organizations: orgList });
  }
);

// Get available roles for a domain
adminUsersRouter.get(
  '/io.exprsn.admin.domains.getRoles',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId is required' }, 400);
    }

    const roles = await db
      .select({
        id: domainRoles.id,
        name: domainRoles.name,
        displayName: domainRoles.displayName,
        description: domainRoles.description,
        isSystem: domainRoles.isSystem,
        priority: domainRoles.priority,
        permissions: domainRoles.permissions,
      })
      .from(domainRoles)
      .where(eq(domainRoles.domainId, domainId))
      .orderBy(domainRoles.priority);

    return c.json({ roles });
  }
);

// Get available groups for a domain
adminUsersRouter.get(
  '/io.exprsn.admin.domains.getGroups',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'domainId is required' }, 400);
    }

    const groups = await db
      .select({
        id: domainGroups.id,
        name: domainGroups.name,
        description: domainGroups.description,
        memberCount: domainGroups.memberCount,
        isDefault: domainGroups.isDefault,
      })
      .from(domainGroups)
      .where(eq(domainGroups.domainId, domainId))
      .orderBy(domainGroups.name);

    return c.json({ groups });
  }
);

// ============================================
// Password Management
// ============================================

adminUsersRouter.post(
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

    const [user] = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, body.did))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    await db
      .update(actorRepos)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(actorRepos.did, body.did));

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

adminUsersRouter.post(
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

    const [user] = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, body.did))
      .limit(1);

    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

    const tempPassword = `temp_${nanoid(12)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await db
      .update(actorRepos)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(actorRepos.did, body.did));

    await db.delete(sessions).where(eq(sessions.did, body.did));

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
      message: 'Password reset. User must change password on next login.',
    });
  }
);

adminUsersRouter.post(
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

    const [sessionCount] = await db
      .select({ count: count() })
      .from(sessions)
      .where(eq(sessions.did, body.did));

    await db.delete(sessions).where(eq(sessions.did, body.did));

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
    });
  }
);

adminUsersRouter.get(
  '/io.exprsn.admin.users.getAccountInfo',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

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
// User Certificates
// ============================================

adminUsersRouter.get(
  '/io.exprsn.admin.users.certificates',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    // Get entity certificates for this user
    const entityCerts = await db
      .select({
        id: caEntityCertificates.id,
        commonName: caEntityCertificates.commonName,
        certType: caEntityCertificates.certType,
        serialNumber: caEntityCertificates.serialNumber,
        fingerprint: caEntityCertificates.fingerprint,
        status: caEntityCertificates.status,
        notBefore: caEntityCertificates.notBefore,
        notAfter: caEntityCertificates.notAfter,
        issuerId: caEntityCertificates.issuerId,
        createdAt: caEntityCertificates.createdAt,
      })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.subjectDid, did))
      .orderBy(desc(caEntityCertificates.createdAt));

    // Get did:exprsn certificate
    const [didCert] = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did));

    return c.json({
      certificates: entityCerts.map((cert) => ({
        id: cert.id,
        commonName: cert.commonName,
        certType: cert.certType,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint,
        status: cert.status,
        notBefore: cert.notBefore.toISOString(),
        notAfter: cert.notAfter.toISOString(),
        issuerId: cert.issuerId,
      })),
      didCertificate: didCert
        ? {
            id: didCert.id,
            certificateId: didCert.certificateId,
            certificateType: didCert.certificateType,
            publicKeyMultibase: didCert.publicKeyMultibase,
            status: didCert.status,
            organizationId: didCert.organizationId,
            createdAt: didCert.createdAt.toISOString(),
          }
        : undefined,
    });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.certificates.revoke',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const { certId, reason } = await c.req.json<{ certId: string; reason: string }>();

    if (!certId || !reason) {
      return c.json({ error: 'InvalidRequest', message: 'certId and reason are required' }, 400);
    }

    await db
      .update(caEntityCertificates)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revocationReason: reason,
      })
      .where(eq(caEntityCertificates.id, certId));

    // Cascade: revoke all API tokens issued from this certificate
    const cascadedResult = await db
      .update(apiTokens)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedReason: `Certificate ${certId} revoked: ${reason}`,
      })
      .where(
        and(
          eq(apiTokens.certificateId, certId),
          eq(apiTokens.status, 'active')
        )
      )
      .returning({ id: apiTokens.id });

    return c.json({ success: true, cascadedTokens: cascadedResult.length });
  }
);

// ============================================
// User Sessions & Tokens
// ============================================

adminUsersRouter.get(
  '/io.exprsn.admin.users.sessions',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    // Get sessions
    const userSessions = await db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.did, did))
      .orderBy(desc(sessions.createdAt));

    // Get API tokens
    const userTokens = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        tokenType: apiTokens.tokenType,
        scopes: apiTokens.scopes,
        status: apiTokens.status,
        createdAt: apiTokens.createdAt,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        lastUsedIp: apiTokens.lastUsedIp,
        usageCount: apiTokens.usageCount,
      })
      .from(apiTokens)
      .where(eq(apiTokens.ownerDid, did))
      .orderBy(desc(apiTokens.createdAt));

    return c.json({
      sessions: userSessions.map((s) => ({
        id: s.id,
        tokenType: 'local',
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        isActive: new Date(s.expiresAt) > new Date(),
      })),
      tokens: userTokens.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.tokenPrefix,
        scopes: (t.scopes as string[]) || [],
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt?.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString(),
        usageCount: t.usageCount,
      })),
    });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.sessions.revoke',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const { sessionId } = await c.req.json<{ sessionId: string }>();

    if (!sessionId) {
      return c.json({ error: 'InvalidRequest', message: 'sessionId is required' }, 400);
    }

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    return c.json({ success: true });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.tokens.revoke',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const { tokenId } = await c.req.json<{ tokenId: string }>();

    if (!tokenId) {
      return c.json({ error: 'InvalidRequest', message: 'tokenId is required' }, 400);
    }

    await db
      .update(apiTokens)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedReason: 'Administrative revocation',
      })
      .where(eq(apiTokens.id, tokenId));

    return c.json({ success: true });
  }
);

// ============================================
// Issue Certificate for User
// ============================================

adminUsersRouter.post(
  '/io.exprsn.admin.users.certificates.issue',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const {
      did,
      type,
      commonName,
    } = await c.req.json<{
      did: string;
      type: 'client' | 'code_signing';
      commonName?: string;
    }>();

    if (!did || !type) {
      return c.json({ error: 'InvalidRequest', message: 'did and type are required' }, 400);
    }

    if (type !== 'client' && type !== 'code_signing') {
      return c.json({ error: 'InvalidRequest', message: 'type must be client or code_signing' }, 400);
    }

    // Find an active intermediate CA to issue from
    const [activeIntermediate] = await db
      .select({ id: caIntermediateCertificates.id })
      .from(caIntermediateCertificates)
      .where(eq(caIntermediateCertificates.status, 'active'))
      .limit(1);

    const resolvedCommonName = commonName || did;

    const cert = await certificateManager.issueCertificate({
      commonName: resolvedCommonName,
      certType: type,
      subjectDid: did,
      validityDays: 365,
      issuerId: activeIntermediate?.id,
    });

    // Ensure subjectDid is set on the certificate record
    await db
      .update(caEntityCertificates)
      .set({ subjectDid: did })
      .where(eq(caEntityCertificates.id, cert.id));

    // Fetch full record to return complete details
    const issuedRows = await db
      .select({
        id: caEntityCertificates.id,
        commonName: caEntityCertificates.commonName,
        certType: caEntityCertificates.certType,
        serialNumber: caEntityCertificates.serialNumber,
        fingerprint: caEntityCertificates.fingerprint,
        status: caEntityCertificates.status,
        notBefore: caEntityCertificates.notBefore,
        notAfter: caEntityCertificates.notAfter,
      })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, cert.id));

    const issued = issuedRows[0];

    if (!issued) {
      return c.json({ error: 'InternalError', message: 'Failed to retrieve issued certificate' }, 500);
    }

    return c.json({
      success: true,
      certificate: {
        id: issued.id,
        commonName: issued.commonName,
        certType: issued.certType,
        serialNumber: issued.serialNumber,
        fingerprint: issued.fingerprint,
        status: issued.status,
        notBefore: issued.notBefore.toISOString(),
        notAfter: issued.notAfter.toISOString(),
      },
    });
  }
);

// ============================================
// Create API Token for User
// ============================================

adminUsersRouter.post(
  '/io.exprsn.admin.users.tokens.create',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const {
      did,
      name,
      scopes,
      tokenType,
      certificateId,
      expiresIn,
    } = await c.req.json<{
      did: string;
      name: string;
      scopes: string[];
      tokenType?: 'personal' | 'service';
      certificateId?: string;
      expiresIn?: number;
    }>();

    if (!did || !name || !scopes || !Array.isArray(scopes)) {
      return c.json(
        { error: 'InvalidRequest', message: 'did, name, and scopes are required' },
        400
      );
    }

    const rawToken = 'exp_' + nanoid(32);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenId = nanoid();

    await db.insert(apiTokens).values({
      id: tokenId,
      tokenHash,
      tokenPrefix: rawToken.slice(0, 12),
      name,
      ownerDid: did,
      certificateId: certificateId || null,
      tokenType: tokenType || 'personal',
      scopes,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      status: 'active',
    });

    return c.json({
      success: true,
      token: rawToken,
      id: tokenId,
      name,
      prefix: rawToken.slice(0, 12),
    });
  }
);

// ============================================
// Update API Token
// ============================================

adminUsersRouter.post(
  '/io.exprsn.admin.users.tokens.update',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const {
      tokenId,
      name,
      scopes,
    } = await c.req.json<{
      tokenId: string;
      name?: string;
      scopes?: string[];
    }>();

    if (!tokenId) {
      return c.json({ error: 'InvalidRequest', message: 'tokenId is required' }, 400);
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (scopes !== undefined) updates.scopes = scopes;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'At least one field to update is required' }, 400);
    }

    await db
      .update(apiTokens)
      .set(updates)
      .where(eq(apiTokens.id, tokenId));

    return c.json({ success: true });
  }
);

// ============================================
// User Invite Codes
// ============================================

adminUsersRouter.get(
  '/io.exprsn.admin.users.inviteCodes',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    const codes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        status: inviteCodes.status,
        maxUses: inviteCodes.maxUses,
        usedCount: inviteCodes.usedCount,
        usedBy: inviteCodes.usedBy,
        expiresAt: inviteCodes.expiresAt,
        createdAt: inviteCodes.createdAt,
        domainId: inviteCodes.domainId,
        metadata: inviteCodes.metadata,
      })
      .from(inviteCodes)
      .where(eq(inviteCodes.issuerDid, did))
      .orderBy(desc(inviteCodes.createdAt));

    return c.json({
      inviteCodes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        usedBy: c.usedBy,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        domainId: c.domainId,
        metadata: c.metadata,
      })),
    });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.inviteCodes.create',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const {
      did,
      maxUses,
      expiresIn,
      domainId,
      metadata,
    } = await c.req.json<{
      did: string;
      maxUses?: number;
      expiresIn?: number;
      domainId?: string;
      metadata?: { name?: string; description?: string };
    }>();

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'did is required' }, 400);
    }

    const code = nanoid(8).toUpperCase();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const codeId = nanoid();

    await db.insert(inviteCodes).values({
      id: codeId,
      code,
      codeHash,
      issuerDid: did,
      domainId: domainId || null,
      maxUses: maxUses ?? 1,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      metadata: metadata || null,
      status: 'active',
    });

    return c.json({
      success: true,
      inviteCode: {
        id: codeId,
        code,
        maxUses: maxUses ?? 1,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        status: 'active',
      },
    });
  }
);

adminUsersRouter.post(
  '/io.exprsn.admin.users.inviteCodes.revoke',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const { codeId } = await c.req.json<{ codeId: string }>();

    if (!codeId) {
      return c.json({ error: 'InvalidRequest', message: 'codeId is required' }, 400);
    }

    await db
      .update(inviteCodes)
      .set({ status: 'revoked' })
      .where(eq(inviteCodes.id, codeId));

    return c.json({ success: true });
  }
);
