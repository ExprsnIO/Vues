import { db } from '../../db/index.js';
import { repositories, repoBlobs, repoCommits, syncEvents, syncSubscriptions } from '../../db/schema.js';
import { eq, desc, gt, lt } from 'drizzle-orm';
import type { Context } from 'hono';
import type { SSEStreamingApi } from 'hono/streaming';
import { EventEmitter } from 'events';

/**
 * Sync Service
 * Manages AT Protocol repository synchronization and firehose
 */

export interface BlobResult {
  data: Buffer;
  mimeType: string;
  size: number;
}

export interface CommitResult {
  cid: string;
  rev: number;
}

export interface ListBlobsInput {
  did: string;
  since?: string;
  limit?: number;
  cursor?: string;
}

export interface ListReposInput {
  limit?: number;
  cursor?: string;
}

export interface GetRecordInput {
  did: string;
  collection: string;
  rkey: string;
  commit?: string;
}

/**
 * Firehose event emitter
 * Broadcasts repository events to all connected subscribers
 */
class FirehoseEmitter extends EventEmitter {
  private sequence = 0;

  emitEvent(event: {
    seq: number;
    did: string;
    eventType: 'commit' | 'identity' | 'account';
    commit?: string;
    ops?: Array<{
      action: 'create' | 'update' | 'delete';
      path: string;
      cid?: string;
    }>;
    blocks?: Record<string, unknown>;
    rebase?: boolean;
    tooBig?: boolean;
  }) {
    this.emit('event', event);
  }

  async recordEvent(event: Omit<typeof syncEvents.$inferInsert, 'id'>) {
    // Store event in database
    await db.insert(syncEvents).values({
      ...event,
      seq: this.sequence++,
    });

    // Emit to subscribers
    this.emitEvent({
      seq: event.seq,
      did: event.did,
      eventType: event.eventType as 'commit' | 'identity' | 'account',
      commit: event.commit || undefined,
      ops: event.ops as any,
      blocks: event.blocks as any,
      rebase: event.rebase,
      tooBig: event.tooBig,
    });
  }

  getSequence(): number {
    return this.sequence;
  }

  async initializeSequence() {
    // Get last sequence number from database
    const lastEvent = await db
      .select({ seq: syncEvents.seq })
      .from(syncEvents)
      .orderBy(desc(syncEvents.seq))
      .limit(1);

    if (lastEvent[0]) {
      this.sequence = lastEvent[0].seq + 1;
    }
  }
}

const firehose = new FirehoseEmitter();
await firehose.initializeSequence();

export class SyncService {
  /**
   * Get a blob by CID
   */
  async getBlob(did: string, cid: string): Promise<BlobResult | null> {
    const blob = await db.query.repoBlobs.findFirst({
      where: eq(repoBlobs.cid, cid),
    });

    if (!blob || blob.did !== did) {
      return null;
    }

    // In production, fetch from S3/MinIO
    // For now, return empty buffer
    return {
      data: Buffer.from(''),
      mimeType: blob.mimeType,
      size: blob.size,
    };
  }

  /**
   * Get repository blocks as CAR
   */
  async getBlocks(did: string, cids: string[]): Promise<Buffer> {
    // In production, fetch blocks from repository storage
    // Return CAR-encoded blocks
    return Buffer.from(''); // Placeholder
  }

