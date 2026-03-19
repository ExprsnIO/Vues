import { Hono } from 'hono';
import { ContentSync } from '../services/federation/ContentSync.js';
import { FederatedSearch } from '../services/federation/FederatedSearch.js';
import { ServiceAuth } from '../services/federation/ServiceAuth.js';
import { createBlobSync } from '../services/federation/BlobSync.js';
import { getServiceRegistry } from './registry.js';
import { db } from '../db/index.js';
import { eq, and, desc, gt, sql } from 'drizzle-orm';
import { repoRecords, serviceRegistry, federationSyncState } from '../db/schema.js';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { nanoid } from 'nanoid';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema.js';

// Lazy-loaded federation consumer to avoid circular deps
let federationConsumer: Awaited<ReturnType<typeof import('../workers/federationConsumer.js').getFederationConsumer>> | null = null;

async function getFederationConsumer() {
  if (!federationConsumer) {
    const { getFederationConsumer: getConsumer } = await import('../workers/federationConsumer.js');
    federationConsumer = getConsumer(db as PostgresJsDatabase<typeof schema>);
  }
  return federationConsumer;
}

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
 *
 * SECURITY: Requires service authentication to prevent unauthorized data injection.
 * Set FEDERATION_REQUIRE_AUTH=false to disable (not recommended for production).
 */
federationRouter.post('/io.exprsn.sync.pushRecords', async (c) => {
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

  // Verify service authentication
  // SECURITY: Auth is required by default to prevent unauthorized data injection
  const requireAuth = process.env.FEDERATION_REQUIRE_AUTH !== 'false';

  if (requireAuth) {
    // Auth is required - must have valid certificate
    if (!headers['x-exprsn-certificate']) {
      return c.json(
        { error: 'Unauthorized', message: 'Service authentication required for federation push' },
        401
      );
    }

    const authResult = await auth.verifyRequest(headers, 'POST', c.req.path, body);
    if (!authResult) {
      return c.json({ error: 'Unauthorized', message: 'Service authentication failed' }, 401);
    }
  } else if (headers['x-exprsn-certificate']) {
    // Auth not required but headers present - still verify them
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
federationRouter.post(
  '/io.exprsn.sync.triggerSync',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
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
  }
);

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

// ===========================================
// Federation Admin Endpoints
// ===========================================

/**
 * POST io.exprsn.admin.addRelay
 * Register an external relay for federation
 */
federationRouter.post(
  '/io.exprsn.admin.addRelay',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      endpoint: string;
      name?: string;
      description?: string;
      region?: string;
      wantedCollections?: string[];
      autoSubscribe?: boolean;
    }>();

    if (!body.endpoint) {
      return c.json({ error: 'InvalidRequest', message: 'Missing endpoint' }, 400);
    }

    // Validate endpoint URL
    try {
      new URL(body.endpoint);
    } catch {
      return c.json({ error: 'InvalidRequest', message: 'Invalid endpoint URL' }, 400);
    }

    try {
      // Check if relay already exists
      const existingRelays = await db
        .select()
        .from(serviceRegistry)
        .where(eq(serviceRegistry.endpoint, body.endpoint))
        .limit(1);

      const existingRelay = existingRelays[0];
      if (existingRelay) {
        // Update existing
        await db
          .update(serviceRegistry)
          .set({
            status: 'active',
            name: body.name || existingRelay.name,
            description: body.description,
            region: body.region || existingRelay.region,
            updatedAt: new Date(),
          })
          .where(eq(serviceRegistry.endpoint, body.endpoint));

        // Subscribe if requested
        if (body.autoSubscribe !== false) {
          const consumer = await getFederationConsumer();
          await consumer.subscribeToRelay(body.endpoint, existingRelay.id);
        }

        return c.json({
          success: true,
          relay: {
            id: existingRelay.id,
            endpoint: body.endpoint,
            status: 'active',
            action: 'updated',
          },
        });
      }

      // Create new relay entry
      const relayId = `relay_${nanoid(10)}`;
      await db.insert(serviceRegistry).values({
        id: relayId,
        type: 'relay',
        endpoint: body.endpoint,
        name: body.name || `Relay ${body.endpoint}`,
        description: body.description,
        status: 'active',
        region: body.region,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Subscribe if requested
      if (body.autoSubscribe !== false) {
        const consumer = await getFederationConsumer();
        await consumer.subscribeToRelay(body.endpoint, relayId);
      }

      return c.json({
        success: true,
        relay: {
          id: relayId,
          endpoint: body.endpoint,
          status: 'active',
          action: 'created',
        },
      });
    } catch (error) {
      console.error('Add relay error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to add relay' }, 500);
    }
  }
);

/**
 * DELETE io.exprsn.admin.removeRelay
 * Remove an external relay from federation
 */
federationRouter.post(
  '/io.exprsn.admin.removeRelay',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      relayId?: string;
      endpoint?: string;
      hardDelete?: boolean;
    }>();

    if (!body.relayId && !body.endpoint) {
      return c.json({ error: 'InvalidRequest', message: 'Missing relayId or endpoint' }, 400);
    }

    try {
      const condition = body.relayId
        ? eq(serviceRegistry.id, body.relayId)
        : eq(serviceRegistry.endpoint, body.endpoint!);

      // Get relay info first
      const relays = await db
        .select()
        .from(serviceRegistry)
        .where(condition)
        .limit(1);

      const relay = relays[0];
      if (!relay) {
        return c.json({ error: 'NotFound', message: 'Relay not found' }, 404);
      }

      // Unsubscribe from firehose
      const consumer = await getFederationConsumer();
      await consumer.unsubscribeFromRelay(relay.endpoint);

      if (body.hardDelete) {
        // Permanently delete
        await db.delete(serviceRegistry).where(condition);

        // Also delete sync state
        await db
          .delete(federationSyncState)
          .where(eq(federationSyncState.remoteEndpoint, relay.endpoint));
      } else {
        // Soft delete (mark inactive)
        await db
          .update(serviceRegistry)
          .set({
            status: 'inactive',
            updatedAt: new Date(),
          })
          .where(condition);
      }

      return c.json({
        success: true,
        relay: {
          id: relay.id,
          endpoint: relay.endpoint,
          action: body.hardDelete ? 'deleted' : 'deactivated',
        },
      });
    } catch (error) {
      console.error('Remove relay error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to remove relay' }, 500);
    }
  }
);

