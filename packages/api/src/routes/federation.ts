import { Hono } from 'hono';
import { ContentSync } from '../services/federation/ContentSync.js';
import { FederatedSearch } from '../services/federation/FederatedSearch.js';
import { ServiceAuth } from '../services/federation/ServiceAuth.js';
import { getServiceRegistry } from './registry.js';
import { db } from '../db/index.js';
import { eq, and, desc, gt } from 'drizzle-orm';
import { repoRecords } from '../db/schema.js';

// Singleton instances
let contentSync: ContentSync | null = null;
let federatedSearch: FederatedSearch | null = null;
let serviceAuth: ServiceAuth | null = null;

export function getServiceAuth(): ServiceAuth {
  if (!serviceAuth) {
    serviceAuth = new ServiceAuth({ db });
  }
  return serviceAuth;
}

export function getContentSync(): ContentSync {
  if (!contentSync) {
    contentSync = new ContentSync({
      db,
      serviceAuth: getServiceAuth(),
      certificateId: process.env.FEDERATION_CERTIFICATE_ID,
      privateKey: process.env.FEDERATION_PRIVATE_KEY,
    });
  }
  return contentSync;
}

export function getFederatedSearch(): FederatedSearch {
  if (!federatedSearch) {
    federatedSearch = new FederatedSearch({
      serviceRegistry: getServiceRegistry(),
      serviceAuth: getServiceAuth(),
      certificateId: process.env.FEDERATION_CERTIFICATE_ID,
      privateKey: process.env.FEDERATION_PRIVATE_KEY,
    });
  }
  return federatedSearch;
}

const federationRouter = new Hono();

// ===========================================
// Sync Endpoints (io.exprsn.sync.*)
// ===========================================

/**
 * GET io.exprsn.sync.getRecords
 * Get records for federation sync (called by remote servers)
 */
