/**
 * API Token Management Routes
 * CRUD operations for API tokens
 */

import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware.js';
import { TokenService } from '../services/tokens/TokenService.js';
import { db } from '../db/index.js';
import { actorRepos } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const tokenRouter = new Hono();

// Type definitions for request bodies
interface CreateTokenBody {
  name: string;
  description?: string;
  tokenType?: 'personal' | 'service';
  scopes: string[];
  allowedIps?: string[];
  allowedOrigins?: string[];
  rateLimit?: number;
  expiresInDays?: number;
}

interface UpdateTokenBody {
  tokenId: string;
  name?: string;
  description?: string;
  allowedIps?: string[];
  allowedOrigins?: string[];
  rateLimit?: number;
}

interface RevokeTokenBody {
  tokenId: string;
  reason?: string;
}

interface RotateTokenBody {
  tokenId: string;
}

interface IntrospectBody {
  token: string;
}

// Create new API token
tokenRouter.post(
  '/xrpc/io.exprsn.token.create',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<CreateTokenBody>();

    if (!body.name || !body.scopes?.length) {
      return c.json({ error: 'name and scopes are required' }, 400);
    }

    const tokenType = body.tokenType || 'personal';

    // Check if user can create service tokens (requires did:exprsn)
    if (tokenType === 'service') {
      const [account] = await db.select()
        .from(actorRepos)
        .where(eq(actorRepos.did, userDid))
        .limit(1);

      if (!account || account.didMethod !== 'exprn') {
        return c.json({
          error: 'Service tokens require a did:exprsn account',
          code: 'CERTIFICATE_REQUIRED',
        }, 400);
      }
    }

    try {
      const result = await TokenService.createToken({
        ownerDid: userDid,
        name: body.name,
        description: body.description,
        tokenType,
        scopes: body.scopes,
        allowedIps: body.allowedIps,
        allowedOrigins: body.allowedOrigins,
        rateLimit: body.rateLimit,
        expiresInDays: body.expiresInDays,
      });

      return c.json({
        tokenId: result.tokenId,
        token: result.token,
        tokenPrefix: result.tokenPrefix,
        expiresAt: result.expiresAt?.toISOString() || null,
        warning: 'Store this token securely. It cannot be retrieved again.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create token';
      return c.json({ error: message }, 400);
    }
  }
);

// List user's tokens
tokenRouter.get(
  '/xrpc/io.exprsn.token.list',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;

    const tokens = await TokenService.listTokens(userDid);

    return c.json({
      tokens: tokens.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tokenPrefix: t.tokenPrefix,
        tokenType: t.tokenType,
        scopes: t.scopes,
        status: t.status,
        lastUsedAt: t.lastUsedAt?.toISOString() || null,
        usageCount: t.usageCount,
        expiresAt: t.expiresAt?.toISOString() || null,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  }
);

// Get token details
tokenRouter.get(
  '/xrpc/io.exprsn.token.get',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const tokenId = c.req.query('tokenId');

    if (!tokenId) {
      return c.json({ error: 'tokenId required' }, 400);
    }

    const token = await TokenService.getToken(tokenId, userDid);

    if (!token) {
      return c.json({ error: 'Token not found' }, 404);
    }

    return c.json({
      ...token,
      lastUsedAt: token.lastUsedAt?.toISOString() || null,
      expiresAt: token.expiresAt?.toISOString() || null,
      createdAt: token.createdAt.toISOString(),
    });
  }
);

// Update token
tokenRouter.post(
  '/xrpc/io.exprsn.token.update',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<UpdateTokenBody>();

    if (!body.tokenId) {
      return c.json({ error: 'tokenId required' }, 400);
    }

    try {
      await TokenService.updateToken(body.tokenId, userDid, {
        name: body.name,
        description: body.description,
        allowedIps: body.allowedIps,
        allowedOrigins: body.allowedOrigins,
        rateLimit: body.rateLimit,
      });

      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update token';
      return c.json({ error: message }, 400);
    }
  }
);

// Revoke token
tokenRouter.post(
  '/xrpc/io.exprsn.token.revoke',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<RevokeTokenBody>();

    if (!body.tokenId) {
      return c.json({ error: 'tokenId required' }, 400);
    }

    try {
      await TokenService.revokeToken(body.tokenId, userDid, body.reason);
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke token';
      return c.json({ error: message }, 400);
    }
  }
);

// Rotate token
tokenRouter.post(
  '/xrpc/io.exprsn.token.rotate',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<RotateTokenBody>();

    if (!body.tokenId) {
      return c.json({ error: 'tokenId required' }, 400);
    }

    try {
      const result = await TokenService.rotateToken(body.tokenId, userDid);

      return c.json({
        newTokenId: result.newTokenId,
        token: result.token,
        warning: 'Store this token securely. It cannot be retrieved again.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rotate token';
      return c.json({ error: message }, 400);
    }
  }
);

// Token introspection (RFC 7662)
tokenRouter.post(
  '/xrpc/io.exprsn.token.introspect',
  async (c) => {
    const body = await c.req.json<IntrospectBody>();

    if (!body.token) {
      return c.json({ active: false });
    }

    const result = await TokenService.introspect(body.token);
    return c.json(result);
  }
);

// Get available scopes
tokenRouter.get(
  '/xrpc/io.exprsn.token.scopes',
  async (c) => {
    const scopes = await TokenService.getAvailableScopes();

    return c.json({
      scopes: scopes.map(s => ({
        scope: s.scope,
        displayName: s.displayName,
        description: s.description,
        category: s.category,
        requiresCertificate: s.requiresCertificate,
        requiresOrganization: s.requiresOrganization,
      })),
    });
  }
);

export { tokenRouter };
