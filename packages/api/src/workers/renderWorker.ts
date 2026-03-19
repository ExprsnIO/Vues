/**
 * Render Worker
 *
 * Standalone process for handling video render jobs.
 * Can be run independently to scale render capacity separately from the API.
 *
 * Usage:
 *   npx tsx src/workers/renderWorker.ts
 *
 * Environment Variables:
 *   REDIS_URL - Redis connection URL (default: redis://localhost:6379)
 *   RENDER_WORKER_CONCURRENCY - Number of concurrent jobs (default: 2)
 *   S3_BUCKET / DO_SPACES_BUCKET - Storage bucket name
 *   CDN_URL / DO_SPACES_CDN - CDN base URL
 *   FFMPEG_PATH - Path to ffmpeg binary (default: ffmpeg)
 *   FFPROBE_PATH - Path to ffprobe binary (default: ffprobe)
 *   WORKER_ID - Unique worker identifier (default: hostname)
 */

import { Worker, Job, QueueEvents, Queue } from 'bullmq';
import { hostname } from 'os';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getRedisConnection, getRedisUrl } from '../cache/redis.js';
import { uploadFileToS3, streamFromS3ToFile, getCdnUrl } from '../utils/s3.js';
import { emitRenderProgress, emitRenderComplete, emitRenderFailed, type RenderProgress } from '../websocket/renderProgress.js';
import { nanoid } from 'nanoid';

// Configuration
const REDIS_URL = getRedisUrl();
const CONCURRENCY = parseInt(process.env.RENDER_WORKER_CONCURRENCY || '2', 10);
const WORKER_ID = process.env.WORKER_ID || `render-${hostname()}-${process.pid}`;
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';
const TEMP_DIR = join(tmpdir(), 'exprsn-render');

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

console.log(`
┌─────────────────────────────────────────────────────────────┐
│                      RENDER WORKER                          │
├─────────────────────────────────────────────────────────────┤
│  Worker ID:    ${WORKER_ID.padEnd(44)}│
│  Concurrency:  ${String(CONCURRENCY).padEnd(44)}│
│  Redis:        ${REDIS_URL.slice(0, 44).padEnd(44)}│
│  Temp Dir:     ${TEMP_DIR.slice(0, 44).padEnd(44)}│
└─────────────────────────────────────────────────────────────┘
`);

// Redis connection options for BullMQ
const redisConnection = getRedisConnection();

// Track active jobs for graceful shutdown
const activeJobs = new Map<string, Job<RenderJobData>>();

// Job data interface
export interface RenderJobData {
  jobId: string;
  projectId: string;
  userDid: string;
  inputKey: string;
  config: {
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
  };
}

// Resolution to dimensions mapping
const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

// Quality to CRF mapping (lower = better quality)
const QUALITY_CRF: Record<string, number> = {
  low: 28,
  medium: 23,
  high: 18,
  ultra: 14,
};

/**
 * Initialize and start the worker
 */
