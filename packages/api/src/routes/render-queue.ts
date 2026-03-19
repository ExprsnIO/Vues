/**
 * Render Queue Management Routes
 *
 * API endpoints for managing render jobs, queues, and priorities.
 * Includes user-facing endpoints and admin endpoints.
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and, desc, asc, sql, gte, lte, inArray } from 'drizzle-orm';
import { authMiddleware, adminAuthMiddleware } from '../auth/middleware.js';
import {
  renderRateLimitMiddleware,
  verifyJobOwnershipMiddleware,
  renderServiceHealthMiddleware,
  validateRenderConfigMiddleware,
  checkStorageQuotaMiddleware,
  getUserRenderStats,
} from '../middleware/render-pipeline.js';
import { renderJobController, type RenderJobConfig } from '../controllers/RenderJobController.js';

const renderQueueRouter = new Hono();

// =========================================
// User-facing endpoints
// =========================================

/**
 * Get user's render jobs
 */
renderQueueRouter.get('/jobs', authMiddleware, async (c) => {
  const userDid = c.get('did')!;
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let query = db
    .select({
      id: schema.renderJobs.id,
      projectId: schema.renderJobs.projectId,
      status: schema.renderJobs.status,
      progress: schema.renderJobs.progress,
      currentStep: schema.renderJobs.currentStep,
      outputUrl: schema.renderJobs.outputUrl,
      outputSize: schema.renderJobs.outputSize,
      duration: schema.renderJobs.duration,
      errorMessage: schema.renderJobs.errorMessage,
      createdAt: schema.renderJobs.createdAt,
      renderStartedAt: schema.renderJobs.renderStartedAt,
      renderCompletedAt: schema.renderJobs.renderCompletedAt,
    })
    .from(schema.renderJobs)
    .where(
      status
        ? and(eq(schema.renderJobs.userDid, userDid), eq(schema.renderJobs.status, status))
        : eq(schema.renderJobs.userDid, userDid)
    )
    .orderBy(desc(schema.renderJobs.createdAt))
    .limit(limit)
    .offset(offset);

  const jobs = await query;

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.userDid, userDid));

  return c.json({
    jobs,
    pagination: {
      total: countResult?.count || 0,
      limit,
      offset,
      hasMore: (countResult?.count || 0) > offset + limit,
    },
  });
});

/**
 * Get a specific render job
 */
renderQueueRouter.get('/jobs/:jobId', authMiddleware, verifyJobOwnershipMiddleware, async (c) => {
  const jobId = c.req.param('jobId')!;

  const [job] = await db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({ job });
});

/**
 * Create a new render job
 */
renderQueueRouter.post(
  '/jobs',
  authMiddleware,
  renderServiceHealthMiddleware,
  renderRateLimitMiddleware,
  checkStorageQuotaMiddleware,
  validateRenderConfigMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json().catch(() => ({}));

    // Build config from validated body
    const config: Partial<RenderJobConfig> = {
      resolution: body.resolution || '1080p',
      format: body.format || 'mp4',
      fps: body.fps ? parseInt(body.fps, 10) : 30,
      quality: body.quality || 'high',
    };

    // Create and queue the job using the controller
    const result = await renderJobController.createJob(
      userDid,
      body.projectId,
      config,
      body.priority || 'normal'
    );

    return c.json(
      {
        jobId: result.jobId,
        position: result.position,
        status: 'pending',
        message: 'Render job queued successfully',
      },
      201
    );
  }
);

/**
 * Cancel a render job
 */
renderQueueRouter.post('/jobs/:jobId/cancel', authMiddleware, verifyJobOwnershipMiddleware, async (c) => {
  const jobId = c.req.param('jobId')!;

  const success = await renderJobController.cancelJob(jobId);

  if (!success) {
    // Get current status to provide better error message
    const job = await renderJobController.getJob(jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }
    return c.json(
      {
        error: 'Cannot cancel job',
        message: `Job is ${job.status}, only pending jobs can be cancelled`,
      },
      400
    );
  }

  return c.json({ success: true, message: 'Job cancelled' });
});

/**
 * Retry a failed render job
 */
