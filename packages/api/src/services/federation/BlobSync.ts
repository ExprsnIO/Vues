/**
 * Blob Synchronization Service
 * Handles fetching and storing blobs from remote servers for federation
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, sql, lt, desc } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { getStorageProvider } from '../storage/index.js';
import { nanoid } from 'nanoid';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { redis } from '../../cache/redis.js';

/**
 * Create an AbortSignal that times out after the specified milliseconds
 * Compatible with older Node.js versions
 */
function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Blob metadata
 */
export interface BlobMetadata {
  cid: string;
  did: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

/**
 * Fetch result
 */
export interface FetchBlobResult {
  success: boolean;
  cid?: string;
  error?: string;
}

/**
 * BlobSync configuration
 */
export interface BlobSyncConfig {
  db: PostgresJsDatabase<typeof schema>;
  // Maximum blob size to fetch (default 100MB)
  maxBlobSize?: number;
  // Timeout for blob fetch (default 60s)
  fetchTimeoutMs?: number;
  // Number of retries (default 3)
  maxRetries?: number;
  // Enable CID verification (default true)
  verifyCid?: boolean;
  // Rate limit: max bytes per minute per DID (default 50MB)
  rateLimitBytesPerMinute?: number;
  // Storage quota per DID (default 1GB)
  storageQuotaPerDid?: number;
  // CDN base URL for serving blobs
  cdnBaseUrl?: string;
}

const DEFAULT_CONFIG = {
  maxBlobSize: 100 * 1024 * 1024, // 100MB
  fetchTimeoutMs: 60000, // 60 seconds
  maxRetries: 3,
  verifyCid: true,
  rateLimitBytesPerMinute: 50 * 1024 * 1024, // 50MB/min
  storageQuotaPerDid: 1024 * 1024 * 1024, // 1GB
};

// Cache keys
const CACHE_KEYS = {
  rateLimitBytes: (did: string) => `blobsync:rate:${did}`,
  storageUsage: (did: string) => `blobsync:usage:${did}`,
  blobUrl: (did: string, cid: string) => `blobsync:url:${did}:${cid}`,
};

/**
 * Blob Synchronization Service
 *
 * Handles fetching blobs from remote PDS servers and storing them locally
 * for federation purposes.
 */
export class BlobSync {
  private db: PostgresJsDatabase<typeof schema>;
  private maxBlobSize: number;
  private fetchTimeoutMs: number;
  private maxRetries: number;
  private verifyCid: boolean;
  private rateLimitBytesPerMinute: number;
  private storageQuotaPerDid: number;
  private cdnBaseUrl: string | null;

  constructor(config: BlobSyncConfig) {
    this.db = config.db;
    this.maxBlobSize = config.maxBlobSize ?? DEFAULT_CONFIG.maxBlobSize;
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? DEFAULT_CONFIG.fetchTimeoutMs;
    this.maxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
    this.verifyCid = config.verifyCid ?? DEFAULT_CONFIG.verifyCid;
    this.rateLimitBytesPerMinute = config.rateLimitBytesPerMinute ?? DEFAULT_CONFIG.rateLimitBytesPerMinute;
    this.storageQuotaPerDid = config.storageQuotaPerDid ?? DEFAULT_CONFIG.storageQuotaPerDid;
    this.cdnBaseUrl = config.cdnBaseUrl ?? process.env.CDN_BASE_URL ?? null;
  }

