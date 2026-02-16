import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';
import { generateId } from '@exprsn/shared';
import { redis, CacheKeys } from '../cache/redis.js';
import { db, uploadJobs } from '../db/index.js';
import { eq } from 'drizzle-orm';

// S3 client for DigitalOcean Spaces
const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT || `https://${process.env.DO_SPACES_REGION}.digitaloceanspaces.com`,
  region: process.env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
  forcePathStyle: true, // Required for MinIO compatibility in local dev
});

// BullMQ queue for video transcoding jobs
const transcodeQueue = new Queue('transcode', {
  connection: {
    host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
    port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
  },
});

export interface UploadUrlResponse {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface UploadStatus {
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  cdnUrl?: string;
  hlsPlaylist?: string;
  thumbnail?: string;
  error?: string;
}

class UploadService {
  /**
   * Generate a presigned URL for direct upload to S3/Spaces
   */
  async getUploadUrl(userId: string, contentType: string): Promise<UploadUrlResponse> {
    const uploadId = generateId();
    const key = `uploads/${userId}/${uploadId}/original`;

    const command = new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // Store upload metadata in Redis
    const uploadData: UploadStatus & { userId: string; key: string } = {
      userId,
      key,
      status: 'pending',
      progress: 0,
    };

    await redis.setex(CacheKeys.upload(uploadId), 3600, JSON.stringify(uploadData));

    // Also store in database for persistence
    await db.insert(uploadJobs).values({
      id: uploadId,
      userDid: userId,
      status: 'pending',
      progress: 0,
      inputKey: key,
    });

    return {
      uploadId,
      uploadUrl,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }

  /**
   * Mark upload as complete and queue transcoding job
   */
  async completeUpload(uploadId: string): Promise<void> {
    const cached = await redis.get(CacheKeys.upload(uploadId));
    if (!cached) {
      throw new Error('Upload not found');
    }

    const uploadData = JSON.parse(cached);

    // Update status
    uploadData.status = 'processing';
    uploadData.progress = 10;
    await redis.setex(CacheKeys.upload(uploadId), 7200, JSON.stringify(uploadData));

    // Update database
    await db
      .update(uploadJobs)
      .set({ status: 'processing', progress: 10, updatedAt: new Date() })
      .where(eq(uploadJobs.id, uploadId));

    // Queue transcoding job
    await transcodeQueue.add(
      'transcode',
      {
        uploadId,
        inputKey: uploadData.key,
        userId: uploadData.userId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );
  }

  /**
   * Get current upload/processing status
   */
  async getUploadStatus(uploadId: string): Promise<UploadStatus | null> {
    // Try Redis first (faster)
    const cached = await redis.get(CacheKeys.upload(uploadId));
    if (cached) {
      const data = JSON.parse(cached);
      return {
        status: data.status,
        progress: data.progress,
        cdnUrl: data.cdnUrl,
        hlsPlaylist: data.hlsPlaylist,
        thumbnail: data.thumbnail,
        error: data.error,
      };
    }

    // Fall back to database
    const dbRecord = await db.query.uploadJobs.findFirst({
      where: eq(uploadJobs.id, uploadId),
    });

    if (!dbRecord) {
      return null;
    }

    return {
      status: dbRecord.status as UploadStatus['status'],
      progress: dbRecord.progress,
      cdnUrl: dbRecord.cdnUrl ?? undefined,
      hlsPlaylist: dbRecord.hlsPlaylist ?? undefined,
      thumbnail: dbRecord.thumbnailUrl ?? undefined,
      error: dbRecord.error ?? undefined,
    };
  }

  /**
   * Update upload status (called by transcode worker)
   */
  async updateStatus(
    uploadId: string,
    update: Partial<UploadStatus> & { userId?: string }
  ): Promise<void> {
    // Update Redis
    const cached = await redis.get(CacheKeys.upload(uploadId));
    if (cached) {
      const data = { ...JSON.parse(cached), ...update };
      await redis.setex(CacheKeys.upload(uploadId), 7200, JSON.stringify(data));
    }

    // Update database
    await db
      .update(uploadJobs)
      .set({
        status: update.status,
        progress: update.progress,
        cdnUrl: update.cdnUrl,
        hlsPlaylist: update.hlsPlaylist,
        thumbnailUrl: update.thumbnail,
        error: update.error,
        updatedAt: new Date(),
      })
      .where(eq(uploadJobs.id, uploadId));
  }
}

export const uploadService = new UploadService();
