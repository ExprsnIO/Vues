/**
 * Setup access control middleware
 *
 * Security model:
 * 1. Localhost-only by default
 * 2. Optional setup token for remote access
 * 3. Returns 404 once setup is complete
 */

import type { Context, Next } from 'hono';
import { getSetupState, validateSetupToken } from './state.js';

/**
 * Check if the request is from localhost
 */
function isLocalhost(c: Context): boolean {
  // Check X-Forwarded-For first (for proxied requests)
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const clientIp = forwarded.split(',')[0]?.trim() ?? '';
    return isLocalhostIp(clientIp);
  }

  // Check the host header
  const host = c.req.header('host');
  if (host) {
    const hostname = host.split(':')[0] ?? '';
    return isLocalhostIp(hostname);
  }

  // Fallback: assume not localhost
  return false;
}

function isLocalhostIp(ip: string): boolean {
  const localhostValues = ['127.0.0.1', '::1', 'localhost', '0.0.0.0'];
  return localhostValues.includes(ip);
}

/**
 * Setup access middleware
 *
 * Restricts access to the setup wizard to:
 * - Localhost requests (default)
 * - Requests with a valid setup token
 *
 * Returns 404 once setup is complete to hide the endpoint.
 */
export async function setupAccessMiddleware(c: Context, next: Next) {
  const state = await getSetupState();

  // If setup is completed, return 404 to hide the endpoint
  if (state?.status === 'completed') {
    return c.notFound();
  }

  // Check if request is from localhost
  const fromLocalhost = isLocalhost(c);

  // Check for setup token
  const token = c.req.query('token') || c.req.header('X-Setup-Token');
  const hasValidToken = await validateSetupToken(token);

  // Allow access if localhost OR valid token
  if (!fromLocalhost && !hasValidToken) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Setup wizard is only accessible from localhost or with a valid setup token',
        hint: 'Access this page from the server directly, or use a setup token',
      },
      403
    );
  }

  // Store access method in context for logging
  c.set('setupAccess', fromLocalhost ? 'localhost' : 'token');

  await next();
}

/**
 * Rate limiting for setup API endpoints
 * Basic in-memory rate limiting for security
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function setupRateLimitMiddleware(c: Context, next: Next) {
  const clientIp =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('host')?.split(':')[0] ??
    'unknown';

  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 30; // 30 requests per minute

  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + windowMs });
  } else if (entry.count >= maxRequests) {
    return c.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please wait before trying again.',
      },
      429
    );
  } else {
    entry.count++;
  }

  await next();
}
