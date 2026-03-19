/**
 * CAR Block Builder for Relay Commits
 * Generates CAR format blocks for firehose events
 */

import { CarWriter } from '@ipld/car';
import { CID } from 'multiformats/cid';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';

/**
 * Block data structure
 */
export interface Block {
  cid: CID;
  bytes: Uint8Array;
}

/**
 * Create a CAR file from blocks
 */
export async function createCar(
  rootCid: CID,
  blocks: Block[]
): Promise<Uint8Array> {
  const { writer, out } = CarWriter.create([rootCid]);

  // Collect output chunks
  const chunks: Uint8Array[] = [];
  const outPromise = (async () => {
    for await (const chunk of out) {
      chunks.push(chunk);
    }
  })();

  // Write all blocks
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
 * Create a CID for a CBOR-encoded value
 */
export async function createCid(value: unknown): Promise<CID> {
  const bytes = dagCbor.encode(value);
  const hash = await sha256.digest(bytes);
  return CID.create(1, dagCbor.code, hash);
}

/**
 * Create a block from a value
 */
export async function createBlock(value: unknown): Promise<Block> {
  const bytes = dagCbor.encode(value);
  const hash = await sha256.digest(bytes);
  const cid = CID.create(1, dagCbor.code, hash);
  return { cid, bytes };
}

/**
 * Build CAR bytes for a single record commit
 * This is the format used in AT Protocol firehose
 */
export async function buildCommitCar(
  commit: {
    did: string;
    rev: string;
    collection: string;
    rkey: string;
    record: unknown;
    prev?: string;
  }
): Promise<{
  carBytes: Uint8Array;
  commitCid: string;
  recordCid: string;
}> {
  const blocks: Block[] = [];

  // Create record block
  const recordBlock = await createBlock(commit.record);
  blocks.push(recordBlock);

  // Create a simple MST entry pointing to the record
  const mstEntry = {
    e: [{
      p: 0,
      k: new TextEncoder().encode(`${commit.collection}/${commit.rkey}`),
      v: recordBlock.cid.bytes,
      t: null,
    }],
    l: null,
  };
  const mstBlock = await createBlock(mstEntry);
  blocks.push(mstBlock);

  // Create commit block
  const commitData = {
    did: commit.did,
    version: 3,
    data: mstBlock.cid,
    rev: commit.rev,
    prev: commit.prev ? CID.parse(commit.prev).bytes : null,
    sig: new Uint8Array(64), // Placeholder signature
  };
  const commitBlock = await createBlock(commitData);
  blocks.push(commitBlock);

  // Create CAR with commit as root
  const carBytes = await createCar(commitBlock.cid, blocks);

  return {
    carBytes,
    commitCid: commitBlock.cid.toString(),
    recordCid: recordBlock.cid.toString(),
  };
}

/**
 * Build minimal CAR for a delete operation
 */
export async function buildDeleteCar(
  commit: {
    did: string;
    rev: string;
    collection: string;
    rkey: string;
    prev?: string;
  }
): Promise<{
  carBytes: Uint8Array;
  commitCid: string;
}> {
  const blocks: Block[] = [];

  // Create empty MST (record was deleted)
  const mstBlock = await createBlock({ e: [], l: null });
  blocks.push(mstBlock);

  // Create commit block
  const commitData = {
    did: commit.did,
    version: 3,
    data: mstBlock.cid,
    rev: commit.rev,
    prev: commit.prev ? CID.parse(commit.prev).bytes : null,
    sig: new Uint8Array(64),
  };
  const commitBlock = await createBlock(commitData);
  blocks.push(commitBlock);

  const carBytes = await createCar(commitBlock.cid, blocks);

  return {
    carBytes,
    commitCid: commitBlock.cid.toString(),
  };
}

/**
 * Build a minimal MST proof for a single record path.
 * Used for getRecord proof generation — returns the CAR bytes containing
 * the MST path from root to the target record.
 */
export async function buildMstProof(
  rootCid: CID,
  path: string,
  blocks: Map<string, { cid: CID; bytes: Uint8Array }>
): Promise<Uint8Array> {
  // Collect proof blocks: root + any blocks along the MST path
  const proofBlocks: Block[] = [];

  // Add the root block if available
  const rootKey = rootCid.toString();
  if (blocks.has(rootKey)) {
    const b = blocks.get(rootKey)!;
    proofBlocks.push({ cid: b.cid, bytes: b.bytes });
  }

  // For a single-entry MST, the proof is just the root node + the record block
  // A full implementation would walk the MST tree along the key path
  const pathKey = new TextEncoder().encode(path);
  for (const [, block] of blocks) {
    if (!proofBlocks.some(pb => pb.cid.equals(block.cid))) {
      proofBlocks.push({ cid: block.cid, bytes: block.bytes });
    }
  }

  if (proofBlocks.length === 0) {
    // Return an empty CAR with the root CID
    return createCar(rootCid, []);
  }

  return createCar(rootCid, proofBlocks);
}

export default {
  createCar,
  createCid,
  createBlock,
  buildCommitCar,
  buildDeleteCar,
  buildMstProof,
};
