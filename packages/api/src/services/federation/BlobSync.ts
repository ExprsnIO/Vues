/**
 * Blob Synchronization Service
 * Handles fetching and storing blobs from remote servers for federation
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { getStorageProvider } from '../storage/index.js';
import { nanoid } from 'nanoid';

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
}

const DEFAULT_CONFIG = {
  maxBlobSize: 100 * 1024 * 1024, // 100MB
  fetchTimeoutMs: 60000, // 60 seconds
  maxRetries: 3,
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

  constructor(config: BlobSyncConfig) {
    this.db = config.db;
    this.maxBlobSize = config.maxBlobSize ?? DEFAULT_CONFIG.maxBlobSize;
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? DEFAULT_CONFIG.fetchTimeoutMs;
    this.maxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
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
        signal: AbortSignal.timeout(5000),
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
        signal: AbortSignal.timeout(5000),
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
      const certificate = await this.db.query.didCertificates?.findFirst({
        where: and(
          eq(schema.didCertificates.did, did),
          eq(schema.didCertificates.status, 'active')
        ),
      });

      if (certificate?.pdsEndpoint) {
        // Build DID document from certificate data
        const document = {
          '@context': ['https://www.w3.org/ns/did/v1'],
          id: did,
          service: [
            {
              id: '#atproto_pds',
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: certificate.pdsEndpoint,
            },
          ],
        };

        return {
          pdsEndpoint: certificate.pdsEndpoint,
          document: document as Record<string, unknown>,
        };
      }

      // Fallback: Try internal PLC directory
      const serviceUrl = process.env.APP_URL || 'http://localhost:3000';
      const response = await fetch(`${serviceUrl}/plc/${did}`, {
        signal: AbortSignal.timeout(3000),
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

      // Upsert into plcIdentities
      await this.db
        .insert(schema.plcIdentities)
        .values({
          did,
          handle: handle || null,
          pdsEndpoint,
          didDocument: document,
          status: 'active',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.plcIdentities.did,
          set: {
            pdsEndpoint,
            didDocument: document,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      // Non-fatal: caching failure shouldn't break resolution
      console.warn(`Failed to cache DID resolution for ${did}:`, error);
    }
  }

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
          signal: AbortSignal.timeout(this.fetchTimeoutMs),
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
  async syncBlob(did: string, cid: string): Promise<FetchBlobResult> {
    // Check if blob already exists
    const existing = await this.db.query.blobs.findFirst({
      where: and(eq(schema.blobs.did, did), eq(schema.blobs.cid, cid)),
    });

    if (existing) {
      return { success: true, cid };
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

      return true;
    } catch (error) {
      console.error('Failed to delete blob:', error);
      return false;
    }
  }
}

/**
 * Create BlobSync instance
 */
export function createBlobSync(db: PostgresJsDatabase<typeof schema>): BlobSync {
  return new BlobSync({ db });
}
