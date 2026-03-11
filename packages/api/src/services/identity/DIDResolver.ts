/**
 * DID Resolution Service
 * Multi-tier caching DID resolver with handle verification
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { redis, CacheKeys } from '../../cache/redis.js';
import { CircuitBreaker, circuitBreakerRegistry } from '../../utils/CircuitBreaker.js';

/**
 * DID Document structure
 */
export interface DIDDocument {
  id: string;
  alsoKnownAs?: string[];
  verificationMethod?: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase?: string;
  }>;
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
}

/**
 * Resolved identity
 */
export interface ResolvedIdentity {
  did: string;
  handle?: string;
  pdsEndpoint?: string;
  signingKey?: string;
  document?: DIDDocument;
  resolvedAt: Date;
  source: 'cache' | 'database' | 'plc' | 'web';
}

/**
 * Handle verification result
 */
export interface HandleVerificationResult {
  valid: boolean;
  did?: string;
  method?: 'dns' | 'http';
  error?: string;
}

/**
 * DID Resolver configuration
 */
export interface DIDResolverConfig {
  db: PostgresJsDatabase<typeof schema>;
  // PLC directory URL
  plcUrl?: string;
  // Cache TTL in seconds
  memoryCacheTtl?: number;
  redisCacheTtl?: number;
  // Background refresh threshold (seconds before expiry)
  refreshThreshold?: number;
  // HTTP timeout
  httpTimeoutMs?: number;
}

const DEFAULT_CONFIG = {
  plcUrl: 'https://plc.directory',
  memoryCacheTtl: 300, // 5 minutes
  redisCacheTtl: 3600, // 1 hour
  refreshThreshold: 600, // 10 minutes
  httpTimeoutMs: 10000,
};

/**
 * DID Resolver
 *
 * Resolves DIDs with multi-tier caching:
 * 1. In-memory cache (fastest, short TTL)
 * 2. Redis cache (fast, medium TTL)
 * 3. Database (persistent, fallback)
 * 4. PLC directory / did:web (authoritative source)
 */
export class DIDResolver {
  private db: PostgresJsDatabase<typeof schema>;
  private plcUrl: string;
  private memoryCacheTtl: number;
  private redisCacheTtl: number;
  private refreshThreshold: number;
  private httpTimeoutMs: number;

  // In-memory cache
  private memoryCache: Map<string, { data: ResolvedIdentity; expiresAt: number }> = new Map();

  // Circuit breaker for PLC directory
  private plcBreaker: CircuitBreaker;

  // Background refresh queue
  private refreshQueue: Set<string> = new Set();
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(config: DIDResolverConfig) {
    this.db = config.db;
    this.plcUrl = config.plcUrl ?? DEFAULT_CONFIG.plcUrl;
    this.memoryCacheTtl = config.memoryCacheTtl ?? DEFAULT_CONFIG.memoryCacheTtl;
    this.redisCacheTtl = config.redisCacheTtl ?? DEFAULT_CONFIG.redisCacheTtl;
    this.refreshThreshold = config.refreshThreshold ?? DEFAULT_CONFIG.refreshThreshold;
    this.httpTimeoutMs = config.httpTimeoutMs ?? DEFAULT_CONFIG.httpTimeoutMs;

    this.plcBreaker = circuitBreakerRegistry.getOrCreate('plc-directory', {
      failureThreshold: 5,
      resetTimeout: 60000,
      onStateChange: (from, to) => {
        console.log(`[DIDResolver] PLC circuit breaker: ${from} -> ${to}`);
      },
    });
  }

  /**
   * Start background refresh
   */
  startBackgroundRefresh(intervalMs: number = 30000): void {
    if (this.refreshInterval) {
      return;
    }

    this.refreshInterval = setInterval(async () => {
      await this.processRefreshQueue();
    }, intervalMs);

    console.log('[DIDResolver] Background refresh started');
  }

