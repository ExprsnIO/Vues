/**
 * Transcode Worker
 *
 * Standalone process for handling adaptive streaming transcode jobs.
 * Can be run independently to scale transcode capacity separately from the API.
 *
 * Usage:
 *   npx tsx src/workers/transcodeWorker.ts
 *
 * Environment Variables:
 *   REDIS_URL - Redis connection URL (default: redis://localhost:6379)
 *   TRANSCODE_WORKER_CONCURRENCY - Number of concurrent jobs (default: 2)
 *   S3_BUCKET / DO_SPACES_BUCKET - Storage bucket name
 *   CDN_URL / DO_SPACES_CDN - CDN base URL
 *   FFMPEG_PATH - Path to ffmpeg binary (default: ffmpeg)
 *   FFPROBE_PATH - Path to ffprobe binary (default: ffprobe)
 *   WORKER_ID - Unique worker identifier (default: hostname)
 */

import { Worker, Job, QueueEvents } from 'bullmq';
import { hostname } from 'os';
import {
  adaptiveTranscodeService,
  type TranscodeJobData,
  type TranscodeProgress,
} from '../services/streaming/index.js';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getRedisConnection, getRedisUrl } from '../cache/redis.js';

// Configuration
const REDIS_URL = getRedisUrl();
const CONCURRENCY = parseInt(process.env.TRANSCODE_WORKER_CONCURRENCY || '2', 10);
const WORKER_ID = process.env.WORKER_ID || `transcode-${hostname()}-${process.pid}`;

console.log(`
┌─────────────────────────────────────────────────────────────┐
│                    TRANSCODE WORKER                         │
├─────────────────────────────────────────────────────────────┤
│  Worker ID:    ${WORKER_ID.padEnd(44)}│
│  Concurrency:  ${String(CONCURRENCY).padEnd(44)}│
│  Redis:        ${REDIS_URL.slice(0, 44).padEnd(44)}│
└─────────────────────────────────────────────────────────────┘
`);

// Redis connection options for BullMQ
const redisConnection = getRedisConnection();

// Track active jobs for graceful shutdown
const activeJobs = new Map<string, Job<TranscodeJobData>>();

/**
 * Initialize and start the worker
 */
async function startWorker() {
  console.log('[TranscodeWorker] Starting worker...');

  // Create the worker
  const worker = new Worker<TranscodeJobData>(
    'adaptive-transcode',
    async (job) => {
      activeJobs.set(job.id!, job);
      console.log(`[TranscodeWorker] Processing job ${job.id}: ${job.data.videoUri}`);

      try {
        // Update progress callback
        const onProgress = async (progress: TranscodeProgress) => {
          await job.updateProgress({
            phase: progress.phase,
            percent: progress.percent,
            currentQuality: progress.currentQuality,
            message: progress.message,
          });
        };

        // Process the job
        await processTranscodeJob(job.data, onProgress);

        console.log(`[TranscodeWorker] Job ${job.id} completed successfully`);
        return { success: true };
      } catch (error) {
        const err = error as Error;
        console.error(`[TranscodeWorker] Job ${job.id} failed:`, err.message);
        throw error;
      } finally {
        activeJobs.delete(job.id!);
      }
    },
    {
      connection: redisConnection,
      concurrency: CONCURRENCY,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    }
  );

  // Listen for worker events
  worker.on('completed', (job) => {
    console.log(`[TranscodeWorker] ✓ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[TranscodeWorker] ✗ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[TranscodeWorker] Worker error:', err.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[TranscodeWorker] Job ${jobId} stalled`);
  });

  // Listen for queue events
  const queueEvents = new QueueEvents('adaptive-transcode', {
    connection: redisConnection,
  });

  queueEvents.on('waiting', ({ jobId }) => {
    console.log(`[TranscodeWorker] Job ${jobId} waiting in queue`);
  });

  queueEvents.on('active', ({ jobId }) => {
    console.log(`[TranscodeWorker] Job ${jobId} is now active`);
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    const progress = data as unknown as { phase?: string; percent?: number; message?: string };
    console.log(
      `[TranscodeWorker] Job ${jobId} progress: ${progress.phase} - ${progress.percent}% - ${progress.message || ''}`
    );
  });

  console.log('[TranscodeWorker] Worker started successfully');
  console.log(`[TranscodeWorker] Listening for jobs on queue: adaptive-transcode`);

  return { worker, queueEvents };
}

/**
 * Process a single transcode job
 */
async function processTranscodeJob(
  data: TranscodeJobData,
  onProgress: (progress: TranscodeProgress) => Promise<void>
): Promise<void> {
  const { jobId, videoUri, userDid, inputKey, config } = data;

  // Update job status in database
  await db
    .update(schema.transcodeJobs)
    .set({
      status: 'processing',
      phase: 'init',
      progress: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.transcodeJobs.id, jobId));

  // Report initial progress
  await onProgress({
    phase: 'init',
    percent: 0,
    message: 'Initializing transcode job...',
  });

  // Delegate to the adaptive transcode service for actual processing
  // The service handles HLS/DASH generation, thumbnail sprites, etc.
  await adaptiveTranscodeService.processJobById(jobId);
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(
  signal: string,
  worker: { close: () => Promise<void> },
  queueEvents: { close: () => Promise<void> }
) {
  console.log(`\n[TranscodeWorker] ${signal} received. Initiating graceful shutdown...`);

  // Stop accepting new jobs
  console.log('[TranscodeWorker] Stopping job acceptance...');
  await worker.close();

  // Wait for active jobs to complete (max 30 seconds)
  const timeout = 30000;
  const startTime = Date.now();

  while (activeJobs.size > 0 && Date.now() - startTime < timeout) {
    console.log(`[TranscodeWorker] Waiting for ${activeJobs.size} active jobs to complete...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (activeJobs.size > 0) {
    console.warn(`[TranscodeWorker] ${activeJobs.size} jobs still running after timeout`);
  }

  // Close queue events
  await queueEvents.close();

  console.log('[TranscodeWorker] Shutdown complete');
  process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
  try {
    const { worker, queueEvents } = await startWorker();

    // Register signal handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', worker, queueEvents));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', worker, queueEvents));

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('[TranscodeWorker] Uncaught exception:', err);
      gracefulShutdown('uncaughtException', worker, queueEvents);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('[TranscodeWorker] Unhandled rejection:', reason);
    });

    // Keep process alive
    console.log('[TranscodeWorker] Worker is running. Press Ctrl+C to stop.');
  } catch (err) {
    console.error('[TranscodeWorker] Failed to start worker:', err);
    process.exit(1);
  }
}

main();

export { startWorker };
