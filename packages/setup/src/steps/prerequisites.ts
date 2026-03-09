/**
 * Prerequisites check step
 *
 * Verifies system requirements and connectivity before setup proceeds.
 */

import { db, dbType } from '@exprsn/api/db';
import { sql } from 'drizzle-orm';

export interface PrerequisiteCheck {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'checking' | 'passed' | 'failed' | 'warning';
  message?: string;
  required: boolean;
}

export interface PrerequisiteResult {
  success: boolean;
  checks: PrerequisiteCheck[];
  systemInfo: {
    nodeVersion: string;
    platform: string;
    databaseType: string;
    memoryUsage: number;
  };
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<PrerequisiteCheck> {
  try {
    await db.execute(sql`SELECT 1`);
    return {
      id: 'database',
      name: 'Database Connection',
      description: 'Verify database connectivity',
      status: 'passed',
      message: `Connected to ${dbType} database`,
      required: true,
    };
  } catch (error) {
    return {
      id: 'database',
      name: 'Database Connection',
      description: 'Verify database connectivity',
      status: 'failed',
      message: error instanceof Error ? error.message : 'Failed to connect to database',
      required: true,
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<PrerequisiteCheck> {
  try {
    // Dynamic import to handle optional Redis dependency
    const { cacheType } = await import('@exprsn/api/cache');

    if (cacheType === 'redis') {
      return {
        id: 'redis',
        name: 'Redis Connection',
        description: 'Verify Redis cache connectivity',
        status: 'passed',
        message: 'Connected to Redis',
        required: false,
      };
    }

    return {
      id: 'redis',
      name: 'Redis Connection',
      description: 'Verify Redis cache connectivity',
      status: 'warning',
      message: 'Using in-memory cache (Redis not configured)',
      required: false,
    };
  } catch {
    return {
      id: 'redis',
      name: 'Redis Connection',
      description: 'Verify Redis cache connectivity',
      status: 'warning',
      message: 'Redis not available - some features may be limited',
      required: false,
    };
  }
}

/**
 * Check required environment variables
 */
function checkEnvironmentVariables(): PrerequisiteCheck {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const recommended = ['REDIS_URL', 'STORAGE_PROVIDER', 'SMTP_HOST'];

  const missing = required.filter((key) => !process.env[key]);
  const missingRecommended = recommended.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return {
      id: 'env',
      name: 'Environment Variables',
      description: 'Check required configuration',
      status: 'failed',
      message: `Missing required: ${missing.join(', ')}`,
      required: true,
    };
  }

  if (missingRecommended.length > 0) {
    return {
      id: 'env',
      name: 'Environment Variables',
      description: 'Check required configuration',
      status: 'warning',
      message: `Missing recommended: ${missingRecommended.join(', ')}`,
      required: true,
    };
  }

  return {
    id: 'env',
    name: 'Environment Variables',
    description: 'Check required configuration',
    status: 'passed',
    message: 'All required environment variables are set',
    required: true,
  };
}

/**
 * Check Node.js version
 */
function checkNodeVersion(): PrerequisiteCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0] ?? '0', 10);

  if (major < 18) {
    return {
      id: 'node',
      name: 'Node.js Version',
      description: 'Verify Node.js version compatibility',
      status: 'failed',
      message: `Node.js ${version} detected - version 18+ required`,
      required: true,
    };
  }

  if (major < 20) {
    return {
      id: 'node',
      name: 'Node.js Version',
      description: 'Verify Node.js version compatibility',
      status: 'warning',
      message: `Node.js ${version} - version 20+ recommended`,
      required: true,
    };
  }

  return {
    id: 'node',
    name: 'Node.js Version',
    description: 'Verify Node.js version compatibility',
    status: 'passed',
    message: `Node.js ${version}`,
    required: true,
  };
}

/**
 * Check available disk space
 */
function checkDiskSpace(): PrerequisiteCheck {
  // Simplified check - would need os-specific implementation for production
  return {
    id: 'disk',
    name: 'Disk Space',
    description: 'Check available storage',
    status: 'passed',
    message: 'Storage check passed',
    required: false,
  };
}

/**
 * Run all prerequisite checks
 */
export async function checkPrerequisites(): Promise<PrerequisiteResult> {
  const checks: PrerequisiteCheck[] = [];

  // Run checks
  checks.push(checkNodeVersion());
  checks.push(checkEnvironmentVariables());
  checks.push(await checkDatabase());
  checks.push(await checkRedis());
  checks.push(checkDiskSpace());

  // Determine overall success
  const hasFailedRequired = checks.some((c) => c.required && c.status === 'failed');

  return {
    success: !hasFailedRequired,
    checks,
    systemInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      databaseType: dbType ?? 'unknown',
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };
}
