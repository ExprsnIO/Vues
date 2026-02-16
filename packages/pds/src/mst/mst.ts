import { CID } from 'multiformats/cid';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';
import {
  MstNode,
  MstEntry,
  nodeToData,
  dataToNode,
  createEmptyNode,
  leadingZerosOnHash,
} from './node.js';

/**
 * Block storage interface for MST operations
 */
export interface BlockStore {
  get(cid: CID): Promise<Uint8Array | null>;
  put(cid: CID, bytes: Uint8Array): Promise<void>;
  has(cid: CID): Promise<boolean>;
}

/**
 * In-memory block store for testing
 */
export class MemoryBlockStore implements BlockStore {
  private blocks = new Map<string, Uint8Array>();

  async get(cid: CID): Promise<Uint8Array | null> {
    return this.blocks.get(cid.toString()) ?? null;
  }

  async put(cid: CID, bytes: Uint8Array): Promise<void> {
    this.blocks.set(cid.toString(), bytes);
  }

  async has(cid: CID): Promise<boolean> {
    return this.blocks.has(cid.toString());
  }

  getAll(): Map<string, Uint8Array> {
    return new Map(this.blocks);
  }
}

/**
 * Merkle Search Tree implementation
 * Core data structure for ATProto repositories
 */
export class MerkleSearchTree {
  constructor(
    private store: BlockStore,
    private root: CID | null = null
  ) {}

  /**
   * Get the current root CID
   */
  getRoot(): CID | null {
    return this.root;
  }

  /**
   * Create CID from data
   */
  private async createCid(data: unknown): Promise<CID> {
    const bytes = dagCbor.encode(data);
    const hash = await sha256.digest(bytes);
    return CID.create(1, dagCbor.code, hash);
  }

  /**
   * Store a node and return its CID
   */
  private async storeNode(node: MstNode): Promise<CID> {
    const data = nodeToData(node);
    const bytes = dagCbor.encode(data);
    const hash = await sha256.digest(bytes);
    const cid = CID.create(1, dagCbor.code, hash);
    await this.store.put(cid, bytes);
    return cid;
  }

