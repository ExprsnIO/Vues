import { Repository, WriteOp, RepoRecord } from '@exprsn/pds';
import { db } from '../../db/index.js';
import { repositories, repoRecords, repoBlobs } from '../../db/schema.js';
import { eq, and, desc, asc, gt, lt } from 'drizzle-orm';
import { CID } from 'multiformats/cid';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';
import { nanoid } from 'nanoid';

/**
 * Repository Service
 * Manages AT Protocol repositories and records
 */

export interface CreateRecordInput {
  did: string;
  collection: string;
  rkey?: string;
  record: unknown;
  validate?: boolean;
}

export interface GetRecordInput {
  did: string;
  collection: string;
  rkey: string;
  cid?: string;
}

export interface ListRecordsInput {
  did: string;
  collection: string;
  limit?: number;
  cursor?: string;
  reverse?: boolean;
}

export interface PutRecordInput {
  did: string;
  collection: string;
  rkey: string;
  record: unknown;
  validate?: boolean;
  swapRecord?: string;
}

export interface DeleteRecordInput {
  did: string;
  collection: string;
  rkey: string;
  swapRecord?: string;
}

export interface ApplyWritesInput {
  did: string;
  writes: WriteOp[];
  validate?: boolean;
}

export interface UploadBlobInput {
  did: string;
  blob: Buffer;
  mimeType: string;
}

export interface RecordResult {
  uri: string;
  cid: string;
  value?: unknown;
}

/**
 * Repository Service
 */
