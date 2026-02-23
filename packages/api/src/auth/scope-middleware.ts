/**
 * OAuth Scope Middleware
 * Provides scope-based access control for API endpoints
 */

import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { oauthAgent, OAUTH_SCOPES } from '../services/oauth/OAuthAgent.js';
import { db } from '../db/index.js';
import { sessions, authConfig } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Extend context to include scope information
declare module 'hono' {
  interface ContextVariableMap {
    tokenScopes: string[];
    tokenType: 'local' | 'oauth' | 'apiKey' | 'service';
  }
}

// Scope requirements for endpoint patterns
const ENDPOINT_SCOPE_MAP: Record<string, string[]> = {
  // Video endpoints
  'io.exprsn.video.upload': ['videos:write', 'write'],
  'io.exprsn.video.delete': ['videos:write', 'write'],
  'io.exprsn.video.update': ['videos:write', 'write'],
  'io.exprsn.video.get': ['videos:read', 'read'],
  'io.exprsn.video.list': ['videos:read', 'read'],

  // Comment endpoints
  'io.exprsn.comment.create': ['comments:write', 'write'],
  'io.exprsn.comment.delete': ['comments:write', 'write'],
  'io.exprsn.comment.list': ['comments:read', 'read'],

  // Message endpoints
  'io.exprsn.chat.sendMessage': ['messages:write', 'write'],
  'io.exprsn.chat.getConversations': ['messages:read', 'read'],
  'io.exprsn.chat.getMessages': ['messages:read', 'read'],

  // Profile endpoints
  'io.exprsn.actor.getProfile': ['profile:read', 'read'],
  'io.exprsn.actor.updateProfile': ['profile:write', 'write'],
  'io.exprsn.settings.update': ['profile:write', 'write'],

  // Follow endpoints
  'io.exprsn.graph.follow': ['follows:write', 'write'],
  'io.exprsn.graph.unfollow': ['follows:write', 'write'],
  'io.exprsn.graph.getFollowers': ['follows:read', 'read'],
  'io.exprsn.graph.getFollowing': ['follows:read', 'read'],

  // Notification endpoints
  'io.exprsn.notification.list': ['notifications:read', 'read'],
  'io.exprsn.notification.updateSeen': ['notifications:read', 'read'],

  // Live streaming
  'io.exprsn.live.startStream': ['live:stream', 'write'],
  'io.exprsn.live.endStream': ['live:stream', 'write'],
  'io.exprsn.live.updateStream': ['live:stream', 'write'],

  // Payment endpoints
  'io.exprsn.payments.charge': ['payments:write', 'write'],
  'io.exprsn.payments.tip': ['payments:write', 'write'],
  'io.exprsn.payments.listTransactions': ['payments:read', 'read'],
  'io.exprsn.payments.getEarnings': ['payments:read', 'read'],

  // Admin endpoints require admin scope
  'io.exprsn.admin.*': ['admin'],
};

/**
 * Extract scopes from a session token
 */
async function getTokenScopes(token: string): Promise<string[]> {
  // Local tokens (exp_) - check session metadata for scopes
  if (token.startsWith('exp_')) {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.accessJwt, token),
    });

    if (session) {
      // For now, local tokens get default scopes
      return await oauthAgent.getDefaultScopes();
    }
  }

  // OAuth tokens - scopes are embedded in the token
  // For AT Protocol OAuth, the scope is typically 'atproto'
  return ['atproto'];
}

/**
 * Determine token type from the token format
 */
function getTokenType(token: string): 'local' | 'oauth' | 'apiKey' | 'service' {
  if (token.startsWith('exp_')) return 'local';
  if (token.startsWith('svc_')) return 'service';
  if (token.startsWith('api_')) return 'apiKey';
  return 'oauth';
}

/**
 * Middleware to extract and validate token scopes
 */
