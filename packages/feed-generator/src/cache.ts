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

async function initRedisConnection(): Promise<{ client: CacheBackend; type: 'redis' | 'memory' }> {
  if (!redisUrl) {
    console.log('REDIS_URL not set, using in-memory cache');
    return { client: new MemoryCache(), type: 'memory' };
  }

  try {
    const client = new Redis(redisUrl, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

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

const initResult = await initRedisConnection();
export const redis = initResult.client;
export const cacheType = initResult.type;