renderQueueRouter.post(
  '/jobs/:jobId/retry',
  authMiddleware,
  verifyJobOwnershipMiddleware,
  renderRateLimitMiddleware,
  async (c) => {
    const jobId = c.req.param('jobId')!;

    const result = await renderJobController.retryJob(jobId);

    if (!result.success) {
      const job = await renderJobController.getJob(jobId);
      if (!job) {
        return c.json({ error: 'Job not found' }, 404);
      }
      return c.json(
        {
          error: 'Cannot retry job',
          message: `Job status is ${job.status}, only failed jobs can be retried`,
        },
        400
      );
    }

    return c.json({
      success: true,
      message: 'Job queued for retry',
      newJobId: result.newJobId,
    });
  }
);

/**
 * Delete a render job (and its output)
 */
renderQueueRouter.delete('/jobs/:jobId', authMiddleware, verifyJobOwnershipMiddleware, async (c) => {
  const jobId = c.req.param('jobId')!;

  // Get job details
  const [job] = await db
    .select({ outputKey: schema.renderJobs.outputKey, status: schema.renderJobs.status })
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Cannot delete in-progress jobs
  const activeStatuses = ['rendering', 'encoding', 'uploading'];
  if (activeStatuses.includes(job.status)) {
    return c.json(
      {
        error: 'Cannot delete active job',
        message: 'Please cancel the job first',
      },
      400
    );
  }

  // Delete output file from S3 if exists
  if (job.outputKey) {
    try {
      const { deleteFromS3 } = await import('../utils/s3.js');
      await deleteFromS3(job.outputKey);
    } catch {
      // Ignore S3 deletion errors
    }
  }

  // Delete the job record
  await db.delete(schema.renderJobs).where(eq(schema.renderJobs.id, jobId));

  return c.json({ success: true, message: 'Job deleted' });
});

/**
 * Get user render statistics
 */
renderQueueRouter.get('/stats', authMiddleware, async (c) => {
  const userDid = c.get('did')!;
  const stats = await getUserRenderStats(userDid);

  return c.json({ stats });
});

/**
 * Get queue position for a pending job
 */
renderQueueRouter.get('/jobs/:jobId/position', authMiddleware, verifyJobOwnershipMiddleware, async (c) => {
  const jobId = c.req.param('jobId')!;

  // Get job creation time
  const [job] = await db
    .select({ createdAt: schema.renderJobs.createdAt, status: schema.renderJobs.status })
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (!['pending', 'queued'].includes(job.status)) {
    return c.json({
      position: 0,
      status: job.status,
      message: 'Job is not in queue',
    });
  }

  // Count jobs ahead in queue
  const [position] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.renderJobs)
    .where(
      and(
        inArray(schema.renderJobs.status, ['pending', 'queued']),
        lte(schema.renderJobs.createdAt, job.createdAt)
      )
    );

  return c.json({
    position: position?.count || 0,
    status: job.status,
    estimatedWait: estimateWaitTime(position?.count || 0),
  });
});

// =========================================
// Admin endpoints
// =========================================

/**
 * Get global queue statistics (admin)
 */
renderQueueRouter.get('/admin/stats', adminAuthMiddleware, async (c) => {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'pending')::int`,
      queued: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'queued')::int`,
      rendering: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'rendering')::int`,
      encoding: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'encoding')::int`,
      uploading: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'uploading')::int`,
      completed: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'completed')::int`,
      failed: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'failed')::int`,
      cancelled: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'cancelled')::int`,
      totalSize: sql<number>`COALESCE(SUM(${schema.renderJobs.outputSize}), 0)::bigint`,
    })
    .from(schema.renderJobs);

  // Get jobs in last 24 hours
  const [recent] = await db
    .select({
      count: sql<number>`count(*)::int`,
      avgDuration: sql<number>`AVG(EXTRACT(EPOCH FROM (${schema.renderJobs.renderCompletedAt} - ${schema.renderJobs.renderStartedAt})))::int`,
    })
    .from(schema.renderJobs)
    .where(gte(schema.renderJobs.createdAt, sql`NOW() - INTERVAL '24 hours'`));

  return c.json({
    queue: stats,
    last24Hours: {
      jobsCreated: recent?.count || 0,
      avgRenderTime: recent?.avgDuration || 0,
    },
  });
});

