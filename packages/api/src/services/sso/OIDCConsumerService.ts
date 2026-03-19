/**
 * OIDCConsumerService - OAuth2/OIDC Consumer for Social Login
 *
 * Handles:
 * - Social login with external providers (Google, Microsoft, GitHub, Apple, etc.)
 * - OAuth2 authorization code flow
 * - Token exchange and user info retrieval
 * - Identity linking with existing accounts
 */

import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  externalIdentityProviders,
  externalIdentities,
  oauthStates,
  users,
  ssoAuditLog,
} from '../../db/schema.js';
import { eq, and, isNull, lte } from 'drizzle-orm';
import crypto from 'crypto';

// Types
export interface ExternalProvider {
  id: string;
  name: string;
  type: 'oidc' | 'oauth2';
  providerKey: string;
  displayName: string;
  iconUrl?: string;
  buttonColor?: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  issuer?: string;
  scopes: string[];
  claimMapping?: Record<string, string>;
  domainId?: string;
  autoProvisionUsers: boolean;
  defaultRole: string;
  requiredEmailDomain?: string;
  status: string;
  priority: number;
  // Exprsn-specific fields
  allowedScopes?: string[];
  scopePolicy?: 'inherit' | 'restrict' | 'expand';
  roleMapping?: Record<string, string>;
  defaultAccountType?: 'personal' | 'creator' | 'business';
}

export interface ExternalIdentity {
  id: string;
  userDid: string;
  providerId: string;
  externalId: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  profileUrl?: string;
  linkedAt: Date;
  lastLoginAt?: Date;
}

export interface AuthorizationResult {
  authUrl: string;
  state: string;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
}

export interface ExternalUserInfo {
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
  raw: Record<string, unknown>;
}

// Provider configurations
const PROVIDER_CONFIGS: Record<string, Partial<ExternalProvider>> = {
  google: {
    displayName: 'Google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: 'https://accounts.google.com',
    scopes: ['openid', 'profile', 'email'],
    claimMapping: {
      id: 'sub',
      email: 'email',
      emailVerified: 'email_verified',
      name: 'name',
      givenName: 'given_name',
      familyName: 'family_name',
      picture: 'picture',
    },
  },
  microsoft: {
    displayName: 'Microsoft',
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
    issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
    scopes: ['openid', 'profile', 'email'],
    claimMapping: {
      id: 'sub',
      email: 'email',
      name: 'name',
      givenName: 'given_name',
      familyName: 'family_name',
      picture: 'picture',
    },
  },
  github: {
    displayName: 'GitHub',
    type: 'oauth2' as const,
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userinfoEndpoint: 'https://api.github.com/user',
    scopes: ['user:email', 'read:user'],
    claimMapping: {
      id: 'id',
      email: 'email',
      name: 'name',
      picture: 'avatar_url',
    },
  },
  apple: {
    displayName: 'Apple',
    authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
    tokenEndpoint: 'https://appleid.apple.com/auth/token',
    issuer: 'https://appleid.apple.com',
    scopes: ['openid', 'name', 'email'],
    claimMapping: {
      id: 'sub',
      email: 'email',
    },
  },
  discord: {
    displayName: 'Discord',
    type: 'oauth2' as const,
    authorizationEndpoint: 'https://discord.com/api/oauth2/authorize',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    userinfoEndpoint: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
    claimMapping: {
      id: 'id',
      email: 'email',
      name: 'username',
      picture: 'avatar',
    },
  },
  exprsn: {
    displayName: 'Exprsn',
    type: 'oidc' as const,
    // Endpoints are dynamically resolved from the issuer URL at registration time.
    // These path templates are appended to the configured issuer during discovery.
    authorizationEndpoint: '/sso/auth/authorize',
    tokenEndpoint: '/sso/auth/token',
    userinfoEndpoint: '/sso/auth/userinfo',
    jwksUri: '/sso/auth/.well-known/jwks.json',
    issuer: '', // Set from the remote instance URL at registration time
    scopes: ['openid', 'profile', 'email'],
    claimMapping: {
      id: 'sub',
      email: 'email',
      name: 'name',
      givenName: 'given_name',
      familyName: 'family_name',
      picture: 'picture',
    },
  },
};

class OIDCConsumerServiceImpl {
  private appUrl: string;
  private callbackPath: string;

  constructor() {
    this.appUrl = process.env.APP_URL || 'http://localhost:3002';
    this.callbackPath = '/sso/auth/callback';
  }

  // ==========================================
  // Provider Management
  // ==========================================

