/**
 * Jetstream JSON WebSocket Server
 *
 * Lightweight JSON endpoint matching the Bluesky Jetstream format.
 * This is the developer-friendly endpoint that the feed generator's
 * JetstreamConsumer can connect to.
 */

import type { WebSocket } from 'ws';
import type { Sequencer, RelayEvent } from './sequencer.js';
import type { CursorStore } from './cursor-store.js';
import type { Backfill } from './backfill.js';
import type { RelayStats } from './stats.js';

export interface JetstreamConfig {
  sequencer: Sequencer;
  cursorStore: CursorStore;
  backfill: Backfill;
  stats?: RelayStats;
  maxSubscribers?: number;
  allowedCollections?: string[];
}

interface JetstreamClient {
  id: string;
  ws: WebSocket;
  wantedCollections: string[] | undefined;
  wantedDids: string[] | undefined;
  endpoint: string;
  connectedAt: string;
}

/**
 * JSON format matching Bluesky Jetstream
 */
interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: string;
  commit?: {
    rev: string;
    operation: 'create' | 'update' | 'delete';
    collection: string;
    rkey: string;
    record?: unknown;
    cid?: string;
  };
}

/**
 * Jetstream-compatible JSON WebSocket server
 */
export class JetstreamServer {
  private sequencer: Sequencer;
  private cursorStore: CursorStore;
  private backfill: Backfill;
  private stats?: RelayStats;
  private maxSubscribers: number;
  private clients: Map<string, JetstreamClient> = new Map();
  private nextClientId = 0;

  constructor(config: JetstreamConfig) {
    this.sequencer = config.sequencer;
    this.cursorStore = config.cursorStore;
    this.backfill = config.backfill;
    this.stats = config.stats;
    this.maxSubscribers = config.maxSubscribers || 5000;
  }

  /**
   * Handle a new WebSocket connection
   */
  async handleConnection(ws: WebSocket, url: URL): Promise<void> {
    if (this.clients.size >= this.maxSubscribers) {
      ws.send(JSON.stringify({ error: 'MaxSubscribersReached', message: 'Maximum subscriber limit reached' }));
      ws.close(1008, 'Max subscribers reached');
      return;
    }

    const clientId = `js-${++this.nextClientId}-${Date.now()}`;
    const cursorParam = url.searchParams.get('cursor');
    const wantedCollections = url.searchParams.getAll('wantedCollections');
    const wantedDids = url.searchParams.getAll('wantedDids');

    const client: JetstreamClient = {
      id: clientId,
      ws,
      wantedCollections: wantedCollections.length > 0 ? wantedCollections : undefined,
      wantedDids: wantedDids.length > 0 ? wantedDids : undefined,
      endpoint: 'jetstream',
      connectedAt: new Date().toISOString(),
    };

    this.clients.set(clientId, client);
    this.stats?.recordConnection('jetstream', 1);

    // Register in cursor store
    await this.cursorStore.registerSubscriber(clientId, 'jetstream', {
      cursor: cursorParam ? parseInt(cursorParam, 10) : undefined,
      wantedCollections: client.wantedCollections,
    });

    // Handle backfill
    if (cursorParam) {
      const cursor = parseInt(cursorParam, 10);
      const currentSeq = await this.sequencer.currentSeq();
      const oldestSeq = await this.sequencer.oldestSeq();

      if (oldestSeq !== null && cursor < oldestSeq) {
        ws.send(JSON.stringify({
          kind: 'info',
          name: 'OutdatedCursor',
          message: 'Cursor is too old, some events may have been lost',
        }));
      } else if (cursor < currentSeq) {
        await this.sendBackfill(client, cursor);
      }
    }

    // Handle close/error
    ws.on('close', () => this.handleDisconnect(clientId));
    ws.on('error', () => this.handleDisconnect(clientId));
  }

  /**
   * Broadcast an event to all connected Jetstream subscribers
   */
  broadcastEvent(event: RelayEvent): void {
    const json = this.eventToJetstream(event);
    const payload = JSON.stringify(json);

    for (const client of this.clients.values()) {
      if (client.ws.readyState !== 1 /* WebSocket.OPEN */) continue;

      // Filter by wanted collections
      if (client.wantedCollections && client.wantedCollections.length > 0) {
        if (!client.wantedCollections.includes(event.commit.collection)) {
          continue;
        }
      }

      // Filter by wanted DIDs
      if (client.wantedDids && client.wantedDids.length > 0) {
        if (!client.wantedDids.includes(event.did)) {
          continue;
        }
      }

      try {
        client.ws.send(payload);
        this.stats?.recordEvent('jetstream', payload.length);
      } catch {
        // Will be cleaned up on close event
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
    for (const client of this.clients.values()) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch {
        // Already closed
      }
    }
    this.clients.clear();
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
    wantedDids: string[] | undefined;
    connectedAt: string;
  }> {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      endpoint: c.endpoint,
      wantedCollections: c.wantedCollections,
      wantedDids: c.wantedDids,
      connectedAt: c.connectedAt,
    }));
  }

  // ── Private ────────────────────────────────────────────────

  private eventToJetstream(event: RelayEvent): JetstreamEvent {
    return {
      did: event.did,
      time_us: new Date(event.time).getTime() * 1000,
      kind: 'commit',
      commit: {
        rev: event.commit.rev,
        operation: event.commit.operation,
        collection: event.commit.collection,
        rkey: event.commit.rkey,
        record: event.commit.record,
        cid: event.commit.cid,
      },
    };
  }

  private async sendBackfill(client: JetstreamClient, cursor: number): Promise<void> {
    let events = await this.backfill.getEvents(cursor);

    // Filter by wanted collections
    if (client.wantedCollections && client.wantedCollections.length > 0) {
      events = events.filter(e =>
        client.wantedCollections!.includes(e.commit.collection)
      );
    }

    // Filter by wanted DIDs
    if (client.wantedDids && client.wantedDids.length > 0) {
      events = events.filter(e =>
        client.wantedDids!.includes(e.did)
      );
    }

    for (const event of events) {
      if (client.ws.readyState !== 1) break;

      const json = this.eventToJetstream(event);
      const payload = JSON.stringify(json);
      try {
        client.ws.send(payload);
        this.stats?.recordEvent('jetstream', payload.length);
      } catch {
        break;
      }
    }

    if (events.length > 0) {
      const lastSeq = events[events.length - 1].seq;
      await this.cursorStore.setCursor(client.id, lastSeq);
    }
  }

  private async handleDisconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);
    this.stats?.recordConnection('jetstream', -1);

    try {
      await this.cursorStore.updateStatus(clientId, 'disconnected');
    } catch {
      // Best-effort cleanup
    }
  }
}

export default JetstreamServer;
