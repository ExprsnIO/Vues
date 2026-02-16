import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getOAuthClient, OAuthSession } from './oauth-client.js';

// Extend Hono context with our custom variables
declare module 'hono' {
  interface ContextVariableMap {
    session: OAuthSession;
    did: string;
  }
}

/**
 * Authentication middleware that requires a valid OAuth session
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
  }

  const sessionId = authHeader.replace('Bearer ', '');

  try {
    const oauthClient = getOAuthClient();
    const session = await oauthClient.restore(sessionId);

    if (!session) {
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
    throw new HTTPException(401, { message: 'Authentication failed' });
  }
}

/**
 * Optional authentication middleware - continues even without auth
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const sessionId = authHeader.replace('Bearer ', '');

    try {
      const oauthClient = getOAuthClient();
      const session = await oauthClient.restore(sessionId);

      if (session) {
        c.set('session', session);
        c.set('did', session.did);
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
