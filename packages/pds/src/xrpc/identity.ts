import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolveHandle, isValidHandle } from '../identity/handle.js';
import { isValidDid, getDidDocumentUrl } from '../identity/did.js';

/**
 * Account lookup interface
 */
export interface AccountLookup {
  getDidByHandle(handle: string): Promise<string | null>;
  getHandleByDid(did: string): Promise<string | null>;
}

/**
 * Create identity XRPC router
 */
export function createIdentityRouter(accountLookup: AccountLookup) {
  const router = new Hono();

  /**
   * GET com.atproto.identity.resolveHandle
   * Resolve a handle to a DID
   */
  router.get('/com.atproto.identity.resolveHandle', async (c) => {
    const handle = c.req.query('handle');

    if (!handle) {
      throw new HTTPException(400, { message: 'Missing handle parameter' });
    }

    if (!isValidHandle(handle)) {
      throw new HTTPException(400, { message: 'Invalid handle format' });
    }

    // First try local lookup
    const localDid = await accountLookup.getDidByHandle(handle);
    if (localDid) {
      return c.json({ did: localDid });
    }

    // Try external resolution
    const externalDid = await resolveHandle(handle);
    if (externalDid) {
      return c.json({ did: externalDid });
    }

    throw new HTTPException(404, { message: 'Handle not found' });
  });

  /**
   * POST com.atproto.identity.updateHandle
   * Update the authenticated user's handle
   */
  router.post('/com.atproto.identity.updateHandle', async (c) => {
    // Requires authentication - would need session middleware
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }

    const body = await c.req.json<{ handle: string }>();

    if (!body.handle) {
      throw new HTTPException(400, { message: 'Missing handle parameter' });
    }

    if (!isValidHandle(body.handle)) {
      throw new HTTPException(400, { message: 'Invalid handle format' });
    }

    // In full implementation:
    // 1. Validate new handle is available
    // 2. Validate handle ownership (DNS/HTTP verification)
    // 3. Update account record
    // 4. Update DID document

    throw new HTTPException(501, {
      message: 'Handle updates not yet implemented',
    });
  });

  /**
   * GET com.atproto.identity.getRecommendedDidCredentials
   * Get recommended credentials for DID creation
   */
  router.get('/com.atproto.identity.getRecommendedDidCredentials', async (c) => {
    // Return recommended settings for new accounts
    return c.json({
      rotationKeys: [],
      alsoKnownAs: [],
      verificationMethods: {
        atproto: 'secp256k1',
      },
      services: {},
    });
  });

  /**
   * POST com.atproto.identity.signPlcOperation
   * Sign a PLC operation (for did:plc)
   */
  router.post('/com.atproto.identity.signPlcOperation', async (c) => {
    // This is for did:plc which we don't support yet
    throw new HTTPException(501, {
      message: 'PLC operations not supported (using did:web)',
    });
  });

  /**
   * POST com.atproto.identity.submitPlcOperation
   * Submit a signed PLC operation
   */
  router.post('/com.atproto.identity.submitPlcOperation', async (c) => {
    throw new HTTPException(501, {
      message: 'PLC operations not supported (using did:web)',
    });
  });

  return router;
}
