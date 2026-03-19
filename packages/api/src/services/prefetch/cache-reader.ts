/**
 * Prefetch Cache Reader
 *
 * Reads from the same TieredCache Redis DBs that the prefetch worker writes to.
 * This is the consumer side — feed endpoints check this cache before hitting the DB.
 *
 * Cache layout (matches @exprsn/prefetch TieredCache):
 *   Redis DB 0: hot tier (5m TTL)
 *   Redis DB 1: warm tier (15m TTL)
 *   Redis DB 2: cold tier (1h TTL)
 *   Key format: timeline:{userDid}
 */

import { Redis } from 'ioredis';
import { getRedisUrl } from '../../cache/redis.js';
import { cacheType } from '../../cache/redis.js';

interface CachedTimeline {
  posts: Array<{
    uri: string;
    cid: string;
    authorDid: string;
  }>;
  cursor?: string;
  fetchedAt: number;
}

interface CacheReadResult {
  data: CachedTimeline;
  tier: 'hot' | 'warm' | 'cold';
}

// Redis clients for each cache tier (lazy-initialized)
let hotClient: Redis | null = null;
let warmClient: Redis | null = null;
let coldClient: Redis | null = null;
let initialized = false;

function ensureClients(): boolean {
  if (initialized) return true;
  if (cacheType !== 'redis') return false;

  try {
    const url = new URL(getRedisUrl());
    const baseOpts = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    };

    hotClient = new Redis({ ...baseOpts, db: 0 });
    warmClient = new Redis({ ...baseOpts, db: 1 });
    coldClient = new Redis({ ...baseOpts, db: 2 });

    // Connect all
    hotClient.connect().catch(() => {});
    warmClient.connect().catch(() => {});
    coldClient.connect().catch(() => {});

    initialized = true;
    console.log('[prefetch-cache-reader] Initialized (DB 0/1/2)');
    return true;
  } catch (err) {
    console.warn('[prefetch-cache-reader] Failed to initialize:', err);
    return false;
  }
}

/**
 * Read a user's cached timeline from the prefetch TieredCache.
 * Checks hot → warm → cold tiers in order.
 * Returns null on cache miss.
 */
export async function getCachedTimeline(userDid: string): Promise<CacheReadResult | null> {
  if (!ensureClients()) return null;

  const key = `timeline:${userDid}`;
  const tiers: Array<{ name: 'hot' | 'warm' | 'cold'; client: Redis }> = [
    { name: 'hot', client: hotClient! },
    { name: 'warm', client: warmClient! },
    { name: 'cold', client: coldClient! },
  ];

  for (const tier of tiers) {
    try {
      const raw = await tier.client.get(key);
      if (raw) {
        const data = JSON.parse(raw) as CachedTimeline;

        // Promote to hot tier on warm/cold hit (same as TieredCache behavior)
        if (tier.name !== 'hot' && hotClient) {
          hotClient.setex(key, 300, raw).catch(() => {}); // 5m TTL
        }

        return { data, tier: tier.name };
      }
    } catch {
      // Continue to next tier
    }
  }

  return null;
}

/**
 * Check if a cached timeline exists (without reading full data).
 */
export async function hasCachedTimeline(userDid: string): Promise<boolean> {
  if (!ensureClients()) return false;

  const key = `timeline:${userDid}`;
  const clients = [hotClient!, warmClient!, coldClient!];

  for (const client of clients) {
    try {
      if (await client.exists(key)) return true;
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Invalidate a user's cached timeline across all tiers.
 * Call when the user's feed changes (new follow, new post from followed user, etc).
 */
export async function invalidateCachedTimeline(userDid: string): Promise<void> {
  if (!ensureClients()) return;

  const key = `timeline:${userDid}`;
  await Promise.allSettled([
    hotClient!.del(key),
    warmClient!.del(key),
    coldClient!.del(key),
  ]);
}
