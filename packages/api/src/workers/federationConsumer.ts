/**
 * Federation Consumer Worker
 *
 * Subscribes to external relay firehoses and processes inbound federated content.
 * Handles video posts, likes, comments, and other federated collections.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, gt, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createBlobSync, type BlobSync } from '../services/federation/BlobSync.js';
import { io as SocketIOClient } from 'socket.io-client';
import { nanoid } from 'nanoid';

/**
 * Firehose frame from relay
 */
export interface FirehoseFrame {
  seq: number;
  time: string;
  did: string;
  commit?: {
    rev: string;
    operation: 'create' | 'update' | 'delete';
    collection: string;
    rkey: string;
    record?: unknown;
    cid?: string;
    blobs?: string[];
  };
  handle?: {
    handle: string;
  };
  tombstone?: boolean;
}

/**
 * Subscription state
 */
interface SubscriptionState {
  endpoint: string;
  socket: ReturnType<typeof SocketIOClient> | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastSeq: number | null;
  errorCount: number;
  wantedCollections: string[];
}

/**
 * Worker configuration
 */
export interface FederationConsumerConfig {
  db: PostgresJsDatabase<typeof schema>;
  // Collections we want to receive
  wantedCollections?: string[];
  // Max reconnect attempts before marking unhealthy
  maxReconnectAttempts?: number;
  // Reconnect delay base (ms)
  reconnectDelayMs?: number;
  // Enable auto-start of subscriptions
  autoStart?: boolean;
}

const DEFAULT_COLLECTIONS = [
  'io.exprsn.video.post',
  'io.exprsn.video.like',
  'io.exprsn.video.comment',
  'io.exprsn.video.repost',
  'io.exprsn.video.reaction',
  'app.bsky.actor.profile',
  'app.bsky.feed.post',
  'app.bsky.feed.like',
];

const DEFAULT_CONFIG = {
  maxReconnectAttempts: 5,
  reconnectDelayMs: 1000,
  autoStart: true,
};

/**
 * Federation Consumer Worker
 *
 * Subscribes to relay firehoses and processes inbound federated content.
 */
export class FederationConsumerWorker {
  private db: PostgresJsDatabase<typeof schema>;
  private blobSync: BlobSync;
  private subscriptions: Map<string, SubscriptionState> = new Map();
  private wantedCollections: string[];
  private maxReconnectAttempts: number;
  private reconnectDelayMs: number;
  private running = false;

  constructor(config: FederationConsumerConfig) {
    this.db = config.db;
    this.blobSync = createBlobSync(config.db);
    this.wantedCollections = config.wantedCollections ?? DEFAULT_COLLECTIONS;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? DEFAULT_CONFIG.maxReconnectAttempts;
    this.reconnectDelayMs = config.reconnectDelayMs ?? DEFAULT_CONFIG.reconnectDelayMs;

    if (config.autoStart !== false) {
      // Auto-start is deferred to allow async initialization
      setImmediate(() => this.start());
    }
  }

  /**
   * Start the worker - load relays and begin subscriptions
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[FederationConsumer] Already running');
      return;
    }

    this.running = true;
    console.log('[FederationConsumer] Starting federation consumer worker...');

    // Load active relays from service registry
    const relays = await this.loadActiveRelays();
    console.log(`[FederationConsumer] Found ${relays.length} active relays`);

    // Subscribe to each relay
    for (const relay of relays) {
      await this.subscribeToRelay(relay.endpoint, relay.id);
    }

    console.log('[FederationConsumer] Federation consumer worker started');
  }

  /**
   * Stop the worker - disconnect all subscriptions
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    console.log('[FederationConsumer] Stopping federation consumer worker...');

    // Disconnect all subscriptions
    for (const [endpoint, state] of this.subscriptions) {
      if (state.socket) {
        state.socket.disconnect();
      }
      // Update sync state in database
      if (state.lastSeq) {
        await this.updateSyncState(endpoint, state.lastSeq, 'paused');
      }
    }

    this.subscriptions.clear();
    console.log('[FederationConsumer] Federation consumer worker stopped');
  }

  /**
   * Load active relays from service registry
   */
  private async loadActiveRelays(): Promise<Array<{ id: string; endpoint: string }>> {
    const relays = await this.db
      .select({
        id: schema.serviceRegistry.id,
        endpoint: schema.serviceRegistry.endpoint,
      })
      .from(schema.serviceRegistry)
      .where(
        and(
          eq(schema.serviceRegistry.type, 'relay'),
          eq(schema.serviceRegistry.status, 'active')
        )
      );

    return relays;
  }

