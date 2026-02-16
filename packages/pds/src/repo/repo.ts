import { CID } from 'multiformats/cid';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';
import { MerkleSearchTree, BlockStore, MemoryBlockStore } from '../mst/index.js';
import {
  Commit,
  UnsignedCommit,
  createUnsignedCommit,
  getSignBytes,
  signCommit,
  encodeCommit,
  decodeCommit,
  createCommitCid,
} from './commit.js';
import { generateRkey } from './tid.js';

/**
 * Record with its key and CID
 */
export interface RepoRecord {
  uri: string;
  cid: CID;
  collection: string;
  rkey: string;
  value: unknown;
}

/**
 * Repository write operation
 */
export type WriteOp =
  | { action: 'create'; collection: string; rkey?: string; value: unknown }
  | { action: 'update'; collection: string; rkey: string; value: unknown }
  | { action: 'delete'; collection: string; rkey: string };

/**
 * Write operation result
 */
export interface WriteResult {
  uri: string;
  cid: CID;
}

/**
 * Signing function type
 */
export type SignFn = (bytes: Uint8Array) => Promise<Uint8Array>;

/**
 * Repository class for managing ATProto user repositories
 */
export class Repository {
  private mst: MerkleSearchTree;
  private currentCommit: Commit | null = null;

  constructor(
    public readonly did: string,
    private blockStore: BlockStore,
    private signFn: SignFn,
    rootCid?: CID | null
  ) {
    this.mst = new MerkleSearchTree(blockStore, rootCid ?? null);
  }

  /**
   * Get the current root CID
   */
  getRoot(): CID | null {
    return this.mst.getRoot();
  }

  /**
   * Get the current commit
   */
  getCurrentCommit(): Commit | null {
    return this.currentCommit;
  }

  /**
   * Load an existing repository
   */
  static async load(
    did: string,
    blockStore: BlockStore,
    signFn: SignFn,
    commitCid: CID
  ): Promise<Repository> {
    const commitBytes = await blockStore.get(commitCid);
    if (!commitBytes) {
      throw new Error(`Commit not found: ${commitCid.toString()}`);
    }

    const commit = decodeCommit(commitBytes);
    if (commit.did !== did) {
      throw new Error(`DID mismatch: expected ${did}, got ${commit.did}`);
    }

    const repo = new Repository(did, blockStore, signFn, commit.data);
    repo.currentCommit = commit;
    return repo;
  }

  /**
   * Create a new empty repository
   */
  static async create(
    did: string,
    blockStore: BlockStore,
    signFn: SignFn
  ): Promise<Repository> {
    return new Repository(did, blockStore, signFn, null);
  }

  /**
   * Create a record in the repository
   */
  async createRecord(
    collection: string,
    value: unknown,
    rkey?: string
  ): Promise<WriteResult> {
    const key = rkey ?? generateRkey();
    const recordKey = `${collection}/${key}`;
    const uri = `at://${this.did}/${collection}/${key}`;

    // Create CID for record value
    const recordBytes = dagCbor.encode(value);
    const recordHash = await sha256.digest(recordBytes);
    const recordCid = CID.create(1, dagCbor.code, recordHash);

    // Store record block
    await this.blockStore.put(recordCid, recordBytes);

    // Add to MST
    await this.mst.add(recordKey, recordCid);

    return { uri, cid: recordCid };
  }

  /**
   * Get a record from the repository
   */
  async getRecord(collection: string, rkey: string): Promise<RepoRecord | null> {
    const recordKey = `${collection}/${rkey}`;
    const cid = await this.mst.get(recordKey);

    if (!cid) {
      return null;
    }

    const bytes = await this.blockStore.get(cid);
    if (!bytes) {
      return null;
    }

    const value = dagCbor.decode(bytes);

    return {
      uri: `at://${this.did}/${collection}/${rkey}`,
      cid,
      collection,
      rkey,
      value,
    };
  }

