/**
 * Health Check Service
 * Provides comprehensive health checks for Kubernetes liveness/readiness probes
 * and monitoring systems.
 */

import { db } from '../../db/index.js';
import { sql } from 'drizzle-orm';
import { redis, cacheType } from '../../cache/redis.js';

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  lastChecked: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  components: {
    database: ComponentHealth;
    cache: ComponentHealth;
    storage?: ComponentHealth;
  };
}

// Track server start time for uptime calculation
const startTime = Date.now();

// Version from package.json or environment
const VERSION = process.env.npm_package_version || '0.1.0';

/**
 * Check database connectivity and response time
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const startMs = Date.now();
  try {
    // Simple query to verify database connection
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - startMs;

    return {
      status: latencyMs > 1000 ? 'degraded' : 'healthy',
      latencyMs,
      message: latencyMs > 1000 ? 'High latency' : undefined,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startMs,
      message: error instanceof Error ? error.message : 'Database connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check Redis/cache connectivity
 */
async function checkCache(): Promise<ComponentHealth> {
  const startMs = Date.now();
  try {
    // Use the cache type to determine what we're checking
    if (cacheType === 'memory') {
      return {
        status: 'healthy',
        latencyMs: 0,
        message: 'Using in-memory cache (Redis unavailable)',
        lastChecked: new Date().toISOString(),
      };
    }

    // Ping Redis
    const testKey = `health:ping:${Date.now()}`;
    await redis.set(testKey, 'pong');
    const result = await redis.get(testKey);
    await redis.del(testKey);

    const latencyMs = Date.now() - startMs;

    if (result !== 'pong') {
      return {
        status: 'degraded',
        latencyMs,
        message: 'Redis read/write verification failed',
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      status: latencyMs > 100 ? 'degraded' : 'healthy',
      latencyMs,
      message: latencyMs > 100 ? 'High latency' : undefined,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: cacheType === 'memory' ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - startMs,
      message: error instanceof Error ? error.message : 'Cache connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check S3/storage connectivity (optional)
 */
async function checkStorage(): Promise<ComponentHealth> {
  const startMs = Date.now();

  // Skip if S3 credentials not configured
  if (!process.env.DO_SPACES_KEY && !process.env.AWS_ACCESS_KEY_ID) {
    return {
      status: 'healthy',
      message: 'Storage not configured (local mode)',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    // We could add an actual S3 head bucket call here
    // For now, just verify credentials are present
    const hasCredentials = !!(
      (process.env.DO_SPACES_KEY && process.env.DO_SPACES_SECRET) ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    );

    return {
      status: hasCredentials ? 'healthy' : 'degraded',
      latencyMs: Date.now() - startMs,
      message: hasCredentials ? undefined : 'Storage credentials incomplete',
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startMs,
      message: error instanceof Error ? error.message : 'Storage check failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Perform a full health check of all components
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const [database, cache, storage] = await Promise.all([
    checkDatabase(),
    checkCache(),
    checkStorage(),
  ]);

  // Overall status is the worst component status
  const statuses = [database.status, cache.status, storage.status];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (statuses.includes('unhealthy')) {
    overallStatus = 'unhealthy';
  } else if (statuses.includes('degraded')) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    components: {
      database,
      cache,
      storage,
    },
  };
}

/**
 * Quick liveness check - is the process running?
 * Used by Kubernetes liveness probe
 */
export function checkLiveness(): { status: 'ok'; timestamp: string } {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness check - can the service accept traffic?
 * Checks database connectivity (required for request handling)
 */
export async function checkReadiness(): Promise<{
  ready: boolean;
  timestamp: string;
  checks: {
    database: boolean;
    cache: boolean;
  };
}> {
  const [database, cache] = await Promise.all([
    checkDatabase(),
    checkCache(),
  ]);

  // Service is ready if database is healthy (cache can be degraded/memory)
  const ready = database.status !== 'unhealthy';

  return {
    ready,
    timestamp: new Date().toISOString(),
    checks: {
      database: database.status !== 'unhealthy',
      cache: cache.status !== 'unhealthy',
    },
  };
}

/**
 * Get uptime in seconds
 */
export function getUptime(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

/**
 * Get version info
 */
export function getVersion(): string {
  return VERSION;
}
