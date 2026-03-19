import { Hono } from 'hono';
import { z } from 'zod';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { redis, cacheType } from '../cache/redis.js';
import { getRedisUrl } from '../cache/redis.js';
import { Queue } from 'bullmq';

const router = new Hono();

// Apply admin auth to all routes
router.use('*', adminAuthMiddleware);

// ─── Zod Schemas (duplicated from @exprsn/prefetch to avoid cross-package dep) ───

const cacheTierSchema = z.object({
  ttlMs: z.number().min(1000).max(86400000),
  maxKeys: z.number().min(100).max(10000000),
});

const prefetchConfigSchema = z.object({
  enabled: z.boolean(),
  version: z.number(),
  cache: z.object({
    tiers: z.object({
      hot: cacheTierSchema,
      warm: cacheTierSchema,
      cold: cacheTierSchema,
    }),
    evictionPolicy: z.enum(['lru', 'lfu', 'ttl']),
    autoPromotion: z.boolean(),
    compression: z.object({
      enabled: z.boolean(),
      threshold: z.number().min(0),
    }),
  }),
  queue: z.object({
    timelineWorker: z.object({
      concurrency: z.number().min(1).max(500),
      retries: z.number().min(0).max(10),
      timeoutMs: z.number().min(1000).max(300000),
      backoffType: z.enum(['exponential', 'linear']),
      baseDelayMs: z.number().min(100).max(60000),
    }),
    videoWorker: z.object({
      concurrency: z.number().min(1).max(100),
      lookahead: z.number().min(1).max(20),
    }),
    rateLimit: z.number().min(1).max(10000),
    batchSize: z.number().min(1).max(1000),
  }),
  strategy: z.object({
    type: z.enum(['activity', 'predictive', 'hybrid']),
    activity: z.object({
      checkIntervalMs: z.number().min(1000).max(600000),
      inactivityTimeoutMs: z.number().min(10000).max(3600000),
      fetchLimit: z.number().min(1).max(200),
    }),
    priorityBuckets: z.object({
      high: z.number().min(1),
      medium: z.number().min(1),
      low: z.number().min(1),
    }),
    adaptiveEnabled: z.boolean(),
  }),
  resilience: z.object({
    circuitBreaker: z.object({
      enabled: z.boolean(),
      failureThreshold: z.number().min(1).max(100),
      resetTimeoutMs: z.number().min(1000).max(300000),
      halfOpenProbes: z.number().min(1).max(10),
    }),
    metricsRetentionDays: z.number().min(1).max(365),
    snapshotIntervalMs: z.number().min(5000).max(3600000),
  }),
  edge: z.object({
    enabled: z.boolean(),
    replicationMode: z.enum(['push', 'pull', 'hybrid']),
    consistency: z.enum(['eventual', 'strong']),
    syncIntervalMs: z.number().min(1000).max(3600000),
  }),
  federation: z.object({
    prefetchEnabled: z.boolean(),
    relaySubscriptions: z.boolean(),
    blobSync: z.boolean(),
    remotePDSCacheTTL: z.number().min(60).max(86400),
  }),
});

type PrefetchConfig = z.infer<typeof prefetchConfigSchema>;

const CONFIG_KEY = 'prefetch:config';
const RULES_KEY = 'prefetch:rules';
const ALERTS_KEY = 'prefetch:alerts';
const LOGS_KEY = 'prefetch:logs';

function getDefaultConfig(): PrefetchConfig {
  return {
    enabled: true,
    version: 1,
    cache: {
      tiers: {
        hot: { ttlMs: 300000, maxKeys: 50000 },
        warm: { ttlMs: 900000, maxKeys: 200000 },
        cold: { ttlMs: 3600000, maxKeys: 1000000 },
      },
      evictionPolicy: 'lru',
      autoPromotion: true,
      compression: { enabled: false, threshold: 1024 },
    },
    queue: {
      timelineWorker: {
        concurrency: 50,
        retries: 3,
        timeoutMs: 30000,
        backoffType: 'exponential',
        baseDelayMs: 2000,
      },
      videoWorker: { concurrency: 10, lookahead: 3 },
      rateLimit: 1000,
      batchSize: 100,
    },
    strategy: {
      type: 'activity',
      activity: {
        checkIntervalMs: 60000,
        inactivityTimeoutMs: 300000,
        fetchLimit: 20,
      },
      priorityBuckets: { high: 10, medium: 40, low: 50 },
      adaptiveEnabled: false,
    },
    resilience: {
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        halfOpenProbes: 3,
      },
      metricsRetentionDays: 30,
      snapshotIntervalMs: 60000,
    },
    edge: {
      enabled: false,
      replicationMode: 'push',
      consistency: 'eventual',
      syncIntervalMs: 30000,
    },
    federation: {
      prefetchEnabled: false,
      relaySubscriptions: false,
      blobSync: false,
      remotePDSCacheTTL: 3600,
    },
  };
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(
        (target[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      );
    } else if (source[key] !== undefined) {
      output[key] = source[key];
    }
  }
  return output;
}

