/**
 * Session Token Utilities
 *
 * Handles secure hashing of session tokens for storage.
 * Tokens are hashed using SHA-256 before storage to prevent
 * token theft if the database is compromised.
 *
 * SECURITY: Raw tokens are only returned to the user once at creation.
 * Only hashed tokens are stored in the database.
 */

import crypto from 'node:crypto';

/**
 * Hash a session token for storage
 *
 * Uses SHA-256 which is fast enough for high-frequency lookups
 * while still providing security against database compromise.
 *
 * @param token - The raw session token
 * @returns The hashed token (hex-encoded)
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a new session token pair with their hashes
 *
 * @returns Object containing raw tokens (for user) and hashed tokens (for storage)
 */
export function generateSessionTokens(): {
  accessToken: string;
  refreshToken: string;
  accessTokenHash: string;
  refreshTokenHash: string;
} {
  // Generate cryptographically secure random tokens
  const accessToken = `exp_${crypto.randomBytes(24).toString('base64url')}`;
  const refreshToken = `ref_${crypto.randomBytes(32).toString('base64url')}`;

  return {
    accessToken,
    refreshToken,
    accessTokenHash: hashSessionToken(accessToken),
    refreshTokenHash: hashSessionToken(refreshToken),
  };
}

/**
 * Verify a token matches a stored hash
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param token - The raw token to verify
 * @param storedHash - The stored hash to compare against
 * @returns True if the token matches the hash
 */
export function verifySessionToken(token: string, storedHash: string): boolean {
  const tokenHash = hashSessionToken(token);

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(tokenHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    // Buffers of different lengths will throw
    return false;
  }
}
