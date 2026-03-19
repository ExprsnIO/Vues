/**
 * Render Job Controller
 *
 * Business logic for render job operations including:
 * - Job creation and configuration
 * - Status updates and progress tracking
 * - Output management
 * - Cleanup operations
 */

import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { Queue } from 'bullmq';
import { deleteFromS3 } from '../utils/s3.js';
import { emitRenderProgress, emitRenderComplete, emitRenderFailed } from '../websocket/renderProgress.js';
import { getRedisConnection } from '../cache/redis.js';

export interface RenderJobConfig {
  resolution: '480p' | '720p' | '1080p' | '4k';
  format: 'mp4' | 'webm' | 'mov';
  fps: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  codec?: string;
  audioBitrate?: number;
  videoBitrate?: number;
  startTime?: number;
  endTime?: number;
  watermark?: {
    text?: string;
    imageUrl?: string;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    opacity: number;
  };
  effects?: Array<{
    type: string;
    params: Record<string, unknown>;
  }>;
}

export interface RenderJobProgress {
  phase: 'preparing' | 'rendering' | 'encoding' | 'uploading' | 'finalizing';
  percent: number;
  currentFrame?: number;
  totalFrames?: number;
  fps?: number;
  eta?: number;
  message?: string;
}

export interface RenderJobResult {
  outputUrl: string;
  outputKey: string;
  outputSize: number;
  duration: number;
  width: number;
  height: number;
}

// Job data for BullMQ queue
export interface RenderJobData {
  jobId: string;
  projectId: string;
  userDid: string;
  config: RenderJobConfig;
}

// Lazy-initialized queue
let renderQueue: Queue<RenderJobData> | null = null;

