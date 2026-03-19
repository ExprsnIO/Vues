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
import { WsFirehose } from './ws-firehose.js';
import { JetstreamServer } from './jetstream.js';
import { RelayStats } from './stats.js';
import type { StatsSnapshot } from './stats.js';

/**
 * Relay service configuration
 */
export interface RelayConfig {
  redis: Redis | string;
  keyPrefix?: string;
  heartbeatIntervalMs?: number;
  maxBackfillEvents?: number;
  maxStoredEvents?: number;
  /** Enable Socket.IO firehose (default: true) */
  enableSocketIO?: boolean;
  /** Enable raw WebSocket CBOR firehose (default: true) */
  enableWebSocket?: boolean;
  /** Enable Jetstream JSON WebSocket (default: true) */
  enableJetstream?: boolean;
  /** Max raw WebSocket subscribers */
  maxWsSubscribers?: number;
  /** Max Jetstream subscribers */
  maxJetstreamSubscribers?: number;
  /** Verify commit signatures before relaying */
  verifySignatures?: boolean;
}

/**
 * Relay service for AT Protocol federation
 * Implements event sequencing, cursor management, and firehose streaming
 * across three protocols: Socket.IO, raw WebSocket (CBOR), and Jetstream (JSON).
 */
export class RelayService {
  private redis: Redis;
  private sequencer: Sequencer;
  private cursorStore: CursorStore;
  private backfill: Backfill;
  private firehose: Firehose;
  private wsFirehose: WsFirehose | null = null;
  private jetstreamServer: JetstreamServer | null = null;
  private relayStats: RelayStats;
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

    this.relayStats = new RelayStats();

    // Initialize raw WebSocket firehose if enabled
    if (config.enableWebSocket !== false) {
      this.wsFirehose = new WsFirehose({
        sequencer: this.sequencer,
        cursorStore: this.cursorStore,
        backfill: this.backfill,
        stats: this.relayStats,
        heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
        maxSubscribers: config.maxWsSubscribers || 1000,
      });
    }

    // Initialize Jetstream server if enabled
    if (config.enableJetstream !== false) {
      this.jetstreamServer = new JetstreamServer({
        sequencer: this.sequencer,
        cursorStore: this.cursorStore,
        backfill: this.backfill,
        stats: this.relayStats,
        maxSubscribers: config.maxJetstreamSubscribers || 5000,
      });
    }
  }

  /**
   * Initialize relay with Socket.IO server
   */
  initialize(io: SocketIOServer): void {
    if (this.initialized) return;

    if (this.config.enableSocketIO !== false) {
      this.firehose.initialize(io);
    }
    this.initialized = true;
  }

  /**
   * Emit a commit event to all enabled firehose protocols
   */
  async emitCommit(did: string, commit: CommitEvent): Promise<RelayEvent> {
    // Sequence the event
    const event = await this.sequencer.sequenceEvent(did, commit);

    // Broadcast to Socket.IO subscribers
    if (this.config.enableSocketIO !== false) {
      await this.firehose.broadcastEvent(event);
      this.relayStats.recordEvent('socketio', 0); // Size unknown for Socket.IO
    }

    // Broadcast to raw WebSocket subscribers
    if (this.wsFirehose) {
      this.wsFirehose.broadcastEvent(event);
    }

    // Broadcast to Jetstream subscribers
    if (this.jetstreamServer) {
      this.jetstreamServer.broadcastEvent(event);
    }

    return event;
  }

  /**
   * Get the raw WebSocket firehose for upgrade handler wiring
   */
  getWsFirehose(): WsFirehose | null {
    return this.wsFirehose;
  }

  /**
   * Get the Jetstream server for upgrade handler wiring
   */
  getJetstreamServer(): JetstreamServer | null {
    return this.jetstreamServer;
  }

  /**
   * Get per-protocol stats snapshot
   */
  getStats(): StatsSnapshot {
    return this.relayStats.getSnapshot();
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
   * Get connected client count across all protocols
   */
  getClientCount(): number {
    let count = this.firehose.getClientCount();
    if (this.wsFirehose) count += this.wsFirehose.getClientCount();
    if (this.jetstreamServer) count += this.jetstreamServer.getClientCount();
    return count;
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
   * Disconnect a subscriber by ID across all protocols
   */
  disconnectSubscriber(id: string): void {
    if (this.wsFirehose) this.wsFirehose.disconnectClient(id);
    if (this.jetstreamServer) this.jetstreamServer.disconnectClient(id);
    // Socket.IO clients would be disconnected through the firehose
  }

  /**
   * Get protocol configuration for admin display
   */
  getProtocolConfig(): {
    socketio: { enabled: boolean };
    websocket: { enabled: boolean; maxSubscribers: number };
    jetstream: { enabled: boolean; maxSubscribers: number };
    verifySignatures: boolean;
    maxBackfillEvents: number;
  } {
    return {
      socketio: { enabled: this.config.enableSocketIO !== false },
      websocket: {
        enabled: this.config.enableWebSocket !== false,
        maxSubscribers: this.config.maxWsSubscribers || 1000,
      },
      jetstream: {
        enabled: this.config.enableJetstream !== false,
        maxSubscribers: this.config.maxJetstreamSubscribers || 5000,
      },
      verifySignatures: this.config.verifySignatures || false,
      maxBackfillEvents: this.config.maxBackfillEvents || 10000,
    };
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.firehose.stopHeartbeat();
    await this.firehose.disconnectAll();

    if (this.wsFirehose) this.wsFirehose.disconnectAll();
    if (this.jetstreamServer) this.jetstreamServer.disconnectAll();

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
      const stats = this.getStats();

      return c.json({
        status: 'ok',
        sequence: summary,
        subscribers: {
          total: subscribers.length,
          active: subscribers.filter((s) => s.status === 'active').length,
        },
        connectedClients: this.getClientCount(),
        protocols: {
          socketio: {
            enabled: this.config.enableSocketIO !== false,
            clients: this.firehose.getClientCount(),
            stats: stats.socketio,
          },
          websocket: {
            enabled: this.config.enableWebSocket !== false,
            clients: this.wsFirehose?.getClientCount() || 0,
            stats: stats.websocket,
          },
          jetstream: {
            enabled: this.config.enableJetstream !== false,
            clients: this.jetstreamServer?.getClientCount() || 0,
            stats: stats.jetstream,
          },
        },
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

// Export new protocol servers
export { WsFirehose } from './ws-firehose.js';
export { JetstreamServer } from './jetstream.js';
export { RelayStats } from './stats.js';

// Export frame encoder
export {
  encodeFrame,
  encodeErrorFrame,
  encodeCommitFrame,
  encodeInfoFrame,
  encodeTombstoneFrame,
  encodeHandleFrame,
} from './frame-encoder.js';

// Export commit verifier
export { verifyCommitSignature } from './commit-verifier.js';

// Export external relay client
export {
  ExternalRelayClient,
  RelaySubscriptionManager,
} from './external-client.js';

// Export CAR builder utilities
export {
  createCar,
  createCid,
  createBlock,
  buildCommitCar,
  buildDeleteCar,
  buildMstProof,
} from './car-builder.js';

// Export types
export type {
  RelayEvent,
  CommitEvent,
  Subscriber,
  FirehoseFrame,
  FirehoseConfig,
  BackfillConfig,
  StatsSnapshot,
};

export type {
  ExternalRelayConfig,
  CommitFrame,
  HandleFrame,
  TombstoneFrame,
  RelayEventType,
} from './external-client.js';

export default RelayService;
