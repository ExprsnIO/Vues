import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { Readable } from 'stream';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

/**
 * Blob metadata
 */
export interface BlobMetadata {
  cid: CID;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/**
 * Storage backend interface
 */
export interface StorageBackend {
  put(key: string, data: Buffer | Readable): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  stream(key: string): Promise<Readable | null>;
}

/**
 * Local filesystem storage backend
 */
export class LocalStorageBackend implements StorageBackend {
  constructor(private basePath: string) {}

  private getFullPath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitized = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.basePath, sanitized);
  }

  async put(key: string, data: Buffer | Readable): Promise<void> {
    const fullPath = this.getFullPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fs.writeFile(fullPath, data);
    } else {
      // Handle stream
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.from(chunk));
      }
      await fs.writeFile(fullPath, Buffer.concat(chunks));
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const fullPath = this.getFullPath(key);
    try {
      return await fs.readFile(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async stream(key: string): Promise<Readable | null> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.access(fullPath);
      return fsSync.createReadStream(fullPath);
    } catch {
      return null;
    }
  }
}

/**
 * S3-compatible storage backend
 */
export class S3StorageBackend implements StorageBackend {
  constructor(
    private s3Client: {
      send(command: unknown): Promise<unknown>;
    },
    private bucket: string,
    private prefix: string = ''
  ) {}

  private getKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async put(key: string, data: Buffer | Readable): Promise<void> {
    // S3 PutObject implementation
    // This is a placeholder - actual implementation would use @aws-sdk/client-s3
    const fullKey = this.getKey(key);
    console.log(`S3: PUT ${this.bucket}/${fullKey}`);

    // In real implementation:
    // await this.s3Client.send(new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: fullKey,
    //   Body: data,
    // }));
  }

  async get(key: string): Promise<Buffer | null> {
    const fullKey = this.getKey(key);
    console.log(`S3: GET ${this.bucket}/${fullKey}`);

    // In real implementation:
    // const response = await this.s3Client.send(new GetObjectCommand({...}));
    // return Buffer.from(await response.Body.transformToByteArray());

    return null;
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    console.log(`S3: DELETE ${this.bucket}/${fullKey}`);
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    console.log(`S3: HEAD ${this.bucket}/${fullKey}`);
    return false;
  }

  async stream(key: string): Promise<Readable | null> {
    const data = await this.get(key);
    if (!data) return null;
    return Readable.from(data);
  }
}

/**
 * Blob store configuration
 */
export interface BlobStoreConfig {
  type: 'local' | 's3';
  localPath?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  s3Client?: {
    send(command: unknown): Promise<unknown>;
  };
}

/**
 * Blob store for managing binary content
 */
export class BlobStore {
  private backend: StorageBackend;

  constructor(config: BlobStoreConfig) {
    if (config.type === 'local') {
      this.backend = new LocalStorageBackend(config.localPath || './data/blobs');
    } else if (config.type === 's3' && config.s3Client && config.s3Bucket) {
      this.backend = new S3StorageBackend(
        config.s3Client,
        config.s3Bucket,
        config.s3Prefix
      );
    } else {
      throw new Error('Invalid blob store configuration');
    }
  }

  /**
   * Get storage path for a blob
   */
  private getBlobPath(did: string, cid: CID): string {
    const cidStr = cid.toString();
    // Use first 2 chars of CID as subdirectory for better filesystem performance
    const prefix = cidStr.slice(0, 2);
    return `${did}/${prefix}/${cidStr}`;
  }

  /**
   * Store a blob and return its CID
   */
  async putBlob(did: string, data: Buffer, mimeType: string): Promise<BlobMetadata> {
    // Calculate CID
    const hash = await sha256.digest(data);
    const cid = CID.create(1, 0x55, hash); // 0x55 = raw codec

    // Store blob
    const blobPath = this.getBlobPath(did, cid);
    await this.backend.put(blobPath, data);

    return {
      cid,
      mimeType,
      size: data.length,
      createdAt: new Date(),
    };
  }

  /**
   * Get a blob by CID
   */
  async getBlob(did: string, cid: CID): Promise<Buffer | null> {
    const blobPath = this.getBlobPath(did, cid);
    return this.backend.get(blobPath);
  }

  /**
   * Stream a blob by CID
   */
  async streamBlob(did: string, cid: CID): Promise<Readable | null> {
    const blobPath = this.getBlobPath(did, cid);
    return this.backend.stream(blobPath);
  }

  /**
   * Check if blob exists
   */
  async hasBlob(did: string, cid: CID): Promise<boolean> {
    const blobPath = this.getBlobPath(did, cid);
    return this.backend.exists(blobPath);
  }

  /**
   * Delete a blob
   */
  async deleteBlob(did: string, cid: CID): Promise<void> {
    const blobPath = this.getBlobPath(did, cid);
    await this.backend.delete(blobPath);
  }

  /**
   * List blobs for a DID with pagination
   */
  async listBlobs(
    did: string,
    options: { limit: number; cursor?: string; since?: string }
  ): Promise<{ cids: string[]; cursor?: string }> {
    // This is a basic implementation - in production, would use database index
    const cids: string[] = [];

    // Check if using local storage backend by checking if backend exists
    // For local backend, we can list directory contents
    try {
      // Try to list blobs from the default path structure
      const basePath = './data/blobs';
      const didPath = `${basePath}/${did}`;

      const subdirs = await fs.readdir(didPath).catch(() => []);
      const allCids: string[] = [];

      for (const subdir of subdirs) {
        const files = await fs.readdir(`${didPath}/${subdir}`).catch(() => []);
        allCids.push(...files);
      }

      // Sort CIDs for consistent ordering
      allCids.sort();

      // Apply cursor
      let startIndex = 0;
      if (options.cursor) {
        const cursorIndex = allCids.indexOf(options.cursor);
        if (cursorIndex >= 0) {
          startIndex = cursorIndex + 1;
        }
      }

      // Apply limit
      const sliced = allCids.slice(startIndex, startIndex + options.limit);
      cids.push(...sliced);

      // Calculate next cursor
      const nextCursor = sliced.length === options.limit && startIndex + options.limit < allCids.length
        ? sliced[sliced.length - 1]
        : undefined;

      return { cids, cursor: nextCursor };
    } catch {
      return { cids: [] };
    }
  }

  /**
   * Get MIME type for a blob (would typically be stored in metadata)
   */
  async getBlobMimeType(did: string, cid: CID): Promise<string | null> {
    // In a full implementation, this would look up metadata
    // For now, return null to indicate unknown
    return null;
  }
}

/**
 * Create a blob store from config
 */
export function createBlobStore(config: BlobStoreConfig): BlobStore {
  return new BlobStore(config);
}

/**
 * Create a local filesystem blob store
 */
export function createLocalBlobStore(basePath: string): BlobStore {
  return new BlobStore({
    type: 'local',
    localPath: basePath,
  });
}

/**
 * S3 configuration for blob store
 */
export interface S3BlobStoreConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
}

/**
 * Create an S3-backed blob store
 * Note: For S3, we use the AWS SDK S3Client which should be passed to the config
 */
export function createS3BlobStore(config: S3BlobStoreConfig): BlobStore {
  // Create a minimal S3 client wrapper
  // In production, use @aws-sdk/client-s3
  const s3Client = {
    async send(command: unknown): Promise<unknown> {
      // This is a placeholder - in real usage, pass a real S3Client
      throw new Error('S3 client not configured. Please use createBlobStore with a real S3Client.');
    },
  };

  return new BlobStore({
    type: 's3',
    s3Client,
    s3Bucket: config.bucket,
  });
}
