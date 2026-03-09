/**
 * JWTService - JWT signing, verification, and JWKS management for OIDC Provider
 *
 * Handles:
 * - RS256 key pair generation and management
 * - ID token creation and signing
 * - Access token creation
 * - JWKS generation for public key distribution
 * - Key rotation support
 */

import * as jose from 'jose';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import { oidcSigningKeys } from '../../db/schema.js';
import { eq, and, or, isNull, lte } from 'drizzle-orm';
import crypto from 'crypto';

// Environment variable for key encryption
const KEY_ENCRYPTION_SECRET = process.env.OIDC_KEY_ENCRYPTION_SECRET || process.env.CA_ENCRYPTION_KEY || 'dev-secret-change-in-production';

export interface IDTokenClaims {
  sub: string; // Subject (user DID)
  aud: string; // Audience (client_id)
  iss: string; // Issuer (our domain)
  exp: number; // Expiration time
  iat: number; // Issued at
  auth_time?: number; // Time of authentication
  nonce?: string; // Nonce from authorization request
  at_hash?: string; // Access token hash
  acr?: string; // Authentication Context Class Reference
  amr?: string[]; // Authentication Methods References

  // Standard OIDC claims
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  updated_at?: number;
}

export interface AccessTokenClaims {
  sub: string;
  client_id: string;
  scope: string;
  exp: number;
  iat: number;
  jti: string; // JWT ID for revocation tracking
}

export interface JWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

export interface JWKS {
  keys: JWK[];
}

export interface SigningKeyInfo {
  id: string;
  kid: string;
  algorithm: string;
  status: string;
  createdAt: Date;
  promotedAt: Date | null;
  retiresAt: Date | null;
}

// Key type for jose v6 (using jose's exported types)
type PrivateKey = jose.CryptoKey | jose.KeyObject;

class JWTServiceImpl {
  private issuer: string;
  private ssoBaseUrl: string;
  private activeKeyCache: { kid: string; privateKey: PrivateKey } | null = null;
  private jwksCache: JWKS | null = null;
  private jwksCacheTime: number = 0;
  private readonly JWKS_CACHE_TTL = 60 * 1000; // 1 minute cache

  constructor() {
    const appUrl = process.env.APP_URL || 'http://localhost:3002';
    this.issuer = appUrl;
    this.ssoBaseUrl = `${appUrl}/sso`;
  }

  /**
   * Initialize the service - ensure at least one signing key exists
   */
  async initialize(): Promise<void> {
    const activeKeys = await db
      .select()
      .from(oidcSigningKeys)
      .where(eq(oidcSigningKeys.status, 'active'));

    if (activeKeys.length === 0) {
      console.log('[JWTService] No active signing keys found, generating initial key...');
      await this.generateSigningKey();
    }
  }

