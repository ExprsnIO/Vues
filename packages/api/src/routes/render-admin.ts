/**
 * Render Pipeline Admin API
 * Manage render jobs, workers, and user quotas
 */

import { Hono } from 'hono';
import { eq, and, desc, sql, count, inArray, gte, avg } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  renderJobs,
  renderBatches,
  userRenderQuotas,
  renderWorkers,
  users,
  adminAuditLog,
} from '../db/schema.js';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { getRenderService } from '../services/studio/RenderService.js';

export const renderAdminRouter = new Hono();

// Apply admin auth to all routes
renderAdminRouter.use('*', adminAuthMiddleware);

// ============================================
// Queue Dashboard & Stats
// ============================================

/**
 * Get render queue statistics
 */
renderAdminRouter.get(
  '/io.exprsn.admin.render.getQueueStats',
  requirePermission(ADMIN_PERMISSIONS.ANALYTICS_VIEW),
  async (c) => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);

    const [
      [pending],
      [rendering],
      [completed],
      [failed],
      [paused],
      [completedToday],
      [avgDuration],
    ] = await Promise.all([
      db.select({ count: count() }).from(renderJobs).where(eq(renderJobs.status, 'pending')),
      db.select({ count: count() }).from(renderJobs).where(eq(renderJobs.status, 'rendering')),
      db.select({ count: count() }).from(renderJobs).where(eq(renderJobs.status, 'completed')),
      db.select({ count: count() }).from(renderJobs).where(eq(renderJobs.status, 'failed')),
      db.select({ count: count() }).from(renderJobs).where(eq(renderJobs.status, 'paused')),
      db.select({ count: count() }).from(renderJobs)
        .where(and(eq(renderJobs.status, 'completed'), gte(renderJobs.renderCompletedAt, dayAgo))),
      db.select({ avg: avg(renderJobs.actualDurationSeconds) })
        .from(renderJobs)
        .where(and(eq(renderJobs.status, 'completed'), gte(renderJobs.renderCompletedAt, dayAgo))),
    ]);

    // Get priority breakdown for pending/queued jobs
    const priorityCounts = await db
      .select({
        priority: renderJobs.priority,
        count: count(),
      })
      .from(renderJobs)
      .where(inArray(renderJobs.status, ['pending', 'queued']))
      .groupBy(renderJobs.priority);

    // Get active workers
    const [activeWorkers] = await db
      .select({ count: count() })
      .from(renderWorkers)
      .where(eq(renderWorkers.status, 'active'));

    return c.json({
      stats: {
        pending: pending?.count || 0,
        rendering: rendering?.count || 0,
        completed: completed?.count || 0,
        failed: failed?.count || 0,
        paused: paused?.count || 0,
        completedToday: completedToday?.count || 0,
        avgDurationSeconds: avgDuration?.avg ? Number(avgDuration.avg) : 0,
        activeWorkers: activeWorkers?.count || 0,
      },
      priorityBreakdown: Object.fromEntries(
        priorityCounts.map((p) => [p.priority || 'normal', p.count])
      ),
    });
  }
);

// ============================================
// Job Management
// ============================================

/**
 * List render jobs
 */
