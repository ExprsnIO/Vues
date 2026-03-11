# Payment Credential Encryption Implementation

This document summarizes the payment credential encryption implementation for the @exprsn/api package.

## Summary

Payment credentials stored in the `paymentConfigs` table are now encrypted using AES-256-GCM encryption. This protects sensitive payment provider API keys, secrets, and tokens at rest in the database.

## Implementation Details

### Files Created

1. **`src/utils/encryption.ts`** - Core encryption utility
   - AES-256-GCM encryption with authenticated encryption
   - PBKDF2 key derivation (100,000 iterations)
   - Key versioning support for rotation
   - Encrypts each credential field separately

2. **`scripts/encrypt-payment-credentials.ts`** - Migration script
   - Encrypts existing unencrypted credentials
   - Supports dry-run mode
   - Provides detailed progress reporting

3. **`src/utils/__tests__/encryption.test.ts`** - Test suite
   - 27 passing tests covering all encryption scenarios
   - Tests real-world payment provider credentials
   - Validates error handling and edge cases

4. **`docs/PAYMENT_ENCRYPTION.md`** - Comprehensive documentation
   - Setup instructions
   - API usage examples
   - Security best practices
   - Troubleshooting guide

### Files Modified

1. **`src/routes/payments.ts`**
   - Updated to use `encryptCredentials()` when storing credentials
   - Updated to use `safeDecryptCredentials()` when reading credentials
   - Backward compatible with unencrypted data

2. **`src/routes/admin-payments.ts`**
   - Added encryption for admin payment config creation
   - Added decryption for payment gateway testing
   - Improved credential sanitization in audit logs

3. **`src/routes/payments-admin.ts`**
   - Added encryption for payment config updates
   - Added decryption for refund processing

4. **`.env`**
   - Added `ENCRYPTION_KEY` environment variable with default dev key
   - Added documentation about key generation

5. **`package.json`**
   - Added `encrypt:credentials` script
   - Added `encrypt:credentials:dry-run` script

## Security Features

### Encryption Specifications
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits
- **IV Size**: 128 bits (random per encryption)
- **Auth Tag**: 128 bits (tamper detection)
- **Salt**: 256 bits (random per encryption)
- **Key Derivation**: PBKDF2-SHA256 (100,000 iterations)

### Key Features
- ✅ Authenticated encryption (prevents tampering)
- ✅ Unique ciphertext per encryption (random IV/salt)
- ✅ Key versioning support (for rotation)
- ✅ Backward compatible (handles unencrypted data)
- ✅ Per-field encryption (allows partial updates)

## Setup Instructions

### 1. Generate Encryption Key

```bash
# Generate a secure 32+ character key
openssl rand -base64 32
```

### 2. Set Environment Variable

Add to your `.env` file:
```bash
ENCRYPTION_KEY=your-generated-key-here
```

**IMPORTANT**:
- Key must be at least 32 characters
- Never commit the key to version control
- Keep secure backups of the key

### 3. Encrypt Existing Credentials

```bash
# Test what would be encrypted (dry run)
pnpm encrypt:credentials:dry-run

# Actually encrypt the credentials
pnpm encrypt:credentials
```

## Usage Examples

### Encrypting Credentials

```typescript
import { encryptCredentials } from '../utils/encryption.js';

const encrypted = encryptCredentials({
  secretKey: 'sk_live_...',
  publishableKey: 'pk_live_...',
});

await db.insert(paymentConfigs).values({
  credentials: encrypted, // Stored encrypted
  // ...
});
```

### Decrypting Credentials

```typescript
import { decryptCredentials } from '../utils/encryption.js';

const config = await db.select()
  .from(paymentConfigs)
  .where(eq(paymentConfigs.id, id));

const credentials = decryptCredentials(config[0].credentials);
const gateway = PaymentGatewayFactory.create('stripe', credentials);
```

### Safe Decryption (Backward Compatible)

```typescript
function safeDecryptCredentials(encrypted: unknown): Record<string, string> {
  if (!encrypted || typeof encrypted !== 'object') {
    return {};
  }

  const creds = encrypted as Record<string, string>;

  try {
    return decryptCredentials(creds);
  } catch (error) {
    // Handle unencrypted or corrupted data gracefully
    console.warn('Failed to decrypt, using as-is:', error);
    return creds;
  }
}
```

## Testing

All tests pass successfully:

```bash
# Run encryption tests
pnpm test src/utils/__tests__/encryption.test.ts

# Output:
# ✓ src/utils/__tests__/encryption.test.ts (27 tests) 576ms
# Test Files  1 passed (1)
# Tests  27 passed (27)
```

Test coverage includes:
- Basic encryption/decryption
- Credential object encryption
- Unicode and long text handling
- Invalid data and error handling
- Key version detection
- Real-world payment provider scenarios
- Key requirements validation

## Encrypted Data Format

Credentials are stored in the format:
```
version:salt:iv:authTag:ciphertext
```

Example:
```
v1:xY3k8mP2Q1nL:aB9f4k1L7jR3:cD8h2nP5vF6m:eF6j9oR3qT8w...
```

Each component is base64url encoded for safe storage.

## Key Rotation (Future)

The system supports key rotation through versioning:

1. Add new key: `ENCRYPTION_KEY_V2`
2. Update `CURRENT_KEY_VERSION` to `v2`
3. Add case for `v2` in `getEncryptionKeyForVersion()`
4. Run migration to re-encrypt with new key

## Security Best Practices

### Key Management
- ✅ Never hardcode keys in source code
- ✅ Store keys in secure secrets management (AWS Secrets Manager, etc.)
- ✅ Rotate keys every 90-180 days
- ✅ Limit access to encryption keys
- ✅ Enable audit logging for key access

### Deployment
- **Development**: Use generated dev key (documented as not for production)
- **Staging**: Use staging-specific key (separate from production)
- **Production**: Use strong, unique key from secrets manager

## Monitoring

Track these metrics:
- Encryption failures
- Decryption failures
- Key rotation events
- Credential access patterns

## Troubleshooting

### Common Issues

**Error: "ENCRYPTION_KEY environment variable is required in production"**
- Solution: Set `ENCRYPTION_KEY` in your production environment

**Error: "ENCRYPTION_KEY must be at least 32 characters long"**
- Solution: Generate a proper key with `openssl rand -base64 32`

**Error: "Decryption failed: Invalid key or corrupted data"**
- Possible causes:
  - Wrong encryption key
  - Corrupted database data
  - Key was rotated but data wasn't re-encrypted
- Solution: Verify key matches, check database, run migration if needed

## References

- [Comprehensive Documentation](./docs/PAYMENT_ENCRYPTION.md)
- [NIST SP 800-38D: GCM Specification](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)

## Support

For questions or issues:
1. Check [PAYMENT_ENCRYPTION.md](./docs/PAYMENT_ENCRYPTION.md)
2. Review test suite for examples
3. Check logs for specific errors
4. Contact security team for key management

---

**Implementation Date**: 2026-03-11
**Implemented By**: Claude (AI Assistant)
**Status**: ✅ Complete and Tested
