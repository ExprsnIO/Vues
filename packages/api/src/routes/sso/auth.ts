/**
 * SSO Authentication Routes
 * Handles social login, OAuth flows, and identity management
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { OIDCConsumerService } from '../../services/sso/OIDCConsumerService.js';
import { OIDCProviderService } from '../../services/sso/OIDCProviderService.js';
import { DomainSSOService } from '../../services/sso/DomainSSOService.js';
import { JWTService } from '../../services/sso/JWTService.js';
import { db } from '../../db/index.js';
import { users, actorRepos } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateKeyPair } from '../../services/ca/crypto.js';
import { optionalAuthMiddleware } from '../../auth/middleware.js';
import type { TokenExchangeResult, ExternalUserInfo, ExternalProvider } from '../../services/sso/OIDCConsumerService.js';

const ssoAuth = new Hono();

// ==========================================
// Social Login / External Providers
// ==========================================

/**
 * Get available login providers
 */
ssoAuth.get('/providers', async (c) => {
  const domainId = c.req.query('domainId');
  const providers = await OIDCConsumerService.listProviders(domainId);

  return c.json({
    providers: providers.map((p) => ({
      id: p.id,
      name: p.displayName,
      providerKey: p.providerKey,
      iconUrl: p.iconUrl,
      buttonColor: p.buttonColor,
    })),
  });
});

/**
 * Start social login flow
 */
ssoAuth.get('/login/:providerKey', async (c) => {
  const { providerKey } = c.req.param();
  const domainId = c.req.query('domainId');
  const redirectAfter = c.req.query('redirect') || '/';
  const linkToUser = c.req.query('linkTo'); // For account linking

  // Find provider
  const provider = await OIDCConsumerService.getProviderByKey(providerKey, domainId);
  if (!provider) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  // Start authorization
  const { authUrl, state } = await OIDCConsumerService.startAuthorization(
    provider.id,
    redirectAfter,
    linkToUser
  );

  // Store state in cookie for CSRF protection
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return c.redirect(authUrl);
});

/**
 * OAuth callback handler
 */