// ─── Rule schema ───

const ruleConditionSchema = z.object({
  type: z.string(),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'between']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]),
});

const ruleActionSchema = z.object({
  type: z.string(),
  params: z.record(z.unknown()),
});

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  logic: z.enum(['and', 'or']).default('and'),
  conditions: z.array(ruleConditionSchema).min(1),
  actions: z.array(ruleActionSchema).min(1),
});

const updateRuleSchema = createRuleSchema.partial();

// ─── Alert schema ───

const createAlertSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  metric: z.string().min(1),
  condition: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
  threshold: z.number(),
  severity: z.enum(['info', 'warning', 'critical']),
  channels: z.array(z.enum(['dashboard', 'email', 'slack', 'webhook'])).min(1),
  enabled: z.boolean().default(true),
  cooldownMinutes: z.number().min(1).max(1440).default(15),
});

const updateAlertSchema = createAlertSchema.partial();

// ═══════════════════════════════════════
// CONFIG ENDPOINTS
// ═══════════════════════════════════════

router.get(
  '/io.exprsn.admin.prefetch.config',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const raw = await redis.get(CONFIG_KEY);
    if (!raw) {
      return c.json({ config: getDefaultConfig() });
    }

    try {
      const parsed = JSON.parse(raw);
      const result = prefetchConfigSchema.safeParse(parsed);
      if (result.success) {
        return c.json({ config: result.data });
      }
      return c.json({ config: getDefaultConfig() });
    } catch {
      return c.json({ config: getDefaultConfig() });
    }
  }
);

router.put(
  '/io.exprsn.admin.prefetch.config',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json();

    // Get current config
    const raw = await redis.get(CONFIG_KEY);
    let current: PrefetchConfig;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const result = prefetchConfigSchema.safeParse(parsed);
        current = result.success ? result.data : getDefaultConfig();
      } catch {
        current = getDefaultConfig();
      }
    } else {
      current = getDefaultConfig();
    }

    // Deep merge with updates
    const merged = deepMerge(
      current as unknown as Record<string, unknown>,
      body as Record<string, unknown>
    );

    const validation = prefetchConfigSchema.safeParse(merged);
    if (!validation.success) {
      return c.json(
        { error: 'Invalid configuration', details: validation.error.flatten() },
        400
      );
    }

    await redis.set(CONFIG_KEY, JSON.stringify(validation.data));

    // Push log entry
    const logEntry = JSON.stringify({
      level: 'info',
      message: 'Configuration updated',
      timestamp: new Date().toISOString(),
      source: 'admin-api',
      metadata: { updatedBy: c.get('did') },
    });
    if (cacheType === 'redis') {
      await (redis as any).lpush(LOGS_KEY, logEntry);
      await (redis as any).ltrim(LOGS_KEY, 0, 499);
    }

    return c.json({ config: validation.data });
  }
);

// ═══════════════════════════════════════
// HEALTH ENDPOINT
// ═══════════════════════════════════════

router.get(
  '/io.exprsn.admin.prefetch.health',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const health: Record<string, unknown> = {
      redis: { status: 'unknown' },
      queue: { status: 'unknown' },
      timestamp: new Date().toISOString(),
    };

    // Check Redis
    try {
      if (cacheType === 'redis') {
        const pong = await (redis as any).ping();
        health.redis = { status: pong === 'PONG' ? 'healthy' : 'degraded' };
      } else {
        health.redis = { status: 'fallback', type: 'memory' };
      }
    } catch {
      health.redis = { status: 'unhealthy' };
    }

    // Check BullMQ queues
    try {
      if (cacheType === 'redis') {
        const redisUrl = getRedisUrl();
        const queue = new Queue('prefetch', {
          connection: { url: redisUrl },
        });
        const [waiting, active, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getFailedCount(),
        ]);
        health.queue = {
          status: 'healthy',
          waiting,
          active,
          failed,
        };
        await queue.close();
      } else {
        health.queue = { status: 'unavailable', reason: 'no redis' };
      }
    } catch {
      health.queue = { status: 'unhealthy' };
    }

    const isHealthy =
      (health.redis as any).status === 'healthy' &&
      ((health.queue as any).status === 'healthy' || (health.queue as any).status === 'unavailable');

    return c.json({
      healthy: isHealthy,
      components: health,
    });
  }
);

