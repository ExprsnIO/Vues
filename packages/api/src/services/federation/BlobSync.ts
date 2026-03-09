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
   * TODO: Implement proper DID resolution via PLC directory
   */
  async resolvePDS(did: string): Promise<string | null> {
    // Check if we have cached PDS info
    const identity = await this.db.query.plcIdentities?.findFirst({
      where: eq(schema.plcIdentities.did, did),
    });

    if (identity?.pdsEndpoint) {
      return identity.pdsEndpoint;
    }

    // Fallback: Try to resolve via did:plc or did:web
    if (did.startsWith('did:plc:')) {
      // Query PLC directory
      const plcUrl = process.env.PLC_URL || 'https://plc.directory';
      try {
        const response = await fetch(`${plcUrl}/${did}`, {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json() as { service?: Array<{ id: string; serviceEndpoint: string }> };
          const pdsService = data.service?.find(
            (s) => s.id === '#atproto_pds' || s.id === 'atproto_pds'
          );
          return pdsService?.serviceEndpoint || null;
        }
      } catch {
        // PLC resolution failed
      }
    } else if (did.startsWith('did:web:')) {
      // Extract domain from did:web
      const domain = did.replace('did:web:', '').replace(/%3A/g, ':');
      try {
        const response = await fetch(`https://${domain}/.well-known/did.json`, {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json() as { service?: Array<{ id: string; serviceEndpoint: string }> };
          const pdsService = data.service?.find(
            (s) => s.id === '#atproto_pds' || s.id === 'atproto_pds'
          );
          return pdsService?.serviceEndpoint || null;
        }
      } catch {
        // did:web resolution failed
      }
    }

    return null;
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