/**
 * GET io.exprsn.admin.federationStatus
 * Get federation status including relay health and sync states
 */
federationRouter.get(
  '/io.exprsn.admin.federationStatus',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    try {
      // Get all registered relays
      const relays = await db
        .select()
        .from(serviceRegistry)
        .where(eq(serviceRegistry.type, 'relay'));

      // Get sync states
      const syncStates = await db.select().from(federationSyncState);

      // Get consumer status
      const consumer = await getFederationConsumer();
      const subscriptionStatus = consumer.getStatus();

      // Build relay status map
      const relayStatus = relays.map((relay) => {
        const syncState = syncStates.find((s) => s.remoteEndpoint === relay.endpoint);
        const subStatus = subscriptionStatus.get(relay.endpoint);

        return {
          id: relay.id,
          endpoint: relay.endpoint,
          name: relay.name,
          region: relay.region,
          registryStatus: relay.status,
          connectionStatus: subStatus?.status || 'not_connected',
          lastSyncedSeq: syncState?.lastSyncedSeq ?? null,
          lastSyncedAt: syncState?.lastSyncedAt?.toISOString() ?? null,
          errorCount: subStatus?.errorCount ?? syncState?.errorCount ?? 0,
          errorMessage: syncState?.errorMessage ?? null,
          createdAt: relay.createdAt.toISOString(),
        };
      });

      // Get counts
      const activeRelays = relayStatus.filter((r) => r.connectionStatus === 'connected').length;
      const totalSynced = syncStates.reduce((sum, s) => sum + (s.lastSyncedSeq || 0), 0);

      // Get recent sync activity
      const recentActivity = syncStates
        .filter((s) => s.lastSyncedAt)
        .sort((a, b) => (b.lastSyncedAt?.getTime() || 0) - (a.lastSyncedAt?.getTime() || 0))
        .slice(0, 5)
        .map((s) => ({
          endpoint: s.remoteEndpoint,
          lastSyncedAt: s.lastSyncedAt?.toISOString(),
          status: s.status,
        }));

      return c.json({
        summary: {
          totalRelays: relays.length,
          activeRelays,
          totalEventsProcessed: totalSynced,
          consumerRunning: subscriptionStatus.size > 0,
        },
        relays: relayStatus,
        recentActivity,
      });
    } catch (error) {
      console.error('Federation status error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to get federation status' }, 500);
    }
  }
);