/**
 * List all queue jobs (admin)
 */
renderQueueRouter.get('/admin/jobs', adminAuthMiddleware, async (c) => {
  const status = c.req.query('status');
  const userDid = c.req.query('userDid');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const sortBy = c.req.query('sortBy') || 'createdAt';
  const sortOrder = c.req.query('sortOrder') || 'desc';

  const conditions = [];
  if (status) conditions.push(eq(schema.renderJobs.status, status));
  if (userDid) conditions.push(eq(schema.renderJobs.userDid, userDid));

  // Get the column to sort by
  const sortColumn = sortBy === 'createdAt' ? schema.renderJobs.createdAt
    : sortBy === 'status' ? schema.renderJobs.status
    : sortBy === 'progress' ? schema.renderJobs.progress
    : sortBy === 'priority' ? schema.renderJobs.priority
    : schema.renderJobs.createdAt;

  const jobs = await db
    .select()
    .from(schema.renderJobs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.renderJobs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return c.json({
    jobs,
    pagination: {
      total: countResult?.count || 0,
      limit,
      offset,
      hasMore: (countResult?.count || 0) > offset + limit,
    },
  });
});

/**
 * Force cancel a job (admin)
 */
renderQueueRouter.post('/admin/jobs/:jobId/force-cancel', adminAuthMiddleware, async (c) => {
  const jobId = c.req.param('jobId');

  if (!jobId) {
    return c.json({ error: 'jobId is required' }, 400);
  }

  await renderJobController.forceCancel(jobId);

  return c.json({ success: true, message: 'Job force cancelled' });
});

/**
 * Requeue failed jobs (admin)
 */
renderQueueRouter.post('/admin/requeue-failed', adminAuthMiddleware, async (c) => {
  const requeuedCount = await renderJobController.requeueFailedJobs();

  return c.json({
    success: true,
    requeuedCount,
  });
});

/**
 * Pause/resume queue processing (admin)
 */
renderQueueRouter.post('/admin/queue/pause', adminAuthMiddleware, async (c) => {
  await renderJobController.pauseQueue();
  return c.json({ success: true, message: 'Queue paused' });
});

renderQueueRouter.post('/admin/queue/resume', adminAuthMiddleware, async (c) => {
  await renderJobController.resumeQueue();
  return c.json({ success: true, message: 'Queue resumed' });
});

renderQueueRouter.get('/admin/queue/status', adminAuthMiddleware, async (c) => {
  const paused = await renderJobController.isQueuePaused();
  const bullMQStats = await renderJobController.getBullMQStats();

  return c.json({
    paused,
    status: paused ? 'paused' : 'running',
    queue: bullMQStats,
  });
});

/**
 * Drain the queue (admin) - removes all waiting jobs
 */
renderQueueRouter.post('/admin/queue/drain', adminAuthMiddleware, async (c) => {
  const drainedCount = await renderJobController.drainQueue();
  return c.json({
    success: true,
    message: `Drained ${drainedCount} jobs from queue`,
    drainedCount,
  });
});

/**
 * Cleanup old completed jobs (admin)
 */
renderQueueRouter.post('/admin/cleanup', adminAuthMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const olderThanDays = body.olderThanDays || 30;

  const cleanedCount = await renderJobController.cleanupOldJobs(olderThanDays);

  return c.json({
    success: true,
    message: `Cleaned up ${cleanedCount} old jobs`,
    cleanedCount,
  });
});

// =========================================
// Helper functions
// =========================================

/**
 * Estimate wait time based on queue position
 */
function estimateWaitTime(position: number): string {
  const avgRenderTimeMinutes = 5; // Configurable
  const totalMinutes = position * avgRenderTimeMinutes;

  if (totalMinutes < 1) return 'Less than a minute';
  if (totalMinutes < 60) return `About ${totalMinutes} minutes`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `About ${hours}h ${minutes}m` : `About ${hours} hours`;
  }

  const days = Math.floor(hours / 24);
  return `About ${days} day${days > 1 ? 's' : ''}`;
}

export default renderQueueRouter;
