import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { CID } from 'multiformats/cid';
import { CarWriter } from '@ipld/car';
import { Repository } from '../repo/repo.js';
import { exportRepoCar, getCommitBlocks, exportIncrementalCar } from '../storage/car.js';
import { BlockStore } from '../mst/index.js';
import { BlobStore } from '../storage/blob-store.js';
import { createCommitCid, decodeCommit } from '../repo/commit.js';
import { getIncrementalBlocks } from '../mst/diff.js';

/**
 * Repo store manager interface for sync
 */
export interface SyncRepoManager {
  getRepo(did: string): Promise<Repository | null>;
  getBlockStore(did: string): Promise<BlockStore | null>;
  getCommitByCid?(did: string, cid: CID): Promise<{ rev: string; data: CID; prev: CID | null } | null>;
  listBlobs?(did: string, options: { limit: number; cursor?: string; since?: string }): Promise<{ cids: string[]; cursor?: string }>;
  listRepos?(options: { limit: number; cursor?: string }): Promise<{ repos: Array<{ did: string; head: string; rev: string }>; cursor?: string }>;
}

/**
 * Create sync XRPC router
 */
export function createSyncRouter(
  repoManager: SyncRepoManager,
  blobStore: BlobStore
) {
  const router = new Hono();

  /**
   * GET com.atproto.sync.getRepo
   * Download a repository as CAR file
   * Supports incremental sync with 'since' parameter
   */
  router.get('/com.atproto.sync.getRepo', async (c) => {
    const did = c.req.query('did');
    const since = c.req.query('since'); // Optional: only changes since this rev

    if (!did) {
      throw new HTTPException(400, { message: 'Missing did parameter' });
    }

    const repo = await repoManager.getRepo(did);
    if (!repo) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    const blockStore = await repoManager.getBlockStore(did);
    if (!blockStore) {
      throw new HTTPException(404, { message: 'Block store not found' });
    }

    const commit = repo.getCurrentCommit();
    if (!commit) {
      throw new HTTPException(404, { message: 'Repo has no commits' });
    }

    const commitCid = await createCommitCid(commit);

    let carBytes: Uint8Array;

    if (since && repoManager.getCommitByCid) {
      // Incremental sync - only changes since the specified commit
      try {
        const sinceCid = CID.parse(since);
        const sinceCommit = await repoManager.getCommitByCid(did, sinceCid);

        if (sinceCommit) {
          // Get incremental blocks from sinceCommit to current commit
          const blocks = await getIncrementalBlocks(
            blockStore,
            sinceCommit.data,
            commit.data,
            commitCid
          );

          carBytes = await exportIncrementalCar(commitCid, blocks);
        } else {
          // Since commit not found, return full repo
          carBytes = await exportRepoCar(blockStore, commitCid);
        }
      } catch {
        // Invalid since CID, return full repo
        carBytes = await exportRepoCar(blockStore, commitCid);
      }
    } else {
      // Full sync
      carBytes = await exportRepoCar(blockStore, commitCid);
    }

    return new Response(carBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ipld.car',
        'Content-Disposition': `attachment; filename="${did}.car"`,
      },
    });
  });

  /**
   * GET com.atproto.sync.getLatestCommit
   * Get the latest commit CID and rev
   */
  router.get('/com.atproto.sync.getLatestCommit', async (c) => {
    const did = c.req.query('did');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing did parameter' });
    }

    const repo = await repoManager.getRepo(did);
    if (!repo) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    const commit = repo.getCurrentCommit();
    if (!commit) {
      throw new HTTPException(404, { message: 'Repo has no commits' });
    }

    const commitCid = await createCommitCid(commit);

    return c.json({
      cid: commitCid.toString(),
      rev: commit.rev,
    });
  });

  /**
   * GET com.atproto.sync.getBlocks
   * Get specific blocks by CID - returns proper CAR format
   */
  router.get('/com.atproto.sync.getBlocks', async (c) => {
    const did = c.req.query('did');
    const cids = c.req.queries('cids') || [];

    if (!did) {
      throw new HTTPException(400, { message: 'Missing did parameter' });
    }

    if (cids.length === 0) {
      throw new HTTPException(400, { message: 'Missing cids parameter' });
    }

    const blockStore = await repoManager.getBlockStore(did);
    if (!blockStore) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    // Collect blocks
    const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];
    const parsedCids: CID[] = [];

    for (const cidStr of cids) {
      try {
        const cid = CID.parse(cidStr);
        const bytes = await blockStore.get(cid);
        if (bytes) {
          blocks.push({ cid, bytes });
          parsedCids.push(cid);
        }
      } catch {
        // Skip invalid CIDs
      }
    }

    if (blocks.length === 0) {
      throw new HTTPException(404, { message: 'No blocks found' });
    }

    // Return as proper CAR format
    const { writer, out } = CarWriter.create(parsedCids);

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

    // Concatenate chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const carBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      carBytes.set(chunk, offset);
      offset += chunk.length;
    }

    return new Response(carBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ipld.car',
      },
    });
  });

  /**
   * GET com.atproto.sync.getRecord
   * Get a record with its proof (MST path)
   */
  router.get('/com.atproto.sync.getRecord', async (c) => {
    const did = c.req.query('did');
    const collection = c.req.query('collection');
    const rkey = c.req.query('rkey');
    const commitParam = c.req.query('commit'); // Optional: specific commit

    if (!did || !collection || !rkey) {
      throw new HTTPException(400, {
        message: 'Missing required parameters: did, collection, rkey',
      });
    }

    const repo = await repoManager.getRepo(did);
    if (!repo) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    const record = await repo.getRecord(collection, rkey);
    if (!record) {
      throw new HTTPException(404, { message: 'Record not found' });
    }

    // Return as CAR with proof blocks
    const blockStore = await repoManager.getBlockStore(did);
    if (blockStore) {
      // Get proof blocks (MST path to record)
      const proofBlocks = await getRecordProofBlocks(blockStore, repo, collection, rkey);

      if (proofBlocks.length > 0) {
        const { writer, out } = CarWriter.create([record.cid]);

        const chunks: Uint8Array[] = [];
        const outPromise = (async () => {
          for await (const chunk of out) {
            chunks.push(chunk);
          }
        })();

        for (const block of proofBlocks) {
          await writer.put(block);
        }
        await writer.close();
        await outPromise;

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const carBytes = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          carBytes.set(chunk, offset);
          offset += chunk.length;
        }

        return new Response(carBytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.ipld.car',
          },
        });
      }
    }

    // Fallback to JSON if no block store
    return c.json({
      uri: record.uri,
      cid: record.cid.toString(),
      value: record.value,
    });
  });

  /**
   * GET com.atproto.sync.listBlobs
   * List blobs in a repo with pagination
   */
  router.get('/com.atproto.sync.listBlobs', async (c) => {
    const did = c.req.query('did');
    const since = c.req.query('since');
    const limit = Math.min(parseInt(c.req.query('limit') || '500'), 1000);
    const cursor = c.req.query('cursor');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing did parameter' });
    }

    // Use repo manager's listBlobs if available
    if (repoManager.listBlobs) {
      const result = await repoManager.listBlobs(did, { limit, cursor, since });
      return c.json(result);
    }

    // Fallback: list blobs from blob store
    const blobs = await blobStore.listBlobs(did, { limit, cursor, since });

    return c.json({
      cids: blobs.cids,
      cursor: blobs.cursor,
    });
  });

  /**
   * GET com.atproto.sync.getBlob
   * Get a blob by CID
   */
  router.get('/com.atproto.sync.getBlob', async (c) => {
    const did = c.req.query('did');
    const cidStr = c.req.query('cid');

    if (!did || !cidStr) {
      throw new HTTPException(400, {
        message: 'Missing required parameters: did, cid',
      });
    }

    let cid: CID;
    try {
      cid = CID.parse(cidStr);
    } catch {
      throw new HTTPException(400, { message: 'Invalid CID' });
    }

    const blob = await blobStore.getBlob(did, cid);
    if (!blob) {
      throw new HTTPException(404, { message: 'Blob not found' });
    }

    // Get MIME type from metadata if available
    const mimeType = await blobStore.getBlobMimeType?.(did, cid) || 'application/octet-stream';

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
      },
    });
  });

  /**
   * GET com.atproto.sync.listRepos
   * List all repos on this PDS
   */
  router.get('/com.atproto.sync.listRepos', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '500'), 1000);
    const cursor = c.req.query('cursor');

    if (repoManager.listRepos) {
      const result = await repoManager.listRepos({ limit, cursor });
      return c.json(result);
    }

    // Fallback: empty list
    return c.json({
      repos: [],
      cursor: undefined,
    });
  });

  return router;
}

/**
 * Get MST proof blocks for a record
 */
async function getRecordProofBlocks(
  store: BlockStore,
  repo: Repository,
  collection: string,
  rkey: string
): Promise<Array<{ cid: CID; bytes: Uint8Array }>> {
  const blocks: Array<{ cid: CID; bytes: Uint8Array }> = [];
  const commit = repo.getCurrentCommit();

  if (!commit) return blocks;

  // Get commit block
  const commitCid = await createCommitCid(commit);
  const commitBytes = await store.get(commitCid);
  if (commitBytes) {
    blocks.push({ cid: commitCid, bytes: commitBytes });
  }

  // Get MST root block
  const dataBytes = await store.get(commit.data);
  if (dataBytes) {
    blocks.push({ cid: commit.data, bytes: dataBytes });
  }

  // Get record block
  const record = await repo.getRecord(collection, rkey);
  if (record) {
    const recordBytes = await store.get(record.cid);
    if (recordBytes) {
      blocks.push({ cid: record.cid, bytes: recordBytes });
    }
  }

  return blocks;
}
