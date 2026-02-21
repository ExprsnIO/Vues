import { Redis } from 'ioredis';
import { CID } from 'multiformats/cid';

/**
 * DID Document structure (subset of W3C DID spec)
 */
export interface DidDocument {
  '@context': string[];
  id: string;
  alsoKnownAs?: string[];
  verificationMethod?: VerificationMethod[];
  service?: ServiceEndpoint[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

/**
 * Resolved DID result
 */
export interface ResolvedDid {
  did: string;
  document: DidDocument;
  handle: string | null;
  pdsEndpoint: string | null;
  signingKey: string | null;
  resolvedAt: Date;
}

/**
 * DID resolver configuration
 */
export interface DidResolverConfig {
  redis?: Redis;
  plcUrl?: string;
  cacheTtlMs?: number;
  staleTtlMs?: number;
  httpTimeout?: number;
}

/**
 * In-flight request tracking for deduplication
 */
const inFlightRequests = new Map<string, Promise<ResolvedDid | null>>();

/**
 * DID Resolver with caching
 * Supports did:web and did:plc resolution
 */
export class DidResolver {
  private redis: Redis | null;
  private plcUrl: string;
  private cacheTtlMs: number;
  private staleTtlMs: number;
  private httpTimeout: number;
  private readonly CACHE_PREFIX = 'did:cache:';
  private localCache = new Map<string, { data: ResolvedDid; expiresAt: number }>();

  constructor(config: DidResolverConfig = {}) {
    this.redis = config.redis || null;
    this.plcUrl = config.plcUrl || 'https://plc.directory';
    this.cacheTtlMs = config.cacheTtlMs || 3600000; // 1 hour
    this.staleTtlMs = config.staleTtlMs || 86400000; // 24 hours
    this.httpTimeout = config.httpTimeout || 10000; // 10 seconds
  }

  /**
   * Resolve a DID to its document
   */
  async resolve(did: string): Promise<ResolvedDid | null> {
    // Check for in-flight request to deduplicate
    const inFlight = inFlightRequests.get(did);
    if (inFlight) {
      return inFlight;
    }

    // Check cache first
    const cached = await this.getFromCache(did);
    if (cached) {
      return cached;
    }

    // Create resolution promise
    const resolvePromise = this.resolveUncached(did);
    inFlightRequests.set(did, resolvePromise);

    try {
      const result = await resolvePromise;
      if (result) {
        await this.setCache(did, result);
      }
      return result;
    } finally {
      inFlightRequests.delete(did);
    }
  }

  /**
   * Resolve without caching
   */
  private async resolveUncached(did: string): Promise<ResolvedDid | null> {
    if (did.startsWith('did:web:')) {
      return this.resolveDidWeb(did);
    } else if (did.startsWith('did:plc:')) {
      return this.resolveDidPlc(did);
    }
    return null;
  }

  /**
   * Resolve did:web
   */
  private async resolveDidWeb(did: string): Promise<ResolvedDid | null> {
    try {
      // Parse did:web:example.com or did:web:example.com:path
      const parts = did.slice(8).split(':');
      const domain = decodeURIComponent(parts[0]);
      const path = parts.slice(1).map(decodeURIComponent).join('/');

      const url = path
        ? `https://${domain}/${path}/did.json`
        : `https://${domain}/.well-known/did.json`;

      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        return null;
      }

      const document = (await response.json()) as DidDocument;

      // Validate document ID matches
      if (document.id !== did) {
        console.warn(`DID document ID mismatch: expected ${did}, got ${document.id}`);
        return null;
      }

      return this.parseDocument(did, document);
    } catch (error) {
      console.error(`Failed to resolve did:web ${did}:`, error);
      return null;
    }
  }

  /**
   * Resolve did:plc via PLC directory
   */
  private async resolveDidPlc(did: string): Promise<ResolvedDid | null> {
    try {
      const url = `${this.plcUrl}/${did}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const document = (await response.json()) as DidDocument;
      return this.parseDocument(did, document);
    } catch (error) {
      console.error(`Failed to resolve did:plc ${did}:`, error);
      return null;
    }
  }

  /**
   * Parse DID document to extract useful info
   */
  private parseDocument(did: string, document: DidDocument): ResolvedDid {
    // Extract handle from alsoKnownAs
    let handle: string | null = null;
    if (document.alsoKnownAs) {
      for (const alias of document.alsoKnownAs) {
        if (alias.startsWith('at://')) {
          handle = alias.slice(5);
          break;
        }
      }
    }

    // Extract PDS endpoint
    let pdsEndpoint: string | null = null;
    if (document.service) {
      const pdsService = document.service.find(
        (s) => s.type === 'AtprotoPersonalDataServer'
      );
      if (pdsService) {
        pdsEndpoint = pdsService.serviceEndpoint;
      }
    }

    // Extract signing key
    let signingKey: string | null = null;
    if (document.verificationMethod) {
      const keyMethod = document.verificationMethod.find(
        (m) => m.id === `${did}#atproto` || m.id.endsWith('#atproto')
      );
      if (keyMethod && keyMethod.publicKeyMultibase) {
        signingKey = keyMethod.publicKeyMultibase;
      }
    }

    return {
      did,
      document,
      handle,
      pdsEndpoint,
      signingKey,
      resolvedAt: new Date(),
    };
  }