renderAdminRouter.get(
  '/io.exprsn.admin.render.listJobs',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const priority = c.req.query('priority');
    const userDid = c.req.query('userDid');
    const batchId = c.req.query('batchId');
    const sort = c.req.query('sort') || 'created';
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
    const cursor = c.req.query('cursor');

    // Build conditions
    const conditions: ReturnType<typeof eq>[] = [];
    if (status) conditions.push(eq(renderJobs.status, status));
    if (priority) conditions.push(eq(renderJobs.priority, priority));
    if (userDid) conditions.push(eq(renderJobs.userDid, userDid));
    if (batchId) conditions.push(eq(renderJobs.batchId, batchId));

    const orderBy = sort === 'priority'
      ? desc(renderJobs.priorityScore)
      : desc(renderJobs.createdAt);

    const jobs = await db
      .select({
        job: renderJobs,
        user: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(renderJobs)
      .leftJoin(users, eq(renderJobs.userDid, users.did))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(limit + 1);

    const hasMore = jobs.length > limit;
    const items = hasMore ? jobs.slice(0, -1) : jobs;

    return c.json({
      jobs: items.map((j) => ({
        ...j.job,
        user: j.user,
      })),
      cursor: hasMore ? items[items.length - 1]?.job.id : undefined,
    });
  }
);

/**
 * Get job details
 */
renderAdminRouter.get(
  '/io.exprsn.admin.render.getJob',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const jobId = c.req.query('jobId');

    if (!jobId) {
      return c.json({ error: 'InvalidRequest', message: 'jobId is required' }, 400);
    }

    const [job] = await db
      .select({
        job: renderJobs,
        user: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(renderJobs)
      .leftJoin(users, eq(renderJobs.userDid, users.did))
      .where(eq(renderJobs.id, jobId))
      .limit(1);

    if (!job) {
      return c.json({ error: 'NotFound', message: 'Job not found' }, 404);
    }

    // Get dependency info
    let dependency = null;
    if (job.job.dependsOnJobId) {
      const [dep] = await db
        .select()
        .from(renderJobs)
        .where(eq(renderJobs.id, job.job.dependsOnJobId))
        .limit(1);
      dependency = dep || null;
    }

    // Get dependents
    const dependents = await db
      .select({ id: renderJobs.id, status: renderJobs.status })
      .from(renderJobs)
      .where(eq(renderJobs.dependsOnJobId, jobId));

    return c.json({
      job: { ...job.job, user: job.user },
      dependency,
      dependents,
    });
  }
);

/**
 * Pause a job
 */
renderAdminRouter.post(
  '/io.exprsn.admin.render.pauseJob',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ jobId: string }>();
    const adminUser = c.get('adminUser');

    if (!body.jobId) {
      return c.json({ error: 'InvalidRequest', message: 'jobId is required' }, 400);
    }

    try {
      const renderService = getRenderService();
      const success = await renderService.adminPauseJob(body.jobId, adminUser.id);

      if (success) {
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'render.pauseJob',
          targetType: 'renderJob',
          targetId: body.jobId,
          createdAt: new Date(),
        });
      }

      return c.json({ success });
    } catch (error) {
      console.error('[RenderAdmin] pauseJob error:', error);
      return c.json({ success: false, error: 'Failed to pause job' });
    }
  }
);

/**
 * Resume a paused job
 */
renderAdminRouter.post(
  '/io.exprsn.admin.render.resumeJob',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ jobId: string }>();
    const adminUser = c.get('adminUser');

    if (!body.jobId) {
      return c.json({ error: 'InvalidRequest', message: 'jobId is required' }, 400);
    }

    try {
      const renderService = getRenderService();
      const success = await renderService.adminResumeJob(body.jobId);

      if (success) {
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'render.resumeJob',
          targetType: 'renderJob',
          targetId: body.jobId,
          createdAt: new Date(),
        });
      }

      return c.json({ success });
    } catch (error) {
      console.error('[RenderAdmin] resumeJob error:', error);
      return c.json({ success: false, error: 'Failed to resume job' });
    }
  }
);

/**
 * Cancel a job
 */
renderAdminRouter.post(
  '/io.exprsn.admin.render.cancelJob',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ jobId: string; reason?: string }>();
    const adminUser = c.get('adminUser');

    if (!body.jobId) {
      return c.json({ error: 'InvalidRequest', message: 'jobId is required' }, 400);
    }

    try {
      const renderService = getRenderService();
      const success = await renderService.cancelJob(body.jobId, 'admin');

      if (success) {
        await db.update(renderJobs).set({
          errorMessage: `Cancelled by admin: ${body.reason || 'No reason provided'}`,
        }).where(eq(renderJobs.id, body.jobId));

        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'render.cancelJob',
          targetType: 'renderJob',
          targetId: body.jobId,
          details: { reason: body.reason },
          createdAt: new Date(),
        });
      }

      return c.json({ success });
    } catch (error) {
      console.error('[RenderAdmin] cancelJob error:', error);
      return c.json({ success: false, error: 'Failed to cancel job' });
    }
  }
);

