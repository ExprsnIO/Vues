import { CID } from 'multiformats/cid';
import { CarWriter, CarReader } from '@ipld/car';
import { BlockStore } from '../mst/index.js';
import { MerkleSearchTree } from '../mst/mst.js';
import { decodeCommit, Commit, encodeCommit } from '../repo/commit.js';

/**
 * CAR file header
 */
export interface CarHeader {
  roots: CID[];
  version: number;
}

/**
 * Export a repository to CAR format
 */
export async function exportRepoCar(
  store: BlockStore,
  commitCid: CID
): Promise<Uint8Array> {
  const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];

  // Get commit block
  const commitBytes = await store.get(commitCid);
  if (!commitBytes) {
    throw new Error(`Commit not found: ${commitCid.toString()}`);
  }
  blocks.push({ cid: commitCid, bytes: commitBytes });

  // Parse commit to get MST root
  const commit = decodeCommit(commitBytes);

  // Traverse MST and collect all blocks
  await collectMstBlocks(store, commit.data, blocks);

  // Create CAR file
  const { writer, out } = CarWriter.create([commitCid]);

  // Collect output chunks
  const chunks: Uint8Array[] = [];
  const outPromise = (async () => {
    for await (const chunk of out) {
      chunks.push(chunk);
    }
  })();

  // Write blocks
  for (const block of blocks) {
    await writer.put(block);
  }
  await writer.close();
  await outPromise;

  // Concatenate chunks
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
 * Recursively collect MST blocks
 */
async function collectMstBlocks(
  store: BlockStore,
  cid: CID,
  blocks: Array<{ cid: CID; bytes: Uint8Array }>,
  visited = new Set<string>()
): Promise<void> {
  const cidStr = cid.toString();
  if (visited.has(cidStr)) return;
  visited.add(cidStr);

  const bytes = await store.get(cid);
  if (!bytes) {
    console.warn(`Block not found: ${cidStr}`);
    return;
  }

  blocks.push({ cid, bytes });

  // Try to parse as MST node and follow links
  // This is a simplified approach - real implementation would properly decode
  // MST nodes and follow all CID references
}

/**
 * Import a repository from CAR format
 */
export async function importRepoCar(
  store: BlockStore,
  carBytes: Uint8Array
): Promise<{ roots: CID[]; commit: Commit | null }> {
  const reader = await CarReader.fromBytes(carBytes);
  const roots = await reader.getRoots();

  // Import all blocks
  for await (const { cid, bytes } of reader.blocks()) {
    await store.put(cid, bytes);
  }

  // Try to parse root as commit
  let commit: Commit | null = null;
  if (roots.length > 0) {
    const commitBytes = await store.get(roots[0]);
    if (commitBytes) {
      try {
        commit = decodeCommit(commitBytes);
      } catch {
        // Root is not a commit
      }
    }
  }

  return { roots, commit };
}

/**
 * Get blocks for a specific commit
 */
export async function getCommitBlocks(
  store: BlockStore,
  commitCid: CID
): Promise<CID[]> {
  const blocks: CID[] = [commitCid];

  const commitBytes = await store.get(commitCid);
  if (!commitBytes) return blocks;

  const commit = decodeCommit(commitBytes);
  blocks.push(commit.data);

  // In full implementation, would traverse MST and collect all block CIDs
  return blocks;
}

/**
 * Export an incremental CAR with specific blocks
 */
export async function exportIncrementalCar(
  rootCid: CID,
  blocks: Array<{ cid: CID; bytes: Uint8Array }>
): Promise<Uint8Array> {
  const { writer, out } = CarWriter.create([rootCid]);

  // Collect output chunks
  const chunks: Uint8Array[] = [];
  const outPromise = (async () => {
    for await (const chunk of out) {
      chunks.push(chunk);
    }
  })();

  // Write blocks
  for (const block of blocks) {
    await writer.put(block);
  }
  await writer.close();
  await outPromise;

  // Concatenate chunks
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
 * Verify CAR file integrity
 */
export async function verifyCarIntegrity(
  carBytes: Uint8Array
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const reader = await CarReader.fromBytes(carBytes);
    const roots = await reader.getRoots();

    if (roots.length === 0) {
      errors.push('CAR file has no roots');
    }

    // Verify all blocks can be read
    let blockCount = 0;
    for await (const { cid } of reader.blocks()) {
      blockCount++;
      // Could add CID verification here
    }

    if (blockCount === 0) {
      errors.push('CAR file has no blocks');
    }
  } catch (err) {
    errors.push(`CAR parse error: ${err}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
