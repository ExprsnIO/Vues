import { eq, lt, gt, and } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { db } from '../../db/index.js';
import { didCache } from '../../db/schema.js';
import { DidResolver, createDidResolver, type ResolvedDid, type DidResolverConfig } from '@exprsn/pds';

export type { ResolvedDid };

/**
 * Identity service configuration
 */
export interface IdentityServiceConfig {
  redis?: Redis;
  plcUrl?: string;
  cacheTtlMs?: number;
  staleTtlMs?: number;
  httpTimeout?: number;
  persistToDb?: boolean;
}

/**
 * Identity service that combines DID resolution with database persistence
 */
export class IdentityService {
  private resolver: DidResolver;
  private shouldPersistToDb: boolean;
  private staleTtlMs: number;

  constructor(config: IdentityServiceConfig = {}) {
    const resolverConfig: DidResolverConfig = {
      redis: config.redis,
      plcUrl: config.plcUrl || process.env.PLC_URL || 'https://plc.directory',
      cacheTtlMs: config.cacheTtlMs || parseInt(process.env.DID_CACHE_TTL || '3600', 10) * 1000,
      staleTtlMs: config.staleTtlMs || parseInt(process.env.DID_STALE_TTL || '86400', 10) * 1000,
      httpTimeout: config.httpTimeout || 10000,
    };

    this.resolver = createDidResolver(resolverConfig);
    this.shouldPersistToDb = config.persistToDb ?? true;
    this.staleTtlMs = resolverConfig.staleTtlMs || 86400000;
  }

  /**
   * Resolve a DID to its document with database fallback
   */
  async resolve(did: string): Promise<ResolvedDid | null> {
    // Try Redis/memory cache first via resolver
    const cached = await this.resolver.resolve(did);
    if (cached) {
      return cached;
    }

    // Try database cache if persistence is enabled
    if (this.shouldPersistToDb) {
      const dbCached = await this.getFromDb(did);
      if (dbCached) {
        return dbCached;
      }
    }

    return null;
  }

  /**
   * Resolve and persist - always fetches fresh if not cached
   */
  async resolveAndPersist(did: string): Promise<ResolvedDid | null> {
    const resolved = await this.resolver.resolve(did);

    if (resolved && this.shouldPersistToDb) {
      await this.persistToDatabase(did, resolved);
    }

    return resolved;
  }

  /**
   * Resolve a handle to a DID
   */
  async resolveHandle(handle: string): Promise<string | null> {
    return this.resolver.resolveHandle(handle);
  }

  /**
   * Invalidate cache for a DID
   */
  async invalidate(did: string): Promise<void> {
    await this.resolver.invalidate(did);

    if (this.shouldPersistToDb) {
      await db.delete(didCache).where(eq(didCache.did, did));
    }
  }

  /**
   * Clear all cached DIDs
   */
  async clearCache(): Promise<void> {
    await this.resolver.clearCache();

    if (this.shouldPersistToDb) {
      await db.delete(didCache);
    }
  }

  /**
   * Clear expired entries from database
   */
  async cleanupExpired(): Promise<number> {
    if (!this.shouldPersistToDb) {
      return 0;
    }

    const result = await db
      .delete(didCache)
      .where(lt(didCache.expiresAt, new Date()));

    return 0; // drizzle doesn't return count easily
  }

  /**
   * Get from database cache
   */
  private async getFromDb(did: string): Promise<ResolvedDid | null> {
    const results = await db
      .select()
      .from(didCache)
      .where(
        and(
          eq(didCache.did, did),
          gt(didCache.expiresAt, new Date())
        )
      )
      .limit(1);

    const entry = results[0];
    if (!entry) {
      return null;
    }

    return {
      did: entry.did,
      document: entry.document as ResolvedDid['document'],
      handle: entry.handle,
      pdsEndpoint: entry.pdsEndpoint,
      signingKey: null, // Not stored in DB cache
      resolvedAt: entry.resolvedAt,
    };
  }

