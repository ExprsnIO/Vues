/**
 * Admin API Tokens Routes
 * Manage platform-wide API tokens
 */

import { Hono } from 'hono';
import { eq, desc, count, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  apiTokens,
  apiTokenScopes,
  users,
  adminAuditLog,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';

export const adminTokensRouter = new Hono();

// Apply admin auth to all routes
adminTokensRouter.use('*', adminAuthMiddleware);

// ============================================
// Helper Functions
// ============================================

async function logAudit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  c: { req: { header: (name: string) => string | undefined } }
) {
  await db.insert(adminAuditLog).values({
    id: nanoid(),
    adminId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    userAgent: c.req.header('user-agent'),
  });
}

// ============================================
// API TOKEN MANAGEMENT
// ============================================

/**
 * List all API tokens across the platform
 */
adminTokensRouter.get(
  '/xrpc/io.exprsn.admin.tokens.list',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    // Get all tokens with owner info
    const tokens = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        description: apiTokens.description,
        tokenType: apiTokens.tokenType,
        tokenPrefix: apiTokens.tokenPrefix,
        ownerDid: apiTokens.ownerDid,
        scopes: apiTokens.scopes,
        status: apiTokens.status,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
        usageCount: apiTokens.usageCount,
        revokedAt: apiTokens.revokedAt,
        revokedBy: apiTokens.revokedBy,
        revokedReason: apiTokens.revokedReason,
      })
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt));

    // Get owner handles
    const ownerDids = [...new Set(tokens.map((t) => t.ownerDid))];
    const ownerInfo = ownerDids.length > 0
      ? await db
          .select({
            did: users.did,
            handle: users.handle,
          })
          .from(users)
          .where(sql`${users.did} = ANY(${ownerDids})`)
      : [];

    const handleMap = new Map(ownerInfo.map((u) => [u.did, u.handle]));

    // Compute stats
    const stats = {
      total: tokens.length,
      active: tokens.filter((t) => t.status === 'active').length,
      personal: tokens.filter((t) => t.tokenType === 'personal').length,
      service: tokens.filter((t) => t.tokenType === 'service').length,
    };

    return c.json({
      tokens: tokens.map((t) => ({
        ...t,
        ownerHandle: handleMap.get(t.ownerDid),
        requestCount: t.usageCount,
      })),
      stats,
    });
  }
);

/**
 * Get token details
 */
adminTokensRouter.get(
  '/xrpc/io.exprsn.admin.tokens.get',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    const tokenId = c.req.query('tokenId');

    if (!tokenId) {
      return c.json({ error: 'Token ID required' }, 400);
    }

    const token = await db.query.apiTokens.findFirst({
      where: eq(apiTokens.id, tokenId),
    });

    if (!token) {
      return c.json({ error: 'Token not found' }, 404);
    }

    // Get owner info
    const owner = await db.query.users.findFirst({
      where: eq(users.did, token.ownerDid),
    });

    return c.json({
      token: {
        ...token,
        ownerHandle: owner?.handle,
        requestCount: token.usageCount,
      },
    });
  }
);

/**
 * Revoke an API token
 */
adminTokensRouter.post(
  '/xrpc/io.exprsn.admin.tokens.revoke',
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      tokenId: string;
      reason?: string;
    }>();

    if (!body.tokenId) {
      return c.json({ error: 'Token ID required' }, 400);
    }

    const token = await db.query.apiTokens.findFirst({
      where: eq(apiTokens.id, body.tokenId),
    });

    if (!token) {
      return c.json({ error: 'Token not found' }, 404);
    }

    if (token.status === 'revoked') {
      return c.json({ error: 'Token already revoked' }, 400);
    }

    // Revoke the token
    await db
      .update(apiTokens)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: adminUser.userDid,
        revokedReason: body.reason || 'Revoked by administrator',
      })
      .where(eq(apiTokens.id, body.tokenId));

    await logAudit(
      adminUser.id,
      'token.revoked',
      'api_token',
      body.tokenId,
      {
        tokenName: token.name,
        ownerDid: token.ownerDid,
        reason: body.reason,
      },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * Get available token scopes
 */
adminTokensRouter.get(
  '/xrpc/io.exprsn.admin.tokens.scopes.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const scopes = await db
      .select()
      .from(apiTokenScopes)
      .orderBy(apiTokenScopes.category, apiTokenScopes.scope);

    return c.json({ scopes });
  }
);

/**
 * Create a new token scope
 */
adminTokensRouter.post(
  '/xrpc/io.exprsn.admin.tokens.scopes.create',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      scope: string;
      displayName: string;
      description?: string;
      category: string;
      permissions: string[];
      requiresCertificate?: boolean;
      requiresOrganization?: boolean;
    }>();

    if (!body.scope || !body.displayName || !body.category || !body.permissions) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const id = nanoid();

    await db.insert(apiTokenScopes).values({
      id,
      scope: body.scope,
      displayName: body.displayName,
      description: body.description,
      category: body.category,
      permissions: body.permissions,
      requiresCertificate: body.requiresCertificate || false,
      requiresOrganization: body.requiresOrganization || false,
    });

    await logAudit(
      adminUser.id,
      'scope.created',
      'api_token_scope',
      id,
      { scope: body.scope },
      c
    );

    return c.json({ success: true, id });
  }
);

/**
 * Get token usage statistics
 */
adminTokensRouter.get(
  '/xrpc/io.exprsn.admin.tokens.stats',
  requirePermission(ADMIN_PERMISSIONS.USERS_VIEW),
  async (c) => {
    // Get aggregate stats
    const [totalTokens] = await db
      .select({ count: count() })
      .from(apiTokens);

    const [activeTokens] = await db
      .select({ count: count() })
      .from(apiTokens)
      .where(eq(apiTokens.status, 'active'));

    const [revokedTokens] = await db
      .select({ count: count() })
      .from(apiTokens)
      .where(eq(apiTokens.status, 'revoked'));

    // Get tokens by type
    const tokensByType = await db
      .select({
        tokenType: apiTokens.tokenType,
        count: count(),
      })
      .from(apiTokens)
      .groupBy(apiTokens.tokenType);

    // Get top tokens by usage
    const topTokens = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenType: apiTokens.tokenType,
        ownerDid: apiTokens.ownerDid,
        usageCount: apiTokens.usageCount,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.status, 'active'))
      .orderBy(desc(apiTokens.usageCount))
      .limit(10);

    return c.json({
      total: totalTokens?.count ?? 0,
      active: activeTokens?.count ?? 0,
      revoked: revokedTokens?.count ?? 0,
      byType: Object.fromEntries(tokensByType.map((t) => [t.tokenType, t.count])),
      topTokens,
    });
  }
);
