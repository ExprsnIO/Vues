/**
 * API Token Authentication Middleware
 * Authenticates requests using API tokens
 */

import { Context, Next } from 'hono';
import { TokenService, TokenContext } from '../services/tokens/TokenService.js';

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if an IP is allowed based on CIDR notation
 */
function isIpAllowed(clientIp: string | undefined, allowedIps: string[]): boolean {
  if (!clientIp) return false;

  for (const allowed of allowedIps) {
    if (allowed === clientIp) return true;

    // Simple CIDR check (IPv4 only for now)
    if (allowed.includes('/')) {
      const [network, bits] = allowed.split('/');
      if (!network || !bits) continue;
      const mask = ~((1 << (32 - parseInt(bits))) - 1);

      const ipNum = ipToNumber(clientIp);
      const networkNum = ipToNumber(network);

      if ((ipNum & mask) === (networkNum & mask)) {
        return true;
      }
    }
  }

  return false;
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0)) >>> 0;
}

/**
 * Check rate limit for a token
 */
function checkRateLimit(tokenId: string, limitPerMinute: number): boolean {
  const now = Date.now();
  const key = `token:${tokenId}`;

  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    // Reset counter
    rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= limitPerMinute) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);

/**
 * API Token Authentication Middleware
 *
 * Authenticates requests using Bearer tokens in the format:
 * Authorization: Bearer exp_[type][token]
 */
export const apiTokenAuthMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  // Skip if not an API token
  if (!authHeader?.startsWith('Bearer exp_')) {
    return next();
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  const tokenContext = await TokenService.validateToken(token);

  if (!tokenContext) {
    return c.json({ error: 'Invalid or expired API token' }, 401);
  }

  // Check IP allowlist
  if (tokenContext.allowedIps && tokenContext.allowedIps.length > 0) {
    const clientIp = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
                     c.req.header('X-Real-IP');

    if (!isIpAllowed(clientIp, tokenContext.allowedIps)) {
      return c.json({ error: 'IP address not allowed for this token' }, 403);
    }
  }

  // Check origin allowlist
  if (tokenContext.allowedOrigins && tokenContext.allowedOrigins.length > 0) {
    const origin = c.req.header('Origin');

    if (origin && !tokenContext.allowedOrigins.includes(origin)) {
      return c.json({ error: 'Origin not allowed for this token' }, 403);
    }
  }

  // Check rate limit
  if (tokenContext.rateLimit) {
    const allowed = checkRateLimit(tokenContext.tokenId, tokenContext.rateLimit);

    if (!allowed) {
      return c.json({
        error: 'Rate limit exceeded',
        retryAfter: 60,
      }, 429);
    }
  }

  // Update last used IP
  const clientIp = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
                   c.req.header('X-Real-IP');

  if (clientIp) {
    // Fire and forget
    import('../db/index.js').then(({ db }) => {
      import('../db/schema.js').then(({ apiTokens }) => {
        import('drizzle-orm').then(({ eq }) => {
          db.update(apiTokens)
            .set({ lastUsedIp: clientIp })
            .where(eq(apiTokens.id, tokenContext.tokenId))
            .catch(() => {});
        });
      });
    });
  }

  // Set auth context
  c.set('did', tokenContext.ownerDid);
  c.set('authMethod', 'api_token');
  c.set('tokenId', tokenContext.tokenId);
  c.set('tokenScopes', tokenContext.scopes);
  // Map token types - 'personal' maps to 'apiKey', others pass through
  const mappedTokenType = tokenContext.tokenType === 'personal' ? 'apiKey' : tokenContext.tokenType;
  c.set('tokenType', mappedTokenType as 'local' | 'oauth' | 'apiKey' | 'service');

  return next();
};

/**
 * Require specific scopes for an endpoint
 */
export const requireScopes = (...scopes: string[]) => {
  return async (c: Context, next: Next) => {
    const tokenScopes = c.get('tokenScopes') as string[] | undefined;

    // If no token scopes, check if we're using different auth
    if (!tokenScopes) {
      const authMethod = c.get('authMethod');
      if (authMethod && authMethod !== 'api_token') {
        // Using different auth method, allow through
        return next();
      }
      return c.json({ error: 'API token with required scopes needed' }, 401);
    }

    // Check if all required scopes are present
    const hasAllScopes = scopes.every(s => tokenScopes.includes(s));

    if (!hasAllScopes) {
      return c.json({
        error: 'Insufficient scopes',
        required: scopes,
        provided: tokenScopes,
      }, 403);
    }

    return next();
  };
};

/**
 * Require specific token type
 */
export const requireTokenType = (...types: string[]) => {
  return async (c: Context, next: Next) => {
    const tokenType = c.get('tokenType');

    if (!tokenType || !types.includes(tokenType)) {
      return c.json({
        error: 'Token type not allowed for this endpoint',
        required: types,
        provided: tokenType || 'none',
      }, 403);
    }

    return next();
  };
};

/**
 * Combined auth middleware that tries API token first, then falls through
 */
export const combinedAuthMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  // Try API token auth first
  if (authHeader?.startsWith('Bearer exp_')) {
    return apiTokenAuthMiddleware(c, next);
  }

  // Otherwise continue to other auth methods
  return next();
};
