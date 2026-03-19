import { Hono } from 'hono';
import { eq, and, ilike, desc, sql, count, inArray, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  users,
  videos,
  adminUsers,
  adminAuditLog,
  contentReports,
  sessions,
  systemConfig,
  type AdminUser,
} from '../db/schema.js';
import {
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
import { sanitizeSearchQuery } from './admin-users.js';

export const adminAuditRouter = new Hono();

// ============================================
// Audit Log
// ============================================

adminAuditRouter.get(
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
// System Config
// ============================================

adminAuditRouter.get(
  '/io.exprsn.admin.config.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const configs = await db.select().from(systemConfig);
    return c.json({ configs });
  }
);

adminAuditRouter.post(
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
// Admin Team Management (Super Admin only)
// ============================================

adminAuditRouter.get(
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

adminAuditRouter.post(
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

    const [user] = await db.select().from(users).where(eq(users.did, body.userDid)).limit(1);
    if (!user) {
      return c.json({ error: 'NotFound', message: 'User not found' }, 404);
    }

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

adminAuditRouter.post(
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

adminAuditRouter.post(
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
// Export Functionality
// ============================================

adminAuditRouter.get(
  '/io.exprsn.admin.export.users',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const format = (c.req.query('format') || 'csv') as ExportFormat;
    const rawQ = c.req.query('q');
    const verified = c.req.query('verified');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const adminUser = c.get('adminUser');

    const q = sanitizeSearchQuery(rawQ);

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

adminAuditRouter.get(
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

adminAuditRouter.get(
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

adminAuditRouter.get(
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

adminAuditRouter.get(
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

adminAuditRouter.get(
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

adminAuditRouter.get(
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

adminAuditRouter.get(
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

// System diagnostics — health check and stats
adminAuditRouter.get(
  '/io.exprsn.admin.system.diagnostics',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const startTime = Date.now();

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

// Admin activity feed — recent actions by all admins
adminAuditRouter.get(
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