export async function scopeExtractMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const tokenType = getTokenType(token);

    // Check if token type is enabled
    const isEnabled = await oauthAgent.isTokenTypeEnabled(tokenType);
    if (!isEnabled) {
      throw new HTTPException(403, {
        message: `Token type '${tokenType}' is disabled`,
      });
    }

    const scopes = await getTokenScopes(token);
    c.set('tokenScopes', scopes);
    c.set('tokenType', tokenType);
  } else {
    c.set('tokenScopes', []);
    c.set('tokenType', 'local');
  }

  await next();
}

/**
 * Factory function to create scope requirement middleware
 */
export function requireScope(...requiredScopes: string[]) {
  return async (c: Context, next: Next) => {
    const tokenScopes = c.get('tokenScopes') || [];

    if (!oauthAgent.hasAnyScope(tokenScopes, requiredScopes)) {
      throw new HTTPException(403, {
        message: `Insufficient scope. Required one of: ${requiredScopes.join(', ')}`,
      });
    }

    await next();
  };
}

/**
 * Factory function to require ALL specified scopes
 */
export function requireAllScopes(...requiredScopes: string[]) {
  return async (c: Context, next: Next) => {
    const tokenScopes = c.get('tokenScopes') || [];

    if (!oauthAgent.hasAllScopes(tokenScopes, requiredScopes)) {
      throw new HTTPException(403, {
        message: `Insufficient scopes. Required all of: ${requiredScopes.join(', ')}`,
      });
    }

    await next();
  };
}

/**
 * Dynamic scope middleware that checks endpoint-specific requirements
 */
export async function dynamicScopeMiddleware(c: Context, next: Next) {
  const path = c.req.path;
  const tokenScopes = c.get('tokenScopes') || [];

  // Extract endpoint name from path (e.g., /xrpc/io.exprsn.video.upload)
  const endpointMatch = path.match(/\/xrpc\/([a-zA-Z0-9._]+)/);
  const endpoint = endpointMatch?.[1];
  if (!endpoint) {
    await next();
    return;
  }

  // Check exact match first
  let requiredScopes = ENDPOINT_SCOPE_MAP[endpoint];

  // Check wildcard patterns if no exact match
  if (!requiredScopes) {
    for (const [pattern, scopes] of Object.entries(ENDPOINT_SCOPE_MAP)) {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (endpoint.startsWith(prefix)) {
          requiredScopes = scopes;
          break;
        }
      }
    }
  }

  // If no specific scope requirements, allow access
  if (!requiredScopes) {
    await next();
    return;
  }

  // Check if token has required scope
  if (!oauthAgent.hasAnyScope(tokenScopes, requiredScopes)) {
    throw new HTTPException(403, {
      message: `Endpoint ${endpoint} requires one of: ${requiredScopes.join(', ')}`,
    });
  }

  await next();
}

/**
 * Rate limit middleware that uses config-based limits
 */
export function configBasedRateLimit() {
  return async (c: Context, next: Next) => {
    const did = c.get('did');
    const adminUser = c.get('adminUser');
    const endpoint = c.req.path;

    // Get rate limit for this user
    const limits = await oauthAgent.getRateLimit({
      did,
      isAdmin: !!adminUser,
    });

    const { redis } = await import('../cache/redis.js');
    const key = did
      ? `ratelimit:${did}:${endpoint}`
      : `ratelimit:anon:${c.req.header('x-forwarded-for') || 'unknown'}:${endpoint}`;

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, 60); // 1 minute window
    }

    if (current > limits.requestsPerMinute) {
      throw new HTTPException(429, {
        message: `Rate limit exceeded. Limit: ${limits.requestsPerMinute}/min`,
      });
    }

    // Add rate limit headers
    c.header('X-RateLimit-Limit', limits.requestsPerMinute.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, limits.requestsPerMinute - current).toString());
    c.header('X-RateLimit-Burst', limits.burstLimit.toString());

    await next();
  };
}

// Re-export scopes for convenience
export { OAUTH_SCOPES };
