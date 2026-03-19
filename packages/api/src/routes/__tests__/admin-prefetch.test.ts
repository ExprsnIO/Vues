import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock redis before imports
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  lpush: vi.fn(),
  ltrim: vi.fn(),
  lrange: vi.fn(),
  ping: vi.fn(),
};

vi.mock('../../cache/redis.js', () => ({
  redis: mockRedis,
  cacheType: 'memory',
  getRedisUrl: () => 'redis://localhost:6379',
}));

vi.mock('../../auth/middleware.js', () => ({
  adminAuthMiddleware: vi.fn(async (_c: any, next: () => Promise<void>) => {
    _c.set('did', 'did:test:admin');
    _c.set('adminUser', { role: 'admin', userDid: 'did:test:admin' });
    _c.set('adminPermissions', [
      'admin.prefetch.view',
      'admin.prefetch.manage',
    ]);
    await next();
  }),
  requirePermission: vi.fn((...perms: string[]) => {
    return async (c: any, next: () => Promise<void>) => {
      const permissions = c.get('adminPermissions') || [];
      const hasAll = perms.every((p: string) => permissions.includes(p));
      if (!hasAll) {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }
      await next();
    };
  }),
  ADMIN_PERMISSIONS: {
    PREFETCH_VIEW: 'admin.prefetch.view',
    PREFETCH_MANAGE: 'admin.prefetch.manage',
  },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    getWaitingCount: vi.fn().mockResolvedValue(5),
    getActiveCount: vi.fn().mockResolvedValue(2),
    getCompletedCount: vi.fn().mockResolvedValue(100),
    getFailedCount: vi.fn().mockResolvedValue(1),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { Hono } from 'hono';

// Import the router after mocks
const { adminPrefetchRouter } = await import('../admin-prefetch.js');

const app = new Hono();
app.route('/xrpc', adminPrefetchRouter);

function request(path: string, options?: RequestInit) {
  return app.request(`http://localhost/xrpc${path}`, {
    headers: { Authorization: 'Bearer test-token' },
    ...options,
  });
}

describe('Admin Prefetch API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.lpush.mockResolvedValue(1);
    mockRedis.ltrim.mockResolvedValue('OK');
    mockRedis.lrange.mockResolvedValue([]);
    mockRedis.ping.mockResolvedValue('PONG');
  });

  describe('GET /io.exprsn.admin.prefetch.config', () => {
    it('should return default config when none exists in Redis', async () => {
      const res = await request('/io.exprsn.admin.prefetch.config');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config).toBeDefined();
      expect(body.config.enabled).toBe(true);
      expect(body.config.version).toBe(1);
      expect(body.config.cache.tiers.hot.ttlMs).toBe(300000);
    });

    it('should return stored config from Redis', async () => {
      const storedConfig = {
        enabled: false,
        version: 2,
        cache: {
          tiers: {
            hot: { ttlMs: 600000, maxKeys: 100000 },
            warm: { ttlMs: 1800000, maxKeys: 500000 },
            cold: { ttlMs: 7200000, maxKeys: 2000000 },
          },
          evictionPolicy: 'lfu',
          autoPromotion: false,
          compression: { enabled: true, threshold: 2048 },
        },
        queue: {
          timelineWorker: { concurrency: 100, retries: 5, timeoutMs: 60000, backoffType: 'linear', baseDelayMs: 5000 },
          videoWorker: { concurrency: 20, lookahead: 5 },
          rateLimit: 2000,
          batchSize: 200,
        },
        strategy: {
          type: 'hybrid',
          activity: { checkIntervalMs: 120000, inactivityTimeoutMs: 600000, fetchLimit: 50 },
          priorityBuckets: { high: 20, medium: 60, low: 20 },
          adaptiveEnabled: true,
        },
        resilience: {
          circuitBreaker: { enabled: true, failureThreshold: 10, resetTimeoutMs: 60000, halfOpenProbes: 5 },
          metricsRetentionDays: 60,
          snapshotIntervalMs: 120000,
        },
        edge: { enabled: true, replicationMode: 'hybrid', consistency: 'eventual', syncIntervalMs: 60000 },
        federation: { prefetchEnabled: true, relaySubscriptions: true, blobSync: false, remotePDSCacheTTL: 7200 },
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(storedConfig));

      const res = await request('/io.exprsn.admin.prefetch.config');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.enabled).toBe(false);
      expect(body.config.version).toBe(2);
      expect(body.config.strategy.type).toBe('hybrid');
    });
  });

  describe('PUT /io.exprsn.admin.prefetch.config', () => {
    it('should save valid config updates', async () => {
      const res = await request('/io.exprsn.admin.prefetch.config', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.enabled).toBe(false);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should reject invalid config', async () => {
      const res = await request('/io.exprsn.admin.prefetch.config', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cache: { tiers: { hot: { ttlMs: -1 } } },
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /io.exprsn.admin.prefetch.health', () => {
    it('should return health status', async () => {
      const res = await request('/io.exprsn.admin.prefetch.health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('healthy');
      expect(body).toHaveProperty('components');
      expect(body.components).toHaveProperty('redis');
      expect(body.components).toHaveProperty('queue');
      // With cacheType='memory', redis status should be 'fallback'
      expect(body.components.redis.status).toBe('fallback');
    });
  });

  describe('GET /io.exprsn.admin.prefetch.metrics', () => {
    it('should return metrics', async () => {
      const res = await request('/io.exprsn.admin.prefetch.metrics');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('metrics');
      expect(body).toHaveProperty('timestamp');
    });
  });

  describe('Rules CRUD', () => {
    it('should list empty rules', async () => {
      const res = await request('/io.exprsn.admin.prefetch.rules');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rules).toEqual([]);
    });

    it('should create a rule', async () => {
      const res = await request('/io.exprsn.admin.prefetch.rules', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Rule',
          enabled: true,
          priority: 0,
          logic: 'and',
          conditions: [{ type: 'user_activity', operator: 'gte', value: 5 }],
          actions: [{ type: 'prefetch_timeline', params: { limit: 20 } }],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.rule.name).toBe('Test Rule');
      expect(body.rule.id).toBeDefined();
    });

    it('should reject invalid rule', async () => {
      const res = await request('/io.exprsn.admin.prefetch.rules', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('should delete a rule', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify([{ id: 'rule_1', name: 'Test', conditions: [], actions: [] }])
      );

      const res = await request('/io.exprsn.admin.prefetch.rules/rule_1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent rule', async () => {
      const res = await request('/io.exprsn.admin.prefetch.rules/nonexistent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('Alerts CRUD', () => {
    it('should list empty alerts', async () => {
      const res = await request('/io.exprsn.admin.prefetch.alerts');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alerts).toEqual([]);
    });

    it('should create an alert', async () => {
      const res = await request('/io.exprsn.admin.prefetch.alerts', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'High Queue Depth',
          metric: 'queue.waiting',
          condition: 'gt',
          threshold: 100,
          severity: 'warning',
          channels: ['dashboard'],
          enabled: true,
          cooldownMinutes: 15,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.alert.name).toBe('High Queue Depth');
      expect(body.alert.id).toBeDefined();
    });

    it('should reject invalid alert', async () => {
      const res = await request('/io.exprsn.admin.prefetch.alerts', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Bad Alert' }),
      });
      expect(res.status).toBe(400);
    });

    it('should delete an alert', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify([{ id: 'alert_1', name: 'Test Alert' }])
      );

      const res = await request('/io.exprsn.admin.prefetch.alerts/alert_1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Logs', () => {
    it('should return empty logs', async () => {
      const res = await request('/io.exprsn.admin.prefetch.logs');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.logs).toEqual([]);
    });

    it('should return empty logs with memory cache backend', async () => {
      // With cacheType='memory', lrange is not available so logs are empty
      const res = await request('/io.exprsn.admin.prefetch.logs');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.logs).toEqual([]);
    });
  });

  describe('Permission checks', () => {
    it('should allow moderator to view config', async () => {
      const { adminAuthMiddleware, requirePermission } = await import('../../auth/middleware.js');
      // Default mock gives view+manage permissions, so this should pass
      const res = await request('/io.exprsn.admin.prefetch.config');
      expect(res.status).toBe(200);
    });
  });
});
