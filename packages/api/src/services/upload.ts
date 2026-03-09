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
  // Retry information
  retryCount?: number;
  maxRetries?: number;
  canRetry?: boolean;
  lastRetryAt?: string;
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

  /**
   * Retry a failed upload
   * @param uploadId - The upload ID to retry
   * @param userId - The user requesting the retry (must own the upload)
   * @returns Success or error information
   */
  async retryUpload(
    uploadId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    // Get the upload job
    const job = await db.query.uploadJobs.findFirst({
      where: eq(uploadJobs.id, uploadId),
    });

    if (!job) {
      return { success: false, error: 'Upload not found' };
    }

    // Verify ownership
    if (job.userDid !== userId) {
      return { success: false, error: 'Not authorized to retry this upload' };
    }

    // Check if it's in a failed state
    if (job.status !== 'failed') {
      return { success: false, error: `Cannot retry upload with status: ${job.status}` };
    }

    // Check retry limit
    if (job.retryCount >= job.maxRetries) {
      return { success: false, error: `Maximum retry limit (${job.maxRetries}) reached` };
    }

    // Record retry attempt
    const retryHistory = (job.retryHistory as Array<{ attemptedAt: string; error: string }>) || [];
    retryHistory.push({
      attemptedAt: new Date().toISOString(),
      error: job.error || 'Unknown error',
    });

    // Update job status
    await db
      .update(uploadJobs)
      .set({
        status: 'processing',
        progress: 10,
        error: null,
        retryCount: job.retryCount + 1,
        lastRetryAt: new Date(),
        retryHistory,
        updatedAt: new Date(),
      })
      .where(eq(uploadJobs.id, uploadId));

    // Update Redis cache
    const cached = await redis.get(CacheKeys.upload(uploadId));
    if (cached) {
      const data = JSON.parse(cached);
      data.status = 'processing';
      data.progress = 10;
      data.error = null;
      await redis.setex(CacheKeys.upload(uploadId), 7200, JSON.stringify(data));
    }

    // Re-queue the transcode job
    await transcodeQueue.add(
      'transcode',
      {
        uploadId,
        inputKey: job.inputKey,
        userId: job.userDid,
        isRetry: true,
        retryCount: job.retryCount + 1,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );

    console.log(`[UploadService] Retry queued for upload: ${uploadId} (attempt ${job.retryCount + 1})`);

    return { success: true };
  }

  /**
   * Force retry an upload (admin only)
   * Bypasses ownership check and retry limit
   * @param uploadId - The upload ID to retry
   * @param adminId - The admin performing the retry
   */
  async forceRetry(
    uploadId: string,
    adminId: string
  ): Promise<{ success: boolean; error?: string }> {
    // Get the upload job
    const job = await db.query.uploadJobs.findFirst({
      where: eq(uploadJobs.id, uploadId),
    });

    if (!job) {
      return { success: false, error: 'Upload not found' };
    }

    // Check if it's in a failed state
    if (job.status !== 'failed') {
      return { success: false, error: `Cannot retry upload with status: ${job.status}` };
    }

    // Record retry attempt with admin info
    const retryHistory = (job.retryHistory as Array<{ attemptedAt: string; error: string; forcedBy?: string }>) || [];
    retryHistory.push({
      attemptedAt: new Date().toISOString(),
      error: job.error || 'Unknown error',
      forcedBy: adminId,
    });

    // Update job status - reset retry count for forced retries
    await db
      .update(uploadJobs)
      .set({
        status: 'processing',
        progress: 10,
        error: null,
        retryCount: 0, // Reset for forced retry
        maxRetries: 5, // Reset max retries
        lastRetryAt: new Date(),
        retryHistory,
        updatedAt: new Date(),
      })
      .where(eq(uploadJobs.id, uploadId));

    // Update Redis cache
    const cached = await redis.get(CacheKeys.upload(uploadId));
    if (cached) {
      const data = JSON.parse(cached);
      data.status = 'processing';
      data.progress = 10;
      data.error = null;
      await redis.setex(CacheKeys.upload(uploadId), 7200, JSON.stringify(data));
    }

    // Re-queue the transcode job with high priority
    await transcodeQueue.add(
      'transcode',
      {
        uploadId,
        inputKey: job.inputKey,
        userId: job.userDid,
        isRetry: true,
        forcedBy: adminId,
      },
      {
        priority: 1, // High priority for admin-forced retries
        attempts: 5, // More attempts for forced retries
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );

    console.log(`[UploadService] Force retry queued for upload: ${uploadId} by admin: ${adminId}`);

    return { success: true };
  }

  /**
   * Get retry information for an upload
   */
  async getRetryInfo(uploadId: string): Promise<{
    retryCount: number;
    maxRetries: number;
    canRetry: boolean;
    lastRetryAt?: string;
    retryHistory: Array<{ attemptedAt: string; error: string; forcedBy?: string }>;
  } | null> {
    const job = await db.query.uploadJobs.findFirst({
      where: eq(uploadJobs.id, uploadId),
    });

    if (!job) {
      return null;
    }

    return {
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      canRetry: job.status === 'failed' && job.retryCount < job.maxRetries,
      lastRetryAt: job.lastRetryAt?.toISOString(),
      retryHistory: (job.retryHistory as Array<{ attemptedAt: string; error: string; forcedBy?: string }>) || [],
    };
  }

  /**
   * Get user's failed uploads
   */
  async getUserFailedUploads(
    userId: string,
    limit = 10
  ): Promise<Array<{
    id: string;
    status: string;
    error?: string;
    retryCount: number;
    maxRetries: number;
    canRetry: boolean;
    createdAt: string;
  }>> {
    const jobs = await db
      .select()
      .from(uploadJobs)
      .where(eq(uploadJobs.userDid, userId))
      .orderBy(uploadJobs.createdAt)
      .limit(limit);

    return jobs
      .filter((job) => job.status === 'failed')
      .map((job) => ({
        id: job.id,
        status: job.status,
        error: job.error || undefined,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        canRetry: job.retryCount < job.maxRetries,
        createdAt: job.createdAt.toISOString(),
      }));
  }
}

export const uploadService = new UploadService();