  /**
   * Resolve a handle to a DID
   */
  async resolveHandle(handle: string): Promise<string | null> {
    // Normalize handle
    const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

    // Try DNS TXT record first
    const dnsResult = await this.resolveHandleViaDns(normalizedHandle);
    if (dnsResult) {
      return dnsResult;
    }

    // Fall back to HTTP well-known
    return this.resolveHandleViaHttp(normalizedHandle);
  }

  /**
   * Resolve handle via DNS TXT record
   */
  private async resolveHandleViaDns(handle: string): Promise<string | null> {
    try {
      // In browser/Node.js, we'd use DNS lookup
      // For now, this is a placeholder - actual implementation would use dns.resolveTxt
      const dnsName = `_atproto.${handle}`;

      // Attempt DNS resolution via DoH (DNS over HTTPS)
      const response = await this.fetchWithTimeout(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dnsName)}&type=TXT`,
        {
          headers: {
            Accept: 'application/dns-json',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        Answer?: Array<{ data: string }>;
      };

      if (data.Answer) {
        for (const answer of data.Answer) {
          const value = answer.data.replace(/"/g, '');
          if (value.startsWith('did=')) {
            return value.slice(4);
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve handle via HTTP well-known
   */
  private async resolveHandleViaHttp(handle: string): Promise<string | null> {
    try {
      const url = `https://${handle}/.well-known/atproto-did`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const did = (await response.text()).trim();
      if (did.startsWith('did:')) {
        return did;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.httpTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get from cache
   */
  private async getFromCache(did: string): Promise<ResolvedDid | null> {
    // Check local cache first
    const localEntry = this.localCache.get(did);
    if (localEntry && localEntry.expiresAt > Date.now()) {
      return localEntry.data;
    }

    // Check Redis cache
    if (this.redis) {
      try {
        const key = this.CACHE_PREFIX + did;
        const cached = await this.redis.get(key);

        if (cached) {
          const data = JSON.parse(cached) as ResolvedDid & {
            resolvedAt: string;
          };
          const resolved: ResolvedDid = {
            ...data,
            resolvedAt: new Date(data.resolvedAt),
          };

          // Update local cache
          this.localCache.set(did, {
            data: resolved,
            expiresAt: Date.now() + this.cacheTtlMs,
          });

          return resolved;
        }
      } catch (error) {
        console.error('Redis cache error:', error);
      }
    }

    return null;
  }

  /**
   * Set cache
   */
  private async setCache(did: string, data: ResolvedDid): Promise<void> {
    // Update local cache
    this.localCache.set(did, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    // Update Redis cache
    if (this.redis) {
      try {
        const key = this.CACHE_PREFIX + did;
        const serialized = JSON.stringify({
          ...data,
          resolvedAt: data.resolvedAt.toISOString(),
        });

        await this.redis.setex(key, Math.floor(this.staleTtlMs / 1000), serialized);
      } catch (error) {
        console.error('Redis cache error:', error);
      }
    }
  }

  /**
   * Invalidate cache for a DID
   */
  async invalidate(did: string): Promise<void> {
    this.localCache.delete(did);

    if (this.redis) {
      try {
        await this.redis.del(this.CACHE_PREFIX + did);
      } catch (error) {
        console.error('Redis cache error:', error);
      }
    }
  }

  /**
   * Clear all cached DIDs
   */
  async clearCache(): Promise<void> {
    this.localCache.clear();

    if (this.redis) {
      try {
        const keys = await this.redis.keys(this.CACHE_PREFIX + '*');
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (error) {
        console.error('Redis cache error:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    localCacheSize: number;
    localCacheHits: number;
  } {
    return {
      localCacheSize: this.localCache.size,
      localCacheHits: 0, // Would need to track this
    };
  }
}

/**
 * Create a DID resolver with default configuration
 */
export function createDidResolver(config?: DidResolverConfig): DidResolver {
  return new DidResolver(config);
}

export default DidResolver;
