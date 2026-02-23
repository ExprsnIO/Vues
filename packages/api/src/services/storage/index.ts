import { Readable } from 'stream';

export type StorageProviderType = 'aws' | 'digitalocean' | 'azure' | 'minio' | 'local';

export interface StorageProvider {
  readonly name: string;
  readonly type: StorageProviderType;

  /**
   * Generate a presigned URL for uploading a file
   */
  getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number
  ): Promise<{ url: string; fields?: Record<string, string> }>;

  /**
   * Generate a presigned URL for downloading a file
   */
  getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Get the public URL for a file (assumes public-read ACL or CDN)
   */
  getPublicUrl(key: string): string;

  /**
   * Upload a file directly (for server-side uploads)
   */
  uploadFile(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    options?: UploadOptions
  ): Promise<void>;

  /**
   * Download a file
   */
  downloadFile(key: string): Promise<Buffer>;

  /**
   * Delete a file
   */
  deleteFile(key: string): Promise<void>;

  /**
   * Check if a file exists
   */
  fileExists(key: string): Promise<boolean>;

  /**
   * List files with a given prefix
   */
  listFiles(prefix: string, maxKeys?: number): Promise<string[]>;

  /**
   * Copy a file from one key to another
   */
  copyFile(sourceKey: string, destinationKey: string): Promise<void>;

  /**
   * Test the connection to the storage provider
   */
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

export interface UploadOptions {
  acl?: 'private' | 'public-read';
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
}

export interface StorageConfig {
  provider: StorageProviderType;
  bucket: string;
  region?: string;
  cdnUrl?: string;

  // AWS S3
  aws?: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
    cloudFrontDistributionId?: string;
  };

  // DigitalOcean Spaces
  digitalocean?: {
    key: string;
    secret: string;
    endpoint: string;
  };

  // Azure Blob Storage
  azure?: {
    accountName: string;
    accountKey: string;
    containerName: string;
  };

  // Self-hosted MinIO / S3-compatible
  minio?: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    useSSL: boolean;
  };

  // Local filesystem storage
  local?: {
    basePath: string;
  };
}

// Factory function to create the appropriate storage provider
export async function createStorageProvider(config: StorageConfig): Promise<StorageProvider> {
  switch (config.provider) {
    case 'aws': {
      const { AWSS3Provider } = await import('./aws-s3.js');
      return new AWSS3Provider(config);
    }
    case 'digitalocean': {
      const { DigitalOceanSpacesProvider } = await import('./digitalocean-spaces.js');
      return new DigitalOceanSpacesProvider(config);
    }
    case 'azure': {
      const { AzureBlobProvider } = await import('./azure-blob.js');
      return new AzureBlobProvider(config);
    }
    case 'minio': {
      const { MinIOProvider } = await import('./minio.js');
      return new MinIOProvider(config);
    }
    case 'local': {
      const { LocalStorageProvider } = await import('./local.js');
      return new LocalStorageProvider(config);
    }
    default:
      throw new Error(`Unknown storage provider: ${config.provider}`);
  }
}

// Get storage configuration from environment variables
export function getStorageConfigFromEnv(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || 'minio') as StorageProviderType;

  const baseConfig: StorageConfig = {
    provider,
    bucket: process.env.STORAGE_BUCKET || 'exprsn-uploads',
    region: process.env.STORAGE_REGION,
    cdnUrl: process.env.CDN_BASE_URL,
  };

  switch (provider) {
    case 'aws':
      return {
        ...baseConfig,
        bucket: process.env.AWS_S3_BUCKET || baseConfig.bucket,
        region: process.env.AWS_REGION || 'us-east-1',
        cdnUrl: process.env.AWS_CLOUDFRONT_URL || baseConfig.cdnUrl,
        aws: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          endpoint: process.env.AWS_S3_ENDPOINT,
          cloudFrontDistributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID,
        },
      };

    case 'digitalocean':
      return {
        ...baseConfig,
        bucket: process.env.DO_SPACES_BUCKET || baseConfig.bucket,
        region: process.env.DO_SPACES_REGION || 'nyc3',
        cdnUrl: process.env.DO_SPACES_CDN || baseConfig.cdnUrl,
        digitalocean: {
          key: process.env.DO_SPACES_KEY || '',
          secret: process.env.DO_SPACES_SECRET || '',
          endpoint: process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com',
        },
      };

    case 'azure':
      return {
        ...baseConfig,
        bucket: process.env.AZURE_CONTAINER_NAME || baseConfig.bucket,
        cdnUrl: process.env.AZURE_CDN_URL || baseConfig.cdnUrl,
        azure: {
          accountName: process.env.AZURE_STORAGE_ACCOUNT || '',
          accountKey: process.env.AZURE_STORAGE_KEY || '',
          containerName: process.env.AZURE_CONTAINER_NAME || 'exprsn-uploads',
        },
      };

    case 'local':
      return {
        ...baseConfig,
        cdnUrl: process.env.LOCAL_STORAGE_URL || baseConfig.cdnUrl,
        local: {
          basePath: process.env.LOCAL_STORAGE_PATH || '/data/storage',
        },
      };

    case 'minio':
    default:
      return {
        ...baseConfig,
        bucket: process.env.MINIO_BUCKET || process.env.DO_SPACES_BUCKET || baseConfig.bucket,
        minio: {
          endpoint: process.env.MINIO_ENDPOINT || process.env.DO_SPACES_ENDPOINT || 'http://localhost:9000',
          accessKey: process.env.MINIO_ACCESS_KEY || process.env.DO_SPACES_KEY || 'minioadmin',
          secretKey: process.env.MINIO_SECRET_KEY || process.env.DO_SPACES_SECRET || 'minioadmin',
          useSSL: process.env.MINIO_USE_SSL === 'true',
        },
      };
  }
}

// Singleton instance
let storageProviderInstance: StorageProvider | null = null;

export async function getStorageProvider(): Promise<StorageProvider> {
  if (!storageProviderInstance) {
    const config = getStorageConfigFromEnv();
    storageProviderInstance = await createStorageProvider(config);
  }
  return storageProviderInstance;
}

// Reset the singleton (useful for testing or config changes)
export function resetStorageProvider(): void {
  storageProviderInstance = null;
}
