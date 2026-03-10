import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { getOAuthClient, OAuthSession } from './oauth-client.js';
import { db, sessions } from '../db/index.js';
import { adminUsers, type AdminUser } from '../db/schema.js';
import { getEffectiveDomainAccess } from '../services/domain-access.js';
import type { DomainPermission, EffectiveDomainAccess } from '@exprsn/shared';

// Admin role types
export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'support';

// Permission keys
export const ADMIN_PERMISSIONS = {
  USERS_VIEW: 'admin.users.view',
  USERS_EDIT: 'admin.users.edit',
  USERS_SANCTION: 'admin.users.sanction',
  USERS_BAN: 'admin.users.ban',
  CONTENT_VIEW: 'admin.content.view',
  CONTENT_MODERATE: 'admin.content.moderate',
  REPORTS_VIEW: 'admin.reports.view',
  REPORTS_ACTION: 'admin.reports.action',
  FEATURED_MANAGE: 'admin.featured.manage',
  ANALYTICS_VIEW: 'admin.analytics.view',
  CONFIG_VIEW: 'admin.config.view',
  CONFIG_EDIT: 'admin.config.edit',
  ADMINS_MANAGE: 'admin.admins.manage',
  // Domain management permissions
  DOMAINS_VIEW: 'admin.domains.view',
  DOMAINS_MANAGE: 'admin.domains.manage',
  DOMAINS_DELETE: 'admin.domains.delete',
  // Organization management permissions
  ORGS_VIEW: 'admin.orgs.view',
  ORGS_CREATE: 'admin.orgs.create',
  ORGS_DELETE: 'admin.orgs.delete',
  ORGS_MANAGE_HIERARCHY: 'admin.orgs.hierarchy',
  // Security permissions
  SECURITY_VIEW: 'admin.security.view',
  SECURITY_MANAGE: 'admin.security.manage',
  // Platform settings permissions
  SETTINGS_VIEW: 'admin.settings.view',
  SETTINGS_MANAGE: 'admin.settings.manage',
} as const;

// Role-based default permissions
export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: Object.values(ADMIN_PERMISSIONS),
  admin: [
    ADMIN_PERMISSIONS.USERS_VIEW,
    ADMIN_PERMISSIONS.USERS_EDIT,
    ADMIN_PERMISSIONS.USERS_SANCTION,
    ADMIN_PERMISSIONS.CONTENT_VIEW,
    ADMIN_PERMISSIONS.CONTENT_MODERATE,
    ADMIN_PERMISSIONS.REPORTS_VIEW,
    ADMIN_PERMISSIONS.REPORTS_ACTION,
    ADMIN_PERMISSIONS.FEATURED_MANAGE,
    ADMIN_PERMISSIONS.ANALYTICS_VIEW,
    ADMIN_PERMISSIONS.CONFIG_VIEW,
    ADMIN_PERMISSIONS.DOMAINS_VIEW,
    ADMIN_PERMISSIONS.DOMAINS_MANAGE,
    ADMIN_PERMISSIONS.ORGS_VIEW,
    ADMIN_PERMISSIONS.ORGS_CREATE,
    ADMIN_PERMISSIONS.SECURITY_VIEW,
    ADMIN_PERMISSIONS.SETTINGS_VIEW,
  ],
  moderator: [
    ADMIN_PERMISSIONS.USERS_VIEW,
    ADMIN_PERMISSIONS.USERS_SANCTION,
    ADMIN_PERMISSIONS.CONTENT_VIEW,
    ADMIN_PERMISSIONS.CONTENT_MODERATE,
    ADMIN_PERMISSIONS.REPORTS_VIEW,
    ADMIN_PERMISSIONS.REPORTS_ACTION,
    ADMIN_PERMISSIONS.DOMAINS_VIEW,
    ADMIN_PERMISSIONS.ORGS_VIEW,
  ],
  support: [
    ADMIN_PERMISSIONS.USERS_VIEW,
    ADMIN_PERMISSIONS.CONTENT_VIEW,
    ADMIN_PERMISSIONS.REPORTS_VIEW,
    ADMIN_PERMISSIONS.DOMAINS_VIEW,
    ADMIN_PERMISSIONS.ORGS_VIEW,
  ],
};

// Extend Hono context with our custom variables
declare module 'hono' {
  interface ContextVariableMap {
    session: OAuthSession;
    did: string;
    userDid: string;
    adminUser: AdminUser;
    adminPermissions: string[];
    domainAccess: EffectiveDomainAccess;
  }
}

/**
 * Authentication middleware that requires a valid session (local or OAuth)
 * In development mode, bypasses authentication and uses a default user
 */