/**
 * POST io.exprsn.admin.startFederationConsumer
 * Start the federation consumer worker
 */
federationRouter.post(
  '/io.exprsn.admin.startFederationConsumer',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    try {
      const consumer = await getFederationConsumer();
      await consumer.start();

      return c.json({
        success: true,
        message: 'Federation consumer started',
      });
    } catch (error) {
      console.error('Start federation consumer error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to start federation consumer' }, 500);
    }
  }
);

/**
 * POST io.exprsn.admin.stopFederationConsumer
 * Stop the federation consumer worker
 */
federationRouter.post(
  '/io.exprsn.admin.stopFederationConsumer',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    try {
      const consumer = await getFederationConsumer();
      await consumer.stop();

      return c.json({
        success: true,
        message: 'Federation consumer stopped',
      });
    } catch (error) {
      console.error('Stop federation consumer error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to stop federation consumer' }, 500);
    }
  }
);

/**
 * POST io.exprsn.admin.syncBlobManual
 * Manually sync a blob from a remote DID
 */
federationRouter.post(
  '/io.exprsn.admin.syncBlobManual',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      did: string;
      cid: string;
    }>();

    if (!body.did || !body.cid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did or cid' }, 400);
    }

    try {
      const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
      const result = await blobSync.syncBlob(body.did, body.cid);

      return c.json(result);
    } catch (error) {
      console.error('Manual blob sync error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to sync blob' }, 500);
    }
  }
);

// ===========================================
// Blob Sync Endpoints
// ===========================================

/**
 * GET io.exprsn.blob.getUrl
 * Get a CDN/presigned URL for a blob
 */
federationRouter.get('/io.exprsn.blob.getUrl', async (c) => {
  const did = c.req.query('did');
  const cid = c.req.query('cid');

  if (!did || !cid) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did or cid' }, 400);
  }

  try {
    const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
    const url = await blobSync.getBlobUrl(did, cid);

    if (!url) {
      return c.json({ error: 'NotFound', message: 'Blob not found' }, 404);
    }

    return c.json({ url, did, cid });
  } catch (error) {
    console.error('Get blob URL error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get blob URL' }, 500);
  }
});

/**
 * GET io.exprsn.blob.getMetadata
 * Get metadata for a blob (size, mimeType, etc.)
 */
federationRouter.get('/io.exprsn.blob.getMetadata', async (c) => {
  const did = c.req.query('did');
  const cid = c.req.query('cid');

  if (!did || !cid) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did or cid' }, 400);
  }

  try {
    const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
    const metadata = await blobSync.getBlobMetadata(did, cid);

    if (!metadata) {
      return c.json({ error: 'NotFound', message: 'Blob not found' }, 404);
    }

    return c.json(metadata);
  } catch (error) {
    console.error('Get blob metadata error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get blob metadata' }, 500);
  }
});

/**
 * GET io.exprsn.blob.listForDid
 * List all blobs for a DID
 */
federationRouter.get('/io.exprsn.blob.listForDid', async (c) => {
  const did = c.req.query('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const cursor = c.req.query('cursor');

  if (!did) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
  }

  try {
    const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
    const result = await blobSync.listBlobsForDid(did, { limit, cursor });

    return c.json(result);
  } catch (error) {
    console.error('List blobs error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to list blobs' }, 500);
  }
});

/**
 * GET io.exprsn.blob.getStorageQuota
 * Get storage quota information for a DID
 */
