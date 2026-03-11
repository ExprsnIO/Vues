# Error Handling Migration Guide

This document describes the standardized error handling system implemented for the Exprsn API.

## Overview

The API now uses a centralized error handling system with:
- **Standard error response format** across all endpoints
- **Error factory functions** for common HTTP errors
- **XRPC-compatible error codes** for AT Protocol compliance
- **Global error handler middleware** that catches and formats all errors
- **Better logging** with structured error information

## File Structure

```
packages/api/src/
├── utils/
│   └── api-errors.ts          # Error utilities and factory functions
├── middleware/
│   └── error-handler.ts       # Global error handler middleware
├── index.ts                   # Updated to use global handlers
└── routes/                    # Routes updated to use new error utilities
    ├── video-extended.ts      ✓ Updated
    ├── social.ts              ✓ Updated
    ├── payments.ts            ⚠ Needs update
    ├── feed.ts                ⚠ Needs update
    ├── auth.ts                ⚠ Needs update
    └── ... (other routes)     ⚠ Needs update
```

## Standard Error Response Format

All API errors now return a consistent JSON structure:

```typescript
{
  "error": "Error message",
  "code": "ErrorCode",
  "message": "Detailed error description",
  "details": {
    // Optional additional context
  },
  "status": 400  // HTTP status code
}
```

### XRPC Endpoints

For endpoints starting with `/xrpc/`, the response follows AT Protocol format:

```typescript
{
  "error": "ErrorCode",
  "code": "ErrorCode",
  "message": "Error description",
  "status": 400
}
```

## Error Codes

### Common AT Protocol Codes
- `InvalidRequest` - Bad request parameters
- `AuthenticationRequired` - User must be authenticated
- `AuthorizationRequired` - User lacks permissions
- `ContentNotFound` - Resource not found
- `AlreadyExists` - Duplicate resource
- `RateLimitExceeded` - Too many requests

### Exprsn-Specific Codes
- `VideoNotFound` - Video resource not found
- `PaymentRequired` - Payment needed
- `PaymentFailed` - Payment processing failed
- `InsufficientBalance` - Insufficient funds
- `SubscriptionRequired` - Subscription needed
- `OrganizationNotFound` - Organization not found
- `InsufficientPermissions` - Missing required permissions

See `src/utils/api-errors.ts` for the complete list.

## Migration Guide

### Before (Old Pattern)

```typescript
import { HTTPException } from 'hono/http-exception';

router.post('/endpoint', authMiddleware, async (c) => {
  const { uri } = await c.req.json();

  if (!uri) {
    throw new HTTPException(400, { message: 'URI is required' });
  }

  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, uri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  if (!video.allowStitch) {
    throw new HTTPException(403, { message: 'Not allowed' });
  }

  // ... rest of logic
});
```

### After (New Pattern)

```typescript
import { badRequest, forbidden, videoNotFound } from '../utils/api-errors.js';

router.post('/endpoint', authMiddleware, async (c) => {
  const { uri } = await c.req.json();

  if (!uri) {
    throw badRequest('URI is required');
  }

  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, uri),
  });

  if (!video) {
    throw videoNotFound(uri);
  }

  if (!video.allowStitch) {
    throw forbidden('Not allowed');
  }

  // ... rest of logic
});
```

## Available Error Factory Functions

Import from `../utils/api-errors.js`:

```typescript
// Common HTTP errors
badRequest(message?, code?, details?)         // 400
unauthorized(message?, code?, details?)       // 401
forbidden(message?, code?, details?)          // 403
notFound(message?, code?, details?)           // 404
conflict(message?, code?, details?)           // 409
validationError(message?, details?)           // 422
rateLimited(message?, details?)               // 429
paymentRequired(message?, details?)           // 402
internalError(message?, details?)             // 500

// Specialized helpers
videoNotFound(uri?)
userNotFound(did?)
organizationNotFound(id?)
invalidToken()
insufficientPermissions(resource?)
accountSuspended()
contentBlocked()
alreadyExists(resource)
subscriptionRequired()
insufficientBalance()
```

## Examples

### Basic Validation