// ═══════════════════════════════════════
// METRICS ENDPOINTS
// ═══════════════════════════════════════

router.get(
  '/io.exprsn.admin.prefetch.metrics',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const metrics: Record<string, unknown> = {
      cache: { hitRate: 0, hotHits: 0, warmHits: 0, coldHits: 0, misses: 0 },
      prefetch: { totalJobs: 0, successful: 0, failed: 0, avgDuration: 0 },
      queue: { waiting: 0, active: 0, completed: 0, failed: 0 },
    };

    try {
      // Read latest aggregate from metrics DB (DB 3)
      const today = new Date().toISOString().split('T')[0];
      const metricsKey = `metrics:${today}`;

      if (cacheType === 'redis') {
        // Create a separate connection for DB 3
        const { Redis: IORedis } = await import('ioredis');
        const redisUrl = getRedisUrl();
        const metricsRedis = new IORedis(redisUrl, { db: 3 });

        try {
          const aggregate = await metricsRedis.hget(metricsKey, 'aggregate');
          if (aggregate) {
            const parsed = JSON.parse(aggregate);
            metrics.cache = parsed.cache || metrics.cache;
            metrics.prefetch = parsed.prefetch || metrics.prefetch;
          }
        } finally {
          await metricsRedis.quit();
        }

        // Get queue stats from BullMQ
        const queue = new Queue('prefetch', {
          connection: { url: getRedisUrl() },
        });
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);
        metrics.queue = { waiting, active, completed, failed };
        await queue.close();
      }
    } catch (err) {
      console.error('Failed to fetch prefetch metrics:', err);
    }

    return c.json({ metrics, timestamp: new Date().toISOString() });
  }
);

router.get(
  '/io.exprsn.admin.prefetch.metrics.timeseries',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    if (!startDate || !endDate) {
      return c.json({ error: 'startDate and endDate query params required' }, 400);
    }

    const timeseries: Array<{ date: string; metrics: unknown }> = [];

    try {
      if (cacheType === 'redis') {
        const { Redis: IORedis } = await import('ioredis');
        const metricsRedis = new IORedis(getRedisUrl(), { db: 3 });

        try {
          const start = new Date(startDate);
          const end = new Date(endDate);

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0]!;
            const key = `metrics:${dateStr}`;
            const aggregate = await metricsRedis.hget(key, 'aggregate');

            if (aggregate) {
              timeseries.push({
                date: dateStr,
                metrics: JSON.parse(aggregate),
              });
            }
          }
        } finally {
          await metricsRedis.quit();
        }
      }
    } catch (err) {
      console.error('Failed to fetch timeseries metrics:', err);
    }

    return c.json({ timeseries });
  }
);

// ═══════════════════════════════════════
// EDGE ENDPOINT
// ═══════════════════════════════════════

router.get(
  '/io.exprsn.admin.prefetch.edge',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const raw = await redis.get(CONFIG_KEY);
    let config: PrefetchConfig;

    if (raw) {
      try {
        config = prefetchConfigSchema.parse(JSON.parse(raw));
      } catch {
        config = getDefaultConfig();
      }
    } else {
      config = getDefaultConfig();
    }

    return c.json({
      edge: config.edge,
      nodes: [], // Static in v1
    });
  }
);

// ═══════════════════════════════════════
// RULES CRUD ENDPOINTS
// ═══════════════════════════════════════

router.get(
  '/io.exprsn.admin.prefetch.rules',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const raw = await redis.get(RULES_KEY);
    const rules = raw ? JSON.parse(raw) : [];
    return c.json({ rules });
  }
);

router.post(
  '/io.exprsn.admin.prefetch.rules',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const validation = createRuleSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Invalid rule', details: validation.error.flatten() }, 400);
    }

    const raw = await redis.get(RULES_KEY);
    const rules = raw ? JSON.parse(raw) : [];

    const newRule = {
      ...validation.data,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    rules.push(newRule);
    await redis.set(RULES_KEY, JSON.stringify(rules));
    return c.json({ rule: newRule }, 201);
  }
);

router.put(
  '/io.exprsn.admin.prefetch.rules/:id',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validation = updateRuleSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Invalid rule update', details: validation.error.flatten() }, 400);
    }

    const raw = await redis.get(RULES_KEY);
    const rules = raw ? JSON.parse(raw) : [];
    const index = rules.findIndex((r: any) => r.id === id);

    if (index === -1) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    rules[index] = {
      ...rules[index],
      ...validation.data,
      updatedAt: new Date().toISOString(),
    };

    await redis.set(RULES_KEY, JSON.stringify(rules));
    return c.json({ rule: rules[index] });
  }
);

