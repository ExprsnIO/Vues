import { promises as fs } from 'fs';
import { createReadStream } from 'fs';

export type StorageProviderType = 'aws' | 'digitalocean' | 'azure' | 'minio' | 'local';

export interface StorageConfig {
  provider: StorageProviderType;
  bucket?: string;
  region?: string;
  cdnUrl?: string;
  localBasePath?: string;
  s3Endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface StorageUploadResult {
  key: string;
  url: string;
  size: number;
}

export function getStorageConfigFromEnv(): StorageConfig {
  const provider = (process.env.RENDER_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || 'local') as StorageProviderType;

  return {
    provider,
    bucket: process.env.RENDER_OUTPUT_BUCKET || process.env.STORAGE_BUCKET || 'exprsn-renders',
    region: process.env.STORAGE_REGION || process.env.AWS_REGION || 'us-east-1',
    cdnUrl: process.env.CDN_BASE_URL,
    localBasePath: process.env.LOCAL_STORAGE_PATH || '/data/renders',
    s3Endpoint: process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT,
    accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  };
}

/**
 * Upload a rendered file to storage
 * Returns the storage key and public URL
 */
export async function uploadToStorage(
  localPath: string,
  storageKey: string,
  contentType: string,
  config?: StorageConfig
): Promise<StorageUploadResult> {
  const cfg = config || getStorageConfigFromEnv();
  const stats = await fs.stat(localPath);

  switch (cfg.provider) {
    case 'local':
      return uploadLocal(localPath, storageKey, cfg.localBasePath || '/data/renders', cfg.cdnUrl);

    case 'minio':
    case 'aws':
    case 'digitalocean':
      return uploadS3Compatible(localPath, storageKey, contentType, cfg);

    default:
      // Fallback to local storage
      return uploadLocal(localPath, storageKey, cfg.localBasePath || '/data/renders', cfg.cdnUrl);
  }
}

async function uploadLocal(
  localPath: string,
  storageKey: string,
  basePath: string,
  cdnUrl?: string
): Promise<StorageUploadResult> {
  const destPath = `${basePath}/${storageKey}`;
  const stats = await fs.stat(localPath);

  // Create directory structure
  const dir = destPath.substring(0, destPath.lastIndexOf('/'));
  await fs.mkdir(dir, { recursive: true });

  // Copy file
  await fs.copyFile(localPath, destPath);

  const url = cdnUrl
    ? `${cdnUrl}/${storageKey}`
    : `file://${destPath}`;

  return {
    key: storageKey,
    url,
    size: stats.size,
  };
}

async function uploadS3Compatible(
  localPath: string,
  storageKey: string,
  contentType: string,
  config: StorageConfig
): Promise<StorageUploadResult> {
  // Dynamically import S3 client
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const stats = await fs.stat(localPath);

  const s3Config: Record<string, unknown> = {
    region: config.region || 'us-east-1',
  };

  if (config.s3Endpoint) {
    s3Config.endpoint = config.s3Endpoint;
    s3Config.forcePathStyle = true;
  }

  if (config.accessKeyId && config.secretAccessKey) {
    s3Config.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  const client = new S3Client(s3Config);

  const fileContent = await fs.readFile(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
      Body: fileContent,
      ContentType: contentType,
      ACL: 'public-read',
    })
  );

  let url: string;
  if (config.cdnUrl) {
    url = `${config.cdnUrl}/${storageKey}`;
  } else if (config.s3Endpoint) {
    url = `${config.s3Endpoint}/${config.bucket}/${storageKey}`;
  } else {
    url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${storageKey}`;
  }

  return {
    key: storageKey,
    url,
    size: stats.size,
  };
}

/**
 * Get the content type for a file extension
 */
export function getContentType(ext: string): string {
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    gif: 'image/gif',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}