  /**
   * Resolve DID to PDS endpoint
   * Supports did:plc, did:web, and did:exprsn methods with caching
   */
  async resolvePDS(did: string): Promise<string | null> {
    // Check if we have cached PDS info (not stale)
    const cacheMaxAge = parseInt(process.env.DID_CACHE_TTL || '3600', 10) * 1000;
    const identity = await this.db.query.plcIdentities?.findFirst({
      where: eq(schema.plcIdentities.did, did),
    });

    if (identity?.pdsEndpoint) {
      // Check if cache is still valid
      const updatedAt = identity.updatedAt ? new Date(identity.updatedAt).getTime() : 0;
      if (Date.now() - updatedAt < cacheMaxAge) {
        return identity.pdsEndpoint;
      }
    }

    // Resolve based on DID method
    let pdsEndpoint: string | null = null;
    let didDocument: Record<string, unknown> | null = null;

    if (did.startsWith('did:plc:')) {
      const result = await this.resolvePlcDid(did);
      pdsEndpoint = result.pdsEndpoint;
      didDocument = result.document;
    } else if (did.startsWith('did:web:')) {
      const result = await this.resolveWebDid(did);
      pdsEndpoint = result.pdsEndpoint;
      didDocument = result.document;
    } else if (did.startsWith('did:exprsn:')) {
      const result = await this.resolveExprsnDid(did);
      pdsEndpoint = result.pdsEndpoint;
      didDocument = result.document;
    }

    // Cache the resolved endpoint if successful
    if (pdsEndpoint && didDocument) {
      await this.cacheDidResolution(did, pdsEndpoint, didDocument);
    }

    return pdsEndpoint;
  }