  /**
   * Subscribe to a relay's firehose
   */
  async subscribeToRelay(endpoint: string, relayId?: string): Promise<void> {
    if (this.subscriptions.has(endpoint)) {
      console.log(`[FederationConsumer] Already subscribed to ${endpoint}`);
      return;
    }

    // Get last synced sequence for resume
    const syncState = await this.getSyncState(endpoint);
    const cursor = syncState?.lastSyncedSeq ?? undefined;

    console.log(`[FederationConsumer] Subscribing to ${endpoint}${cursor ? ` from seq ${cursor}` : ''}`);

    const state: SubscriptionState = {
      endpoint,
      socket: null,
      status: 'connecting',
      lastSeq: cursor ?? null,
      errorCount: 0,
      wantedCollections: this.wantedCollections,
    };

    this.subscriptions.set(endpoint, state);

    try {
      // Create socket connection
      const firehoseUrl = this.buildFirehoseUrl(endpoint);
      const socket = SocketIOClient(firehoseUrl, {
        transports: ['websocket'],
        query: {
          cursor: cursor?.toString(),
          wantedCollections: this.wantedCollections.join(','),
        },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelayMs,
        reconnectionDelayMax: this.reconnectDelayMs * 10,
      });

      state.socket = socket;

      // Set up event handlers
      socket.on('connect', () => {
        console.log(`[FederationConsumer] Connected to ${endpoint}`);
        state.status = 'connected';
        state.errorCount = 0;
        this.updateSyncState(endpoint, state.lastSeq, 'active');
      });

      socket.on('disconnect', (reason) => {
        console.log(`[FederationConsumer] Disconnected from ${endpoint}: ${reason}`);
        state.status = 'disconnected';
      });

      socket.on('error', (error) => {
        console.error(`[FederationConsumer] Error from ${endpoint}:`, error);
        state.status = 'error';
        state.errorCount++;

        if (state.errorCount >= this.maxReconnectAttempts) {
          this.updateSyncState(endpoint, state.lastSeq, 'error', String(error));
        }
      });

      socket.on('commit', async (frame: FirehoseFrame) => {
        await this.handleFrame(endpoint, frame);
      });

      socket.on('message', async (frame: FirehoseFrame) => {
        await this.handleFrame(endpoint, frame);
      });

      socket.connect();
    } catch (error) {
      console.error(`[FederationConsumer] Failed to subscribe to ${endpoint}:`, error);
      state.status = 'error';
      state.errorCount++;
      await this.updateSyncState(endpoint, state.lastSeq, 'error', String(error));
    }
  }

  /**
   * Unsubscribe from a relay
   */
  async unsubscribeFromRelay(endpoint: string): Promise<void> {
    const state = this.subscriptions.get(endpoint);
    if (!state) {
      return;
    }

    if (state.socket) {
      state.socket.disconnect();
    }

    if (state.lastSeq) {
      await this.updateSyncState(endpoint, state.lastSeq, 'paused');
    }

    this.subscriptions.delete(endpoint);
    console.log(`[FederationConsumer] Unsubscribed from ${endpoint}`);
  }

  /**
   * Handle a firehose frame
   */
  private async handleFrame(endpoint: string, frame: FirehoseFrame): Promise<void> {
    const state = this.subscriptions.get(endpoint);
    if (!state) {
      return;
    }

    try {
      // Handle tombstone (account deletion)
      if (frame.tombstone) {
        await this.handleTombstone(frame.did);
        state.lastSeq = frame.seq;
        return;
      }

      // Handle commit
      if (frame.commit) {
        const { collection, operation } = frame.commit;

        // Check if we want this collection
        if (!this.wantedCollections.includes(collection)) {
          state.lastSeq = frame.seq;
          return;
        }

        switch (collection) {
          case 'io.exprsn.video.post':
          case 'app.bsky.feed.post':
            await this.handleVideoPost(frame);
            break;
          case 'io.exprsn.video.like':
          case 'app.bsky.feed.like':
            await this.handleLike(frame);
            break;
          case 'io.exprsn.video.comment':
            await this.handleComment(frame);
            break;
          case 'io.exprsn.video.repost':
            await this.handleRepost(frame);
            break;
          case 'io.exprsn.video.reaction':
            await this.handleReaction(frame);
            break;
          case 'app.bsky.actor.profile':
            await this.handleProfile(frame);
            break;
          default:
            // Store as generic record
            await this.storeGenericRecord(frame);
        }
      }

      // Update cursor
      state.lastSeq = frame.seq;

      // Periodically persist cursor (every 100 events)
      if (frame.seq % 100 === 0) {
        await this.updateSyncState(endpoint, frame.seq, 'active');
      }
    } catch (error) {
      console.error(`[FederationConsumer] Error handling frame from ${endpoint}:`, error);
      state.errorCount++;
    }
  }

