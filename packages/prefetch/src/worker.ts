import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createTieredCache } from './cache/tiered-cache.js';
import { createPrefetchService } from './services/prefetch-service.js';
import { createMetricsService } from './services/metrics-service.js';
import { PrefetchJob, VideoPrefetchJob } from './queues/prefetch-queue.js';

/**
 * Worker configuration
 */
const config = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  timelineServiceUrl: process.env.TIMELINE_SERVICE_URL || 'http://localhost:3002',
  authToken: process.env.PREFETCH_AUTH_TOKEN,
  concurrency: parseInt(process.env.PREFETCH_CONCURRENCY || '50'),
  defaultLimit: parseInt(process.env.PREFETCH_DEFAULT_LIMIT || '20'),
};

// Initialize services
const cache = createTieredCache(config.redisUrl);
const prefetchService = createPrefetchService(cache, {
  timelineServiceUrl: config.timelineServiceUrl,
  authToken: config.authToken,
  defaultLimit: config.defaultLimit,
});
const metricsService = createMetricsService({ redisUrl: config.redisUrl });

// Create Redis connection for workers
const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

/**
 * Timeline prefetch worker
 */
const prefetchWorker = new Worker<PrefetchJob>(
  'prefetch',
  async (job: Job<PrefetchJob>) => {
    const { userId, priority, type } = job.data;
    const startTime = Date.now();

    console.log(`Processing prefetch job: ${type} for ${userId} (${priority})`);

    try {
      if (type === 'timeline') {
        const result = await prefetchService.prefetchTimeline(userId, priority);

        metricsService.recordPrefetch(result.success, Date.now() - startTime);

        if (result.cached) {
          console.log(`Timeline for ${userId} already cached in ${result.tier}`);
        } else if (result.success) {
          console.log(
            `Prefetched ${result.postsCount} posts for ${userId} in ${result.duration}ms`
          );
        } else {
          console.error(`Failed to prefetch timeline for ${userId}: ${result.error}`);
        }

        return result;
      }

      // Other prefetch types can be added here
      return { success: false, error: `Unknown type: ${type}` };
    } catch (error) {
      metricsService.recordPrefetch(false, Date.now() - startTime);
      throw error;
    }
  },
  {
    connection,
    concurrency: config.concurrency,
  }
);

/**
 * Video segment prefetch worker
 */
const videoWorker = new Worker<VideoPrefetchJob>(
  'video-prefetch',
  async (job: Job<VideoPrefetchJob>) => {
    const { videoUri, segmentsToFetch } = job.data;

    console.log(
      `Prefetching video segments: ${videoUri} [${segmentsToFetch.join(', ')}]`
    );

    const result = await prefetchService.prefetchVideoSegments(job.data);

    console.log(
      `Video prefetch complete: ${result.success} succeeded, ${result.failed} failed`
    );

    return result;
  },
  {
    connection,
    concurrency: 10, // Lower concurrency for video segments
  }
);

// Event handlers
prefetchWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

prefetchWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

videoWorker.on('completed', (job) => {
  console.log(`Video job ${job.id} completed`);
});

videoWorker.on('failed', (job, error) => {
  console.error(`Video job ${job?.id} failed:`, error);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down prefetch workers...');

  await prefetchWorker.close();
  await videoWorker.close();
  await connection.quit();
  await cache.disconnect();
  await metricsService.disconnect();

  console.log('Workers shut down');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Periodic metrics persistence
setInterval(async () => {
  try {
    await metricsService.persistMetrics();
  } catch (error) {
    console.error('Failed to persist metrics:', error);
  }
}, 60000); // Every minute

// Start
console.log('Prefetch workers started');
console.log(`Concurrency: ${config.concurrency}`);
console.log(`Timeline service: ${config.timelineServiceUrl}`);
