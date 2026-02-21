import { Redis } from 'ioredis';

/**
 * Subscriber information
 */
export interface Subscriber {
  id: string;
  endpoint: string;
  cursor: number | null;
  wantedCollections: string[] | null;
  status: 'active' | 'inactive' | 'disconnected';
  lastHeartbeat: string;
  createdAt: string;
}

/**
 * Cursor store configuration
 */
export interface CursorStoreConfig {
  redis: Redis;
  keyPrefix?: string;
}

/**
 * Manages subscriber cursors for the relay firehose
 */
export class CursorStore {
  private redis: Redis;
  private keyPrefix: string;
  private readonly SUBSCRIBERS_KEY = 'relay:subscribers';
  private readonly CURSORS_KEY = 'relay:cursors';

  constructor(config: CursorStoreConfig) {
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || '';
  }

  /**
   * Register a new subscriber
   */
  async registerSubscriber(
    id: string,
    endpoint: string,
    options?: {
      cursor?: number;
      wantedCollections?: string[];
    }
  ): Promise<Subscriber> {
    const now = new Date().toISOString();
    const subscriber: Subscriber = {
      id,
      endpoint,
      cursor: options?.cursor ?? null,
      wantedCollections: options?.wantedCollections ?? null,
      status: 'active',
      lastHeartbeat: now,
      createdAt: now,
    };

    const key = this.keyPrefix + this.SUBSCRIBERS_KEY;
    await this.redis.hset(key, id, JSON.stringify(subscriber));

    // Set cursor if provided
    if (options?.cursor !== undefined) {
      await this.setCursor(id, options.cursor);
    }

    return subscriber;
  }

  /**
   * Get subscriber by ID
   */
  async getSubscriber(id: string): Promise<Subscriber | null> {
    const key = this.keyPrefix + this.SUBSCRIBERS_KEY;
    const data = await this.redis.hget(key, id);

    if (!data) return null;
    return JSON.parse(data) as Subscriber;
  }

  /**
   * Update subscriber status
   */
  async updateStatus(
    id: string,
    status: 'active' | 'inactive' | 'disconnected'
  ): Promise<void> {
    const subscriber = await this.getSubscriber(id);
    if (!subscriber) return;

    subscriber.status = status;
    subscriber.lastHeartbeat = new Date().toISOString();

    const key = this.keyPrefix + this.SUBSCRIBERS_KEY;
    await this.redis.hset(key, id, JSON.stringify(subscriber));
  }

  /**
   * Update subscriber heartbeat
   */
  async heartbeat(id: string): Promise<void> {
    const subscriber = await this.getSubscriber(id);
    if (!subscriber) return;

    subscriber.lastHeartbeat = new Date().toISOString();
    subscriber.status = 'active';

    const key = this.keyPrefix + this.SUBSCRIBERS_KEY;
    await this.redis.hset(key, id, JSON.stringify(subscriber));
  }

  /**
   * Set cursor for subscriber
   */
  async setCursor(id: string, cursor: number): Promise<void> {
    const cursorKey = this.keyPrefix + this.CURSORS_KEY;
    await this.redis.hset(cursorKey, id, cursor.toString());

    // Also update subscriber record
    const subscriber = await this.getSubscriber(id);
    if (subscriber) {
      subscriber.cursor = cursor;
      const key = this.keyPrefix + this.SUBSCRIBERS_KEY;
      await this.redis.hset(key, id, JSON.stringify(subscriber));
    }
  }

  /**
   * Get cursor for subscriber
   */
  async getCursor(id: string): Promise<number | null> {
    const key = this.keyPrefix + this.CURSORS_KEY;
    const cursor = await this.redis.hget(key, id);

    if (!cursor) return null;
    return parseInt(cursor, 10);
  }

  /**
   * Remove subscriber
   */
  async removeSubscriber(id: string): Promise<void> {
    const subKey = this.keyPrefix + this.SUBSCRIBERS_KEY;
    const cursorKey = this.keyPrefix + this.CURSORS_KEY;

    await this.redis.hdel(subKey, id);
    await this.redis.hdel(cursorKey, id);
  }

  /**
   * List all subscribers
   */
  async listSubscribers(): Promise<Subscriber[]> {
    const key = this.keyPrefix + this.SUBSCRIBERS_KEY;
    const all = await this.redis.hgetall(key);

    return Object.values(all).map((data: string) => JSON.parse(data) as Subscriber);
  }

  /**
   * List active subscribers
   */
  async listActiveSubscribers(): Promise<Subscriber[]> {
    const subscribers = await this.listSubscribers();
    return subscribers.filter((s) => s.status === 'active');
  }

  /**
   * Get subscribers that need backfill (cursor < current seq)
   */
  async getSubscribersNeedingBackfill(currentSeq: number): Promise<Subscriber[]> {
    const subscribers = await this.listActiveSubscribers();
    return subscribers.filter(
      (s) => s.cursor !== null && s.cursor < currentSeq
    );
  }

  /**
   * Clean up stale subscribers (no heartbeat in specified duration)
   */
  async cleanupStaleSubscribers(maxAgeMs: number = 300000): Promise<number> {
    const subscribers = await this.listSubscribers();
    const now = Date.now();
    let removed = 0;

    for (const subscriber of subscribers) {
      const lastHeartbeat = new Date(subscriber.lastHeartbeat).getTime();
      if (now - lastHeartbeat > maxAgeMs) {
        await this.removeSubscriber(subscriber.id);
        removed++;
      }
    }

    return removed;
  }
}

export default CursorStore;