  /**
   * Stop background refresh
   */
  stopBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    console.log('[DIDResolver] Background refresh stopped');
  }

  /**
   * Resolve a DID to its identity
   */
  async resolve(did: string): Promise<ResolvedIdentity | null> {
    // 1. Check memory cache
    const memoryCached = this.getFromMemoryCache(did);
    if (memoryCached) {
      return memoryCached;
    }

    // 2. Check Redis cache
    const redisCached = await this.getFromRedisCache(did);
    if (redisCached) {
      this.setMemoryCache(did, redisCached);
      return redisCached;
    }

    // 3. Check database
    const dbCached = await this.getFromDatabase(did);
    if (dbCached) {
      await this.setRedisCache(did, dbCached);
      this.setMemoryCache(did, dbCached);

      // Queue for refresh if stale
      if (this.isStale(dbCached)) {
        this.queueForRefresh(did);
      }

      return dbCached;
    }

    // 4. Resolve from authoritative source
    const resolved = await this.resolveFromSource(did);
    if (resolved) {
      await this.cacheResult(did, resolved);
      return resolved;
    }

    return null;
  }

  /**
   * Resolve PDS endpoint for a DID
   */
  async resolvePDS(did: string): Promise<string | null> {
    const identity = await this.resolve(did);
    return identity?.pdsEndpoint ?? null;
  }

  /**
   * Resolve handle for a DID
   */
  async resolveHandle(did: string): Promise<string | null> {
    const identity = await this.resolve(did);
    return identity?.handle ?? null;
  }

  /**
   * Verify a handle points to a DID
   */
  async verifyHandle(handle: string): Promise<HandleVerificationResult> {
    // Try DNS verification first
    const dnsResult = await this.verifyHandleViaDNS(handle);
    if (dnsResult.valid) {
      return dnsResult;
    }

    // Fall back to HTTP well-known
    const httpResult = await this.verifyHandleViaHTTP(handle);
    return httpResult;
  }

  /**
   * Resolve DID from handle
   */
  async resolveHandleToDID(handle: string): Promise<string | null> {
    const result = await this.verifyHandle(handle);
    return result.valid ? result.did ?? null : null;
  }

  /**
   * Get from memory cache
   */
  private getFromMemoryCache(did: string): ResolvedIdentity | null {
    const cached = this.memoryCache.get(did);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    if (cached) {
      this.memoryCache.delete(did);
    }
    return null;
  }

  /**
   * Set memory cache
   */
  private setMemoryCache(did: string, data: ResolvedIdentity): void {
    this.memoryCache.set(did, {
      data,
      expiresAt: Date.now() + this.memoryCacheTtl * 1000,
    });
  }

  /**
   * Get from Redis cache
   */
  private async getFromRedisCache(did: string): Promise<ResolvedIdentity | null> {
    try {
      const cached = await redis.get(CacheKeys.did(did));
      if (cached) {
        const data = JSON.parse(cached);
        return {
          ...data,
          resolvedAt: new Date(data.resolvedAt),
          source: 'cache',
        };
      }
    } catch {
      // Redis error, continue to next layer
    }
    return null;
  }

  /**
   * Set Redis cache
   */
  private async setRedisCache(did: string, data: ResolvedIdentity): Promise<void> {
    try {
      await redis.setex(
        CacheKeys.did(did),
        this.redisCacheTtl,
        JSON.stringify(data)
      );
    } catch {
      // Redis error, continue
    }
  }

  /**
   * Get from database
   */
  private async getFromDatabase(did: string): Promise<ResolvedIdentity | null> {
    const identity = await this.db.query.plcIdentities?.findFirst({
      where: eq(schema.plcIdentities.did, did),
    });

    if (!identity) {
      return null;
    }

    return {
      did: identity.did,
      handle: identity.handle || undefined,
      pdsEndpoint: identity.pdsEndpoint || undefined,
      signingKey: identity.signingKey || undefined,
      document: identity.document as DIDDocument | undefined,
      resolvedAt: identity.updatedAt || identity.createdAt,
      source: 'database',
    };
  }

  /**
   * Resolve from authoritative source (PLC, did:web, or did:exprsn)
   */
  private async resolveFromSource(did: string): Promise<ResolvedIdentity | null> {
    if (did.startsWith('did:plc:')) {
      return this.resolveFromPLC(did);
    } else if (did.startsWith('did:web:')) {
      return this.resolveFromWeb(did);
    } else if (did.startsWith('did:exprsn:')) {
      return this.resolveFromExprsn(did);
    }
    return null;
  }

  /**
   * Resolve from PLC directory
   */
  private async resolveFromPLC(did: string): Promise<ResolvedIdentity | null> {
    try {
      return await this.plcBreaker.execute(async () => {
        const response = await fetch(`${this.plcUrl}/${did}`, {
          signal: AbortSignal.timeout(this.httpTimeoutMs),
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`PLC returned ${response.status}`);
        }

        const doc = await response.json() as DIDDocument;
        return this.parseDocument(did, doc, 'plc');
      });
    } catch (error) {
      console.error(`[DIDResolver] Failed to resolve ${did} from PLC:`, error);
      return null;
    }
  }

  /**
   * Resolve from did:web
   */
  private async resolveFromWeb(did: string): Promise<ResolvedIdentity | null> {
    try {
      // did:web:example.com -> https://example.com/.well-known/did.json
      // did:web:example.com:path:to -> https://example.com/path/to/did.json
      const parts = did.replace('did:web:', '').split(':');
      const domain = parts[0]?.replace(/%3A/g, ':');
      const path = parts.slice(1).join('/');

      if (!domain) {
        return null;
      }

      const url = path
        ? `https://${domain}/${path}/did.json`
        : `https://${domain}/.well-known/did.json`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });

      if (!response.ok) {
        return null;
      }

      const doc = await response.json() as DIDDocument;
      return this.parseDocument(did, doc, 'web');
    } catch (error) {
      console.error(`[DIDResolver] Failed to resolve ${did} from web:`, error);
      return null;
    }
  }

  /**
   * Resolve from did:exprsn (certificate-backed DID)
   */
  private async resolveFromExprsn(did: string): Promise<ResolvedIdentity | null> {
    try {
      // Import ExprsnDidService dynamically to avoid circular dependency
      const { ExprsnDidService } = await import('../did/exprsn.js');

      // Get DID document from exprsn service
      const document = await ExprsnDidService.getDidDocument(did);

      if (!document) {
        return null;
      }

      // Parse the document following same pattern as other methods
      return this.parseDocument(did, document as unknown as DIDDocument, 'web'); // Use 'web' as source type
    } catch (error) {
      console.error(`[DIDResolver] Failed to resolve ${did} from exprsn:`, error);
      return null;
    }
  }

  /**
   * Parse DID document into resolved identity
   */
  private parseDocument(
    did: string,
    doc: DIDDocument,
    source: 'plc' | 'web'
  ): ResolvedIdentity {
    // Extract handle from alsoKnownAs
    const handle = doc.alsoKnownAs?.find((aka) => aka.startsWith('at://'))
      ?.replace('at://', '');

    // Extract PDS endpoint
    const pdsService = doc.service?.find(
      (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
    );
    const pdsEndpoint = pdsService?.serviceEndpoint;

    // Extract signing key
    const signingKey = doc.verificationMethod?.find(
      (v) => v.id === `${did}#atproto`
    )?.publicKeyMultibase;

    return {
      did,
      handle,
      pdsEndpoint,
      signingKey,
      document: doc,
      resolvedAt: new Date(),
      source,
    };
  }

  /**
   * Cache resolved result
   */
  private async cacheResult(did: string, data: ResolvedIdentity): Promise<void> {
    // Memory cache
    this.setMemoryCache(did, data);

    // Redis cache
    await this.setRedisCache(did, data);

    // Database (persistent)
    await this.db
      .insert(schema.plcIdentities)
      .values({
        did,
        handle: data.handle,
        pdsEndpoint: data.pdsEndpoint,
        signingKey: data.signingKey,
        document: data.document,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.plcIdentities.did,
        set: {
          handle: data.handle,
          pdsEndpoint: data.pdsEndpoint,
          signingKey: data.signingKey,
          document: data.document,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Check if cached data is stale
   */
  private isStale(data: ResolvedIdentity): boolean {
    const age = Date.now() - data.resolvedAt.getTime();
    return age > (this.redisCacheTtl - this.refreshThreshold) * 1000;
  }

  /**
   * Queue DID for background refresh
   */
  private queueForRefresh(did: string): void {
    this.refreshQueue.add(did);
  }

  /**
   * Process refresh queue
   */
  private async processRefreshQueue(): Promise<void> {
    if (this.refreshQueue.size === 0) {
      return;
    }

    const dids = Array.from(this.refreshQueue);
    this.refreshQueue.clear();

    console.log(`[DIDResolver] Refreshing ${dids.length} stale DIDs`);

    for (const did of dids) {
      try {
        const resolved = await this.resolveFromSource(did);
        if (resolved) {
          await this.cacheResult(did, resolved);
        }
      } catch (error) {
        console.error(`[DIDResolver] Failed to refresh ${did}:`, error);
      }
    }
  }

  /**
   * Verify handle via DNS TXT record
   */
  private async verifyHandleViaDNS(handle: string): Promise<HandleVerificationResult> {
    try {
      // Query _atproto.handle TXT record
      const url = `https://cloudflare-dns.com/dns-query?name=_atproto.${handle}&type=TXT`;

      const response = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { valid: false, error: 'DNS query failed' };
      }

      const data = await response.json() as {
        Answer?: Array<{ data: string }>;
      };

      // Look for did= in TXT records
      for (const answer of data.Answer || []) {
        const match = answer.data.match(/did=([^"]+)/);
        if (match) {
          return {
            valid: true,
            did: match[1],
            method: 'dns',
          };
        }
      }

      return { valid: false, error: 'No DID found in DNS' };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'DNS verification failed',
      };
    }
  }

  /**
   * Verify handle via HTTP well-known
   */
  private async verifyHandleViaHTTP(handle: string): Promise<HandleVerificationResult> {
    try {
      const url = `https://${handle}/.well-known/atproto-did`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { valid: false, error: `HTTP ${response.status}` };
      }

      const did = (await response.text()).trim();

      if (did.startsWith('did:')) {
        return {
          valid: true,
          did,
          method: 'http',
        };
      }

      return { valid: false, error: 'Invalid DID format' };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'HTTP verification failed',
      };
    }
  }

  /**
   * Invalidate cache for a DID
   */
  async invalidate(did: string): Promise<void> {
    this.memoryCache.delete(did);
    await redis.del(CacheKeys.did(did));
    console.log(`[DIDResolver] Invalidated cache for ${did}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryCacheSize: number;
    refreshQueueSize: number;
    plcCircuitState: string;
  } {
    return {
      memoryCacheSize: this.memoryCache.size,
      refreshQueueSize: this.refreshQueue.size,
      plcCircuitState: this.plcBreaker.getState(),
    };
  }
}

/**
 * Create DID resolver instance
 */
export function createDIDResolver(
  db: PostgresJsDatabase<typeof schema>,
  config?: Partial<DIDResolverConfig>
): DIDResolver {
  return new DIDResolver({ db, ...config });
}

// Add cache key for DIDs
declare module '../../cache/redis.js' {
  interface CacheKeysType {
    did(did: string): string;
  }
}

// Extend CacheKeys if not already defined
if (typeof CacheKeys.did !== 'function') {
  (CacheKeys as any).did = (did: string) => `did:${did}`;
}