export async function authMiddleware(c: Context, next: Next) {
  const isDev = process.env.NODE_ENV !== 'production';
  const authHeader = c.req.header('Authorization');

  // Development bypass - use default user when no auth provided
  if (isDev && (!authHeader || !authHeader.startsWith('Bearer '))) {
    // Use rickholland as the default dev user
    c.set('did', 'did:web:exprsn.local:user:rickholland');
    await next();
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Check for local session token (prefixed with exp_)
    if (token.startsWith('exp_')) {
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.accessJwt, token),
      });

      if (!session || session.expiresAt < new Date()) {
        // In dev mode, fall back to default user for expired sessions
        if (isDev) {
          console.warn('Dev mode: using default user for expired session');
          c.set('did', 'did:web:exprsn.local:user:rickholland');
          await next();
          return;
        }
        throw new HTTPException(401, { message: 'Invalid or expired session' });
      }

      c.set('did', session.did);
      await next();
      return;
    }

    // Fall back to OAuth
    const oauthClient = getOAuthClient();
    const session = await oauthClient.restore(token);

    if (!session) {
      // In dev mode, fall back to default user for invalid OAuth
      if (isDev) {
        console.warn('Dev mode: using default user for invalid OAuth session');
        c.set('did', 'did:web:exprsn.local:user:rickholland');
        await next();
        return;
      }
      throw new HTTPException(401, { message: 'Invalid or expired session' });
    }

    c.set('session', session);
    c.set('did', session.did);

    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Auth middleware error:', error);
    // In dev mode, fall back to default user on auth errors
    if (isDev) {
      console.warn('Dev mode: using default user after auth error');
      c.set('did', 'did:web:exprsn.local:user:rickholland');
      await next();
      return;
    }
    throw new HTTPException(401, { message: 'Authentication failed' });
  }
}

/**
 * Alias for authMiddleware - requires authentication
 * Also sets userDid for compatibility
 */
export async function requireAuth(c: Context, next: Next) {
  await authMiddleware(c, async () => {
    // Set userDid from did for compatibility
    const did = c.get('did');
    if (did) {
      c.set('userDid', did);
    }
    await next();
  });
}

/**
 * Optional authentication middleware - continues even without auth
 * In development mode, uses a default user when no auth provided
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const isDev = process.env.NODE_ENV !== 'production';
  const authHeader = c.req.header('Authorization');

  // Development bypass - use default user when no auth provided
  if (isDev && (!authHeader || !authHeader.startsWith('Bearer '))) {
    c.set('did', 'did:web:exprsn.local:user:rickholland');
    await next();
    return;
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');

    try {
      // Check for local session token (prefixed with exp_)
      if (token.startsWith('exp_')) {
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.accessJwt, token),
        });

        if (session && session.expiresAt >= new Date()) {
          c.set('did', session.did);
        }
      } else {
        // Fall back to OAuth
        const oauthClient = getOAuthClient();
        const session = await oauthClient.restore(token);

        if (session) {
          c.set('session', session);
          c.set('did', session.did);
        }
      }
    } catch (error) {
      // Continue without authentication
      console.warn('Optional auth failed:', error);
    }
  }

  await next();
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(options: { maxRequests: number; windowSeconds: number }) {
  return async (c: Context, next: Next) => {
    const did = c.get('did');
    const endpoint = c.req.path;

    if (!did) {
      // No rate limiting for unauthenticated requests (they have other limits)
      return next();
    }

    const { redis } = await import('../cache/redis.js');
    const key = `ratelimit:${did}:${endpoint}`;

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    if (current > options.maxRequests) {
      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${options.windowSeconds} seconds.`,
      });
    }

    // Add rate limit headers
    c.header('X-RateLimit-Limit', options.maxRequests.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, options.maxRequests - current).toString());

    await next();
  };
}

/**
 * Get effective permissions for an admin user (role defaults + custom permissions)
 */
export function getAdminPermissions(adminUser: AdminUser): string[] {
  const rolePerms = ROLE_PERMISSIONS[adminUser.role as AdminRole] || [];
  const customPerms = adminUser.permissions || [];
  return [...new Set([...rolePerms, ...customPerms])];
}

/**
 * Check if admin has a specific permission
 */
export function hasPermission(permissions: string[], permission: string): boolean {
  return permissions.includes(permission);
}

/**
 * Admin authentication middleware - requires valid session AND admin role
 * In development mode, automatically falls back to first admin user if no valid auth
 */
export async function adminAuthMiddleware(c: Context, next: Next) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Helper to use dev admin fallback
  const useDevAdminFallback = async (): Promise<boolean> => {
    if (!isDev) return false;

    const [adminUser] = await db
      .select()
      .from(adminUsers)
      .limit(1);

    if (adminUser) {
      console.warn('Dev mode: using default admin user');
      const permissions = getAdminPermissions(adminUser);
      c.set('did', adminUser.userDid);
      c.set('adminUser', adminUser);
      c.set('adminPermissions', permissions);
      return true;
    }
    return false;
  };

  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // In dev mode, fall back to first admin user
    if (await useDevAdminFallback()) {
      await next();
      return;
    }
    throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    let userDid: string | null = null;

    // Check for local session token (prefixed with exp_)
    if (token.startsWith('exp_')) {
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.accessJwt, token),
      });

      if (!session || session.expiresAt < new Date()) {
        throw new HTTPException(401, { message: 'Invalid or expired session' });
      }

      userDid = session.did;
      c.set('did', session.did);
    } else {
      // Fall back to OAuth
      const oauthClient = getOAuthClient();
      const session = await oauthClient.restore(token);

      if (!session) {
        throw new HTTPException(401, { message: 'Invalid or expired session' });
      }

      userDid = session.did;
      c.set('session', session);
      c.set('did', session.did);
    }

    // Check if user has admin access
    const [adminUser] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.userDid, userDid))
      .limit(1);

    if (!adminUser) {
      throw new HTTPException(403, { message: 'Admin access required' });
    }

    // Get effective permissions
    const permissions = getAdminPermissions(adminUser);

    c.set('adminUser', adminUser);
    c.set('adminPermissions', permissions);

    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      // In dev mode, fall back to first admin user on auth errors
      if (isDev) {
        if (await useDevAdminFallback()) {
          await next();
          return;
        }
      }
      throw error;
    }
    console.error('Admin auth middleware error:', error);
    // In dev mode, fall back to first admin user on auth errors
    if (isDev) {
      if (await useDevAdminFallback()) {
        await next();
        return;
      }
    }
    throw new HTTPException(401, { message: 'Authentication failed' });
  }
}

