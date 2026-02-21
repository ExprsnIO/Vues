import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { encode as encodeCbor, decode as decodeCbor } from '@ipld/dag-cbor';
import { Sequencer, RelayEvent, CommitEvent } from './sequencer.js';
import { CursorStore, Subscriber } from './cursor-store.js';
import { Backfill } from './backfill.js';

/**
 * Firehose frame types matching AT Protocol
 */
export type FirehoseFrame =
  | { $type: 'com.atproto.sync.subscribeRepos#commit'; body: CommitFrame }
  | { $type: 'com.atproto.sync.subscribeRepos#handle'; body: HandleFrame }
  | { $type: 'com.atproto.sync.subscribeRepos#migrate'; body: MigrateFrame }
  | { $type: 'com.atproto.sync.subscribeRepos#tombstone'; body: TombstoneFrame }
  | { $type: 'com.atproto.sync.subscribeRepos#info'; body: InfoFrame };

export interface CommitFrame {
  seq: number;
  rebase: boolean;
  tooBig: boolean;
  repo: string;
  commit: string; // CID
  prev: string | null; // CID
  rev: string;
  since: string | null;
  blocks: Uint8Array; // CAR file bytes
  ops: CommitOp[];
  blobs: string[]; // CIDs
  time: string;
}

export interface CommitOp {
  action: 'create' | 'update' | 'delete';
  path: string; // collection/rkey
  cid: string | null;
}

export interface HandleFrame {
  seq: number;
  did: string;
  handle: string;
  time: string;
}

export interface MigrateFrame {
  seq: number;
  did: string;
  migrateTo: string | null;
  time: string;
}

export interface TombstoneFrame {
  seq: number;
  did: string;
  time: string;
}

export interface InfoFrame {
  name: 'OutdatedCursor';
  message?: string;
}

/**
 * Firehose connection options
 */
export interface FirehoseSubscribeOptions {
  cursor?: number;
  wantedCollections?: string[];
}

/**
 * Firehose configuration
 */
export interface FirehoseConfig {
  sequencer: Sequencer;
  cursorStore: CursorStore;
  backfill: Backfill;
  heartbeatIntervalMs?: number;
  maxBackfillEvents?: number;
}

/**
 * Firehose implementation using Socket.IO
 * Implements com.atproto.sync.subscribeRepos WebSocket endpoint
 */
export class Firehose {
  private sequencer: Sequencer;
  private cursorStore: CursorStore;
  private backfill: Backfill;
  private namespace: Namespace | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs: number;
  private maxBackfillEvents: number;
  private connectedClients: Map<string, Socket> = new Map();

  constructor(config: FirehoseConfig) {
    this.sequencer = config.sequencer;
    this.cursorStore = config.cursorStore;
    this.backfill = config.backfill;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs || 30000;
    this.maxBackfillEvents = config.maxBackfillEvents || 10000;
  }

