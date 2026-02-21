import { CID } from 'multiformats/cid';
import * as dagCbor from '@ipld/dag-cbor';
import { MerkleSearchTree, BlockStore } from './mst.js';

/**
 * Diff operation types
 */
export type DiffOp =
  | { type: 'create'; key: string; cid: CID }
  | { type: 'update'; key: string; prev: CID; cid: CID }
  | { type: 'delete'; key: string; cid: CID };

/**
 * Diff result with blocks for incremental sync
 */
export interface DiffResult {
  ops: DiffOp[];
  addedBlocks: CID[];
  removedBlocks: CID[];
}

/**
 * Compute the difference between two MST roots
 */
export async function computeDiff(
  store: BlockStore,
  prevRoot: CID | null,
  newRoot: CID | null
): Promise<DiffOp[]> {
  const prevMst = new MerkleSearchTree(store, prevRoot);
  const newMst = new MerkleSearchTree(store, newRoot);

  const prevEntries = await prevMst.list();
  const newEntries = await newMst.list();

  const prevMap = new Map(prevEntries.map((e) => [e.key, e.cid]));
  const newMap = new Map(newEntries.map((e) => [e.key, e.cid]));

  const ops: DiffOp[] = [];

  // Find creates and updates
  for (const [key, cid] of newMap) {
    const prevCid = prevMap.get(key);
    if (!prevCid) {
      ops.push({ type: 'create', key, cid });
    } else if (!prevCid.equals(cid)) {
      ops.push({ type: 'update', key, prev: prevCid, cid });
    }
  }

  // Find deletes
  for (const [key, cid] of prevMap) {
    if (!newMap.has(key)) {
      ops.push({ type: 'delete', key, cid });
    }
  }

  // Sort by key for consistent ordering
  ops.sort((a, b) => a.key.localeCompare(b.key));

  return ops;
}

/**
 * Compute diff with block information for incremental sync
 */
export async function computeDiffWithBlocks(
  store: BlockStore,
  prevRoot: CID | null,
  newRoot: CID | null
): Promise<DiffResult> {
  const ops = await computeDiff(store, prevRoot, newRoot);

  // Collect blocks from both trees
  const prevBlocks = new Set<string>();
  const newBlocks = new Set<string>();

  if (prevRoot) {
    await collectMstBlocks(store, prevRoot, prevBlocks);
  }
  if (newRoot) {
    await collectMstBlocks(store, newRoot, newBlocks);
  }

  // Find added and removed blocks
  const addedBlocks: CID[] = [];
  const removedBlocks: CID[] = [];

  for (const cidStr of newBlocks) {
    if (!prevBlocks.has(cidStr)) {
      addedBlocks.push(CID.parse(cidStr));
    }
  }

  for (const cidStr of prevBlocks) {
    if (!newBlocks.has(cidStr)) {
      removedBlocks.push(CID.parse(cidStr));
    }
  }

  return { ops, addedBlocks, removedBlocks };
}

/**
 * Recursively collect all MST block CIDs
 */
async function collectMstBlocks(
  store: BlockStore,
  cid: CID,
  collected: Set<string>
): Promise<void> {
  const cidStr = cid.toString();
  if (collected.has(cidStr)) return;
  collected.add(cidStr);

  const bytes = await store.get(cid);
  if (!bytes) return;

  try {
    const data = dagCbor.decode(bytes) as {
      l?: CID;
      e?: Array<{ v: CID; t?: CID }>;
    };

    // Follow left subtree
    if (data.l) {
      await collectMstBlocks(store, data.l, collected);
    }

    // Follow entries
    if (data.e && Array.isArray(data.e)) {
      for (const entry of data.e) {
        // Add value CID
        if (entry.v) {
          collected.add(entry.v.toString());
        }
        // Follow right subtree
        if (entry.t) {
          await collectMstBlocks(store, entry.t, collected);
        }
      }
    }
  } catch {
    // Not a valid MST node, skip
  }
}

/**
 * Get all blocks needed for incremental sync from prevCommit to newCommit
 */
export async function getIncrementalBlocks(
  store: BlockStore,
  prevDataRoot: CID | null,
  newDataRoot: CID,
  newCommitCid: CID
): Promise<Array<{ cid: CID; bytes: Uint8Array }>> {
  const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];
  const prevBlocks = new Set<string>();
  const needed = new Set<string>();

  // Collect blocks from previous tree
  if (prevDataRoot) {
    await collectMstBlocks(store, prevDataRoot, prevBlocks);
  }

  // Collect blocks from new tree
  const newBlocks = new Set<string>();
  await collectMstBlocks(store, newDataRoot, newBlocks);

  // Find new blocks
  for (const cidStr of newBlocks) {
    if (!prevBlocks.has(cidStr)) {
      needed.add(cidStr);
    }
  }

  // Add the commit block
  needed.add(newCommitCid.toString());
  needed.add(newDataRoot.toString());

  // Fetch all needed blocks
  for (const cidStr of needed) {
    const cid = CID.parse(cidStr);
    const bytes = await store.get(cid);
    if (bytes) {
      blocks.push({ cid, bytes });
    }
  }

  return blocks;
}

/**
 * Apply diff operations to an MST
 */
export async function applyDiff(
  mst: MerkleSearchTree,
  ops: DiffOp[]
): Promise<CID | null> {
  let root = mst.getRoot();

  for (const op of ops) {
    switch (op.type) {
      case 'create':
      case 'update':
        root = await mst.add(op.key, op.cid);
        break;
      case 'delete':
        root = await mst.delete(op.key);
        break;
    }
  }

  return root;
}

export { MerkleSearchTree, BlockStore };