/**
 * Permission check middleware factory - requires specific permission(s)
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (c: Context, next: Next) => {
    const permissions = c.get('adminPermissions');

    if (!permissions) {
      throw new HTTPException(403, { message: 'Admin access required' });
    }

    const hasAll = requiredPermissions.every((perm) => permissions.includes(perm));

    if (!hasAll) {
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      });
    }

    await next();
  };
}

/**
 * Super admin only middleware
 */
export async function superAdminMiddleware(c: Context, next: Next) {
  const adminUser = c.get('adminUser');

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new HTTPException(403, { message: 'Super admin access required' });
  }

  await next();
}

// ==================== DOMAIN PERMISSION MIDDLEWARE ====================

/**
 * Domain permission middleware factory
 * Checks if the authenticated user has the required permission(s) for a specific domain.
 *
 * The domainId is extracted from the route parameter (default: 'domainId').
 * Global admins (super_admin, admin) automatically have all domain permissions.
 *
 * @param requiredPermissions - One or more domain permissions required
 * @param options - Configuration options
 * @returns Middleware function
 *
 * @example
 * // Single permission
 * router.put('/domains/:domainId/sso/config', authMiddleware, requireDomainPermission('domain.sso.manage'), handler);
 *
 * // Multiple permissions (all required)
 * router.delete('/domains/:domainId', authMiddleware, requireDomainPermission('domain.sso.manage', 'domain.users.manage'), handler);
 */
export function requireDomainPermission(
  ...requiredPermissions: DomainPermission[]
) {
  return async (c: Context, next: Next) => {
    const userDid = c.get('did');

    if (!userDid) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }

    // Extract domainId from route params
    const domainId = c.req.param('domainId');

    if (!domainId) {
      throw new HTTPException(400, { message: 'Domain ID is required' });
    }

    // Get effective access for this user on this domain
    const access = await getEffectiveDomainAccess(domainId, userDid);

    if (!access) {
      throw new HTTPException(403, {
        message: 'You do not have access to this domain'
      });
    }

    // Check all required permissions
    const hasAllPermissions = requiredPermissions.every(
      (perm) => access.effectivePermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      const missing = requiredPermissions.filter(
        (perm) => !access.effectivePermissions.includes(perm)
      );
      throw new HTTPException(403, {
        message: `Insufficient domain permissions. Missing: ${missing.join(', ')}`,
      });
    }

    // Store domain access on context for route handlers
    c.set('domainAccess', access);

    await next();
  };
}

/**
 * Require any one of the specified domain permissions (OR logic)
 */
export function requireAnyDomainPermission(
  ...anyOfPermissions: DomainPermission[]
) {
  return async (c: Context, next: Next) => {
    const userDid = c.get('did');

    if (!userDid) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }

    const domainId = c.req.param('domainId');

    if (!domainId) {
      throw new HTTPException(400, { message: 'Domain ID is required' });
    }

    const access = await getEffectiveDomainAccess(domainId, userDid);

    if (!access) {
      throw new HTTPException(403, {
        message: 'You do not have access to this domain'
      });
    }

    const hasAnyPermission = anyOfPermissions.some(
      (perm) => access.effectivePermissions.includes(perm)
    );

    if (!hasAnyPermission) {
      throw new HTTPException(403, {
        message: `Requires one of: ${anyOfPermissions.join(', ')}`,
      });
    }

    c.set('domainAccess', access);

    await next();
  };
}

/**
 * Check if user has any access to the domain (no specific permission required)
 * Useful for read-only endpoints where any domain member should have access
 */
export function requireDomainAccess() {
  return async (c: Context, next: Next) => {
    const userDid = c.get('did');

    if (!userDid) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }

    const domainId = c.req.param('domainId');

    if (!domainId) {
      throw new HTTPException(400, { message: 'Domain ID is required' });
    }

    const access = await getEffectiveDomainAccess(domainId, userDid);

    if (!access) {
      throw new HTTPException(403, {
        message: 'You do not have access to this domain'
      });
    }

    c.set('domainAccess', access);

    await next();
  };
}