function getRenderQueue(): Queue<RenderJobData> {
  if (!renderQueue) {
    renderQueue = new Queue<RenderJobData>('render-jobs', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return renderQueue;
}

export class RenderJobController {
  /**
   * Create a new render job
   */
  async createJob(
    userDid: string,
    projectId: string,
    config: Partial<RenderJobConfig>,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<{ jobId: string; position: number }> {
    const jobId = `render_${nanoid()}`;

    // Merge with defaults
    const fullConfig: RenderJobConfig = {
      resolution: config.resolution || '1080p',
      format: config.format || 'mp4',
      fps: config.fps || 30,
      quality: config.quality || 'high',
      ...config,
    };

    // Convert resolution to dimensions
    const resolutionMap: Record<string, { width: number; height: number }> = {
      '480p': { width: 854, height: 480 },
      '720p': { width: 1280, height: 720 },
      '1080p': { width: 1920, height: 1080 },
      '4k': { width: 3840, height: 2160 },
    };

    // Insert job into database
    await db.insert(schema.renderJobs).values({
      id: jobId,
      userDid,
      projectId,
      status: 'pending',
      progress: 0,
      priority,
      format: fullConfig.format,
      quality: fullConfig.quality,
      resolution: resolutionMap[fullConfig.resolution],
      fps: fullConfig.fps,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Queue the job in BullMQ
    const queue = getRenderQueue();
    const jobPriority = { low: 20, normal: 10, high: 5, urgent: 1 }[priority];

    await queue.add(
      'render',
      {
        jobId,
        projectId,
        userDid,
        config: fullConfig,
      },
      {
        jobId, // Use our job ID as BullMQ job ID
        priority: jobPriority,
      }
    );

    // Get queue position
    const [position] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.renderJobs)
      .where(inArray(schema.renderJobs.status, ['pending', 'queued']));

    return {
      jobId,
      position: position?.count || 1,
    };
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // Only pending jobs can be cancelled
    const [job] = await db
      .select({ status: schema.renderJobs.status })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    if (!job || job.status !== 'pending') {
      return false;
    }

    // Remove from BullMQ queue
    const queue = getRenderQueue();
    const bullJob = await queue.getJob(jobId);
    if (bullJob) {
      await bullJob.remove();
    }

    // Update database
    await db
      .update(schema.renderJobs)
      .set({
        status: 'cancelled',
        errorMessage: 'Cancelled by user',
        renderCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    return true;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<{ success: boolean; newJobId?: string }> {
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    if (!job || job.status !== 'failed') {
      return { success: false };
    }

    // Create a new job with the same configuration
    const newJobId = `render_${nanoid()}`;

    await db.insert(schema.renderJobs).values({
      id: newJobId,
      userDid: job.userDid,
      projectId: job.projectId,
      status: 'pending',
      progress: 0,
      priority: job.priority || 'normal',
      format: job.format,
      quality: job.quality,
      resolution: job.resolution,
      fps: job.fps,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Queue the new job
    const queue = getRenderQueue();
    const jobPriority = { low: 20, normal: 10, high: 5, urgent: 1 }[job.priority || 'normal'];

    await queue.add(
      'render',
      {
        jobId: newJobId,
        projectId: job.projectId,
        userDid: job.userDid,
        config: {
          resolution: '1080p', // Default, actual resolution comes from resolution field
          format: job.format as RenderJobConfig['format'],
          fps: job.fps || 30,
          quality: job.quality as RenderJobConfig['quality'],
        },
      },
      {
        jobId: newJobId,
        priority: jobPriority,
      }
    );

    return { success: true, newJobId };
  }

  /**
   * Update job status
   */
  async updateStatus(
    jobId: string,
    status: string,
    updates?: Partial<{
      progress: number;
      currentStep: string;
      errorMessage: string;
      renderStartedAt: Date;
      renderCompletedAt: Date;
    }>
  ): Promise<void> {
    await db
      .update(schema.renderJobs)
      .set({
        status,
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    // Get job details for WebSocket emission
    const [job] = await db
      .select({
        userDid: schema.renderJobs.userDid,
        projectId: schema.renderJobs.projectId,
        progress: schema.renderJobs.progress,
      })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    if (job) {
      emitRenderProgress({
        jobId,
        status: status as any,
        progress: updates?.progress || job.progress || 0,
        currentStep: updates?.currentStep,
      });
    }
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId: string, progress: RenderJobProgress): Promise<void> {
    await db
      .update(schema.renderJobs)
      .set({
        progress: progress.percent,
        currentStep: progress.phase,
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    emitRenderProgress({
      jobId,
      status: 'rendering',
      progress: progress.percent,
      currentStep: progress.phase,
      fps: progress.fps,
      eta: progress.eta,
    });
  }

  /**
   * Complete a render job
   */
  async completeJob(jobId: string, result: RenderJobResult): Promise<void> {
    // Update job with results
    await db
      .update(schema.renderJobs)
      .set({
        status: 'completed',
        progress: 100,
        outputUrl: result.outputUrl,
        outputKey: result.outputKey,
        outputSize: result.outputSize,
        duration: result.duration,
        renderCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    // Get job details for notification
    const [job] = await db
      .select({
        userDid: schema.renderJobs.userDid,
        projectId: schema.renderJobs.projectId,
      })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    if (job) {
      emitRenderComplete({
        jobId,
        projectId: job.projectId,
        userDid: job.userDid,
        status: 'completed',
        progress: 100,
        outputUrl: result.outputUrl,
        outputKey: result.outputKey,
        fileSize: result.outputSize,
        duration: result.duration,
      });
    }
  }

  /**
   * Fail a render job
   */
  async failJob(jobId: string, error: string): Promise<void> {
    await db
      .update(schema.renderJobs)
      .set({
        status: 'failed',
        errorMessage: error,
        renderCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    // Get job details for notification
    const [job] = await db
      .select({
        userDid: schema.renderJobs.userDid,
        projectId: schema.renderJobs.projectId,
      })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    if (job) {
      emitRenderFailed({
        jobId,
        projectId: job.projectId,
        userDid: job.userDid,
        status: 'failed',
        progress: 0,
        error,
      });
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<schema.RenderJob | null> {
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    return job || null;
  }

  /**
   * Get jobs for user
   */
  async getUserJobs(
    userDid: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ jobs: schema.RenderJob[]; total: number }> {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const conditions = [eq(schema.renderJobs.userDid, userDid)];
    if (options?.status) {
      conditions.push(eq(schema.renderJobs.status, options.status));
    }

    const jobs = await db
      .select()
      .from(schema.renderJobs)
      .where(and(...conditions))
      .orderBy(desc(schema.renderJobs.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.renderJobs)
      .where(and(...conditions));

    return {
      jobs,
      total: countResult?.count || 0,
    };
  }

  /**
   * Get active jobs (for worker)
   */
  async getNextPendingJob(): Promise<schema.RenderJob | null> {
    // Check if queue is paused
    const { redis } = await import('../cache/redis.js');
    const paused = await redis.get('render:queue:paused');
    if (paused === 'true') {
      return null;
    }

    // Get oldest pending job with priority
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.status, 'pending'))
      .orderBy(
        sql`CASE WHEN ${schema.renderJobs.priority} = 'urgent' THEN 0
                 WHEN ${schema.renderJobs.priority} = 'high' THEN 1
                 WHEN ${schema.renderJobs.priority} = 'normal' THEN 2
                 ELSE 3 END`,
        schema.renderJobs.createdAt
      )
      .limit(1);

    return job || null;
  }

  /**
   * Claim a job for processing
   */
  async claimJob(jobId: string, workerId: string): Promise<boolean> {
    const result = await db
      .update(schema.renderJobs)
      .set({
        status: 'queued',
        workerId,
        workerStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.renderJobs.id, jobId),
          eq(schema.renderJobs.status, 'pending')
        )
      )
      .returning({ id: schema.renderJobs.id });

    return result.length > 0;
  }

  /**
   * Release a job back to pending (worker failure)
   */
  async releaseJob(jobId: string): Promise<void> {
    await db
      .update(schema.renderJobs)
      .set({
        status: 'pending',
        workerId: null,
        workerStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));
  }

  /**
   * Delete job and cleanup files
   */
  async deleteJob(jobId: string): Promise<void> {
    const [job] = await db
      .select({
        outputKey: schema.renderJobs.outputKey,
      })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    // Delete S3 files
    if (job?.outputKey) {
      try {
        await deleteFromS3(job.outputKey);
      } catch {
        // Ignore S3 errors
      }
    }

    // Delete database record
    await db.delete(schema.renderJobs).where(eq(schema.renderJobs.id, jobId));
  }

  /**
   * Cleanup old completed jobs
   */
  async cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Get jobs to delete
    const oldJobs = await db
      .select({
        id: schema.renderJobs.id,
        outputKey: schema.renderJobs.outputKey,
      })
      .from(schema.renderJobs)
      .where(
        and(
          eq(schema.renderJobs.status, 'completed'),
          sql`${schema.renderJobs.renderCompletedAt} < ${cutoffDate}`
        )
      );

    // Delete S3 files
    for (const job of oldJobs) {
      if (job.outputKey) {
        try {
          await deleteFromS3(job.outputKey);
        } catch {
          // Continue on error
        }
      }
    }

    // Delete database records
    await db
      .delete(schema.renderJobs)
      .where(
        and(
          eq(schema.renderJobs.status, 'completed'),
          sql`${schema.renderJobs.renderCompletedAt} < ${cutoffDate}`
        )
      );

    return oldJobs.length;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    active: number;
    completed: number;
    failed: number;
    avgWaitTime: number;
    avgRenderTime: number;
  }> {
    const [stats] = await db
      .select({
        pending: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} IN ('pending', 'queued'))::int`,
        active: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} IN ('rendering', 'encoding', 'uploading'))::int`,
        completed: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'completed')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${schema.renderJobs.status} = 'failed')::int`,
        avgWaitTime: sql<number>`AVG(EXTRACT(EPOCH FROM (${schema.renderJobs.renderStartedAt} - ${schema.renderJobs.createdAt}))) FILTER (WHERE ${schema.renderJobs.renderStartedAt} IS NOT NULL)::int`,
        avgRenderTime: sql<number>`AVG(EXTRACT(EPOCH FROM (${schema.renderJobs.renderCompletedAt} - ${schema.renderJobs.renderStartedAt}))) FILTER (WHERE ${schema.renderJobs.renderCompletedAt} IS NOT NULL AND ${schema.renderJobs.status} = 'completed')::int`,
      })
      .from(schema.renderJobs);

    return {
      pending: stats?.pending || 0,
      active: stats?.active || 0,
      completed: stats?.completed || 0,
      failed: stats?.failed || 0,
      avgWaitTime: stats?.avgWaitTime || 0,
      avgRenderTime: stats?.avgRenderTime || 0,
    };
  }

  /**
   * Pause the render queue (admin only)
   */
  async pauseQueue(): Promise<void> {
    const queue = getRenderQueue();
    await queue.pause();

    // Also set Redis flag for polling workers
    const { redis } = await import('../cache/redis.js');
    await redis.set('render:queue:paused', 'true');
  }

  /**
   * Resume the render queue (admin only)
   */
  async resumeQueue(): Promise<void> {
    const queue = getRenderQueue();
    await queue.resume();

    // Clear Redis flag
    const { redis } = await import('../cache/redis.js');
    await redis.del('render:queue:paused');
  }

  /**
   * Check if queue is paused
   */
  async isQueuePaused(): Promise<boolean> {
    const queue = getRenderQueue();
    return await queue.isPaused();
  }

  /**
   * Get BullMQ queue statistics
   */
  async getBullMQStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    const queue = getRenderQueue();

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    };
  }

  /**
   * Force cancel an active job (admin only)
   */
  async forceCancel(jobId: string): Promise<boolean> {
    const queue = getRenderQueue();
    const bullJob = await queue.getJob(jobId);

    if (bullJob) {
      try {
        // Try to remove from queue if still waiting
        const state = await bullJob.getState();
        if (state === 'waiting' || state === 'delayed') {
          await bullJob.remove();
        } else if (state === 'active') {
          // For active jobs, we can try to move to failed
          await bullJob.moveToFailed(new Error('Cancelled by admin'), 'admin-cancel');
        }
      } catch {
        // Job may have already completed
      }
    }

    // Update database
    await db
      .update(schema.renderJobs)
      .set({
        status: 'cancelled',
        errorMessage: 'Cancelled by admin',
        renderCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    return true;
  }

  /**
   * Requeue all failed jobs (admin only)
   */
  async requeueFailedJobs(): Promise<number> {
    const failedJobs = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.status, 'failed'));

    let requeuedCount = 0;

    for (const job of failedJobs) {
      const result = await this.retryJob(job.id);
      if (result.success) {
        requeuedCount++;
      }
    }

    return requeuedCount;
  }

  /**
   * Get job position in queue
   */
  async getJobPosition(jobId: string): Promise<number | null> {
    const [job] = await db
      .select({ status: schema.renderJobs.status, createdAt: schema.renderJobs.createdAt })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, jobId))
      .limit(1);

    if (!job || !['pending', 'queued'].includes(job.status)) {
      return null;
    }

    // Count jobs ahead of this one
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.renderJobs)
      .where(
        and(
          inArray(schema.renderJobs.status, ['pending', 'queued']),
          sql`${schema.renderJobs.createdAt} < ${job.createdAt}`
        )
      );

    return (result?.count || 0) + 1;
  }

  /**
   * Drain the queue (remove all waiting jobs, admin only)
   */
  async drainQueue(): Promise<number> {
    const queue = getRenderQueue();

    // Get all waiting jobs
    const waitingJobs = await queue.getJobs(['waiting', 'delayed']);
    let drainedCount = 0;

    for (const job of waitingJobs) {
      try {
        await job.remove();

        // Update database
        await db
          .update(schema.renderJobs)
          .set({
            status: 'cancelled',
            errorMessage: 'Queue drained by admin',
            renderCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.renderJobs.id, job.id || ''));

        drainedCount++;
      } catch {
        // Job may have started processing
      }
    }

    return drainedCount;
  }
}

// Singleton instance
export const renderJobController = new RenderJobController();

export default renderJobController;
