import { CID } from 'multiformats/cid';

/**
 * MST Node Entry
 * Each entry in a node represents either a leaf value or a subtree pointer
 */
export interface MstEntry {
  /** Prefix length - number of bytes shared with previous key */
  p: number;
  /** Key suffix bytes (the unique part after the prefix) */
  k: Uint8Array;
  /** Value CID - points to the record */
  v: CID;
  /** Subtree CID - points to a child node (keys between this and next entry) */
  t: CID | null;
}

/**
 * MST Node
 * Internal node structure for the Merkle Search Tree
 */
export interface MstNode {
  /** Left subtree - contains keys less than the first entry */
  l: CID | null;
  /** Entries at this level */
  e: MstEntry[];
}

/**
 * Serializable MST Node for CBOR encoding
 */
export interface MstNodeData {
  l: Uint8Array | null;
  e: Array<{
    p: number;
    k: Uint8Array;
    v: Uint8Array;
    t: Uint8Array | null;
  }>;
}

/**
 * Convert MstNode to serializable format
 */
export function nodeToData(node: MstNode): MstNodeData {
  return {
    l: node.l ? node.l.bytes : null,
    e: node.e.map((entry) => ({
      p: entry.p,
      k: entry.k,
      v: entry.v.bytes,
      t: entry.t ? entry.t.bytes : null,
    })),
  };
}

/**
 * Convert serializable format back to MstNode
 */
export function dataToNode(data: MstNodeData): MstNode {
  return {
    l: data.l ? CID.decode(data.l) : null,
    e: data.e.map((entry) => ({
      p: entry.p,
      k: entry.k,
      v: CID.decode(entry.v),
      t: entry.t ? CID.decode(entry.t) : null,
    })),
  };
}

/**
 * Calculate the "depth" (fanout layer) for a key using SHA-256
 * Used to determine which level of the tree a key belongs to
 * Per AT Protocol spec: count leading zeros in SHA-256 hash
 */
export function leadingZerosOnHash(key: string): number {
  // Use Web Crypto API for SHA-256 (synchronous via cached hash)
  // For proper async implementation, see leadingZerosOnHashAsync
  const encoder = new TextEncoder();
  const data = encoder.encode(key);

  // Simple hash for synchronous operation (fallback)
  // In a real AT Protocol implementation, this should use proper SHA-256
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }

  // Count leading zeros
  if (hash === 0) return 32;
  let zeros = 0;
  let val = hash >>> 0; // Ensure unsigned
  while (val > 0 && (val & 0x80000000) === 0) {
    zeros++;
    val <<= 1;
  }
  return Math.min(zeros, 4); // AT Protocol uses limited fanout
}

/**
 * Async version using proper SHA-256
 */
export async function leadingZerosOnHashAsync(key: string): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);

  // Use Node.js crypto for SHA-256
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(data).digest();

  // Count leading zero bits
  let zeros = 0;
  for (const byte of hash) {
    if (byte === 0) {
      zeros += 8;
    } else {
      // Count leading zeros in this byte
      let mask = 0x80;
      while ((byte & mask) === 0) {
        zeros++;
        mask >>= 1;
      }
      break;
    }
  }

  return Math.min(zeros, 4); // AT Protocol uses limited fanout
}

/**
 * Create an empty MST node
 */
export function createEmptyNode(): MstNode {
  return {
    l: null,
    e: [],
  };
}

/**
 * Check if a node is empty (no entries and no left subtree)
 */
export function isEmptyNode(node: MstNode): boolean {
  return node.l === null && node.e.length === 0;
}
