/**
 * Worker Administration & Monitoring API
 *
 * Provides domain-scoped monitoring, control, and metrics endpoints for all
 * BullMQ worker queues in the Exprsn platform.
 *
 * Queue inventory (names must match actual Queue instantiations):
 *   prefetch          — timeline prefetch jobs
 *   video-prefetch    — video segment prefetch
 *   adaptive-transcode — HLS/DASH transcoding
 *   render-jobs       — video rendering (FFmpeg/BullMQ)
 *   webhook-retries   — transcode webhook delivery retries
 *   stream-events     — live stream event processing
 *   directory-sync    — platform directory sync
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { getRedisUrl, cacheType } from '../cache/redis.js';

const router = new Hono();

// Apply admin auth to every route in this router
router.use('*', adminAuthMiddleware);

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * All known BullMQ queue names and their human-readable labels.
 * concurrency values are best-effort defaults pulled from env / source constants.
 */
const KNOWN_QUEUES: Array<{ name: string; label: string; defaultConcurrency: number }> = [
  { name: 'prefetch', label: 'Timeline Prefetch', defaultConcurrency: 50 },
  { name: 'video-prefetch', label: 'Video Segment Prefetch', defaultConcurrency: 10 },
  { name: 'adaptive-transcode', label: 'Adaptive Transcode (HLS/DASH)', defaultConcurrency: 2 },
  { name: 'render-jobs', label: 'Video Render Jobs', defaultConcurrency: 2 },
  { name: 'webhook-retries', label: 'Webhook Delivery Retries', defaultConcurrency: 5 },
  { name: 'stream-events', label: 'Live Stream Events', defaultConcurrency: 5 },
  { name: 'directory-sync', label: 'Platform Directory Sync', defaultConcurrency: 2 },
];

const VALID_QUEUE_NAMES = new Set(KNOWN_QUEUES.map((q) => q.name));

const DOMAIN_WORKER_CONFIG_PREFIX = 'workers:config:domain:';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a short-lived BullMQ Queue instance for reading stats, then close it.
 * Always uses URL-based connection to avoid persisting connections.
 */
function openQueue(name: string): Queue {
  return new Queue(name, {
    connection: { url: getRedisUrl() },
  });
}

/**
 * Return whether the cache layer has a real Redis connection. When running with
 * the in-memory fallback there is no BullMQ support.
 */
function hasRedis(): boolean {
  return cacheType === 'redis';
}

/**
 * Safely fetch counts for a queue, returning zeros on any error.
 */
