# Payment Credential Encryption

This document describes the payment credential encryption system implemented in the Exprsn API.

## Overview

Payment credentials (API keys, secrets, tokens) stored in the `paymentConfigs` table are encrypted using **AES-256-GCM** with authenticated encryption. This ensures that sensitive payment provider credentials are protected at rest in the database.

## Security Features

### Encryption Algorithm

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits
- **IV Size**: 128 bits (randomly generated per encryption)
- **Authentication Tag**: 128 bits (provides integrity verification)
- **Salt**: 256 bits (randomly generated per encryption)
- **Key Derivation**: PBKDF2 with 100,000 iterations using SHA-256

### Key Features

1. **Authenticated Encryption**: GCM mode provides both confidentiality and authenticity
2. **Unique Encryption**: Each encryption produces different ciphertext (random IV and salt)
3. **Key Versioning**: Supports key rotation with version prefixes
4. **Tamper Detection**: Authentication tag prevents unauthorized modifications
5. **Secure Key Derivation**: PBKDF2 derives encryption keys from master key

## Setup

### 1. Set Encryption Key

Generate a secure encryption key and add it to your environment:

```bash
# Generate a secure 32+ character key
openssl rand -base64 32

# Add to .env file
ENCRYPTION_KEY=your-generated-key-here
```

**IMPORTANT**:
- The key MUST be at least 32 characters long
- Use a cryptographically secure random key
- Never commit the encryption key to version control
- Keep backups of the key in secure storage (lost keys = lost credentials)

### 2. Encrypt Existing Credentials

If you have existing unencrypted credentials in the database:

```bash
# Dry run to see what would be encrypted
pnpm tsx scripts/encrypt-payment-credentials.ts --dry-run

# Actually encrypt the credentials
pnpm tsx scripts/encrypt-payment-credentials.ts
```

## Encrypted Data Format

Encrypted credentials are stored in the following format:

```
version:salt:iv:authTag:ciphertext
```

Each component is base64url encoded. Example:

```
v1:xY3k8mP2...salt:aB9f4k1L...iv:cD8h2nP5...tag:eF6j9oR3...ciphertext
```

### Components

- **version**: Key version for rotation support (e.g., `v1`)
- **salt**: Random salt for key derivation
- **iv**: Initialization vector for encryption
- **authTag**: Authentication tag for integrity verification
- **ciphertext**: Encrypted credential value

## API Usage

### In Routes

The encryption is handled automatically when creating or updating payment configurations:

```typescript
import { encryptCredentials, decryptCredentials } from '../utils/encryption.js';

// Encrypting credentials before storage
const encrypted = encryptCredentials({
  secretKey: 'sk_live_...',
  publishableKey: 'pk_live_...',
});

await db.insert(paymentConfigs).values({
  id: nanoid(),
  provider: 'stripe',
  credentials: encrypted, // Stored encrypted in database
  // ...
});

// Decrypting credentials for use
const config = await db
  .select()
  .from(paymentConfigs)
  .where(eq(paymentConfigs.id, configId))
  .limit(1);

const decrypted = decryptCredentials(config[0].credentials);
const gateway = PaymentGatewayFactory.create('stripe', decrypted);
```

### Safe Decryption (Backward Compatibility)

For backward compatibility with potentially unencrypted data:

```typescript
function safeDecryptCredentials(encrypted: unknown): Record<string, string> {
  if (!encrypted || typeof encrypted !== 'object') {
    return {};
  }

  const creds = encrypted as Record<string, string>;

  try {
    return decryptCredentials(creds);
  } catch (error) {
    console.warn('Failed to decrypt credentials, using as-is:', error);
    return creds; // Return unencrypted if decryption fails
  }
}
```

## Utility Functions

### Core Functions

```typescript
// Encrypt/decrypt single values
encrypt(plaintext: string): string
decrypt(ciphertext: string): string

// Encrypt/decrypt credential objects
encryptCredentials(credentials: Record<string, string>): Record<string, string>
decryptCredentials(encrypted: Record<string, string>): Record<string, string>

// Helper functions
isEncrypted(credentials: Record<string, string>): boolean
canDecrypt(credentials: Record<string, string>): boolean
```

### Examples

