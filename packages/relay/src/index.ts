import { Redis } from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { Hono } from 'hono';
import { Sequencer } from './sequencer.js';
import type { RelayEvent, CommitEvent } from './sequencer.js';
import { CursorStore } from './cursor-store.js';
import type { Subscriber } from './cursor-store.js';
import { Firehose } from './firehose.js';
import type { FirehoseConfig, FirehoseFrame } from './firehose.js';
import { Backfill } from './backfill.js';
import type { BackfillConfig } from './backfill.js';

/**
 * Relay service configuration
 */
export interface RelayConfig {
  redis: Redis | string;
  keyPrefix?: string;
  heartbeatIntervalMs?: number;
  maxBackfillEvents?: number;
  maxStoredEvents?: number;
}

/**
 * Relay service for AT Protocol federation
 * Implements event sequencing, cursor management, and firehose streaming
 */
export class RelayService {
  private redis: Redis;
  private sequencer: Sequencer;
  private cursorStore: CursorStore;
  private backfill: Backfill;
  private firehose: Firehose;
  private config: RelayConfig;
  private initialized = false;

  constructor(config: RelayConfig) {
    this.config = config;

    // Create or use existing Redis connection
    this.redis =
      typeof config.redis === 'string'
        ? new Redis(config.redis)
        : config.redis;

    // Initialize components
    this.sequencer = new Sequencer({
      redis: this.redis,
      keyPrefix: config.keyPrefix,
    });

    this.cursorStore = new CursorStore({
      redis: this.redis,
      keyPrefix: config.keyPrefix,
    });

    this.backfill = new Backfill({
      sequencer: this.sequencer,
      maxEvents: config.maxBackfillEvents || 10000,
    });

    this.firehose = new Firehose({
      sequencer: this.sequencer,
      cursorStore: this.cursorStore,
      backfill: this.backfill,
      heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
      maxBackfillEvents: config.maxBackfillEvents || 10000,
    });
  }

  /**
   * Initialize relay with Socket.IO server
   */
  initialize(io: SocketIOServer): void {
    if (this.initialized) return;

    this.firehose.initialize(io);
    this.initialized = true;
  }

  /**
   * Emit a commit event to the firehose
   */
  async emitCommit(did: string, commit: CommitEvent): Promise<RelayEvent> {
    // Sequence the event
    const event = await this.sequencer.sequenceEvent(did, commit);

    // Broadcast to subscribers
    await this.firehose.broadcastEvent(event);

    return event;
  }

  /**
   * Get current sequence number
   */
  async getCurrentSeq(): Promise<number> {
    return this.sequencer.currentSeq();
  }

  /**
   * Get events since cursor
   */
  async getEventsSince(cursor: number, limit?: number): Promise<RelayEvent[]> {
    return this.backfill.getEvents(cursor, limit);
  }

  /**
   * Get subscriber by ID
   */
  async getSubscriber(id: string): Promise<Subscriber | null> {
    return this.cursorStore.getSubscriber(id);
  }

  /**
   * List all subscribers
   */
  async listSubscribers(): Promise<Subscriber[]> {
    return this.cursorStore.listSubscribers();
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.firehose.getClientCount();
  }

  /**
   * Get backfill summary
   */
  async getBackfillSummary(): Promise<{
    oldestSeq: number | null;
    currentSeq: number;
    eventCount: number;
  }> {
    return this.backfill.getSummary();
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.firehose.stopHeartbeat();
    await this.firehose.disconnectAll();

    if (typeof this.config.redis === 'string') {
      // Only disconnect if we created the connection
      await this.redis.quit();
    }
  }

  /**
   * Create HTTP routes for relay status/admin
   */
  createRouter(): Hono {
    const router = new Hono();

    // Relay status
    router.get('/relay/status', async (c) => {
      const summary = await this.getBackfillSummary();
      const subscribers = await this.listSubscribers();

      return c.json({
        status: 'ok',
        sequence: summary,
        subscribers: {
          total: subscribers.length,
          active: subscribers.filter((s) => s.status === 'active').length,
        },
        connectedClients: this.getClientCount(),
      });
    });

    // List subscribers
    router.get('/relay/subscribers', async (c) => {
      const subscribers = await this.listSubscribers();
      return c.json({ subscribers });
    });

    // Get events (for debugging/admin)
    router.get('/relay/events', async (c) => {
      const cursor = parseInt(c.req.query('cursor') || '0', 10);
      const limit = parseInt(c.req.query('limit') || '100', 10);

      const events = await this.getEventsSince(cursor, Math.min(limit, 1000));
      return c.json({ events });
    });

    return router;
  }
}

// Export components
export { Sequencer, CursorStore, Firehose, Backfill };

// Export types
export type {
  RelayEvent,
  CommitEvent,
  Subscriber,
  FirehoseFrame,
  FirehoseConfig,
  BackfillConfig,
};

export default RelayService;
