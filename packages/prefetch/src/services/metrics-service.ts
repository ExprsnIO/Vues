import { Redis } from 'ioredis';

/**
 * Prefetch metrics
 */
export interface PrefetchMetrics {
  cache: {
    hitRate: number;
    hotHits: number;
    warmHits: number;
    coldHits: number;
    misses: number;
  };
  prefetch: {
    totalJobs: number;
    successful: number;
    failed: number;
    avgDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}

/**
 * Daily metrics
 */
export interface DailyMetrics extends PrefetchMetrics {
  date: string;
  peakHour: number;
  peakRequests: number;
}

/**
 * Metrics service configuration
 */
export interface MetricsServiceConfig {
  redisUrl: string;
  retentionDays: number;
}

const DEFAULT_CONFIG: MetricsServiceConfig = {
  redisUrl: 'redis://localhost:6379',
  retentionDays: 30,
};

/**
 * Metrics service for tracking prefetch performance
 */
export class MetricsService {
  private redis: Redis;
  private durations: number[] = [];
  private maxDurations = 1000; // Keep last 1000 durations for percentile calculation
  private config: MetricsServiceConfig;

  // In-memory counters
  private counters = {
    cacheHits: {
      hot: 0,
      warm: 0,
      cold: 0,
    },
    cacheMisses: 0,
    prefetchSuccessful: 0,
    prefetchFailed: 0,
  };

  constructor(config: Partial<MetricsServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = new Redis(this.config.redisUrl, {
      db: 3, // Use dedicated DB for metrics
      lazyConnect: true,
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    await this.redis.connect().catch(() => {});
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(tier: 'hot' | 'warm' | 'cold'): void {
    this.counters.cacheHits[tier]++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.counters.cacheMisses++;
  }

  /**
   * Record a prefetch operation
   */
  recordPrefetch(success: boolean, durationMs: number): void {
    if (success) {
      this.counters.prefetchSuccessful++;
    } else {
      this.counters.prefetchFailed++;
    }

    // Track duration
    this.durations.push(durationMs);
    if (this.durations.length > this.maxDurations) {
      this.durations.shift();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): Omit<PrefetchMetrics, 'queue'> {
    const totalCacheOps =
      this.counters.cacheHits.hot +
      this.counters.cacheHits.warm +
      this.counters.cacheHits.cold +
      this.counters.cacheMisses;

    const totalHits =
      this.counters.cacheHits.hot +
      this.counters.cacheHits.warm +
      this.counters.cacheHits.cold;

    return {
      cache: {
        hitRate: totalCacheOps > 0 ? totalHits / totalCacheOps : 0,
        hotHits: this.counters.cacheHits.hot,
        warmHits: this.counters.cacheHits.warm,
        coldHits: this.counters.cacheHits.cold,
        misses: this.counters.cacheMisses,
      },
      prefetch: {
        totalJobs: this.counters.prefetchSuccessful + this.counters.prefetchFailed,
        successful: this.counters.prefetchSuccessful,
        failed: this.counters.prefetchFailed,
        avgDuration: this.calculateAvgDuration(),
        p50Duration: this.calculatePercentile(50),
        p95Duration: this.calculatePercentile(95),
        p99Duration: this.calculatePercentile(99),
      },
    };
  }

  /**
   * Persist current metrics to Redis
   */
  async persistMetrics(): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    const key = `metrics:${date}`;

    const metrics = this.getMetrics();

    // Store hourly snapshot
    await this.redis.hset(key, `hour:${hour}`, JSON.stringify(metrics));

    // Update daily aggregates
    const currentDaily = await this.getDailyMetrics(date);
    if (currentDaily) {
      // Merge with existing
      await this.updateDailyAggregate(key, metrics, currentDaily);
    } else {
      // Create new daily record
      await this.redis.hset(key, 'aggregate', JSON.stringify(metrics));
    }

    // Set expiration
    await this.redis.expire(key, this.config.retentionDays * 24 * 60 * 60);
  }

  /**
   * Get metrics for a specific date
   */
  async getDailyMetrics(date: string): Promise<DailyMetrics | null> {
    const key = `metrics:${date}`;
    const aggregate = await this.redis.hget(key, 'aggregate');

    if (!aggregate) return null;

    try {
      const metrics = JSON.parse(aggregate) as PrefetchMetrics;
      return {
        ...metrics,
        date,
        peakHour: 0, // Would need to calculate from hourly data
        peakRequests: 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get metrics for a date range
   */
  async getMetricsRange(
    startDate: string,
    endDate: string
  ): Promise<DailyMetrics[]> {
    const results: DailyMetrics[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const metrics = await this.getDailyMetrics(dateStr);
      if (metrics) {
        results.push(metrics);
      }
    }

    return results;
  }

  /**
   * Reset in-memory counters
   */
  resetCounters(): void {
    this.counters = {
      cacheHits: { hot: 0, warm: 0, cold: 0 },
      cacheMisses: 0,
      prefetchSuccessful: 0,
      prefetchFailed: 0,
    };
    this.durations = [];
  }

  // Private helpers

  private calculateAvgDuration(): number {
    if (this.durations.length === 0) return 0;
    const sum = this.durations.reduce((a, b) => a + b, 0);
    return sum / this.durations.length;
  }

  private calculatePercentile(p: number): number {
    if (this.durations.length === 0) return 0;

    const sorted = [...this.durations].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private async updateDailyAggregate(
    key: string,
    current: Omit<PrefetchMetrics, 'queue'>,
    existing: DailyMetrics
  ): Promise<void> {
    const merged = {
      cache: {
        hitRate: (existing.cache.hitRate + current.cache.hitRate) / 2,
        hotHits: existing.cache.hotHits + current.cache.hotHits,
        warmHits: existing.cache.warmHits + current.cache.warmHits,
        coldHits: existing.cache.coldHits + current.cache.coldHits,
        misses: existing.cache.misses + current.cache.misses,
      },
      prefetch: {
        totalJobs: existing.prefetch.totalJobs + current.prefetch.totalJobs,
        successful: existing.prefetch.successful + current.prefetch.successful,
        failed: existing.prefetch.failed + current.prefetch.failed,
        avgDuration: (existing.prefetch.avgDuration + current.prefetch.avgDuration) / 2,
        p50Duration: (existing.prefetch.p50Duration + current.prefetch.p50Duration) / 2,
        p95Duration: Math.max(existing.prefetch.p95Duration, current.prefetch.p95Duration),
        p99Duration: Math.max(existing.prefetch.p99Duration, current.prefetch.p99Duration),
      },
    };

    await this.redis.hset(key, 'aggregate', JSON.stringify(merged));
  }
}

/**
 * Create a metrics service
 */
export function createMetricsService(
  config?: Partial<MetricsServiceConfig>
): MetricsService {
  return new MetricsService(config);
}