router.delete(
  '/io.exprsn.admin.prefetch.rules/:id',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const id = c.req.param('id');
    const raw = await redis.get(RULES_KEY);
    const rules = raw ? JSON.parse(raw) : [];
    const filtered = rules.filter((r: any) => r.id !== id);

    if (filtered.length === rules.length) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    await redis.set(RULES_KEY, JSON.stringify(filtered));
    return c.json({ success: true });
  }
);

router.post(
  '/io.exprsn.admin.prefetch.rules.reorder',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds)) {
      return c.json({ error: 'orderedIds must be an array' }, 400);
    }

    const raw = await redis.get(RULES_KEY);
    const rules = raw ? JSON.parse(raw) : [];
    const ruleMap = new Map(rules.map((r: any) => [r.id, r]));

    const reordered: any[] = [];
    for (const id of orderedIds) {
      const rule = ruleMap.get(id);
      if (rule) {
        reordered.push({ ...rule, priority: reordered.length });
      }
    }
    // Append unmentioned rules
    for (const rule of rules) {
      if (!orderedIds.includes(rule.id)) {
        reordered.push({ ...rule, priority: reordered.length });
      }
    }

    await redis.set(RULES_KEY, JSON.stringify(reordered));
    return c.json({ rules: reordered });
  }
);

// ═══════════════════════════════════════
// ALERTS CRUD ENDPOINTS
// ═══════════════════════════════════════

router.get(
  '/io.exprsn.admin.prefetch.alerts',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const raw = await redis.get(ALERTS_KEY);
    const alerts = raw ? JSON.parse(raw) : [];
    return c.json({ alerts });
  }
);

router.post(
  '/io.exprsn.admin.prefetch.alerts',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const validation = createAlertSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Invalid alert', details: validation.error.flatten() }, 400);
    }

    const raw = await redis.get(ALERTS_KEY);
    const alerts = raw ? JSON.parse(raw) : [];

    const newAlert = {
      ...validation.data,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    alerts.push(newAlert);
    await redis.set(ALERTS_KEY, JSON.stringify(alerts));
    return c.json({ alert: newAlert }, 201);
  }
);

router.put(
  '/io.exprsn.admin.prefetch.alerts/:id',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validation = updateAlertSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Invalid alert update', details: validation.error.flatten() }, 400);
    }

    const raw = await redis.get(ALERTS_KEY);
    const alerts = raw ? JSON.parse(raw) : [];
    const index = alerts.findIndex((a: any) => a.id === id);

    if (index === -1) {
      return c.json({ error: 'Alert not found' }, 404);
    }

    alerts[index] = {
      ...alerts[index],
      ...validation.data,
      updatedAt: new Date().toISOString(),
    };

    await redis.set(ALERTS_KEY, JSON.stringify(alerts));
    return c.json({ alert: alerts[index] });
  }
);

router.delete(
  '/io.exprsn.admin.prefetch.alerts/:id',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const id = c.req.param('id');
    const raw = await redis.get(ALERTS_KEY);
    const alerts = raw ? JSON.parse(raw) : [];
    const filtered = alerts.filter((a: any) => a.id !== id);

    if (filtered.length === alerts.length) {
      return c.json({ error: 'Alert not found' }, 404);
    }

    await redis.set(ALERTS_KEY, JSON.stringify(filtered));
    return c.json({ success: true });
  }
);

// ═══════════════════════════════════════
// LOGS ENDPOINT
// ═══════════════════════════════════════

router.get(
  '/io.exprsn.admin.prefetch.logs',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const level = c.req.query('level');
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '100', 10);

    let logs: any[] = [];

    try {
      const raw: string[] = cacheType === 'redis' ? await (redis as any).lrange(LOGS_KEY, 0, 499) : [];
      logs = raw.map((entry: string) => {
        try { return JSON.parse(entry); } catch { return null; }
      }).filter(Boolean);

      // Filter by level
      if (level) {
        logs = logs.filter((log: any) => log.level === level);
      }

      // Filter by search
      if (search) {
        const searchLower = search.toLowerCase();
        logs = logs.filter((log: any) =>
          log.message?.toLowerCase().includes(searchLower) ||
          JSON.stringify(log.metadata || {}).toLowerCase().includes(searchLower)
        );
      }

      logs = logs.slice(0, limit);
    } catch (err) {
      console.error('Failed to fetch prefetch logs:', err);
    }

    return c.json({ logs });
  }
);

