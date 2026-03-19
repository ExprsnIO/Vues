/**
 * Production Data Preparation Script
 *
 * Removes demo/test data, cleans stale artifacts, and verifies the instance
 * is ready to handle real traffic.
 *
 * Usage:
 *   cd packages/api
 *   npx tsx scripts/prepare-production.ts           # Dry run (default — safe)
 *   npx tsx scripts/prepare-production.ts --execute  # Actually delete
 *
 * What it does:
 *   1. Identifies demo users by handle pattern (see DEMO_USER_HANDLES).
 *   2. Deletes, in safe order: reactions → comment reactions → comments →
 *      likes → reposts → bookmarks → stitches → duets → shares →
 *      video-hashtags → video-views → user-interactions → videos →
 *      follows → notifications → actorRepo data → users.
 *   3. Cleans expired sessions (> 7 days old).
 *   4. Cleans BullMQ completed/failed jobs older than 24 h from Redis.
 *   5. Clears rate-limit keys from Redis.
 *   6. Clears prefetch cache keys older than 24 h.
 *   7. Verifies: super_admin exists, DB reachable, Redis reachable,
 *      S3/MinIO reachable.
 *   8. Prints a data-count summary.
 */

import { db } from '../src/db/index.js';
import {
  users,
  videos,
  likes,
  comments,
  commentReactions,
  videoReactions,
  follows,
  reposts,
  bookmarks,
  stitches,
  duets,
  shares,
  videoHashtags,
  videoViews,
  userInteractions,
  notifications,
  adminUsers,
  actorRepos,
  sessions,
} from '../src/db/schema.js';
import { redis } from '../src/cache/redis.js';
import { Redis } from 'ioredis';
import {
  eq,
  inArray,
  lt,
  or,
  count,
  sql,
} from 'drizzle-orm';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Handles that belong exclusively to demo/test accounts.
 * Sourced from: scripts/add-demo-data.ts  +  scripts/seed-timeline-data.ts
 */
const DEMO_USER_HANDLES = [
  'sarah_dev',
  'mike_designer',
  'alex_product',
  'jamie_founder',
  'taylor_growth',
  'casey_eng',
  'jordan_pm',
  'morgan_ux',
  'riley_data',
  'avery_mobile',
  'quinn_backend',
  'dakota_frontend',
  'reese_devops',
  'cameron_security',
  'skyler_ml',
  'drew_cloud',
  'charlie_api',
  'sam_ios',
  'pat_android',
  'peyton_web',
  'blake_systems',
  'sage_network',
  'phoenix_db',
  'river_qa',
  'rowan_designer',
  'kai_founder',
  'finley_growth',
  'elliott_sales',
  'sawyer_marketing',
  'harley_support',
  'oakley_analytics',
  'emerson_ops',
  'lennon_hr',
  'dakota_legal',
  'remy_finance',
];

/** Accounts that must never be deleted. */
const PROTECTED_HANDLES = ['rickholland'];
const PROTECTED_DIDS = ['did:exprsn:prefetch-worker'];

/** Sessions older than this are considered expired and will be removed. */
const SESSION_MAX_AGE_DAYS = 7;

/** BullMQ / prefetch cache entries older than this are cleaned from Redis. */
const REDIS_JOB_MAX_AGE_HOURS = 24;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const DRY_RUN = !process.argv.includes('--execute');

function log(msg: string): void {
  console.log(msg);
}

function dryLog(msg: string): void {
  console.log(`  [DRY RUN] ${msg}`);
}

// ---------------------------------------------------------------------------
// Step 1 — resolve demo user DIDs
// ---------------------------------------------------------------------------

