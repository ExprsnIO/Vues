# Zod Validation Implementation for Critical Routes

This document shows how Zod validation has been added to critical API endpoints.

## Files Added

1. `/packages/api/src/utils/validation-schemas.ts` - Comprehensive Zod schemas for all critical inputs
2. `/packages/api/src/utils/zod-validator.ts` - Custom validator middleware for Hono integration

## Pattern for Adding Validation

### Before (without validation):
```typescript
router.post('/endpoint', authMiddleware, async (c) => {
  const body = await c.req.json<{ field: string }>();

  if (!body.field) {
    throw new HTTPException(400, { message: 'field is required' });
  }

  // ... handler logic
});
```

### After (with Zod validation):
```typescript
import { zValidator, getValidatedData } from '../utils/zod-validator.js';
import { endpointSchema } from '../utils/validation-schemas.js';

router.post('/endpoint', authMiddleware, zValidator('json', endpointSchema), async (c) => {
  const body = getValidatedData<typeof endpointSchema._output>(c);

  // body is now type-safe and validated - no manual checks needed
  // ... handler logic
});
```

## Routes Updated with Validation

### Authentication Routes (`packages/api/src/routes/auth.ts`)
✅ Completed

- `/io.exprsn.auth.createAccount` - Uses `createAccountSchema`
  - Validates handle format (3-20 chars, alphanumeric + underscore)
  - Email validation with RFC-compliant regex
  - Password complexity rules (min 8 chars, upper+lower+number)
  - Account type and organization validation

- `/io.exprsn.auth.createSession` - Uses `createSessionSchema`
  - Identifier and password required
  - Sanitized input

- `/io.exprsn.auth.revokeSession` - Uses `revokeSessionSchema`
  - Session ID validation

### Payment Routes (`packages/api/src/routes/payments.ts`)
✅ Import statements added, routes should be updated with pattern below:

**Critical endpoints to validate:**

1. `/io.exprsn.payments.createConfig` - ✅ UPDATED
   - Schema: `createPaymentConfigSchema`
   - Validates provider enum, credentials object, organization ID

2. `/io.exprsn.payments.updateConfig`
   - Schema: `updatePaymentConfigSchema`
   - At least one update field required

3. `/io.exprsn.payments.charge`
   - Schema: `chargeSchema`
   - Amount validation (positive integer, max $10M)
   - Currency enum validation
   - Recipient DID format

4. `/io.exprsn.payments.tip`
   - Schema: `tipSchema`
   - Minimum tip validation ($1.00 / 100 cents)
   - Prevents self-tipping

5. `/io.exprsn.payments.refund`
   - Schema: `refundSchema`
   - Transaction ID and optional amount

6. `/io.exprsn.payments.attachPaymentMethod`
   - Schema: `attachPaymentMethodSchema`
   - Token validation

7. `/io.exprsn.payments.createSubscriptionTier`
   - Schema: `createSubscriptionTierSchema`
   - Price minimum $1/month
   - Benefits object validation

8. `/io.exprsn.payments.subscribe`
   - Schema: `subscribeSchema`
   - Tier ID required

### Organization Routes (`packages/api/src/routes/organization.ts`)
🔄 TODO - Add imports and validation

**Critical endpoints:**

1. `/io.exprsn.org.create`
   - Schema: `createOrganizationSchema`
   - Name length (2-100 chars)
   - Type enum validation
   - Website URL format

2. `/io.exprsn.org.inviteMember`
   - Schema: `inviteMemberSchema`
   - Email validation
   - Role enum
   - Permission array

3. `/io.exprsn.org.updateMemberRole`
   - Schema: `updateMemberRoleSchema`
   - Member DID format
   - Role validation

4. `/io.exprsn.org.removeMember`
   - Schema: `removeMemberSchema`
   - Prevents removing self/owner

5. `/io.exprsn.org.respondToInvite`
   - Schema: `respondToInviteSchema`
   - Accept boolean

### Settings Routes (`packages/api/src/routes/settings.ts`)
🔄 TODO - Add imports and validation

**Critical endpoints:**

1. `/io.exprsn.settings.updateSettings`
   - Schema: `updateSettingsSchema`
   - Theme ID enum validation
   - Color mode enum
   - Nested settings objects
   - At least one field required

### Moderation Routes (`packages/api/src/routes/user-moderation.ts`)
🔄 TODO - Add imports and validation

**Critical endpoints:**

1. `/io.exprsn.user.moderation.submitReport`
   - Schema: `submitReportSchema`
   - Content type enum
   - Reason enum (spam, harassment, etc.)
   - Description length (10-1000 chars)

2. `/io.exprsn.user.moderation.submitAppeal`
   - Schema: `submitAppealSchema`
   - Sanction ID
   - Reason minimum 50 chars

### Video Upload Routes
🔄 TODO - Create route file or update existing

1. Video metadata validation
   - Schema: `createVideoMetadataSchema`
   - Title (1-200 chars)
   - Description (max 5000 chars)
   - Tags (max 30, each max 50 chars)
   - Privacy enum
   - Content warning enum

