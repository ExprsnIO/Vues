/**
 * Raw WebSocket Firehose Server
 *
 * Standard `com.atproto.sync.subscribeRepos` over raw WebSocket with CBOR encoding.
 * This is the AT Protocol compliant endpoint that standard tools can connect to.
 */

import type { WebSocket } from 'ws';
import { encodeCommitFrame, encodeInfoFrame, encodeErrorFrame } from './frame-encoder.js';
import type { Sequencer, RelayEvent } from './sequencer.js';
import type { CursorStore } from './cursor-store.js';
import type { Backfill } from './backfill.js';
import type { RelayStats } from './stats.js';

export interface WsFirehoseConfig {
  sequencer: Sequencer;
  cursorStore: CursorStore;
  backfill: Backfill;
  stats?: RelayStats;
  heartbeatIntervalMs?: number;
  maxSubscribers?: number;
}

interface WsClient {
  id: string;
  ws: WebSocket;
  wantedCollections: string[] | undefined;
  endpoint: string;
  connectedAt: string;
}

/**
 * Raw WebSocket firehose for AT Protocol `com.atproto.sync.subscribeRepos`
 */
export class WsFirehose {
  private sequencer: Sequencer;
  private cursorStore: CursorStore;
  private backfill: Backfill;
  private stats?: RelayStats;
  private heartbeatIntervalMs: number;
  private maxSubscribers: number;
  private clients: Map<string, WsClient> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private nextClientId = 0;

  constructor(config: WsFirehoseConfig) {
    this.sequencer = config.sequencer;
    this.cursorStore = config.cursorStore;
    this.backfill = config.backfill;
    this.stats = config.stats;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs || 30000;
    this.maxSubscribers = config.maxSubscribers || 1000;

    this.startHeartbeat();
  }

  /**
   * Handle a new WebSocket connection (called from upgrade handler)
   */
  async handleConnection(ws: WebSocket, url: URL): Promise<void> {
    // Check subscriber limit
    if (this.clients.size >= this.maxSubscribers) {
      const errorFrame = encodeErrorFrame(
        'FutureCursor',
        'Maximum subscriber limit reached'
      );
      ws.send(errorFrame);
      ws.close(1008, 'Max subscribers reached');
      return;
    }

    const clientId = `ws-${++this.nextClientId}-${Date.now()}`;
    const cursorParam = url.searchParams.get('cursor');
    const wantedCollections = url.searchParams.getAll('wantedCollections');

    const client: WsClient = {
      id: clientId,
      ws,
      wantedCollections: wantedCollections.length > 0 ? wantedCollections : undefined,
      endpoint: 'websocket',
      connectedAt: new Date().toISOString(),
    };

    this.clients.set(clientId, client);
    this.stats?.recordConnection('websocket', 1);

    // Register in cursor store
    await this.cursorStore.registerSubscriber(clientId, 'websocket', {
      cursor: cursorParam ? parseInt(cursorParam, 10) : undefined,
      wantedCollections: client.wantedCollections,
    });

    // Handle backfill if cursor is provided
    if (cursorParam) {
      const cursor = parseInt(cursorParam, 10);
      const currentSeq = await this.sequencer.currentSeq();
      const oldestSeq = await this.sequencer.oldestSeq();

      if (oldestSeq !== null && cursor < oldestSeq) {
        // Cursor is too old
        const infoFrame = encodeInfoFrame('OutdatedCursor', 'Cursor is too old, some events may have been lost');
        ws.send(infoFrame);
      } else if (cursor < currentSeq) {
        // Send backfill
        await this.sendBackfill(client, cursor);
      }
    }

    // Handle close/error
    ws.on('close', () => this.handleDisconnect(clientId));
    ws.on('error', () => this.handleDisconnect(clientId));
  }

  /**
   * Broadcast an event to all connected raw WebSocket subscribers
   */
  broadcastEvent(event: RelayEvent): void {
    const frame = encodeCommitFrame(event);

    for (const client of this.clients.values()) {
      if (client.ws.readyState !== 1 /* WebSocket.OPEN */) continue;

      // Filter by wanted collections
      if (client.wantedCollections && client.wantedCollections.length > 0) {
        if (!client.wantedCollections.includes(event.commit.collection)) {
          continue;
        }
      }

      try {
        client.ws.send(frame);
        this.stats?.recordEvent('websocket', frame.length);
      } catch {
        // Will be cleaned up on next heartbeat or close event
      }
    }
  }

  /**
   * Disconnect a specific client by ID
   */
  disconnectClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      try {
        client.ws.close(1000, 'Disconnected by server');
      } catch {
        // Already closed
      }
      this.handleDisconnect(id);
    }
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(): void {
    for (const [id, client] of this.clients) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch {
        // Already closed
      }
    }
    this.clients.clear();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get client info for admin display
   */
  getClients(): Array<{
    id: string;
    endpoint: string;
    wantedCollections: string[] | undefined;
    connectedAt: string;
  }> {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      endpoint: c.endpoint,
      wantedCollections: c.wantedCollections,
      connectedAt: c.connectedAt,
    }));
  }

  // ── Private ────────────────────────────────────────────────

  private async sendBackfill(client: WsClient, cursor: number): Promise<void> {
    let events = await this.backfill.getEvents(cursor);

    // Filter by wanted collections
    if (client.wantedCollections && client.wantedCollections.length > 0) {
      events = events.filter(e =>
        client.wantedCollections!.includes(e.commit.collection)
      );
    }

    for (const event of events) {
      if (client.ws.readyState !== 1) break;

      const frame = encodeCommitFrame(event);
      try {
        client.ws.send(frame);
        this.stats?.recordEvent('websocket', frame.length);
      } catch {
        break;
      }
    }

    // Update cursor after backfill
    if (events.length > 0) {
      const lastSeq = events[events.length - 1].seq;
      await this.cursorStore.setCursor(client.id, lastSeq);
    }
  }

  private async handleDisconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);
    this.stats?.recordConnection('websocket', -1);

    try {
      await this.cursorStore.updateStatus(clientId, 'disconnected');
    } catch {
      // Best-effort cleanup
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const infoFrame = encodeInfoFrame('Heartbeat');

      for (const [id, client] of this.clients) {
        if (client.ws.readyState !== 1) {
          this.handleDisconnect(id);
          continue;
        }
        try {
          client.ws.send(infoFrame);
        } catch {
          this.handleDisconnect(id);
        }
      }
    }, this.heartbeatIntervalMs);
  }
}

export default WsFirehose;
