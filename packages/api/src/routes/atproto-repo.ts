import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import { RepositoryService } from '../services/repository/index.js';

/**
 * AT Protocol Repository XRPC Routes
 * Implements com.atproto.repo.* endpoints for record management
 */

export function createAtprotoRepoRouter(repoService: RepositoryService) {
  const router = new Hono();

  /**
   * POST com.atproto.repo.createRecord
   * Create a new record in the user's repository
   */
  router.post('/com.atproto.repo.createRecord', authMiddleware, async (c) => {
    const userDid = c.get('did');
    const body = await c.req.json<{
      repo: string;
      collection: string;
      rkey?: string;
      validate?: boolean;
      record: unknown;
      swapCommit?: string;
    }>();

    // Verify repo matches authenticated user
    if (body.repo !== userDid) {
      throw new HTTPException(403, { message: 'Cannot create records in another user\'s repository' });
    }

    if (!body.collection || !body.record) {
      throw new HTTPException(400, { message: 'Missing required fields: collection, record' });
    }

    try {
      const result = await repoService.createRecord({
        did: userDid,
        collection: body.collection,
        rkey: body.rkey,
        record: body.record,
        validate: body.validate ?? true,
      });

      return c.json({
        uri: result.uri,
        cid: result.cid,
      });
    } catch (error) {
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : 'Failed to create record',
      });
    }
  });

  /**
   * GET com.atproto.repo.getRecord
   * Get a specific record from a repository
   */
  router.get('/com.atproto.repo.getRecord', async (c) => {
    const repo = c.req.query('repo');
    const collection = c.req.query('collection');
    const rkey = c.req.query('rkey');
    const cid = c.req.query('cid');

    if (!repo || !collection || !rkey) {
      throw new HTTPException(400, { message: 'Missing required parameters: repo, collection, rkey' });
    }

    try {
      const result = await repoService.getRecord({
        did: repo,
        collection,
        rkey,
        cid: cid || undefined,
      });

      if (!result) {
        throw new HTTPException(404, { message: 'Record not found' });
      }

      return c.json({
        uri: result.uri,
        cid: result.cid,
        value: result.value,
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get record',
      });
    }
  });

  /**
   * GET com.atproto.repo.listRecords
   * List records in a collection
   */
  router.get('/com.atproto.repo.listRecords', async (c) => {
    const repo = c.req.query('repo');
    const collection = c.req.query('collection');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const cursor = c.req.query('cursor');
    const reverse = c.req.query('reverse') === 'true';

    if (!repo || !collection) {
      throw new HTTPException(400, { message: 'Missing required parameters: repo, collection' });
    }

    try {
      const result = await repoService.listRecords({
        did: repo,
        collection,
        limit: Math.min(limit, 100),
        cursor: cursor || undefined,
        reverse,
      });

      return c.json({
        records: result.records,
        cursor: result.cursor,
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to list records',
      });
    }
  });

  /**
   * POST com.atproto.repo.putRecord
   * Update or create a record (upsert)
   */
  router.post('/com.atproto.repo.putRecord', authMiddleware, async (c) => {
    const userDid = c.get('did');
    const body = await c.req.json<{
      repo: string;
      collection: string;
      rkey: string;
      validate?: boolean;
      record: unknown;
      swapRecord?: string;
      swapCommit?: string;
    }>();

    if (body.repo !== userDid) {
      throw new HTTPException(403, { message: 'Cannot modify records in another user\'s repository' });
    }

    if (!body.collection || !body.rkey || !body.record) {
      throw new HTTPException(400, { message: 'Missing required fields: collection, rkey, record' });
    }

    try {
      const result = await repoService.putRecord({
        did: userDid,
        collection: body.collection,
        rkey: body.rkey,
        record: body.record,
        validate: body.validate ?? true,
        swapRecord: body.swapRecord,
      });

      return c.json({
        uri: result.uri,
        cid: result.cid,
      });
    } catch (error) {
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : 'Failed to put record',
      });
    }
  });

  /**
   * POST com.atproto.repo.deleteRecord
   * Delete a record from the repository
   */
  router.post('/com.atproto.repo.deleteRecord', authMiddleware, async (c) => {
    const userDid = c.get('did');
    const body = await c.req.json<{
      repo: string;
      collection: string;
      rkey: string;
      swapRecord?: string;
      swapCommit?: string;
    }>();

    if (body.repo !== userDid) {
      throw new HTTPException(403, { message: 'Cannot delete records in another user\'s repository' });
    }

    if (!body.collection || !body.rkey) {
      throw new HTTPException(400, { message: 'Missing required fields: collection, rkey' });
    }

    try {
      await repoService.deleteRecord({
        did: userDid,
        collection: body.collection,
        rkey: body.rkey,
        swapRecord: body.swapRecord,
      });

      return c.json({ success: true });
    } catch (error) {
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : 'Failed to delete record',
      });
    }
  });

  /**
   * POST com.atproto.repo.applyWrites
   * Apply multiple write operations atomically
   */
  router.post('/com.atproto.repo.applyWrites', authMiddleware, async (c) => {
    const userDid = c.get('did');
    const body = await c.req.json<{
      repo: string;
      validate?: boolean;
      writes: Array<
        | { $type: 'com.atproto.repo.applyWrites#create'; collection: string; rkey?: string; value: unknown }
        | { $type: 'com.atproto.repo.applyWrites#update'; collection: string; rkey: string; value: unknown }
        | { $type: 'com.atproto.repo.applyWrites#delete'; collection: string; rkey: string }
      >;
      swapCommit?: string;
    }>();

    if (body.repo !== userDid) {
      throw new HTTPException(403, { message: 'Cannot modify records in another user\'s repository' });
    }

    if (!body.writes || body.writes.length === 0) {
      throw new HTTPException(400, { message: 'No writes provided' });
    }

    try {
      const results = await repoService.applyWrites({
        did: userDid,
        writes: body.writes.map((w) => {
          if (w.$type === 'com.atproto.repo.applyWrites#create') {
            return {
              action: 'create' as const,
              collection: w.collection,
              rkey: w.rkey,
              value: w.value,
            };
          } else if (w.$type === 'com.atproto.repo.applyWrites#update') {
            return {
              action: 'update' as const,
              collection: w.collection,
              rkey: w.rkey,
              value: w.value,
            };
          } else {
            return {
              action: 'delete' as const,
              collection: w.collection,
              rkey: w.rkey,
            };
          }
        }),
        validate: body.validate ?? true,
      });

      return c.json({ results });
    } catch (error) {
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : 'Failed to apply writes',
      });
    }
  });

  /**
   * GET com.atproto.repo.describeRepo
   * Get repository metadata
   */
  router.get('/com.atproto.repo.describeRepo', async (c) => {
    const repo = c.req.query('repo');

    if (!repo) {
      throw new HTTPException(400, { message: 'Missing required parameter: repo' });
    }

    try {
      const description = await repoService.describeRepo(repo);

      if (!description) {
        throw new HTTPException(404, { message: 'Repository not found' });
      }

      return c.json(description);
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to describe repository',
      });
    }
  });

  /**
   * POST com.atproto.repo.uploadBlob
   * Upload a blob to the repository
   */
  router.post('/com.atproto.repo.uploadBlob', authMiddleware, async (c) => {
    const userDid = c.get('did');
    const contentType = c.req.header('content-type') || 'application/octet-stream';

    try {
      const body = await c.req.arrayBuffer();
      const blob = Buffer.from(body);

      if (blob.length === 0) {
        throw new HTTPException(400, { message: 'Empty blob' });
      }

      if (blob.length > 100 * 1024 * 1024) {
        throw new HTTPException(413, { message: 'Blob too large (max 100MB)' });
      }

      const result = await repoService.uploadBlob({
        did: userDid,
        blob,
        mimeType: contentType,
      });

      return c.json({
        blob: {
          $type: 'blob',
          ref: result.cid,
          mimeType: contentType,
          size: blob.length,
        },
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to upload blob',
      });
    }
  });

  return router;
}

export default createAtprotoRepoRouter;