  /**
   * Register a new external identity provider
   */
  async registerProvider(config: {
    name: string;
    providerKey: string;
    clientId: string;
    clientSecret: string;
    type?: 'oidc' | 'oauth2';
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    userinfoEndpoint?: string;
    jwksUri?: string;
    issuer?: string;
    scopes?: string[];
    claimMapping?: Record<string, string>;
    displayName?: string;
    iconUrl?: string;
    buttonColor?: string;
    domainId?: string;
    autoProvisionUsers?: boolean;
    defaultRole?: string;
    requiredEmailDomain?: string;
    // Exprsn-specific
    allowedScopes?: string[];
    scopePolicy?: 'inherit' | 'restrict' | 'expand';
    roleMapping?: Record<string, string>;
    defaultAccountType?: 'personal' | 'creator' | 'business';
  }): Promise<ExternalProvider> {
    const id = nanoid();

    // Merge with known provider config if available
    const knownConfig = PROVIDER_CONFIGS[config.providerKey] || {};

    // Build jitConfig, merging Exprsn-specific fields when present
    const jitConfig: Record<string, unknown> = {};
    if (config.allowedScopes !== undefined) jitConfig.allowedScopes = config.allowedScopes;
    if (config.scopePolicy !== undefined) jitConfig.scopePolicy = config.scopePolicy;
    if (config.roleMapping !== undefined) jitConfig.roleMapping = config.roleMapping;
    if (config.defaultAccountType !== undefined) jitConfig.defaultAccountType = config.defaultAccountType;

    const [inserted] = await db
      .insert(externalIdentityProviders)
      .values({
        id,
        name: config.name,
        providerKey: config.providerKey,
        type: config.type || knownConfig.type || 'oidc',
        displayName: config.displayName || knownConfig.displayName || config.name,
        iconUrl: config.iconUrl,
        buttonColor: config.buttonColor,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authorizationEndpoint: config.authorizationEndpoint || knownConfig.authorizationEndpoint,
        tokenEndpoint: config.tokenEndpoint || knownConfig.tokenEndpoint,
        userinfoEndpoint: config.userinfoEndpoint || knownConfig.userinfoEndpoint,
        jwksUri: config.jwksUri || knownConfig.jwksUri,
        issuer: config.issuer || knownConfig.issuer,
        scopes: config.scopes || knownConfig.scopes || ['openid', 'profile', 'email'],
        claimMapping: config.claimMapping || knownConfig.claimMapping,
        domainId: config.domainId,
        autoProvisionUsers: config.autoProvisionUsers ?? true,
        defaultRole: config.defaultRole || 'member',
        requiredEmailDomain: config.requiredEmailDomain,
        jitConfig: Object.keys(jitConfig).length > 0 ? jitConfig : undefined,
        status: 'active',
      })
      .returning();

    return this.toProvider(inserted!);
  }

  /**
   * Get provider by ID
   */
  async getProvider(id: string): Promise<ExternalProvider | null> {
    const [provider] = await db
      .select()
      .from(externalIdentityProviders)
      .where(eq(externalIdentityProviders.id, id));

    return provider ? this.toProvider(provider) : null;
  }

  /**
   * Get provider by key
   */
  async getProviderByKey(providerKey: string, domainId?: string): Promise<ExternalProvider | null> {
    let query = db
      .select()
      .from(externalIdentityProviders)
      .where(
        and(
          eq(externalIdentityProviders.providerKey, providerKey),
          eq(externalIdentityProviders.status, 'active')
        )
      );

    if (domainId) {
      query = db
        .select()
        .from(externalIdentityProviders)
        .where(
          and(
            eq(externalIdentityProviders.providerKey, providerKey),
            eq(externalIdentityProviders.domainId, domainId),
            eq(externalIdentityProviders.status, 'active')
          )
        );
    }

    const [provider] = await query;
    return provider ? this.toProvider(provider) : null;
  }

  /**
   * List all available providers
   */
  async listProviders(domainId?: string): Promise<ExternalProvider[]> {
    let query = db
      .select()
      .from(externalIdentityProviders)
      .where(eq(externalIdentityProviders.status, 'active'))
      .orderBy(externalIdentityProviders.priority);

    if (domainId) {
      query = db
        .select()
        .from(externalIdentityProviders)
        .where(
          and(
            eq(externalIdentityProviders.status, 'active'),
            eq(externalIdentityProviders.domainId, domainId)
          )
        )
        .orderBy(externalIdentityProviders.priority);
    }

    const providers = await query;
    return providers.map((p) => this.toProvider(p));
  }

