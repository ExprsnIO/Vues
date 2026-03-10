/**
 * Secrets Encryption Utility
 * AES-256-GCM encryption for sensitive data like OAuth client secrets
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from the secret
 */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * Get encryption key from environment
 */
function getEncryptionKey(): Buffer {
  // Use dedicated encryption key or fall back to JWT_SECRET
  const secret = process.env.OAUTH_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('No encryption key configured. Set OAUTH_ENCRYPTION_KEY or JWT_SECRET.');
  }
  return deriveKey(secret);
}

/**
 * Encrypt a plaintext string
 * Returns format: base64(iv + ciphertext + authTag)
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine iv + ciphertext + authTag
  const combined = Buffer.concat([iv, ciphertext, authTag]);
  return combined.toString('base64');
}

/**
 * Decrypt an encrypted string
 * Expects format: base64(iv + ciphertext + authTag)
 */
export function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encrypted, 'base64');

  // Extract iv, ciphertext, and authTag
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Check if a value appears to be encrypted (base64 with minimum length)
 * This is a heuristic - not a guarantee
 */
export function isEncrypted(value: string): boolean {
  // Minimum length: IV (12) + at least 1 byte ciphertext + authTag (16) = 29 bytes = ~40 base64 chars
  if (value.length < 40) return false;

  // Check if it's valid base64
  try {
    const decoded = Buffer.from(value, 'base64');
    // Re-encode and compare to check for valid base64
    return decoded.toString('base64') === value;
  } catch {
    return false;
  }
}

/**
 * Safely decrypt a value, returning original if decryption fails
 * Useful during migration period when some values may not be encrypted
 */
export function safeDecryptSecret(value: string): string {
  if (!isEncrypted(value)) {
    return value;
  }

  try {
    return decryptSecret(value);
  } catch {
    // If decryption fails, return original value
    // This handles the case where the value wasn't actually encrypted
    return value;
  }
}