  /**
   * Handle video post creation/update/delete
   */
  private async handleVideoPost(frame: FirehoseFrame): Promise<void> {
    if (!frame.commit) return;

    const { operation, rkey, record, cid, blobs } = frame.commit;
    const did = frame.did;
    const uri = `at://${did}/io.exprsn.video.post/${rkey}`;

    if (operation === 'delete') {
      // Delete the video from database
      await this.db
        .delete(schema.videos)
        .where(eq(schema.videos.uri, uri));
      return;
    }

    // For create/update, process the record
    const videoRecord = record as {
      $type?: string;
      video?: {
        ref?: { $link: string };
        mimeType?: string;
        size?: number;
      };
      caption?: string;
      tags?: string[];
      createdAt?: string;
    };

    if (!videoRecord) return;

    // Sync blobs if present
    if (blobs && blobs.length > 0) {
      const blobResults = await this.blobSync.syncCommitBlobs(did, blobs);
      if (blobResults.failed.length > 0) {
        console.warn(`[FederationConsumer] Failed to sync blobs for ${did}/${rkey}:`, blobResults.failed);
      }
    }

    // Build video URL from blob if available
    const cdnUrl = videoRecord.video?.ref?.$link
      ? `/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(videoRecord.video.ref.$link)}`
      : undefined;

    // Upsert video record - uses uri as primary key, not id
    await this.db
      .insert(schema.videos)
      .values({
        uri,
        cid: cid || nanoid(),
        authorDid: did,
        caption: videoRecord.caption || null,
        tags: videoRecord.tags || [],
        cdnUrl,
        visibility: 'public',
        allowComments: true,
        allowDuet: true,
        allowStitch: true,
        createdAt: videoRecord.createdAt ? new Date(videoRecord.createdAt) : new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.videos.uri],
        set: {
          cid: cid || sql`${schema.videos.cid}`,
          caption: videoRecord.caption,
          tags: videoRecord.tags,
          indexedAt: new Date(),
        },
      });

