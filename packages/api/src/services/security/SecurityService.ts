/**
 * Security Service
 * Token rotation, rate limiting, encryption, and MFA for production security
 */

import { db } from '../../db/index.js';
import { sql } from 'drizzle-orm';

// ==================== TOKEN MANAGEMENT ====================

export interface TokenConfig {
  accessTokenTTL: number; // seconds
  refreshTokenTTL: number; // seconds
  rotationWindow: number; // seconds before expiry to allow rotation
  maxActiveTokens: number;
  revokeOnPasswordChange: boolean;
  singleSession: boolean;
}

export interface AccessToken {
  id: string;
  userId: string;
  domainId?: string;
  scopes: string[];
  clientId?: string;
  expiresAt: Date;
  rotatedFromId?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshToken {
  id: string;
  accessTokenId: string;
  userId: string;
  domainId?: string;
  expiresAt: Date;
  rotationCount: number;
  createdAt: Date;
  lastRotatedAt?: Date;
}

export interface TokenRotationResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// ==================== RATE LIMITING ====================

export interface RateLimitConfig {
  name: string;
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (context: RateLimitContext) => string;
  skipCondition?: (context: RateLimitContext) => boolean;
  onLimit?: (context: RateLimitContext) => void;
}

export interface RateLimitContext {
  ip: string;
  userId?: string;
  domainId?: string;
  path: string;
  method: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// ==================== MFA ====================

export type MFAMethod = 'totp' | 'sms' | 'email' | 'backup_codes' | 'webauthn';

export interface MFAConfig {
  userId: string;
  method: MFAMethod;
  enabled: boolean;
  verified: boolean;
  secret?: string;
  phoneNumber?: string;
  email?: string;
  backupCodes?: string[];
  webauthnCredentials?: WebAuthnCredential[];
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  deviceName?: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface MFAChallenge {
  id: string;
  userId: string;
  method: MFAMethod;
  code?: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
}

// ==================== ENCRYPTION ====================

export interface EncryptionConfig {
  algorithm: 'aes-256-gcm' | 'aes-256-cbc';
  keyRotationDays: number;
  keyDerivationIterations: number;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag?: string;
  keyId: string;
  algorithm: string;
}

export interface EncryptionKey {
  id: string;
  key: string;
  algorithm: string;
  createdAt: Date;
  expiresAt?: Date;
  rotatedFromId?: string;
  status: 'active' | 'rotated' | 'revoked';
}

// Default configurations
const DEFAULT_TOKEN_CONFIG: TokenConfig = {
  accessTokenTTL: 3600, // 1 hour
  refreshTokenTTL: 2592000, // 30 days
  rotationWindow: 300, // 5 minutes
  maxActiveTokens: 10,
  revokeOnPasswordChange: true,
  singleSession: false,
};

const DEFAULT_RATE_LIMITS: RateLimitConfig[] = [
  {
    name: 'global',
    windowMs: 60000,
    maxRequests: 1000,
    keyGenerator: (ctx) => ctx.ip,
  },
  {
    name: 'auth',
    windowMs: 900000, // 15 minutes
    maxRequests: 10,
    keyGenerator: (ctx) => `auth:${ctx.ip}`,
  },
  {
    name: 'api',
    windowMs: 60000,
    maxRequests: 100,
    keyGenerator: (ctx) => ctx.userId ? `user:${ctx.userId}` : `ip:${ctx.ip}`,
  },
  {
    name: 'upload',
    windowMs: 3600000, // 1 hour
    maxRequests: 50,
    keyGenerator: (ctx) => ctx.userId ? `upload:${ctx.userId}` : `upload:${ctx.ip}`,
  },
  {
    name: 'search',
    windowMs: 60000,
    maxRequests: 30,
    keyGenerator: (ctx) => ctx.userId ? `search:${ctx.userId}` : `search:${ctx.ip}`,
  },
];

export class SecurityService {
  private tokenConfig: TokenConfig;
  private rateLimits: Map<string, RateLimitConfig> = new Map();
  private rateLimitBuckets: Map<string, RateLimitBucket> = new Map();
  private encryptionKeys: Map<string, EncryptionKey> = new Map();
  private activeKeyId: string | null = null;

