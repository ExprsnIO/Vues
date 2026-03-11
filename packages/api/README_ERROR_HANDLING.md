# Standardized Error Handling System

## Overview

The Exprsn API now has a comprehensive, standardized error handling system that provides:

- **Consistent error responses** across all endpoints
- **AT Protocol (XRPC) compliance** for federated endpoints
- **Detailed error logging** with request context
- **Type-safe error codes** to prevent typos
- **Developer-friendly utilities** for common error scenarios

## Quick Start

```typescript
// Import error utilities
import {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  videoNotFound,
  userNotFound,
} from '../utils/api-errors.js';

// Use in route handlers
router.post('/endpoint', authMiddleware, async (c) => {
  const { uri } = await c.req.json();

  if (!uri) {
    throw badRequest('URI is required');
  }

  const video = await db.query.videos.findFirst({ where: eq(videos.uri, uri) });
  if (!video) {
    throw videoNotFound(uri);  // Includes URI in error details
  }

  // ... rest of logic
});
```

## Documentation

- **[Quick Reference](./ERROR_HANDLING_QUICK_REFERENCE.md)** - Common patterns and examples
- **[Migration Guide](./ERROR_HANDLING_MIGRATION.md)** - Full migration instructions
- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Current status and metrics

## Key Features

### Standard Error Response

All errors return a consistent JSON structure:

```json
{
  "error": "Human-readable message",
  "code": "MachineReadableErrorCode",
  "message": "Detailed description",
  "details": {
    "contextKey": "contextValue"
  },
  "status": 400
}
```

### Error Utilities

```typescript
badRequest(message?, code?, details?)         // 400
unauthorized(message?, code?, details?)       // 401
forbidden(message?, code?, details?)          // 403
notFound(message?, code?, details?)           // 404
conflict(message?, code?, details?)           // 409
validationError(message?, details?)           // 422
rateLimited(message?, details?)               // 429

// Specialized helpers
videoNotFound(uri?)
userNotFound(did?)
organizationNotFound(id?)
insufficientPermissions(resource?)
subscriptionRequired()
```

### Global Error Handler

Automatically catches and formats all errors:

- Structured logging with context
- Environment-aware (stack traces in dev only)
- Rate limit header injection
- XRPC/AT Protocol compliance

## Implementation Status

### ✓ Core Infrastructure (100%)
- Error utilities (`src/utils/api-errors.ts`)
- Global error handler (`src/middleware/error-handler.ts`)
- Main app integration (`src/index.ts`)

### ✓ Updated Routes (3 files, ~150 error sites)
- `video-extended.ts` - Stitch, duet, loop, share endpoints
- `social.ts` - Repost, bookmark, block, mute, report endpoints
- `graph.ts` - Follow, list management endpoints

### ⚠ Remaining Routes (~40 files)
See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for the complete list.

## Error Codes

### AT Protocol Standard
- `InvalidRequest` - Bad request
- `AuthenticationRequired` - Not authenticated
- `AuthorizationRequired` / `InsufficientPermissions` - No permission
- `ContentNotFound` - Resource not found
- `AlreadyExists` - Duplicate resource
- `RateLimitExceeded` - Too many requests

### Exprsn-Specific
- `VideoNotFound` - Video not found
- `PaymentRequired` / `PaymentFailed` - Payment errors
- `SubscriptionRequired` - Subscription needed
- `OrganizationNotFound` - Organization not found

See complete list in `src/utils/api-errors.ts`.

## Example Usage

### Before (Old Pattern)
```typescript
import { HTTPException } from 'hono/http-exception';

if (!video) {
  throw new HTTPException(404, { message: 'Video not found' });
}
```

### After (New Pattern)
```typescript
import { videoNotFound } from '../utils/api-errors.js';

if (!video) {
  throw videoNotFound(uri);  // Includes URI in details automatically
}
```

## Testing

```bash
# Start the API server
pnpm dev

# Test error responses
curl -X POST http://localhost:3000/xrpc/io.exprsn.video.stitch \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 400 with InvalidRequest code
```

## Benefits

1. **Consistency** - All errors follow the same structure
2. **AT Protocol Compliance** - XRPC endpoints return proper error codes
3. **Better Debugging** - Structured logging with context
4. **Type Safety** - Error codes are typed enums
5. **Maintainability** - Centralized error handling logic
6. **Client-Friendly** - Predictable responses with actionable details

## Contributing

When adding new routes or updating existing ones:

1. Import error utilities instead of HTTPException
2. Use appropriate error factory functions
3. Include helpful context in details object
4. Test error responses
5. Follow patterns in updated route files

See [ERROR_HANDLING_MIGRATION.md](./ERROR_HANDLING_MIGRATION.md) for detailed instructions.

## Files Created

- `src/utils/api-errors.ts` - Error utilities and factory functions (350 lines)
- `src/middleware/error-handler.ts` - Global error handler (210 lines)
- `ERROR_HANDLING_MIGRATION.md` - Full migration guide (400 lines)
- `ERROR_HANDLING_QUICK_REFERENCE.md` - Quick reference (200 lines)
- `IMPLEMENTATION_SUMMARY.md` - Implementation status (300 lines)
- `README_ERROR_HANDLING.md` - This file

## Support

For questions or issues with error handling:
1. Check the quick reference guide
2. Review updated route files for examples
3. Consult the migration guide
4. Check implementation summary for current status
