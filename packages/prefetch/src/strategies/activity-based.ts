import { Redis } from 'ioredis';
import { PrefetchQueue } from '../queues/prefetch-queue.js';

/**
 * Activity tracking entry
 */
interface ActivityEntry {
  userId: string;
  lastActive: number;
  activityCount: number;
}

/**
 * Activity-based prefetching strategy configuration
 */
export interface ActivityBasedConfig {
  checkInterval: number;       // How often to run prefetch cycle (ms)
  maxUsersPerCycle: number;    // Maximum users to prefetch per cycle
  activityThreshold: number;   // Minimum activity count for prefetch
  inactivityTimeout: number;   // Time after which user is considered inactive (ms)
}

const DEFAULT_CONFIG: ActivityBasedConfig = {
  checkInterval: 60000,        // 1 minute
  maxUsersPerCycle: 100,
  activityThreshold: 1,
  inactivityTimeout: 300000,   // 5 minutes
};

// Redis keys used by the activity bridge (written by API, read by worker)
const ACTIVE_SET_KEY = 'prefetch:active_users';
const ACTIVITY_PREFIX = 'prefetch:activity:';

/**
 * Activity-based prefetching strategy
 *
 * Reads user activity from Redis (written by API via activity-bridge)
 * and proactively prefetches timelines for active users.
 *
 * The API process calls trackUserActivity() which writes to Redis.
 * This strategy reads that data each cycle and queues prefetch jobs.
 */
export class ActivityBasedStrategy {
  private intervalId: NodeJS.Timeout | null = null;
  private config: ActivityBasedConfig;
  private running = false;
  private redis: Redis | null = null;

  constructor(
    private prefetchQueue: PrefetchQueue,
    config: Partial<ActivityBasedConfig> = {},
    redis?: Redis
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = redis || null;
  }

  /**
   * Set the Redis client (for reading activity data from the bridge)
   */
  setRedis(redis: Redis): void {
    this.redis = redis;
  }

  /**
   * Start the strategy
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.intervalId = setInterval(
      () => this.runPrefetchCycle(),
      this.config.checkInterval
    );

    console.log('[activity-strategy] Started (reading from Redis bridge)');
  }

  /**
   * Stop the strategy
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    console.log('[activity-strategy] Stopped');
  }

  /**
   * Track user activity (legacy in-process method, kept for backwards compat).
   * In production, activity is tracked via Redis by the API's activity-bridge.
   */
  trackActivity(userId: string): void {
    if (this.redis) {
      const key = `${ACTIVITY_PREFIX}${userId}`;
      const now = Date.now().toString();
      this.redis.hset(key, 'lastActive', now).catch(() => {});
      this.redis.hincrby(key, 'count', 1).catch(() => {});
      this.redis.expire(key, 600).catch(() => {});
      this.redis.zadd(ACTIVE_SET_KEY, Date.now(), userId).catch(() => {});
    }
  }

  /**
   * Read active users from Redis (written by API's activity-bridge)
   */
  private async getActiveUsersFromRedis(): Promise<ActivityEntry[]> {
    if (!this.redis) return [];

    try {
      // Get top active users from sorted set (most recent first)
      const members = await this.redis.zrevrange(
        ACTIVE_SET_KEY, 0, this.config.maxUsersPerCycle - 1
      );
      if (!members || members.length === 0) return [];

      const entries: ActivityEntry[] = [];

      for (const userId of members) {
        const key = `${ACTIVITY_PREFIX}${userId}`;
        const data = await this.redis.hgetall(key);
        if (data && data.lastActive) {
          const lastActive = parseInt(data.lastActive, 10);
          const timeSinceActive = Date.now() - lastActive;

          // Skip inactive users
          if (timeSinceActive > this.config.inactivityTimeout) {
            // Clean up expired entry
            this.redis.zrem(ACTIVE_SET_KEY, userId).catch(() => {});
            this.redis.del(key).catch(() => {});
            continue;
          }

          const activityCount = parseInt(data.count || '1', 10);
          if (activityCount >= this.config.activityThreshold) {
            entries.push({ userId, lastActive, activityCount });
          }
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Run a prefetch cycle
   */
  async runPrefetchCycle(): Promise<{
    processed: number;
    queued: number;
    cleaned: number;
  }> {
    // Read activity from Redis bridge
    const users = await this.getActiveUsersFromRedis();

    if (users.length === 0) {
      return { processed: 0, queued: 0, cleaned: 0 };
    }

    // Sort by activity (most recent first, then by activity count)
    users.sort((a, b) => {
      const timeDiff = b.lastActive - a.lastActive;
      if (Math.abs(timeDiff) < 1000) {
        return b.activityCount - a.activityCount;
      }
      return timeDiff;
    });

    // Take top users
    const toProcess = users.slice(0, this.config.maxUsersPerCycle);

    // Determine priorities based on position
    const highPriority = toProcess.slice(0, 10);
    const mediumPriority = toProcess.slice(10, 50);
    const lowPriority = toProcess.slice(50);

    // Queue prefetch jobs
    let queuedCount = 0;

    if (highPriority.length > 0) {
      const ids = highPriority.map((u) => u.userId);
      await this.prefetchQueue.queueBatchPrefetch(ids, 'high');
      queuedCount += ids.length;
    }

    if (mediumPriority.length > 0) {
      const ids = mediumPriority.map((u) => u.userId);
      await this.prefetchQueue.queueBatchPrefetch(ids, 'medium');
      queuedCount += ids.length;
    }

    if (lowPriority.length > 0) {
      const ids = lowPriority.map((u) => u.userId);
      await this.prefetchQueue.queueBatchPrefetch(ids, 'low');
      queuedCount += ids.length;
    }

    // Reset activity counts in Redis for processed users
    if (this.redis) {
      for (const entry of toProcess) {
        const key = `${ACTIVITY_PREFIX}${entry.userId}`;
        this.redis.hset(key, 'count', '0').catch(() => {});
      }
    }

    console.log(`[activity-strategy] Cycle: ${users.length} active, ${queuedCount} queued`);

    return {
      processed: users.length,
      queued: queuedCount,
      cleaned: 0,
    };
  }

  /**
   * Get strategy statistics
   */
  getStats(): {
    trackedUsers: number;
    totalActivity: number;
    running: boolean;
  } {
    return {
      trackedUsers: 0, // Now tracked in Redis, not in-memory
      totalActivity: 0,
      running: this.running,
    };
  }

  /**
   * Clear all tracked activity
   */
  clear(): void {
    if (this.redis) {
      this.redis.del(ACTIVE_SET_KEY).catch(() => {});
    }
  }
}

/**
 * Create an activity-based strategy
 */
export function createActivityBasedStrategy(
  prefetchQueue: PrefetchQueue,
  config?: Partial<ActivityBasedConfig>,
  redis?: Redis
): ActivityBasedStrategy {
  return new ActivityBasedStrategy(prefetchQueue, config, redis);
}
