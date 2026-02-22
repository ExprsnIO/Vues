/**
 * External Relay Client
 * Connects to external AT Protocol relays and consumes their firehose
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import * as cbor from 'cbor';

export interface ExternalRelayConfig {
  /** Relay WebSocket URL (e.g., wss://bsky.network) */
  url: string;
  /** Optional cursor to resume from */
  cursor?: number;
  /** Collections to filter for (empty = all) */
  wantedCollections?: string[];
  /** Reconnect delay in ms */
  reconnectDelayMs?: number;
  /** Max reconnect attempts (0 = infinite) */
  maxReconnectAttempts?: number;
  /** Heartbeat timeout in ms */
  heartbeatTimeoutMs?: number;
}

export interface RelayFrame {
  /** Frame type */
  t: '#commit' | '#handle' | '#migrate' | '#tombstone' | '#info' | '#error';
  /** Frame operation/payload */
  op?: unknown;
}

export interface CommitFrame {
  seq: number;
  rebase: boolean;
  tooBig: boolean;
  repo: string; // DID
  commit: {
    cid: string;
    rev: string;
  };
  prev?: string;
  since?: string;
  blocks?: Uint8Array; // CAR file bytes
  ops: Array<{
    action: 'create' | 'update' | 'delete';
    path: string;
    cid?: string;
  }>;
  blobs?: string[];
  time: string;
}

export interface HandleFrame {
  seq: number;
  did: string;
  handle: string;
  time: string;
}

export interface TombstoneFrame {
  seq: number;
  did: string;
  time: string;
}

export interface InfoFrame {
  name: string;
  message?: string;
}

export interface ErrorFrame {
  name: string;
  message: string;
}

export type RelayEventType = 'commit' | 'handle' | 'migrate' | 'tombstone' | 'info' | 'error' | 'connected' | 'disconnected' | 'reconnecting';

export interface RelayClientEvents {
  commit: (frame: CommitFrame) => void;
  handle: (frame: HandleFrame) => void;
  tombstone: (frame: TombstoneFrame) => void;
  info: (frame: InfoFrame) => void;
  error: (frame: ErrorFrame) => void;
  connected: (url: string) => void;
  disconnected: (reason: string) => void;
  reconnecting: (attempt: number) => void;
}

/**
 * Client for connecting to external AT Protocol relays
 */
export class ExternalRelayClient extends EventEmitter {
  private config: Required<ExternalRelayConfig>;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastSeq: number = 0;
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(config: ExternalRelayConfig) {
    super();
    this.config = {
      url: config.url,
      cursor: config.cursor ?? 0,
      wantedCollections: config.wantedCollections ?? [],
      reconnectDelayMs: config.reconnectDelayMs ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 0,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? 60000,
    };
    this.lastSeq = this.config.cursor;
  }

