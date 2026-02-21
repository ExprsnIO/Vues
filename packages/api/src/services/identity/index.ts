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