async function startWorker() {
  console.log('[RenderWorker] Starting worker...');

  // Create the render queue
  const renderQueue = new Queue<RenderJobData>('render-jobs', {
    connection: redisConnection,
  });

  // Create the worker
  const worker = new Worker<RenderJobData>(
    'render-jobs',
    async (job) => {
      activeJobs.set(job.id!, job);
      console.log(`[RenderWorker] Processing job ${job.id}: ${job.data.projectId}`);

      try {
        await processRenderJob(job);
        console.log(`[RenderWorker] Job ${job.id} completed successfully`);
        return { success: true };
      } catch (error) {
        const err = error as Error;
        console.error(`[RenderWorker] Job ${job.id} failed:`, err.message);
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
    console.log(`[RenderWorker] ✓ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[RenderWorker] ✗ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[RenderWorker] Worker error:', err.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[RenderWorker] Job ${jobId} stalled`);
  });

  // Listen for queue events
  const queueEvents = new QueueEvents('render-jobs', {
    connection: redisConnection,
  });

  queueEvents.on('waiting', ({ jobId }) => {
    console.log(`[RenderWorker] Job ${jobId} waiting in queue`);
  });

  queueEvents.on('active', ({ jobId }) => {
    console.log(`[RenderWorker] Job ${jobId} is now active`);
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    const progress = data as unknown as { phase?: string; percent?: number; message?: string };
    console.log(
      `[RenderWorker] Job ${jobId} progress: ${progress.phase} - ${progress.percent}% - ${progress.message || ''}`
    );
  });

  console.log('[RenderWorker] Worker started successfully');
  console.log(`[RenderWorker] Listening for jobs on queue: render-jobs`);

  return { worker, queueEvents, queue: renderQueue };
}

/**
 * Process a single render job
 */
async function processRenderJob(job: Job<RenderJobData>): Promise<void> {
  const { jobId, projectId, userDid, inputKey, config } = job.data;
  const workDir = join(TEMP_DIR, jobId);

  try {
    // Create work directory
    mkdirSync(workDir, { recursive: true });

    // Update job status
    await updateJobStatus(jobId, 'rendering', 0, 'preparing');
    emitRenderProgress({
      jobId,
      status: 'rendering',
      progress: 0,
      currentStep: 'Preparing...',
    });

    // Download source file
    await job.updateProgress({ phase: 'downloading', percent: 5 });
    emitRenderProgress({
      jobId,
      status: 'rendering',
      progress: 5,
      currentStep: 'Downloading source file...',
    });

    const inputPath = join(workDir, 'input.mp4');
    await streamFromS3ToFile(inputKey, inputPath);

    // Probe input file
    const probeData = await probeVideo(inputPath);
    const duration = parseFloat(probeData.format?.duration || '0');

    // Build FFmpeg command
    const resolution: { width: number; height: number } = RESOLUTION_MAP[config.resolution] || { width: 1920, height: 1080 };
    const outputPath = join(workDir, `output.${config.format}`);
    const thumbnailPath = join(workDir, 'thumbnail.jpg');

    const ffmpegArgs = buildFFmpegArgs(inputPath, outputPath, config, resolution);

    // Run FFmpeg
    await job.updateProgress({ phase: 'rendering', percent: 10 });
    emitRenderProgress({
      jobId,
      status: 'rendering',
      progress: 10,
      currentStep: 'Rendering video...',
    });

    await runFFmpeg(ffmpegArgs, jobId, duration);

    // Generate thumbnail
    await job.updateProgress({ phase: 'thumbnail', percent: 85 });
    emitRenderProgress({
      jobId,
      status: 'rendering',
      progress: 85,
      currentStep: 'Generating thumbnail...',
    });

    await generateThumbnail(inputPath, thumbnailPath, duration);

    // Upload outputs
    await job.updateProgress({ phase: 'uploading', percent: 90 });
    emitRenderProgress({
      jobId,
      status: 'uploading',
      progress: 90,
      currentStep: 'Uploading files...',
    });

    const outputKey = `renders/${userDid}/${jobId}/output.${config.format}`;

    await uploadFileToS3(outputPath, outputKey);
    await uploadFileToS3(thumbnailPath, `renders/${userDid}/${jobId}/thumbnail.jpg`);

    // Get file stats
    const { statSync } = await import('fs');
    const outputStats = statSync(outputPath);
    const outputSize = outputStats.size;

    // Finalize
    await job.updateProgress({ phase: 'finalizing', percent: 95 });
    emitRenderProgress({
      jobId,
      status: 'rendering',
      progress: 95,
      currentStep: 'Finalizing...',
    });

    // Update database
    await db
      .update(schema.renderJobs)
      .set({
        status: 'completed',
        progress: 100,
        outputUrl: getCdnUrl(outputKey),
        outputKey,
        outputSize,
        duration: Math.round(duration),
        renderCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    // Emit completion
    emitRenderComplete({
      jobId,
      projectId,
      userDid,
      status: 'completed',
      progress: 100,
      outputUrl: getCdnUrl(outputKey),
      outputKey,
      fileSize: outputSize,
      duration: Math.round(duration),
    });

    await job.updateProgress({ phase: 'complete', percent: 100 });

  } catch (error) {
    const err = error as Error;

    // Update database with failure
    await db
      .update(schema.renderJobs)
      .set({
        status: 'failed',
        errorMessage: err.message,
        renderCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, jobId));

    // Emit failure
    emitRenderFailed({
      jobId,
      projectId,
      userDid,
      status: 'failed',
      progress: 0,
      error: err.message,
    });

    throw error;
  } finally {
    // Cleanup work directory
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      console.warn(`[RenderWorker] Failed to cleanup ${workDir}`);
    }
  }
}

/**
 * Update job status in database
 */
async function updateJobStatus(
  jobId: string,
  status: string,
  progress: number,
  currentStep: string
): Promise<void> {
  await db
    .update(schema.renderJobs)
    .set({
      status,
      progress,
      currentStep,
      updatedAt: new Date(),
    })
    .where(eq(schema.renderJobs.id, jobId));
}

/**
 * Probe video file for metadata
 */
async function probeVideo(inputPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ];

    const proc = spawn(FFPROBE_PATH, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error('Failed to parse ffprobe output'));
        }
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Build FFmpeg arguments
 */
function buildFFmpegArgs(
  inputPath: string,
  outputPath: string,
  config: RenderJobData['config'],
  resolution: { width: number; height: number }
): string[] {
  const args: string[] = [
    '-y', // Overwrite output
    '-i', inputPath,
  ];

  // Time trimming
  if (config.startTime !== undefined) {
    args.push('-ss', String(config.startTime));
  }
  if (config.endTime !== undefined) {
    args.push('-to', String(config.endTime));
  }

  // Video filters
  const filters: string[] = [];

  // Scale to target resolution
  filters.push(`scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease`);
  filters.push(`pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2`);

  // FPS
  filters.push(`fps=${config.fps}`);

  // Watermark
  if (config.watermark?.text) {
    const positions: Record<string, string> = {
      'top-left': 'x=10:y=10',
      'top-right': 'x=w-tw-10:y=10',
      'bottom-left': 'x=10:y=h-th-10',
      'bottom-right': 'x=w-tw-10:y=h-th-10',
      'center': 'x=(w-tw)/2:y=(h-th)/2',
    };
    const pos = positions[config.watermark.position] || positions['bottom-right'];
    filters.push(
      `drawtext=text='${config.watermark.text}':fontsize=24:fontcolor=white@${config.watermark.opacity}:${pos}`
    );
  }

  // Apply effects
  if (config.effects?.length) {
    for (const effect of config.effects) {
      switch (effect.type) {
        case 'blur':
          filters.push(`boxblur=${effect.params.strength || 5}`);
          break;
        case 'grayscale':
          filters.push('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3');
          break;
        case 'sepia':
          filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
          break;
        case 'brightness':
          filters.push(`eq=brightness=${effect.params.value || 0}`);
          break;
        case 'contrast':
          filters.push(`eq=contrast=${effect.params.value || 1}`);
          break;
        case 'saturation':
          filters.push(`eq=saturation=${effect.params.value || 1}`);
          break;
      }
    }
  }

  args.push('-vf', filters.join(','));

  // Codec settings
  if (config.format === 'mp4') {
    args.push('-c:v', config.codec || 'libx264');
    args.push('-preset', 'medium');
    args.push('-crf', String(QUALITY_CRF[config.quality]));
    args.push('-c:a', 'aac');
    args.push('-b:a', `${config.audioBitrate || 128}k`);
    args.push('-movflags', '+faststart');
  } else if (config.format === 'webm') {
    args.push('-c:v', 'libvpx-vp9');
    args.push('-crf', String(QUALITY_CRF[config.quality]));
    args.push('-b:v', '0');
    args.push('-c:a', 'libopus');
    args.push('-b:a', `${config.audioBitrate || 128}k`);
  } else if (config.format === 'mov') {
    args.push('-c:v', 'prores_ks');
    args.push('-profile:v', '3');
    args.push('-c:a', 'pcm_s16le');
  }

  // Video bitrate override
  if (config.videoBitrate) {
    args.push('-b:v', `${config.videoBitrate}k`);
  }

  args.push(outputPath);

  return args;
}

/**
 * Run FFmpeg with progress reporting
 */
async function runFFmpeg(args: string[], jobId: string, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, ['-progress', 'pipe:1', ...args]);
    let stderr = '';
    let lastPercent = 10;

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time_ms=')) {
          const outTimeMs = parseInt(line.split('=')[1] || '0', 10);
          const outTimeSec = outTimeMs / 1000000;
          const percent = Math.min(85, 10 + Math.round((outTimeSec / duration) * 75));

          if (percent > lastPercent) {
            lastPercent = percent;
            emitRenderProgress({
              jobId,
              status: 'rendering',
              progress: percent,
              currentStep: 'Encoding video...',
              currentTime: outTimeSec,
              totalTime: duration,
            });
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Generate thumbnail from video
 */
async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  const seekTime = Math.min(duration * 0.1, 5); // 10% into video or 5s, whichever is less

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(seekTime),
      '-i', inputPath,
      '-vframes', '1',
      '-vf', 'scale=640:-1',
      '-q:v', '2',
      outputPath,
    ];

    const proc = spawn(FFMPEG_PATH, args);
    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Thumbnail generation failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(
  signal: string,
  worker: { close: () => Promise<void> },
  queueEvents: { close: () => Promise<void> }
) {
  console.log(`\n[RenderWorker] ${signal} received. Initiating graceful shutdown...`);

  // Stop accepting new jobs
  console.log('[RenderWorker] Stopping job acceptance...');
  await worker.close();

  // Wait for active jobs to complete (max 30 seconds)
  const timeout = 30000;
  const startTime = Date.now();

  while (activeJobs.size > 0 && Date.now() - startTime < timeout) {
    console.log(`[RenderWorker] Waiting for ${activeJobs.size} active jobs to complete...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (activeJobs.size > 0) {
    console.warn(`[RenderWorker] ${activeJobs.size} jobs still running after timeout`);
  }

  // Close queue events
  await queueEvents.close();

  console.log('[RenderWorker] Shutdown complete');
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
      console.error('[RenderWorker] Uncaught exception:', err);
      gracefulShutdown('uncaughtException', worker, queueEvents);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('[RenderWorker] Unhandled rejection:', reason);
    });

    // Keep process alive
    console.log('[RenderWorker] Worker is running. Press Ctrl+C to stop.');
  } catch (err) {
    console.error('[RenderWorker] Failed to start worker:', err);
    process.exit(1);
  }
}

main();

export { startWorker };