  /**
   * Connect to the external relay
   */
  async connect(): Promise<void> {
    if (this.ws || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      await this.establishConnection();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Disconnect from the relay
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Get the last processed sequence number
   */
  getLastSeq(): number {
    return this.lastSeq;
  }

  /**
   * Update wanted collections filter
   */
  setWantedCollections(collections: string[]): void {
    this.config.wantedCollections = collections;
    // Reconnect to apply new filter
    if (this.ws) {
      this.ws.close(1000, 'Updating collections filter');
    }
  }

  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build URL with query parameters
      const url = new URL(this.config.url);

      // Add cursor if we have one
      if (this.lastSeq > 0) {
        url.searchParams.set('cursor', this.lastSeq.toString());
      }

      // Add collection filter
      if (this.config.wantedCollections.length > 0) {
        for (const collection of this.config.wantedCollections) {
          url.searchParams.append('wantedCollections', collection);
        }
      }

      console.log(`[ExternalRelayClient] Connecting to ${url.toString()}`);

      this.ws = new WebSocket(url.toString());

      this.ws.on('open', () => {
        console.log(`[ExternalRelayClient] Connected to ${this.config.url}`);
        this.reconnectAttempts = 0;
        this.startHeartbeatTimer();
        this.emit('connected', this.config.url);
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.resetHeartbeatTimer();
        this.handleMessage(data);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason?.toString() || 'Unknown';
        console.log(`[ExternalRelayClient] Disconnected: ${code} - ${reasonStr}`);
        this.ws = null;
        this.clearTimers();
        this.emit('disconnected', reasonStr);

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        console.error(`[ExternalRelayClient] WebSocket error:`, error);
        this.emit('error', { name: 'WebSocketError', message: error.message });
        reject(error);
      });
    });
  }

  private handleMessage(data: Buffer): void {
    try {
      // Decode CBOR frame
      const frame = cbor.decodeFirstSync(data) as RelayFrame;

      switch (frame.t) {
        case '#commit': {
          const commit = frame.op as CommitFrame;
          this.lastSeq = commit.seq;

          // Filter by collection if configured
          if (this.config.wantedCollections.length > 0) {
            const hasWantedOp = commit.ops.some(op => {
              const collection = op.path.split('/')[0];
              return this.config.wantedCollections.includes(collection || '');
            });
            if (!hasWantedOp) {
              return;
            }
          }

          this.emit('commit', commit);
          break;
        }

        case '#handle': {
          const handle = frame.op as HandleFrame;
          this.lastSeq = handle.seq;
          this.emit('handle', handle);
          break;
        }

        case '#tombstone': {
          const tombstone = frame.op as TombstoneFrame;
          this.lastSeq = tombstone.seq;
          this.emit('tombstone', tombstone);
          break;
        }

        case '#info': {
          const info = frame.op as InfoFrame;
          console.log(`[ExternalRelayClient] Info: ${info.name} - ${info.message || ''}`);
          this.emit('info', info);
          break;
        }

        case '#error': {
          const error = frame.op as ErrorFrame;
          console.error(`[ExternalRelayClient] Error: ${error.name} - ${error.message}`);
          this.emit('error', error);
          break;
        }

        default:
          console.warn(`[ExternalRelayClient] Unknown frame type: ${frame.t}`);
      }
    } catch (error) {
      console.error('[ExternalRelayClient] Failed to decode frame:', error);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.config.maxReconnectAttempts > 0 &&
        this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log(`[ExternalRelayClient] Max reconnect attempts reached`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      60000 // Max 60 seconds
    );

    console.log(`[ExternalRelayClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit('reconnecting', this.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        console.error('[ExternalRelayClient] Reconnect failed:', error);
      }
    }, delay);
  }

  private startHeartbeatTimer(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setTimeout(() => {
      console.warn('[ExternalRelayClient] Heartbeat timeout, reconnecting...');
      if (this.ws) {
        this.ws.close(1000, 'Heartbeat timeout');
      }
    }, this.config.heartbeatTimeoutMs);
  }

  private resetHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      this.startHeartbeatTimer();
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeatTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/**
 * Relay subscription manager for multiple external relays
 */
export class RelaySubscriptionManager {
  private clients: Map<string, ExternalRelayClient> = new Map();
  private eventHandlers: Map<RelayEventType, Set<Function>> = new Map();

  /**
   * Subscribe to an external relay
   */
  subscribe(id: string, config: ExternalRelayConfig): ExternalRelayClient {
    if (this.clients.has(id)) {
      throw new Error(`Subscription ${id} already exists`);
    }

    const client = new ExternalRelayClient(config);

    // Forward events
    client.on('commit', (frame) => this.forwardEvent('commit', id, frame));
    client.on('handle', (frame) => this.forwardEvent('handle', id, frame));
    client.on('tombstone', (frame) => this.forwardEvent('tombstone', id, frame));
    client.on('info', (frame) => this.forwardEvent('info', id, frame));
    client.on('error', (frame) => this.forwardEvent('error', id, frame));
    client.on('connected', (url) => this.forwardEvent('connected', id, url));
    client.on('disconnected', (reason) => this.forwardEvent('disconnected', id, reason));
    client.on('reconnecting', (attempt) => this.forwardEvent('reconnecting', id, attempt));

    this.clients.set(id, client);
    return client;
  }

  /**
   * Unsubscribe from a relay
   */
  unsubscribe(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.disconnect();
      this.clients.delete(id);
    }
  }

  /**
   * Get a client by ID
   */
  getClient(id: string): ExternalRelayClient | undefined {
    return this.clients.get(id);
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Connect all subscriptions
   */
  async connectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map(client => client.connect())
    );
  }

  /**
   * Disconnect all subscriptions
   */
  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
  }

  /**
   * Register an event handler for all subscriptions
   */
  on(event: RelayEventType, handler: (subscriptionId: string, data: unknown) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event handler
   */
  off(event: RelayEventType, handler: Function): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private forwardEvent(event: RelayEventType, subscriptionId: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(subscriptionId, data);
        } catch (error) {
          console.error(`[RelaySubscriptionManager] Event handler error:`, error);
        }
      }
    }
  }
}

export default ExternalRelayClient;
