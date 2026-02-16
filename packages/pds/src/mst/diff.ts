import { CID } from 'multiformats/cid';
import { MerkleSearchTree, BlockStore } from './mst.js';

/**
 * Diff operation types
 */
export type DiffOp =
  | { type: 'create'; key: string; cid: CID }
  | { type: 'update'; key: string; prev: CID; cid: CID }
  | { type: 'delete'; key: string; cid: CID };

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