  /**
   * Update a record in the repository
   */
  async updateRecord(
    collection: string,
    rkey: string,
    value: unknown
  ): Promise<WriteResult> {
    const recordKey = `${collection}/${rkey}`;
    const uri = `at://${this.did}/${collection}/${rkey}`;

    // Create CID for new record value
    const recordBytes = dagCbor.encode(value);
    const recordHash = await sha256.digest(recordBytes);
    const recordCid = CID.create(1, dagCbor.code, recordHash);

    // Store record block
    await this.blockStore.put(recordCid, recordBytes);

    // Update in MST
    await this.mst.add(recordKey, recordCid);

    return { uri, cid: recordCid };
  }

  /**
   * Delete a record from the repository
   */
  async deleteRecord(collection: string, rkey: string): Promise<void> {
    const recordKey = `${collection}/${rkey}`;
    await this.mst.delete(recordKey);
  }

  /**
   * List records in a collection
   */
  async listRecords(
    collection: string,
    options?: { limit?: number; cursor?: string; reverse?: boolean }
  ): Promise<{ records: RepoRecord[]; cursor?: string }> {
    const allEntries = await this.mst.list();
    const prefix = `${collection}/`;

    // Filter to collection
    let entries = allEntries.filter((e) => e.key.startsWith(prefix));

    // Apply cursor
    if (options?.cursor) {
      const cursorKey = `${collection}/${options.cursor}`;
      const idx = entries.findIndex((e) => e.key === cursorKey);
      if (idx >= 0) {
        entries = entries.slice(idx + 1);
      }
    }

    // Apply reverse
    if (options?.reverse) {
      entries.reverse();
    }

    // Apply limit
    const limit = options?.limit ?? 50;
    const hasMore = entries.length > limit;
    entries = entries.slice(0, limit);

    // Load record values
    const records: RepoRecord[] = [];
    for (const entry of entries) {
      const rkey = entry.key.slice(prefix.length);
      const bytes = await this.blockStore.get(entry.cid);
      if (bytes) {
        const value = dagCbor.decode(bytes);
        records.push({
          uri: `at://${this.did}/${collection}/${rkey}`,
          cid: entry.cid,
          collection,
          rkey,
          value,
        });
      }
    }

    const cursor = hasMore ? records[records.length - 1]?.rkey : undefined;
    return { records, cursor };
  }

  /**
   * Apply multiple write operations and create a commit
   */
  async applyWrites(writes: WriteOp[]): Promise<{ commit: Commit; results: WriteResult[] }> {
    const results: WriteResult[] = [];

    for (const write of writes) {
      switch (write.action) {
        case 'create': {
          const result = await this.createRecord(
            write.collection,
            write.value,
            write.rkey
          );
          results.push(result);
          break;
        }
        case 'update': {
          const result = await this.updateRecord(
            write.collection,
            write.rkey,
            write.value
          );
          results.push(result);
          break;
        }
        case 'delete': {
          await this.deleteRecord(write.collection, write.rkey);
          break;
        }
      }
    }

    // Create commit
    const commit = await this.commit();

    return { commit, results };
  }

  /**
   * Create a new commit for current state
   */
  async commit(): Promise<Commit> {
    const mstRoot = this.mst.getRoot();
    if (!mstRoot) {
      throw new Error('Cannot commit empty repository');
    }

    const prevCid = this.currentCommit
      ? await createCommitCid(this.currentCommit)
      : null;

    // Create unsigned commit
    const unsigned = createUnsignedCommit(this.did, mstRoot, prevCid);

    // Sign commit
    const signBytes = getSignBytes(unsigned);
    const signature = await this.signFn(signBytes);

    // Create signed commit
    const commit = signCommit(unsigned, signature);

    // Store commit block
    const commitBytes = encodeCommit(commit);
    const commitCid = await createCommitCid(commit);
    await this.blockStore.put(commitCid, commitBytes);

    this.currentCommit = commit;
    return commit;
  }
}

/**
 * Create a new in-memory repository for testing
 */
export function createTestRepository(
  did: string,
  signFn?: SignFn
): Repository {
  const store = new MemoryBlockStore();
  const defaultSign = async (bytes: Uint8Array): Promise<Uint8Array> => {
    // Placeholder signature for testing
    const hash = await sha256.digest(bytes);
    return hash.bytes;
  };
  return new Repository(did, store, signFn ?? defaultSign, null);
}
