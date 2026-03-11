# Quick Start: Payment Credential Encryption

Get up and running with encrypted payment credentials in 5 minutes.

## TL;DR

```bash
# 1. Generate and set encryption key
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env

# 2. Encrypt existing credentials
pnpm encrypt:credentials

# 3. Done! All new credentials are automatically encrypted
```

## Step-by-Step Setup

### 1. Generate Encryption Key (30 seconds)

```bash
# Generate a secure key
openssl rand -base64 32
```

Copy the output and add it to your `.env` file:

```bash
ENCRYPTION_KEY=paste-your-generated-key-here
```

### 2. Encrypt Existing Credentials (if any)

```bash
# Check what will be encrypted (optional)
pnpm encrypt:credentials:dry-run

# Encrypt existing credentials
pnpm encrypt:credentials
```

**Output example:**
```
🔒 Payment Credentials Encryption Script
=========================================

📋 Fetching payment configurations...
Found 3 payment configuration(s)

📦 Config ID: stripe_prod_123
   Provider: stripe
   Scope: platform
   🔒 Encrypting credentials...
   ✅ Successfully encrypted

📊 Summary
==========
Total configurations: 3
Encrypted: 2
Already encrypted: 1
Skipped (no credentials): 0
Errors: 0

✅ Encryption complete!
```

### 3. Verify Setup

All new payment credentials are now automatically encrypted when created or updated through the API.

## Testing

Verify encryption is working:

```bash
# Run encryption tests
pnpm test src/utils/__tests__/encryption.test.ts

# Should see: ✓ 27 tests passing
```

## Development vs Production

### Development
```bash
# .env
ENCRYPTION_KEY=dev-key-at-least-32-chars-long
```

### Production
```bash
# Use secrets manager (AWS, Azure, etc.)
ENCRYPTION_KEY=$(aws secretsmanager get-secret-value \
  --secret-id prod/encryption-key \
  --query SecretString \
  --output text)
```

## Key Management Checklist

- ✅ Generate cryptographically secure key (32+ chars)
- ✅ Add to `.env` file
- ✅ Add to `.gitignore` (never commit!)
- ✅ Store backup in secure vault
- ✅ Use different keys for dev/staging/prod
- ✅ Document key rotation schedule (every 90-180 days)

## Common Commands

```bash
# Encrypt existing credentials
pnpm encrypt:credentials

# Dry run (see what would be encrypted)
pnpm encrypt:credentials:dry-run

# Run tests
pnpm test src/utils/__tests__/encryption.test.ts

# Type check
pnpm typecheck
```

## Quick Examples

### Creating Encrypted Config

```typescript
// POST /io.exprsn.payments.createConfig
{
  "provider": "stripe",
  "credentials": {
    "secretKey": "sk_live_...",      // Automatically encrypted
    "publishableKey": "pk_live_...",  // Automatically encrypted
    "webhookSecret": "whsec_..."      // Automatically encrypted
  },
  "testMode": false
}
```

The API automatically encrypts credentials before storing them.

### Reading Encrypted Config

```typescript
// Decryption is automatic in routes
const config = await db.select()
  .from(paymentConfigs)
  .where(eq(paymentConfigs.id, configId));

// Credentials are decrypted when used
const credentials = safeDecryptCredentials(config[0].credentials);
const gateway = PaymentGatewayFactory.create('stripe', credentials);
```

## Troubleshooting

### "ENCRYPTION_KEY environment variable is required"
**Fix:** Add `ENCRYPTION_KEY` to your `.env` file

### "ENCRYPTION_KEY must be at least 32 characters long"
**Fix:** Generate a new key with `openssl rand -base64 32`

### "Decryption failed"
**Causes:**
- Wrong encryption key
- Key was changed after encryption
- Database corruption

**Fix:**
1. Verify `ENCRYPTION_KEY` matches the key used for encryption
2. Check if key was recently changed
3. Restore from backup if needed

## Need More Info?

See [PAYMENT_ENCRYPTION.md](./PAYMENT_ENCRYPTION.md) for:
- Detailed security specifications
- Advanced usage examples
- Key rotation procedures
- Monitoring and logging
- Full troubleshooting guide

## Security Reminders

🔒 **Never commit encryption keys to git**

🔒 **Use different keys for each environment**

🔒 **Store backups in secure vault (lost key = lost credentials)**

🔒 **Rotate keys every 90-180 days**

🔒 **Monitor and audit key access**

---

**Quick Start Complete!** 🎉

Your payment credentials are now securely encrypted at rest.
