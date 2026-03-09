import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SyncService } from '../services/sync/index.js';
import { streamSSE } from 'hono/streaming';

/**
 * AT Protocol Sync XRPC Routes
 * Implements com.atproto.sync.* endpoints for repository synchronization
 */

export function createAtprotoSyncRouter(syncService: SyncService) {
  const router = new Hono();

  /**
   * GET com.atproto.sync.getBlob
   * Get a blob by CID from a specific repository
   */
  router.get('/com.atproto.sync.getBlob', async (c) => {
    const did = c.req.query('did');
    const cid = c.req.query('cid');

    if (!did || !cid) {
      throw new HTTPException(400, { message: 'Missing required parameters: did, cid' });
    }

    try {
      const blob = await syncService.getBlob(did, cid);

      if (!blob) {
        throw new HTTPException(404, { message: 'Blob not found' });
      }

      return new Response(blob.data, {
        headers: {
          'Content-Type': blob.mimeType || 'application/octet-stream',
          'Content-Length': blob.size.toString(),
        },
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get blob',
      });
    }
  });

  /**
   * GET com.atproto.sync.getBlocks
   * Get repository blocks (CAR format)
   */
  router.get('/com.atproto.sync.getBlocks', async (c) => {
    const did = c.req.query('did');
    const cids = c.req.query('cids');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing required parameter: did' });
    }

    const cidList = cids ? cids.split(',') : [];

    try {
      const blocks = await syncService.getBlocks(did, cidList);

      // Return as CAR file
      return new Response(blocks, {
        headers: {
          'Content-Type': 'application/vnd.ipld.car',
        },
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get blocks',
      });
    }
  });

  /**
   * GET com.atproto.sync.getCheckout
   * Get a complete repository checkout as CAR
   */
  router.get('/com.atproto.sync.getCheckout', async (c) => {
    const did = c.req.query('did');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing required parameter: did' });
    }

    try {
      const car = await syncService.getCheckout(did);

      if (!car) {
        throw new HTTPException(404, { message: 'Repository not found' });
      }

      return new Response(car, {
        headers: {
          'Content-Type': 'application/vnd.ipld.car',
        },
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get checkout',
      });
    }
  });

  /**
   * GET com.atproto.sync.getHead
   * Get the current commit CID for a repository
   */
  router.get('/com.atproto.sync.getHead', async (c) => {
    const did = c.req.query('did');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing required parameter: did' });
    }

    try {
      const head = await syncService.getHead(did);

      if (!head) {
        throw new HTTPException(404, { message: 'Repository not found' });
      }

      return c.json({ root: head });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get head',
      });
    }
  });

  /**
   * GET com.atproto.sync.getLatestCommit
   * Get the latest commit for a repository
   */
  router.get('/com.atproto.sync.getLatestCommit', async (c) => {
    const did = c.req.query('did');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing required parameter: did' });
    }

    try {
      const commit = await syncService.getLatestCommit(did);

      if (!commit) {
        throw new HTTPException(404, { message: 'Repository not found' });
      }

      return c.json({
        cid: commit.cid,
        rev: commit.rev,
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get latest commit',
      });
    }
  });

  /**
   * GET com.atproto.sync.getRecord
   * Get a specific record with proof
   */
  router.get('/com.atproto.sync.getRecord', async (c) => {
    const did = c.req.query('did');
    const collection = c.req.query('collection');
    const rkey = c.req.query('rkey');
    const commit = c.req.query('commit');

    if (!did || !collection || !rkey) {
      throw new HTTPException(400, {
        message: 'Missing required parameters: did, collection, rkey',
      });
    }

    try {
      const record = await syncService.getRecord({
        did,
        collection,
        rkey,
        commit: commit || undefined,
      });

      if (!record) {
        throw new HTTPException(404, { message: 'Record not found' });
      }

      // Return as CAR with proof
      return new Response(record, {
        headers: {
          'Content-Type': 'application/vnd.ipld.car',
        },
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get record',
      });
    }
  });

  /**
   * GET com.atproto.sync.getRepo
   * Get a complete repository as CAR
   */
  router.get('/com.atproto.sync.getRepo', async (c) => {
    const did = c.req.query('did');
    const since = c.req.query('since');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing required parameter: did' });
    }

    try {
      const car = await syncService.getRepo(did, since || undefined);

      if (!car) {
        throw new HTTPException(404, { message: 'Repository not found' });
      }

      return new Response(car, {
        headers: {
          'Content-Type': 'application/vnd.ipld.car',
        },
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get repo',
      });
    }
  });

  /**
   * GET com.atproto.sync.listBlobs
   * List blobs for a repository
   */
  router.get('/com.atproto.sync.listBlobs', async (c) => {
    const did = c.req.query('did');
    const since = c.req.query('since');
    const limit = parseInt(c.req.query('limit') || '500', 10);
    const cursor = c.req.query('cursor');

    if (!did) {
      throw new HTTPException(400, { message: 'Missing required parameter: did' });
    }

    try {
      const result = await syncService.listBlobs({
        did,
        since: since || undefined,
        limit: Math.min(limit, 1000),
        cursor: cursor || undefined,
      });

      return c.json({
        cursor: result.cursor,
        cids: result.cids,
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to list blobs',
      });
    }
  });

  /**
   * GET com.atproto.sync.listRepos
   * List repositories on this server
   */
  router.get('/com.atproto.sync.listRepos', async (c) => {
    const limit = parseInt(c.req.query('limit') || '500', 10);
    const cursor = c.req.query('cursor');

    try {
      const result = await syncService.listRepos({
        limit: Math.min(limit, 1000),
        cursor: cursor || undefined,
      });

      return c.json({
        cursor: result.cursor,
        repos: result.repos,
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to list repos',
      });
    }
  });

  /**
   * GET com.atproto.sync.subscribeRepos
   * Subscribe to repository event firehose (WebSocket/SSE)
   */
  router.get('/com.atproto.sync.subscribeRepos', async (c) => {
    const cursor = c.req.query('cursor');

    // Upgrade to WebSocket if possible, otherwise use SSE
    const upgrade = c.req.header('upgrade');

    if (upgrade?.toLowerCase() === 'websocket') {
      // WebSocket subscription
      return syncService.subscribeWebSocket(c, cursor ? parseInt(cursor, 10) : undefined);
    }

    // Server-Sent Events fallback
    return streamSSE(c, async (stream) => {
      try {
        await syncService.subscribeSSE(stream, cursor ? parseInt(cursor, 10) : undefined);
      } catch (error) {
        console.error('SSE subscription error:', error);
      }
    });
  });

  /**
   * POST com.atproto.sync.notifyOfUpdate
   * Notify of repository update (for push-based sync)
   */
  router.post('/com.atproto.sync.notifyOfUpdate', async (c) => {
    const body = await c.req.json<{
      hostname: string;
    }>();

    if (!body.hostname) {
      throw new HTTPException(400, { message: 'Missing required field: hostname' });
    }

    try {
      await syncService.notifyOfUpdate(body.hostname);
      return c.json({ success: true });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to notify of update',
      });
    }
  });

  /**
   * POST com.atproto.sync.requestCrawl
   * Request server to crawl a repository
   */
  router.post('/com.atproto.sync.requestCrawl', async (c) => {
    const body = await c.req.json<{
      hostname: string;
    }>();

    if (!body.hostname) {
      throw new HTTPException(400, { message: 'Missing required field: hostname' });
    }

    try {
      await syncService.requestCrawl(body.hostname);
      return c.json({ success: true });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to request crawl',
      });
    }
  });

  return router;
}

export default createAtprotoSyncRouter;
