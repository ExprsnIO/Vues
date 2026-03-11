/**
 * Custom Zod validator middleware for Hono with better error handling
 * This wraps Hono's built-in validator with our error format
 */

import { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

type ValidationTarget = 'json' | 'query' | 'param' | 'header';

/**
 * Validate request input with Zod schema
 * Returns middleware that validates the specified target and attaches validated data to context
 */
export function zValidator<T extends z.ZodTypeAny>(
  target: ValidationTarget,
  schema: T
): MiddlewareHandler {
  return async (c: Context, next) => {
    let data: unknown;

    try {
      switch (target) {
        case 'json':
          data = await c.req.json().catch(() => ({}));
          break;
        case 'query':
          data = Object.fromEntries(
            Object.entries(c.req.query()).map(([key, value]) => {
              // Convert string numbers to actual numbers for validation
              if (value && /^\d+$/.test(value)) {
                return [key, parseInt(value, 10)];
              }
              return [key, value];
            })
          );
          break;
        case 'param':
          data = c.req.param();
          break;
        case 'header':
          data = Object.fromEntries(
            Array.from(c.req.raw.headers.entries())
          );
          break;
        default:
          throw new Error(`Invalid validation target: ${target}`);
      }

      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          path: issue.path.join('.') || 'root',
          message: issue.message,
          code: issue.code,
        }));

        // Format error message for user
        const firstError = errors[0];
        const message = firstError
          ? `${firstError.path !== 'root' ? `${firstError.path}: ` : ''}${firstError.message}`
          : 'Validation failed';

        throw new HTTPException(400, {
          message,
          cause: { errors }, // Include all errors in cause for debugging
        });
      }

      // Store validated data in context with type safety
      c.set('validatedData', result.data);

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      // Handle other errors (e.g., JSON parse errors)
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : 'Invalid request data',
      });
    }
  };
}

/**
 * Helper to get validated data from context with type safety
 */
export function getValidatedData<T>(c: Context): T {
  return c.get('validatedData') as T;
}