federationRouter.get('/io.exprsn.blob.getStorageQuota', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
  }

  try {
    const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
    const quota = await blobSync.checkStorageQuota(did, 0);

    return c.json({
      did,
      currentUsage: quota.currentUsage,
      quota: quota.quota,
      remaining: quota.remaining,
      percentUsed: quota.quota > 0 ? Math.round((quota.currentUsage / quota.quota) * 100) : 0,
    });
  } catch (error) {
    console.error('Get storage quota error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get storage quota' }, 500);
  }
});

/**
 * GET io.exprsn.admin.blobSync.stats
 * Get blob sync statistics (admin only)
 */
federationRouter.get(
  '/io.exprsn.admin.blobSync.stats',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    try {
      const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
      const stats = await blobSync.getStats();

      return c.json(stats);
    } catch (error) {
      console.error('Get blob sync stats error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to get blob sync stats' }, 500);
    }
  }
);

/**
 * POST io.exprsn.admin.blobSync.runGarbageCollection
 * Run garbage collection for orphaned blobs (admin only)
 */
federationRouter.post(
  '/io.exprsn.admin.blobSync.runGarbageCollection',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    let body: {
      did?: string;
      referencedCids?: string[];
      maxAgeMs?: number;
      dryRun?: boolean;
    };
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    try {
      const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);

      if (body.did && body.referencedCids) {
        // Cleanup orphaned blobs for a specific DID
        const result = await blobSync.cleanupOrphanedBlobs(body.did, body.referencedCids, body.dryRun);
        return c.json({
          type: 'orphaned',
          did: body.did,
          ...result,
        });
      } else if (body.maxAgeMs) {
        // Cleanup old blobs based on age
        const result = await blobSync.cleanupOldBlobs(body.maxAgeMs, body.dryRun);
        return c.json({
          type: 'old',
          maxAgeMs: body.maxAgeMs,
          ...result,
        });
      } else {
        return c.json({
          error: 'InvalidRequest',
          message: 'Must provide either (did + referencedCids) or maxAgeMs',
        }, 400);
      }
    } catch (error) {
      console.error('Garbage collection error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to run garbage collection' }, 500);
    }
  }
);

/**
 * POST io.exprsn.admin.blobSync.setQuota
 * Set storage quota for a DID (admin only)
 */
federationRouter.post(
  '/io.exprsn.admin.blobSync.setQuota',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      did: string;
      quotaBytes: number;
    }>();

    if (!body.did || typeof body.quotaBytes !== 'number') {
      return c.json({ error: 'InvalidRequest', message: 'Missing did or quotaBytes' }, 400);
    }

    if (body.quotaBytes < 0) {
      return c.json({ error: 'InvalidRequest', message: 'quotaBytes must be non-negative' }, 400);
    }

    try {
      const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
      await blobSync.setStorageQuota(body.did, body.quotaBytes);

      return c.json({
        success: true,
        did: body.did,
        quotaBytes: body.quotaBytes,
      });
    } catch (error) {
      console.error('Set quota error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to set quota' }, 500);
    }
  }
);

/**
 * POST io.exprsn.admin.blobSync.verifyBlob
 * Verify a blob's CID matches its content (admin only)
 */
federationRouter.post(
  '/io.exprsn.admin.blobSync.verifyBlob',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const body = await c.req.json<{
      did: string;
      cid: string;
    }>();

    if (!body.did || !body.cid) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did or cid' }, 400);
    }

    try {
      const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
      const result = await blobSync.verifyStoredBlob(body.did, body.cid);

      return c.json(result);
    } catch (error) {
      console.error('Verify blob error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to verify blob' }, 500);
    }
  }
);

/**
 * GET io.exprsn.admin.blobSync.getRateLimitStatus
 * Get rate limit status for a DID (admin only)
 */
federationRouter.get(
  '/io.exprsn.admin.blobSync.getRateLimitStatus',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const did = c.req.query('did');

    if (!did) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
    }

    try {
      const blobSync = createBlobSync(db as PostgresJsDatabase<typeof schema>);
      const status = await blobSync.getRateLimitStatus(did);

      return c.json({
        did,
        ...status,
      });
    } catch (error) {
      console.error('Get rate limit status error:', error);
      return c.json({ error: 'InternalError', message: 'Failed to get rate limit status' }, 500);
    }
  }
);

export { federationRouter };
export default federationRouter;
