import { z } from 'zod';

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const cacheTierSchema = z.object({
  ttlMs: z.number().int().positive(),
  maxKeys: z.number().int().positive(),
});

const cacheSchema = z.object({
  tiers: z.object({
    hot: cacheTierSchema,
    warm: cacheTierSchema,
    cold: cacheTierSchema,
  }),
  evictionPolicy: z.enum(['lru', 'lfu', 'ttl']),
  autoPromotion: z.boolean(),
  compression: z.object({
    enabled: z.boolean(),
    thresholdBytes: z.number().int().nonnegative(),
  }),
});

// ---------------------------------------------------------------------------
// Queue configuration
// ---------------------------------------------------------------------------

const timelineWorkerSchema = z.object({
  concurrency: z.number().int().positive(),
  retries: z.number().int().nonnegative(),
  timeoutMs: z.number().int().positive(),
  backoffType: z.enum(['exponential', 'linear']),
  baseDelayMs: z.number().int().positive(),
});

const videoWorkerSchema = z.object({
  concurrency: z.number().int().positive(),
  lookahead: z.number().int().nonnegative(),
});

const queueSchema = z.object({
  timelineWorker: timelineWorkerSchema,
  videoWorker: videoWorkerSchema,
  rateLimit: z.number().int().positive(),
  batchSize: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Strategy configuration
// ---------------------------------------------------------------------------

const activitySchema = z.object({
  checkIntervalMs: z.number().int().positive(),
  inactivityTimeoutMs: z.number().int().positive(),
  fetchLimit: z.number().int().positive(),
});

const priorityBucketsSchema = z.object({
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
});

const strategySchema = z.object({
  type: z.enum(['activity', 'predictive', 'hybrid']),
  activity: activitySchema,
  priorityBuckets: priorityBucketsSchema,
  adaptiveEnabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Resilience configuration
// ---------------------------------------------------------------------------

const circuitBreakerSchema = z.object({
  enabled: z.boolean(),
  failureThreshold: z.number().int().positive(),
  resetTimeoutMs: z.number().int().positive(),
  halfOpenProbes: z.number().int().positive(),
});

const resilienceSchema = z.object({
  circuitBreaker: circuitBreakerSchema,
  metricsRetentionDays: z.number().int().positive(),
  snapshotIntervalMs: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Edge configuration
// ---------------------------------------------------------------------------

const edgeSchema = z.object({
  enabled: z.boolean(),
  replicationMode: z.enum(['push', 'pull', 'hybrid']),
  consistency: z.enum(['eventual', 'strong']),
  syncIntervalMs: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Federation configuration
// ---------------------------------------------------------------------------

const federationSchema = z.object({
  prefetchEnabled: z.boolean(),
  relaySubscriptions: z.boolean(),
  blobSync: z.boolean(),
  remotePDSCacheTTLSeconds: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Root schema
// ---------------------------------------------------------------------------

export const prefetchConfigSchema = z.object({
  enabled: z.boolean(),
  version: z.number().int().positive(),
  cache: cacheSchema,
  queue: queueSchema,
  strategy: strategySchema,
  resilience: resilienceSchema,
  edge: edgeSchema,
  federation: federationSchema,
});

/**
 * Full prefetch configuration type inferred from the Zod schema.
 */
export type PrefetchConfig = z.infer<typeof prefetchConfigSchema>;

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/**
 * Returns a sensible default configuration that aligns with the existing
 * env-var based config used in worker.ts and the constants scattered across
 * the prefetch package (concurrency 50, defaultLimit 20, 3 retries, etc.).
 */
export function getDefaultConfig(): PrefetchConfig {
  return {
    enabled: true,
    version: 1,

    cache: {
      tiers: {
        hot:  { ttlMs: 5 * 60 * 1000,  maxKeys: 10_000 },   // 5 minutes
        warm: { ttlMs: 15 * 60 * 1000, maxKeys: 50_000 },    // 15 minutes
        cold: { ttlMs: 60 * 60 * 1000, maxKeys: 200_000 },   // 1 hour
      },
      evictionPolicy: 'lru',
      autoPromotion: true,
      compression: {
        enabled: false,
        thresholdBytes: 1024,
      },
    },

    queue: {
      timelineWorker: {
        concurrency: 50,          // matches PREFETCH_CONCURRENCY default
        retries: 3,               // matches maxAttempts in prefetch-queue.ts
        timeoutMs: 30_000,
        backoffType: 'exponential',
        baseDelayMs: 2000,        // matches backoffDelay in prefetch-queue.ts
      },
      videoWorker: {
        concurrency: 10,          // matches videoWorker concurrency in worker.ts
        lookahead: 3,
      },
      rateLimit: 200,
      batchSize: 20,              // matches PREFETCH_DEFAULT_LIMIT
    },

    strategy: {
      type: 'activity',
      activity: {
        checkIntervalMs: 60_000,        // matches DEFAULT_CONFIG.checkInterval
        inactivityTimeoutMs: 300_000,    // matches DEFAULT_CONFIG.inactivityTimeout (5 min)
        fetchLimit: 20,                  // matches defaultLimit
      },
      priorityBuckets: {
        high: 10,                        // matches highPriority slice(0, 10)
        medium: 40,                      // matches mediumPriority slice(10, 50) -> 40 users
        low: 50,                         // matches lowPriority slice(50) -> remaining
      },
      adaptiveEnabled: false,
    },

    resilience: {
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 30_000,
        halfOpenProbes: 2,
      },
      metricsRetentionDays: 30,          // matches DEFAULT_CONFIG.retentionDays in metrics
      snapshotIntervalMs: 60_000,        // matches setInterval in worker.ts (every minute)
    },

    edge: {
      enabled: false,
      replicationMode: 'push',
      consistency: 'eventual',
      syncIntervalMs: 30_000,
    },

    federation: {
      prefetchEnabled: true,
      relaySubscriptions: true,
      blobSync: true,
      remotePDSCacheTTLSeconds: 300,     // 5 minutes, matches hot tier TTL
    },
  };
}