federationRouter.get('/io.exprsn.sync.getRecords', async (c) => {
  const collection = c.req.query('collection');
  const since = c.req.query('since');
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 1000);
  const did = c.req.query('did');

  try {
    let query = db.select().from(repoRecords);
    const conditions = [];

    if (collection) {
      conditions.push(eq(repoRecords.collection, collection));
    }

    if (did) {
      conditions.push(eq(repoRecords.did, did));
    }

    if (since) {
      const sinceDate = new Date(since);
      conditions.push(gt(repoRecords.indexedAt, sinceDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const records = await query
      .orderBy(desc(repoRecords.indexedAt))
      .limit(limit + 1);

    const hasMore = records.length > limit;
    const resultRecords = records.slice(0, limit);

    const lastRecord = resultRecords[resultRecords.length - 1];
    const cursor = hasMore && lastRecord
      ? lastRecord.indexedAt?.toISOString()
      : undefined;

    return c.json({
      records: resultRecords.map((r) => ({
        uri: r.uri,
        cid: r.cid,
        collection: r.collection,
        rkey: r.rkey,
        record: r.record,
        createdAt: r.indexedAt?.toISOString(),
      })),
      cursor,
    });
  } catch (error) {
    console.error('Get records error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get records' }, 500);
  }
});

/**
 * POST io.exprsn.sync.pushRecords
 * Receive records from remote servers (federation push)
 */
federationRouter.post('/io.exprsn.sync.pushRecords', async (c) => {
  // Verify service authentication
  const auth = getServiceAuth();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(c.req.header())) {
    if (typeof value === 'string') {
      headers[key.toLowerCase()] = value;
    }
  }

  let body: { records: Array<{ uri: string; cid: string; collection: string; rkey: string; record: unknown; createdAt: string }> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'InvalidRequest', message: 'Invalid JSON body' }, 400);
  }

  // Optional: Verify service auth (if headers present)
  if (headers['x-exprsn-certificate']) {
    const authResult = await auth.verifyRequest(headers, 'POST', c.req.path, body);
    if (!authResult) {
      return c.json({ error: 'Unauthorized', message: 'Service authentication failed' }, 401);
    }
  }

  if (!body.records || !Array.isArray(body.records)) {
    return c.json({ error: 'InvalidRequest', message: 'Missing records array' }, 400);
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{ uri: string; error: string }> = [];

  for (const record of body.records) {
    try {
      const uriParts = record.uri.replace('at://', '').split('/');
      const did = uriParts[0];

      await db
        .insert(repoRecords)
        .values({
          uri: record.uri,
          cid: record.cid,
          did: did || '',
          collection: record.collection,
          rkey: record.rkey,
          record: record.record,
          indexedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: repoRecords.uri,
          set: {
            cid: record.cid,
            record: record.record,
            indexedAt: new Date(),
          },
        });

      processed++;
    } catch (error) {
      failed++;
      errors.push({
        uri: record.uri,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return c.json({ processed, failed, errors: errors.length > 0 ? errors : undefined });
});

/**
 * POST io.exprsn.sync.triggerSync
 * Trigger a sync from remote endpoints (admin only)
 */
federationRouter.post('/io.exprsn.sync.triggerSync', async (c) => {
  // TODO: Add admin auth check

  const body = await c.req.json<{
    endpoint?: string;
    collections?: string[];
    all?: boolean;
  }>();

  try {
    const sync = getContentSync();

    if (body.all || !body.endpoint) {
      // Full sync from all relays
      const collections = body.collections || [
        'io.exprsn.video.post',
        'io.exprsn.feed.like',
        'io.exprsn.feed.repost',
        'io.exprsn.graph.follow',
      ];

      const results = await sync.fullSync(collections);

      const summary: Record<string, { processed: number; failed: number; errors: number }> = {};
      for (const [endpoint, result] of results) {
        summary[endpoint] = {
          processed: result.recordsProcessed,
          failed: result.recordsFailed,
          errors: result.errors.length,
        };
      }

      return c.json({ success: true, results: summary });
    }

    // Single endpoint sync
    const result = await sync.syncFromRemote(body.endpoint, {
      collection: body.collections?.[0],
    });

    return c.json({
      success: result.success,
      processed: result.recordsProcessed,
      failed: result.recordsFailed,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Trigger sync error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to trigger sync' }, 500);
  }
});

// ===========================================
// Federated Search Endpoints
// ===========================================

/**
 * GET io.exprsn.federation.search
 * Federated search across all appviews
 */
federationRouter.get('/io.exprsn.federation.search', async (c) => {
  const q = c.req.query('q');
  const collection = c.req.query('collection');
  const limit = parseInt(c.req.query('limit') || '25', 10);
  const cursor = c.req.query('cursor');
  const sort = (c.req.query('sort') as 'relevance' | 'recent' | 'popular') || 'relevance';
  const author = c.req.query('author');
  const since = c.req.query('since');
  const until = c.req.query('until');
  const tags = c.req.query('tags');

  if (!q) {
    return c.json({ error: 'InvalidRequest', message: 'Missing q parameter' }, 400);
  }

  try {
    const search = getFederatedSearch();
    const result = await search.search({
      q,
      collection,
      limit,
      cursor,
      sort,
      filters: {
        author,
        since,
        until,
        tags: tags ? tags.split(',') : undefined,
      },
    });

    return c.json(result);
  } catch (error) {
    console.error('Federated search error:', error);
    return c.json({ error: 'InternalError', message: 'Search failed' }, 500);
  }
});

/**
 * GET io.exprsn.federation.getTrending
 * Get trending content across federation
 */
federationRouter.get('/io.exprsn.federation.getTrending', async (c) => {
  const collection = c.req.query('collection');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const timeRange = (c.req.query('timeRange') as '1h' | '6h' | '24h' | '7d') || '24h';

  try {
    const search = getFederatedSearch();
    const results = await search.getTrending({ collection, limit, timeRange });

    return c.json({ feed: results });
  } catch (error) {
    console.error('Get trending error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get trending' }, 500);
  }
});

/**
 * GET io.exprsn.federation.discoverUsers
 * Discover users across federation
 */
federationRouter.get('/io.exprsn.federation.discoverUsers', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '25', 10);
  const suggestions = c.req.query('suggestions') === 'true';

  try {
    const search = getFederatedSearch();
    const result = await search.discoverUsers({ query, limit, suggestions });

    return c.json(result);
  } catch (error) {
    console.error('Discover users error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to discover users' }, 500);
  }
});

// ===========================================
// Content Sync Blob/Repo Endpoints
// ===========================================

/**
 * POST io.exprsn.sync.syncBlob
 * Sync a blob from a remote server
 */
federationRouter.post('/io.exprsn.sync.syncBlob', async (c) => {
  const body = await c.req.json<{
    endpoint: string;
    did: string;
    cid: string;
  }>();

  if (!body.endpoint || !body.did || !body.cid) {
    return c.json({ error: 'InvalidRequest', message: 'Missing endpoint, did, or cid' }, 400);
  }

  try {
    const sync = getContentSync();
    const result = await sync.syncBlob(body.endpoint, body.did, body.cid);

    if (!result.success) {
      return c.json({ error: 'SyncFailed', message: result.error }, 500);
    }

    return c.json({
      success: true,
      size: result.data?.length,
      mimeType: result.mimeType,
    });
  } catch (error) {
    console.error('Sync blob error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to sync blob' }, 500);
  }
});

/**
 * POST io.exprsn.sync.syncRepo
 * Sync a repo from a remote server
 */
federationRouter.post('/io.exprsn.sync.syncRepo', async (c) => {
  const body = await c.req.json<{
    endpoint: string;
    did: string;
    since?: string;
  }>();

  if (!body.endpoint || !body.did) {
    return c.json({ error: 'InvalidRequest', message: 'Missing endpoint or did' }, 400);
  }

  try {
    const sync = getContentSync();
    const result = await sync.syncRepo(body.endpoint, body.did, { since: body.since });

    if (!result.success) {
      return c.json({ error: 'SyncFailed', message: result.error }, 500);
    }

    return c.json({
      success: true,
      carSize: result.carBytes?.length,
    });
  } catch (error) {
    console.error('Sync repo error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to sync repo' }, 500);
  }
});

/**
 * POST io.exprsn.sync.pushToRemote
 * Push records to a remote server
 */
federationRouter.post('/io.exprsn.sync.pushToRemote', async (c) => {
  const body = await c.req.json<{
    endpoint: string;
    records: Array<{
      uri: string;
      cid: string;
      collection: string;
      rkey: string;
      record: unknown;
      createdAt: string;
    }>;
  }>();

  if (!body.endpoint || !body.records) {
    return c.json({ error: 'InvalidRequest', message: 'Missing endpoint or records' }, 400);
  }

  try {
    const sync = getContentSync();
    const result = await sync.pushToRemote(body.endpoint, body.records);

    return c.json({
      success: result.success,
      processed: result.recordsProcessed,
      failed: result.recordsFailed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error('Push to remote error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to push to remote' }, 500);
  }
});

export { federationRouter };
export default federationRouter;