  /**
   * Resolve did:plc via PLC directory
   */
  private async resolvePlcDid(did: string): Promise<{
    pdsEndpoint: string | null;
    document: Record<string, unknown> | null;
  }> {
    const plcUrl = process.env.PLC_URL || 'https://plc.directory';

    try {
      const response = await fetch(`${plcUrl}/${did}`, {
        signal: createTimeoutSignal(5000),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.warn(`PLC resolution failed for ${did}: HTTP ${response.status}`);
        return { pdsEndpoint: null, document: null };
      }

      const data = (await response.json()) as {
        service?: Array<{ id: string; type?: string; serviceEndpoint: string }>;
        alsoKnownAs?: string[];
        verificationMethod?: unknown[];
      };

      // Find PDS service endpoint
      const pdsService = data.service?.find(
        (s) =>
          s.id === '#atproto_pds' ||
          s.id === 'atproto_pds' ||
          s.type === 'AtprotoPersonalDataServer'
      );

      return {
        pdsEndpoint: pdsService?.serviceEndpoint || null,
        document: data as Record<string, unknown>,
      };
    } catch (error) {
      console.warn(`PLC resolution error for ${did}:`, error);
      return { pdsEndpoint: null, document: null };
    }
  }

  /**
   * Resolve did:web via .well-known/did.json
   */
  private async resolveWebDid(did: string): Promise<{
    pdsEndpoint: string | null;
    document: Record<string, unknown> | null;
  }> {
    // Extract domain from did:web (handle port encoding)
    const domain = did.replace('did:web:', '').replace(/%3A/g, ':');

    try {
      const response = await fetch(`https://${domain}/.well-known/did.json`, {
        signal: createTimeoutSignal(5000),
        headers: { Accept: 'application/did+json, application/json' },
      });

      if (!response.ok) {
        console.warn(`did:web resolution failed for ${did}: HTTP ${response.status}`);
        return { pdsEndpoint: null, document: null };
      }

      const data = (await response.json()) as {
        service?: Array<{ id: string; type?: string; serviceEndpoint: string }>;
      };

      const pdsService = data.service?.find(
        (s) =>
          s.id === '#atproto_pds' ||
          s.id === 'atproto_pds' ||
          s.type === 'AtprotoPersonalDataServer'
      );

      return {
        pdsEndpoint: pdsService?.serviceEndpoint || null,
        document: data as Record<string, unknown>,
      };
    } catch (error) {
      console.warn(`did:web resolution error for ${did}:`, error);
      return { pdsEndpoint: null, document: null };
    }
  }

  /**
   * Resolve did:exprsn via internal CA/certificate lookup
   */
  private async resolveExprsnDid(did: string): Promise<{
    pdsEndpoint: string | null;
    document: Record<string, unknown> | null;
  }> {
    // did:exprsn DIDs are resolved via our internal certificate authority
    // Format: did:exprsn:<identifier>
    const identifier = did.replace('did:exprsn:', '');

    try {
      // Check local DID certificates table
      const certificate = await this.db.query.exprsnDidCertificates?.findFirst({
        where: and(
          eq(schema.exprsnDidCertificates.did, did),
          eq(schema.exprsnDidCertificates.status, 'active')
        ),
      });

      // Note: exprsnDidCertificates doesn't have pdsEndpoint column
      // We need to derive it from the plcIdentities or caEntityCertificates table
      if (certificate) {
        // Try to get PDS endpoint from plcIdentities
        const identity = await this.db.query.plcIdentities?.findFirst({
          where: eq(schema.plcIdentities.did, did),
        });

        const pdsEndpoint = identity?.pdsEndpoint || null;

        if (pdsEndpoint) {
          // Build DID document from certificate data
          const document = {
            '@context': ['https://www.w3.org/ns/did/v1'],
            id: did,
            service: [
              {
                id: '#atproto_pds',
                type: 'AtprotoPersonalDataServer',
                serviceEndpoint: pdsEndpoint,
              },
            ],
          };

          return {
            pdsEndpoint,
            document: document as Record<string, unknown>,
          };
        }
      }

      // Fallback: Try internal PLC directory
      const serviceUrl = process.env.APP_URL || 'http://localhost:3000';
      const response = await fetch(`${serviceUrl}/plc/${did}`, {
        signal: createTimeoutSignal(3000),
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          service?: Array<{ id: string; type?: string; serviceEndpoint: string }>;
        };

        const pdsService = data.service?.find(
          (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
        );

        return {
          pdsEndpoint: pdsService?.serviceEndpoint || null,
          document: data as Record<string, unknown>,
        };
      }

      return { pdsEndpoint: null, document: null };
    } catch (error) {
      console.warn(`did:exprsn resolution error for ${did}:`, error);
      return { pdsEndpoint: null, document: null };
    }
  }

  /**
   * Cache DID resolution result
   */
  private async cacheDidResolution(
    did: string,
    pdsEndpoint: string,
    document: Record<string, unknown>
  ): Promise<void> {
    try {
      // Extract handle from alsoKnownAs if available
      const alsoKnownAs = document.alsoKnownAs as string[] | undefined;
      const handle = alsoKnownAs?.find((aka) => aka.startsWith('at://'))?.replace('at://', '');

      // Extract additional fields from document for storage
      const verificationMethod = document.verificationMethod as Array<{
        id: string;
        type: string;
        publicKeyMultibase?: string;
      }> | undefined;
      const signingKey = verificationMethod?.find(vm => vm.type === 'Multikey')?.publicKeyMultibase;

      const services = document.service as Array<{ id: string; type: string; serviceEndpoint: string }> | undefined;
      const servicesRecord = services?.reduce((acc, svc) => {
        const key = svc.id.replace('#', '');
        acc[key] = { type: svc.type, endpoint: svc.serviceEndpoint };
        return acc;
      }, {} as Record<string, { type: string; endpoint: string }>) || {};

      // Upsert into plcIdentities
      await this.db
        .insert(schema.plcIdentities)
        .values({
          did,
          handle: handle || null,
          pdsEndpoint,
          signingKey: signingKey || null,
          rotationKeys: [],
          alsoKnownAs: alsoKnownAs || [],
          services: servicesRecord,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.plcIdentities.did,
          set: {
            pdsEndpoint,
            signingKey: signingKey || null,
            alsoKnownAs: alsoKnownAs || [],
            services: servicesRecord,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      // Non-fatal: caching failure shouldn't break resolution
      console.warn(`Failed to cache DID resolution for ${did}:`, error);
    }
  }

  // ============================================
  // CID Verification
  // ============================================

  /**
   * Verify that blob data matches the expected CID
   * ATProto uses raw codec with SHA-256 hash
   */
  async verifyCidMatch(data: Uint8Array, expectedCid: string): Promise<boolean> {
    try {
      // Parse the expected CID
      const expectedCidObj = CID.parse(expectedCid);

      // Compute the hash of the data
      const hash = await sha256.digest(data);

      // Create CID from computed hash using same codec version
      const computedCid = CID.create(
        expectedCidObj.version,
        expectedCidObj.code, // Use same codec as expected
        hash
      );

      // Compare CIDs
      const matches = computedCid.equals(expectedCidObj);

      if (!matches) {
        console.warn(
          `CID mismatch: expected ${expectedCid}, computed ${computedCid.toString()}`
        );
      }

      return matches;
    } catch (error) {
      console.error('CID verification failed:', error);
      return false;
    }
  }

  // ============================================
  // Rate Limiting & Quotas
  // ============================================

  /**
   * Check if rate limit allows fetching more bytes
   */
  private async checkRateLimit(did: string, bytes: number): Promise<boolean> {
    try {
      const key = CACHE_KEYS.rateLimitBytes(did);
      const current = await redis.get(key);
      const currentBytes = current ? parseInt(current, 10) : 0;

      return currentBytes + bytes <= this.rateLimitBytesPerMinute;
    } catch {
      // If Redis fails, allow the request
      return true;
    }
  }

  /**
   * Record bytes fetched for rate limiting
   */
  private async recordBytesTransferred(did: string, bytes: number): Promise<void> {
    try {
      const key = CACHE_KEYS.rateLimitBytes(did);
      const current = await redis.get(key);
      const newValue = (current ? parseInt(current, 10) : 0) + bytes;

      // Set with 60 second expiry (rate limit window)
      await redis.setex(key, 60, newValue.toString());
    } catch {
      // Non-critical
    }
  }

  /**
   * Check storage quota for a DID
   */
  async checkStorageQuota(did: string, additionalBytes: number): Promise<{
    allowed: boolean;
    currentUsage: number;
    quota: number;
    remaining: number;
  }> {
    // Get custom quota or use default
    const quota = await this.getStorageQuotaForDid(did);

    // Get current usage from cache or calculate
    let currentUsage = 0;

    try {
      const cached = await redis.get(CACHE_KEYS.storageUsage(did));
      if (cached) {
        currentUsage = parseInt(cached, 10);
      } else {
        // Calculate from database
        const result = await this.db
          .select({ total: sql<number>`COALESCE(SUM(size), 0)::int` })
          .from(schema.blobs)
          .where(eq(schema.blobs.did, did));

        currentUsage = result[0]?.total || 0;

        // Cache for 5 minutes
        await redis.setex(CACHE_KEYS.storageUsage(did), 300, currentUsage.toString());
      }
    } catch {
      // On error, calculate from database
      const result = await this.db
        .select({ total: sql<number>`COALESCE(SUM(size), 0)::int` })
        .from(schema.blobs)
        .where(eq(schema.blobs.did, did));

      currentUsage = result[0]?.total || 0;
    }

    const remaining = quota - currentUsage;
    const allowed = remaining >= additionalBytes;

    return {
      allowed,
      currentUsage,
      quota,
      remaining: Math.max(0, remaining),
    };
  }

  /**
   * Get custom storage quota for a DID (or default)
   */
  private async getStorageQuotaForDid(did: string): Promise<number> {
    try {
      const key = `blobsync:quota:${did}`;
      const custom = await redis.get(key);
      if (custom) {
        return parseInt(custom, 10);
      }
    } catch {
      // Use default
    }
    return this.storageQuotaPerDid;
  }

  /**
   * Invalidate storage usage cache after storing/deleting
   */
  private async invalidateUsageCache(did: string): Promise<void> {
    try {
      await redis.del(CACHE_KEYS.storageUsage(did));
    } catch {
      // Non-critical
    }
  }

  // ============================================
  // Blob Fetching
  // ============================================

  /**
   * Fetch a blob from a remote PDS
   */
  async fetchBlob(
    did: string,
    cid: string
  ): Promise<{ data: Uint8Array; mimeType: string } | null> {
    // Resolve PDS endpoint
    const pdsEndpoint = await this.resolvePDS(did);

    if (!pdsEndpoint) {
      console.warn(`Could not resolve PDS for DID: ${did}`);
      return null;
    }

    // Fetch blob from PDS
    const url = `${pdsEndpoint}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          signal: createTimeoutSignal(this.fetchTimeoutMs),
          headers: {
            Accept: '*/*',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check content length
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > this.maxBlobSize) {
          throw new Error(`Blob too large: ${contentLength} bytes`);
        }

        const mimeType = response.headers.get('content-type') || 'application/octet-stream';
        const data = new Uint8Array(await response.arrayBuffer());

        // Verify size
        if (data.length > this.maxBlobSize) {
          throw new Error(`Blob too large: ${data.length} bytes`);
        }

        // Verify CID matches content
        if (this.verifyCid) {
          const cidValid = await this.verifyCidMatch(data, cid);
          if (!cidValid) {
            throw new Error(`CID verification failed: content does not match ${cid}`);
          }
        }

        // Record bytes transferred for rate limiting
        await this.recordBytesTransferred(did, data.length);

        return { data, mimeType };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `Blob fetch attempt ${attempt + 1}/${this.maxRetries} failed:`,
          lastError.message
        );

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    console.error(`Failed to fetch blob after ${this.maxRetries} attempts:`, lastError);
    return null;
  }

  /**
   * Store a blob locally
   */
  async storeBlob(
    did: string,
    cid: string,
    data: Uint8Array,
    mimeType: string
  ): Promise<BlobMetadata | null> {
    try {
      const storage = await getStorageProvider();
      const storagePath = `blobs/${did}/${cid}`;

      // Upload to storage
      await storage.uploadFile(storagePath, Buffer.from(data), mimeType);

      // Record in database
      await this.db
        .insert(schema.blobs)
        .values({
          cid,
          did,
          mimeType,
          size: data.length,
          storagePath,
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      return {
        cid,
        did,
        mimeType,
        size: data.length,
        storagePath,
      };
    } catch (error) {
      console.error('Failed to store blob:', error);
      return null;
    }
  }

  /**
   * Fetch and store a blob from a remote server
   */
  async syncBlob(did: string, cid: string, options?: {
    skipQuotaCheck?: boolean;
    estimatedSize?: number;
  }): Promise<FetchBlobResult> {
    // Check if blob already exists
    const existing = await this.db.query.blobs.findFirst({
      where: and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)),
    });

    if (existing) {
      return { success: true, cid };
    }

    // Check rate limit (use estimated size or max blob size)
    const estimatedBytes = options?.estimatedSize || this.maxBlobSize;
    const rateLimitOk = await this.checkRateLimit(did, estimatedBytes);
    if (!rateLimitOk) {
      return { success: false, error: 'Rate limit exceeded. Please try again later.' };
    }

    // Check storage quota
    if (!options?.skipQuotaCheck) {
      const quotaCheck = await this.checkStorageQuota(did, estimatedBytes);
      if (!quotaCheck.allowed) {
        return {
          success: false,
          error: `Storage quota exceeded. Used: ${Math.round(quotaCheck.currentUsage / 1024 / 1024)}MB / ${Math.round(quotaCheck.quota / 1024 / 1024)}MB`,
        };
      }
    }

    // Fetch from remote
    const result = await this.fetchBlob(did, cid);

    if (!result) {
      return { success: false, error: 'Failed to fetch blob' };
    }

    // Store locally
    const stored = await this.storeBlob(did, cid, result.data, result.mimeType);

    if (!stored) {
      return { success: false, error: 'Failed to store blob' };
    }

    return { success: true, cid };
  }

  /**
   * Sync multiple blobs for a commit
   */
  async syncCommitBlobs(did: string, blobCids: string[]): Promise<{
    synced: string[];
    failed: string[];
  }> {
    const synced: string[] = [];
    const failed: string[] = [];

    for (const cid of blobCids) {
      const result = await this.syncBlob(did, cid);
      if (result.success) {
        synced.push(cid);
      } else {
        failed.push(cid);
      }
    }

    return { synced, failed };
  }

  /**
   * Check if a blob exists locally
   */
  async hasBlob(did: string, cid: string): Promise<boolean> {
    const blob = await this.db.query.blobs.findFirst({
      where: and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)),
    });

    return !!blob;
  }

  /**
   * Get blob metadata
   */
  async getBlobMetadata(did: string, cid: string): Promise<BlobMetadata | null> {
    const blob = await this.db.query.blobs.findFirst({
      where: and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)),
    });

    if (!blob) return null;

    return {
      cid: blob.cid,
      did: blob.did,
      mimeType: blob.mimeType,
      size: blob.size,
      storagePath: blob.storagePath,
    };
  }

  /**
   * Delete a blob
   */
  async deleteBlob(did: string, cid: string): Promise<boolean> {
    try {
      const blob = await this.db.query.blobs.findFirst({
        where: and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)),
      });

      if (!blob) return false;

      // Delete from storage
      try {
        const storage = await getStorageProvider();
        await storage.deleteFile(blob.storagePath);
      } catch {
        // Storage deletion may fail if blob is already gone
      }

      // Delete from database
      await this.db
        .delete(schema.blobs)
        .where(and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)));

      // Invalidate caches
      await this.invalidateUsageCache(did);
      try {
        await redis.del(CACHE_KEYS.blobUrl(did, cid));
      } catch {
        // Non-critical
      }

      return true;
    } catch (error) {
      console.error('Failed to delete blob:', error);
      return false;
    }
  }

  // ============================================
  // CDN Integration
  // ============================================

  /**
   * Get CDN URL for a blob
   * Returns cached URL or generates a new one
   */
  async getBlobUrl(did: string, cid: string): Promise<string | null> {
    // Check if blob exists
    const blob = await this.db.query.blobs.findFirst({
      where: and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)),
    });

    if (!blob) {
      return null;
    }

    // Check cache first
    try {
      const cached = await redis.get(CACHE_KEYS.blobUrl(did, cid));
      if (cached) {
        return cached;
      }
    } catch {
      // Cache miss
    }

    // Generate URL
    let url: string;

    if (this.cdnBaseUrl) {
      // Use CDN URL
      url = `${this.cdnBaseUrl}/blobs/${did}/${cid}`;
    } else {
      // Use storage provider presigned URL
      const storage = await getStorageProvider();
      url = await storage.getPresignedDownloadUrl(blob.storagePath, 3600); // 1 hour expiry
    }

    // Cache for 55 minutes (slightly less than signed URL expiry)
    try {
      await redis.setex(CACHE_KEYS.blobUrl(did, cid), 3300, url);
    } catch {
      // Non-critical
    }

    return url;
  }

  /**
   * Get blob with URL for serving
   */
  async getBlobForServing(did: string, cid: string): Promise<{
    metadata: BlobMetadata;
    url: string;
  } | null> {
    const metadata = await this.getBlobMetadata(did, cid);
    if (!metadata) return null;

    const url = await this.getBlobUrl(did, cid);
    if (!url) return null;

    return { metadata, url };
  }

  // ============================================
  // Garbage Collection
  // ============================================

  /**
   * Find orphaned blobs (not referenced by any record)
   * This requires integration with the record system
   */
  async findOrphanedBlobs(did: string, referencedCids: string[]): Promise<string[]> {
    const allBlobs = await this.db
      .select({ cid: schema.blobs.cid })
      .from(schema.blobs)
      .where(eq(schema.blobs.did, did));

    const orphaned = allBlobs
      .map(b => b.cid)
      .filter(cid => !referencedCids.includes(cid));

    return orphaned;
  }

  /**
   * Delete orphaned blobs for a DID
   */
  async cleanupOrphanedBlobs(did: string, referencedCids: string[], dryRun?: boolean): Promise<{
    deleted: number;
    freedBytes: number;
    orphanedCids?: string[];
  }> {
    const orphaned = await this.findOrphanedBlobs(did, referencedCids);

    let deleted = 0;
    let freedBytes = 0;

    for (const cid of orphaned) {
      const metadata = await this.getBlobMetadata(did, cid);
      if (metadata) {
        freedBytes += metadata.size;
      }

      if (!dryRun) {
        const success = await this.deleteBlob(did, cid);
        if (success) {
          deleted++;
        }
      } else {
        deleted++;
      }
    }

    return {
      deleted,
      freedBytes,
      ...(dryRun ? { orphanedCids: orphaned } : {}),
    };
  }

  /**
   * Delete blobs older than a certain age
   * Useful for cleaning up stale federation data
   */
  async cleanupOldBlobs(maxAgeMs: number, dryRun?: boolean): Promise<{
    deleted: number;
    freedBytes: number;
    oldBlobCids?: string[];
  }> {
    const cutoff = new Date(Date.now() - maxAgeMs);

    const oldBlobs = await this.db
      .select()
      .from(schema.blobs)
      .where(lt(schema.blobs.createdAt, cutoff))
      .limit(1000); // Process in batches

    let deleted = 0;
    let freedBytes = 0;
    const cids: string[] = [];

    for (const blob of oldBlobs) {
      freedBytes += blob.size;
      cids.push(blob.cid);

      if (!dryRun) {
        const success = await this.deleteBlob(blob.did, blob.cid);
        if (success) {
          deleted++;
        }
      } else {
        deleted++;
      }
    }

    return {
      deleted,
      freedBytes,
      ...(dryRun ? { oldBlobCids: cids } : {}),
    };
  }

  /**
   * List blobs for a DID with pagination
   */
  async listBlobsForDid(did: string, options?: {
    limit?: number;
    cursor?: string;
  }): Promise<{
    blobs: BlobMetadata[];
    cursor?: string;
  }> {
    const limit = options?.limit || 50;

    let query = this.db
      .select()
      .from(schema.blobs)
      .where(eq(schema.blobs.did, did))
      .orderBy(desc(schema.blobs.createdAt))
      .limit(limit + 1);

    if (options?.cursor) {
      // Cursor is the createdAt timestamp
      const cursorDate = new Date(options.cursor);
      query = this.db
        .select()
        .from(schema.blobs)
        .where(and(
          eq(schema.blobs.did, did),
          lt(schema.blobs.createdAt, cursorDate)
        ))
        .orderBy(desc(schema.blobs.createdAt))
        .limit(limit + 1);
    }

    const results = await query;
    const hasMore = results.length > limit;
    const blobs = results.slice(0, limit);

    const lastBlob = blobs[blobs.length - 1];

    return {
      blobs: blobs.map(b => ({
        cid: b.cid,
        did: b.did,
        mimeType: b.mimeType,
        size: b.size,
        storagePath: b.storagePath,
      })),
      cursor: hasMore && lastBlob?.createdAt
        ? lastBlob.createdAt.toISOString()
        : undefined,
    };
  }

  /**
   * Set custom storage quota for a DID
   */
  async setStorageQuota(did: string, quotaBytes: number): Promise<void> {
    // Store custom quota in Redis
    const key = `blobsync:quota:${did}`;
    await redis.set(key, quotaBytes.toString());
  }

  /**
   * Verify a stored blob's CID matches its content
   */
  async verifyStoredBlob(did: string, cid: string): Promise<{
    exists: boolean;
    verified: boolean;
    error?: string;
    metadata?: BlobMetadata;
  }> {
    const blob = await this.db.query.blobs.findFirst({
      where: and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)),
    });

    if (!blob) {
      return { exists: false, verified: false, error: 'Blob not found' };
    }

    try {
      // Fetch blob data from storage
      const storage = await getStorageProvider();
      const data = await storage.downloadFile(blob.storagePath);

      if (!data) {
        return {
          exists: true,
          verified: false,
          error: 'Could not retrieve blob data from storage',
        };
      }

      // Verify CID
      const matches = await this.verifyCidMatch(new Uint8Array(data), cid);

      return {
        exists: true,
        verified: matches,
        error: matches ? undefined : 'CID mismatch - blob data does not match CID',
        metadata: {
          cid: blob.cid,
          did: blob.did,
          mimeType: blob.mimeType,
          size: blob.size,
          storagePath: blob.storagePath,
        },
      };
    } catch (error) {
      return {
        exists: true,
        verified: false,
        error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get rate limit status for a DID
   */
  async getRateLimitStatus(did: string): Promise<{
    currentBytes: number;
    limitBytes: number;
    remainingBytes: number;
    percentUsed: number;
    windowSeconds: number;
  }> {
    let currentBytes = 0;

    try {
      const key = CACHE_KEYS.rateLimitBytes(did);
      const current = await redis.get(key);
      currentBytes = current ? parseInt(current, 10) : 0;
    } catch {
      // Default to 0
    }

    const remaining = Math.max(0, this.rateLimitBytesPerMinute - currentBytes);
    const percentUsed = this.rateLimitBytesPerMinute > 0
      ? Math.round((currentBytes / this.rateLimitBytesPerMinute) * 100)
      : 0;

    return {
      currentBytes,
      limitBytes: this.rateLimitBytesPerMinute,
      remainingBytes: remaining,
      percentUsed,
      windowSeconds: 60,
    };
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get blob sync statistics
   */
  async getStats(): Promise<{
    totalBlobs: number;
    totalSize: number;
    byMimeType: Record<string, { count: number; size: number }>;
    topDids: Array<{ did: string; count: number; size: number }>;
  }> {
    // Total counts
    const [totals] = await this.db
      .select({
        count: sql<number>`COUNT(*)::int`,
        size: sql<number>`COALESCE(SUM(size), 0)::bigint`,
      })
      .from(schema.blobs);

    // By MIME type
    const mimeStats = await this.db
      .select({
        mimeType: schema.blobs.mimeType,
        count: sql<number>`COUNT(*)::int`,
        size: sql<number>`COALESCE(SUM(size), 0)::bigint`,
      })
      .from(schema.blobs)
      .groupBy(schema.blobs.mimeType);

    const byMimeType: Record<string, { count: number; size: number }> = {};
    for (const stat of mimeStats) {
      byMimeType[stat.mimeType] = {
        count: stat.count,
        size: Number(stat.size),
      };
    }

    // Top DIDs by storage
    const topDids = await this.db
      .select({
        did: schema.blobs.did,
        count: sql<number>`COUNT(*)::int`,
        size: sql<number>`COALESCE(SUM(size), 0)::bigint`,
      })
      .from(schema.blobs)
      .groupBy(schema.blobs.did)
      .orderBy(desc(sql`SUM(size)`))
      .limit(10);

    return {
      totalBlobs: totals?.count || 0,
      totalSize: Number(totals?.size || 0),
      byMimeType,
      topDids: topDids.map(d => ({
        did: d.did,
        count: d.count,
        size: Number(d.size),
      })),
    };
  }
}

/**
 * Create BlobSync instance
 */
export function createBlobSync(db: PostgresJsDatabase<typeof schema>): BlobSync {
  return new BlobSync({ db });
}
