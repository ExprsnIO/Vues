import { Worker, Job, ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { createTieredCache } from './cache/tiered-cache.js';
import { createPrefetchService } from './services/prefetch-service.js';
import { createMetricsService } from './services/metrics-service.js';
import { PrefetchJob, VideoPrefetchJob, createPrefetchQueue } from './queues/prefetch-queue.js';
import { ConfigManager } from './config/config-manager.js';
import { PrefetchConfig } from './config/schema.js';
import { DomainConfigManager } from './config/domain-config.js';
import { ActivityBasedStrategy } from './strategies/activity-based.js';

const LOGS_KEY = 'prefetch:logs';
const CONFIG_POLL_INTERVAL = 15000; // Check config every 15s

function pushLog(redis: Redis, level: string, message: string, metadata?: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    source: 'worker',
    metadata,
  });
  redis.lpush(LOGS_KEY, entry).catch(() => {});
  redis.ltrim(LOGS_KEY, 0, 499).catch(() => {});
}

// ─── Bootstrap ───

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const apiBaseUrl = process.env.API_BASE_URL || process.env.TIMELINE_SERVICE_URL || 'http://localhost:3002';
const authToken = process.env.PREFETCH_AUTH_TOKEN;

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const configRedis = new Redis(redisUrl); // Separate connection for config reads
const configManager = new ConfigManager(configRedis);
const domainConfigManager = new DomainConfigManager(configRedis);

// Load initial config
let currentConfig: PrefetchConfig = await configManager.getConfig();

console.log(`[prefetch-worker] Initial config loaded (enabled=${currentConfig.enabled})`);

// Initialize services
const cache = createTieredCache(redisUrl);
const prefetchService = createPrefetchService(cache, {
  // Use the XRPC feed endpoint instead of non-existent /api/timeline
  timelineServiceUrl: apiBaseUrl,
  authToken,
  defaultLimit: currentConfig.strategy.activity.fetchLimit,
});
const metricsService = createMetricsService({ redisUrl });

// Initialize prefetch queue for the activity strategy
const prefetchQueue = createPrefetchQueue({ redisUrl });

// Initialize activity-based strategy
let activityStrategy: ActivityBasedStrategy | null = null;

function startActivityStrategy(config: PrefetchConfig) {
  if (activityStrategy) {
    activityStrategy.stop();
  }
  if (config.strategy.type === 'activity' || config.strategy.type === 'hybrid') {
    activityStrategy = new ActivityBasedStrategy(prefetchQueue, {
      checkInterval: config.strategy.activity.checkIntervalMs,
      maxUsersPerCycle: config.strategy.activity.fetchLimit,
      inactivityTimeout: config.strategy.activity.inactivityTimeoutMs,
      activityThreshold: 1,
    }, connection);
    if (config.enabled) {
      activityStrategy.start();
      console.log('[prefetch-worker] Activity strategy started');
      pushLog(connection, 'info', 'Activity-based strategy started', {
        checkInterval: config.strategy.activity.checkIntervalMs,
      });
    }
  }
}

startActivityStrategy(currentConfig);

// ─── Config hot-reload ───

setInterval(async () => {
  try {
    const newConfig = await configManager.getConfig();
    const configChanged = JSON.stringify(newConfig) !== JSON.stringify(currentConfig);

    if (configChanged) {
      const wasEnabled = currentConfig.enabled;
      currentConfig = newConfig;

      console.log('[prefetch-worker] Config updated from Redis');
      pushLog(connection, 'info', 'Configuration reloaded from Redis', {
        enabled: newConfig.enabled,
        strategy: newConfig.strategy.type,
      });

      // Handle enable/disable transitions
      if (!wasEnabled && newConfig.enabled) {
        startActivityStrategy(newConfig);
        pushLog(connection, 'info', 'Prefetch engine enabled');
      } else if (wasEnabled && !newConfig.enabled) {
        activityStrategy?.stop();
        pushLog(connection, 'warn', 'Prefetch engine disabled');
      } else if (newConfig.enabled) {
        // Restart strategy with new params
        startActivityStrategy(newConfig);
      }
    }
  } catch (err) {
    console.error('[prefetch-worker] Failed to reload config:', err);
  }
}, CONFIG_POLL_INTERVAL);

// ─── Timeline prefetch worker ───

