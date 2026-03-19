/**
 * S3 Utility Module
 *
 * Provides unified S3/MinIO/DigitalOcean Spaces operations
 * for video storage, streaming assets, and file uploads.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getPresignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuration from environment
export const S3_BUCKET = process.env.S3_BUCKET || process.env.DO_SPACES_BUCKET || 'exprsn-videos';
export const S3_REGION = process.env.S3_REGION || process.env.DO_SPACES_REGION || 'nyc3';
export const CDN_URL = process.env.CDN_URL || process.env.DO_SPACES_CDN || `https://${S3_BUCKET}.${S3_REGION}.digitaloceanspaces.com`;

// S3 Client Configuration
const s3Config: ConstructorParameters<typeof S3Client>[0] = {
  region: S3_REGION,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // Required for MinIO
};

// Use custom endpoint for DigitalOcean Spaces or MinIO
if (process.env.S3_ENDPOINT || process.env.DO_SPACES_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT || process.env.DO_SPACES_ENDPOINT;
}

// Credentials from environment
if (process.env.S3_ACCESS_KEY_ID || process.env.DO_SPACES_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.DO_SPACES_KEY || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.DO_SPACES_SECRET || '',
  };
}

export const s3Client = new S3Client(s3Config);

/**
 * Upload content to S3
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array | string | ReadableStream,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      ACL: 'public-read', // Make files publicly accessible
    })
  );

  return `${CDN_URL}/${key}`;
}

/**
 * Get a signed URL for private file access
 */
export async function getSignedUrl(
  key: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  return getPresignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get a signed URL for uploads
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getPresignedUrl(s3Client, command, { expiresIn });
}

/**
 * Download file from S3
 */
export async function downloadFromS3(key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`File not found: ${key}`);
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Stream file from S3 to local path
 */
export async function streamFromS3ToFile(key: string, localPath: string): Promise<void> {
  const { createWriteStream } = await import('fs');

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`File not found: ${key}`);
  }

  const stream = response.Body as NodeJS.ReadableStream;
  const writeStream = createWriteStream(localPath);

  await new Promise<void>((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

/**
 * Delete file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );
}

/**
 * Delete multiple files from S3
 */
export async function deleteMultipleFromS3(keys: string[]): Promise<void> {
  // S3 batch delete is limited to 1000 keys
  const batches = [];
  for (let i = 0; i < keys.length; i += 1000) {
    batches.push(keys.slice(i, i + 1000));
  }

  for (const batch of batches) {
    await Promise.all(batch.map((key) => deleteFromS3(key)));
  }
}

/**
 * Check if file exists in S3
 */
export async function fileExistsInS3(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file metadata from S3
 */
export async function getFileMetadata(key: string): Promise<{
  size: number;
  contentType: string;
  lastModified: Date;
  metadata: Record<string, string>;
} | null> {
  try {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );

    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      lastModified: response.LastModified || new Date(),
      metadata: response.Metadata || {},
    };
  } catch {
    return null;
  }
}

/**
 * List files in S3 with a prefix
 */
export async function listFilesInS3(
  prefix: string,
  maxKeys: number = 1000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );

  return (response.Contents || []).map((item) => ({
    key: item.Key || '',
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }));
}

/**
 * Copy file within S3
 */
export async function copyFileInS3(sourceKey: string, destKey: string): Promise<void> {
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${sourceKey}`,
      Key: destKey,
    })
  );
}

/**
 * Move file within S3 (copy + delete)
 */
export async function moveFileInS3(sourceKey: string, destKey: string): Promise<void> {
  await copyFileInS3(sourceKey, destKey);
  await deleteFromS3(sourceKey);
}

/**
 * Get CDN URL for a file
 */
export function getCdnUrl(key: string): string {
  return `${CDN_URL}/${key}`;
}

/**
 * Upload a local file to S3
 */
/**
 * Simple MIME type lookup by file extension
 */
function lookupMimeType(filePath: string): string | false {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    m3u8: 'application/x-mpegURL',
    mpd: 'application/dash+xml',
    m4s: 'video/mp4',
    ts: 'video/MP2T',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    json: 'application/json',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    vtt: 'text/vtt',
    srt: 'text/plain',
    txt: 'text/plain',
    pdf: 'application/pdf',
    xml: 'application/xml',
    zip: 'application/zip',
  };
  return ext ? types[ext] || false : false;
}

export async function uploadFileToS3(
  localPath: string,
  key: string,
  contentType?: string
): Promise<string> {
  const { readFileSync } = await import('fs');

  const body = readFileSync(localPath);
  const detectedType = contentType || lookupMimeType(localPath) || 'application/octet-stream';

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: detectedType,
      ACL: 'public-read',
    })
  );

  return `${CDN_URL}/${key}`;
}

/**
 * Parse S3 URL to extract bucket and key
 */
export function parseS3Url(url: string): { bucket: string; key: string } | null {
  try {
    const parsed = new URL(url);

    // Handle various S3 URL formats
    // https://bucket.s3.region.amazonaws.com/key
    // https://s3.region.amazonaws.com/bucket/key
    // https://bucket.region.digitaloceanspaces.com/key

    const hostParts = parsed.hostname.split('.');

    if (hostParts.includes('s3') || hostParts.includes('digitaloceanspaces')) {
      // bucket.s3.region.amazonaws.com or bucket.region.digitaloceanspaces.com
      if (hostParts[0] && !hostParts[0].includes('s3')) {
        return {
          bucket: hostParts[0],
          key: parsed.pathname.slice(1),
        };
      }
      // s3.region.amazonaws.com/bucket/key
      const pathParts = parsed.pathname.slice(1).split('/');
      return {
        bucket: pathParts[0] || '',
        key: pathParts.slice(1).join('/'),
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a unique key for video uploads
 */
export function generateVideoKey(userDid: string, videoId: string, filename?: string): string {
  const ext = filename ? filename.split('.').pop() : 'mp4';
  return `videos/${userDid}/${videoId}/original.${ext}`;
}

/**
 * Generate key prefix for video assets
 */
export function getVideoAssetsPrefix(userDid: string, videoId: string): string {
  return `videos/${userDid}/${videoId}`;
}

export default {
  s3Client,
  S3_BUCKET,
  S3_REGION,
  CDN_URL,
  uploadToS3,
  downloadFromS3,
  streamFromS3ToFile,
  deleteFromS3,
  deleteMultipleFromS3,
  fileExistsInS3,
  getFileMetadata,
  listFilesInS3,
  copyFileInS3,
  moveFileInS3,
  getSignedUrl,
  getSignedUploadUrl,
  getCdnUrl,
  parseS3Url,
  generateVideoKey,
  getVideoAssetsPrefix,
};