  /**
   * Get complete repository checkout
   */
  async getCheckout(did: string): Promise<Buffer | null> {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.did, did),
    });

    if (!repo) {
      return null;
    }

    // Return CAR-encoded repository
    return Buffer.from(''); // Placeholder
  }

  /**
   * Get repository head CID
   */
  async getHead(did: string): Promise<string | null> {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.did, did),
    });

    return repo?.head || null;
  }

  /**
   * Get latest commit
   */
  async getLatestCommit(did: string): Promise<CommitResult | null> {
    const commit = await db.query.repoCommits.findFirst({
      where: eq(repoCommits.did, did),
      orderBy: [desc(repoCommits.rev)],
    });

    if (!commit) {
      return null;
    }

    return {
      cid: commit.cid,
      rev: parseInt(commit.rev, 10) || 0,
    };
  }

  /**
   * Get a specific record with proof
   */
  async getRecord(input: GetRecordInput): Promise<Buffer | null> {
    // Return CAR-encoded record with merkle proof
    return Buffer.from(''); // Placeholder
  }

  /**
   * Get complete repository as CAR
   */
  async getRepo(did: string, since?: string): Promise<Buffer | null> {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.did, did),
    });

    if (!repo) {
      return null;
    }

    // Return CAR-encoded repository (optionally filtered by since)
    return Buffer.from(''); // Placeholder
  }

  /**
   * List blobs for a repository
   */
  async listBlobs(input: ListBlobsInput): Promise<{
    cids: string[];
    cursor?: string;
  }> {
    const limit = input.limit || 500;

    const blobs = await db
      .select({ cid: repoBlobs.cid })
      .from(repoBlobs)
      .where(eq(repoBlobs.did, input.did))
      .limit(limit + 1);

    const hasMore = blobs.length > limit;
    const cids = blobs.slice(0, limit).map((b) => b.cid);

    return {
      cids,
      cursor: hasMore ? cids[cids.length - 1] : undefined,
    };
  }

  /**
   * List repositories on this server
   */
  async listRepos(input: ListReposInput): Promise<{
    repos: Array<{
      did: string;
      head: string;
      rev: string;
    }>;
    cursor?: string;
  }> {
    const limit = input.limit || 500;

    const repos = await db
      .select()
      .from(repositories)
      .orderBy(repositories.did)
      .limit(limit + 1);

    const hasMore = repos.length > limit;
    const repoList = repos.slice(0, limit);

    return {
      repos: repoList.map((r) => ({
        did: r.did,
        head: r.head || '',
        rev: r.rev.toString(),
      })),
      cursor: hasMore ? repoList[repoList.length - 1]?.did : undefined,
    };
  }

  /**
   * Subscribe to firehose via WebSocket
   * Note: WebSocket subscriptions should use the Socket.IO endpoint at /xrpc/com.atproto.sync.subscribeRepos
   * This method is only used for compatibility and returns an error suggesting the Socket.IO endpoint.
   */
  async subscribeWebSocket(c: Context, cursor?: number): Promise<Response> {
    // In Node.js with Hono, WebSocket handling is done via Socket.IO in index.ts
    // Return an error with instructions to use the Socket.IO endpoint
    return new Response(
      JSON.stringify({
        error: 'WebSocketRequired',
        message: 'Please connect via WebSocket to /xrpc/com.atproto.sync.subscribeRepos',
        cursor: cursor || 0,
      }),
      {
        status: 426, // Upgrade Required
        headers: {
          'Content-Type': 'application/json',
          'Upgrade': 'websocket',
        },
      }
    );
  }

  /**
   * Subscribe to firehose via SSE
   */
  async subscribeSSE(stream: SSEStreamingApi, cursor?: number): Promise<void> {
    const startSeq = cursor || 0;

    // Send historical events
    const events = await db
      .select()
      .from(syncEvents)
      .where(gt(syncEvents.seq, startSeq))
      .orderBy(syncEvents.seq)
      .limit(1000);

    for (const event of events) {
      await stream.writeSSE({
        data: JSON.stringify({
          seq: event.seq,
          did: event.did,
          eventType: event.eventType,
          commit: event.commit,
          ops: event.ops,
          blocks: event.blocks,
          rebase: event.rebase,
          tooBig: event.tooBig,
          time: event.createdAt.toISOString(),
        }),
      });
    }

    // Subscribe to live events
    const handler = async (event: any) => {
      if (event.seq > startSeq) {
        await stream.writeSSE({
          data: JSON.stringify({
            ...event,
            time: new Date().toISOString(),
          }),
        });
      }
    };

    firehose.on('event', handler);

    // Keep connection alive
    return new Promise((resolve) => {
      stream.onAbort(() => {
        firehose.off('event', handler);
        resolve();
      });
    });
  }

  /**
   * Notify of repository update
   */
  async notifyOfUpdate(hostname: string): Promise<void> {
    // Trigger crawl of remote repository
    console.log(`Notified of update from: ${hostname}`);
  }

  /**
   * Request crawl of repository
   */
  async requestCrawl(hostname: string): Promise<void> {
    // Queue crawl request
    console.log(`Crawl requested for: ${hostname}`);
  }

  /**
   * Emit a commit event to the firehose
   */
  async emitCommitEvent(
    did: string,
    commit: string,
    ops: Array<{
      action: 'create' | 'update' | 'delete';
      path: string;
      cid?: string;
    }>
  ): Promise<void> {
    await firehose.recordEvent({
      seq: firehose.getSequence(),
      did,
      eventType: 'commit',
      commit,
      ops,
      blocks: {},
      rebase: false,
      tooBig: false,
      createdAt: new Date(),
    });
  }
}

/**
 * Singleton instance
 */
export const syncService = new SyncService();

export default SyncService;
