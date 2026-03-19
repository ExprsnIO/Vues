/**
 * Prefetch Job Producer
 *
 * Enqueues prefetch jobs into BullMQ when users are active.
 * The prefetch worker (packages/prefetch) consumes these jobs.
 *
 * Integration points:
 * - User login → queue timeline prefetch (high priority)
 * - Feed access → queue next-page prefetch (medium priority)
 * - Video view → queue video segment prefetch (medium priority)
 * - Periodic → queue batch prefetch for active users (low priority)
 */

import { Queue } from 'bullmq';
import { getRedisConnection } from '../../cache/redis.js';
import { redis, cacheType } from '../../cache/redis.js';

const CONFIG_KEY = 'prefetch:config';

interface PrefetchJob {
  userId: string;
  priority: 'high' | 'medium' | 'low';
  type: 'timeline' | 'video' | 'user_profile';
  metadata?: Record<string, unknown>;
}

interface VideoPrefetchJob {
  videoUri: string;
  userId: string;
  hlsPlaylist: string;
  segmentsToFetch: number[];
}

const PRIORITY_VALUES = { high: 1, medium: 5, low: 10 };

let prefetchQueue: Queue<PrefetchJob> | null = null;
let videoQueue: Queue<VideoPrefetchJob> | null = null;
let initialized = false;

/**
 * Initialize the prefetch producer queues.
 * Called once during API startup when Redis is available.
 */
export function initializePrefetchProducer(): boolean {
  if (initialized) return true;
  if (cacheType !== 'redis') {
    console.log('[prefetch-producer] Skipped — no Redis connection');
    return false;
  }

  try {
    const connection = getRedisConnection();

    prefetchQueue = new Queue<PrefetchJob>('prefetch', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    videoQueue = new Queue<VideoPrefetchJob>('video-prefetch', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 50,
        removeOnFail: 25,
      },
    });

    initialized = true;
    console.log('[prefetch-producer] Initialized');
    return true;
  } catch (err) {
    console.warn('[prefetch-producer] Failed to initialize:', err);
    return false;
  }
}

/**
 * Check if prefetch engine is enabled (reads from Redis config).
 */
async function isEnabled(): Promise<boolean> {
  try {
    const raw = await redis.get(CONFIG_KEY);
    if (!raw) return true; // Default is enabled
    const config = JSON.parse(raw);
    return config.enabled !== false;
  } catch {
    return true;
  }
}

/**
 * Queue a timeline prefetch for a user.
 * Call on login or when a user accesses their feed.
 */
export async function queueTimelinePrefetch(
  userId: string,
  priority: 'high' | 'medium' | 'low' = 'medium'
): Promise<string | null> {
  if (!prefetchQueue || !(await isEnabled())) return null;

  try {
    const job = await prefetchQueue.add(
      'prefetch',
      { userId, priority, type: 'timeline' },
      {
        priority: PRIORITY_VALUES[priority],
        jobId: `timeline:${userId}:${Date.now()}`,
        // Deduplicate: don't re-queue if a job for this user is already waiting
        // BullMQ deduplicates by jobId prefix isn't built-in, so we use a short delay
        delay: 0,
      }
    );
    return job.id ?? null;
  } catch (err) {
    console.warn('[prefetch-producer] Failed to queue timeline:', err);
    return null;
  }
}

/**
 * Queue video segment prefetch.
 * Call when a user starts watching a video to prefetch upcoming segments.
 */
export async function queueVideoSegmentPrefetch(
  videoUri: string,
  userId: string,
  hlsPlaylist: string,
  lookahead: number = 3
): Promise<string | null> {
  if (!videoQueue || !(await isEnabled())) return null;

  try {
    const segmentsToFetch = Array.from({ length: lookahead }, (_, i) => i + 1);
    const job = await videoQueue.add(
      'video-prefetch',
      { videoUri, userId, hlsPlaylist, segmentsToFetch },
      {
        priority: PRIORITY_VALUES.medium,
        jobId: `video:${videoUri}:${segmentsToFetch.join(',')}`,
      }
    );
    return job.id ?? null;
  } catch (err) {
    console.warn('[prefetch-producer] Failed to queue video prefetch:', err);
    return null;
  }
}

/**
 * Queue batch timeline prefetch for multiple users.
 * Useful for warming caches after deployments or for active user sets.
 */
export async function queueBatchPrefetch(
  userIds: string[],
  priority: 'high' | 'medium' | 'low' = 'low'
): Promise<number> {
  if (!prefetchQueue || !(await isEnabled())) return 0;

  try {
    const jobs = userIds.map((userId) => ({
      name: 'prefetch',
      data: { userId, priority, type: 'timeline' as const },
      opts: {
        priority: PRIORITY_VALUES[priority],
        jobId: `timeline:${userId}:${Date.now()}`,
      },
    }));

    const results = await prefetchQueue.addBulk(jobs);
    return results.length;
  } catch (err) {
    console.warn('[prefetch-producer] Failed to queue batch:', err);
    return 0;
  }
}

/**
 * Get producer queue stats (for health/metrics endpoints).
 */
export async function getProducerStats(): Promise<{
  initialized: boolean;
  prefetch: { waiting: number; active: number; failed: number } | null;
  video: { waiting: number; active: number; failed: number } | null;
}> {
  if (!initialized || !prefetchQueue || !videoQueue) {
    return { initialized: false, prefetch: null, video: null };
  }

  try {
    const [pWaiting, pActive, pFailed] = await Promise.all([
      prefetchQueue.getWaitingCount(),
      prefetchQueue.getActiveCount(),
      prefetchQueue.getFailedCount(),
    ]);
    const [vWaiting, vActive, vFailed] = await Promise.all([
      videoQueue.getWaitingCount(),
      videoQueue.getActiveCount(),
      videoQueue.getFailedCount(),
    ]);

    return {
      initialized: true,
      prefetch: { waiting: pWaiting, active: pActive, failed: pFailed },
      video: { waiting: vWaiting, active: vActive, failed: vFailed },
    };
  } catch {
    return { initialized, prefetch: null, video: null };
  }
}