  /**
   * Persist to database
   */
  private async persistToDatabase(did: string, resolved: ResolvedDid): Promise<void> {
    const expiresAt = new Date(Date.now() + this.staleTtlMs);

    await db
      .insert(didCache)
      .values({
        did,
        document: resolved.document,
        handle: resolved.handle,
        pdsEndpoint: resolved.pdsEndpoint,
        resolvedAt: resolved.resolvedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: didCache.did,
        set: {
          document: resolved.document,
          handle: resolved.handle,
          pdsEndpoint: resolved.pdsEndpoint,
          resolvedAt: resolved.resolvedAt,
          expiresAt,
        },
      });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryCache: { size: number };
    dbCache: { count: number; expired: number };
  }> {
    const resolverStats = this.resolver.getCacheStats();

    let dbCount = 0;
    let expiredCount = 0;

    if (this.shouldPersistToDb) {
      const countResult = await db
        .select({ count: didCache.did })
        .from(didCache);
      dbCount = countResult.length;

      const expiredResult = await db
        .select({ count: didCache.did })
        .from(didCache)
        .where(lt(didCache.expiresAt, new Date()));
      expiredCount = expiredResult.length;
    }

    return {
      memoryCache: { size: resolverStats.localCacheSize },
      dbCache: { count: dbCount, expired: expiredCount },
    };
  }

  // =============================================
  // Cache Warming Features
  // =============================================

  /**
   * Warm the cache from database entries
   * Loads unexpired entries from DB into Redis/memory cache
   */
  async warmCacheFromDb(options: {
    limit?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}): Promise<{ loaded: number; errors: number }> {
    if (!this.shouldPersistToDb) {
      return { loaded: 0, errors: 0 };
    }

    const limit = options.limit || 1000;
    let loaded = 0;
    let errors = 0;

    // Get unexpired entries from database
    const entries = await db
      .select()
      .from(didCache)
      .where(gt(didCache.expiresAt, new Date()))
      .limit(limit);

    const total = entries.length;

    for (const entry of entries) {
      try {
        // Warm the resolver cache with the DB data
        const resolved: ResolvedDid = {
          did: entry.did,
          document: entry.document as ResolvedDid['document'],
          handle: entry.handle,
          pdsEndpoint: entry.pdsEndpoint,
          signingKey: null,
          resolvedAt: entry.resolvedAt,
        };

        await this.resolver.cacheResolved(entry.did, resolved);
        loaded++;

        if (options.onProgress) {
          options.onProgress(loaded, total);
        }
      } catch (error) {
        errors++;
        console.error(`[IdentityService] Failed to warm cache for ${entry.did}:`, error);
      }
    }

    return { loaded, errors };
  }

  /**
   * Refresh stale entries in the cache
   * Re-resolves DIDs that are about to expire
   */
  async refreshStaleEntries(options: {
    expiresInMs?: number;
    limit?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}): Promise<{ refreshed: number; errors: number }> {
    if (!this.shouldPersistToDb) {
      return { refreshed: 0, errors: 0 };
    }

    const expiresInMs = options.expiresInMs || 3600000; // Default: 1 hour
    const limit = options.limit || 100;
    let refreshed = 0;
    let errors = 0;

    const expiresThreshold = new Date(Date.now() + expiresInMs);

    // Get entries that will expire soon
    const staleEntries = await db
      .select()
      .from(didCache)
      .where(
        and(
          lt(didCache.expiresAt, expiresThreshold),
          gt(didCache.expiresAt, new Date())
        )
      )
      .limit(limit);

    const total = staleEntries.length;

    for (const entry of staleEntries) {
      try {
        // Re-resolve the DID
        const resolved = await this.resolver.resolve(entry.did);
        if (resolved) {
          await this.persistToDatabase(entry.did, resolved);
          refreshed++;
        }

        if (options.onProgress) {
          options.onProgress(refreshed, total);
        }
      } catch (error) {
        errors++;
        console.error(`[IdentityService] Failed to refresh ${entry.did}:`, error);
      }
    }

    return { refreshed, errors };
  }

