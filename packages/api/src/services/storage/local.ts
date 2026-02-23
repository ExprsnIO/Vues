import { Readable } from 'stream';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { StorageProvider, UploadOptions, StorageConfig } from './index.js';

/**
 * Local filesystem storage provider for development and single-server deployments.
 * Not recommended for production with horizontal scaling.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'Local Filesystem';
  readonly type = 'local' as const;
  private basePath: string;
  private publicUrl: string;

  constructor(config: StorageConfig) {
    this.basePath = config.local?.basePath || process.env.LOCAL_STORAGE_PATH || '/data/storage';
    this.publicUrl = config.cdnUrl || process.env.LOCAL_STORAGE_URL || `http://localhost:3002/storage`;
  }

  async getPresignedUploadUrl(
    key: string,
    _contentType: string,
    _expiresIn?: number
  ): Promise<{ url: string; fields?: Record<string, string> }> {
    // For local storage, we generate a unique upload token
    const token = crypto.randomBytes(32).toString('hex');
    return {
      url: `${this.publicUrl}/upload/${token}`,
      fields: { key },
    };
  }

  async getPresignedDownloadUrl(key: string, _expiresIn?: number): Promise<string> {
    // For local storage, return direct path (would need auth middleware in production)
    return `${this.publicUrl}/${key}`;
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async uploadFile(
    key: string,
    body: Buffer | Readable,
    _contentType: string,
    _options?: UploadOptions
  ): Promise<void> {
    const filePath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(body)) {
      await fs.writeFile(filePath, body);
    } else {
      // Handle Readable stream
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await fs.writeFile(filePath, Buffer.concat(chunks));
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key);
    return fs.readFile(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const filePath = path.join(this.basePath, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(prefix: string, maxKeys = 1000): Promise<string[]> {
    const dirPath = path.join(this.basePath, prefix);
    const results: string[] = [];

    const walkDir = async (dir: string, basePrefix: string): Promise<void> => {
      if (results.length >= maxKeys) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxKeys) break;

          const fullPath = path.join(dir, entry.name);
          const key = path.join(basePrefix, entry.name);

          if (entry.isDirectory()) {
            await walkDir(fullPath, key);
          } else {
            results.push(key);
          }
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
      }
    };

    await walkDir(dirPath, prefix);
    return results;
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = path.join(this.basePath, sourceKey);
    const destPath = path.join(this.basePath, destinationKey);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(sourcePath, destPath);
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      const testFile = path.join(this.basePath, '.connection-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}
