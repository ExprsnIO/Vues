import { Hono } from 'hono';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  users,
  videos,
  comments,
  adminAuditLog,
  contentReports,
  moderationActions,
  featuredContent,
} from '../db/schema.js';
import {
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';

export const adminVideosRouter = new Hono();

// ============================================
// Content Moderation
// ============================================

adminVideosRouter.get(
  '/io.exprsn.admin.content.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const type = c.req.query('type') || 'video';
    const authorDid = c.req.query('authorDid');
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

adminVideosRouter.post(
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

    if (body.contentType === 'video') {
      await db
        .update(videos)
        .set({ visibility: 'removed' })
        .where(eq(videos.uri, body.contentUri));
    }

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

adminVideosRouter.post(
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

    if (body.contentType === 'video') {
      await db
        .update(videos)
        .set({ visibility: 'public' })
        .where(eq(videos.uri, body.contentUri));
    }

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
// Reports
// ============================================

adminVideosRouter.get(
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

adminVideosRouter.get(
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

adminVideosRouter.post(
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

    await db
      .update(contentReports)
      .set({
        status: 'actioned',
        reviewedBy: adminUser.id,
        reviewedAt: new Date(),
        actionTaken: body.action,
      })
      .where(eq(contentReports.id, body.reportId));

    if (body.action === 'remove' && report.contentType === 'video') {
      await db
        .update(videos)
        .set({ visibility: 'removed' })
        .where(eq(videos.uri, report.contentUri));
    }

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

adminVideosRouter.post(
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
