/**
 * Render Pipeline Middleware
 *
 * Middleware for video rendering operations including:
 * - Job validation and ownership verification
 * - Rate limiting for render requests
 * - Resource allocation checks
 * - Progress tracking
 */

import type { Context, Next } from 'hono';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { redis, CacheKeys } from '../cache/redis.js';

/**
 * Rate limit configuration for render operations
 */
const RENDER_RATE_LIMITS = {
  // Max concurrent renders per user
  maxConcurrentRenders: parseInt(process.env.MAX_CONCURRENT_RENDERS || '3', 10),
  // Max renders per hour
  maxRendersPerHour: parseInt(process.env.MAX_RENDERS_PER_HOUR || '10', 10),
  // Max renders per day
  maxRendersPerDay: parseInt(process.env.MAX_RENDERS_PER_DAY || '50', 10),
  // Cool-down between render requests (seconds)
  renderCooldown: parseInt(process.env.RENDER_COOLDOWN_SECONDS || '10', 10),
};

/**
 * Middleware to check render rate limits
 */
export async function renderRateLimitMiddleware(c: Context, next: Next) {
  const userDid = c.get('did') as string | undefined;

  if (!userDid) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Check concurrent renders
  const concurrentRenders = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.renderJobs)
    .where(
      and(
        eq(schema.renderJobs.userDid, userDid),
        sql`${schema.renderJobs.status} IN ('pending', 'queued', 'rendering', 'encoding', 'uploading')`
      )
    );

  if ((concurrentRenders[0]?.count || 0) >= RENDER_RATE_LIMITS.maxConcurrentRenders) {
    return c.json(
      {
        error: 'Too many concurrent renders',
        message: `You can have at most ${RENDER_RATE_LIMITS.maxConcurrentRenders} renders in progress`,
        limit: RENDER_RATE_LIMITS.maxConcurrentRenders,
      },
      429
    );
  }

  // Check hourly limit using Redis
  const hourlyKey = `render:hourly:${userDid}`;
  const hourlyCount = await redis.get(hourlyKey);
  const currentHourlyCount = parseInt(hourlyCount || '0', 10);

  if (currentHourlyCount >= RENDER_RATE_LIMITS.maxRendersPerHour) {
    return c.json(
      {
        error: 'Hourly render limit exceeded',
        message: `You can start at most ${RENDER_RATE_LIMITS.maxRendersPerHour} renders per hour`,
        limit: RENDER_RATE_LIMITS.maxRendersPerHour,
        resetIn: await redis.ttl(hourlyKey),
      },
      429
    );
  }

  // Check daily limit
  const dailyKey = `render:daily:${userDid}`;
  const dailyCount = await redis.get(dailyKey);
  const currentDailyCount = parseInt(dailyCount || '0', 10);

  if (currentDailyCount >= RENDER_RATE_LIMITS.maxRendersPerDay) {
    return c.json(
      {
        error: 'Daily render limit exceeded',
        message: `You can start at most ${RENDER_RATE_LIMITS.maxRendersPerDay} renders per day`,
        limit: RENDER_RATE_LIMITS.maxRendersPerDay,
        resetIn: await redis.ttl(dailyKey),
      },
      429
    );
  }

  // Check cooldown
  const cooldownKey = `render:cooldown:${userDid}`;
  const lastRender = await redis.get(cooldownKey);

  if (lastRender) {
    const remainingCooldown = await redis.ttl(cooldownKey);
    return c.json(
      {
        error: 'Please wait before starting another render',
        message: `Cooldown: ${remainingCooldown} seconds remaining`,
        cooldown: remainingCooldown,
      },
      429
    );
  }

  await next();

  // If request succeeded, increment counters
  if (c.res.status >= 200 && c.res.status < 300) {
    // Increment hourly counter
    if (currentHourlyCount === 0) {
      await redis.setex(hourlyKey, 3600, '1'); // 1 hour TTL
    } else {
      await redis.incr(hourlyKey);
    }

    // Increment daily counter
    if (currentDailyCount === 0) {
      await redis.setex(dailyKey, 86400, '1'); // 24 hour TTL
    } else {
      await redis.incr(dailyKey);
    }

    // Set cooldown
    await redis.setex(cooldownKey, RENDER_RATE_LIMITS.renderCooldown, '1');
  }
}

/**
 * Middleware to verify job ownership
 */
export async function verifyJobOwnershipMiddleware(c: Context, next: Next) {
  const userDid = c.get('did') as string | undefined;
  const jobId = c.req.param('jobId');

  if (!userDid) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (!jobId) {
    return c.json({ error: 'Job ID required' }, 400);
  }

  const [job] = await db
    .select({ userDid: schema.renderJobs.userDid })
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (job.userDid !== userDid) {
    return c.json({ error: 'Not authorized to access this job' }, 403);
  }

  // Store job reference for downstream handlers
  c.set('jobId', jobId);

  await next();
}

/**
 * Middleware to check if render service is available
 */
