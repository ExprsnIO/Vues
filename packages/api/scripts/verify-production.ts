/**
 * Production Readiness Verification Script
 *
 * A read-only check that verifies the instance is healthy and ready for
 * production traffic. No data is modified.
 *
 * Suitable for CI/CD pipelines, pre-deploy gates, and on-call runbooks.
 *
 * Usage:
 *   cd packages/api
 *   npx tsx scripts/verify-production.ts
 *
 * Exit codes:
 *   0  — all checks passed
 *   1  — one or more checks failed
 */

import { db } from '../src/db/index.js';
import {
  users,
  videos,
  likes,
  comments,
  follows,
  adminUsers,
  sessions,
} from '../src/db/schema.js';
import { redis } from '../src/cache/redis.js';
import { Redis } from 'ioredis';
import { eq, count, sql } from 'drizzle-orm';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Check helpers
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

function pass(name: string, detail: string): CheckResult {
  return { name, passed: true, detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, passed: false, detail };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkDatabase(): Promise<CheckResult> {
  try {
    await db.execute(sql`SELECT 1`);
    return pass('Database', 'PostgreSQL is reachable and accepting queries.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail('Database', `PostgreSQL unreachable: ${msg}`);
  }
}

async function checkSuperAdmin(): Promise<CheckResult> {
  try {
    const rows = await db
      .select({ count: count() })
      .from(adminUsers)
      .where(eq(adminUsers.role, 'super_admin'));
    const n = Number(rows[0]?.count ?? 0);
    if (n > 0) {
      return pass('Super admin', `${n} super_admin account(s) exist.`);
    }
    return fail('Super admin', 'No super_admin found — run seed:admin before deploying.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail('Super admin', `Query failed: ${msg}`);
  }
}

async function checkRealUser(): Promise<CheckResult> {
  // At minimum there should be at least one non-demo user (e.g. rickholland)
  try {
    const rows = await db
      .select({ count: count() })
      .from(users);
    const n = Number(rows[0]?.count ?? 0);
    if (n > 0) {
      return pass('User accounts', `${n} user account(s) in database.`);
    }
    return fail('User accounts', 'No users found in the database.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail('User accounts', `Query failed: ${msg}`);
  }
}

async function checkRedis(): Promise<CheckResult> {
  if (!(redis instanceof Redis)) {
    return fail(
      'Redis',
      'REDIS_URL is not configured — the server is using an in-memory cache, ' +
        'which is not suitable for production (no persistence, no queue support).'
    );
  }

  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      return pass('Redis', 'Redis is reachable.');
    }
    return fail('Redis', `Unexpected PING response: ${pong}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail('Redis', `Redis unreachable: ${msg}`);
  }
}

async function checkStorage(): Promise<CheckResult> {
  const bucket =
    process.env.S3_BUCKET ||
    process.env.DO_SPACES_BUCKET ||
    process.env.MINIO_BUCKET ||
    'exprsn-videos';

  const endpoint =
    process.env.S3_ENDPOINT ||
    process.env.DO_SPACES_ENDPOINT ||
    process.env.MINIO_ENDPOINT;

  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID ||
    process.env.DO_SPACES_KEY ||
    process.env.MINIO_ACCESS_KEY;

  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.DO_SPACES_SECRET ||
    process.env.MINIO_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return fail(
      'Storage (S3/MinIO)',
      'Credentials not configured. Set DO_SPACES_KEY + DO_SPACES_SECRET ' +
        'or S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY.'
    );
  }

  try {
    const s3 = new S3Client({
      region: process.env.S3_REGION || process.env.DO_SPACES_REGION || 'nyc3',
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId, secretAccessKey },
    });

    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return pass('Storage (S3/MinIO)', `Bucket "${bucket}" is accessible.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail('Storage (S3/MinIO)', `Bucket "${bucket}" unreachable: ${msg}`);
  }
}

async function checkEnvironmentVariables(): Promise<CheckResult> {
  const required: string[] = [];

  // At minimum the app needs one of these to connect to the DB
  if (!process.env.DATABASE_URL) {
    required.push('DATABASE_URL (optional if localhost PostgreSQL is running)');
  }

  // JWT secret for signing tokens
  if (!process.env.JWT_SECRET && !process.env.PDS_JWT_SECRET) {
    required.push('JWT_SECRET or PDS_JWT_SECRET');
  }

  if (required.length > 0) {
    return fail(
      'Environment variables',
      `Missing recommended env var(s): ${required.join(', ')}`
    );
  }

  return pass('Environment variables', 'Essential variables are present.');
}

// ---------------------------------------------------------------------------
// Summary counters (informational — never cause a failure)
// ---------------------------------------------------------------------------

async function printDataSummary(): Promise<void> {
  console.log('\n  Data summary:');

  try {
    const [userCount, videoCount, likeCount, commentCount, followCount, sessionCount] =
      await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(videos),
        db.select({ count: count() }).from(likes),
        db.select({ count: count() }).from(comments),
        db.select({ count: count() }).from(follows),
        db.select({ count: count() }).from(sessions),
      ]);

    console.log(`    Users:     ${userCount[0]?.count ?? 0}`);
    console.log(`    Videos:    ${videoCount[0]?.count ?? 0}`);
    console.log(`    Likes:     ${likeCount[0]?.count ?? 0}`);
    console.log(`    Comments:  ${commentCount[0]?.count ?? 0}`);
    console.log(`    Follows:   ${followCount[0]?.count ?? 0}`);
    console.log(`    Sessions:  ${sessionCount[0]?.count ?? 0}`);
  } catch {
    console.log('    (unable to retrieve counts — database may be unavailable)');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const separator = '='.repeat(70);
  console.log(separator);
  console.log('  EXPRSN — PRODUCTION READINESS VERIFICATION');
  console.log(separator + '\n');

  const checks = await Promise.allSettled([
    checkDatabase(),
    checkSuperAdmin(),
    checkRealUser(),
    checkRedis(),
    checkStorage(),
    checkEnvironmentVariables(),
  ]);

  const results: CheckResult[] = checks.map((c) => {
    if (c.status === 'fulfilled') return c.value;
    return fail('Unexpected error', String((c as PromiseRejectedResult).reason));
  });

  // Print individual results
  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name}`);
    console.log(`        ${r.detail}`);
  }

  await printDataSummary();

  const failedChecks = results.filter((r) => !r.passed);

  console.log('\n' + separator);
  if (failedChecks.length === 0) {
    console.log('  RESULT: All checks PASSED. Instance is production-ready.');
    console.log(separator + '\n');
    setTimeout(() => process.exit(0), 300);
  } else {
    console.log(
      `  RESULT: ${failedChecks.length} check(s) FAILED — resolve before deploying to production.`
    );
    console.log(`  Failed: ${failedChecks.map((c) => c.name).join(', ')}`);
    console.log(separator + '\n');
    setTimeout(() => process.exit(1), 300);
  }
}

main().catch((err) => {
  console.error('Unexpected fatal error:', err);
  process.exit(1);
});
