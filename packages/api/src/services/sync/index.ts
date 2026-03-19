import { db } from '../../db/index.js';
import { repositories, repoBlobs, repoCommits, repoRecords, syncEvents, syncSubscriptions } from '../../db/schema.js';
import { eq, desc, gt, lt, and, inArray } from 'drizzle-orm';
import type { Context } from 'hono';
import type { SSEStreamingApi } from 'hono/streaming';
import { EventEmitter } from 'events';
import { CID } from 'multiformats/cid';
import { CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';
import { getStorageProvider } from '../storage/index.js';

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

    if (!blob.url) {
      return null;
    }

    // Fetch actual blob data from storage (S3/MinIO/Azure)
    try {
      const storage = await getStorageProvider();
      const data = await storage.downloadFile(blob.url);
      return {
        data: Buffer.from(data),
        mimeType: blob.mimeType,
        size: data.length,
      };
    } catch (err) {
      console.error(`getBlob: failed to fetch ${blob.url}:`, err);
      return null;
    }
  }

  /**
   * Get repository blocks as CAR
   */
  async getBlocks(did: string, cids: string[]): Promise<Buffer> {
    if (cids.length === 0) {
      return Buffer.from('');
    }

    try {
      // Fetch blocks from repo_records and repo_blobs
      const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];

      // Get records that match the CIDs
      const records = await db
        .select()
        .from(repoRecords)
        .where(and(eq(repoRecords.did, did), inArray(repoRecords.cid, cids)));

      for (const record of records) {
        if (record.cid && record.record) {
          const cid = CID.parse(record.cid);
          const bytes = dagCbor.encode(record.record);
          blocks.push({ cid, bytes });
        }
      }

      // Also check blobs
      const blobs = await db
        .select()
        .from(repoBlobs)
        .where(and(eq(repoBlobs.did, did), inArray(repoBlobs.cid, cids)));

      for (const blob of blobs) {
        if (blob.cid && blob.url) {
          try {
            const storage = await getStorageProvider();
            const data = await storage.downloadFile(blob.url);
            const cid = CID.parse(blob.cid);
            blocks.push({ cid, bytes: new Uint8Array(data) });
          } catch (err) {
            console.warn(`Failed to fetch blob ${blob.cid}:`, err);
          }
        }
      }

      if (blocks.length === 0) {
        return Buffer.from('');
      }

      // Create CAR with first CID as root
      const firstBlock = blocks[0];
      if (!firstBlock) {
        return Buffer.from('');
      }
      return Buffer.from(await this.createCarFromBlocks(firstBlock.cid, blocks));
    } catch (error) {
      console.error('getBlocks error:', error);
      return Buffer.from('');
    }
  }

  /**
   * Helper to create CAR file from blocks
   */
  private async createCarFromBlocks(
    rootCid: CID,
    blocks: Array<{ cid: CID; bytes: Uint8Array }>
  ): Promise<Uint8Array> {
    const { writer, out } = CarWriter.create([rootCid]);

    const chunks: Uint8Array[] = [];
    const outPromise = (async () => {
      for await (const chunk of out) {
        chunks.push(chunk);
      }
    })();

    for (const block of blocks) {
      await writer.put(block);
    }
    await writer.close();
    await outPromise;

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Get complete repository checkout
   */
  async getCheckout(did: string): Promise<Buffer | null> {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.did, did),
    });

    if (!repo || !repo.head) {
      return null;
    }

    try {
      // Get all records for this DID
      const records = await db
        .select()
        .from(repoRecords)
        .where(eq(repoRecords.did, did));

      if (records.length === 0) {
        return null;
      }

      const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];

      // Build a commit block
      const recordCids: string[] = [];

      for (const record of records) {
        if (record.cid && record.record) {
          const cid = CID.parse(record.cid);
          const bytes = dagCbor.encode(record.record);
          blocks.push({ cid, bytes });
          recordCids.push(record.cid);
        }
      }

      // Create a simple MST-like structure for the data
      // In a full implementation, this would be a proper Merkle Search Tree
      const dataBlock = dagCbor.encode({
        records: recordCids,
        did,
      });
      const dataHash = await sha256.digest(dataBlock);
      const dataCid = CID.create(1, dagCbor.code, dataHash);
      blocks.push({ cid: dataCid, bytes: dataBlock });

      // Create commit block — reference the CID object, not its raw bytes,
      // so DAG-CBOR encodes it as a proper CID link (tag 42).
      const commitBlock = dagCbor.encode({
        did,
        version: 3,
        data: dataCid,
        rev: repo.rev || '1',
        prev: null,
      });
      const commitHash = await sha256.digest(commitBlock);
      const commitCid = CID.create(1, dagCbor.code, commitHash);
      blocks.push({ cid: commitCid, bytes: commitBlock });

      return Buffer.from(await this.createCarFromBlocks(commitCid, blocks));
    } catch (error) {
      console.error('getCheckout error:', error);
      return null;
    }
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
    try {
      // Build the record URI
      const recordUri = `at://${input.did}/${input.collection}/${input.rkey}`;

      // Find the record
      const record = await db.query.repoRecords.findFirst({
        where: eq(repoRecords.uri, recordUri),
      });

      if (!record || !record.cid || !record.record) {
        return null;
      }

      const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];

      // Add the record block
      const recordCid = CID.parse(record.cid);
      const recordBytes = dagCbor.encode(record.record);
      blocks.push({ cid: recordCid, bytes: recordBytes });

      // In a full implementation, we'd also include merkle proof blocks
      // For now, just return the record in a CAR

      return Buffer.from(await this.createCarFromBlocks(recordCid, blocks));
    } catch (error) {
      console.error('getRecord error:', error);
      return null;
    }
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

    try {
      // Build query for records
      let recordsQuery = db
        .select()
        .from(repoRecords)
        .where(eq(repoRecords.did, did));

      // If 'since' is provided, only get records after that commit
      // In a full implementation, this would use commit history
      // For now, we'll use indexedAt as an approximation
      if (since) {
        const sinceDate = new Date(since);
        recordsQuery = db
          .select()
          .from(repoRecords)
          .where(and(
            eq(repoRecords.did, did),
            gt(repoRecords.indexedAt, sinceDate)
          ));
      }

      const records = await recordsQuery;

      if (records.length === 0 && !since) {
        return null;
      }

      const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];
      const recordCids: string[] = [];

      // Encode all records
      for (const record of records) {
        if (record.cid && record.record) {
          const cid = CID.parse(record.cid);
          const bytes = dagCbor.encode(record.record);
          blocks.push({ cid, bytes });
          recordCids.push(record.cid);
        }
      }

      // Also include blobs
      const blobs = await db
        .select()
        .from(repoBlobs)
        .where(eq(repoBlobs.did, did));

      for (const blob of blobs) {
        if (blob.cid && blob.url) {
          try {
            const storage = await getStorageProvider();
            const data = await storage.downloadFile(blob.url);
            const cid = CID.parse(blob.cid);
            blocks.push({ cid, bytes: new Uint8Array(data) });
          } catch {
            // Skip blobs that can't be fetched
          }
        }
      }

      if (blocks.length === 0) {
        return Buffer.from('');
      }

      // Create a data block summarizing the repo
      const dataBlock = dagCbor.encode({
        records: recordCids,
        did,
        since: since || null,
      });
      const dataHash = await sha256.digest(dataBlock);
      const dataCid = CID.create(1, dagCbor.code, dataHash);
      blocks.push({ cid: dataCid, bytes: dataBlock });

      // Create commit block — reference the CID object so DAG-CBOR encodes it
      // as a proper CID link (tag 42), not raw bytes.
      const commitBlock = dagCbor.encode({
        did,
        version: 3,
        data: dataCid,
        rev: repo.rev || '1',
        prev: null,
      });
      const commitHash = await sha256.digest(commitBlock);
      const commitCid = CID.create(1, dagCbor.code, commitHash);
      blocks.push({ cid: commitCid, bytes: commitBlock });

      return Buffer.from(await this.createCarFromBlocks(commitCid, blocks));
    } catch (error) {
      console.error('getRepo error:', error);
      return null;
    }
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
   * Raw WebSocket upgrade is handled in index.ts via the `ws` server.
   * This method returns a 426 to signal that the caller should connect
   * as a raw WebSocket — the upgrade handler in index.ts intercepts the
   * request before it reaches Hono for the actual WebSocket path.
   */
  async subscribeWebSocket(c: Context, cursor?: number): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: 'WebSocketRequired',
        message: 'Connect via raw WebSocket to /xrpc/com.atproto.sync.subscribeRepos',
        cursor: cursor || 0,
      }),
      {
        status: 426,
        headers: {
          'Content-Type': 'application/json',
          Upgrade: 'websocket',
        },
      }
    );
  }

  /**
   * Register a listener for raw firehose events.
   * Used by the raw WebSocket handler in index.ts.
   */
  onFirehoseEvent(listener: (event: any) => void): void {
    firehose.on('event', listener);
  }

  /**
   * Remove a firehose event listener.
   */
  offFirehoseEvent(listener: (event: any) => void): void {
    firehose.off('event', listener);
  }

  /**
   * Get the underlying FirehoseEmitter (for backfill queries).
   */
  getFirehose(): FirehoseEmitter {
    return firehose;
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