  /**
   * Initialize firehose on Socket.IO server
   */
  initialize(io: SocketIOServer): void {
    this.namespace = io.of('/xrpc/com.atproto.sync.subscribeRepos');

    this.namespace.on('connection', async (socket) => {
      await this.handleConnection(socket);
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle new connection
   */
  private async handleConnection(socket: Socket): Promise<void> {
    const cursor = socket.handshake.query.cursor as string | undefined;
    const wantedCollections = socket.handshake.query.wantedCollections as
      | string
      | string[]
      | undefined;

    const subscriberId = socket.id;
    const collections = wantedCollections
      ? Array.isArray(wantedCollections)
        ? wantedCollections
        : [wantedCollections]
      : undefined;

    // Register subscriber
    await this.cursorStore.registerSubscriber(
      subscriberId,
      socket.handshake.address,
      {
        cursor: cursor ? parseInt(cursor, 10) : undefined,
        wantedCollections: collections,
      }
    );

    this.connectedClients.set(subscriberId, socket);

    // Handle cursor/backfill
    if (cursor) {
      const cursorNum = parseInt(cursor, 10);
      const currentSeq = await this.sequencer.currentSeq();
      const oldestSeq = await this.sequencer.oldestSeq();

      if (oldestSeq !== null && cursorNum < oldestSeq) {
        // Cursor is too old, send info frame
        this.sendInfoFrame(socket, 'OutdatedCursor', 'Cursor is too old');
      } else if (cursorNum < currentSeq) {
        // Send backfill
        await this.sendBackfill(socket, subscriberId, cursorNum, collections);
      }
    }

    // Handle disconnect
    socket.on('disconnect', async () => {
      await this.cursorStore.updateStatus(subscriberId, 'disconnected');
      this.connectedClients.delete(subscriberId);
    });

    // Handle heartbeat response
    socket.on('heartbeat', async () => {
      await this.cursorStore.heartbeat(subscriberId);
    });

    // Handle cursor update from client
    socket.on('updateCursor', async (data: { cursor: number }) => {
      if (typeof data.cursor === 'number') {
        await this.cursorStore.setCursor(subscriberId, data.cursor);
      }
    });
  }

  /**
   * Send backfill events to subscriber
   */
  private async sendBackfill(
    socket: Socket,
    subscriberId: string,
    cursor: number,
    wantedCollections?: string[]
  ): Promise<void> {
    let events = await this.backfill.getEvents(cursor, this.maxBackfillEvents);

    // Filter by wanted collections if specified
    if (wantedCollections && wantedCollections.length > 0) {
      events = events.filter((e) =>
        wantedCollections.includes(e.commit.collection)
      );
    }

    for (const event of events) {
      await this.sendEventToSocket(socket, event);
    }

    // Update cursor after backfill
    if (events.length > 0) {
      const lastSeq = events[events.length - 1].seq;
      await this.cursorStore.setCursor(subscriberId, lastSeq);
    }
  }

  /**
   * Broadcast event to all connected subscribers
   */
  async broadcastEvent(event: RelayEvent): Promise<void> {
    if (!this.namespace) return;

    const subscribers = await this.cursorStore.listActiveSubscribers();

    for (const subscriber of subscribers) {
      const socket = this.connectedClients.get(subscriber.id);
      if (!socket) continue;

      // Filter by wanted collections
      if (subscriber.wantedCollections && subscriber.wantedCollections.length > 0) {
        if (!subscriber.wantedCollections.includes(event.commit.collection)) {
          continue;
        }
      }

      await this.sendEventToSocket(socket, event);
      await this.cursorStore.setCursor(subscriber.id, event.seq);
    }
  }

  /**
   * Send event to a specific socket
   */
  private async sendEventToSocket(
    socket: Socket,
    event: RelayEvent
  ): Promise<void> {
    const frame: FirehoseFrame = {
      $type: 'com.atproto.sync.subscribeRepos#commit',
      body: this.eventToCommitFrame(event),
    };

    // Encode as DAG-CBOR
    const encoded = encodeCbor(frame);
    socket.emit('message', encoded);
  }

  /**
   * Convert relay event to commit frame
   */
  private eventToCommitFrame(event: RelayEvent): CommitFrame {
    return {
      seq: event.seq,
      rebase: false,
      tooBig: false,
      repo: event.did,
      commit: event.commit.cid || '',
      prev: event.commit.prev || null,
      rev: event.commit.rev,
      since: null,
      blocks: new Uint8Array(0), // Would include actual blocks
      ops: [
        {
          action: event.commit.operation,
          path: `${event.commit.collection}/${event.commit.rkey}`,
          cid: event.commit.cid || null,
        },
      ],
      blobs: [],
      time: event.time,
    };
  }

  /**
   * Send info frame
   */
  private sendInfoFrame(
    socket: Socket,
    name: 'OutdatedCursor',
    message?: string
  ): void {
    const frame: FirehoseFrame = {
      $type: 'com.atproto.sync.subscribeRepos#info',
      body: { name, message },
    };

    const encoded = encodeCbor(frame);
    socket.emit('message', encoded);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      if (!this.namespace) return;

      // Send heartbeat to all connected clients
      this.namespace.emit('heartbeat', { time: new Date().toISOString() });

      // Clean up stale subscribers
      await this.cursorStore.cleanupStaleSubscribers(this.heartbeatIntervalMs * 3);
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat timer
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Disconnect all clients
   */
  async disconnectAll(): Promise<void> {
    for (const [id, socket] of this.connectedClients) {
      socket.disconnect(true);
      await this.cursorStore.updateStatus(id, 'disconnected');
    }
    this.connectedClients.clear();
  }
}

export default Firehose;