```typescript
import {
  encrypt,
  decrypt,
  encryptCredentials,
  isEncrypted
} from './utils/encryption';

// Single value encryption
const encrypted = encrypt('my-secret-key');
const decrypted = decrypt(encrypted);

// Credential object encryption
const creds = {
  apiKey: 'key_123',
  secret: 'secret_456',
};

const encryptedCreds = encryptCredentials(creds);
console.log(isEncrypted(encryptedCreds)); // true

const decryptedCreds = decryptCredentials(encryptedCreds);
console.log(decryptedCreds); // { apiKey: 'key_123', secret: 'secret_456' }
```

## Key Rotation

The encryption system supports key rotation through versioning:

### Current Implementation

Currently supports `v1` keys. To rotate keys:

1. Add new key to environment: `ENCRYPTION_KEY_V2`
2. Update `CURRENT_KEY_VERSION` to `v2` in `encryption.ts`
3. Add case for `v2` in `getEncryptionKeyForVersion()`
4. Run migration to re-encrypt with new key

### Rotation Process

```typescript
import { rotateCredentialKeys } from './utils/encryption';

// This will decrypt with old key and re-encrypt with new key
const rotated = rotateCredentialKeys(oldEncryptedCreds, 'v2');
```

### Migration Script

A migration script for key rotation will be needed:

```bash
# Future: Rotate all credentials to new key version
pnpm tsx scripts/rotate-encryption-keys.ts --from v1 --to v2
```

## Security Best Practices

### Key Management

1. **Never hardcode keys**: Always use environment variables
2. **Secure storage**: Store backup keys in secure vault (e.g., AWS Secrets Manager)
3. **Access control**: Limit who can access encryption keys
4. **Key rotation**: Rotate keys periodically (every 90-180 days)
5. **Audit logging**: Log key access and rotation events

### Deployment

#### Development
- Use a generated dev key
- Document that it's not for production

#### Staging
- Use a staging-specific key
- Keep separate from production

#### Production
- Use a strong, unique key
- Store in secrets management system
- Enable audit logging
- Set up key rotation schedule

### Environment Variables

```bash
# Development
ENCRYPTION_KEY=dev-key-at-least-32-chars-long

# Production (example from secrets manager)
ENCRYPTION_KEY=$(aws secretsmanager get-secret-value --secret-id prod/encryption-key --query SecretString --output text)
```

## Testing

Run the test suite to verify encryption:

```bash
# Run encryption tests
pnpm --filter @exprsn/api test src/utils/__tests__/encryption.test.ts

# Run all tests with coverage
pnpm --filter @exprsn/api test:coverage
```

### Test Coverage

The test suite covers:
- Basic encryption/decryption
- Credential object encryption
- Unicode and long text handling
- Invalid data handling
- Key version detection
- Real-world payment provider credentials
- Key requirements and validation

## Troubleshooting

### Issue: Decryption Fails

**Symptom**: Error "Decryption failed: Invalid key or corrupted data"

**Causes**:
1. Wrong encryption key
2. Corrupted database data
3. Key was rotated but data wasn't re-encrypted

**Solution**:
- Verify `ENCRYPTION_KEY` matches the key used for encryption
- Check database for data corruption
- Run migration script if key was rotated

### Issue: Key Too Short

**Symptom**: Error "ENCRYPTION_KEY must be at least 32 characters long"

**Solution**:
```bash
# Generate a proper key
openssl rand -base64 32
```

### Issue: Missing Key in Production

**Symptom**: Error "ENCRYPTION_KEY environment variable is required in production"

**Solution**:
- Set `ENCRYPTION_KEY` in production environment
- Never deploy without encryption key set

## Monitoring

### Metrics to Track

1. **Encryption failures**: Count of failed encryption attempts
2. **Decryption failures**: Count of failed decryption attempts
3. **Key rotation events**: When keys are rotated
4. **Credential access**: Audit log of credential access

### Logging

The encryption utility logs:
- Warnings when using dev key in non-production
- Errors when decryption fails
- Key rotation events (when implemented)

## References

- [NIST SP 800-38D: Galois/Counter Mode](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [PBKDF2 Specification](https://tools.ietf.org/html/rfc2898)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)

## Support

For questions or issues:
1. Check this documentation
2. Review the test suite for examples
3. Check logs for specific error messages
4. Contact the security team for key management issues
