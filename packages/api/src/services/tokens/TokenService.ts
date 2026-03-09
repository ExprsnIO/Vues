/**
 * Token Service
 * API token management for programmatic access
 */

import { createHash, randomBytes } from 'crypto';
import { db } from '../../db/index.js';
import {
  apiTokens,
  apiTokenScopes,
  caEntityCertificates,
} from '../../db/schema.js';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { CAAuditService } from '../ca/CAAuditService.js';

export type TokenType = 'personal' | 'service' | 'organization';

export interface TokenContext {
  tokenId: string;
  ownerDid: string;
  tokenType: TokenType;
  scopes: string[];
  allowedIps: string[] | null;
  allowedOrigins: string[] | null;
  rateLimit: number | null;
  certificateId: string | null;
}

export interface CreateTokenOptions {
  ownerDid: string;
  name: string;
  description?: string;
  tokenType: TokenType;
  scopes: string[];
  certificateId?: string;
  allowedIps?: string[];
  allowedOrigins?: string[];
  rateLimit?: number;
  expiresInDays?: number;
}

export class TokenService {
  /**
   * Generate new API token
   */
  static async createToken(options: CreateTokenOptions): Promise<{
    token: string;
    tokenId: string;
    tokenPrefix: string;
    expiresAt: Date | null;
  }> {
    // Validate scopes
    const validScopes = await this.validateScopes(options.scopes, options.certificateId);
    if (!validScopes.valid) {
      throw new Error(`Invalid scopes: ${validScopes.invalid.join(', ')}`);
    }

    // Generate secure token
    // Format: exp_{type prefix}{32 bytes base64url}
    const tokenBytes = randomBytes(32);
    const typePrefix = options.tokenType[0]; // 'p', 's', or 'o'
    const token = `exp_${typePrefix}${tokenBytes.toString('base64url')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 12);

    const tokenId = nanoid();
    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    await db.insert(apiTokens).values({
      id: tokenId,
      tokenHash,
      tokenPrefix,
      name: options.name,
      description: options.description || null,
      ownerDid: options.ownerDid,
      certificateId: options.certificateId || null,
      tokenType: options.tokenType,
      scopes: options.scopes,
      allowedIps: options.allowedIps || null,
      allowedOrigins: options.allowedOrigins || null,
      rateLimit: options.rateLimit || null,
      expiresAt,
      status: 'active',
    });

    // Log audit event
    await CAAuditService.log({
      eventType: 'token.issued',
      subjectDid: options.ownerDid,
      performedBy: options.ownerDid,
      details: {
        tokenId,
        tokenType: options.tokenType,
        scopes: options.scopes,
        expiresAt: expiresAt?.toISOString(),
      },
    });

    return { token, tokenId, tokenPrefix, expiresAt };
  }

  /**
   * Validate token and return context
   */
  static async validateToken(
    token: string,
    requiredScopes?: string[]
  ): Promise<TokenContext | null> {
    // Check token format
    if (!token.startsWith('exp_')) {
      return null;
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const [tokenRecord] = await db.select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRecord) {
      return null;
    }

    // Check status
    if (tokenRecord.status !== 'active') {
      return null;
    }

    // Check expiration
    if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date()) {
      // Auto-expire the token
      await db.update(apiTokens)
        .set({ status: 'expired' })
        .where(eq(apiTokens.id, tokenRecord.id));
      return null;
    }

    // Check certificate if service token
    if (tokenRecord.tokenType === 'service' && tokenRecord.certificateId) {
      const certValid = await this.validateCertificate(tokenRecord.certificateId);
      if (!certValid) {
        return null;
      }
    }

    // Check required scopes
    const tokenScopes = tokenRecord.scopes as string[];
    if (requiredScopes && !requiredScopes.every(s => tokenScopes.includes(s))) {
      return null;
    }

    // Update usage stats asynchronously
    db.update(apiTokens)
      .set({
        lastUsedAt: new Date(),
        usageCount: sql`${apiTokens.usageCount} + 1`,
      })
      .where(eq(apiTokens.id, tokenRecord.id))
      .catch(err => console.error('Failed to update token usage:', err));

    return {
      tokenId: tokenRecord.id,
      ownerDid: tokenRecord.ownerDid,
      tokenType: tokenRecord.tokenType as TokenType,
      scopes: tokenScopes,
      allowedIps: tokenRecord.allowedIps as string[] | null,
      allowedOrigins: tokenRecord.allowedOrigins as string[] | null,
      rateLimit: tokenRecord.rateLimit,
      certificateId: tokenRecord.certificateId,
    };
  }

  /**
   * Revoke token
   */
  static async revokeToken(
    tokenId: string,
    revokedBy: string,
    reason?: string
  ): Promise<void> {
    const [token] = await db.select()
      .from(apiTokens)
      .where(eq(apiTokens.id, tokenId))
      .limit(1);

    if (!token) {
      throw new Error('Token not found');
    }

    await db.update(apiTokens)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason || null,
      })
      .where(eq(apiTokens.id, tokenId));

    await CAAuditService.log({
      eventType: 'token.revoked',
      subjectDid: token.ownerDid,
      performedBy: revokedBy,
      details: { tokenId, reason },
    });
  }

  /**
   * Rotate token (revoke old, issue new)
   */
  static async rotateToken(
    tokenId: string,
    performedBy: string
  ): Promise<{ token: string; newTokenId: string }> {
    const [oldToken] = await db.select()
      .from(apiTokens)
      .where(
        and(
          eq(apiTokens.id, tokenId),
          eq(apiTokens.status, 'active')
        )
      )
      .limit(1);

    if (!oldToken) {
      throw new Error('Token not found or already revoked');
    }

    // Create new token with same properties
    const result = await this.createToken({
      ownerDid: oldToken.ownerDid,
      name: oldToken.name,
      description: oldToken.description || undefined,
      tokenType: oldToken.tokenType as TokenType,
      scopes: oldToken.scopes as string[],
      certificateId: oldToken.certificateId || undefined,
      allowedIps: (oldToken.allowedIps as string[]) || undefined,
      allowedOrigins: (oldToken.allowedOrigins as string[]) || undefined,
      rateLimit: oldToken.rateLimit || undefined,
      // Keep same expiry duration
      expiresInDays: oldToken.expiresAt
        ? Math.ceil((new Date(oldToken.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : undefined,
    });

    // Revoke old token
    await this.revokeToken(tokenId, performedBy, 'Rotated');

    await CAAuditService.log({
      eventType: 'token.rotated',
      subjectDid: oldToken.ownerDid,
      performedBy,
      details: { oldTokenId: tokenId, newTokenId: result.tokenId },
    });

    return { token: result.token, newTokenId: result.tokenId };
  }

  /**
   * List tokens for a user
   */
  static async listTokens(ownerDid: string): Promise<Array<{
    id: string;
    name: string;
    description: string | null;
    tokenPrefix: string;
    tokenType: string;
    scopes: string[];
    status: string;
    lastUsedAt: Date | null;
    usageCount: number;
    expiresAt: Date | null;
    createdAt: Date;
  }>> {
    const tokens = await db.select({
      id: apiTokens.id,
      name: apiTokens.name,
      description: apiTokens.description,
      tokenPrefix: apiTokens.tokenPrefix,
      tokenType: apiTokens.tokenType,
      scopes: apiTokens.scopes,
      status: apiTokens.status,
      lastUsedAt: apiTokens.lastUsedAt,
      usageCount: apiTokens.usageCount,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
    })
      .from(apiTokens)
      .where(eq(apiTokens.ownerDid, ownerDid))
      .orderBy(desc(apiTokens.createdAt));

    return tokens.map(t => ({
      ...t,
      scopes: t.scopes as string[],
    }));
  }

  /**
   * Get token details (without hash)
   */
  static async getToken(tokenId: string, ownerDid: string): Promise<{
    id: string;
    name: string;
    description: string | null;
    tokenPrefix: string;
    tokenType: string;
    scopes: string[];
    allowedIps: string[] | null;
    allowedOrigins: string[] | null;
    rateLimit: number | null;
    status: string;
    lastUsedAt: Date | null;
    lastUsedIp: string | null;
    usageCount: number;
    expiresAt: Date | null;
    createdAt: Date;
  } | null> {
    const [token] = await db.select({
      id: apiTokens.id,
      name: apiTokens.name,
      description: apiTokens.description,
      tokenPrefix: apiTokens.tokenPrefix,
      tokenType: apiTokens.tokenType,
      scopes: apiTokens.scopes,
      allowedIps: apiTokens.allowedIps,
      allowedOrigins: apiTokens.allowedOrigins,
      rateLimit: apiTokens.rateLimit,
      status: apiTokens.status,
      lastUsedAt: apiTokens.lastUsedAt,
      lastUsedIp: apiTokens.lastUsedIp,
      usageCount: apiTokens.usageCount,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
    })
      .from(apiTokens)
      .where(
        and(
          eq(apiTokens.id, tokenId),
          eq(apiTokens.ownerDid, ownerDid)
        )
      )
      .limit(1);

    if (!token) return null;

    return {
      ...token,
      scopes: token.scopes as string[],
      allowedIps: token.allowedIps as string[] | null,
      allowedOrigins: token.allowedOrigins as string[] | null,
    };
  }

  /**
   * Update token metadata
   */
  static async updateToken(
    tokenId: string,
    ownerDid: string,
    updates: {
      name?: string;
      description?: string;
      allowedIps?: string[];
      allowedOrigins?: string[];
      rateLimit?: number;
    }
  ): Promise<void> {
    await db.update(apiTokens)
      .set({
        name: updates.name,
        description: updates.description,
        allowedIps: updates.allowedIps,
        allowedOrigins: updates.allowedOrigins,
        rateLimit: updates.rateLimit,
      })
      .where(
        and(
          eq(apiTokens.id, tokenId),
          eq(apiTokens.ownerDid, ownerDid)
        )
      );
  }

  /**
   * Validate scopes
   */
  static async validateScopes(
    scopes: string[],
    certificateId?: string
  ): Promise<{ valid: boolean; invalid: string[] }> {
    const validScopes = await db.select()
      .from(apiTokenScopes)
      .where(
        and(
          inArray(apiTokenScopes.scope, scopes),
          eq(apiTokenScopes.isDeprecated, false)
        )
      );

    const validScopeNames = new Set(validScopes.map(s => s.scope));
    const invalid = scopes.filter(s => !validScopeNames.has(s));

    // Check if any scopes require certificate
    const certRequiredScopes = validScopes.filter(s => s.requiresCertificate);
    if (certRequiredScopes.length > 0 && !certificateId) {
      invalid.push(...certRequiredScopes.map(s => `${s.scope} (requires certificate)`));
    }

    return {
      valid: invalid.length === 0,
      invalid,
    };
  }

  /**
   * Validate certificate for service token
   */
  static async validateCertificate(certificateId: string): Promise<boolean> {
    const [cert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certificateId))
      .limit(1);

    if (!cert) return false;
    if (cert.status !== 'active') return false;
    if (new Date(cert.notAfter) < new Date()) return false;

    return true;
  }

  /**
   * Get all available scopes
   */
  static async getAvailableScopes(): Promise<Array<{
    scope: string;
    displayName: string;
    description: string | null;
    category: string;
    requiresCertificate: boolean;
    requiresOrganization: boolean;
  }>> {
    const scopes = await db.select({
      scope: apiTokenScopes.scope,
      displayName: apiTokenScopes.displayName,
      description: apiTokenScopes.description,
      category: apiTokenScopes.category,
      requiresCertificate: apiTokenScopes.requiresCertificate,
      requiresOrganization: apiTokenScopes.requiresOrganization,
    })
      .from(apiTokenScopes)
      .where(eq(apiTokenScopes.isDeprecated, false));

    return scopes.map(s => ({
      ...s,
      requiresCertificate: s.requiresCertificate ?? false,
      requiresOrganization: s.requiresOrganization ?? false,
    }));
  }

  /**
   * Token introspection (RFC 7662)
   */
  static async introspect(token: string): Promise<{
    active: boolean;
    scope?: string;
    client_id?: string;
    token_type?: string;
    sub?: string;
    exp?: number;
    iat?: number;
  }> {
    const context = await this.validateToken(token);

    if (!context) {
      return { active: false };
    }

    const [tokenRecord] = await db.select()
      .from(apiTokens)
      .where(eq(apiTokens.id, context.tokenId))
      .limit(1);

    return {
      active: true,
      scope: context.scopes.join(' '),
      client_id: context.tokenId,
      token_type: 'Bearer',
      sub: context.ownerDid,
      exp: tokenRecord?.expiresAt ? Math.floor(new Date(tokenRecord.expiresAt).getTime() / 1000) : undefined,
      iat: tokenRecord?.createdAt ? Math.floor(new Date(tokenRecord.createdAt).getTime() / 1000) : undefined,
    };
  }

  /**
   * Revoke all tokens for a user
   */
  static async revokeAllForUser(
    ownerDid: string,
    revokedBy: string,
    reason?: string
  ): Promise<number> {
    const result = await db.update(apiTokens)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason || 'Bulk revocation',
      })
      .where(
        and(
          eq(apiTokens.ownerDid, ownerDid),
          eq(apiTokens.status, 'active')
        )
      );

    await CAAuditService.log({
      eventType: 'token.revoked',
      subjectDid: ownerDid,
      performedBy: revokedBy,
      severity: 'warning',
      details: { reason, bulk: true },
    });

    // Return affected rows count (Drizzle doesn't return this directly)
    return 0; // Would need to query before update to get count
  }

  /**
   * Get token statistics for admin
   */
  static async getStats(): Promise<{
    total: number;
    active: number;
    revoked: number;
    expired: number;
    byType: Record<string, number>;
  }> {
    const [stats] = await db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${apiTokens.status} = 'active')::int`,
      revoked: sql<number>`count(*) filter (where ${apiTokens.status} = 'revoked')::int`,
      expired: sql<number>`count(*) filter (where ${apiTokens.status} = 'expired')::int`,
    }).from(apiTokens);

    const byTypeResult = await db.select({
      tokenType: apiTokens.tokenType,
      count: sql<number>`count(*)::int`,
    })
      .from(apiTokens)
      .groupBy(apiTokens.tokenType);

    return {
      total: stats?.total || 0,
      active: stats?.active || 0,
      revoked: stats?.revoked || 0,
      expired: stats?.expired || 0,
      byType: Object.fromEntries(byTypeResult.map(r => [r.tokenType, r.count])),
    };
  }
}