  /**
   * Update provider
   */
  async updateProvider(id: string, updates: Partial<ExternalProvider>): Promise<ExternalProvider | null> {
    const [updated] = await db
      .update(externalIdentityProviders)
      .set({
        name: updates.name,
        displayName: updates.displayName,
        iconUrl: updates.iconUrl,
        buttonColor: updates.buttonColor,
        clientId: updates.clientId,
        clientSecret: updates.clientSecret,
        authorizationEndpoint: updates.authorizationEndpoint,
        tokenEndpoint: updates.tokenEndpoint,
        userinfoEndpoint: updates.userinfoEndpoint,
        jwksUri: updates.jwksUri,
        issuer: updates.issuer,
        scopes: updates.scopes,
        claimMapping: updates.claimMapping,
        autoProvisionUsers: updates.autoProvisionUsers,
        defaultRole: updates.defaultRole,
        requiredEmailDomain: updates.requiredEmailDomain,
        status: updates.status,
        priority: updates.priority,
        updatedAt: new Date(),
      })
      .where(eq(externalIdentityProviders.id, id))
      .returning();

    return updated ? this.toProvider(updated) : null;
  }

  /**
   * Delete provider
   */
  async deleteProvider(id: string): Promise<boolean> {
    const result = await db
      .delete(externalIdentityProviders)
      .where(eq(externalIdentityProviders.id, id))
      .returning();

    return result.length > 0;
  }

  // ==========================================
  // OAuth2/OIDC Flow
  // ==========================================

