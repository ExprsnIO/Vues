import { Redis } from 'ioredis';

/**
 * Cache tier configuration
 */
export interface CacheTierConfig {
  name: string;
  ttlMs: number;
  db: number;
}

/**
 * Default cache tiers
 */
export const DEFAULT_CACHE_TIERS: CacheTierConfig[] = [
  { name: 'hot', ttlMs: 5 * 60 * 1000, db: 0 },      // 5 minutes
  { name: 'warm', ttlMs: 15 * 60 * 1000, db: 1 },    // 15 minutes
  { name: 'cold', ttlMs: 60 * 60 * 1000, db: 2 },    // 1 hour
];

/**
 * Cache result with tier information
 */
export interface CacheResult<T> {
  data: T;
  tier: string;
  ttl: number;
}

/**
 * Cache metrics
 */
export interface CacheMetrics {
  hits: Map<string, number>;
  misses: number;
  promotions: number;
}

/**
 * Multi-tier Redis cache implementation
 *
 * Hot tier: Recently active users, highest priority
 * Warm tier: Medium activity users
 * Cold tier: Fallback, longest TTL
 */
export class TieredCache {
  private tiers: Map<string, Redis> = new Map();
  private tierConfigs: Map<string, CacheTierConfig> = new Map();
  private metrics: CacheMetrics = {
    hits: new Map(),
    misses: 0,
    promotions: 0,
  };

  constructor(
    private redisUrl: string,
    private tiers_config: CacheTierConfig[] = DEFAULT_CACHE_TIERS
  ) {
    // Initialize Redis clients for each tier
    for (const tier of tiers_config) {
      const url = new URL(redisUrl);
      const client = new Redis({
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        db: tier.db,
        lazyConnect: true,
      });
      this.tiers.set(tier.name, client);
      this.tierConfigs.set(tier.name, tier);
    }
  }

  /**
   * Connect all Redis clients
   */
  async connect(): Promise<void> {
    const connections = Array.from(this.tiers.values()).map((client) =>
      client.connect().catch(() => {})
    );
    await Promise.all(connections);
  }

  /**
   * Disconnect all Redis clients
   */
  async disconnect(): Promise<void> {
    const disconnections = Array.from(this.tiers.values()).map((client) =>
      client.quit()
    );
    await Promise.all(disconnections);
  }

  /**
   * Get a value from the cache, checking all tiers
   * Promotes to hot tier on cache hit in lower tiers
   */
  async get<T>(key: string): Promise<CacheResult<T> | null> {
    for (const [tierName, client] of this.tiers) {
      try {
        const data = await client.get(key);
        if (data) {
          // Record hit
          const currentHits = this.metrics.hits.get(tierName) || 0;
          this.metrics.hits.set(tierName, currentHits + 1);

          const parsed = JSON.parse(data) as T;

          // Promote to hot tier if found in lower tier
          if (tierName !== 'hot') {
            await this.promoteToHot(key, data);
            this.metrics.promotions++;
          }

          const ttl = await client.ttl(key);

          return {
            data: parsed,
            tier: tierName,
            ttl: ttl > 0 ? ttl * 1000 : 0,
          };
        }
      } catch {
        // Continue to next tier on error
      }
    }

    this.metrics.misses++;
    return null;
  }

  /**
   * Set a value in a specific tier
   */
  async set(
    key: string,
    value: unknown,
    tier: 'hot' | 'warm' | 'cold' = 'warm'
  ): Promise<void> {
    const client = this.tiers.get(tier);
    const config = this.tierConfigs.get(tier);

    if (!client || !config) {
      throw new Error(`Unknown cache tier: ${tier}`);
    }

    const serialized = JSON.stringify(value);
    const ttlSeconds = Math.floor(config.ttlMs / 1000);

    await client.setex(key, ttlSeconds, serialized);
  }

  /**
   * Promote a value to the hot tier
   */
  private async promoteToHot(key: string, data: string): Promise<void> {
    const hotClient = this.tiers.get('hot');
    const hotConfig = this.tierConfigs.get('hot');

    if (!hotClient || !hotConfig) return;

    const ttlSeconds = Math.floor(hotConfig.ttlMs / 1000);
    await hotClient.setex(key, ttlSeconds, data);
  }

  /**
   * Invalidate a key across all tiers
   */
  async invalidate(key: string): Promise<void> {
    const deletions = Array.from(this.tiers.values()).map((client) =>
      client.del(key)
    );
    await Promise.all(deletions);
  }

  /**
   * Invalidate all keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let totalDeleted = 0;

    for (const client of this.tiers.values()) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        const deleted = await client.del(...keys);
        totalDeleted += deleted;
      }
    }

    return totalDeleted;
  }

  /**
   * Check if a key exists in any tier
   */
  async exists(key: string): Promise<{ exists: boolean; tier?: string }> {
    for (const [tierName, client] of this.tiers) {
      const exists = await client.exists(key);
      if (exists) {
        return { exists: true, tier: tierName };
      }
    }
    return { exists: false };
  }

  /**
   * Get TTL for a key (checks all tiers)
   */
  async getTtl(key: string): Promise<{ ttl: number; tier?: string } | null> {
    for (const [tierName, client] of this.tiers) {
      const ttl = await client.ttl(key);
      if (ttl > 0) {
        return { ttl: ttl * 1000, tier: tierName };
      }
    }
    return null;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): {
    hitRate: number;
    tierHits: Record<string, number>;
    misses: number;
    promotions: number;
  } {
    const totalHits = Array.from(this.metrics.hits.values()).reduce(
      (a, b) => a + b,
      0
    );
    const total = totalHits + this.metrics.misses;

    return {
      hitRate: total > 0 ? totalHits / total : 0,
      tierHits: Object.fromEntries(this.metrics.hits),
      misses: this.metrics.misses,
      promotions: this.metrics.promotions,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: new Map(),
      misses: 0,
      promotions: 0,
    };
  }

  /**
   * Get Redis client for a specific tier
   */
  getTierClient(tier: string): Redis | undefined {
    return this.tiers.get(tier);
  }
}

/**
 * Create a tiered cache instance
 */
export function createTieredCache(
  redisUrl: string,
  tiers?: CacheTierConfig[]
): TieredCache {
  return new TieredCache(redisUrl, tiers);
}
