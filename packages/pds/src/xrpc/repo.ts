import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { CID } from 'multiformats/cid';
import { Repository, RepoRecord } from '../repo/repo.js';
import { parseAtUri, isValidCollection, isValidRkey, calculateRecordCid } from '../repo/record.js';
import { BlobStore, BlobMetadata } from '../storage/blob-store.js';

/**
 * Repository store interface for XRPC
 */
export interface RepoStoreManager {
  getRepo(did: string): Promise<Repository | null>;
  createRepo(did: string): Promise<Repository>;
}

/**
 * Session context from auth middleware
 */
export interface SessionContext {
  did: string;
}

/**
 * Create repo XRPC router
 */
export function createRepoRouter(
  repoManager: RepoStoreManager,
  blobStore: BlobStore,
  getSession: (c: { req: { header(name: string): string | undefined } }) => Promise<SessionContext | null>
) {
  const router = new Hono();

  /**
   * Require authentication middleware
   */
  const requireAuth = async (c: {
    req: { header(name: string): string | undefined };
    set(key: string, value: unknown): void;
  }, next: () => Promise<void>) => {
    const session = await getSession(c);
    if (!session) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }
    c.set('session', session);
    return next();
  };

  /**
   * POST com.atproto.repo.createRecord
   * Create a new record in a repository
   */
  router.post('/com.atproto.repo.createRecord', requireAuth, async (c) => {
    const session = c.get('session') as SessionContext;

    const body = await c.req.json<{
      repo: string;
      collection: string;
      rkey?: string;
      validate?: boolean;
      record: unknown;
    }>();

    // Validate repo (must be the authenticated user)
    if (body.repo !== session.did) {
      throw new HTTPException(403, {
        message: 'Cannot create records in another user\'s repo',
      });
    }

    // Validate collection
    if (!isValidCollection(body.collection)) {
      throw new HTTPException(400, {
        message: 'Invalid collection NSID',
      });
    }

    // Validate rkey if provided
    if (body.rkey && !isValidRkey(body.rkey)) {
      throw new HTTPException(400, {
        message: 'Invalid record key',
      });
    }

    // Get or create repo
    let repo = await repoManager.getRepo(session.did);
    if (!repo) {
      repo = await repoManager.createRepo(session.did);
    }

    // Create record
    const result = await repo.createRecord(body.collection, body.record, body.rkey);

    // Commit changes
    await repo.commit();

    return c.json({
      uri: result.uri,
      cid: result.cid.toString(),
    });
  });

  /**
   * GET com.atproto.repo.getRecord
   * Get a single record
   */
  router.get('/com.atproto.repo.getRecord', async (c) => {
    const repo = c.req.query('repo');
    const collection = c.req.query('collection');
    const rkey = c.req.query('rkey');
    const cid = c.req.query('cid');

    if (!repo || !collection || !rkey) {
      throw new HTTPException(400, {
        message: 'Missing required parameters: repo, collection, rkey',
      });
    }

    const repoInstance = await repoManager.getRepo(repo);
    if (!repoInstance) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    const record = await repoInstance.getRecord(collection, rkey);
    if (!record) {
      throw new HTTPException(404, { message: 'Record not found' });
    }

    // Check CID if provided
    if (cid && record.cid.toString() !== cid) {
      throw new HTTPException(404, {
        message: 'Record not found with specified CID',
      });
    }

    return c.json({
      uri: record.uri,
      cid: record.cid.toString(),
      value: record.value,
    });
  });

  /**
   * POST com.atproto.repo.putRecord
   * Create or update a record
   */
  router.post('/com.atproto.repo.putRecord', requireAuth, async (c) => {
    const session = c.get('session') as SessionContext;

    const body = await c.req.json<{
      repo: string;
      collection: string;
      rkey: string;
      validate?: boolean;
      record: unknown;
      swapRecord?: string; // CID to swap from
      swapCommit?: string; // Commit CID to swap from
    }>();

    if (body.repo !== session.did) {
      throw new HTTPException(403, {
        message: 'Cannot modify another user\'s repo',
      });
    }

    if (!isValidCollection(body.collection)) {
      throw new HTTPException(400, { message: 'Invalid collection NSID' });
    }

    if (!isValidRkey(body.rkey)) {
      throw new HTTPException(400, { message: 'Invalid record key' });
    }

    let repo = await repoManager.getRepo(session.did);
    if (!repo) {
      repo = await repoManager.createRepo(session.did);
    }

    // Check swap conditions
    if (body.swapRecord) {
      const existing = await repo.getRecord(body.collection, body.rkey);
      if (!existing || existing.cid.toString() !== body.swapRecord) {
        throw new HTTPException(400, {
          message: 'SwapRecord condition failed',
        });
      }
    }

    // Update or create record
    const result = await repo.updateRecord(body.collection, body.rkey, body.record);
    await repo.commit();

    return c.json({
      uri: result.uri,
      cid: result.cid.toString(),
    });
  });

  /**
   * POST com.atproto.repo.deleteRecord
   * Delete a record
   */
  router.post('/com.atproto.repo.deleteRecord', requireAuth, async (c) => {
    const session = c.get('session') as SessionContext;

    const body = await c.req.json<{
      repo: string;
      collection: string;
      rkey: string;
      swapRecord?: string;
      swapCommit?: string;
    }>();

    if (body.repo !== session.did) {
      throw new HTTPException(403, {
        message: 'Cannot modify another user\'s repo',
      });
    }

    const repo = await repoManager.getRepo(session.did);
    if (!repo) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    // Check swap condition
    if (body.swapRecord) {
      const existing = await repo.getRecord(body.collection, body.rkey);
      if (!existing || existing.cid.toString() !== body.swapRecord) {
        throw new HTTPException(400, {
          message: 'SwapRecord condition failed',
        });
      }
    }

    await repo.deleteRecord(body.collection, body.rkey);
    await repo.commit();

    return c.json({ success: true });
  });

  /**
   * GET com.atproto.repo.listRecords
   * List records in a collection
   */
  router.get('/com.atproto.repo.listRecords', async (c) => {
    const repoDid = c.req.query('repo');
    const collection = c.req.query('collection');
    const limit = parseInt(c.req.query('limit') || '50');
    const cursor = c.req.query('cursor');
    const reverse = c.req.query('reverse') === 'true';

    if (!repoDid || !collection) {
      throw new HTTPException(400, {
        message: 'Missing required parameters: repo, collection',
      });
    }

    const repo = await repoManager.getRepo(repoDid);
    if (!repo) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    const result = await repo.listRecords(collection, {
      limit: Math.min(limit, 100),
      cursor,
      reverse,
    });

    return c.json({
      records: result.records.map((r: RepoRecord) => ({
        uri: r.uri,
        cid: r.cid.toString(),
        value: r.value,
      })),
      cursor: result.cursor,
    });
  });

  /**
   * POST com.atproto.repo.uploadBlob
   * Upload a blob
   */
  router.post('/com.atproto.repo.uploadBlob', requireAuth, async (c) => {
    const session = c.get('session') as SessionContext;

    const contentType = c.req.header('Content-Type') || 'application/octet-stream';
    const body = await c.req.arrayBuffer();
    const data = Buffer.from(body);

    // Size limit (e.g., 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (data.length > maxSize) {
      throw new HTTPException(413, {
        message: `Blob too large. Maximum size is ${maxSize} bytes`,
      });
    }

    // Store blob
    const metadata: BlobMetadata = await blobStore.putBlob(session.did, data, contentType);

    return c.json({
      blob: {
        $type: 'blob',
        ref: {
          $link: metadata.cid.toString(),
        },
        mimeType: metadata.mimeType,
        size: metadata.size,
      },
    });
  });

  /**
   * GET com.atproto.repo.describeRepo
   * Get repo metadata
   */
  router.get('/com.atproto.repo.describeRepo', async (c) => {
    const repoDid = c.req.query('repo');

    if (!repoDid) {
      throw new HTTPException(400, { message: 'Missing repo parameter' });
    }

    const repo = await repoManager.getRepo(repoDid);
    if (!repo) {
      throw new HTTPException(404, { message: 'Repo not found' });
    }

    const commit = repo.getCurrentCommit();
    const collections = new Set<string>();

    // Get collections (would need to scan records)
    // For now, return common collections
    const records = await repo.listRecords('io.exprsn.video.post', { limit: 1 });
    if (records.records.length > 0) {
      collections.add('io.exprsn.video.post');
    }

    return c.json({
      handle: repoDid, // Would need account store to get actual handle
      did: repoDid,
      didDoc: null, // Would generate from account data
      collections: Array.from(collections),
      handleIsCorrect: true,
    });
  });

  return router;
}
