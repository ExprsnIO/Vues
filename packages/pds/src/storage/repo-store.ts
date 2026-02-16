import { CID } from 'multiformats/cid';
import { BlockStore } from '../mst/index.js';
import { StorageBackend, LocalStorageBackend } from './blob-store.js';

/**
 * Repository store configuration
 */
export interface RepoStoreConfig {
  basePath: string;
}

/**
 * Repository store for managing repo blocks
 * Stores MST nodes, commits, and record blocks
 */
export class RepoStore implements BlockStore {
  private backend: StorageBackend;

  constructor(private did: string, config: RepoStoreConfig) {
    this.backend = new LocalStorageBackend(`${config.basePath}/${did}`);
  }

  /**
   * Get block path from CID
   */
  private getBlockPath(cid: CID): string {
    const cidStr = cid.toString();
    const prefix = cidStr.slice(0, 2);
    return `blocks/${prefix}/${cidStr}`;
  }

  /**
   * Get a block by CID
   */
  async get(cid: CID): Promise<Uint8Array | null> {
    const blockPath = this.getBlockPath(cid);
    const data = await this.backend.get(blockPath);
    return data ? new Uint8Array(data) : null;
  }

  /**
   * Store a block
   */
  async put(cid: CID, bytes: Uint8Array): Promise<void> {
    const blockPath = this.getBlockPath(cid);
    await this.backend.put(blockPath, Buffer.from(bytes));
  }

  /**
   * Check if block exists
   */
  async has(cid: CID): Promise<boolean> {
    const blockPath = this.getBlockPath(cid);
    return this.backend.exists(blockPath);
  }

  /**
   * Delete a block
   */
  async delete(cid: CID): Promise<void> {
    const blockPath = this.getBlockPath(cid);
    await this.backend.delete(blockPath);
  }

  /**
   * Store commit block separately for quick access
   */
  async putCommit(cid: CID, bytes: Uint8Array): Promise<void> {
    const commitPath = `commits/${cid.toString()}`;
    await this.backend.put(commitPath, Buffer.from(bytes));
    // Also store in general blocks
    await this.put(cid, bytes);
  }

  /**
   * Get the latest commit CID
   */
  async getLatestCommitCid(): Promise<CID | null> {
    const latestPath = 'latest';
    const data = await this.backend.get(latestPath);
    if (!data) return null;
    const cidStr = data.toString('utf-8');
    return CID.parse(cidStr);
  }

  /**
   * Set the latest commit CID
   */
  async setLatestCommitCid(cid: CID): Promise<void> {
    const latestPath = 'latest';
    await this.backend.put(latestPath, Buffer.from(cid.toString()));
  }

  /**
   * Store a record block
   */
  async putRecord(
    collection: string,
    rkey: string,
    cid: CID,
    bytes: Uint8Array
  ): Promise<void> {
    // Store in records directory for easy lookup
    const recordPath = `records/${collection}/${rkey}`;
    await this.backend.put(recordPath, Buffer.from(bytes));
    // Also store in general blocks
    await this.put(cid, bytes);
  }

  /**
   * Get a record block by collection and rkey
   */
  async getRecord(collection: string, rkey: string): Promise<Uint8Array | null> {
    const recordPath = `records/${collection}/${rkey}`;
    const data = await this.backend.get(recordPath);
    return data ? new Uint8Array(data) : null;
  }
}

/**
 * In-memory repo store for testing
 */
export class MemoryRepoStore implements BlockStore {
  private blocks = new Map<string, Uint8Array>();
  private latestCommit: CID | null = null;

  async get(cid: CID): Promise<Uint8Array | null> {
    return this.blocks.get(cid.toString()) ?? null;
  }

  async put(cid: CID, bytes: Uint8Array): Promise<void> {
    this.blocks.set(cid.toString(), bytes);
  }

  async has(cid: CID): Promise<boolean> {
    return this.blocks.has(cid.toString());
  }

  async delete(cid: CID): Promise<void> {
    this.blocks.delete(cid.toString());
  }

  async getLatestCommitCid(): Promise<CID | null> {
    return this.latestCommit;
  }

  async setLatestCommitCid(cid: CID): Promise<void> {
    this.latestCommit = cid;
  }

  getAll(): Map<string, Uint8Array> {
    return new Map(this.blocks);
  }
}

/**
 * Create a repo store for a DID
 */
export function createRepoStore(did: string, basePath: string): RepoStore {
  return new RepoStore(did, { basePath });
}
