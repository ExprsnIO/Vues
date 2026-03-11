/**
 * Global Error Handler Middleware for Exprsn API
 *
 * This middleware catches all unhandled errors, formats them consistently,
 * logs them appropriately, and returns proper HTTP responses.
 */

import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  ApiError,
  ApiErrorResponse,
  fromError,
  isApiError,
  XrpcErrorCode,
} from '../utils/api-errors.js';

/**
 * Error logging utility
 */
function logError(error: Error | ApiError, context: Context) {
  const { method, url } = context.req;
  const userDid = context.get('did') || 'anonymous';

  // Structured error log
  const logEntry = {
    timestamp: new Date().toISOString(),
    method,
    url,
    userDid,
    error: {
      name: error.name,
      message: error.message,
      status: isApiError(error) ? error.status : 500,
      code: isApiError(error) ? error.code : XrpcErrorCode.InternalServerError,
      stack:
        process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
  };

  // Log at appropriate level based on status code
  if (isApiError(error)) {
    if (error.status >= 500) {
      console.error('Server error:', logEntry);
    } else if (error.status >= 400) {
      console.warn('Client error:', logEntry);
    }
  } else {
    console.error('Unhandled error:', logEntry);
  }
}

/**
 * Format error response based on request type
 */
function formatErrorResponse(
  error: ApiError,
  context: Context
): ApiErrorResponse {
  const isXrpc = context.req.path.startsWith('/xrpc/');

  // XRPC endpoints expect AT Protocol format
  if (isXrpc) {
    return {
      error: error.code,
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  // Standard REST format
  return {
    error: error.message,
    code: error.code,
    message: error.message,
    status: error.status,
    details: error.details,
  };
}

/**
 * Global error handler middleware
 *
 * Usage in Hono app:
 * ```typescript
 * app.onError(globalErrorHandler);
 * ```
 */
export function globalErrorHandler(err: Error | HTTPException, c: Context) {
  // Convert to ApiError if needed
  const apiError = isApiError(err) ? err : fromError(err);

  // Log the error
  logError(apiError, c);

  // Format and return error response
  const response = formatErrorResponse(apiError, c);

  // Set appropriate headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add rate limit headers if applicable
  if (apiError.status === 429 && apiError.details) {
    if (apiError.details.retryAfter) {
      headers['Retry-After'] = String(apiError.details.retryAfter);
    }
    if (apiError.details.limit) {
      headers['X-RateLimit-Limit'] = String(apiError.details.limit);
    }
    if (apiError.details.remaining) {
      headers['X-RateLimit-Remaining'] = String(apiError.details.remaining);
    }
    if (apiError.details.reset) {
      headers['X-RateLimit-Reset'] = String(apiError.details.reset);
    }
  }

  return c.json(response, apiError.status, headers);
}

/**
 * Async error wrapper for route handlers
 *
 * Wraps async route handlers to catch and forward errors to global handler.
 * This is optional but provides better stack traces.
 *
 * Usage:
 * ```typescript
 * router.get('/endpoint', asyncHandler(async (c) => {
 *   // Your async code here
 *   return c.json({ data });
 * }));
 * ```
 */
export function asyncHandler<T extends Context>(
  handler: (c: T) => Promise<Response>
) {
  return async (c: T) => {
    try {
      return await handler(c);
    } catch (error) {
      // Convert to ApiError and rethrow to be caught by global handler
      throw isApiError(error) ? error : fromError(error);
    }
  };
}

/**
 * Error boundary for specific routes or routers
 *
 * This can be used to add custom error handling for specific routes
 * while still leveraging the global error format.
 *
 * Usage:
 * ```typescript
 * router.use('/admin/*', errorBoundary({
 *   onError: (error, c) => {
 *     // Custom logging or notifications
 *     notifyAdmins(error);
 *   }
 * }));
 * ```
 */
export function errorBoundary(options?: {
  onError?: (error: ApiError, context: Context) => void | Promise<void>;
}) {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      await next();
    } catch (error) {
      const apiError = isApiError(error) ? error : fromError(error);

      // Call custom error handler if provided
      if (options?.onError) {
        try {
          await options.onError(apiError, c);
        } catch (handlerError) {
          console.error('Error in custom error handler:', handlerError);
        }
      }

      // Rethrow to be caught by global handler
      throw apiError;
    }
  };
}

/**
 * Validation error handler for Zod validation failures
 *
 * Usage with @hono/zod-validator:
 * ```typescript
 * import { zValidator } from '@hono/zod-validator';
 *
 * router.post('/endpoint',
 *   zValidator('json', schema, validationErrorHandler),
 *   async (c) => { ... }
 * );
 * ```
 */
export function validationErrorHandler(result: { success: boolean; error?: { issues?: Array<{ path: Array<string | number>; message: string }> } }, c: Context) {
  if (!result.success && result.error) {
    const issues = result.error.issues || [];
    const details = issues.reduce((acc, issue) => {
      const field = issue.path.join('.');
      acc[field] = issue.message;
      return acc;
    }, {} as Record<string, string>);

    return c.json(
      {
        error: 'Validation failed',
        code: XrpcErrorCode.InvalidRequest,
        message: 'Request validation failed',
        details: { fields: details },
        status: 400,
      },
      400
    );
  }
}

/**
 * Not Found (404) handler
 *
 * Usage in Hono app:
 * ```typescript
 * app.notFound(notFoundHandler);
 * ```
 */
export function notFoundHandler(c: Context) {
  return c.json(
    {
      error: 'Route not found',
      code: XrpcErrorCode.ContentNotFound,
      message: `Route ${c.req.method} ${c.req.path} not found`,
      status: 404,
    },
    404
  );
}
