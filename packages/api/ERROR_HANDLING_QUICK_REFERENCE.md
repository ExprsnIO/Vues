# Error Handling Quick Reference

## Quick Start

### Import Error Utilities

```typescript
import {
  badRequest,        // 400
  unauthorized,      // 401
  forbidden,         // 403
  notFound,          // 404
  conflict,          // 409
  validationError,   // 422
  rateLimited,       // 429
  internalError,     // 500
  // Specialized helpers
  videoNotFound,
  userNotFound,
  organizationNotFound,
  invalidToken,
  insufficientPermissions,
} from '../utils/api-errors.js';
```

## Common Patterns

### Validation Errors

```typescript
// Required field missing
if (!uri) {
  throw badRequest('URI is required');
}

// Invalid format
if (amount <= 0) {
  throw badRequest('Amount must be positive');
}

// Multiple validation errors
if (!name || name.length < 3) {
  throw validationError('Invalid name', {
    minLength: 3,
    provided: name?.length || 0
  });
}
```

### Resource Not Found

```typescript
// Generic not found
const user = await db.query.users.findFirst({ where: eq(users.did, did) });
if (!user) {
  throw notFound('User not found');
}

// With specialized helper
const video = await db.query.videos.findFirst({ where: eq(videos.uri, uri) });
if (!video) {
  throw videoNotFound(uri);  // Includes URI in details
}
```

### Permission Checks

```typescript
// Generic forbidden
if (video.authorDid !== userDid) {
  throw forbidden('Not authorized');
}

// With resource context
if (!hasPermission) {
  throw insufficientPermissions('payment configuration');
}
```

### Conflict/Duplicate Errors

```typescript
// Already exists
const existing = await db.query.follows.findFirst({ where: ... });
if (existing) {
  throw conflict('Already following');
}

// Or with helper
if (existing) {
  throw alreadyExists('bookmark');
}
```

### Authentication Errors

```typescript
// Not logged in
const userDid = c.get('did');
if (!userDid) {
  throw unauthorized();
}

// Invalid token
if (!isValidToken) {
  throw invalidToken();
}
```

### Business Logic Errors

```typescript
// Cannot perform action on self
if (targetDid === userDid) {
  throw badRequest('Cannot follow yourself');
}

// Feature requirements
if (!subscription && video.requiresSubscription) {
  throw subscriptionRequired();
}

// Insufficient funds
if (balance < amount) {
  throw insufficientBalance();
}
```

### With Additional Context

```typescript
// Include helpful details
throw badRequest('Unsupported payment provider', undefined, {
  provided: body.provider,
  supported: ['stripe', 'paypal', 'authorizenet']
});

// Rate limiting with headers
throw rateLimited('Too many requests', {
  limit: 100,
  remaining: 0,
  reset: resetTimestamp,
  retryAfter: 60  // seconds
});
```

## Migration Checklist

When updating a route file:

- [ ] Remove `import { HTTPException } from 'hono/http-exception';`
- [ ] Add error utility imports
- [ ] Replace `throw new HTTPException(400, ...)` → `throw badRequest(...)`
- [ ] Replace `throw new HTTPException(401, ...)` → `throw unauthorized(...)`
- [ ] Replace `throw new HTTPException(403, ...)` → `throw forbidden(...)`
- [ ] Replace `throw new HTTPException(404, ...)` → `throw notFound(...)` or specialized helpers
- [ ] Replace `throw new HTTPException(409, ...)` → `throw conflict(...)`
- [ ] Add context details where helpful
- [ ] Test error responses

## Error Code Reference

| Status | Function | Error Code | Use Case |
|--------|----------|------------|----------|
| 400 | `badRequest()` | `InvalidRequest` | Invalid input, missing required fields |
| 401 | `unauthorized()` | `AuthenticationRequired` | User not authenticated |
| 401 | `invalidToken()` | `InvalidToken` | Token invalid or expired |
| 402 | `paymentRequired()` | `PaymentRequired` | Payment needed |
| 402 | `subscriptionRequired()` | `SubscriptionRequired` | Subscription needed |
| 402 | `insufficientBalance()` | `InsufficientBalance` | Insufficient funds |
| 403 | `forbidden()` | `InsufficientPermissions` | No permission to access |
| 403 | `insufficientPermissions()` | `InsufficientPermissions` | Missing specific permission |
| 403 | `accountSuspended()` | `AccountSuspended` | Account suspended |
| 403 | `contentBlocked()` | `ContentBlocked` | Content blocked |
| 404 | `notFound()` | `ContentNotFound` | Generic resource not found |
| 404 | `videoNotFound()` | `VideoNotFound` | Video not found |
| 404 | `userNotFound()` | `AccountNotFound` | User not found |
| 404 | `organizationNotFound()` | `OrganizationNotFound` | Organization not found |
| 409 | `conflict()` | `AlreadyExists` | Resource already exists |
| 409 | `alreadyExists()` | `AlreadyExists` | Duplicate creation attempt |
| 422 | `validationError()` | `InvalidRequest` | Validation failed |
| 429 | `rateLimited()` | `RateLimitExceeded` | Too many requests |
| 500 | `internalError()` | `InternalServerError` | Server error |

## Examples from Updated Routes

### From video-extended.ts

```typescript
// Before
throw new HTTPException(400, { message: 'Video URI and original video URI are required' });

// After
throw badRequest('Video URI and original video URI are required');
```

```typescript
// Before
throw new HTTPException(404, { message: 'Video not found' });

// After
throw videoNotFound(videoUri);
```

```typescript
// Before
throw new HTTPException(403, { message: 'Original video does not allow stitching' });

// After
throw forbidden('Original video does not allow stitching');
```

### From social.ts

```typescript
// Before
throw new HTTPException(400, { message: 'Already reposted' });

// After
throw conflict('Already reposted');
```

```typescript
// Before
throw new HTTPException(400, { message: 'Invalid report reason' });

// After
throw validationError('Invalid report reason', {
  validReasons,
  provided: reason,
});
```

### From graph.ts

```typescript
// Before
throw new HTTPException(400, { message: 'Cannot follow yourself' });

// After
throw badRequest('Cannot follow yourself');
```

```typescript
// Before
throw new HTTPException(404, { message: 'User not found' });

// After
throw userNotFound(did);
```

## Testing Errors

```bash
# Test bad request
curl -X POST http://localhost:3000/xrpc/io.exprsn.video.stitch \
  -H "Content-Type: application/json" \
  -d '{}'

# Test not found
curl http://localhost:3000/xrpc/io.exprsn.video.getStitches?uri=invalid

# Test unauthorized
curl http://localhost:3000/xrpc/io.exprsn.graph.follow \
  -H "Content-Type: application/json" \
  -d '{"did":"did:plc:test"}'
```

## Tips

1. **Use specialized helpers** when available (videoNotFound, userNotFound, etc.)
2. **Include context** in details object for better debugging
3. **Keep messages user-friendly** - they'll be shown to end users
4. **Use appropriate codes** - helps clients handle errors programmatically
5. **Don't include sensitive info** in error messages or details

## Documentation

For more details see:
- `ERROR_HANDLING_MIGRATION.md` - Full migration guide
- `IMPLEMENTATION_SUMMARY.md` - Implementation status
- `src/utils/api-errors.ts` - Source code and all available functions
- `src/middleware/error-handler.ts` - Global error handler