  /**
   * Start authorization flow - returns URL to redirect user to
   */
  async startAuthorization(
    providerId: string,
    redirectAfter?: string,
    linkToUserDid?: string
  ): Promise<AuthorizationResult> {
    const provider = await this.getProvider(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    if (!provider.authorizationEndpoint) {
      throw new Error('Provider missing authorization endpoint');
    }

    // Generate state and nonce
    const state = nanoid(32);
    const nonce = nanoid(32);

    // Store state for validation
    await db.insert(oauthStates).values({
      state,
      providerId,
      nonce,
      redirectUri: redirectAfter, // Schema uses redirectUri
      userDid: linkToUserDid, // Schema uses userDid for linking
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    // Build authorization URL
    const authUrl = new URL(provider.authorizationEndpoint);
    authUrl.searchParams.set('client_id', provider.clientId);
    authUrl.searchParams.set('redirect_uri', `${this.appUrl}${this.callbackPath}`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', provider.scopes.join(' '));
    authUrl.searchParams.set('state', state);

    if (provider.type === 'oidc') {
      authUrl.searchParams.set('nonce', nonce);
    }

    // Provider-specific parameters
    if (provider.providerKey === 'google') {
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
    }

    if (provider.providerKey === 'exprsn' || provider.providerKey.startsWith('exprsn:')) {
      // Merge allowedScopes from provider config into the scope parameter
      if (provider.allowedScopes?.length) {
        const merged = Array.from(new Set([...provider.scopes, ...provider.allowedScopes]));
        authUrl.searchParams.set('scope', merged.join(' '));
      }
    }

    return { authUrl: authUrl.toString(), state };
  }

  /**
   * Handle OAuth callback - exchange code for tokens and get user info
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<{
    userInfo: ExternalUserInfo;
    provider: ExternalProvider;
    tokens: TokenExchangeResult;
    linkToUserDid?: string;
    redirectAfter?: string;
  }> {
    // Validate state
    const [stateRecord] = await db
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.state, state));

    if (!stateRecord) {
      throw new Error('Invalid or expired state');
    }

    if (new Date() > stateRecord.expiresAt) {
      await db.delete(oauthStates).where(eq(oauthStates.state, stateRecord.state));
      throw new Error('State expired');
    }

    // Delete state (one-time use)
    await db.delete(oauthStates).where(eq(oauthStates.state, stateRecord.state));

    // Get provider
    const provider = await this.getProvider(stateRecord.providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCode(provider, code);

    // Get user info
    const userInfo = await this.getUserInfo(provider, tokens.accessToken, tokens.idToken);

    return {
      userInfo,
      provider,
      tokens,
      linkToUserDid: stateRecord.userDid || undefined,
      redirectAfter: stateRecord.redirectUri || undefined,
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCode(provider: ExternalProvider, code: string): Promise<TokenExchangeResult> {
    if (!provider.tokenEndpoint) {
      throw new Error('Provider missing token endpoint');
    }

    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', `${this.appUrl}${this.callbackPath}`);
    params.set('client_id', provider.clientId);
    params.set('client_secret', provider.clientSecret);

    const response = await fetch(provider.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[OIDCConsumer] Token exchange failed:', error);
      throw new Error('Token exchange failed');
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    };
  }

  /**
   * Get user info from provider
   */
  private async getUserInfo(
    provider: ExternalProvider,
    accessToken: string,
    idToken?: string
  ): Promise<ExternalUserInfo> {
    // For OIDC, try to decode ID token first
    if (provider.type === 'oidc' && idToken) {
      try {
        const payload = this.decodeJwtPayload(idToken);
        return this.mapUserInfo(payload, provider.claimMapping);
      } catch (error) {
        console.warn('[OIDCConsumer] Failed to decode ID token, falling back to userinfo endpoint');
      }
    }

    // Fetch from userinfo endpoint
    if (provider.userinfoEndpoint) {
      const response = await fetch(provider.userinfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const data = (await response.json()) as Record<string, unknown>;

      // GitHub returns email separately
      if (provider.providerKey === 'github' && !data.email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });

        if (emailResponse.ok) {
          const emails = (await emailResponse.json()) as Array<{ email: string; primary: boolean }>;
          const primaryEmail = emails.find((e) => e.primary);
          if (primaryEmail) {
            data.email = primaryEmail.email;
          }
        }
      }

      return this.mapUserInfo(data, provider.claimMapping);
    }

    throw new Error('No way to get user info');
  }

  /**
   * Map provider user info to standard format
   */
  private mapUserInfo(
    data: Record<string, unknown>,
    mapping?: Record<string, string>
  ): ExternalUserInfo {
    const m = mapping || {};

    return {
      id: String(data[m.id || 'sub'] || data.id || data.sub),
      email: data[m.email || 'email'] as string | undefined,
      emailVerified: data[m.emailVerified || 'email_verified'] as boolean | undefined,
      name: data[m.name || 'name'] as string | undefined,
      givenName: data[m.givenName || 'given_name'] as string | undefined,
      familyName: data[m.familyName || 'family_name'] as string | undefined,
      picture: data[m.picture || 'picture'] as string | undefined,
      locale: data[m.locale || 'locale'] as string | undefined,
      raw: data,
    };
  }

  // ==========================================
  // Identity Management
  // ==========================================

  /**
   * Link external identity to user
   */
  async linkIdentity(
    userDid: string,
    provider: ExternalProvider,
    userInfo: ExternalUserInfo,
    tokens: TokenExchangeResult
  ): Promise<ExternalIdentity> {
    const id = nanoid();

    // Check if already linked
    const [existing] = await db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.providerId, provider.id),
          eq(externalIdentities.externalId, userInfo.id)
        )
      );

    if (existing) {
      // Update existing link
      const [updated] = await db
        .update(externalIdentities)
        .set({
          email: userInfo.email,
          displayName: userInfo.name,
          avatar: userInfo.picture,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000)
            : null,
          rawProfile: userInfo.raw,
          lastLoginAt: new Date(),
        })
        .where(eq(externalIdentities.id, existing.id))
        .returning();

      // Log audit event
      await this.logAuditEvent('external_login', userDid, provider.id, true, {
        externalId: userInfo.id,
        email: userInfo.email,
      });

      return this.toIdentity(updated!);
    }

    // Create new link
    const [inserted] = await db
      .insert(externalIdentities)
      .values({
        id,
        userDid,
        providerId: provider.id,
        externalId: userInfo.id,
        email: userInfo.email,
        displayName: userInfo.name,
        avatar: userInfo.picture,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : null,
        rawProfile: userInfo.raw,
        lastLoginAt: new Date(),
      })
      .returning();

    await this.logAuditEvent('identity_link', userDid, provider.id, true, {
      externalId: userInfo.id,
      email: userInfo.email,
    });

