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
  type AdminUser,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  superAdminMiddleware,
  ADMIN_PERMISSIONS,
  getAdminPermissions,
} from '../auth/middleware.js';

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