ssoAuth.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  // Handle OAuth errors
  if (error) {
    console.error(`[SSO] OAuth error: ${error} - ${errorDescription}`);
    return c.redirect(`/login?error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code || !state) {
    return c.redirect('/login?error=missing_parameters');
  }

  // Verify state
  const storedState = getCookie(c, 'oauth_state');
  if (state !== storedState) {
    return c.redirect('/login?error=invalid_state');
  }

  // Clear state cookie
  deleteCookie(c, 'oauth_state');

  try {
    // Exchange code for tokens and get user info
    const result = await OIDCConsumerService.handleCallback(code, state);

    // Check if this is account linking
    if (result.linkToUserDid) {
      // Link external identity to existing user
      await OIDCConsumerService.linkIdentity(
        result.linkToUserDid,
        result.provider,
        result.userInfo,
        result.tokens
      );

      return c.redirect(result.redirectAfter || '/settings/connections?linked=true');
    }

    // Check if user already exists with this external identity
    const existingIdentity = await OIDCConsumerService.findUserByExternalId(
      result.provider.id,
      result.userInfo.id
    );

    let userDid: string;

    if (existingIdentity) {
      // Existing user - update last login
      userDid = existingIdentity.userDid;
      await OIDCConsumerService.linkIdentity(
        userDid,
        result.provider,
        result.userInfo,
        result.tokens
      );
    } else if (result.userInfo.email) {
      // Check for existing user by email
      const [existingUser] = await db
        .select()
        .from(actorRepos)
        .where(eq(actorRepos.email, result.userInfo.email));

      if (existingUser) {
        // Email collision - prompt for account linking
        return c.redirect(
          `/login?error=email_exists&email=${encodeURIComponent(result.userInfo.email)}&provider=${result.provider.providerKey}`
        );
      }

      // Check if JIT provisioning is allowed
      if (!result.provider.autoProvisionUsers) {
        return c.redirect('/login?error=registration_disabled');
      }

      // Create new user
      userDid = await createUserFromExternalIdentity(
        result.userInfo,
        result.provider,
        result.tokens
      );
    } else {
      // No email - can't create user
      return c.redirect('/login?error=email_required');
    }

    // Create session
    const sessionToken = await createSession(userDid);

    // Set session cookie
    setCookie(c, 'session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return c.redirect(result.redirectAfter || '/');
  } catch (error) {
    console.error('[SSO] Callback error:', error);
    return c.redirect('/login?error=callback_failed');
  }
});

/**
 * Link external account to current user
 */
ssoAuth.post('/link/:providerKey', async (c) => {
  const { providerKey } = c.req.param();
  const userDid = c.get('userDid'); // From auth middleware

  if (!userDid) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const provider = await OIDCConsumerService.getProviderByKey(providerKey);
  if (!provider) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  // Start authorization with linking flag
  const { authUrl, state } = await OIDCConsumerService.startAuthorization(
    provider.id,
    '/settings/connections',
    userDid
  );

  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 600,
    path: '/',
  });

  return c.json({ authUrl });
});

/**
 * Unlink external account
 */
ssoAuth.delete('/link/:providerId', async (c) => {
  const { providerId } = c.req.param();
  const userDid = c.get('userDid');

  if (!userDid) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  // Check that user has other login methods
  const identities = await OIDCConsumerService.getUserIdentities(userDid);
  const [actor] = await db.select().from(actorRepos).where(eq(actorRepos.did, userDid));

  if (identities.length <= 1 && !actor?.passwordHash) {
    throw new HTTPException(400, {
      message: 'Cannot unlink last login method',
    });
  }

  const unlinked = await OIDCConsumerService.unlinkIdentity(userDid, providerId);

  if (!unlinked) {
    throw new HTTPException(404, { message: 'Identity not found' });
  }

  return c.json({ success: true });
});

/**
 * Get user's linked accounts
 */
ssoAuth.get('/linked', async (c) => {
  const userDid = c.get('userDid');

  if (!userDid) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const identities = await OIDCConsumerService.getUserIdentities(userDid);

  return c.json({
    identities: identities.map(({ identity, provider }) => ({
      providerId: provider.id,
      providerName: provider.displayName,
      providerKey: provider.providerKey,
      iconUrl: provider.iconUrl,
      email: identity.email,
      displayName: identity.displayName,
      linkedAt: identity.linkedAt,
      lastLoginAt: identity.lastLoginAt,
    })),
  });
});

// ==========================================
// SSO Discovery
// ==========================================

/**
 * Check SSO requirements for email/domain
 */
ssoAuth.post('/discover', async (c) => {
  const { email, domainId } = await c.req.json<{ email: string; domainId?: string }>();

  if (!email) {
    throw new HTTPException(400, { message: 'Email is required' });
  }

  const ssoRequired = await DomainSSOService.isSSORequired(email, domainId);

  return c.json({
    ssoRequired: ssoRequired.required,
    provider: ssoRequired.provider,
  });
});

/**
 * Get SSO status for a domain
 */
ssoAuth.get('/domain/:domainId/status', async (c) => {
  const { domainId } = c.req.param();

  const status = await DomainSSOService.getSSOStatus(domainId);
  if (!status) {
    throw new HTTPException(404, { message: 'Domain not found' });
  }

  return c.json(status);
});

// ==========================================
// Session Management
// ==========================================

/**
 * Get current user info
 */
ssoAuth.get('/me', async (c) => {
  const userDid = c.get('userDid');

  if (!userDid) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const [user] = await db.select().from(users).where(eq(users.did, userDid));

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({
    did: user.did,
    handle: user.handle,
    displayName: user.displayName,
    avatar: user.avatar,
  });
});

/**
 * Logout
 */
ssoAuth.post('/logout', async (c) => {
  const sessionToken = getCookie(c, 'session');

  if (sessionToken) {
    // Revoke session token
    await OIDCProviderService.revokeToken(sessionToken);
  }

  // Clear session cookie
  deleteCookie(c, 'session');

  return c.json({ success: true });
});

// ==========================================
// OAuth 2.0 Provider Endpoints
// ==========================================

/**
 * Authorization endpoint
 */
ssoAuth.get('/authorize', async (c) => {
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const responseType = c.req.query('response_type');
  const scope = c.req.query('scope') || 'openid';
  const state = c.req.query('state');
  const nonce = c.req.query('nonce');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method');
  const prompt = c.req.query('prompt');

  // Validate required parameters
  if (!clientId || !redirectUri || !responseType) {
    return c.redirect(`${redirectUri}?error=invalid_request&error_description=Missing+required+parameters`);
  }

  if (responseType !== 'code') {
    return c.redirect(`${redirectUri}?error=unsupported_response_type`);
  }

  // Validate client
  const client = await OIDCProviderService.getClient(clientId);
  if (!client || client.status !== 'active') {
    return c.redirect(`${redirectUri}?error=invalid_client`);
  }

  // Validate redirect URI
  if (!OIDCProviderService.validateRedirectUri(client, redirectUri)) {
    return c.redirect(`${redirectUri}?error=invalid_redirect_uri`);
  }

  // Check if user is authenticated
  const userDid = c.get('userDid');
  if (!userDid) {
    // Redirect to login with return URL
    const returnUrl = c.req.url;
    return c.redirect(`/login?return=${encodeURIComponent(returnUrl)}`);
  }

  // Check existing consent
  const requestedScopes = scope.split(' ');
  const hasConsent = await OIDCProviderService.hasConsent(userDid, clientId, requestedScopes);

  // If no consent or prompt=consent, redirect to consent screen
  if (!hasConsent || prompt === 'consent') {
    // Build consent page URL with authorization parameters
    const baseUrl = process.env.APP_URL || 'https://exprsn.io';
    const consentUrl = new URL(`${baseUrl}/sso/consent`);

    // Pass authorization request parameters
    consentUrl.searchParams.set('client_id', clientId);
    consentUrl.searchParams.set('redirect_uri', redirectUri);
    consentUrl.searchParams.set('scope', scope);
    consentUrl.searchParams.set('response_type', responseType);
    if (state) consentUrl.searchParams.set('state', state);
    if (nonce) consentUrl.searchParams.set('nonce', nonce);
    if (codeChallenge) consentUrl.searchParams.set('code_challenge', codeChallenge);
    if (codeChallengeMethod) consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod);

    // Include client info for display
    consentUrl.searchParams.set('client_name', client.clientName);
    if (client.logoUri) consentUrl.searchParams.set('client_logo', client.logoUri);

    return c.redirect(consentUrl.toString());
  }

  // Create authorization code
  const code = await OIDCProviderService.createAuthorizationCode(userDid, {
    clientId,
    redirectUri,
    responseType,
    scope,
    state,
    nonce,
    codeChallenge,
    codeChallengeMethod,
  });

  // Build redirect URL
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  return c.redirect(redirectUrl.toString());
});

/**
 * Consent confirmation endpoint
 * Called by frontend after user approves consent
 */
ssoAuth.post('/consent', optionalAuthMiddleware, async (c) => {
  const userDid = c.get('userDid');
  if (!userDid) {
    return c.json({ error: 'unauthorized', message: 'Authentication required' }, 401);
  }

  const body = await c.req.json<{
    client_id: string;
    redirect_uri: string;
    scope: string;
    response_type: string;
    state?: string;
    nonce?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    approved: boolean;
  }>();

  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    response_type: responseType,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    approved,
  } = body;

  if (!clientId || !redirectUri || !scope) {
    return c.json({ error: 'invalid_request', message: 'Missing required parameters' }, 400);
  }

  // Validate client
  const client = await OIDCProviderService.getClient(clientId);
  if (!client || client.status !== 'active') {
    return c.json({ error: 'invalid_client', message: 'Client not found or inactive' }, 400);
  }

  // Validate redirect URI
  if (!OIDCProviderService.validateRedirectUri(client, redirectUri)) {
    return c.json({ error: 'invalid_redirect_uri', message: 'Invalid redirect URI' }, 400);
  }

  // Handle denial
  if (!approved) {
    const denyUrl = new URL(redirectUri);
    denyUrl.searchParams.set('error', 'access_denied');
    denyUrl.searchParams.set('error_description', 'User denied the request');
    if (state) denyUrl.searchParams.set('state', state);
    return c.json({ redirect_uri: denyUrl.toString() });
  }

  // Grant consent
  const requestedScopes = scope.split(' ');
  await OIDCProviderService.grantConsent(userDid, clientId, requestedScopes);

  // Create authorization code
  const code = await OIDCProviderService.createAuthorizationCode(userDid, {
    clientId,
    redirectUri,
    responseType: responseType || 'code',
    scope,
    state,
    nonce,
    codeChallenge,
    codeChallengeMethod,
  });

  // Build redirect URL
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  return c.json({ redirect_uri: redirectUrl.toString() });
});

/**
 * Token endpoint
 */
ssoAuth.post('/token', async (c) => {
  const contentType = c.req.header('content-type');
  let params: Record<string, string>;

  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.text();
    params = Object.fromEntries(new URLSearchParams(formData));
  } else {
    params = await c.req.json();
  }

  const { grant_type, code, redirect_uri, code_verifier, refresh_token, client_id, client_secret } =
    params;

  // Get client credentials from header or body
  let clientId = client_id;
  let clientSecret = client_secret;

  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [id, secret] = decoded.split(':');
    clientId = id;
    clientSecret = secret;
  }

  if (!clientId) {
    return c.json({ error: 'invalid_client', error_description: 'Client ID required' }, 400);
  }

  // Handle different grant types
  if (grant_type === 'authorization_code') {
    if (!code || !redirect_uri) {
      return c.json({ error: 'invalid_request', error_description: 'Code and redirect_uri required' }, 400);
    }

    const tokens = await OIDCProviderService.exchangeAuthorizationCode(
      code,
      clientId,
      redirect_uri,
      code_verifier
    );

    if (!tokens) {
      return c.json({ error: 'invalid_grant', error_description: 'Invalid authorization code' }, 400);
    }

    return c.json(tokens);
  }

  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return c.json({ error: 'invalid_request', error_description: 'Refresh token required' }, 400);
    }

    const tokens = await OIDCProviderService.refreshAccessToken(refresh_token, clientId);

    if (!tokens) {
      return c.json({ error: 'invalid_grant', error_description: 'Invalid refresh token' }, 400);
    }

    return c.json(tokens);
  }

  return c.json({ error: 'unsupported_grant_type' }, 400);
});

/**
 * Token introspection endpoint
 */
ssoAuth.post('/introspect', async (c) => {
  const { token } = await c.req.json<{ token: string }>();

  if (!token) {
    return c.json({ active: false });
  }

  const result = await OIDCProviderService.introspectToken(token);
  return c.json(result);
});

/**
 * Token revocation endpoint
 */
ssoAuth.post('/revoke', async (c) => {
  const { token, token_type_hint } = await c.req.json<{
    token: string;
    token_type_hint?: string;
  }>();

  if (token) {
    await OIDCProviderService.revokeToken(token, token_type_hint);
  }

  return c.json({ success: true });
});

/**
 * UserInfo endpoint
 */
ssoAuth.get('/userinfo', async (c) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Invalid authorization header' });
  }

  const accessToken = authHeader.slice(7);
  const userInfo = await OIDCProviderService.getUserInfo(accessToken);

  if (!userInfo) {
    throw new HTTPException(401, { message: 'Invalid token' });
  }

  return c.json(userInfo);
});

/**
 * JWKS endpoint
 */
ssoAuth.get('/.well-known/jwks.json', async (c) => {
  const jwks = await JWTService.getJWKS();
  return c.json(jwks);
});

/**
 * OpenID Configuration
 */
ssoAuth.get('/.well-known/openid-configuration', async (c) => {
  const issuer = process.env.APP_URL || 'http://localhost:3002';

  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/sso/auth/authorize`,
    token_endpoint: `${issuer}/sso/auth/token`,
    userinfo_endpoint: `${issuer}/sso/auth/userinfo`,
    jwks_uri: `${issuer}/sso/auth/.well-known/jwks.json`,
    introspection_endpoint: `${issuer}/sso/auth/introspect`,
    revocation_endpoint: `${issuer}/sso/auth/revoke`,
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256', 'plain'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: ['sub', 'name', 'preferred_username', 'email', 'email_verified', 'picture'],
  });
});