    return this.toIdentity(inserted!);
  }

  /**
   * Find user by external identity
   */
  async findUserByExternalId(
    providerId: string,
    externalId: string
  ): Promise<ExternalIdentity | null> {
    const [identity] = await db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.providerId, providerId),
          eq(externalIdentities.externalId, externalId)
        )
      );

    return identity ? this.toIdentity(identity) : null;
  }

  /**
   * Find user by email across providers
   */
  async findUserByEmail(email: string): Promise<ExternalIdentity | null> {
    const [identity] = await db
      .select()
      .from(externalIdentities)
      .where(eq(externalIdentities.email, email));

    return identity ? this.toIdentity(identity) : null;
  }

  /**
   * Get user's linked identities
   */
  async getUserIdentities(userDid: string): Promise<Array<{
    identity: ExternalIdentity;
    provider: ExternalProvider;
  }>> {
    const identities = await db
      .select({
        identity: externalIdentities,
        provider: externalIdentityProviders,
      })
      .from(externalIdentities)
      .innerJoin(
        externalIdentityProviders,
        eq(externalIdentities.providerId, externalIdentityProviders.id)
      )
      .where(eq(externalIdentities.userDid, userDid));

    return identities.map((i) => ({
      identity: this.toIdentity(i.identity),
      provider: this.toProvider(i.provider),
    }));
  }

  /**
   * Unlink external identity
   */
  async unlinkIdentity(userDid: string, providerId: string): Promise<boolean> {
    const result = await db
      .delete(externalIdentities)
      .where(
        and(
          eq(externalIdentities.userDid, userDid),
          eq(externalIdentities.providerId, providerId)
        )
      )
      .returning();

    if (result.length > 0) {
      await this.logAuditEvent('identity_unlink', userDid, providerId, true);
      return true;
    }

    return false;
  }

  // ==========================================
  // Cleanup
  // ==========================================

  /**
   * Clean up expired OAuth states
   */
  async cleanupExpiredStates(): Promise<number> {
    const result = await db
      .delete(oauthStates)
      .where(lte(oauthStates.expiresAt, new Date()))
      .returning();

    return result.length;
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private toProvider(p: typeof externalIdentityProviders.$inferSelect): ExternalProvider {
    const jit = (p.jitConfig as Record<string, unknown> | null) || {};

    return {
      id: p.id,
      name: p.name,
      type: (p.type as 'oidc' | 'oauth2') || 'oidc',
      providerKey: p.providerKey,
      displayName: p.displayName,
      iconUrl: p.iconUrl || undefined,
      buttonColor: p.buttonColor || undefined,
      clientId: p.clientId || '',
      clientSecret: p.clientSecret || '',
      authorizationEndpoint: p.authorizationEndpoint || '',
      tokenEndpoint: p.tokenEndpoint || '',
      userinfoEndpoint: p.userinfoEndpoint || undefined,
      jwksUri: p.jwksUri || undefined,
      issuer: p.issuer || undefined,
      scopes: (p.scopes as string[]) || ['openid', 'profile', 'email'],
      claimMapping: (p.claimMapping as Record<string, string>) || undefined,
      domainId: p.domainId || undefined,
      autoProvisionUsers: p.autoProvisionUsers ?? true,
      defaultRole: p.defaultRole || 'member',
      requiredEmailDomain: p.requiredEmailDomain || undefined,
      status: p.status || 'active',
      priority: p.priority || 0,
      // Exprsn-specific fields stored in jitConfig
      allowedScopes: Array.isArray(jit.allowedScopes) ? (jit.allowedScopes as string[]) : undefined,
      scopePolicy: (jit.scopePolicy as 'inherit' | 'restrict' | 'expand') || undefined,
      roleMapping: jit.roleMapping ? (jit.roleMapping as Record<string, string>) : undefined,
      defaultAccountType: (jit.defaultAccountType as 'personal' | 'creator' | 'business') || undefined,
    };
  }

  private toIdentity(i: typeof externalIdentities.$inferSelect): ExternalIdentity {
    return {
      id: i.id,
      userDid: i.userDid,
      providerId: i.providerId,
      externalId: i.externalId,
      email: i.email || undefined,
      displayName: i.displayName || undefined,
      avatar: i.avatar || undefined,
      profileUrl: i.profileUrl || undefined,
      linkedAt: i.linkedAt,
      lastLoginAt: i.lastLoginAt || undefined,
    };
  }

  private decodeJwtPayload(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT');
    }
    const payload = parts[1];
    if (!payload) {
      throw new Error('Invalid JWT payload');
    }
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  }

  private async logAuditEvent(
    eventType: string,
    userDid: string,
    providerId: string,
    success: boolean,
    details?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.insert(ssoAuditLog).values({
        id: nanoid(),
        eventType,
        userDid,
        providerId,
        success,
        details: details || {},
        errorMessage,
      });
    } catch (error) {
      console.error('[OIDCConsumer] Failed to log audit event:', error);
    }
  }
}

// Export singleton instance
export const OIDCConsumerService = new OIDCConsumerServiceImpl();

// Export class for testing
export { OIDCConsumerServiceImpl };
