import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { CID } from 'multiformats/cid';
import { Repository } from '../repo/repo.js';
import { exportRepoCar, getCommitBlocks } from '../storage/car.js';
import { BlockStore } from '../mst/index.js';
import { BlobStore } from '../storage/blob-store.js';
import { createCommitCid } from '../repo/commit.js';

/**
 * Repo store manager interface for sync
 */
export interface SyncRepoManager {
  getRepo(did: string): Promise<Repository | null>;
  getBlockStore(did: string): Promise<BlockStore | null>;
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

    // Export to CAR
    const carBytes = await exportRepoCar(blockStore, commitCid);

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
   * Get specific blocks by CID
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
    const blocks: Array<{ cid: string; bytes: Uint8Array }> = [];

    for (const cidStr of cids) {
      try {
        const cid = CID.parse(cidStr);
        const bytes = await blockStore.get(cid);
        if (bytes) {
          blocks.push({ cid: cidStr, bytes });
        }
      } catch {
        // Skip invalid CIDs
      }
    }

    // Return as CAR-like format (simplified)
    // In real implementation, would use proper CAR encoding
    return c.json({
      blocks: blocks.map((b) => ({
        cid: b.cid,
        bytes: Buffer.from(b.bytes).toString('base64'),
      })),
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
    const commit = c.req.query('commit'); // Optional: specific commit

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

    // In full implementation, would include MST proof blocks
    return c.json({
      uri: record.uri,
      cid: record.cid.toString(),
      value: record.value,
      // proof: [...] // Would include MST path blocks
    });
  });

  /**
   * GET com.atproto.sync.listBlobs
   * List blobs in a repo
   */
  router.get('/com.atproto.sync.listBlobs', async (c) => {
    const did = c.req.query('did');
    const since = c.req.query('since');
    const limit = parseInt(c.req.query('limit') || '500');
    const cursor = c.req.query('cursor');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing did parameter' });
    }

    // In full implementation, would list blobs from blob store
    // For now, return empty list
    return c.json({
      cids: [],
      cursor: undefined,
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

    // Would need to get MIME type from metadata
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  });

  /**
   * GET com.atproto.sync.listRepos
   * List all repos on this PDS (admin only in production)
   */
  router.get('/com.atproto.sync.listRepos', async (c) => {
    const limit = parseInt(c.req.query('limit') || '500');
    const cursor = c.req.query('cursor');

    // In full implementation, would list from account store
    return c.json({
      repos: [],
      cursor: undefined,
    });
  });

  return router;
}
