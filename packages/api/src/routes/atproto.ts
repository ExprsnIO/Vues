import { Hono } from 'hono';
import { repositoryService } from '../services/repository/index.js';
import { syncService } from '../services/sync/index.js';
import { createAtprotoRepoRouter } from './atproto-repo.js';
import { createAtprotoSyncRouter } from './atproto-sync.js';
import { authMiddleware } from '../auth/middleware.js';

/**
 * AT Protocol Routes
 * Combines all AT Protocol XRPC endpoints
 */

const atprotoRouter = new Hono();

// Mount com.atproto.repo.* endpoints
const repoRouter = createAtprotoRepoRouter(repositoryService);
atprotoRouter.route('/', repoRouter);

// Mount com.atproto.sync.* endpoints
const syncRouter = createAtprotoSyncRouter(syncService);
atprotoRouter.route('/', syncRouter);

/**
 * GET com.atproto.server.describeServer
 * Describes the server's account creation requirements and capabilities
 */
atprotoRouter.get('/com.atproto.server.describeServer', async (c) => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  return c.json({
    availableUserDomains: [process.env.PDS_DOMAIN || 'exprsn.io'],
    inviteCodeRequired: false,
    phoneVerificationRequired: false,
    links: {
      privacyPolicy: `${appUrl}/privacy`,
      termsOfService: `${appUrl}/terms`,
    },
    did: `did:web:${process.env.PDS_DOMAIN || 'exprsn.io'}`,
    contact: {
      email: process.env.SUPPORT_EMAIL || undefined,
    },
  });
});

/**
 * GET com.atproto.identity.resolveHandle
 * Standard AT Protocol handle resolution
 */
atprotoRouter.get('/com.atproto.identity.resolveHandle', async (c) => {
  const handle = c.req.query('handle');

  if (!handle) {
    return c.json({ error: 'InvalidRequest', message: 'Missing handle parameter' }, 400);
  }

  const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

  try {
    const { getIdentityService } = await import('../services/identity/index.js');
    const identityService = getIdentityService();
    const did = await identityService.resolveHandle(normalizedHandle);

    if (!did) {
      return c.json({ error: 'HandleNotFound', message: 'Handle not found' }, 404);
    }

    return c.json({ did });
  } catch (error) {
    console.error('Handle resolution error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to resolve handle' }, 500);
  }
});

/**
 * POST com.atproto.identity.updateHandle
 * Update the handle for an account
 */
atprotoRouter.post('/com.atproto.identity.updateHandle', authMiddleware, async (c) => {
  const did = c.get('did');
  if (!did) {
    return c.json({ error: 'AuthRequired', message: 'Authentication required' }, 401);
  }

  const body = await c.req.json<{ handle: string }>();

  if (!body.handle) {
    return c.json({ error: 'InvalidRequest', message: 'Missing handle' }, 400);
  }

  const normalizedHandle = body.handle.toLowerCase().trim();

  // Validate handle format
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9](\.[a-z0-9][a-z0-9-]*[a-z0-9])*$/.test(normalizedHandle)) {
    return c.json({ error: 'InvalidHandle', message: 'Invalid handle format' }, 400);
  }

  try {
    const { db } = await import('../db/index.js');
    const { actorRepos, users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');

    // Check availability
    const existing = await db.query.actorRepos.findFirst({
      where: eq(actorRepos.handle, normalizedHandle),
    });

    if (existing && existing.did !== did) {
      return c.json({ error: 'HandleNotAvailable', message: 'Handle is already taken' }, 400);
    }

    // Update handle in both tables
    await db.update(actorRepos).set({ handle: normalizedHandle }).where(eq(actorRepos.did, did));
    await db.update(users).set({ handle: normalizedHandle, updatedAt: new Date() }).where(eq(users.did, did));

    return c.json({ success: true });
  } catch (error) {
    console.error('Handle update error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to update handle' }, 500);
  }
});

export { atprotoRouter };
export default atprotoRouter;