    console.log(`[FederationConsumer] Indexed video: ${uri}`);
  }

  /**
   * Handle like creation/deletion
   */
  private async handleLike(frame: FirehoseFrame): Promise<void> {
    if (!frame.commit) return;

    const { operation, rkey, record, cid } = frame.commit;
    const did = frame.did;
    const uri = `at://${did}/io.exprsn.video.like/${rkey}`;

    const likeRecord = record as {
      subject?: { uri: string; cid?: string };
      createdAt?: string;
    };

    if (operation === 'delete') {
      await this.db
        .delete(schema.likes)
        .where(eq(schema.likes.uri, uri));
      return;
    }

    if (!likeRecord?.subject?.uri) return;

    // The subject URI is the video URI
    const videoUri = likeRecord.subject.uri;

    await this.db
      .insert(schema.likes)
      .values({
        uri,
        cid: cid || nanoid(),
        videoUri,
        authorDid: did,
        createdAt: likeRecord.createdAt ? new Date(likeRecord.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  }

  /**
   * Handle comment creation/update/deletion
   */
  private async handleComment(frame: FirehoseFrame): Promise<void> {
    if (!frame.commit) return;

    const { operation, rkey, record, cid } = frame.commit;
    const did = frame.did;
    const uri = `at://${did}/io.exprsn.video.comment/${rkey}`;

    const commentRecord = record as {
      subject?: { uri: string; cid?: string };
      text?: string;
      parent?: { uri: string; cid?: string };
      createdAt?: string;
    };

    if (operation === 'delete') {
      await this.db
        .delete(schema.comments)
        .where(eq(schema.comments.uri, uri));
      return;
    }

    if (!commentRecord?.subject?.uri || !commentRecord.text) return;

    // The subject URI is the video URI
    const videoUri = commentRecord.subject.uri;

    // Parent URI if this is a reply
    const parentUri = commentRecord.parent?.uri || null;

    await this.db
      .insert(schema.comments)
      .values({
        uri,
        cid: cid || nanoid(),
        authorDid: did,
        videoUri,
        text: commentRecord.text,
        parentUri,
        createdAt: commentRecord.createdAt ? new Date(commentRecord.createdAt) : new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.comments.uri],
        set: {
          text: commentRecord.text,
          indexedAt: new Date(),
        },
      });
  }

  /**
   * Handle repost creation/deletion
   */
  private async handleRepost(frame: FirehoseFrame): Promise<void> {
    if (!frame.commit) return;

    const { operation, rkey, record, cid } = frame.commit;
    const did = frame.did;
    const uri = `at://${did}/io.exprsn.video.repost/${rkey}`;

    const repostRecord = record as {
      subject?: { uri: string; cid?: string };
      createdAt?: string;
    };

    if (operation === 'delete') {
      await this.db
        .delete(schema.reposts)
        .where(eq(schema.reposts.uri, uri));
      return;
    }

    if (!repostRecord?.subject?.uri) return;

    // The subject URI is the video URI
    const videoUri = repostRecord.subject.uri;

    await this.db
      .insert(schema.reposts)
      .values({
        uri,
        cid: cid || nanoid(),
        videoUri,
        authorDid: did,
        createdAt: repostRecord.createdAt ? new Date(repostRecord.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  }

  /**
   * Handle reaction creation/deletion
   */
  private async handleReaction(frame: FirehoseFrame): Promise<void> {
    if (!frame.commit) return;

    const { operation, rkey, record } = frame.commit;
    const did = frame.did;

    const reactionRecord = record as {
      subject?: { uri: string; cid?: string };
      reactionType?: string;
      createdAt?: string;
    };

    if (operation === 'delete') {
      await this.db
        .delete(schema.videoReactions)
        .where(eq(schema.videoReactions.id, rkey));
      return;
    }

    if (!reactionRecord?.subject?.uri || !reactionRecord.reactionType) return;

    // The subject URI is the video URI
    const videoUri = reactionRecord.subject.uri;

    await this.db
      .insert(schema.videoReactions)
      .values({
        id: rkey,
        videoUri,
        authorDid: did,
        reactionType: reactionRecord.reactionType,
        createdAt: reactionRecord.createdAt ? new Date(reactionRecord.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  }

  /**
   * Handle profile updates
   */
  private async handleProfile(frame: FirehoseFrame): Promise<void> {
    if (!frame.commit) return;

    const { record } = frame.commit;
    const did = frame.did;

    const profileRecord = record as {
      displayName?: string;
      description?: string;
      avatar?: { ref?: { $link: string } };
    };

    if (!profileRecord) return;

    // Update or create user record
    const avatar = profileRecord.avatar?.ref?.$link
      ? `/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(profileRecord.avatar.ref.$link)}`
      : undefined;

    await this.db
      .update(schema.users)
      .set({
        displayName: profileRecord.displayName,
        bio: profileRecord.description,
        avatar,
        indexedAt: new Date(),
      })
      .where(eq(schema.users.did, did));
  }

  /**
   * Handle account tombstone (deletion)
   */
  private async handleTombstone(did: string): Promise<void> {
    console.log(`[FederationConsumer] Processing tombstone for ${did}`);

    // Delete all content from this DID
    await this.db
      .delete(schema.videos)
      .where(eq(schema.videos.authorDid, did));

    await this.db
      .delete(schema.comments)
      .where(eq(schema.comments.authorDid, did));

    await this.db
      .delete(schema.likes)
      .where(eq(schema.likes.authorDid, did));

    await this.db
      .delete(schema.reposts)
      .where(eq(schema.reposts.authorDid, did));
  }

  /**
   * Store a generic record we don't have special handling for
   */
  private async storeGenericRecord(frame: FirehoseFrame): Promise<void> {
    if (!frame.commit) return;

    const { collection, rkey, record, cid } = frame.commit;
    const did = frame.did;
    const uri = `at://${did}/${collection}/${rkey}`;

    await this.db
      .insert(schema.repoRecords)
      .values({
        uri,
        cid: cid || nanoid(),
        did,
        collection,
        rkey,
        record,
        indexedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.repoRecords.uri,
        set: {
          cid,
          record,
          indexedAt: new Date(),
        },
      });
  }

  /**
   * Build firehose WebSocket URL
   */
  private buildFirehoseUrl(endpoint: string): string {
    // Convert HTTP endpoint to WebSocket firehose endpoint
    const url = new URL(endpoint);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/xrpc/com.atproto.sync.subscribeRepos';
    return url.toString();
  }

  /**
   * Get sync state for an endpoint
   */
  private async getSyncState(endpoint: string): Promise<{
    lastSyncedSeq: number | null;
    status: string;
  } | null> {
    const results = await this.db
      .select({
        lastSyncedSeq: schema.federationSyncState.lastSyncedSeq,
        status: schema.federationSyncState.status,
      })
      .from(schema.federationSyncState)
      .where(eq(schema.federationSyncState.remoteEndpoint, endpoint))
      .limit(1);

    return results[0] ?? null;
  }

  /**
   * Update sync state for an endpoint
   */
  private async updateSyncState(
    endpoint: string,
    seq: number | null,
    status: 'active' | 'paused' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insert(schema.federationSyncState)
      .values({
        id: `sync_${nanoid(10)}`,
        remoteEndpoint: endpoint,
        syncDirection: 'pull',
        status,
        lastSyncedSeq: seq,
        lastSyncedAt: status === 'active' ? now : undefined,
        errorMessage,
        errorCount: status === 'error' ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.federationSyncState.remoteEndpoint,
        set: {
          status,
          lastSyncedSeq: seq,
          lastSyncedAt: status === 'active' ? now : undefined,
          errorMessage,
          errorCount:
            status === 'error'
              ? sql`${schema.federationSyncState.errorCount} + 1`
              : 0,
          updatedAt: now,
        },
      });
  }

  /**
   * Get status of all subscriptions
   */
  getStatus(): Map<string, { status: string; lastSeq: number | null; errorCount: number }> {
    const status = new Map<string, { status: string; lastSeq: number | null; errorCount: number }>();

    for (const [endpoint, state] of this.subscriptions) {
      status.set(endpoint, {
        status: state.status,
        lastSeq: state.lastSeq,
        errorCount: state.errorCount,
      });
    }

    return status;
  }

  /**
   * Add a new relay at runtime
   */
  async addRelay(endpoint: string): Promise<void> {
    // Register in service registry
    await this.db
      .insert(schema.serviceRegistry)
      .values({
        id: `relay_${nanoid(10)}`,
        type: 'relay',
        endpoint,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    // Subscribe if worker is running
    if (this.running) {
      await this.subscribeToRelay(endpoint);
    }
  }

  /**
   * Remove a relay
   */
  async removeRelay(endpoint: string): Promise<void> {
    // Unsubscribe
    await this.unsubscribeFromRelay(endpoint);

    // Mark as inactive in registry
    await this.db
      .update(schema.serviceRegistry)
      .set({
        status: 'inactive',
        updatedAt: new Date(),
      })
      .where(eq(schema.serviceRegistry.endpoint, endpoint));
  }
}

/**
 * Create and optionally start federation consumer worker
 */
export function createFederationConsumer(
  db: PostgresJsDatabase<typeof schema>,
  options?: Partial<FederationConsumerConfig>
): FederationConsumerWorker {
  return new FederationConsumerWorker({
    db,
    ...options,
  });
}

// Global worker instance (lazy initialized)
let workerInstance: FederationConsumerWorker | null = null;

/**
 * Get or create the federation consumer worker
 */
export function getFederationConsumer(
  db: PostgresJsDatabase<typeof schema>
): FederationConsumerWorker {
  if (!workerInstance) {
    workerInstance = createFederationConsumer(db, { autoStart: false });
  }
  return workerInstance;
}

/**
 * Initialize and start the federation consumer worker
 */
export async function initializeFederationConsumer(
  db: PostgresJsDatabase<typeof schema>,
  options?: Partial<FederationConsumerConfig>
): Promise<FederationConsumerWorker> {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = createFederationConsumer(db, { ...options, autoStart: false });
  await workerInstance.start();

  return workerInstance;
}