  constructor(options?: {
    tokenConfig?: Partial<TokenConfig>;
    rateLimits?: RateLimitConfig[];
    encryptionConfig?: EncryptionConfig;
  }) {
    this.tokenConfig = { ...DEFAULT_TOKEN_CONFIG, ...options?.tokenConfig };

    // Initialize rate limits
    const limits = options?.rateLimits || DEFAULT_RATE_LIMITS;
    for (const limit of limits) {
      this.rateLimits.set(limit.name, limit);
    }
  }

  // ==================== TOKEN MANAGEMENT ====================

  /**
   * Generate a new access token
   */
  async generateAccessToken(params: {
    userId: string;
    domainId?: string;
    scopes?: string[];
    clientId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<TokenRotationResult> {
    // Check max active tokens
    const activeTokens = await db.execute(sql`
      SELECT COUNT(*) as count FROM access_tokens
      WHERE user_id = ${params.userId}
        AND expires_at > CURRENT_TIMESTAMP
        AND revoked = 0
    `);

    const count = Number((activeTokens[0] as any)?.count) || 0;
    if (count >= this.tokenConfig.maxActiveTokens) {
      // Revoke oldest token
      await db.execute(sql`
        DELETE FROM access_tokens
        WHERE id = (
          SELECT id FROM access_tokens
          WHERE user_id = ${params.userId}
            AND revoked = 0
          ORDER BY created_at ASC
          LIMIT 1
        )
      `);
    }

    const accessTokenId = crypto.randomUUID();
    const refreshTokenId = crypto.randomUUID();
    const now = new Date();

    const accessTokenExpiry = new Date(now.getTime() + this.tokenConfig.accessTokenTTL * 1000);
    const refreshTokenExpiry = new Date(now.getTime() + this.tokenConfig.refreshTokenTTL * 1000);

    // Generate secure tokens
    const accessTokenValue = this.generateSecureToken(64);
    const refreshTokenValue = this.generateSecureToken(64);

    // Store access token
    await db.execute(sql`
      INSERT INTO access_tokens (
        id, user_id, domain_id, scopes, client_id, token_hash,
        expires_at, ip_address, user_agent, created_at
      ) VALUES (
        ${accessTokenId}, ${params.userId}, ${params.domainId || null},
        ${JSON.stringify(params.scopes || [])}, ${params.clientId || null},
        ${await this.hashToken(accessTokenValue)}, ${accessTokenExpiry.toISOString()},
        ${params.ipAddress || null}, ${params.userAgent || null}, ${now.toISOString()}
      )
    `);

    // Store refresh token
    await db.execute(sql`
      INSERT INTO refresh_tokens (
        id, access_token_id, user_id, domain_id, token_hash,
        expires_at, rotation_count, created_at
      ) VALUES (
        ${refreshTokenId}, ${accessTokenId}, ${params.userId},
        ${params.domainId || null}, ${await this.hashToken(refreshTokenValue)},
        ${refreshTokenExpiry.toISOString()}, 0, ${now.toISOString()}
      )
    `);

    return {
      accessToken: `${accessTokenId}.${accessTokenValue}`,
      refreshToken: `${refreshTokenId}.${refreshTokenValue}`,
      expiresIn: this.tokenConfig.accessTokenTTL,
      tokenType: 'Bearer',
    };
  }

  /**
   * Validate an access token
   */
  async validateAccessToken(token: string): Promise<AccessToken | null> {
    const [tokenId, tokenValue] = token.split('.');
    if (!tokenId || !tokenValue) return null;

    const result = await db.execute(sql`
      SELECT * FROM access_tokens
      WHERE id = ${tokenId}
        AND expires_at > CURRENT_TIMESTAMP
        AND revoked = 0
    `);

    if (result.length === 0) return null;

    const row = result[0] as any;

    // Verify token hash
    const isValid = await this.verifyToken(tokenValue, row.token_hash);
    if (!isValid) return null;

    // Update last used
    await db.execute(sql`
      UPDATE access_tokens
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = ${tokenId}
    `);

    return {
      id: row.id,
      userId: row.user_id,
      domainId: row.domain_id,
      scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes,
      clientId: row.client_id,
      expiresAt: new Date(row.expires_at),
      rotatedFromId: row.rotated_from_id,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }

  /**
   * Rotate tokens using refresh token
   */
  async rotateTokens(refreshToken: string): Promise<TokenRotationResult> {
    const [tokenId, tokenValue] = refreshToken.split('.');
    if (!tokenId || !tokenValue) {
      throw new Error('Invalid refresh token format');
    }

    const result = await db.execute(sql`
      SELECT rt.*, at.user_id, at.domain_id, at.scopes, at.client_id,
             at.ip_address, at.user_agent
      FROM refresh_tokens rt
      JOIN access_tokens at ON rt.access_token_id = at.id
      WHERE rt.id = ${tokenId}
        AND rt.expires_at > CURRENT_TIMESTAMP
        AND rt.revoked = 0
    `);

    if (result.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const row = result[0] as any;

    // Verify token hash
    const isValid = await this.verifyToken(tokenValue, row.token_hash);
    if (!isValid) {
      throw new Error('Invalid refresh token');
    }

    // Revoke old tokens
    await db.execute(sql`
      UPDATE access_tokens SET revoked = 1 WHERE id = ${row.access_token_id}
    `);
    await db.execute(sql`
      UPDATE refresh_tokens SET revoked = 1 WHERE id = ${tokenId}
    `);

    // Generate new tokens
    return this.generateAccessToken({
      userId: row.user_id,
      domainId: row.domain_id,
      scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes,
      clientId: row.client_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    });
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllTokens(userId: string, reason?: string): Promise<void> {
    const now = new Date();

    await db.execute(sql`
      UPDATE access_tokens
      SET revoked = 1, revoked_at = ${now.toISOString()}, revoked_reason = ${reason || null}
      WHERE user_id = ${userId} AND revoked = 0
    `);

    await db.execute(sql`
      UPDATE refresh_tokens
      SET revoked = 1
      WHERE user_id = ${userId} AND revoked = 0
    `);
  }

  /**
   * Revoke a specific token
   */
  async revokeToken(tokenId: string, reason?: string): Promise<void> {
    const now = new Date();

    await db.execute(sql`
      UPDATE access_tokens
      SET revoked = 1, revoked_at = ${now.toISOString()}, revoked_reason = ${reason || null}
      WHERE id = ${tokenId}
    `);

    await db.execute(sql`
      UPDATE refresh_tokens
      SET revoked = 1
      WHERE access_token_id = ${tokenId}
    `);
  }

  // ==================== RATE LIMITING ====================

  /**
   * Check rate limit
   */
  checkRateLimit(limitName: string, context: RateLimitContext): RateLimitResult {
    const config = this.rateLimits.get(limitName);
    if (!config) {
      return { allowed: true, remaining: Infinity, resetAt: new Date() };
    }

    // Check skip condition
    if (config.skipCondition && config.skipCondition(context)) {
      return { allowed: true, remaining: Infinity, resetAt: new Date() };
    }

    const key = config.keyGenerator
      ? config.keyGenerator(context)
      : `${limitName}:${context.ip}`;

    const now = Date.now();
    let bucket = this.rateLimitBuckets.get(key);

    // Reset bucket if window expired
    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      this.rateLimitBuckets.set(key, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, config.maxRequests - bucket.count);
    const allowed = bucket.count <= config.maxRequests;

    if (!allowed && config.onLimit) {
      config.onLimit(context);
    }

    return {
      allowed,
      remaining,
      resetAt: new Date(bucket.resetAt),
      retryAfter: allowed ? undefined : Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  /**
   * Add custom rate limit
   */
  addRateLimit(config: RateLimitConfig): void {
    this.rateLimits.set(config.name, config);
  }

  /**
   * Reset rate limit for a key
   */
  resetRateLimit(limitName: string, context: RateLimitContext): void {
    const config = this.rateLimits.get(limitName);
    if (!config) return;

    const key = config.keyGenerator
      ? config.keyGenerator(context)
      : `${limitName}:${context.ip}`;

    this.rateLimitBuckets.delete(key);
  }

  // ==================== MFA ====================

  /**
   * Enable MFA for a user
   */
  async enableMFA(userId: string, method: MFAMethod): Promise<{ secret?: string; backupCodes?: string[] }> {
    const result: { secret?: string; backupCodes?: string[] } = {};

    if (method === 'totp') {
      // Generate TOTP secret
      result.secret = this.generateSecureToken(20);

      await db.execute(sql`
        INSERT INTO mfa_configs (id, user_id, method, secret, enabled, verified, created_at)
        VALUES (${crypto.randomUUID()}, ${userId}, ${method}, ${result.secret}, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, method) DO UPDATE SET
          secret = ${result.secret},
          verified = 0,
          updated_at = CURRENT_TIMESTAMP
      `);
    }

    if (method === 'backup_codes') {
      // Generate backup codes
      result.backupCodes = Array.from({ length: 10 }, () =>
        this.generateSecureToken(8).toUpperCase()
      );

      await db.execute(sql`
        INSERT INTO mfa_configs (id, user_id, method, backup_codes, enabled, verified, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${userId}, ${method},
          ${JSON.stringify(result.backupCodes)}, 1, 1, CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id, method) DO UPDATE SET
          backup_codes = ${JSON.stringify(result.backupCodes)},
          enabled = 1,
          verified = 1,
          updated_at = CURRENT_TIMESTAMP
      `);
    }

    return result;
  }

  /**
   * Verify MFA setup
   */
  async verifyMFASetup(userId: string, method: MFAMethod, code: string): Promise<boolean> {
    const config = await this.getMFAConfig(userId, method);
    if (!config || config.verified) return false;

    let isValid = false;

    if (method === 'totp' && config.secret) {
      isValid = this.verifyTOTP(config.secret, code);
    }

    if (isValid) {
      await db.execute(sql`
        UPDATE mfa_configs
        SET enabled = 1, verified = 1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId} AND method = ${method}
      `);
    }

    return isValid;
  }

  /**
   * Create MFA challenge
   */
  async createMFAChallenge(userId: string, method: MFAMethod): Promise<MFAChallenge> {
    const config = await this.getMFAConfig(userId, method);
    if (!config || !config.enabled) {
      throw new Error('MFA method not enabled');
    }

    const challenge: MFAChallenge = {
      id: crypto.randomUUID(),
      userId,
      method,
      expiresAt: new Date(Date.now() + 300000), // 5 minutes
      attempts: 0,
      maxAttempts: 5,
      verified: false,
    };

    if (method === 'email' || method === 'sms') {
      challenge.code = this.generateNumericCode(6);
      // Send code via email/SMS service
    }

    await db.execute(sql`
      INSERT INTO mfa_challenges (
        id, user_id, method, code_hash, expires_at, attempts, max_attempts, created_at
      ) VALUES (
        ${challenge.id}, ${userId}, ${method},
        ${challenge.code ? await this.hashToken(challenge.code) : null},
        ${challenge.expiresAt.toISOString()}, 0, 5, CURRENT_TIMESTAMP
      )
    `);

    return challenge;
  }

  /**
   * Verify MFA challenge
   */
  async verifyMFAChallenge(challengeId: string, code: string): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT mc.*, mf.secret
      FROM mfa_challenges mc
      JOIN mfa_configs mf ON mc.user_id = mf.user_id AND mc.method = mf.method
      WHERE mc.id = ${challengeId}
        AND mc.expires_at > CURRENT_TIMESTAMP
        AND mc.verified = 0
        AND mc.attempts < mc.max_attempts
    `);

    if (result.length === 0) return false;

    const challenge = result[0] as any;

    // Increment attempts
    await db.execute(sql`
      UPDATE mfa_challenges
      SET attempts = attempts + 1
      WHERE id = ${challengeId}
    `);

    let isValid = false;

    if (challenge.method === 'totp' && challenge.secret) {
      isValid = this.verifyTOTP(challenge.secret, code);
    } else if (challenge.code_hash) {
      isValid = await this.verifyToken(code, challenge.code_hash);
    } else if (challenge.method === 'backup_codes') {
      // Check backup codes
      const config = await this.getMFAConfig(challenge.user_id, 'backup_codes');
      if (config?.backupCodes?.includes(code.toUpperCase())) {
        isValid = true;
        // Remove used backup code
        const remaining = config.backupCodes.filter(c => c !== code.toUpperCase());
        await db.execute(sql`
          UPDATE mfa_configs
          SET backup_codes = ${JSON.stringify(remaining)}
          WHERE user_id = ${challenge.user_id} AND method = 'backup_codes'
        `);
      }
    }

    if (isValid) {
      await db.execute(sql`
        UPDATE mfa_challenges
        SET verified = 1, verified_at = CURRENT_TIMESTAMP
        WHERE id = ${challengeId}
      `);

      await db.execute(sql`
        UPDATE mfa_configs
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE user_id = ${challenge.user_id} AND method = ${challenge.method}
      `);
    }

    return isValid;
  }

  /**
   * Get MFA config for user
   */
  async getMFAConfig(userId: string, method: MFAMethod): Promise<MFAConfig | null> {
    const result = await db.execute(sql`
      SELECT * FROM mfa_configs
      WHERE user_id = ${userId} AND method = ${method}
    `);

    if (result.length === 0) return null;

    const row = result[0] as any;
    return {
      userId: row.user_id,
      method: row.method,
      enabled: Boolean(row.enabled),
      verified: Boolean(row.verified),
      secret: row.secret,
      phoneNumber: row.phone_number,
      email: row.email,
      backupCodes: row.backup_codes
        ? (typeof row.backup_codes === 'string' ? JSON.parse(row.backup_codes) : row.backup_codes)
        : undefined,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    };
  }

  /**
   * Get all MFA methods for user
   */
  async getUserMFAMethods(userId: string): Promise<MFAConfig[]> {
    const result = await db.execute(sql`
      SELECT * FROM mfa_configs
      WHERE user_id = ${userId} AND enabled = 1
    `);

    return (result as any[]).map(row => ({
      userId: row.user_id,
      method: row.method,
      enabled: Boolean(row.enabled),
      verified: Boolean(row.verified),
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    }));
  }

  // ==================== ENCRYPTION ====================

  /**
   * Encrypt data
   */
  async encrypt(plaintext: string): Promise<EncryptedData> {
    if (!this.activeKeyId) {
      await this.initializeEncryptionKey();
    }

    const key = this.encryptionKeys.get(this.activeKeyId!);
    if (!key) {
      throw new Error('No active encryption key');
    }

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.hexToBytes(key.key),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encoder.encode(plaintext)
    );

    const ciphertextBytes = new Uint8Array(encrypted);
    const tag = ciphertextBytes.slice(-16);
    const ciphertext = ciphertextBytes.slice(0, -16);

    return {
      ciphertext: this.bytesToHex(ciphertext),
      iv: this.bytesToHex(iv),
      tag: this.bytesToHex(tag),
      keyId: key.id,
      algorithm: 'aes-256-gcm',
    };
  }

  /**
   * Decrypt data
   */
  async decrypt(data: EncryptedData): Promise<string> {
    const key = this.encryptionKeys.get(data.keyId);
    if (!key) {
      // Try to load from database
      await this.loadEncryptionKey(data.keyId);
    }

    const loadedKey = this.encryptionKeys.get(data.keyId);
    if (!loadedKey) {
      throw new Error('Encryption key not found');
    }

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.hexToBytes(loadedKey.key),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const ciphertext = this.hexToBytes(data.ciphertext);
    const iv = this.hexToBytes(data.iv);
    const tag = data.tag ? this.hexToBytes(data.tag) : new Uint8Array(0);

    // Combine ciphertext and tag
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      combined
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Rotate encryption key
   */
  async rotateEncryptionKey(): Promise<void> {
    const oldKeyId = this.activeKeyId;

    // Generate new key
    const newKey = await this.generateEncryptionKey();
    this.activeKeyId = newKey.id;

    // Mark old key as rotated
    if (oldKeyId) {
      const oldKey = this.encryptionKeys.get(oldKeyId);
      if (oldKey) {
        oldKey.status = 'rotated';
        await db.execute(sql`
          UPDATE encryption_keys
          SET status = 'rotated', rotated_at = CURRENT_TIMESTAMP
          WHERE id = ${oldKeyId}
        `);
      }
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private generateSecureToken(length: number): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private generateNumericCode(length: number): string {
    let code = '';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      code += ((bytes[i] ?? 0) % 10).toString();
    }
    return code;
  }

  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this.bytesToHex(new Uint8Array(hash));
  }

  private async verifyToken(token: string, hash: string): Promise<boolean> {
    const tokenHash = await this.hashToken(token);
    return tokenHash === hash;
  }

  private verifyTOTP(secret: string, code: string): boolean {
    // Simple TOTP verification
    const counter = Math.floor(Date.now() / 30000);

    // Check current and adjacent time windows
    for (const offset of [-1, 0, 1]) {
      const expectedCode = this.generateTOTP(secret, counter + offset);
      if (expectedCode === code) {
        return true;
      }
    }

    return false;
  }

  private generateTOTP(secret: string, counter: number): string {
    // Simplified TOTP - in production use a proper library
    const data = new ArrayBuffer(8);
    const view = new DataView(data);
    view.setBigUint64(0, BigInt(counter), false);

    // This is a simplified implementation
    // In production, use proper HMAC-SHA1
    const hash = this.simpleHash(secret + counter.toString());
    const offset = hash.charCodeAt(hash.length - 1) & 0xf;
    const truncated = (
      ((hash.charCodeAt(offset) & 0x7f) << 24) |
      ((hash.charCodeAt(offset + 1) & 0xff) << 16) |
      ((hash.charCodeAt(offset + 2) & 0xff) << 8) |
      (hash.charCodeAt(offset + 3) & 0xff)
    ) % 1000000;

    return truncated.toString().padStart(6, '0');
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }

  private async initializeEncryptionKey(): Promise<void> {
    // Check for existing active key
    const result = await db.execute(sql`
      SELECT * FROM encryption_keys
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.length > 0) {
      const row = result[0] as any;
      this.encryptionKeys.set(row.id, {
        id: row.id,
        key: row.key_value,
        algorithm: row.algorithm,
        createdAt: new Date(row.created_at),
        status: row.status,
      });
      this.activeKeyId = row.id;
    } else {
      // Generate new key
      const key = await this.generateEncryptionKey();
      this.activeKeyId = key.id;
    }
  }

  private async generateEncryptionKey(): Promise<EncryptionKey> {
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);

    const key: EncryptionKey = {
      id: crypto.randomUUID(),
      key: this.bytesToHex(keyBytes),
      algorithm: 'aes-256-gcm',
      createdAt: new Date(),
      status: 'active',
    };

    await db.execute(sql`
      INSERT INTO encryption_keys (id, key_value, algorithm, status, created_at)
      VALUES (${key.id}, ${key.key}, ${key.algorithm}, ${key.status}, ${key.createdAt.toISOString()})
    `);

    this.encryptionKeys.set(key.id, key);
    return key;
  }

  private async loadEncryptionKey(keyId: string): Promise<void> {
    const result = await db.execute(sql`
      SELECT * FROM encryption_keys WHERE id = ${keyId}
    `);

    if (result.length > 0) {
      const row = result[0] as any;
      this.encryptionKeys.set(row.id, {
        id: row.id,
        key: row.key_value,
        algorithm: row.algorithm,
        createdAt: new Date(row.created_at),
        status: row.status,
      });
    }
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
}

export function createSecurityService(options?: {
  tokenConfig?: Partial<TokenConfig>;
  rateLimits?: RateLimitConfig[];
}): SecurityService {
  return new SecurityService(options);
}
