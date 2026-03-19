/**
 * Dead Letter Queue Service
 * Handles failed video processing jobs that have exhausted retries
 */

import { Queue, Worker, Job } from 'bullmq';
import { db } from '../../db/index.js';
import { uploadJobs, deadLetterQueue } from '../../db/schema.js';
import { eq, and, or, count, desc, gte, lt, isNotNull, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { redis } from '../../cache/redis.js';
import { getTranscodeWebhooks } from './TranscodeWebhooks.js';

/**
 * DLQ entry for failed jobs
 */
export interface DLQEntry {
  id: string;
  originalJobId: string;
  uploadId: string;
  userId: string;
  failureReason: string;
  failedAt: Date;
  attempts: number;
  lastError: string | null;
  jobData: Record<string, unknown>;
  canRequeue: boolean;
}

/**
 * DLQ statistics
 */
export interface DLQStats {
  totalCount: number;
  last24Hours: number;
  byErrorType: Record<string, number>;
  oldestEntry?: Date;
}

/**
 * Dead Letter Queue Service
 */
export class DeadLetterQueueService {
  private dlqQueue: Queue;
  private dlqWorker: Worker | null = null;
  private redisConnection: { host: string; port: number };

  constructor() {
    this.redisConnection = {
      host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
      port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
    };

    this.dlqQueue = new Queue('transcode-dlq', {
      connection: this.redisConnection,
    });
  }

  /**
   * Start the DLQ worker
   */
  async start(): Promise<void> {
    this.dlqWorker = new Worker(
      'transcode-dlq',
      async (job: Job) => {
        await this.processDLQEntry(job);
      },
      {
        connection: this.redisConnection,
        concurrency: 1, // Process DLQ entries one at a time
      }
    );

    this.dlqWorker.on('completed', (job) => {
      console.log(`[DLQ] Processed entry: ${job.id}`);
    });

    this.dlqWorker.on('failed', (job, err) => {
      console.error(`[DLQ] Failed to process entry: ${job?.id}`, err);
    });

    console.log('[DLQ] Dead letter queue worker started');
  }

  /**
   * Stop the DLQ worker
   */
  async stop(): Promise<void> {
    if (this.dlqWorker) {
      await this.dlqWorker.close();
      this.dlqWorker = null;
    }
    await this.dlqQueue.close();
    console.log('[DLQ] Dead letter queue worker stopped');
  }

  /**
   * Move a failed job to the dead letter queue
   */
  async moveToDeadLetter(
    job: Job,
    error: Error,
    attempts: number
  ): Promise<void> {
    const { uploadId, userId, inputKey } = job.data as {
      uploadId: string;
      userId: string;
      inputKey: string;
    };

    const dlqId = nanoid();
    const errorMessage = error.message || 'Unknown error';
    const errorType = this.categorizeError(errorMessage);

    // Determine if the job can be requeued
    const canRequeue = this.isRequeueable(errorType, attempts);

    // Store in database
    await db.insert(deadLetterQueue).values({
      id: dlqId,
      originalJobId: job.id || '',
      uploadId,
      userId,
      failureReason: errorType,
      failedAt: new Date(),
      attempts,
      lastError: error.stack ? `${errorMessage}\n${error.stack}` : errorMessage,
      jobData: job.data as Record<string, unknown>,
      canRequeue,
      createdAt: new Date(),
    });

    // Update upload job status
    await db
      .update(uploadJobs)
      .set({
        status: 'failed',
        error: `Moved to DLQ: ${errorMessage}`,
        movedToDlq: true,
        dlqId,
        updatedAt: new Date(),
      })
      .where(eq(uploadJobs.id, uploadId));

    // Send webhook notification
    const webhooks = getTranscodeWebhooks();
    await webhooks.onProcessingFailed(uploadId, userId, errorMessage, attempts);

    // Add to DLQ queue for processing
    await this.dlqQueue.add('process-dlq', {
      dlqId,
      uploadId,
      userId,
      errorType,
      canRequeue,
    });

    console.log(`[DLQ] Moved job ${job.id} to dead letter queue: ${dlqId}`);
  }

  /**
   * Process a DLQ entry
   */
  private async processDLQEntry(job: Job): Promise<void> {
    const { dlqId, uploadId, userId, errorType } = job.data as {
      dlqId: string;
      uploadId: string;
      userId: string;
      errorType: string;
    };

    // Log for monitoring/alerting
    console.log(`[DLQ] Processing failed job: ${uploadId}, error type: ${errorType}`);

    // Here you could:
    // 1. Send alerts to monitoring systems
    // 2. Notify admins via Slack/Discord
    // 3. Update metrics for dashboards
    // 4. Auto-remediate certain error types

    // Mark as processed
    await db
      .update(deadLetterQueue)
      .set({
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deadLetterQueue.id, dlqId));
  }

  /**
   * Categorize error type for analysis
   */
  private categorizeError(errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes('ffmpeg') || lowerError.includes('transcode')) {
      return 'transcode_error';
    }
    if (lowerError.includes('s3') || lowerError.includes('storage') || lowerError.includes('upload')) {
      return 'storage_error';
    }
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return 'timeout_error';
    }
    if (lowerError.includes('memory') || lowerError.includes('oom')) {
      return 'memory_error';
    }
    if (lowerError.includes('network') || lowerError.includes('connection')) {
      return 'network_error';
    }
    if (lowerError.includes('corrupt') || lowerError.includes('invalid')) {
      return 'invalid_input';
    }

    return 'unknown_error';
  }

  /**
   * Determine if a job can be requeued
   */
  private isRequeueable(errorType: string, attempts: number): boolean {
    // Some errors are not worth retrying
    const nonRetryableErrors = ['invalid_input', 'corrupt'];
    if (nonRetryableErrors.some(e => errorType.includes(e))) {
      return false;
    }

    // Allow manual requeue for transient errors
    const transientErrors = ['timeout_error', 'network_error', 'storage_error'];
    return transientErrors.includes(errorType);
  }

  /**
   * Requeue a job from the dead letter queue
   */
  async requeueJob(dlqId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
    const entry = await db.query.deadLetterQueue.findFirst({
      where: eq(deadLetterQueue.id, dlqId),
    });

    if (!entry) {
      return { success: false, error: 'DLQ entry not found' };
    }

    if (!entry.canRequeue) {
      return { success: false, error: 'This job cannot be requeued' };
    }

    if (entry.requeuedAt) {
      return { success: false, error: 'This job has already been requeued' };
    }

    // Get the transcode queue
    const transcodeQueue = new Queue('transcode', {
      connection: this.redisConnection,
    });

    // Re-add to transcode queue with high priority
    await transcodeQueue.add(
      'transcode',
      {
        ...entry.jobData,
        isRequeue: true,
        requeuedFrom: dlqId,
        requeuedBy: adminId,
      },
      {
        priority: 1, // High priority for requeued jobs
        attempts: 5, // More attempts for requeued jobs
        backoff: {
          type: 'exponential',
          delay: 10000, // Start with 10s delay
        },
      }
    );

    // Update DLQ entry
    await db
      .update(deadLetterQueue)
      .set({
        requeuedAt: new Date(),
        requeuedBy: adminId,
        updatedAt: new Date(),
      })
      .where(eq(deadLetterQueue.id, dlqId));

    // Update upload job status
    await db
      .update(uploadJobs)
      .set({
        status: 'processing',
        error: null,
        retryCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(uploadJobs.id, entry.uploadId));

    console.log(`[DLQ] Requeued job ${dlqId} by admin ${adminId}`);

    return { success: true };
  }

  /**
   * Get DLQ entries with pagination and filtering
   */
  async listEntries(options: {
    limit?: number;
    offset?: number;
    errorType?: string;
    canRequeue?: boolean;
  } = {}): Promise<{
    entries: DLQEntry[];
    total: number;
  }> {
    const { limit = 20, offset = 0, errorType, canRequeue } = options;

    // Build filter conditions
    const conditions: SQL[] = [];
    if (errorType) {
      conditions.push(eq(deadLetterQueue.failureReason, errorType));
    }
    if (canRequeue !== undefined) {
      conditions.push(eq(deadLetterQueue.canRequeue, canRequeue));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count with filters
    const [countResult] = await db
      .select({ count: count() })
      .from(deadLetterQueue)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    // Get paginated entries with filters
    const entries = await db
      .select()
      .from(deadLetterQueue)
      .where(whereClause)
      .orderBy(desc(deadLetterQueue.failedAt))
      .limit(limit)
      .offset(offset);

    return {
      entries: entries.map((e) => ({
        id: e.id,
        originalJobId: e.originalJobId,
        uploadId: e.uploadId,
        userId: e.userId,
        failureReason: e.failureReason,
        failedAt: e.failedAt,
        attempts: e.attempts,
        lastError: e.lastError,
        jobData: e.jobData as Record<string, unknown>,
        canRequeue: e.canRequeue,
      })),
      total,
    };
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<DLQStats> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(deadLetterQueue);
    const totalCount = totalResult?.count ?? 0;

    // Get last 24 hours count
    const [last24HoursResult] = await db
      .select({ count: count() })
      .from(deadLetterQueue)
      .where(gte(deadLetterQueue.failedAt, oneDayAgo));
    const last24Hours = last24HoursResult?.count ?? 0;

    // Get counts by error type
    const errorTypeCounts = await db
      .select({
        failureReason: deadLetterQueue.failureReason,
        count: count(),
      })
      .from(deadLetterQueue)
      .groupBy(deadLetterQueue.failureReason);

    const byErrorType: Record<string, number> = {};
    for (const row of errorTypeCounts) {
      byErrorType[row.failureReason] = row.count;
    }

    // Get oldest entry
    const [oldestResult] = await db
      .select({ failedAt: deadLetterQueue.failedAt })
      .from(deadLetterQueue)
      .orderBy(deadLetterQueue.failedAt)
      .limit(1);
    const oldestEntry = oldestResult?.failedAt;

    return {
      totalCount,
      last24Hours,
      byErrorType,
      oldestEntry,
    };
  }

  /**
   * Purge old DLQ entries
   */
  async purgeOldEntries(olderThanDays: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    // Count entries to be deleted first
    const [countResult] = await db
      .select({ count: count() })
      .from(deadLetterQueue)
      .where(
        and(
          lt(deadLetterQueue.failedAt, cutoff),
          or(
            isNotNull(deadLetterQueue.processedAt),
            isNotNull(deadLetterQueue.requeuedAt)
          )
        )
      );
    const deleteCount = countResult?.count ?? 0;

    // Delete old entries that have been processed or requeued
    await db
      .delete(deadLetterQueue)
      .where(
        and(
          lt(deadLetterQueue.failedAt, cutoff),
          or(
            isNotNull(deadLetterQueue.processedAt),
            isNotNull(deadLetterQueue.requeuedAt)
          )
        )
      );

    console.log(`[DLQ] Purged ${deleteCount} old entries`);
    return deleteCount;
  }
}

// Singleton instance
let dlqInstance: DeadLetterQueueService | null = null;

export function getDeadLetterQueue(): DeadLetterQueueService {
  if (!dlqInstance) {
    dlqInstance = new DeadLetterQueueService();
  }
  return dlqInstance;
}

export default DeadLetterQueueService;
