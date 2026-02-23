import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { nanoid } from 'nanoid';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

import { HealthServer } from './health.js';
import { WorkerRegistry } from './registry.js';
import { RenderProcessor, RenderJobData, RenderProgress } from './processor.js';

// Define renderJobs table schema locally for updates
const renderJobs = pgTable('render_jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('pending'),
  progress: integer('progress').default(0),
  workerId: text('worker_id'),
  workerStartedAt: timestamp('worker_started_at'),
  completedAt: timestamp('completed_at'),
  actualDurationSeconds: integer('actual_duration_seconds'),
  outputUrl: text('output_url'),
  fileSize: integer('file_size'),
  error: text('error'),
  metadata: jsonb('metadata'),
});

// Configuration
const config = {
  workerId: process.env.WORKER_ID || `worker-${nanoid(8)}`,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  healthPort: parseInt(process.env.HEALTH_PORT || '3100', 10),
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '15000', 10),
  gracefulShutdownTimeout: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000', 10),
  gpuEnabled: process.env.GPU_ENABLED === 'true',
  gpuModel: process.env.GPU_MODEL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  databaseUrl: process.env.DATABASE_URL || '',
  queueName: process.env.QUEUE_NAME || 'render-jobs',
};

// Global references for cleanup
let worker: Worker | null = null;
let healthServer: HealthServer | null = null;
let registry: WorkerRegistry | null = null;
let redis: Redis | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let isShuttingDown = false;

async function updateJobStatus(
  jobId: string,
  status: string,
  updates: Record<string, unknown> = {}
): Promise<void> {
  if (!db) return;

  await db
    .update(renderJobs)
    .set({ status, ...updates })
    .where(eq(renderJobs.id, jobId));
}

async function processRenderJob(job: Job<RenderJobData>): Promise<void> {
  const { data } = job;
  const startTime = Date.now();

  console.log(`Processing render job ${data.jobId} for project ${data.projectId}`);

  // Update health stats
  healthServer?.incrementActiveJobs();
  await registry?.incrementActiveJobs();

  // Update job status to rendering
  await updateJobStatus(data.jobId, 'rendering', {
    workerId: config.workerId,
    workerStartedAt: new Date(),
  });

  const processor = new RenderProcessor({
    ffmpegPath: process.env.FFMPEG_PATH,
    ffprobePath: process.env.FFPROBE_PATH,
    outputDir: process.env.RENDER_OUTPUT_DIR,
    tempDir: process.env.RENDER_TEMP_DIR,
  });

  // Progress callback
  const onProgress = async (progress: RenderProgress) => {
    // Update job progress in BullMQ
    await job.updateProgress(Math.floor(progress.percent));

    // Update database progress
    await updateJobStatus(data.jobId, 'rendering', {
      progress: Math.floor(progress.percent),
    });
  };

  try {
    const result = await processor.process(data, onProgress);

    if (result.success) {
      await updateJobStatus(data.jobId, 'completed', {
        completedAt: new Date(),
        outputUrl: result.outputPath,
        fileSize: result.fileSize,
        actualDurationSeconds: result.duration,
        progress: 100,
      });

      console.log(`Render job ${data.jobId} completed successfully`);
      healthServer?.incrementProcessed();
      await registry?.incrementProcessed();
    } else {
      throw new Error(result.error || 'Unknown render error');
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    await updateJobStatus(data.jobId, 'failed', {
      error: errorMessage,
      actualDurationSeconds: Math.floor((Date.now() - startTime) / 1000),
    });

    console.error(`Render job ${data.jobId} failed:`, errorMessage);
    healthServer?.incrementFailed();
    await registry?.incrementFailed();

    throw err;
  } finally {
    healthServer?.decrementActiveJobs();
    await registry?.decrementActiveJobs();
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}, starting graceful shutdown...`);

  // Set draining status
  healthServer?.setDraining();
  await registry?.setDraining();

  // Stop accepting new jobs
  if (worker) {
    console.log('Pausing worker to complete active jobs...');
    await worker.pause();

    // Wait for active jobs to complete using health server tracking
    const activeCount = healthServer?.getStatus().activeJobs || 0;
    if (activeCount > 0) {
      console.log(`Waiting for ${activeCount} active jobs to complete...`);

      // Wait with timeout
      const deadline = Date.now() + config.gracefulShutdownTimeout;
      while (Date.now() < deadline) {
        const count = healthServer?.getStatus().activeJobs || 0;
        if (count === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log('Closing worker...');
    await worker.close();
  }

  // Deregister from database
  await registry?.deregister();

  // Stop health server
  healthServer?.stop();

  // Close Redis connection
  if (redis) {
    await redis.quit();
  }

  console.log('Graceful shutdown complete');
  process.exit(0);
}

async function main(): Promise<void> {
  console.log(`Starting render worker ${config.workerId}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`GPU enabled: ${config.gpuEnabled}`);

  // Validate configuration
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Initialize Redis connection
  redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // Initialize database connection
  const pgClient = postgres(config.databaseUrl);
  db = drizzle(pgClient);

  // Initialize health server
  healthServer = new HealthServer(config.workerId);
  healthServer.start(config.healthPort);

  // Initialize worker registry
  registry = new WorkerRegistry(config.databaseUrl, {
    id: config.workerId,
    concurrency: config.concurrency,
    gpuEnabled: config.gpuEnabled,
    gpuModel: config.gpuModel,
  });

  await registry.register();
  registry.startHeartbeat(config.heartbeatInterval);

  // Initialize BullMQ worker
  worker = new Worker<RenderJobData>(
    config.queueName,
    async (job) => {
      await processRenderJob(job);
    },
    {
      connection: {
        host: new URL(config.redisUrl).hostname || 'localhost',
        port: parseInt(new URL(config.redisUrl).port || '6379', 10),
      },
      concurrency: config.concurrency,
      limiter: {
        max: config.concurrency,
        duration: 1000,
      },
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`Job ${jobId} stalled`);
  });

  // Setup signal handlers for graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  console.log(`Worker ${config.workerId} ready and listening for jobs on queue: ${config.queueName}`);
}

main().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
