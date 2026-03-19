import crypto from 'node:crypto';

/**
 * Encryption Utility for Payment Credentials
 *
 * Uses AES-256-GCM for authenticated encryption with a derived key from environment variable.
 * Supports key rotation by prefixing encrypted data with key version.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // PBKDF2 iterations

// Current key version for key rotation support
const CURRENT_KEY_VERSION = 'v1';

// Track whether we've warned about missing encryption key (to avoid log spam)
let encryptionKeyWarningLogged = false;

/**
 * Get encryption key from environment
 * SECURITY: No fallback in production - will throw if not configured
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  const nodeEnv = process.env.NODE_ENV as string | undefined;

  if (!key) {
    // Always throw in production or staging
    if (nodeEnv === 'production' || nodeEnv === 'staging') {
      throw new Error(
        'CRITICAL: ENCRYPTION_KEY environment variable is required. ' +
        'Generate a secure key with: openssl rand -base64 32'
      );
    }

    // In development/test, use a deterministic dev key but warn loudly
    if (!encryptionKeyWarningLogged) {
      console.error('═'.repeat(70));
      console.error('⚠️  SECURITY WARNING: ENCRYPTION_KEY not set!');
      console.error('   Using development-only key. This MUST NOT reach production.');
      console.error('   Generate a secure key: openssl rand -base64 32');
      console.error('═'.repeat(70));
      encryptionKeyWarningLogged = true;
    }

    return 'dev-encryption-key-DO-NOT-USE-IN-PRODUCTION-12345';
  }

  if (key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
  }

  // Warn if it looks like a weak/default key
  const weakPatterns = ['dev', 'test', 'changeme', 'password', 'secret', 'default'];
  if (weakPatterns.some(pattern => key.toLowerCase().includes(pattern))) {
    console.warn('⚠️  ENCRYPTION_KEY appears to contain a weak/default pattern. Use a cryptographically random key in production.');
  }

  return key;
}

/**
 * Get encryption key for a specific version (for key rotation)
 */
function getEncryptionKeyForVersion(version: string): string {
  // For now, we only support v1. When rotating keys:
  // 1. Add ENCRYPTION_KEY_V2 to environment
  // 2. Update CURRENT_KEY_VERSION to 'v2'
  // 3. Add case for 'v2' here
  // 4. Decrypt with old key, re-encrypt with new key

  switch (version) {
    case 'v1':
      return getEncryptionKey();
    default:
      throw new Error(`Unsupported encryption key version: ${version}`);
  }
}

/**
 * Derive a cryptographic key from the master key using PBKDF2
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    masterKey,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * Format: version:salt:iv:authTag:ciphertext (all base64url encoded)
 *
 * @param plaintext - The text to encrypt
 * @returns Encrypted string with version, salt, IV, auth tag, and ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty plaintext');
  }

  const masterKey = getEncryptionKeyForVersion(CURRENT_KEY_VERSION);

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive encryption key from master key
  const key = deriveKey(masterKey, salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine version, salt, iv, authTag, and ciphertext
  const combined = [
    CURRENT_KEY_VERSION,
    salt.toString('base64url'),
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');

  return combined;
}

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * Supports key versioning for rotation.
 *
 * @param ciphertext - The encrypted string to decrypt
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt empty ciphertext');
  }

  // Split the combined string
  const parts = ciphertext.split(':');

  if (parts.length !== 5) {
    throw new Error('Invalid encrypted data format');
  }

  const [version, saltB64, ivB64, authTagB64, encryptedB64] = parts as [string, string, string, string, string];

  // Get the appropriate key for this version
  const masterKey = getEncryptionKeyForVersion(version);

  // Decode components
  const salt = Buffer.from(saltB64, 'base64url');
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(authTagB64, 'base64url');
  const encrypted = Buffer.from(encryptedB64, 'base64url');

  // Derive decryption key
  const key = deriveKey(masterKey, salt);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unsupported state or unable to authenticate data')) {
      throw new Error('Decryption failed: Invalid key or corrupted data');
    }
    throw error;
  }
}

/**
 * Encrypt a credentials object (key-value pairs)
 *
 * Each credential value is encrypted separately to allow partial updates.
 *
 * @param credentials - Object with credential key-value pairs
 * @returns Object with encrypted values
 */
export function encryptCredentials(credentials: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (value) {
      encrypted[key] = encrypt(value);
    }
  }

  return encrypted;
}

/**
 * Decrypt a credentials object (key-value pairs)
 *
 * @param encryptedCredentials - Object with encrypted values
 * @returns Object with decrypted values
 */
export function decryptCredentials(encryptedCredentials: Record<string, string>): Record<string, string> {
  const decrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(encryptedCredentials)) {
    if (value) {
      try {
        decrypted[key] = decrypt(value);
      } catch (error) {
        console.error(`Failed to decrypt credential key "${key}":`, error);
        throw new Error(`Failed to decrypt credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  return decrypted;
}

/**
 * Check if credentials appear to be encrypted (have version prefix)
 *
 * @param credentials - Credentials object to check
 * @returns true if encrypted, false otherwise
 */
export function isEncrypted(credentials: Record<string, string>): boolean {
  // Check if any value has the encrypted format (version:salt:iv:authTag:ciphertext)
  for (const value of Object.values(credentials)) {
    if (value && typeof value === 'string') {
      const parts = value.split(':');
      // Check for 5 parts and version starts with 'v'
      if (parts.length === 5 && parts[0]?.startsWith('v')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Re-encrypt credentials with a new key version
 * Used during key rotation
 *
 * @param oldEncryptedCredentials - Credentials encrypted with old key
 * @param newKeyVersion - New key version to use
 * @returns Credentials encrypted with new key
 */
export function rotateCredentialKeys(
  oldEncryptedCredentials: Record<string, string>,
  newKeyVersion: string = CURRENT_KEY_VERSION
): Record<string, string> {
  // Decrypt with old key
  const decrypted = decryptCredentials(oldEncryptedCredentials);

  // Re-encrypt with new key
  // Note: This would need to be updated to support actual key rotation
  // when multiple key versions are implemented
  return encryptCredentials(decrypted);
}

/**
 * Safely test if credentials can be decrypted
 *
 * @param credentials - Credentials to test
 * @returns true if decryption succeeds, false otherwise
 */
export function canDecrypt(credentials: Record<string, string>): boolean {
  try {
    decryptCredentials(credentials);
    return true;
  } catch {
    return false;
  }
}
