/**
 * OIDCProviderService - OAuth2/OIDC Provider Implementation
 *
 * Handles:
 * - Authorization code flow with PKCE
 * - Token issuance (access, refresh, ID tokens)
 * - Client management
 * - User consent management
 * - Token introspection and revocation
 * - UserInfo endpoint
 */

import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  oauthClients,
  oauthAuthorizationCodes,
  oauthTokens,
  oauthConsents,
  users,
  actorRepos,
  ssoAuditLog,
} from '../../db/schema.js';
import { eq, and, or, lte, isNull } from 'drizzle-orm';
import { JWTService } from './JWTService.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Types
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  prompt?: string;
  maxAge?: number;
  loginHint?: string;
}

export interface TokenRequest {
  grantType: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  scope?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

export interface UserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  updated_at?: number;
}

export interface ClientRegistration {
  clientName: string;
  clientUri?: string;
  logoUri?: string;
  redirectUris: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  applicationType?: string;
  contacts?: string[];
  tosUri?: string;
  policyUri?: string;
  requirePkce?: boolean;
  tokenEndpointAuthMethod?: string;
  domainId?: string;
  organizationId?: string;
  ownerDid?: string;
}

export interface IntrospectionResponse {
  active: boolean;
  sub?: string;
  client_id?: string;
  scope?: string;
  exp?: number;
  iat?: number;
  token_type?: string;
}