export class RepositoryService {
  /**
   * Initialize repository for a user
   */
  async initializeRepo(did: string): Promise<void> {
    // Check if repo already exists
    const existing = await db.query.repositories.findFirst({
      where: eq(repositories.did, did),
    });

    if (existing) {
      return;
    }

    // Create empty repository entry
    await db.insert(repositories).values({
      did,
      head: null,
      rev: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Create a new record
   */
  async createRecord(input: CreateRecordInput): Promise<RecordResult> {
    // Ensure repo exists
    await this.initializeRepo(input.did);

    // Generate rkey if not provided
    const rkey = input.rkey || this.generateTid();
    const uri = `at://${input.did}/${input.collection}/${rkey}`;

    // Create CID for record
    const recordBytes = dagCbor.encode(input.record);
    const recordHash = await sha256.digest(recordBytes);
    const recordCid = CID.create(1, dagCbor.code, recordHash);
    const cidStr = recordCid.toString();

    // Store record in database
    await db.insert(repoRecords).values({
      did: input.did,
      collection: input.collection,
      rkey,
      uri,
      cid: cidStr,
      value: input.record,
      createdAt: new Date(),
      indexedAt: new Date(),
    });

    // Update repo revision
    await this.incrementRev(input.did);

    return {
      uri,
      cid: cidStr,
    };
  }

  /**
   * Get a record
   */
  async getRecord(input: GetRecordInput): Promise<RecordResult | null> {
    const record = await db.query.repoRecords.findFirst({
      where: and(
        eq(repoRecords.did, input.did),
        eq(repoRecords.collection, input.collection),
        eq(repoRecords.rkey, input.rkey)
      ),
    });

    if (!record) {
      return null;
    }

    // If specific CID requested, verify it matches
    if (input.cid && record.cid !== input.cid) {
      return null;
    }

    return {
      uri: record.uri,
      cid: record.cid,
      value: record.value,
    };
  }

  /**
   * List records in a collection
   */
  async listRecords(input: ListRecordsInput): Promise<{
    records: Array<{
      uri: string;
      cid: string;
      value: unknown;
    }>;
    cursor?: string;
  }> {
    const limit = input.limit || 50;

    // Build query with cursor
    const conditions = [
      eq(repoRecords.did, input.did),
      eq(repoRecords.collection, input.collection),
    ];

    if (input.cursor) {
      if (input.reverse) {
        conditions.push(lt(repoRecords.rkey, input.cursor));
      } else {
        conditions.push(gt(repoRecords.rkey, input.cursor));
      }
    }

    const results = await db
      .select()
      .from(repoRecords)
      .where(and(...conditions))
      .orderBy(input.reverse ? desc(repoRecords.rkey) : asc(repoRecords.rkey))
      .limit(limit + 1); // Fetch one extra to check if there are more

    const hasMore = results.length > limit;
    const records = results.slice(0, limit);

    return {
      records: records.map((r) => ({
        uri: r.uri,
        cid: r.cid,
        value: r.value,
      })),
      cursor: hasMore ? records[records.length - 1]?.rkey : undefined,
    };
  }

  /**
   * Put record (upsert)
   */
  async putRecord(input: PutRecordInput): Promise<RecordResult> {
    // Ensure repo exists
    await this.initializeRepo(input.did);

    const uri = `at://${input.did}/${input.collection}/${input.rkey}`;

    // Check if record exists
    const existing = await db.query.repoRecords.findFirst({
      where: and(
        eq(repoRecords.did, input.did),
        eq(repoRecords.collection, input.collection),
        eq(repoRecords.rkey, input.rkey)
      ),
    });

    // Verify swapRecord if provided
    if (input.swapRecord && existing && existing.cid !== input.swapRecord) {
      throw new Error('Record CID mismatch (swapRecord failed)');
    }

    // Create new CID
    const recordBytes = dagCbor.encode(input.record);
    const recordHash = await sha256.digest(recordBytes);
    const recordCid = CID.create(1, dagCbor.code, recordHash);
    const cidStr = recordCid.toString();

    if (existing) {
      // Update existing record
      await db
        .update(repoRecords)
        .set({
          cid: cidStr,
          value: input.record,
          indexedAt: new Date(),
        })
        .where(
          and(
            eq(repoRecords.did, input.did),
            eq(repoRecords.collection, input.collection),
            eq(repoRecords.rkey, input.rkey)
          )
        );
    } else {
      // Insert new record
      await db.insert(repoRecords).values({
        did: input.did,
        collection: input.collection,
        rkey: input.rkey,
        uri,
        cid: cidStr,
        value: input.record,
        createdAt: new Date(),
        indexedAt: new Date(),
      });
    }

    // Update repo revision
    await this.incrementRev(input.did);

    return {
      uri,
      cid: cidStr,
    };
  }

  /**
   * Delete a record
   */
  async deleteRecord(input: DeleteRecordInput): Promise<void> {
    // Check if record exists
    const existing = await db.query.repoRecords.findFirst({
      where: and(
        eq(repoRecords.did, input.did),
        eq(repoRecords.collection, input.collection),
        eq(repoRecords.rkey, input.rkey)
      ),
    });

    if (!existing) {
      throw new Error('Record not found');
    }

    // Verify swapRecord if provided
    if (input.swapRecord && existing.cid !== input.swapRecord) {
      throw new Error('Record CID mismatch (swapRecord failed)');
    }

    // Delete the record
    await db
      .delete(repoRecords)
      .where(
        and(
          eq(repoRecords.did, input.did),
          eq(repoRecords.collection, input.collection),
          eq(repoRecords.rkey, input.rkey)
        )
      );

    // Update repo revision
    await this.incrementRev(input.did);
  }

  /**
   * Apply multiple writes atomically
   */
  async applyWrites(input: ApplyWritesInput): Promise<RecordResult[]> {
    const results: RecordResult[] = [];

    // Execute writes in a transaction
    await db.transaction(async (tx) => {
      for (const write of input.writes) {
        if (write.action === 'create') {
          const result = await this.createRecord({
            did: input.did,
            collection: write.collection,
            rkey: write.rkey,
            record: write.value,
            validate: input.validate,
          });
          results.push(result);
        } else if (write.action === 'update') {
          const result = await this.putRecord({
            did: input.did,
            collection: write.collection,
            rkey: write.rkey,
            record: write.value,
            validate: input.validate,
          });
          results.push(result);
        } else if (write.action === 'delete') {
          await this.deleteRecord({
            did: input.did,
            collection: write.collection,
            rkey: write.rkey,
          });
        }
      }
    });

    return results;
  }

  /**
   * Describe a repository
   */
  async describeRepo(did: string): Promise<{
    handle: string;
    did: string;
    didDoc: unknown;
    collections: string[];
    handleIsCorrect: boolean;
  } | null> {
    // Get repository
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.did, did),
    });

    if (!repo) {
      return null;
    }

    // Get user info
    const user = await db.query.users.findFirst({
      where: eq(db.query.users.did, did),
    });

    // Get collections
    const recordResults = await db
      .select({ collection: repoRecords.collection })
      .from(repoRecords)
      .where(eq(repoRecords.did, did))
      .groupBy(repoRecords.collection);

    const collections = [...new Set(recordResults.map((r) => r.collection))];

    return {
      handle: user?.handle || 'unknown',
      did,
      didDoc: {}, // Would fetch from PLC/DID resolver
      collections,
      handleIsCorrect: true,
    };
  }

  /**
   * Upload a blob
   */
  async uploadBlob(input: UploadBlobInput): Promise<{ cid: string; url: string }> {
    // Create CID for blob
    const blobHash = await sha256.digest(input.blob);
    const blobCid = CID.create(1, 0x55, blobHash); // Raw codec
    const cidStr = blobCid.toString();

    // Store blob metadata (actual blob would be stored in S3/MinIO)
    await db.insert(repoBlobs).values({
      cid: cidStr,
      did: input.did,
      mimeType: input.mimeType,
      size: input.blob.length,
      createdAt: new Date(),
    });

    // In production, upload to S3/MinIO and get URL
    const url = `/blob/${cidStr}`;

    return {
      cid: cidStr,
      url,
    };
  }

  /**
   * Generate TID (Timestamp ID) for record keys
   */
  private generateTid(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    // Simple TID format: timestamp + random
    return `${timestamp}${random.toString(36)}`;
  }

  /**
   * Increment repository revision
   */
  private async incrementRev(did: string): Promise<void> {
    await db
      .update(repositories)
      .set({
        rev: db.query.repositories.rev + 1,
        updatedAt: new Date(),
      })
      .where(eq(repositories.did, did));
  }
}

/**
 * Singleton instance
 */
export const repositoryService = new RepositoryService();

export default RepositoryService;