  /**
   * Load a node from the store
   */
  private async loadNode(cid: CID): Promise<MstNode> {
    const bytes = await this.store.get(cid);
    if (!bytes) {
      throw new Error(`Node not found: ${cid.toString()}`);
    }
    const data = dagCbor.decode(bytes);
    return dataToNode(data as ReturnType<typeof nodeToData>);
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<CID | null> {
    if (!this.root) return null;
    return this.getFromNode(this.root, key);
  }

  private async getFromNode(nodeCid: CID, key: string): Promise<CID | null> {
    const node = await this.loadNode(nodeCid);
    const keyBytes = new TextEncoder().encode(key);

    // Binary search through entries
    for (let i = 0; i < node.e.length; i++) {
      const entry = node.e[i];
      const entryKey = this.reconstructKey(node.e, i);
      const cmp = this.compareBytes(keyBytes, entryKey);

      if (cmp === 0) {
        return entry.v;
      } else if (cmp < 0) {
        // Key is less than this entry, check subtree
        if (i === 0) {
          return node.l ? this.getFromNode(node.l, key) : null;
        } else {
          const prev = node.e[i - 1];
          return prev.t ? this.getFromNode(prev.t, key) : null;
        }
      }
    }

    // Key is greater than all entries
    if (node.e.length > 0) {
      const last = node.e[node.e.length - 1];
      return last.t ? this.getFromNode(last.t, key) : null;
    }

    return node.l ? this.getFromNode(node.l, key) : null;
  }

  /**
   * Add or update a key-value pair
   */
  async add(key: string, valueCid: CID): Promise<CID> {
    const keyBytes = new TextEncoder().encode(key);
    const depth = leadingZerosOnHash(key);

    if (!this.root) {
      // Create new root with single entry
      const newNode: MstNode = {
        l: null,
        e: [
          {
            p: 0,
            k: keyBytes,
            v: valueCid,
            t: null,
          },
        ],
      };
      this.root = await this.storeNode(newNode);
      return this.root;
    }

    this.root = await this.addToNode(this.root, key, keyBytes, valueCid, depth);
    return this.root;
  }

  private async addToNode(
    nodeCid: CID,
    key: string,
    keyBytes: Uint8Array,
    valueCid: CID,
    depth: number
  ): Promise<CID> {
    const node = await this.loadNode(nodeCid);
    const entries = [...node.e];

    // Find insertion point
    let insertIdx = 0;
    for (let i = 0; i < entries.length; i++) {
      const entryKey = this.reconstructKey(entries, i);
      const cmp = this.compareBytes(keyBytes, entryKey);

      if (cmp === 0) {
        // Update existing entry
        entries[i] = { ...entries[i], v: valueCid };
        const newNode: MstNode = { l: node.l, e: entries };
        return this.storeNode(newNode);
      } else if (cmp < 0) {
        insertIdx = i;
        break;
      } else {
        insertIdx = i + 1;
      }
    }

    // Calculate prefix with previous entry
    let prefix = 0;
    if (insertIdx > 0) {
      const prevKey = this.reconstructKey(entries, insertIdx - 1);
      prefix = this.commonPrefixLength(prevKey, keyBytes);
    }

    // Create new entry
    const newEntry: MstEntry = {
      p: prefix,
      k: keyBytes.slice(prefix),
      v: valueCid,
      t: null,
    };

    // Insert at position
    entries.splice(insertIdx, 0, newEntry);

    // Update prefix of next entry if needed
    if (insertIdx < entries.length - 1) {
      const nextEntry = entries[insertIdx + 1];
      const nextKey = this.reconstructKey(node.e, insertIdx);
      const newPrefix = this.commonPrefixLength(keyBytes, nextKey);
      entries[insertIdx + 1] = {
        ...nextEntry,
        p: newPrefix,
        k: nextKey.slice(newPrefix),
      };
    }

    const newNode: MstNode = { l: node.l, e: entries };
    return this.storeNode(newNode);
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<CID | null> {
    if (!this.root) return null;

    const result = await this.deleteFromNode(this.root, key);
    this.root = result;
    return this.root;
  }

  private async deleteFromNode(nodeCid: CID, key: string): Promise<CID | null> {
    const node = await this.loadNode(nodeCid);
    const keyBytes = new TextEncoder().encode(key);
    const entries = [...node.e];

    for (let i = 0; i < entries.length; i++) {
      const entryKey = this.reconstructKey(entries, i);
      const cmp = this.compareBytes(keyBytes, entryKey);

      if (cmp === 0) {
        // Found the entry to delete
        entries.splice(i, 1);

        // Update prefix of next entry
        if (i < entries.length) {
          const nextEntry = entries[i];
          const prevKey = i > 0 ? this.reconstructKey(entries, i - 1) : new Uint8Array(0);
          const nextKey = new TextEncoder().encode(
            new TextDecoder().decode(nextEntry.k)
          );
          const newPrefix = this.commonPrefixLength(prevKey, nextKey);
          entries[i] = { ...nextEntry, p: newPrefix };
        }

        if (entries.length === 0 && node.l === null) {
          return null;
        }

        const newNode: MstNode = { l: node.l, e: entries };
        return this.storeNode(newNode);
      }
    }

    // Key not found, return unchanged
    return nodeCid;
  }

  /**
   * List all keys in the tree
   */
  async list(): Promise<Array<{ key: string; cid: CID }>> {
    if (!this.root) return [];
    return this.listFromNode(this.root);
  }

  private async listFromNode(nodeCid: CID): Promise<Array<{ key: string; cid: CID }>> {
    const node = await this.loadNode(nodeCid);
    const results: Array<{ key: string; cid: CID }> = [];

    // Visit left subtree first
    if (node.l) {
      results.push(...(await this.listFromNode(node.l)));
    }

    // Visit entries in order
    for (let i = 0; i < node.e.length; i++) {
      const entry = node.e[i];
      const keyBytes = this.reconstructKey(node.e, i);
      const key = new TextDecoder().decode(keyBytes);
      results.push({ key, cid: entry.v });

      // Visit subtree after this entry
      if (entry.t) {
        results.push(...(await this.listFromNode(entry.t)));
      }
    }

    return results;
  }

  // Helper methods

  private reconstructKey(entries: MstEntry[], index: number): Uint8Array {
    if (index === 0) {
      return entries[0].k;
    }

    // Build key from prefix chain
    const parts: Uint8Array[] = [];
    let totalLen = 0;

    for (let i = 0; i <= index; i++) {
      const entry = entries[i];
      if (i === 0) {
        parts.push(entry.k);
        totalLen += entry.k.length;
      } else {
        // Use prefix from previous key
        const prevKey = this.reconstructKey(entries, i - 1);
        const prefix = prevKey.slice(0, entry.p);
        parts.push(prefix);
        parts.push(entry.k);
        totalLen += prefix.length + entry.k.length;
      }
    }

    // Only return the last reconstructed key
    const lastEntry = entries[index];
    if (index === 0) {
      return lastEntry.k;
    }

    const prevKey = this.reconstructKey(entries, index - 1);
    const result = new Uint8Array(lastEntry.p + lastEntry.k.length);
    result.set(prevKey.slice(0, lastEntry.p), 0);
    result.set(lastEntry.k, lastEntry.p);
    return result;
  }

  private compareBytes(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return a.length - b.length;
  }

  private commonPrefixLength(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) return i;
    }
    return len;
  }
}

/**
 * Create a new MST with the given store
 */
export function createMst(store: BlockStore, root?: CID | null): MerkleSearchTree {
  return new MerkleSearchTree(store, root ?? null);
}