```typescript
// Before
if (!body.amount || body.amount <= 0) {
  throw new HTTPException(400, { message: 'Invalid amount' });
}

// After
if (!body.amount || body.amount <= 0) {
  throw badRequest('Invalid amount', undefined, {
    provided: body.amount
  });
}
```

### Resource Not Found

```typescript
// Before
const video = await db.query.videos.findFirst({ where: eq(videos.uri, uri) });
if (!video) {
  throw new HTTPException(404, { message: 'Video not found' });
}

// After
const video = await db.query.videos.findFirst({ where: eq(videos.uri, uri) });
if (!video) {
  throw videoNotFound(uri);
}
```

### Permission Check

```typescript
// Before
if (!hasPermission) {
  throw new HTTPException(403, { message: 'Permission denied' });
}

// After
if (!hasPermission) {
  throw insufficientPermissions('payment configuration');
}
```

### Conflict/Duplicate

```typescript
// Before
if (existing) {
  throw new HTTPException(400, { message: 'Already exists' });
}

// After
if (existing) {
  throw conflict('Resource already exists');
  // or
  throw alreadyExists('bookmark');
}
```

### With Context Details

```typescript
// Before
throw new HTTPException(400, { message: 'Invalid provider' });

// After
throw badRequest('Unsupported payment provider', undefined, {
  provided: body.provider,
  supported: ['stripe', 'paypal', 'authorizenet']
});
```

## Global Error Handler

The global error handler in `src/middleware/error-handler.ts`:
- Catches all unhandled errors
- Converts them to standard format
- Logs errors appropriately (error level for 5xx, warn for 4xx)
- Returns consistent JSON responses
- Adds rate limit headers when applicable

## Updated Routes

### Fully Updated ✓
1. **video-extended.ts** - All stitch, duet, loop, and share endpoints
2. **social.ts** - Repost, bookmark, block, mute, report endpoints

### Partially Updated ⚠
3. **payments.ts** - Most endpoints updated (needs webhook handlers)

### Needs Update ⚠
- feed.ts
- auth.ts
- actor.ts
- graph.ts
- live.ts
- admin routes (multiple files)
- xrpc.ts
- organization.ts
- settings.ts
- challenges.ts
- sounds.ts
- And 30+ other route files

## Testing

Error responses can be tested with:

```bash
# Example: Test bad request
curl -X POST http://localhost:3000/xrpc/io.exprsn.video.stitch \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected response:
{
  "error": "Video URI and original video URI are required",
  "code": "InvalidRequest",
  "message": "Video URI and original video URI are required",
  "status": 400
}

# Example: Test not found
curl http://localhost:3000/xrpc/io.exprsn.video.getStitches?uri=invalid

# Expected response:
{
  "error": "Video not found",
  "code": "VideoNotFound",
  "message": "Video not found",
  "details": { "uri": "invalid" },
  "status": 404
}
```

## Migration Checklist

To update a route file:

1. [ ] Remove `HTTPException` import
2. [ ] Add error utility imports: `import { badRequest, notFound, ... } from '../utils/api-errors.js'`
3. [ ] Replace all `throw new HTTPException(400, ...)` with `throw badRequest(...)`
4. [ ] Replace all `throw new HTTPException(401, ...)` with `throw unauthorized(...)`
5. [ ] Replace all `throw new HTTPException(403, ...)` with `throw forbidden(...)`
6. [ ] Replace all `throw new HTTPException(404, ...)` with `throw notFound(...)` or specialized helpers
7. [ ] Replace all `throw new HTTPException(409, ...)` with `throw conflict(...)`
8. [ ] Replace all `throw new HTTPException(429, ...)` with `throw rateLimited(...)`
9. [ ] Add context details where helpful
10. [ ] Test error responses

## Benefits

1. **Consistency** - All errors follow the same format
2. **AT Protocol Compliance** - XRPC endpoints return proper error codes
3. **Better Debugging** - Structured logging with context
4. **Type Safety** - Error codes are typed enums
5. **Maintainability** - Centralized error handling logic
6. **Client-Friendly** - Predictable error responses with details

## Next Steps

1. Complete migration of remaining route files
2. Add automated tests for error responses
3. Document error codes in API documentation
4. Add error monitoring/tracking (e.g., Sentry)
5. Consider rate limit middleware improvements