async function safeQueueCounts(queue: Queue): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  } catch {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const queueNameSchema = z.string().refine((v) => VALID_QUEUE_NAMES.has(v), {
  message: 'Unknown queue name',
});

const jobStatusSchema = z.enum(['waiting', 'active', 'completed', 'failed', 'delayed']);

const retryBodySchema = z.object({
  queue: queueNameSchema,
  jobId: z.string().min(1),
});

const cleanBodySchema = z.object({
  queue: queueNameSchema,
  status: z.enum(['completed', 'failed', 'delayed', 'wait', 'active']),
  grace: z.number().int().min(0).default(0),
});

const pauseResumeBodySchema = z.object({
  queue: queueNameSchema,
});

const domainWorkerConfigBodySchema = z.object({
  domainId: z.string().min(1),
  config: z.object({
    rateLimit: z.number().int().min(1).max(100000).optional(),
    enabledQueues: z.array(queueNameSchema).optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
  }),
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /io.exprsn.admin.workers.list
// Returns all known queues with live stats and paused state.
// Optional ?domainId filter (applies enabled-queues config if present).
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/io.exprsn.admin.workers.list',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!hasRedis()) {
      return c.json({ queues: [], redisAvailable: false });
    }

    // Resolve which queues to include (domain filter may narrow this)
    let targetQueues = [...KNOWN_QUEUES];

    if (domainId) {
      const { redis } = await import('../cache/redis.js');
      const raw = await redis.get(`${DOMAIN_WORKER_CONFIG_PREFIX}${domainId}`);
      if (raw) {
        try {
          const domainCfg = JSON.parse(raw);
          if (Array.isArray(domainCfg.enabledQueues) && domainCfg.enabledQueues.length > 0) {
            const enabled = new Set<string>(domainCfg.enabledQueues);
            targetQueues = targetQueues.filter((q) => enabled.has(q.name));
          }
        } catch {
          // Ignore parse errors — return all queues
        }
      }
    }

    const results = await Promise.all(
      targetQueues.map(async (meta) => {
        const queue = openQueue(meta.name);
        try {
          const [counts, isPaused] = await Promise.all([
            safeQueueCounts(queue),
            queue.isPaused().catch(() => false),
          ]);
          return {
            name: meta.name,
            label: meta.label,
            status: isPaused ? 'paused' : 'active',
            concurrency: meta.defaultConcurrency,
            counts,
          };
        } finally {
          await queue.close().catch(() => undefined);
        }
      })
    );

    return c.json({ queues: results, redisAvailable: true });
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// GET /io.exprsn.admin.workers.queue
// Returns detailed info for a single queue: counts + last 10 completed/failed.
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/io.exprsn.admin.workers.queue',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const name = c.req.query('name');
    const parsed = queueNameSchema.safeParse(name);
    if (!parsed.success) {
      return c.json({ error: 'Invalid or missing queue name' }, 400);
    }

    if (!hasRedis()) {
      return c.json({ error: 'Redis is not available' }, 503);
    }

    const queue = openQueue(parsed.data);
    try {
      const [counts, isPaused, recentCompleted, recentFailed] = await Promise.all([
        safeQueueCounts(queue),
        queue.isPaused().catch(() => false),
        queue.getCompleted(0, 9).catch(() => []),
        queue.getFailed(0, 9).catch(() => []),
      ]);

      const mapJob = (job: Awaited<ReturnType<typeof queue.getCompleted>>[number]) => ({
        id: job.id,
        name: job.name,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        attemptsMade: job.attemptsMade,
        failedReason: (job as any).failedReason ?? undefined,
      });

      const meta = KNOWN_QUEUES.find((q) => q.name === parsed.data);

      return c.json({
        name: parsed.data,
        label: meta?.label ?? parsed.data,
        status: isPaused ? 'paused' : 'active',
        concurrency: meta?.defaultConcurrency ?? 1,
        counts,
        recentCompleted: recentCompleted.map(mapJob),
        recentFailed: recentFailed.map(mapJob),
      });
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// GET /io.exprsn.admin.workers.jobs
// Paginated job list for a queue filtered by status.
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/io.exprsn.admin.workers.jobs',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const queueParam = c.req.query('queue');
    const statusParam = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);

    const queueParsed = queueNameSchema.safeParse(queueParam);
    if (!queueParsed.success) {
      return c.json({ error: 'Invalid or missing queue name' }, 400);
    }

    const statusParsed = jobStatusSchema.safeParse(statusParam);
    if (!statusParsed.success) {
      return c.json({ error: 'Invalid status — must be one of: waiting, active, completed, failed, delayed' }, 400);
    }

    if (!hasRedis()) {
      return c.json({ error: 'Redis is not available' }, 503);
    }

    const queue = openQueue(queueParsed.data);
    try {
      const start = offset;
      const end = offset + limit - 1;

      let jobs: Awaited<ReturnType<typeof queue.getJobs>>;
      switch (statusParsed.data) {
        case 'waiting':
          jobs = await queue.getWaiting(start, end).catch(() => []);
          break;
        case 'active':
          jobs = await queue.getActive(start, end).catch(() => []);
          break;
        case 'completed':
          jobs = await queue.getCompleted(start, end).catch(() => []);
          break;
        case 'failed':
          jobs = await queue.getFailed(start, end).catch(() => []);
          break;
        case 'delayed':
          jobs = await queue.getDelayed(start, end).catch(() => []);
          break;
        default:
          jobs = [];
      }

      const mapped = jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        timestamp: job.timestamp,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        delay: job.opts?.delay ?? 0,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts?.attempts ?? 1,
        failedReason: (job as any).failedReason ?? null,
        stacktrace: (job as any).stacktrace ?? null,
      }));

      return c.json({
        queue: queueParsed.data,
        status: statusParsed.data,
        jobs: mapped,
        limit,
        offset,
      });
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// POST /io.exprsn.admin.workers.retry
// Retry a specific failed job.
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  '/io.exprsn.admin.workers.retry',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = retryBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    if (!hasRedis()) {
      return c.json({ error: 'Redis is not available' }, 503);
    }

    const { queue: queueName, jobId } = parsed.data;
    const queue = openQueue(queueName);
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return c.json({ error: `Job ${jobId} not found in queue ${queueName}` }, 404);
      }

      await job.retry();
      return c.json({ success: true, jobId, queue: queueName });
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// POST /io.exprsn.admin.workers.clean
// Remove old jobs from a queue by status.
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  '/io.exprsn.admin.workers.clean',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = cleanBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    if (!hasRedis()) {
      return c.json({ error: 'Redis is not available' }, 503);
    }

    const { queue: queueName, status, grace } = parsed.data;
    const queue = openQueue(queueName);
    try {
      // BullMQ clean() signature: (gracePeriod, limit, type)
      const removed = await queue.clean(grace, 1000, status as any);
      return c.json({
        success: true,
        queue: queueName,
        status,
        removedCount: removed.length,
      });
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// POST /io.exprsn.admin.workers.pause
// Pause a queue — workers will stop picking up new jobs.
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  '/io.exprsn.admin.workers.pause',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = pauseResumeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    if (!hasRedis()) {
      return c.json({ error: 'Redis is not available' }, 503);
    }

    const queue = openQueue(parsed.data.queue);
    try {
      await queue.pause();
      return c.json({ success: true, queue: parsed.data.queue, status: 'paused' });
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// POST /io.exprsn.admin.workers.resume
// Resume a paused queue.
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  '/io.exprsn.admin.workers.resume',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = pauseResumeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    if (!hasRedis()) {
      return c.json({ error: 'Redis is not available' }, 503);
    }

    const queue = openQueue(parsed.data.queue);
    try {
      await queue.resume();
      return c.json({ success: true, queue: parsed.data.queue, status: 'active' });
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// GET /io.exprsn.admin.workers.metrics
// Aggregate worker metrics with 24-hour hourly time-series.
//
// For the time-series we read BullMQ's internal completed/failed counters that
// are stored per-hour in Redis at the key pattern:
//   bull:{queueName}:metrics:completed  (BullMQ v5 metrics)
//
// Where those keys are absent (e.g. older BullMQ version or no throughput yet)
// we fall back to the current snapshot counts.
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/io.exprsn.admin.workers.metrics',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    if (!hasRedis()) {
      return c.json({ error: 'Redis is not available' }, 503);
    }

    // ── Aggregate snapshot across all queues ──────────────────────────────
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalWaiting = 0;
    let totalActive = 0;
    let totalDelayed = 0;

    const queueSnapshots = await Promise.all(
      KNOWN_QUEUES.map(async (meta) => {
        const queue = openQueue(meta.name);
        try {
          const counts = await safeQueueCounts(queue);
          totalProcessed += counts.completed;
          totalFailed += counts.failed;
          totalWaiting += counts.waiting;
          totalActive += counts.active;
          totalDelayed += counts.delayed;
          return { name: meta.name, ...counts };
        } finally {
          await queue.close().catch(() => undefined);
        }
      })
    );

    // ── Hourly time-series (last 24 hours) ────────────────────────────────
    // BullMQ stores metrics in Redis lists under bull:{name}:metrics:{type}
    // Each element is a stringified count for a fixed-duration window.
    // We attempt to read these and build an hourly breakdown.
    const { Redis: IORedis } = await import('ioredis');
    const metricsRedis = new IORedis(getRedisUrl());

    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const buckets: Array<{
      hour: string;
      completed: number;
      failed: number;
    }> = [];

    try {
      // Build 24 hourly buckets, newest first → reverse to oldest-first
      for (let i = 23; i >= 0; i--) {
        const bucketTs = now - i * hourMs;
        const hourLabel = new Date(bucketTs - (bucketTs % hourMs)).toISOString().slice(0, 13) + ':00Z';
        buckets.push({ hour: hourLabel, completed: 0, failed: 0 });
      }

      // Attempt to read BullMQ metrics for each queue and sum into buckets
      for (const meta of KNOWN_QUEUES) {
        const completedKey = `bull:${meta.name}:metrics:completed`;
        const failedKey = `bull:${meta.name}:metrics:failed`;

        const [completedList, failedList] = await Promise.all([
          metricsRedis.lrange(completedKey, 0, 23).catch(() => [] as string[]),
          metricsRedis.lrange(failedKey, 0, 23).catch(() => [] as string[]),
        ]);

        // BullMQ stores newest entry at index 0; align to our buckets (oldest first)
        const completedReversed = [...completedList].reverse();
        const failedReversed = [...failedList].reverse();

        for (let i = 0; i < 24; i++) {
          if (completedReversed[i]) {
            buckets[i]!.completed += parseInt(completedReversed[i]!, 10) || 0;
          }
          if (failedReversed[i]) {
            buckets[i]!.failed += parseInt(failedReversed[i]!, 10) || 0;
          }
        }
      }
    } catch (err) {
      console.warn('[admin-workers] Failed to read BullMQ hourly metrics:', err);
    } finally {
      await metricsRedis.quit().catch(() => undefined);
    }

    // ── Average duration estimation ───────────────────────────────────────
    // BullMQ does not natively expose average durations without custom tracking.
    // We surface 0 for now so the frontend can display a dash or N/A gracefully.
    const avgDurationMs = 0;

    return c.json({
      summary: {
        totalProcessed,
        totalFailed,
        totalWaiting,
        totalActive,
        totalDelayed,
        avgDurationMs,
      },
      queues: queueSnapshots,
      timeSeries: buckets,
      timestamp: new Date().toISOString(),
    });
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// GET /io.exprsn.admin.workers.domain.config
// Returns domain-specific worker settings stored in Redis.
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/io.exprsn.admin.workers.domain.config',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    if (!domainId) {
      return c.json({ error: 'domainId query param required' }, 400);
    }

    const { redis } = await import('../cache/redis.js');
    const raw = await redis.get(`${DOMAIN_WORKER_CONFIG_PREFIX}${domainId}`);

    if (!raw) {
      return c.json({ domainId, config: {}, hasOverrides: false });
    }

    try {
      const config = JSON.parse(raw);
      return c.json({ domainId, config, hasOverrides: true });
    } catch {
      return c.json({ domainId, config: {}, hasOverrides: false });
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// PUT /io.exprsn.admin.workers.domain.config
// Saves domain-specific worker settings to Redis.
// ═════════════════════════════════════════════════════════════════════════════

router.put(
  '/io.exprsn.admin.workers.domain.config',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = domainWorkerConfigBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    const { domainId, config } = parsed.data;
    const { redis } = await import('../cache/redis.js');

    await redis.set(
      `${DOMAIN_WORKER_CONFIG_PREFIX}${domainId}`,
      JSON.stringify(config)
    );

    return c.json({ domainId, config, hasOverrides: Object.keys(config).length > 0 });
  }
);

export { router as adminWorkersRouter };
