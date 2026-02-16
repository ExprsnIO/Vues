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

/**
 * Activity-based prefetching strategy
 *
 * Tracks user activity and proactively prefetches timelines
 * for active users to reduce latency on subsequent requests.
 */
export class ActivityBasedStrategy {
  private recentlyActiveUsers = new Map<string, ActivityEntry>();
  private intervalId: NodeJS.Timeout | null = null;
  private config: ActivityBasedConfig;
  private running = false;

  constructor(
    private prefetchQueue: PrefetchQueue,
    config: Partial<ActivityBasedConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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

    console.log('Activity-based prefetch strategy started');
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
    console.log('Activity-based prefetch strategy stopped');
  }

  /**
   * Track user activity
   */
  trackActivity(userId: string): void {
    const existing = this.recentlyActiveUsers.get(userId);

    if (existing) {
      existing.lastActive = Date.now();
      existing.activityCount++;
    } else {
      this.recentlyActiveUsers.set(userId, {
        userId,
        lastActive: Date.now(),
        activityCount: 1,
      });
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
    const now = Date.now();
    const users: ActivityEntry[] = [];
    const toClean: string[] = [];

    // Collect active users and identify inactive ones
    for (const [userId, entry] of this.recentlyActiveUsers) {
      const timeSinceActive = now - entry.lastActive;

      if (timeSinceActive > this.config.inactivityTimeout) {
        toClean.push(userId);
      } else if (entry.activityCount >= this.config.activityThreshold) {
        users.push(entry);
      }
    }

    // Clean up inactive users
    for (const userId of toClean) {
      this.recentlyActiveUsers.delete(userId);
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

    // Reset activity counts for processed users
    for (const entry of toProcess) {
      entry.activityCount = 0;
    }

    return {
      processed: users.length,
      queued: queuedCount,
      cleaned: toClean.length,
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
    let totalActivity = 0;
    for (const entry of this.recentlyActiveUsers.values()) {
      totalActivity += entry.activityCount;
    }

    return {
      trackedUsers: this.recentlyActiveUsers.size,
      totalActivity,
      running: this.running,
    };
  }

  /**
   * Clear all tracked activity
   */
  clear(): void {
    this.recentlyActiveUsers.clear();
  }
}

/**
 * Create an activity-based strategy
 */
export function createActivityBasedStrategy(
  prefetchQueue: PrefetchQueue,
  config?: Partial<ActivityBasedConfig>
): ActivityBasedStrategy {
  return new ActivityBasedStrategy(prefetchQueue, config);
}
