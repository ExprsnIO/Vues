/**
 * Activity Bridge
 *
 * Bridges user activity signals from the API process to the prefetch worker
 * via Redis. The worker's ActivityBasedStrategy polls this data instead of
 * relying on in-process trackActivity() calls.
 *
 * Redis key: prefetch:activity:{userId} — hash with lastActive + count
 * TTL: 10 minutes (auto-expires inactive users)
 */

import { redis, cacheType } from '../../cache/redis.js';

const ACTIVITY_PREFIX = 'prefetch:activity:';
const ACTIVITY_TTL = 600; // 10 minutes
const ACTIVE_SET_KEY = 'prefetch:active_users';

/**
 * Record user activity. Call on any meaningful user action
 * (feed view, video view, like, comment, etc).
 * Fire-and-forget — never blocks the request.
 */
export function trackUserActivity(userDid: string): void {
  if (cacheType !== 'redis') return;

  const key = `${ACTIVITY_PREFIX}${userDid}`;
  const now = Date.now().toString();

  // Pipeline for atomicity and performance
  const pipeline = (redis as any).pipeline?.();
  if (pipeline) {
    pipeline.hset(key, 'lastActive', now);
    pipeline.hincrby(key, 'count', 1);
    pipeline.expire(key, ACTIVITY_TTL);
    // Add to active users set with timestamp as score
    pipeline.zadd(ACTIVE_SET_KEY, Date.now(), userDid);
    pipeline.exec().catch(() => {});
  } else {
    // Fallback for non-pipeline Redis (memory cache)
    (redis as any).hset?.(key, 'lastActive', now)?.catch?.(() => {});
  }
}

/**
 * Get active users (for the worker to read).
 * Returns users sorted by most recent activity.
 */
export async function getActiveUsers(limit: number = 100): Promise<Array<{
  userId: string;
  lastActive: number;
  activityCount: number;
}>> {
  if (cacheType !== 'redis') return [];

  try {
    // Get top active users from sorted set
    const members = await (redis as any).zrevrange(ACTIVE_SET_KEY, 0, limit - 1);
    if (!members || members.length === 0) return [];

    const results: Array<{ userId: string; lastActive: number; activityCount: number }> = [];

    for (const userId of members) {
      const key = `${ACTIVITY_PREFIX}${userId}`;
      const data = await (redis as any).hgetall(key);
      if (data && data.lastActive) {
        results.push({
          userId,
          lastActive: parseInt(data.lastActive, 10),
          activityCount: parseInt(data.count || '1', 10),
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Clean up expired users from the active set.
 * Call periodically from the worker.
 */
export async function cleanupInactiveUsers(maxAgeMs: number = 600000): Promise<number> {
  if (cacheType !== 'redis') return 0;

  try {
    const cutoff = Date.now() - maxAgeMs;
    const removed = await (redis as any).zremrangebyscore(ACTIVE_SET_KEY, 0, cutoff);
    return removed || 0;
  } catch {
    return 0;
  }
}