/**
 * Retry a failed job
 */
renderAdminRouter.post(
  '/io.exprsn.admin.render.retryJob',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ jobId: string }>();
    const adminUser = c.get('adminUser');

    if (!body.jobId) {
      return c.json({ error: 'InvalidRequest', message: 'jobId is required' }, 400);
    }

    const [job] = await db.select().from(renderJobs).where(eq(renderJobs.id, body.jobId)).limit(1);

    if (!job) {
      return c.json({ error: 'NotFound', message: 'Job not found' }, 404);
    }

    try {
      const renderService = getRenderService();
      const newJobId = await renderService.retryJob(body.jobId, job.userDid);

      await db.insert(adminAuditLog).values({
        id: nanoid(),
        adminId: adminUser.id,
        action: 'render.retryJob',
        targetType: 'renderJob',
        targetId: body.jobId,
        details: { newJobId },
        createdAt: new Date(),
      });

      return c.json({ success: true, newJobId });
    } catch (error) {
      console.error('[RenderAdmin] retryJob error:', error);
      return c.json({ success: false, error: 'Failed to retry job' });
    }
  }
);

/**
 * Update job priority
 */
renderAdminRouter.post(
  '/io.exprsn.admin.render.updatePriority',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ jobId: string; priority: 'low' | 'normal' | 'high' | 'urgent' }>();
    const adminUser = c.get('adminUser');

    if (!body.jobId || !body.priority) {
      return c.json({ error: 'InvalidRequest', message: 'jobId and priority are required' }, 400);
    }

    if (!['low', 'normal', 'high', 'urgent'].includes(body.priority)) {
      return c.json({ error: 'InvalidRequest', message: 'Invalid priority value' }, 400);
    }

    try {
      const renderService = getRenderService();
      const success = await renderService.adminUpdatePriority(body.jobId, body.priority);

      if (success) {
        await db.insert(adminAuditLog).values({
          id: nanoid(),
          adminId: adminUser.id,
          action: 'render.updatePriority',
          targetType: 'renderJob',
          targetId: body.jobId,
          details: { priority: body.priority },
          createdAt: new Date(),
        });
      }

      return c.json({ success });
    } catch (error) {
      console.error('[RenderAdmin] updatePriority error:', error);
      return c.json({ success: false, error: 'Failed to update priority' });
    }
  }
);

// ============================================
// Worker Management
// ============================================

/**
 * List render workers
 */
renderAdminRouter.get(
  '/io.exprsn.admin.render.listWorkers',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const workers = await db
      .select()
      .from(renderWorkers)
      .orderBy(desc(renderWorkers.lastHeartbeat));

    // Mark workers as offline if no heartbeat in 60 seconds
    const now = new Date();
    const updatedWorkers = workers.map((w) => ({
      ...w,
      status: w.lastHeartbeat && (now.getTime() - new Date(w.lastHeartbeat).getTime()) < 60000
        ? w.status
        : 'offline',
    }));

    return c.json({ workers: updatedWorkers });
  }
);

/**
 * Drain a worker (stop accepting new jobs)
 */
renderAdminRouter.post(
  '/io.exprsn.admin.render.drainWorker',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ workerId: string }>();
    const adminUser = c.get('adminUser');

    if (!body.workerId) {
      return c.json({ error: 'InvalidRequest', message: 'workerId is required' }, 400);
    }

    await db.update(renderWorkers).set({
      status: 'draining',
    }).where(eq(renderWorkers.id, body.workerId));

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'render.drainWorker',
      targetType: 'renderWorker',
      targetId: body.workerId,
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// ============================================
// User Quotas
// ============================================