export async function renderServiceHealthMiddleware(c: Context, next: Next) {
  // Check if render service is enabled
  const renderEnabled = process.env.RENDER_ENABLED !== 'false';

  if (!renderEnabled) {
    return c.json(
      {
        error: 'Render service unavailable',
        message: 'Video rendering is currently disabled',
      },
      503
    );
  }

  // Check queue health (optional Redis check)
  try {
    await redis.get('render:health:check');
  } catch {
    return c.json(
      {
        error: 'Render service unavailable',
        message: 'Queue service is not responding',
      },
      503
    );
  }

  await next();
}

/**
 * Middleware to validate render configuration
 */
export async function validateRenderConfigMiddleware(c: Context, next: Next) {
  const body = await c.req.json().catch(() => ({}));

  // Validate required fields
  if (!body.projectId) {
    return c.json({ error: 'projectId is required' }, 400);
  }

  // Validate resolution if provided
  if (body.resolution) {
    const validResolutions = ['480p', '720p', '1080p', '4k'];
    if (!validResolutions.includes(body.resolution)) {
      return c.json(
        {
          error: 'Invalid resolution',
          validOptions: validResolutions,
        },
        400
      );
    }
  }

  // Validate format if provided
  if (body.format) {
    const validFormats = ['mp4', 'webm', 'mov'];
    if (!validFormats.includes(body.format)) {
      return c.json(
        {
          error: 'Invalid format',
          validOptions: validFormats,
        },
        400
      );
    }
  }

  // Validate FPS if provided
  if (body.fps) {
    const fps = parseInt(body.fps, 10);
    if (isNaN(fps) || fps < 15 || fps > 60) {
      return c.json(
        {
          error: 'Invalid FPS',
          message: 'FPS must be between 15 and 60',
        },
        400
      );
    }
  }

  // Store validated config
  c.set('renderConfig', {
    projectId: body.projectId,
    resolution: body.resolution || '1080p',
    format: body.format || 'mp4',
    fps: body.fps ? parseInt(body.fps, 10) : 30,
    quality: body.quality || 'high',
    ...body,
  });

  await next();
}

/**
 * Middleware to check storage quota
 */
export async function checkStorageQuotaMiddleware(c: Context, next: Next) {
  const userDid = c.get('did') as string | undefined;

  if (!userDid) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get user's storage usage
  const [usage] = await db
    .select({
      totalSize: sql<number>`COALESCE(SUM(${schema.renderJobs.outputSize}), 0)::bigint`,
    })
    .from(schema.renderJobs)
    .where(
      and(
        eq(schema.renderJobs.userDid, userDid),
        eq(schema.renderJobs.status, 'completed')
      )
    );

  const totalSizeBytes = usage?.totalSize || 0;
  const maxStorageBytes = parseInt(process.env.MAX_USER_STORAGE_GB || '10', 10) * 1024 * 1024 * 1024;

  if (totalSizeBytes >= maxStorageBytes) {
    return c.json(
      {
        error: 'Storage quota exceeded',
        message: 'Please delete some renders to free up space',
        used: totalSizeBytes,
        limit: maxStorageBytes,
        usedFormatted: formatBytes(totalSizeBytes),
        limitFormatted: formatBytes(maxStorageBytes),
      },
      403
    );
  }

  // Store quota info for downstream handlers
  c.set('storageQuota', {
    used: totalSizeBytes,
    limit: maxStorageBytes,
    available: maxStorageBytes - totalSizeBytes,
  });

  await next();
}

/**
 * Helper to format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get render statistics for a user
 */
export async function getUserRenderStats(userDid: string): Promise<{
  totalRenders: number;
  completedRenders: number;
  failedRenders: number;
  pendingRenders: number;
  totalRenderTime: number;
  totalStorageUsed: number;
  averageRenderTime: number;
}> {
  const [stats] = await db
    .select({
      totalRenders: sql<number>`count(*)::int`,
      completedRenders: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'completed')::int`,
      failedRenders: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'failed')::int`,
      pendingRenders: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} IN ('pending', 'queued', 'rendering'))::int`,
      totalStorageUsed: sql<number>`COALESCE(SUM(${schema.renderJobs.outputSize}), 0)::bigint`,
      totalRenderTime: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${schema.renderJobs.renderCompletedAt} - ${schema.renderJobs.renderStartedAt}))), 0)::int`,
    })
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.userDid, userDid));

  const totalRenders = stats?.totalRenders || 0;
  const completedRenders = stats?.completedRenders || 0;
  const totalRenderTime = stats?.totalRenderTime || 0;

  return {
    totalRenders,
    completedRenders,
    failedRenders: stats?.failedRenders || 0,
    pendingRenders: stats?.pendingRenders || 0,
    totalRenderTime,
    totalStorageUsed: stats?.totalStorageUsed || 0,
    averageRenderTime: completedRenders > 0 ? Math.round(totalRenderTime / completedRenders) : 0,
  };
}

export default {
  renderRateLimitMiddleware,
  verifyJobOwnershipMiddleware,
  renderServiceHealthMiddleware,
  validateRenderConfigMiddleware,
  checkStorageQuotaMiddleware,
  getUserRenderStats,
};