class OIDCProviderServiceImpl {
  private readonly AUTH_CODE_TTL_SECONDS = 600; // 10 minutes
  private readonly DEFAULT_ACCESS_TOKEN_TTL = 3600; // 1 hour
  private readonly DEFAULT_REFRESH_TOKEN_TTL = 2592000; // 30 days

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    await JWTService.initialize();
  }

  // ==========================================
  // Client Management
  // ==========================================

  /**
   * Register a new OAuth client
   */
  async registerClient(registration: ClientRegistration): Promise<{
    clientId: string;
    clientSecret?: string;
    client: typeof oauthClients.$inferSelect;
  }> {
    const clientId = `client_${nanoid(24)}`;
    const id = nanoid();

    // Generate client secret for confidential clients
    let clientSecret: string | undefined;
    let clientSecretHash: string | null = null;

    const isPublicClient =
      registration.applicationType === 'native' ||
      registration.applicationType === 'spa' ||
      registration.tokenEndpointAuthMethod === 'none';

    if (!isPublicClient) {
      clientSecret = `secret_${nanoid(48)}`;
      clientSecretHash = await bcrypt.hash(clientSecret, 10);
    }

    const [client] = await db
      .insert(oauthClients)
      .values({
        id,
        clientId,
        clientSecretHash,
        clientName: registration.clientName,
        clientUri: registration.clientUri,
        logoUri: registration.logoUri,
        clientType: isPublicClient ? 'public' : 'confidential',
        applicationType: registration.applicationType || 'web',
        redirectUris: registration.redirectUris,
        grantTypes: registration.grantTypes || ['authorization_code', 'refresh_token'],
        responseTypes: registration.responseTypes || ['code'],
        tokenEndpointAuthMethod: registration.tokenEndpointAuthMethod || 'client_secret_basic',
        requirePkce: registration.requirePkce ?? true,
        contacts: registration.contacts,
        tosUri: registration.tosUri,
        policyUri: registration.policyUri,
        domainId: registration.domainId,
        organizationId: registration.organizationId,
        ownerDid: registration.ownerDid,
        status: 'active',
      })
      .returning();

    return { clientId, clientSecret, client: client! };
  }

  /**
   * Get client by client_id
   */
  async getClient(clientId: string): Promise<typeof oauthClients.$inferSelect | null> {
    const [client] = await db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId));

    return client || null;
  }

  /**
   * Validate client credentials
   */
  async validateClientCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<typeof oauthClients.$inferSelect | null> {
    const client = await this.getClient(clientId);

    if (!client || client.status !== 'active') {
      return null;
    }

    if (client.clientType === 'public') {
      return null; // Public clients can't use client_secret
    }

    if (!client.clientSecretHash) {
      return null;
    }

    const valid = await bcrypt.compare(clientSecret, client.clientSecretHash);
    return valid ? client : null;
  }

  /**
   * Validate redirect URI for a client
   */
  validateRedirectUri(client: typeof oauthClients.$inferSelect, redirectUri: string): boolean {
    const allowedUris = client.redirectUris as string[];
    return allowedUris.includes(redirectUri);
  }

  // ==========================================
  // Authorization Code Flow
  // ==========================================

  /**
   * Create an authorization code
   */
  async createAuthorizationCode(
    userDid: string,
    request: AuthorizationRequest
  ): Promise<string> {
    const code = `code_${nanoid(48)}`;

    await db.insert(oauthAuthorizationCodes).values({
      code,
      clientId: request.clientId,
      userDid,
      redirectUri: request.redirectUri,
      scope: request.scope,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      nonce: request.nonce,
      state: request.state,
      expiresAt: new Date(Date.now() + this.AUTH_CODE_TTL_SECONDS * 1000),
    });

    return code;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenResponse | null> {
    // Get the authorization code
    const [authCode] = await db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code, code));

    if (!authCode) {
      return null;
    }

    // Validate the code
    if (authCode.clientId !== clientId) {
      return null;
    }

    if (authCode.redirectUri !== redirectUri) {
      return null;
    }

    if (authCode.usedAt) {
      // Code replay attack - revoke all tokens for this code
      console.warn(`[OIDC] Authorization code replay detected: ${code}`);
      return null;
    }

    if (new Date() > authCode.expiresAt) {
      return null;
    }

    // Validate PKCE if code challenge was present
    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        return null;
      }

      const valid = this.validateCodeVerifier(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || 'S256'
      );

      if (!valid) {
        return null;
      }
    }

    // Mark code as used
    await db
      .update(oauthAuthorizationCodes)
      .set({ usedAt: new Date() })
      .where(eq(oauthAuthorizationCodes.code, code));

    // Get client for token TTL settings
    const client = await this.getClient(clientId);
    if (!client) {
      return null;
    }

    // Generate tokens
    return this.issueTokens(
      authCode.userDid,
      clientId,
      authCode.scope,
      authCode.nonce || undefined,
      client
    );
  }

  /**
   * Refresh an access token
   */
  async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    requestedScope?: string
  ): Promise<TokenResponse | null> {
    const refreshTokenHash = this.hashToken(refreshToken);

    const [tokenRecord] = await db
      .select()
      .from(oauthTokens)
      .where(
        and(
          eq(oauthTokens.refreshTokenHash, refreshTokenHash),
          eq(oauthTokens.clientId, clientId),
          isNull(oauthTokens.revokedAt)
        )
      );

    if (!tokenRecord) {
      return null;
    }

    if (
      tokenRecord.refreshTokenExpiresAt &&
      new Date() > tokenRecord.refreshTokenExpiresAt
    ) {
      return null;
    }

    // Validate scope (can only request same or subset of original scope)
    let scope = tokenRecord.scope;
    if (requestedScope) {
      const originalScopes = new Set(tokenRecord.scope.split(' '));
      const requestedScopes = requestedScope.split(' ');
      const validScopes = requestedScopes.filter((s) => originalScopes.has(s));
      scope = validScopes.join(' ');
    }

    // Get client for settings
    const client = await this.getClient(clientId);
    if (!client) {
      return null;
    }

    // Revoke old token record
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date(), revocationReason: 'refreshed' })
      .where(eq(oauthTokens.id, tokenRecord.id));

    // Issue new tokens
    return this.issueTokens(tokenRecord.userDid, clientId, scope, undefined, client);
  }

  /**
   * Issue tokens (internal helper)
   */
  private async issueTokens(
    userDid: string,
    clientId: string,
    scope: string,
    nonce?: string,
    client?: typeof oauthClients.$inferSelect
  ): Promise<TokenResponse> {
    const accessTokenTtl = client?.accessTokenTtlSeconds || this.DEFAULT_ACCESS_TOKEN_TTL;
    const refreshTokenTtl = client?.refreshTokenTtlSeconds || this.DEFAULT_REFRESH_TOKEN_TTL;
    const idTokenTtl = client?.idTokenTtlSeconds || 3600;

    // Create access token
    const { token: accessToken, jti } = await JWTService.createAccessToken(
      userDid,
      clientId,
      scope,
      accessTokenTtl
    );

    // Create refresh token
    const refreshToken = JWTService.createRefreshToken();

    // Create ID token if openid scope is present
    let idToken: string | undefined;
    const scopes = scope.split(' ');
    if (scopes.includes('openid')) {
      const user = await this.getUserForClaims(userDid);
      const claims = this.buildIdTokenClaims(user, scopes, nonce);
      claims.at_hash = JWTService.computeAtHash(accessToken);
      idToken = await JWTService.createIdToken({
        sub: userDid,
        aud: clientId,
        exp: Math.floor(Date.now() / 1000) + idTokenTtl,
        ...claims,
      });
    }

    // Store token record
    const tokenId = nanoid();
    await db.insert(oauthTokens).values({
      id: tokenId,
      clientId,
      userDid,
      accessTokenHash: this.hashToken(accessToken),
      refreshTokenHash: this.hashToken(refreshToken),
      scope,
      accessTokenExpiresAt: new Date(Date.now() + accessTokenTtl * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + refreshTokenTtl * 1000),
    });

    // Log the token issuance
    await this.logAuditEvent('token_issue', userDid, clientId, true, {
      scopes: scope,
      tokenId,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTokenTtl,
      refresh_token: refreshToken,
      id_token: idToken,
      scope,
    };
  }

  /**
   * Issue tokens for client credentials grant (machine-to-machine)
   * No user is involved - the client authenticates as itself
   *
   * Note: Client credentials tokens are stateless JWTs and are not persisted
   * to the oauthTokens table (which requires a valid user reference).
   * The JWT signature provides authenticity verification.
   */
  async issueClientCredentialsToken(
    client: typeof oauthClients.$inferSelect,
    requestedScope?: string
  ): Promise<TokenResponse> {
    const accessTokenTtl = client.accessTokenTtlSeconds || this.DEFAULT_ACCESS_TOKEN_TTL;

    // Validate and filter requested scopes against client's allowed scopes
    // allowedScopes is already an array
    const allowedScopes = client.allowedScopes || [];
    let grantedScopes: string[];

    if (requestedScope) {
      const requested = requestedScope.split(' ').filter(Boolean);
      grantedScopes = requested.filter((s) => allowedScopes.includes(s));
      if (grantedScopes.length === 0) {
        // No valid scopes requested, use client's default scopes
        grantedScopes = allowedScopes;
      }
    } else {
      grantedScopes = allowedScopes;
    }

    const scope = grantedScopes.join(' ');

    // Use client ID as the subject (sub) for client credentials tokens
    const clientSub = `client:${client.id}`;

    // Create access token with client ID as subject (no user)
    const { token: accessToken } = await JWTService.createAccessToken(
      clientSub, // Use client: prefix to indicate this is a client token
      client.id,
      scope,
      accessTokenTtl
    );

    // Log the token issuance (no user DID for audit, just note it's a client grant)
    await this.logAuditEvent('token_issue', undefined, client.id, true, {
      grantType: 'client_credentials',
      clientSub,
      scopes: scope,
    });

    // Client credentials grant does not include refresh_token or id_token
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTokenTtl,
      scope,
    };
  }

  // ==========================================
  // Token Introspection & Revocation
  // ==========================================

  /**
   * Introspect a token (RFC 7662)
   */
  async introspectToken(token: string): Promise<IntrospectionResponse> {
    // Try to verify as JWT access token
    const claims = await JWTService.verifyAccessToken(token);

    if (claims) {
      // Check if revoked
      const tokenHash = this.hashToken(token);
      const [tokenRecord] = await db
        .select()
        .from(oauthTokens)
        .where(eq(oauthTokens.accessTokenHash, tokenHash));

      if (tokenRecord?.revokedAt) {
        return { active: false };
      }

      return {
        active: true,
        sub: claims.sub,
        client_id: claims.client_id,
        scope: claims.scope,
        exp: claims.exp,
        iat: claims.iat,
        token_type: 'Bearer',
      };
    }

    // Try as refresh token
    const refreshTokenHash = this.hashToken(token);
    const [refreshRecord] = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.refreshTokenHash, refreshTokenHash));

    if (refreshRecord && !refreshRecord.revokedAt) {
      if (
        refreshRecord.refreshTokenExpiresAt &&
        new Date() < refreshRecord.refreshTokenExpiresAt
      ) {
        return {
          active: true,
          sub: refreshRecord.userDid,
          client_id: refreshRecord.clientId,
          scope: refreshRecord.scope,
          token_type: 'refresh_token',
        };
      }
    }

    return { active: false };
  }

  /**
   * Revoke a token (RFC 7009)
   */
  async revokeToken(
    token: string,
    tokenTypeHint?: string,
    revokedBy?: string
  ): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    // Try to find and revoke
    const updateResult = await db
      .update(oauthTokens)
      .set({
        revokedAt: new Date(),
        revokedBy,
        revocationReason: 'user_revoked',
      })
      .where(
        or(
          eq(oauthTokens.accessTokenHash, tokenHash),
          eq(oauthTokens.refreshTokenHash, tokenHash)
        )
      )
      .returning();

    const revokedToken = updateResult[0];
    if (revokedToken) {
      await this.logAuditEvent(
        'token_revoke',
        revokedToken.userDid,
        revokedToken.clientId,
        true,
        { tokenId: revokedToken.id }
      );
      return true;
    }

    return false;
  }

  // ==========================================
  // UserInfo
  // ==========================================

  /**
   * Get user info for an access token
   */
  async getUserInfo(accessToken: string): Promise<UserInfo | null> {
    const claims = await JWTService.verifyAccessToken(accessToken);

    if (!claims) {
      return null;
    }

    // Check if revoked
    const tokenHash = this.hashToken(accessToken);
    const [tokenRecord] = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.accessTokenHash, tokenHash));

    if (tokenRecord?.revokedAt) {
      return null;
    }

    const userData = await this.getUserForClaims(claims.sub);
    if (!userData) {
      return null;
    }

    const scopes = claims.scope.split(' ');
    return this.buildUserInfo(userData, scopes);
  }

  // ==========================================
  // Consent Management
  // ==========================================

  /**
   * Get or create user consent for a client
   */
  async getConsent(
    userDid: string,
    clientId: string
  ): Promise<typeof oauthConsents.$inferSelect | null> {
    const [consent] = await db
      .select()
      .from(oauthConsents)
      .where(
        and(
          eq(oauthConsents.userDid, userDid),
          eq(oauthConsents.clientId, clientId),
          isNull(oauthConsents.revokedAt)
        )
      );

    return consent || null;
  }

  /**
   * Grant consent for scopes
   */
  async grantConsent(
    userDid: string,
    clientId: string,
    scopes: string[]
  ): Promise<typeof oauthConsents.$inferSelect> {
    const existing = await this.getConsent(userDid, clientId);

    if (existing) {
      // Update existing consent with new scopes
      const existingScopes = new Set(existing.scopes as string[]);
      scopes.forEach((s) => existingScopes.add(s));

      const [updated] = await db
        .update(oauthConsents)
        .set({
          scopes: Array.from(existingScopes),
          updatedAt: new Date(),
        })
        .where(eq(oauthConsents.id, existing.id))
        .returning();

      await this.logAuditEvent('consent_grant', userDid, clientId, true, {
        scopes: Array.from(existingScopes),
      });

      return updated!;
    }

    // Create new consent
    const [consent] = await db
      .insert(oauthConsents)
      .values({
        id: nanoid(),
        userDid,
        clientId,
        scopes,
      })
      .returning();

    await this.logAuditEvent('consent_grant', userDid, clientId, true, { scopes });

    return consent!;
  }

  /**
   * Revoke consent for a client
   */
  async revokeConsent(userDid: string, clientId: string): Promise<boolean> {
    const result = await db
      .update(oauthConsents)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthConsents.userDid, userDid),
          eq(oauthConsents.clientId, clientId),
          isNull(oauthConsents.revokedAt)
        )
      )
      .returning();

    if (result.length > 0) {
      // Also revoke all tokens for this client
      await db
        .update(oauthTokens)
        .set({ revokedAt: new Date(), revocationReason: 'consent_revoked' })
        .where(
          and(
            eq(oauthTokens.userDid, userDid),
            eq(oauthTokens.clientId, clientId),
            isNull(oauthTokens.revokedAt)
          )
        );

      await this.logAuditEvent('consent_revoke', userDid, clientId, true);
      return true;
    }

    return false;
  }

  /**
   * Check if user has consented to required scopes
   */
  async hasConsent(
    userDid: string,
    clientId: string,
    requiredScopes: string[]
  ): Promise<boolean> {
    const consent = await this.getConsent(userDid, clientId);

    if (!consent) {
      return false;
    }

    const grantedScopes = new Set(consent.scopes as string[]);
    return requiredScopes.every((scope) => grantedScopes.has(scope));
  }

  /**
   * List user's authorized applications
   */
  async listAuthorizedApps(
    userDid: string
  ): Promise<
    Array<{
      client: typeof oauthClients.$inferSelect;
      consent: typeof oauthConsents.$inferSelect;
    }>
  > {
    const consents = await db
      .select()
      .from(oauthConsents)
      .where(
        and(eq(oauthConsents.userDid, userDid), isNull(oauthConsents.revokedAt))
      );

    const results = [];
    for (const consent of consents) {
      const client = await this.getClient(consent.clientId);
      if (client) {
        results.push({ client, consent });
      }
    }

    return results;
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private validateCodeVerifier(
    verifier: string,
    challenge: string,
    method: string
  ): boolean {
    if (method === 'plain') {
      return verifier === challenge;
    }

    if (method === 'S256') {
      const hash = crypto.createHash('sha256').update(verifier).digest();
      const computed = hash
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return computed === challenge;
    }

    return false;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async getUserForClaims(
    userDid: string
  ): Promise<{
    user: typeof users.$inferSelect;
    email?: string;
    emailVerified?: boolean;
  } | null> {
    const [user] = await db.select().from(users).where(eq(users.did, userDid));
    if (!user) {
      return null;
    }

    // Get email from actorRepos if available
    const [actor] = await db.select().from(actorRepos).where(eq(actorRepos.did, userDid));

    return {
      user,
      email: actor?.email || undefined,
      emailVerified: actor?.email ? true : false, // Assume verified if present
    };
  }

  private buildIdTokenClaims(
    userData: { user: typeof users.$inferSelect; email?: string; emailVerified?: boolean } | null,
    scopes: string[],
    nonce?: string
  ): Partial<{
    name: string;
    given_name: string;
    family_name: string;
    preferred_username: string;
    picture: string;
    email: string;
    email_verified: boolean;
    updated_at: number;
    nonce: string;
    auth_time: number;
    at_hash: string;
  }> {
    const claims: Record<string, unknown> = {};

    if (nonce) {
      claims.nonce = nonce;
    }

    claims.auth_time = Math.floor(Date.now() / 1000);

    if (!userData) {
      return claims;
    }

    const { user, email, emailVerified } = userData;

    if (scopes.includes('profile')) {
      claims.name = user.displayName;
      claims.preferred_username = user.handle;
      claims.picture = user.avatar;
      if (user.updatedAt) {
        claims.updated_at = Math.floor(user.updatedAt.getTime() / 1000);
      }
    }

    if (scopes.includes('email')) {
      claims.email = email;
      claims.email_verified = emailVerified || false;
    }

    return claims;
  }

  private buildUserInfo(
    userData: { user: typeof users.$inferSelect; email?: string; emailVerified?: boolean },
    scopes: string[]
  ): UserInfo {
    const { user, email, emailVerified } = userData;
    const info: UserInfo = {
      sub: user.did,
    };

    if (scopes.includes('profile')) {
      info.name = user.displayName || undefined;
      info.preferred_username = user.handle;
      info.picture = user.avatar || undefined;
      if (user.updatedAt) {
        info.updated_at = Math.floor(user.updatedAt.getTime() / 1000);
      }
    }

    if (scopes.includes('email')) {
      info.email = email;
      info.email_verified = emailVerified || false;
    }

    return info;
  }

  private async logAuditEvent(
    eventType: string,
    userDid: string | undefined,
    clientId: string,
    success: boolean,
    details?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.insert(ssoAuditLog).values({
        id: nanoid(),
        eventType,
        userDid,
        clientId,
        success,
        details: details || {},
        errorMessage,
      });
    } catch (error) {
      console.error('[OIDC] Failed to log audit event:', error);
    }
  }

  // ==========================================
  // Cleanup
  // ==========================================

  /**
   * Clean up expired authorization codes and tokens
   */
  async cleanupExpired(): Promise<{ codes: number; tokens: number }> {
    const now = new Date();

    // Delete expired authorization codes
    const deletedCodes = await db
      .delete(oauthAuthorizationCodes)
      .where(lte(oauthAuthorizationCodes.expiresAt, now))
      .returning();

    // Delete expired and revoked tokens (keep for audit for 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deletedTokens = await db
      .delete(oauthTokens)
      .where(
        and(
          lte(oauthTokens.accessTokenExpiresAt, thirtyDaysAgo),
          or(
            isNull(oauthTokens.refreshTokenExpiresAt),
            lte(oauthTokens.refreshTokenExpiresAt, thirtyDaysAgo)
          )
        )
      )
      .returning();

    return {
      codes: deletedCodes.length,
      tokens: deletedTokens.length,
    };
  }
}

// Export singleton instance
export const OIDCProviderService = new OIDCProviderServiceImpl();

// Export class for testing
export { OIDCProviderServiceImpl };
