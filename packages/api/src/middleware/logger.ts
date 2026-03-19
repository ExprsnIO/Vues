/**
 * Request logging middleware for the Exprsn API.
 *
 * Responsibilities:
 * - Generates a unique request ID (nanoid, 12 chars) per request.
 * - Exposes it as `X-Request-ID` response header.
 * - Stores it in Hono context under the `requestId` key.
 * - Logs a single structured entry per request on completion, including:
 *   method, path, status, duration (ms), requestId, userDid, userAgent.
 *
 * Mount this AFTER cors but BEFORE route handlers so that every route
 * automatically benefits from the request ID.
 */

import type { Context, Next } from 'hono';
import { nanoid } from 'nanoid';
import { createLogger } from '../lib/logger.js';

const httpLogger = createLogger('http');

/**
 * Hono middleware that adds request ID tracking and structured HTTP logging.
 */
export async function requestLogger(c: Context, next: Next): Promise<void> {
  const requestId = nanoid(12);
  const startMs = Date.now();

  // Expose the request ID so downstream handlers can include it in their own
  // log lines and error responses.
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);

  await next();

  const duration = Date.now() - startMs;
  const status = c.res.status;
  const method = c.req.method;
  // c.req.path strips the query string; use routePath when available so log
  // lines for /xrpc/:method don't expand to the full resolved path.
  const path = c.req.path;
  const userAgent = c.req.header('user-agent') ?? '';
  // `did` is set by auth middleware; may be undefined for unauthenticated requests.
  const userDid = (c.get('did') as string | undefined) ?? undefined;

  // Log level: error for 5xx, warn for 4xx, info for everything else.
  const logCtx = {
    requestId,
    method,
    path,
    status,
    duration,
    userAgent,
    userDid,
  };

  if (status >= 500) {
    httpLogger.error(`${method} ${path} ${status} ${duration}ms`, logCtx);
  } else if (status >= 400) {
    httpLogger.warn(`${method} ${path} ${status} ${duration}ms`, logCtx);
  } else {
    httpLogger.info(`${method} ${path} ${status} ${duration}ms`, logCtx);
  }
}