const prefetchWorker = new Worker<PrefetchJob>(
  'prefetch',
  async (job: Job<PrefetchJob>) => {
    // Check kill switch
    if (!currentConfig.enabled) {
      pushLog(connection, 'debug', `Skipping job ${job.id} — engine disabled`);
      return { success: false, error: 'Engine disabled' };
    }

    const { userId, priority, type } = job.data;
    const startTime = Date.now();

    // Resolve the effective config for this user, applying domain-scoped overrides
    const effectiveConfig = await domainConfigManager.getEffectiveConfig(userId, currentConfig);

    pushLog(connection, 'info', `Processing ${type} job for ${userId}`, { priority, jobId: job.id });

    try {
      if (type === 'timeline') {
        const result = await prefetchService.prefetchTimeline(
          userId,
          priority,
          effectiveConfig.queue.batchSize,
        );
        metricsService.recordPrefetch(result.success, Date.now() - startTime);

        if (result.cached) {
          pushLog(connection, 'debug', `Cache hit for ${userId}`, { tier: result.tier });
        } else if (result.success) {
          pushLog(connection, 'info', `Prefetched ${result.postsCount} posts for ${userId}`, {
            duration: result.duration,
            tier: result.tier,
          });
        } else {
          pushLog(connection, 'error', `Failed to prefetch for ${userId}: ${result.error}`);
        }

        return result;
      }

      return { success: false, error: `Unknown type: ${type}` };
    } catch (error) {
      metricsService.recordPrefetch(false, Date.now() - startTime);
      pushLog(connection, 'error', `Job failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { userId, type });
      throw error;
    }
  },
  {
    connection: connection as unknown as ConnectionOptions,
    concurrency: currentConfig.queue.timelineWorker.concurrency,
  }
);

// ─── Video segment prefetch worker ───

const videoWorker = new Worker<VideoPrefetchJob>(
  'video-prefetch',
  async (job: Job<VideoPrefetchJob>) => {
    if (!currentConfig.enabled) {
      return { success: 0, failed: 0 };
    }

    const { videoUri, segmentsToFetch } = job.data;
    pushLog(connection, 'info', `Prefetching video segments: ${videoUri}`, {
      segments: segmentsToFetch.length,
    });

    const result = await prefetchService.prefetchVideoSegments(job.data);

    pushLog(connection, 'info', `Video prefetch: ${result.success} ok, ${result.failed} failed`, {
      videoUri,
    });

    return result;
  },
  {
    connection: connection as unknown as ConnectionOptions,
    concurrency: currentConfig.queue.videoWorker.concurrency,
  }
);

// ─── Event handlers ───

prefetchWorker.on('completed', (job) => {
  console.log(`[prefetch] Job ${job.id} completed`);
});

prefetchWorker.on('failed', (job, error) => {
  console.error(`[prefetch] Job ${job?.id} failed:`, error.message);
  pushLog(connection, 'error', `Job ${job?.id} failed: ${error.message}`);
});

videoWorker.on('completed', (job) => {
  console.log(`[video-prefetch] Job ${job.id} completed`);
});

videoWorker.on('failed', (job, error) => {
  console.error(`[video-prefetch] Job ${job?.id} failed:`, error.message);
});

// ─── Graceful shutdown ───

const shutdown = async () => {
  console.log('[prefetch-worker] Shutting down...');
  pushLog(connection, 'info', 'Worker shutting down');

  activityStrategy?.stop();
  await prefetchWorker.close();
  await videoWorker.close();
  await prefetchQueue.close();
  await connection.quit();
  await configRedis.quit();
  await cache.disconnect();
  await metricsService.disconnect();

  console.log('[prefetch-worker] Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ─── Periodic metrics persistence ───

setInterval(async () => {
  try {
    await metricsService.persistMetrics();
  } catch (error) {
    console.error('[prefetch-worker] Failed to persist metrics:', error);
  }
}, currentConfig.resilience.snapshotIntervalMs);

// ─── Startup ───

pushLog(connection, 'info', 'Prefetch worker started', {
  concurrency: currentConfig.queue.timelineWorker.concurrency,
  strategy: currentConfig.strategy.type,
  enabled: currentConfig.enabled,
  apiBaseUrl,
});

console.log('[prefetch-worker] Started');
console.log(`  Enabled: ${currentConfig.enabled}`);
console.log(`  Strategy: ${currentConfig.strategy.type}`);
console.log(`  Timeline concurrency: ${currentConfig.queue.timelineWorker.concurrency}`);
console.log(`  Video concurrency: ${currentConfig.queue.videoWorker.concurrency}`);
console.log(`  API base: ${apiBaseUrl}`);
console.log(`  Config poll: every ${CONFIG_POLL_INTERVAL / 1000}s`);
