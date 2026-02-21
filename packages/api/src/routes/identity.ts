import { Hono } from 'hono';
import { getIdentityService } from '../services/identity/index.js';

const identityRouter = new Hono();

/**
 * GET io.exprsn.identity.resolveDid
 * Resolve a DID to its document (cached)
 */
identityRouter.get('/io.exprsn.identity.resolveDid', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did parameter' }, 400);
  }

  if (!did.startsWith('did:')) {
    return c.json({ error: 'InvalidRequest', message: 'Invalid DID format' }, 400);
  }

  try {
    const identityService = getIdentityService();
    const resolved = await identityService.resolveAndPersist(did);

    if (!resolved) {
      return c.json({ error: 'NotFound', message: 'DID not found' }, 404);
    }

    return c.json({
      did: resolved.did,
      document: resolved.document,
      handle: resolved.handle,
      pdsEndpoint: resolved.pdsEndpoint,
      signingKey: resolved.signingKey,
      resolvedAt: resolved.resolvedAt.toISOString(),
    });
  } catch (error) {
    console.error('DID resolution error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to resolve DID' }, 500);
  }
});

/**
 * GET io.exprsn.identity.resolveHandle
 * Resolve a handle to a DID
 */
identityRouter.get('/io.exprsn.identity.resolveHandle', async (c) => {
  const handle = c.req.query('handle');

  if (!handle) {
    return c.json({ error: 'InvalidRequest', message: 'Missing handle parameter' }, 400);
  }

  // Normalize handle
  const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

  try {
    const identityService = getIdentityService();
    const did = await identityService.resolveHandle(normalizedHandle);

    if (!did) {
      return c.json({ error: 'NotFound', message: 'Handle not found' }, 404);
    }

    return c.json({ did });
  } catch (error) {
    console.error('Handle resolution error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to resolve handle' }, 500);
  }
});

/**
 * GET io.exprsn.identity.getDidDocument
 * Get the full DID document for a DID
 */
identityRouter.get('/io.exprsn.identity.getDidDocument', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did parameter' }, 400);
  }

  try {
    const identityService = getIdentityService();
    const resolved = await identityService.resolveAndPersist(did);

    if (!resolved) {
      return c.json({ error: 'NotFound', message: 'DID not found' }, 404);
    }

    return c.json(resolved.document, 200, {
      'Content-Type': 'application/did+json',
    });
  } catch (error) {
    console.error('DID document fetch error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to fetch DID document' }, 500);
  }
});

/**
 * POST io.exprsn.identity.invalidateCache
 * Invalidate cached DID resolution (admin only)
 */
identityRouter.post('/io.exprsn.identity.invalidateCache', async (c) => {
  // TODO: Add admin auth check
  const body = await c.req.json<{ did?: string; all?: boolean }>();

  try {
    const identityService = getIdentityService();

    if (body.all) {
      await identityService.clearCache();
      return c.json({ success: true, message: 'All cache cleared' });
    }

    if (!body.did) {
      return c.json({ error: 'InvalidRequest', message: 'Missing did parameter' }, 400);
    }

    await identityService.invalidate(body.did);
    return c.json({ success: true, did: body.did });
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to invalidate cache' }, 500);
  }
});

/**
 * GET io.exprsn.identity.getCacheStats
 * Get identity cache statistics (admin only)
 */
identityRouter.get('/io.exprsn.identity.getCacheStats', async (c) => {
  // TODO: Add admin auth check
  try {
    const identityService = getIdentityService();
    const stats = await identityService.getStats();

    return c.json(stats);
  } catch (error) {
    console.error('Cache stats error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get cache stats' }, 500);
  }
});

export { identityRouter };
export default identityRouter;