// ═══════════════════════════════════════
// DOMAIN-SCOPED CONFIG ENDPOINTS
// ═══════════════════════════════════════

const DOMAIN_CONFIG_PREFIX = 'prefetch:config:domain:';

router.get(
  '/io.exprsn.admin.prefetch.config.domain',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    if (!domainId) {
      return c.json({ error: 'domainId query param required' }, 400);
    }

    const raw = await redis.get(`${DOMAIN_CONFIG_PREFIX}${domainId}`);
    if (!raw) {
      return c.json({ config: {}, hasOverrides: false });
    }

    try {
      const config = JSON.parse(raw);
      return c.json({ config, hasOverrides: Object.keys(config).length > 0 });
    } catch {
      return c.json({ config: {}, hasOverrides: false });
    }
  }
);

router.post(
  '/io.exprsn.admin.prefetch.config.domain',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const { domainId, config } = body;

    if (!domainId) {
      return c.json({ error: 'domainId is required' }, 400);
    }

    await redis.set(`${DOMAIN_CONFIG_PREFIX}${domainId}`, JSON.stringify(config || {}));

    if (cacheType === 'redis') {
      const logEntry = JSON.stringify({
        level: 'info',
        message: `Domain prefetch config updated: ${domainId}`,
        timestamp: new Date().toISOString(),
        source: 'admin-api',
        metadata: { domainId, updatedBy: c.get('did') },
      });
      await (redis as any).lpush(LOGS_KEY, logEntry);
      await (redis as any).ltrim(LOGS_KEY, 0, 499);
    }

    return c.json({ config, hasOverrides: Object.keys(config || {}).length > 0 });
  }
);

router.post(
  '/io.exprsn.admin.prefetch.config.domain.reset',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const { domainId } = body;

    if (!domainId) {
      return c.json({ error: 'domainId is required' }, 400);
    }

    await redis.del(`${DOMAIN_CONFIG_PREFIX}${domainId}`);
    return c.json({ success: true });
  }
);

// ═══════════════════════════════════════
// WORKER DOMAIN CONFIG ENDPOINTS
// Keys: workers:config:domain:{domainId}
// Settings: rateLimit, enabledQueues, priority
// ═══════════════════════════════════════

const WORKER_DOMAIN_CONFIG_PREFIX = 'workers:config:domain:';

const workerDomainConfigSchema = z.object({
  rateLimit: z.number().int().min(1).max(100000).optional(),
  enabledQueues: z
    .array(
      z.enum([
        'prefetch',
        'video-prefetch',
        'adaptive-transcode',
        'render-jobs',
        'webhook-retries',
        'stream-events',
        'directory-sync',
      ])
    )
    .optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

router.get(
  '/io.exprsn.admin.workers.domain.config',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    if (!domainId) {
      return c.json({ error: 'domainId query param required' }, 400);
    }

    const raw = await redis.get(`${WORKER_DOMAIN_CONFIG_PREFIX}${domainId}`);
    if (!raw) {
      return c.json({ domainId, config: {}, hasOverrides: false });
    }

    try {
      const config = JSON.parse(raw);
      return c.json({ domainId, config, hasOverrides: true });
    } catch {
      return c.json({ domainId, config: {}, hasOverrides: false });
    }
  }
);

router.put(
  '/io.exprsn.admin.workers.domain.config',
  requirePermission(ADMIN_PERMISSIONS.PREFETCH_MANAGE),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { domainId, config } = body;

    if (!domainId) {
      return c.json({ error: 'domainId is required' }, 400);
    }

    const validation = workerDomainConfigSchema.safeParse(config ?? {});
    if (!validation.success) {
      return c.json(
        { error: 'Invalid worker config', details: validation.error.flatten() },
        400
      );
    }

    await redis.set(
      `${WORKER_DOMAIN_CONFIG_PREFIX}${domainId}`,
      JSON.stringify(validation.data)
    );

    if (cacheType === 'redis') {
      const logEntry = JSON.stringify({
        level: 'info',
        message: `Domain worker config updated: ${domainId}`,
        timestamp: new Date().toISOString(),
        source: 'admin-api',
        metadata: { domainId, updatedBy: c.get('did') },
      });
      await (redis as any).lpush(LOGS_KEY, logEntry);
      await (redis as any).ltrim(LOGS_KEY, 0, 499);
    }

    return c.json({
      domainId,
      config: validation.data,
      hasOverrides: Object.keys(validation.data).length > 0,
    });
  }
);

export const adminPrefetchRouter = router;