/**
 * Get user render quota
 */
renderAdminRouter.get(
  '/io.exprsn.admin.render.getUserQuota',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const userDid = c.req.query('userDid');

    if (!userDid) {
      return c.json({ error: 'InvalidRequest', message: 'userDid is required' }, 400);
    }

    let quota = await db.query.userRenderQuotas.findFirst({
      where: eq(userRenderQuotas.userDid, userDid),
    });

    if (!quota) {
      // Return default quota
      quota = {
        userDid,
        dailyLimit: 10,
        dailyUsed: 0,
        dailyResetAt: null,
        weeklyLimit: 50,
        weeklyUsed: 0,
        weeklyResetAt: null,
        concurrentLimit: 2,
        maxQuality: 'ultra',
        priorityBoost: 0,
        updatedAt: new Date(),
      };
    }

    // Get recent render jobs
    const recentJobs = await db
      .select()
      .from(renderJobs)
      .where(eq(renderJobs.userDid, userDid))
      .orderBy(desc(renderJobs.createdAt))
      .limit(20);

    return c.json({ quota, recentJobs });
  }
);

/**
 * Update user render quota
 */
renderAdminRouter.post(
  '/io.exprsn.admin.render.updateUserQuota',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const body = await c.req.json<{
      userDid: string;
      dailyLimit?: number;
      weeklyLimit?: number;
      concurrentLimit?: number;
      maxQuality?: 'draft' | 'medium' | 'high' | 'ultra';
      priorityBoost?: number;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.userDid) {
      return c.json({ error: 'InvalidRequest', message: 'userDid is required' }, 400);
    }

    // Upsert quota
    const existingQuota = await db.query.userRenderQuotas.findFirst({
      where: eq(userRenderQuotas.userDid, body.userDid),
    });

    if (existingQuota) {
      await db.update(userRenderQuotas).set({
        dailyLimit: body.dailyLimit ?? existingQuota.dailyLimit,
        weeklyLimit: body.weeklyLimit ?? existingQuota.weeklyLimit,
        concurrentLimit: body.concurrentLimit ?? existingQuota.concurrentLimit,
        maxQuality: body.maxQuality ?? existingQuota.maxQuality,
        priorityBoost: body.priorityBoost ?? existingQuota.priorityBoost,
        updatedAt: new Date(),
      }).where(eq(userRenderQuotas.userDid, body.userDid));
    } else {
      await db.insert(userRenderQuotas).values({
        userDid: body.userDid,
        dailyLimit: body.dailyLimit,
        weeklyLimit: body.weeklyLimit,
        concurrentLimit: body.concurrentLimit,
        maxQuality: body.maxQuality,
        priorityBoost: body.priorityBoost,
        updatedAt: new Date(),
      });
    }

    await db.insert(adminAuditLog).values({
      id: nanoid(),
      adminId: adminUser.id,
      action: 'render.updateUserQuota',
      targetType: 'user',
      targetId: body.userDid,
      details: body,
      createdAt: new Date(),
    });

    return c.json({ success: true });
  }
);

// ============================================
// Batches
// ============================================

/**
 * List render batches
 */
renderAdminRouter.get(
  '/io.exprsn.admin.render.listBatches',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);

    const conditions: ReturnType<typeof eq>[] = [];
    if (status) conditions.push(eq(renderBatches.status, status));

    const batches = await db
      .select({
        batch: renderBatches,
        user: {
          did: users.did,
          handle: users.handle,
          displayName: users.displayName,
        },
      })
      .from(renderBatches)
      .leftJoin(users, eq(renderBatches.userDid, users.did))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(renderBatches.createdAt))
      .limit(limit);

    return c.json({
      batches: batches.map((b) => ({
        ...b.batch,
        user: b.user,
      })),
    });
  }
);

export default renderAdminRouter;