async function resolveDemoDids(): Promise<string[]> {
  log('\n--- Step 1: Resolving demo user DIDs ---');

  const rows = await db
    .select({ did: users.did, handle: users.handle })
    .from(users)
    .where(inArray(users.handle, DEMO_USER_HANDLES));

  // Safety: never include protected handles or DIDs
  const dids = rows
    .filter(
      (r) =>
        !PROTECTED_HANDLES.includes(r.handle) &&
        !PROTECTED_DIDS.includes(r.did)
    )
    .map((r) => r.did);

  log(`  Found ${dids.length} demo user(s) in the database (out of ${DEMO_USER_HANDLES.length} known handles).`);
  return dids;
}

// ---------------------------------------------------------------------------
// Step 2 — delete demo user content (safe ordering)
// ---------------------------------------------------------------------------

async function deleteDemoUserContent(demoDids: string[]): Promise<void> {
  log('\n--- Step 2: Removing demo user content ---');

  if (demoDids.length === 0) {
    log('  No demo users found — nothing to delete.');
    return;
  }

  // --- Video reactions (reference videos which reference users) ---
  const videoReactionCount = await db
    .select({ count: count() })
    .from(videoReactions)
    .where(inArray(videoReactions.authorDid, demoDids));
  const vrCount = Number(videoReactionCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${vrCount} video reactions from demo users.`);
  } else {
    if (vrCount > 0) {
      await db.delete(videoReactions).where(inArray(videoReactions.authorDid, demoDids));
    }
    log(`  Deleted ${vrCount} video reactions.`);
  }

  // --- Comment reactions ---
  const crCount = await db
    .select({ count: count() })
    .from(commentReactions)
    .where(inArray(commentReactions.authorDid, demoDids));
  const crNum = Number(crCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${crNum} comment reactions from demo users.`);
  } else {
    if (crNum > 0) {
      await db.delete(commentReactions).where(inArray(commentReactions.authorDid, demoDids));
    }
    log(`  Deleted ${crNum} comment reactions.`);
  }

  // --- Comments ---
  const commCount = await db
    .select({ count: count() })
    .from(comments)
    .where(inArray(comments.authorDid, demoDids));
  const commNum = Number(commCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${commNum} comments from demo users.`);
  } else {
    if (commNum > 0) {
      await db.delete(comments).where(inArray(comments.authorDid, demoDids));
    }
    log(`  Deleted ${commNum} comments.`);
  }

  // --- Likes ---
  const likeCount = await db
    .select({ count: count() })
    .from(likes)
    .where(inArray(likes.authorDid, demoDids));
  const likeNum = Number(likeCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${likeNum} likes from demo users.`);
  } else {
    if (likeNum > 0) {
      await db.delete(likes).where(inArray(likes.authorDid, demoDids));
    }
    log(`  Deleted ${likeNum} likes.`);
  }

  // --- Reposts ---
  const repostCount = await db
    .select({ count: count() })
    .from(reposts)
    .where(inArray(reposts.authorDid, demoDids));
  const repostNum = Number(repostCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${repostNum} reposts from demo users.`);
  } else {
    if (repostNum > 0) {
      await db.delete(reposts).where(inArray(reposts.authorDid, demoDids));
    }
    log(`  Deleted ${repostNum} reposts.`);
  }

  // --- Bookmarks ---
  const bookmarkCount = await db
    .select({ count: count() })
    .from(bookmarks)
    .where(inArray(bookmarks.authorDid, demoDids));
  const bookmarkNum = Number(bookmarkCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${bookmarkNum} bookmarks from demo users.`);
  } else {
    if (bookmarkNum > 0) {
      await db.delete(bookmarks).where(inArray(bookmarks.authorDid, demoDids));
    }
    log(`  Deleted ${bookmarkNum} bookmarks.`);
  }

  // --- Stitches ---
  const stitchCount = await db
    .select({ count: count() })
    .from(stitches)
    .where(inArray(stitches.authorDid, demoDids));
  const stitchNum = Number(stitchCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${stitchNum} stitches from demo users.`);
  } else {
    if (stitchNum > 0) {
      await db.delete(stitches).where(inArray(stitches.authorDid, demoDids));
    }
    log(`  Deleted ${stitchNum} stitches.`);
  }

  // --- Duets ---
  const duetCount = await db
    .select({ count: count() })
    .from(duets)
    .where(inArray(duets.authorDid, demoDids));
  const duetNum = Number(duetCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${duetNum} duets from demo users.`);
  } else {
    if (duetNum > 0) {
      await db.delete(duets).where(inArray(duets.authorDid, demoDids));
    }
    log(`  Deleted ${duetNum} duets.`);
  }

  // --- Shares ---
  const shareCount = await db
    .select({ count: count() })
    .from(shares)
    .where(inArray(shares.authorDid, demoDids));
  const shareNum = Number(shareCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${shareNum} shares from demo users.`);
  } else {
    if (shareNum > 0) {
      await db.delete(shares).where(inArray(shares.authorDid, demoDids));
    }
    log(`  Deleted ${shareNum} shares.`);
  }

  // --- Resolve demo user video URIs (needed for video-level child tables) ---
  const demoVideos = await db
    .select({ uri: videos.uri })
    .from(videos)
    .where(inArray(videos.authorDid, demoDids));
  const demoVideoUris = demoVideos.map((v) => v.uri);

  log(`  Found ${demoVideoUris.length} videos owned by demo users.`);

  if (demoVideoUris.length > 0) {
    // --- Video hashtags ---
    const vhCount = await db
      .select({ count: count() })
      .from(videoHashtags)
      .where(inArray(videoHashtags.videoUri, demoVideoUris));
    const vhNum = Number(vhCount[0]?.count ?? 0);

    if (DRY_RUN) {
      dryLog(`Would delete ${vhNum} video-hashtag entries.`);
    } else {
      if (vhNum > 0) {
        // Process in batches to avoid "too many parameters" errors
        for (let i = 0; i < demoVideoUris.length; i += 500) {
          const batch = demoVideoUris.slice(i, i + 500);
          await db.delete(videoHashtags).where(inArray(videoHashtags.videoUri, batch));
        }
      }
      log(`  Deleted ${vhNum} video-hashtag entries.`);
    }

    // --- Video views ---
    const vvCount = await db
      .select({ count: count() })
      .from(videoViews)
      .where(inArray(videoViews.videoUri, demoVideoUris));
    const vvNum = Number(vvCount[0]?.count ?? 0);

    if (DRY_RUN) {
      dryLog(`Would delete ${vvNum} video view records.`);
    } else {
      if (vvNum > 0) {
        for (let i = 0; i < demoVideoUris.length; i += 500) {
          const batch = demoVideoUris.slice(i, i + 500);
          await db.delete(videoViews).where(inArray(videoViews.videoUri, batch));
        }
      }
      log(`  Deleted ${vvNum} video view records.`);
    }
  }

  // --- User interactions (by viewer DID) ---
  const uiCount = await db
    .select({ count: count() })
    .from(userInteractions)
    .where(inArray(userInteractions.userDid, demoDids));
  const uiNum = Number(uiCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${uiNum} user interaction records.`);
  } else {
    if (uiNum > 0) {
      await db.delete(userInteractions).where(inArray(userInteractions.userDid, demoDids));
    }
    log(`  Deleted ${uiNum} user interaction records.`);
  }

  // --- Videos (cascade deletes trendingVideos, videoEmbeddings via FK) ---
  const videoCount = demoVideoUris.length;

  if (DRY_RUN) {
    dryLog(`Would delete ${videoCount} videos from demo users.`);
  } else {
    if (videoCount > 0) {
      for (let i = 0; i < demoVideoUris.length; i += 500) {
        const batch = demoVideoUris.slice(i, i + 500);
        await db.delete(videos).where(inArray(videos.uri, batch));
      }
    }
    log(`  Deleted ${videoCount} videos.`);
  }

  // --- Follows (both directions) ---
  const followCount = await db
    .select({ count: count() })
    .from(follows)
    .where(
      or(
        inArray(follows.followerDid, demoDids),
        inArray(follows.followeeDid, demoDids)
      )
    );
  const followNum = Number(followCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${followNum} follow relationships involving demo users.`);
  } else {
    if (followNum > 0) {
      await db.delete(follows).where(
        or(
          inArray(follows.followerDid, demoDids),
          inArray(follows.followeeDid, demoDids)
        )
      );
    }
    log(`  Deleted ${followNum} follow relationships.`);
  }

  // --- Notifications involving demo users ---
  const notifCount = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      or(
        inArray(notifications.userDid, demoDids),
        inArray(notifications.actorDid, demoDids)
      )
    );
  const notifNum = Number(notifCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${notifNum} notifications involving demo users.`);
  } else {
    if (notifNum > 0) {
      await db.delete(notifications).where(
        or(
          inArray(notifications.userDid, demoDids),
          inArray(notifications.actorDid, demoDids)
        )
      );
    }
    log(`  Deleted ${notifNum} notifications.`);
  }

  // --- actorRepos rows for demo DIDs (sessions cascade) ---
  const arCount = await db
    .select({ count: count() })
    .from(actorRepos)
    .where(inArray(actorRepos.did, demoDids));
  const arNum = Number(arCount[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${arNum} actorRepo row(s) for demo DIDs.`);
  } else {
    if (arNum > 0) {
      await db.delete(actorRepos).where(inArray(actorRepos.did, demoDids));
    }
    log(`  Deleted ${arNum} actorRepo row(s).`);
  }

  // --- Users (must be last; most child tables cascade on FK) ---
  if (DRY_RUN) {
    dryLog(`Would delete ${demoDids.length} user row(s) for demo DIDs.`);
  } else {
    if (demoDids.length > 0) {
      await db.delete(users).where(inArray(users.did, demoDids));
    }
    log(`  Deleted ${demoDids.length} user row(s).`);
  }
}

// ---------------------------------------------------------------------------
// Step 3 — clean stale sessions
// ---------------------------------------------------------------------------

async function cleanExpiredSessions(): Promise<void> {
  log('\n--- Step 3: Cleaning expired sessions ---');

  const cutoff = new Date(Date.now() - SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const expiredRows = await db
    .select({ count: count() })
    .from(sessions)
    .where(lt(sessions.expiresAt, cutoff));
  const expiredNum = Number(expiredRows[0]?.count ?? 0);

  if (DRY_RUN) {
    dryLog(`Would delete ${expiredNum} expired session(s) (older than ${SESSION_MAX_AGE_DAYS} days).`);
  } else {
    if (expiredNum > 0) {
      await db.delete(sessions).where(lt(sessions.expiresAt, cutoff));
    }
    log(`  Deleted ${expiredNum} expired session(s).`);
  }
}

// ---------------------------------------------------------------------------
// Step 4 — clean Redis: BullMQ jobs, rate-limit keys, prefetch cache
// ---------------------------------------------------------------------------

async function cleanRedis(): Promise<void> {
  log('\n--- Step 4: Cleaning Redis ---');

  // Only possible when Redis is the real ioredis client (not MemoryCache)
  if (!(redis instanceof Redis)) {
    log('  Redis not available (using in-memory fallback) — skipping Redis cleanup.');
    return;
  }

  const cutoffMs = Date.now() - REDIS_JOB_MAX_AGE_HOURS * 60 * 60 * 1000;

  // --- BullMQ completed/failed job keys ---
  // BullMQ stores completed jobs in sorted sets: bull:<queue>:completed
  // and failed jobs in: bull:<queue>:failed
  // We scan for these sets and remove members whose score (timestamp) is old.
  const bullQueues = ['transcode', 'render', 'render-jobs', 'federation'];
  let totalJobsRemoved = 0;

  for (const queue of bullQueues) {
    for (const state of ['completed', 'failed']) {
      const setKey = `bull:${queue}:${state}`;

      if (DRY_RUN) {
        const countInSet = await redis.zcount(setKey, '-inf', cutoffMs.toString());
        if (countInSet > 0) {
          dryLog(`Would remove ${countInSet} old ${state} jobs from queue "${queue}".`);
        }
      } else {
        const removed = await redis.zremrangebyscore(setKey, '-inf', cutoffMs.toString());
        if (removed > 0) {
          log(`  Removed ${removed} old ${state} jobs from queue "${queue}".`);
          totalJobsRemoved += removed;
        }
      }
    }
  }

  if (!DRY_RUN && totalJobsRemoved === 0) {
    log('  No old BullMQ job entries to remove.');
  }

  // --- Rate-limit keys ---
  // Pattern: ratelimit:<did>:<endpoint>
  const rateLimitKeys = await redis.keys('ratelimit:*');
  if (DRY_RUN) {
    dryLog(`Would delete ${rateLimitKeys.length} rate-limit key(s).`);
  } else {
    if (rateLimitKeys.length > 0) {
      // ioredis del accepts spread or array — process in chunks
      for (let i = 0; i < rateLimitKeys.length; i += 500) {
        await redis.del(...rateLimitKeys.slice(i, i + 500));
      }
    }
    log(`  Deleted ${rateLimitKeys.length} rate-limit key(s).`);
  }

  // --- Prefetch cache / logs ---
  // Prefetch keys follow patterns like: prefetch:*, feed:*, or prefetch-log:*
  const prefetchPatterns = ['prefetch:*', 'prefetch-log:*'];
  let prefetchTotal = 0;

  for (const pattern of prefetchPatterns) {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) continue;

    // Determine which are old enough to remove by checking TTL/idle time.
    // Keys without a TTL that are older than the cutoff are candidates.
    // Since we cannot easily check key age without OBJECT IDLETIME (which
    // measures idle time, not creation time), we use a conservative approach:
    // delete all prefetch-log:* (they are purely ephemeral debug logs)
    // and leave prefetch:* unless they have no TTL set.
    const staleKeys: string[] = [];

    if (pattern === 'prefetch-log:*') {
      // All prefetch logs can be cleared
      staleKeys.push(...keys);
    } else {
      // Only delete prefetch cache entries that have no TTL (permanent entries
      // are likely stale demo artifacts)
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // No TTL set — treat as stale
          staleKeys.push(key);
        }
      }
    }

    if (DRY_RUN) {
      dryLog(`Would delete ${staleKeys.length} stale key(s) matching "${pattern}".`);
    } else {
      if (staleKeys.length > 0) {
        for (let i = 0; i < staleKeys.length; i += 500) {
          await redis.del(...staleKeys.slice(i, i + 500));
        }
      }
      log(`  Deleted ${staleKeys.length} stale key(s) matching "${pattern}".`);
      prefetchTotal += staleKeys.length;
    }
  }

  if (!DRY_RUN && prefetchTotal === 0 && rateLimitKeys.length === 0) {
    log('  No stale prefetch/rate-limit keys found.');
  }
}

// ---------------------------------------------------------------------------
// Step 5 — production readiness checks
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function runReadinessChecks(): Promise<CheckResult[]> {
  log('\n--- Step 5: Production readiness checks ---');
  const results: CheckResult[] = [];

  // Check 1: database connectivity
  try {
    await db.execute(sql`SELECT 1`);
    results.push({ name: 'Database connection', passed: true, detail: 'PostgreSQL is reachable.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name: 'Database connection', passed: false, detail: msg });
  }

  // Check 2: at least one super_admin
  try {
    const admins = await db
      .select({ count: count() })
      .from(adminUsers)
      .where(eq(adminUsers.role, 'super_admin'));
    const adminCount = Number(admins[0]?.count ?? 0);
    results.push({
      name: 'Super admin exists',
      passed: adminCount > 0,
      detail: adminCount > 0
        ? `${adminCount} super_admin account(s) found.`
        : 'No super_admin found — run seed:admin first.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name: 'Super admin exists', passed: false, detail: msg });
  }

  // Check 3: Redis connectivity
  if (redis instanceof Redis) {
    try {
      const pong = await redis.ping();
      results.push({
        name: 'Redis connection',
        passed: pong === 'PONG',
        detail: pong === 'PONG' ? 'Redis is reachable.' : `Unexpected PING response: ${pong}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: 'Redis connection', passed: false, detail: msg });
    }
  } else {
    results.push({
      name: 'Redis connection',
      passed: false,
      detail: 'REDIS_URL not configured — using in-memory fallback (not suitable for production).',
    });
  }

  // Check 4: S3 / MinIO bucket reachable
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
    results.push({
      name: 'S3/MinIO storage',
      passed: false,
      detail: 'Storage credentials not configured (DO_SPACES_KEY / S3_ACCESS_KEY_ID).',
    });
  } else {
    try {
      const s3 = new S3Client({
        region: process.env.S3_REGION || process.env.DO_SPACES_REGION || 'nyc3',
        endpoint,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: { accessKeyId, secretAccessKey },
      });

      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      results.push({
        name: 'S3/MinIO storage',
        passed: true,
        detail: `Bucket "${bucket}" is accessible.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        name: 'S3/MinIO storage',
        passed: false,
        detail: `Bucket "${bucket}" unreachable: ${msg}`,
      });
    }
  }

  // Print results
  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    log(`  [${icon}] ${r.name}: ${r.detail}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Step 6 — data summary
// ---------------------------------------------------------------------------

async function printDataSummary(): Promise<void> {
  log('\n--- Step 6: Remaining data summary ---');

  const [
    userCount,
    videoCount,
    likeCount,
    commentCount,
    followCount,
    adminCount,
    sessionCount,
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(videos),
    db.select({ count: count() }).from(likes),
    db.select({ count: count() }).from(comments),
    db.select({ count: count() }).from(follows),
    db.select({ count: count() }).from(adminUsers),
    db.select({ count: count() }).from(sessions),
  ]);

  log(`
  Users:        ${userCount[0]?.count ?? 0}
  Videos:       ${videoCount[0]?.count ?? 0}
  Likes:        ${likeCount[0]?.count ?? 0}
  Comments:     ${commentCount[0]?.count ?? 0}
  Follows:      ${followCount[0]?.count ?? 0}
  Admin users:  ${adminCount[0]?.count ?? 0}
  Sessions:     ${sessionCount[0]?.count ?? 0}
  `);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const separator = '='.repeat(70);
  log(separator);
  log('  EXPRSN — PRODUCTION DATA PREPARATION');
  log(separator);

  if (DRY_RUN) {
    log(`
  MODE: DRY RUN — no data will be modified.
  Run with --execute to apply changes.
`);
  } else {
    log(`
  MODE: EXECUTE — data WILL be deleted.
  Protected accounts: ${PROTECTED_HANDLES.join(', ')} + ${PROTECTED_DIDS.join(', ')}
`);
  }

  try {
    const demoDids = await resolveDemoDids();
    await deleteDemoUserContent(demoDids);
    await cleanExpiredSessions();
    await cleanRedis();
    const checks = await runReadinessChecks();
    await printDataSummary();

    log('\n' + separator);

    const failed = checks.filter((c) => !c.passed);
    if (failed.length > 0) {
      log('  RESULT: Some readiness checks FAILED (see above).');
      log(`  ${failed.map((c) => c.name).join(', ')} require attention before going live.`);
    } else {
      log('  RESULT: All readiness checks passed.');
    }

    if (DRY_RUN) {
      log('\n  Re-run with --execute to apply all deletions shown above.');
    }

    log(separator + '\n');
  } catch (err) {
    console.error('\nFatal error during production preparation:', err);
    process.exit(1);
  }

  // Give the DB/Redis connections a moment to flush before we exit
  setTimeout(() => process.exit(0), 500);
}

main();