// ==========================================
// Helper Functions
// ==========================================

async function createUserFromExternalIdentity(
  userInfo: ExternalUserInfo,
  provider: ExternalProvider,
  tokens: TokenExchangeResult
): Promise<string> {
  const isExprsnProvider =
    provider.providerKey === 'exprsn' || provider.providerKey.startsWith('exprsn:');

  // For Exprsn providers, the remote sub is already a DID - use it as a reference
  // but still create a local identity anchored to our PLC.
  const did = `did:plc:${nanoid(24)}`;
  const handle = generateHandleFromEmail(userInfo.email || userInfo.id);

  // Determine the effective role, applying roleMapping when available
  let effectiveRole = provider.defaultRole || 'member';
  if (isExprsnProvider && provider.roleMapping) {
    const remoteRole = userInfo.raw.role as string | undefined;
    if (remoteRole && provider.roleMapping[remoteRole]) {
      effectiveRole = provider.roleMapping[remoteRole]!;
    }
  }

  // Determine account type for Exprsn providers
  const accountType = isExprsnProvider
    ? (provider.defaultAccountType ?? 'personal')
    : 'personal';

  // Generate signing keypair for the actor
  const { privateKey, publicKey } = await generateKeyPair({
    algorithm: 'RSA',
    keySize: 2048,
  });

  // Create actor repo
  await db.insert(actorRepos).values({
    did,
    handle,
    email: userInfo.email,
    signingKeyPublic: publicKey,
    signingKeyPrivate: privateKey,
    createdAt: new Date(),
  });

  // Create user, attaching account type for Exprsn-sourced accounts
  await db.insert(users).values({
    did,
    handle,
    displayName: userInfo.name,
    avatar: userInfo.picture,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(
    `[SSO] Created user ${did} via ${provider.providerKey} (role=${effectiveRole}, accountType=${accountType})`
  );

  // Link external identity
  await OIDCConsumerService.linkIdentity(did, provider, userInfo, tokens);

  return did;
}

function generateHandleFromEmail(email: string): string {
  const localPart = email.split('@')[0] || 'user';
  const cleaned = localPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `${cleaned}${nanoid(6)}.exprsn.io`;
}

async function createSession(userDid: string): Promise<string> {
  const { token } = await JWTService.createAccessToken(userDid, 'session', 'profile email', 30 * 24 * 60 * 60);
  return token;
}

export default ssoAuth;