## Schemas Available in `validation-schemas.ts`

### Authentication
- `createAccountSchema` - Signup validation
- `createSessionSchema` - Login validation
- `revokeSessionSchema` - Session management

### Payments
- `createPaymentConfigSchema` - Payment gateway setup
- `updatePaymentConfigSchema` - Gateway updates
- `chargeSchema` - Process payments
- `refundSchema` - Refund transactions
- `tipSchema` - Creator tips
- `capturePaymentSchema` - Capture authorized payments
- `voidPaymentSchema` - Void payments
- `attachPaymentMethodSchema` - Save payment methods
- `removePaymentMethodSchema` - Delete payment methods
- `createSubscriptionTierSchema` - Creator subscriptions
- `subscribeSchema` - Subscribe to creator
- `cancelSubscriptionSchema` - Cancel subscription

### Organizations
- `createOrganizationSchema` - Create org
- `updateOrganizationSchema` - Update org details
- `inviteMemberSchema` - Invite users
- `updateMemberRoleSchema` - Change roles
- `removeMemberSchema` - Remove members
- `respondToInviteSchema` - Accept/reject invites

### Settings
- `updateSettingsSchema` - User preferences

### Moderation
- `submitReportSchema` - Report content
- `submitAppealSchema` - Appeal sanctions
- `createSanctionSchema` - Admin sanctions (future)
- `reviewReportSchema` - Admin review (future)

### Common Patterns
- `didSchema` - DID format validation
- `handleSchema` - Handle validation with reserved words
- `emailSchema` - RFC-compliant email
- `passwordSchema` - Strong password rules
- `urlSchema` - URL format
- `amountSchema` - Payment amounts (cents, positive integer)
- `currencySchema` - Supported currencies
- `paginationSchema` - Limit + cursor

## Implementation Checklist

- [x] Create `validation-schemas.ts` with all critical schemas
- [x] Create `zod-validator.ts` middleware helper
- [x] Update authentication routes (3/3 critical endpoints)
- [x] Add imports to payment routes
- [x] Update payment config creation (1/8 endpoints)
- [ ] Update remaining payment routes (7 more endpoints)
- [ ] Update organization routes (5 critical endpoints)
- [ ] Update settings routes (1 endpoint)
- [ ] Update moderation routes (2 endpoints)
- [ ] Add video upload validation

## Testing Validation

### Test Invalid Inputs

```bash
# Invalid handle (too short)
curl -X POST http://localhost:3000/xrpc/io.exprsn.auth.createAccount \
  -H "Content-Type: application/json" \
  -d '{"handle":"ab","email":"test@example.com","password":"Test1234"}'
# Expected: 400 "Handle must be at least 3 characters"

# Invalid email format
curl -X POST http://localhost:3000/xrpc/io.exprsn.auth.createAccount \
  -H "Content-Type: application/json" \
  -d '{"handle":"testuser","email":"notanemail","password":"Test1234"}'
# Expected: 400 "Invalid email format"

# Weak password
curl -X POST http://localhost:3000/xrpc/io.exprsn.auth.createAccount \
  -H "Content-Type: application/json" \
  -d '{"handle":"testuser","email":"test@example.com","password":"weak"}'
# Expected: 400 "Password must be at least 8 characters"

# Invalid payment amount (negative)
curl -X POST http://localhost:3000/xrpc/io.exprsn.payments.charge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"configId":"123","amount":-100}'
# Expected: 400 "Amount must be positive"

# Invalid currency
curl -X POST http://localhost:3000/xrpc/io.exprsn.payments.charge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"configId":"123","amount":1000,"currency":"btc"}'
# Expected: 400 "Invalid currency"
```

### Test Valid Inputs

```bash
# Valid signup
curl -X POST http://localhost:3000/xrpc/io.exprsn.auth.createAccount \
  -H "Content-Type: application/json" \
  -d '{
    "handle":"testuser",
    "email":"test@example.com",
    "password":"SecurePass123",
    "displayName":"Test User",
    "accountType":"personal"
  }'
# Expected: 200 with user data and tokens

# Valid payment charge
curl -X POST http://localhost:3000/xrpc/io.exprsn.payments.charge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "configId":"valid-config-id",
    "amount":1000,
    "currency":"usd",
    "description":"Test payment"
  }'
# Expected: 200 with transaction details
```

## Benefits

1. **Type Safety**: TypeScript knows the exact shape of validated data
2. **Consistent Error Messages**: All validation errors follow same format
3. **Less Boilerplate**: No manual field checks needed
4. **Reusable Schemas**: Same schema can validate JSON body, query params, headers
5. **Security**: Prevents injection attacks via sanitized inputs
6. **Developer Experience**: Autocomplete and type checking for validated data

## Next Steps

1. Apply validation to remaining payment routes (7 endpoints)
2. Add validation to organization routes (5 endpoints)
3. Add validation to settings routes (1 endpoint)
4. Add validation to moderation routes (2 endpoints)
5. Create video upload validation
6. Add integration tests for all validated endpoints
7. Document API validation in OpenAPI/Swagger specs
