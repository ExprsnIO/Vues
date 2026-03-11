# Zod Validation Quick Reference

## Quick Start

### 1. Import the tools
```typescript
import { zValidator, getValidatedData } from '../utils/zod-validator.js';
import { yourSchema } from '../utils/validation-schemas.js';
```

### 2. Add validation middleware to route
```typescript
router.post('/endpoint',
  authMiddleware,  // Your auth middleware first
  zValidator('json', yourSchema),  // Then validation
  async (c) => {
    // Handler code
  }
);
```

### 3. Extract validated data
```typescript
async (c) => {
  const data = getValidatedData<typeof yourSchema._output>(c);
  // data is now type-safe and validated!

  // Use the data
  console.log(data.field);
}
```

## Common Schemas

### Authentication
```typescript
import { createAccountSchema, createSessionSchema } from '../utils/validation-schemas.js';

// Signup
zValidator('json', createAccountSchema)

// Login
zValidator('json', createSessionSchema)
```

### Payments
```typescript
import {
  chargeSchema,
  refundSchema,
  tipSchema
} from '../utils/validation-schemas.js';

// Process payment
zValidator('json', chargeSchema)

// Tip a creator
zValidator('json', tipSchema)
```

### Organization
```typescript
import {
  createOrganizationSchema,
  inviteMemberSchema
} from '../utils/validation-schemas.js';

// Create org
zValidator('json', createOrganizationSchema)

// Invite member
zValidator('json', inviteMemberSchema)
```

### Settings
```typescript
import { updateSettingsSchema } from '../utils/validation-schemas.js';

// Update user settings
zValidator('json', updateSettingsSchema)
```

## Validation Targets

Validate different request parts:

```typescript
// JSON body (most common)
zValidator('json', schema)

// Query parameters
zValidator('query', schema)

// Path parameters
zValidator('param', schema)

// Headers
zValidator('header', schema)
```

## Creating New Schemas

### 1. Add to `validation-schemas.ts`
```typescript
export const myEndpointSchema = z.object({
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150),
  email: emailSchema,  // Reuse common schema
  tags: z.array(z.string()).max(10),
  metadata: z.record(z.unknown()).optional(),
});
```

### 2. Import and use in route
```typescript
import { myEndpointSchema } from '../utils/validation-schemas.js';

router.post('/my-endpoint',
  authMiddleware,
  zValidator('json', myEndpointSchema),
  async (c) => {
    const data = getValidatedData<typeof myEndpointSchema._output>(c);
    // ...
  }
);
```

## Common Validation Patterns

### Required fields
```typescript
z.string()  // Required string
z.string().optional()  // Optional string
z.string().nullable()  // Can be null
```

### String validation
```typescript
z.string().min(3)  // Minimum length
z.string().max(100)  // Maximum length
z.string().email()  // Email format
z.string().url()  // URL format
z.string().regex(/^[a-z]+$/)  // Custom regex
z.string().trim()  // Auto-trim whitespace
z.string().toLowerCase()  // Auto-lowercase
```

### Number validation
```typescript
z.number()  // Any number
z.number().int()  // Integers only
z.number().positive()  // > 0
z.number().min(1).max(100)  // Range
```

### Enums
```typescript
z.enum(['option1', 'option2', 'option3'])
```

### Arrays
```typescript
z.array(z.string())  // Array of strings
z.array(z.string()).min(1)  // Non-empty array
z.array(z.string()).max(10)  // Max length
```

### Objects
```typescript
z.object({
  field1: z.string(),
  field2: z.number(),
})
```

### Nested objects
```typescript
z.object({
  user: z.object({
    name: z.string(),
    email: emailSchema,
  }),
  settings: z.object({
    theme: z.enum(['light', 'dark']),
  }),
})
```

### Optional fields
```typescript
z.object({
  required: z.string(),
  optional: z.string().optional(),
  nullable: z.string().nullable(),
  withDefault: z.string().default('default value'),
})
```

### Complex validations
```typescript
z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})
```

## Reusable Base Schemas

Located in `validation-schemas.ts`:

```typescript
didSchema           // DID format validation
handleSchema        // Username validation
emailSchema         // Email validation
passwordSchema      // Strong password
displayNameSchema   // Display name
urlSchema           // URL validation
amountSchema        // Payment amounts (cents)
currencySchema      // Currency codes
paginationSchema    // Limit + cursor
```

Use them in your schemas:
```typescript
export const mySchema = z.object({
  handle: handleSchema,
  email: emailSchema,
  amount: amountSchema,
});
```

## Error Handling

Validation errors automatically return:
```json
{
  "message": "field: Validation error message",
  "status": 400
}
```

The error includes:
- Field path (for nested objects)
- Clear error message
- 400 Bad Request status

## Type Safety

Get TypeScript types from schemas:

```typescript
// Input type (before parsing)
type Input = z.infer<typeof schema>;

// Output type (after parsing and transforms)
type Output = z.output<typeof schema>;

// Usage in route handler
const data = getValidatedData<typeof schema._output>(c);
//    ^? TypeScript knows the exact type!
```

## Testing Validation

```typescript
import { describe, it, expect } from 'vitest';
import { mySchema } from '../validation-schemas.js';

describe('mySchema', () => {
  it('should accept valid data', () => {
    const result = mySchema.parse({
      field: 'valid',
    });
    expect(result.field).toBe('valid');
  });

  it('should reject invalid data', () => {
    expect(() => mySchema.parse({})).toThrow();
  });
});
```

## Migration Checklist

When adding validation to an existing route:

- [ ] Import `zValidator` and `getValidatedData`
- [ ] Import or create validation schema
- [ ] Add `zValidator('json', schema)` to middleware chain
- [ ] Replace `await c.req.json()` with `getValidatedData<typeof schema._output>(c)`
- [ ] Remove manual validation checks (`if (!field) throw...`)
- [ ] Update TypeScript types if needed
- [ ] Test with valid and invalid inputs
- [ ] Update API documentation

## Common Pitfalls

### ❌ Don't do this:
```typescript
const body = await c.req.json();  // Already parsed by validator!
```

### ✅ Do this:
```typescript
const body = getValidatedData<typeof schema._output>(c);
```

---

### ❌ Don't do this:
```typescript
zValidator('json', schema)
// ... some other middleware that reads body
```

### ✅ Do this:
```typescript
// Put zValidator AFTER auth, BEFORE body reading
authMiddleware,
zValidator('json', schema),
async (c) => { /* handler */ }
```

---

### ❌ Don't do this:
```typescript
const schema = z.object({
  amount: z.string(),  // Numbers as strings!
});
```

### ✅ Do this:
```typescript
const schema = z.object({
  amount: z.number(),  // Proper type, auto-converted from string
});
```

## Resources

- **Zod Documentation**: https://zod.dev
- **Validation Schemas**: `/packages/api/src/utils/validation-schemas.ts`
- **Validator Middleware**: `/packages/api/src/utils/zod-validator.ts`
- **Example Routes**: `/packages/api/src/routes/auth.ts`
- **Tests**: `/packages/api/src/utils/__tests__/validation-schemas.test.ts`

## Support

Questions? Check:
1. Existing schemas in `validation-schemas.ts`
2. Example usage in `auth.ts`, `payments.ts`, or `settings.ts`
3. Test file for validation examples
4. Zod documentation for advanced patterns