  /**
   * Generate a new RS256 signing key pair
   */
  async generateSigningKey(): Promise<SigningKeyInfo> {
    // Generate RSA key pair
    const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
      modulusLength: 2048,
    });

    // Export keys to PEM format
    const publicKeyPem = await jose.exportSPKI(publicKey);
    const privateKeyPem = await jose.exportPKCS8(privateKey);

    // Encrypt private key for storage
    const encryptedPrivateKey = this.encryptPrivateKey(privateKeyPem);

    // Generate key ID
    const kid = `key-${nanoid(12)}`;
    const id = nanoid();

    // Store in database
    const [insertedKey] = await db
      .insert(oidcSigningKeys)
      .values({
        id,
        kid,
        algorithm: 'RS256',
        publicKey: publicKeyPem,
        privateKey: encryptedPrivateKey,
        status: 'active',
        promotedAt: new Date(),
      })
      .returning();

    const newKey = insertedKey!;

    // Invalidate caches
    this.activeKeyCache = null;
    this.jwksCache = null;

    console.log(`[JWTService] Generated new signing key: ${kid}`);

    return {
      id: newKey.id,
      kid: newKey.kid,
      algorithm: newKey.algorithm || 'RS256',
      status: newKey.status || 'active',
      createdAt: newKey.createdAt,
      promotedAt: newKey.promotedAt,
      retiresAt: newKey.retiresAt,
    };
  }

  /**
   * Get the active signing key for creating tokens
   */
  private async getActiveSigningKey(): Promise<{ kid: string; privateKey: PrivateKey }> {
    if (this.activeKeyCache) {
      return this.activeKeyCache;
    }

    const [activeKey] = await db
      .select()
      .from(oidcSigningKeys)
      .where(eq(oidcSigningKeys.status, 'active'))
      .orderBy(oidcSigningKeys.promotedAt)
      .limit(1);

    if (!activeKey) {
      throw new Error('No active signing key available');
    }

    // Decrypt and import private key
    const decryptedPrivateKey = this.decryptPrivateKey(activeKey.privateKey);
    const privateKey = await jose.importPKCS8(decryptedPrivateKey, 'RS256');

    this.activeKeyCache = {
      kid: activeKey.kid,
      privateKey,
    };

    return this.activeKeyCache;
  }

  /**
   * Create and sign an ID token
   */
  async createIdToken(claims: Partial<IDTokenClaims> & { sub: string; aud: string }): Promise<string> {
    const { kid, privateKey } = await this.getActiveSigningKey();

    const now = Math.floor(Date.now() / 1000);

    const idToken = await new jose.SignJWT({
      ...claims,
      iss: this.issuer,
      iat: now,
      exp: claims.exp || now + 3600, // Default 1 hour
    })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .sign(privateKey);

    return idToken;
  }

  /**
   * Create and sign an access token (JWT format)
   */
  async createAccessToken(
    sub: string,
    clientId: string,
    scope: string,
    expiresInSeconds: number = 3600
  ): Promise<{ token: string; jti: string }> {
    const { kid, privateKey } = await this.getActiveSigningKey();

    const now = Math.floor(Date.now() / 1000);
    const jti = nanoid(32);

    const accessToken = await new jose.SignJWT({
      sub,
      client_id: clientId,
      scope,
      jti,
    })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'at+jwt' })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresInSeconds)
      .setIssuer(this.issuer)
      .sign(privateKey);

    return { token: accessToken, jti };
  }

  /**
   * Create a refresh token (opaque, not JWT)
   */
  createRefreshToken(): string {
    return `ref_${nanoid(48)}`;
  }

  /**
   * Verify and decode an access token
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
      const jwks = await this.getJWKS();
      const keySet = jose.createLocalJWKSet({ keys: jwks.keys });

      const { payload } = await jose.jwtVerify(token, keySet, {
        issuer: this.issuer,
      });

      return payload as unknown as AccessTokenClaims;
    } catch (error) {
      console.error('[JWTService] Token verification failed:', error);
      return null;
    }
  }

  /**
   * Get the JWKS for public key distribution
   */
  async getJWKS(): Promise<JWKS> {
    // Check cache
    if (this.jwksCache && Date.now() - this.jwksCacheTime < this.JWKS_CACHE_TTL) {
      return this.jwksCache;
    }

    // Get all keys that should be in JWKS (active + recently retired for verification)
    const keys = await db
      .select()
      .from(oidcSigningKeys)
      .where(
        or(
          eq(oidcSigningKeys.status, 'active'),
          eq(oidcSigningKeys.status, 'rotating'),
          and(
            eq(oidcSigningKeys.status, 'retired'),
            // Keep retired keys for 24 hours for token verification
            isNull(oidcSigningKeys.retiresAt) // This check isn't quite right - we want keys retired recently
          )
        )
      );

    const jwks: JWK[] = [];

    for (const key of keys) {
      try {
        const publicKey = await jose.importSPKI(key.publicKey, 'RS256');
        const jwk = await jose.exportJWK(publicKey);

        jwks.push({
          kty: jwk.kty || 'RSA',
          kid: key.kid,
          use: 'sig',
          alg: key.algorithm || 'RS256',
          n: jwk.n || '',
          e: jwk.e || '',
        });
      } catch (error) {
        console.error(`[JWTService] Failed to export key ${key.kid}:`, error);
      }
    }

    this.jwksCache = { keys: jwks };
    this.jwksCacheTime = Date.now();

    return this.jwksCache;
  }

  /**
   * Rotate signing keys - create new key and retire old one
   */
  async rotateKeys(): Promise<SigningKeyInfo> {
    // Mark current active keys as rotating
    await db
      .update(oidcSigningKeys)
      .set({ status: 'rotating' })
      .where(eq(oidcSigningKeys.status, 'active'));

    // Generate new key
    const newKey = await this.generateSigningKey();

    // Schedule retirement of rotating keys (keep for 24 hours)
    const retireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db
      .update(oidcSigningKeys)
      .set({
        status: 'retired',
        retiresAt: retireAt,
      })
      .where(eq(oidcSigningKeys.status, 'rotating'));

    // Invalidate caches
    this.activeKeyCache = null;
    this.jwksCache = null;

    console.log('[JWTService] Key rotation complete');

    return newKey;
  }

  /**
   * Clean up old retired keys
   */
  async cleanupRetiredKeys(): Promise<number> {
    const now = new Date();

    const result = await db
      .delete(oidcSigningKeys)
      .where(
        and(
          eq(oidcSigningKeys.status, 'retired'),
          lte(oidcSigningKeys.retiresAt, now)
        )
      )
      .returning();

    if (result.length > 0) {
      console.log(`[JWTService] Cleaned up ${result.length} retired keys`);
      this.jwksCache = null;
    }

    return result.length;
  }

  /**
   * List all signing keys
   */
  async listSigningKeys(): Promise<SigningKeyInfo[]> {
    const keys = await db.select().from(oidcSigningKeys);

    return keys.map((key) => ({
      id: key.id,
      kid: key.kid,
      algorithm: key.algorithm || 'RS256',
      status: key.status || 'active',
      createdAt: key.createdAt,
      promotedAt: key.promotedAt,
      retiresAt: key.retiresAt,
    }));
  }

  /**
   * Compute at_hash for ID token (access token hash)
   */
  computeAtHash(accessToken: string): string {
    const hash = crypto.createHash('sha256').update(accessToken).digest();
    // Take left half of hash and base64url encode
    const leftHalf = hash.subarray(0, hash.length / 2);
    return jose.base64url.encode(leftHalf);
  }

  /**
   * Get OIDC Discovery metadata
   * Note: SSO routes are mounted at /sso, so all endpoints use ssoBaseUrl
   */
  getDiscoveryMetadata(): Record<string, unknown> {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.ssoBaseUrl}/oauth/authorize`,
      token_endpoint: `${this.ssoBaseUrl}/oauth/token`,
      userinfo_endpoint: `${this.ssoBaseUrl}/oauth/userinfo`,
      jwks_uri: `${this.ssoBaseUrl}/oauth/jwks`,
      registration_endpoint: `${this.ssoBaseUrl}/oauth/register`,
      revocation_endpoint: `${this.ssoBaseUrl}/oauth/revoke`,
      introspection_endpoint: `${this.ssoBaseUrl}/oauth/introspect`,
      end_session_endpoint: `${this.ssoBaseUrl}/oauth/logout`,

      // Supported features
      scopes_supported: [
        'openid',
        'profile',
        'email',
        'address',
        'phone',
        'offline_access',
        'read',
        'write',
      ],
      response_types_supported: ['code', 'id_token', 'token id_token', 'code id_token'],
      response_modes_supported: ['query', 'fragment', 'form_post'],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'client_credentials',
      ],
      token_endpoint_auth_methods_supported: [
        'client_secret_basic',
        'client_secret_post',
        'private_key_jwt',
        'none',
      ],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256', 'plain'],

      // Claims
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'auth_time',
        'nonce',
        'acr',
        'amr',
        'at_hash',
        'name',
        'given_name',
        'family_name',
        'preferred_username',
        'picture',
        'email',
        'email_verified',
        'updated_at',
      ],

      // Features
      request_parameter_supported: false,
      request_uri_parameter_supported: false,
      require_request_uri_registration: false,
      claims_parameter_supported: false,
    };
  }

  // Private helper methods for key encryption
  private encryptPrivateKey(privateKey: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(KEY_ENCRYPTION_SECRET, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decryptPrivateKey(encryptedKey: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(KEY_ENCRYPTION_SECRET, 'salt', 32);

    const parts = encryptedKey.split(':');
    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encrypted = parts[2];

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted key format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

// Export singleton instance
export const JWTService = new JWTServiceImpl();

// Export class for testing
export { JWTServiceImpl };
