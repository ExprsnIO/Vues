import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

// In-memory cache fallback when Redis is unavailable
class MemoryCache {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value });
    return 'OK';
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async incrby(key: string, increment: number): Promise<number> {
    const current = parseInt((await this.get(key)) || '0', 10);
    const newValue = current + increment;
    await this.set(key, newValue.toString());
    return newValue;
  }

  async incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }
}

type CacheBackend = Redis | MemoryCache;

let redis: CacheBackend;
let cacheType: 'redis' | 'memory';

async function initRedisConnection(): Promise<{ client: CacheBackend; type: 'redis' | 'memory' }> {
  if (!redisUrl) {
    console.log('REDIS_URL not set, using in-memory cache');
    return { client: new MemoryCache(), type: 'memory' };
  }

  try {
    const client = new Redis(redisUrl, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry on initial connection
    });

    // Test connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.disconnect();
        reject(new Error('Connection timeout'));
      }, 5000);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once('error', (err) => {
        clearTimeout(timeout);
        client.disconnect();
        reject(err);
      });
    });

    console.log(`Connected to Redis: ${redisUrl.replace(/:[^:@]+@/, ':****@')}`);
    return { client, type: 'redis' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Redis connection failed: ${message}, using in-memory cache`);
    return { client: new MemoryCache(), type: 'memory' };
  }
}

// Initialize cache synchronously for module-level export
// We use a sync fallback initially and upgrade if Redis connects
const initResult = await initRedisConnection();
redis = initResult.client;
cacheType = initResult.type;

export { redis, cacheType };

export const CacheKeys = {
  // User data (TTL: 5 min)
  user: (did: string) => `user:${did}`,
  userProfile: (did: string) => `user:profile:${did}`,

  // Video data (TTL: 1 min)
  video: (uri: string) => `video:${uri}`,
  videoStats: (uri: string) => `video:stats:${uri}`,

  // Feed caches (TTL: 30 sec)
  feedFollowing: (did: string, cursor?: string) =>
    `feed:following:${did}:${cursor || 'initial'}`,
  feedTrending: (cursor?: string) => `feed:trending:${cursor || 'initial'}`,
  feedForYou: (did: string, cursor?: string) => `feed:foryou:${did}:${cursor || 'initial'}`,
  feedSound: (soundId: string, cursor?: string) => `feed:sound:${soundId}:${cursor || 'initial'}`,
  feedHashtag: (tag: string, cursor?: string) => `feed:hashtag:${tag}:${cursor || 'initial'}`,

  // Session data (TTL: 2 weeks)
  session: (id: string) => `session:${id}`,
  oauthState: (state: string) => `oauth:state:${state}`,

  // Rate limiting
  rateLimit: (did: string, endpoint: string) => `ratelimit:${did}:${endpoint}`,

  // Real-time counters (no TTL, increment only)
  viewCount: (videoUri: string) => `counter:views:${videoUri}`,
  likeCount: (videoUri: string) => `counter:likes:${videoUri}`,

  // Upload status
  upload: (uploadId: string) => `upload:${uploadId}`,
} as const;

export const CACHE_TTL = {
  USER: 300, // 5 minutes
  VIDEO: 60, // 1 minute
  FEED: 30, // 30 seconds
  SESSION: 14 * 24 * 60 * 60, // 2 weeks
} as const;

export class CacheService {
  constructor(private cache: CacheBackend) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.cache.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.cache.setex(key, ttlSeconds, serialized);
    } else {
      await this.cache.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.cache.keys(pattern);
    if (keys.length > 0) {
      await this.cache.del(...keys);
    }
  }

  async incrementCounter(key: string, by: number = 1): Promise<number> {
    return this.cache.incrby(key, by);
  }

  async getCounter(key: string): Promise<number> {
    const value = await this.cache.get(key);
    return value ? parseInt(value, 10) : 0;
  }
}

export const cacheService = new CacheService(redis);