  /**
   * Bulk resolve multiple DIDs
   * Useful for warming cache with known DIDs
   */
  async bulkResolve(dids: string[], options: {
    concurrency?: number;
    skipExisting?: boolean;
    onProgress?: (current: number, total: number) => void;
  } = {}): Promise<{
    resolved: number;
    skipped: number;
    errors: number;
    results: Map<string, ResolvedDid | null>;
  }> {
    const concurrency = options.concurrency || 5;
    const skipExisting = options.skipExisting ?? true;

    let resolved = 0;
    let skipped = 0;
    let errors = 0;
    const results = new Map<string, ResolvedDid | null>();

    const total = dids.length;

    // Process in batches for concurrency control
    for (let i = 0; i < dids.length; i += concurrency) {
      const batch = dids.slice(i, i + concurrency);

      await Promise.all(
        batch.map(async (did) => {
          try {
            // Check if already cached
            if (skipExisting) {
              const cached = await this.resolve(did);
              if (cached) {
                results.set(did, cached);
                skipped++;
                return;
              }
            }

            // Resolve and persist
            const result = await this.resolveAndPersist(did);
            results.set(did, result);

            if (result) {
              resolved++;
            } else {
              errors++;
            }
          } catch (error) {
            errors++;
            results.set(did, null);
            console.error(`[IdentityService] Failed to resolve ${did}:`, error);
          }
        })
      );

      if (options.onProgress) {
        options.onProgress(Math.min(i + concurrency, total), total);
      }
    }

    return { resolved, skipped, errors, results };
  }

  /**
   * Get popular/recent DIDs that should be kept warm
   * Returns DIDs from users table sorted by activity
   */
  async getWarmCandidates(options: {
    limit?: number;
    minFollowers?: number;
    recentActivityDays?: number;
  } = {}): Promise<string[]> {
    const { users } = await import('../../db/schema.js');
    const limit = options.limit || 100;
    const minFollowers = options.minFollowers || 0;

    let query = db
      .select({ did: users.did })
      .from(users);

    // Filter by follower count
    if (minFollowers > 0) {
      const { gte } = await import('drizzle-orm');
      query = query.where(gte(users.followerCount, minFollowers)) as typeof query;
    }

    // Sort by followers (most popular first)
    const { desc } = await import('drizzle-orm');
    const results = await query
      .orderBy(desc(users.followerCount))
      .limit(limit);

    return results.map(r => r.did);
  }

  /**
   * Start background cache warming task
   */
  startBackgroundWarming(options: {
    intervalMs?: number;
    warmFromDbOnStart?: boolean;
    refreshStaleIntervalMs?: number;
  } = {}): { stop: () => void } {
    const intervalMs = options.intervalMs || 300000; // 5 minutes
    const refreshStaleIntervalMs = options.refreshStaleIntervalMs || 3600000; // 1 hour

    let stopped = false;

    // Initial warm from DB
    if (options.warmFromDbOnStart !== false) {
      this.warmCacheFromDb({ limit: 500 }).then(result => {
        console.log(`[IdentityService] Initial cache warm: ${result.loaded} loaded, ${result.errors} errors`);
      });
    }

    // Periodic cache warming
    const warmInterval = setInterval(async () => {
      if (stopped) return;

      try {
        // Get popular DIDs and warm them
        const candidates = await this.getWarmCandidates({ limit: 50 });
        await this.bulkResolve(candidates, { skipExisting: true });
      } catch (error) {
        console.error('[IdentityService] Background warming error:', error);
      }
    }, intervalMs);

    // Periodic stale refresh
    const refreshInterval = setInterval(async () => {
      if (stopped) return;

      try {
        const result = await this.refreshStaleEntries({ limit: 50 });
        if (result.refreshed > 0) {
          console.log(`[IdentityService] Refreshed ${result.refreshed} stale entries`);
        }
      } catch (error) {
        console.error('[IdentityService] Stale refresh error:', error);
      }
    }, refreshStaleIntervalMs);

    return {
      stop: () => {
        stopped = true;
        clearInterval(warmInterval);
        clearInterval(refreshInterval);
      }
    };
  }
}

// Singleton instance
let identityService: IdentityService | null = null;

/**
 * Get or create the identity service singleton
 */
export function getIdentityService(config?: IdentityServiceConfig): IdentityService {
  if (!identityService) {
    identityService = new IdentityService(config);
  }
  return identityService;
}

/**
 * Initialize the identity service with configuration
 */
export function initializeIdentityService(config: IdentityServiceConfig): IdentityService {
  identityService = new IdentityService(config);
  return identityService;
}

export default IdentityService;
