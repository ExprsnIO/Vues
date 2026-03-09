/**
 * OIDC Provider Routes - OAuth2/OpenID Connect Provider Endpoints
 *
 * Implements:
 * - GET/POST /oauth/authorize - Authorization endpoint
 * - POST /oauth/token - Token endpoint
 * - GET /oauth/userinfo - UserInfo endpoint
 * - GET /oauth/jwks - JWKS endpoint
 * - POST /oauth/introspect - Token introspection
 * - POST /oauth/revoke - Token revocation
 * - GET /.well-known/openid-configuration - OIDC Discovery
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { OIDCProviderService } from '../../services/sso/OIDCProviderService.js';
import { JWTService } from '../../services/sso/JWTService.js';
import { authMiddleware, optionalAuthMiddleware } from '../../auth/middleware.js';

const app = new Hono();

// ==========================================
// OIDC Discovery
// ==========================================

/**
 * GET /.well-known/openid-configuration
 * OIDC Discovery Document
 */
app.get('/.well-known/openid-configuration', async (c) => {
  const metadata = JWTService.getDiscoveryMetadata();
  return c.json(metadata);
});

// ==========================================
// JWKS Endpoint
// ==========================================

/**
 * GET /oauth/jwks
 * JSON Web Key Set for token verification
 */
app.get('/oauth/jwks', async (c) => {
  const jwks = await JWTService.getJWKS();
  return c.json(jwks);
});

// ==========================================
// Authorization Endpoint
// ==========================================

const authorizationSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  response_type: z.string(),
  scope: z.string().optional().default('openid'),
  state: z.string().optional(),
  nonce: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.enum(['plain', 'S256']).optional(),
  prompt: z.enum(['none', 'login', 'consent', 'select_account']).optional(),
  max_age: z.coerce.number().optional(),
  login_hint: z.string().optional(),
});

/**
 * GET /oauth/authorize
 * Authorization endpoint - initiates the OAuth flow
 */
app.get('/oauth/authorize', optionalAuthMiddleware, async (c) => {
  const query = c.req.query();

  // Parse and validate request
  const parseResult = authorizationSchema.safeParse(query);
  if (!parseResult.success) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: parseResult.error.errors[0]?.message || 'Invalid request',
      },
      400
    );
  }

  const params = parseResult.data;

  // Validate client
  const client = await OIDCProviderService.getClient(params.client_id);
  if (!client || client.status !== 'active') {
    return c.json(
      {
        error: 'invalid_client',
        error_description: 'Client not found or inactive',
      },
      400
    );
  }

  // Validate redirect_uri
  if (!OIDCProviderService.validateRedirectUri(client, params.redirect_uri)) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri',
      },
      400
    );
  }

  // Validate response_type
  const supportedResponseTypes = client.responseTypes as string[];
  if (!supportedResponseTypes.includes(params.response_type)) {
    return redirectWithError(
      params.redirect_uri,
      'unsupported_response_type',
      'The response type is not supported',
      params.state
    );
  }

  // Validate PKCE for public clients or when required
  if (client.requirePkce && !params.code_challenge) {
    return redirectWithError(
      params.redirect_uri,
      'invalid_request',
      'PKCE code_challenge is required',
      params.state
    );
  }

  // Check if user is authenticated
  const userDid = c.get('did');

  if (!userDid) {
    // User needs to log in
    if (params.prompt === 'none') {
      return redirectWithError(
        params.redirect_uri,
        'login_required',
        'User is not logged in',
        params.state
      );
    }

    // Redirect to login page with return URL
    const loginUrl = new URL('/login', c.req.url);
    loginUrl.searchParams.set('redirect', c.req.url);
    return c.redirect(loginUrl.toString());
  }

  // Check consent
  const requestedScopes = params.scope.split(' ');
  const hasConsent = await OIDCProviderService.hasConsent(
    userDid,
    params.client_id,
    requestedScopes
  );

  if (!hasConsent) {
    if (params.prompt === 'none') {
      return redirectWithError(
        params.redirect_uri,
        'consent_required',
        'User consent is required',
        params.state
      );
    }

    // Return consent page data (for frontend to render)
    if (client.requireConsent) {
      // In a real implementation, redirect to consent page
      // For API-first approach, return consent required response
      return c.json({
        consent_required: true,
        client: {
          name: client.clientName,
          logo: client.logoUri,
          uri: client.clientUri,
        },
        scopes: requestedScopes,
        authorization_params: params,
      });
    }
  }

  // Grant consent if not requiring explicit consent
  if (!hasConsent && !client.requireConsent) {
    await OIDCProviderService.grantConsent(userDid, params.client_id, requestedScopes);
  }

  // Generate authorization code
  const code = await OIDCProviderService.createAuthorizationCode(userDid, {
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    responseType: params.response_type,
    scope: params.scope,
    state: params.state,
    nonce: params.nonce,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
  });

  // Redirect with authorization code
  const redirectUrl = new URL(params.redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (params.state) {
    redirectUrl.searchParams.set('state', params.state);
  }

  return c.redirect(redirectUrl.toString());
});

/**
 * POST /oauth/authorize
 * Authorization endpoint - for consent submission
 */
app.post('/oauth/authorize', authMiddleware, async (c) => {
  const body = await c.req.json();
  const userDid = c.get('did');

  const { client_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method, consent_granted } = body;

  if (!consent_granted) {
    return redirectWithError(
      redirect_uri,
      'access_denied',
      'User denied consent',
      state
    );
  }

  // Validate client and redirect_uri
  const client = await OIDCProviderService.getClient(client_id);
  if (!client || !OIDCProviderService.validateRedirectUri(client, redirect_uri)) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  // Grant consent
  const scopes = scope.split(' ');
  await OIDCProviderService.grantConsent(userDid, client_id, scopes);

  // Generate authorization code
  const code = await OIDCProviderService.createAuthorizationCode(userDid, {
    clientId: client_id,
    redirectUri: redirect_uri,
    responseType: 'code',
    scope,
    state,
    nonce,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
  });

  // Redirect with authorization code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  return c.redirect(redirectUrl.toString());
});

// ==========================================
// Token Endpoint
// ==========================================

/**
 * POST /oauth/token
 * Token endpoint - exchange code for tokens or refresh
 */
app.post('/oauth/token', async (c) => {
  const contentType = c.req.header('content-type');

  let params: Record<string, string>;
  if (contentType?.includes('application/json')) {
    params = await c.req.json();
  } else {
    // application/x-www-form-urlencoded
    const formData = await c.req.parseBody();
    params = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, String(v)])
    );
  }

  const { grant_type, code, redirect_uri, code_verifier, refresh_token, scope } = params;

  // Extract client credentials
  let clientId = params.client_id;
  let clientSecret = params.client_secret;

  // Check Authorization header for client credentials
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const parts = decoded.split(':');
    const id = parts[0];
    const secret = parts[1];
    if (id) clientId = decodeURIComponent(id);
    if (secret) clientSecret = decodeURIComponent(secret);
  }

  if (!clientId) {
    return c.json({ error: 'invalid_client', error_description: 'Client ID is required' }, 401);
  }

  // Get client
  const client = await OIDCProviderService.getClient(clientId);
  if (!client || client.status !== 'active') {
    return c.json({ error: 'invalid_client', error_description: 'Client not found' }, 401);
  }

  // Validate client authentication for confidential clients
  if (client.clientType === 'confidential') {
    if (!clientSecret) {
      return c.json({ error: 'invalid_client', error_description: 'Client secret required' }, 401);
    }

    const validClient = await OIDCProviderService.validateClientCredentials(clientId, clientSecret);
    if (!validClient) {
      return c.json({ error: 'invalid_client', error_description: 'Invalid client credentials' }, 401);
    }
  }

  // Handle different grant types
  switch (grant_type) {
    case 'authorization_code': {
      if (!code || !redirect_uri) {
        return c.json(
          { error: 'invalid_request', error_description: 'code and redirect_uri required' },
          400
        );
      }

      const tokens = await OIDCProviderService.exchangeAuthorizationCode(
        code,
        clientId,
        redirect_uri,
        code_verifier
      );

      if (!tokens) {
        return c.json({ error: 'invalid_grant', error_description: 'Invalid or expired code' }, 400);
      }

      return c.json(tokens);
    }

    case 'refresh_token': {
      if (!refresh_token) {
        return c.json(
          { error: 'invalid_request', error_description: 'refresh_token required' },
          400
        );
      }

      const tokens = await OIDCProviderService.refreshAccessToken(
        refresh_token,
        clientId,
        scope
      );

      if (!tokens) {
        return c.json(
          { error: 'invalid_grant', error_description: 'Invalid or expired refresh token' },
          400
        );
      }

      return c.json(tokens);
    }

    case 'client_credentials': {
      // Only for confidential clients
      if (client.clientType !== 'confidential') {
        return c.json(
          { error: 'unauthorized_client', error_description: 'Client credentials grant not allowed' },
          400
        );
      }

      // Check if grant type is allowed
      const allowedGrants = client.grantTypes as string[];
      if (!allowedGrants.includes('client_credentials')) {
        return c.json(
          { error: 'unauthorized_client', error_description: 'Grant type not allowed' },
          400
        );
      }

      // Issue tokens for the client itself (no user)
      // For now, return error - implement based on requirements
      return c.json(
        { error: 'unsupported_grant_type', error_description: 'Not implemented' },
        400
      );
    }

    default:
      return c.json(
        { error: 'unsupported_grant_type', error_description: `Grant type ${grant_type} not supported` },
        400
      );
  }
});

// ==========================================
// UserInfo Endpoint
// ==========================================

/**
 * GET /oauth/userinfo
 * UserInfo endpoint - returns claims about the authenticated user
 */
app.get('/oauth/userinfo', async (c) => {
  const authHeader = c.req.header('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const accessToken = authHeader.slice(7);
  const userInfo = await OIDCProviderService.getUserInfo(accessToken);

  if (!userInfo) {
    return c.json({ error: 'invalid_token' }, 401);
  }

  return c.json(userInfo);
});

/**
 * POST /oauth/userinfo
 * UserInfo endpoint (POST variant)
 */
app.post('/oauth/userinfo', async (c) => {
  // Check body for access_token
  const body = await c.req.parseBody();
  let accessToken = body.access_token as string;

  // Also check Authorization header
  if (!accessToken) {
    const authHeader = c.req.header('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.slice(7);
    }
  }

  if (!accessToken) {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const userInfo = await OIDCProviderService.getUserInfo(accessToken);

  if (!userInfo) {
    return c.json({ error: 'invalid_token' }, 401);
  }

  return c.json(userInfo);
});

// ==========================================
// Token Introspection (RFC 7662)
// ==========================================

/**
 * POST /oauth/introspect
 * Token introspection endpoint
 */
app.post('/oauth/introspect', async (c) => {
  // Authenticate the client
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  const base64 = authHeader.slice(6);
  const decoded = atob(base64);
  const parts = decoded.split(':');
  const clientId = parts[0];
  const clientSecret = parts[1];

  if (!clientId || !clientSecret) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  const client = await OIDCProviderService.validateClientCredentials(
    decodeURIComponent(clientId),
    decodeURIComponent(clientSecret)
  );

  if (!client) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  // Get token to introspect
  const body = await c.req.parseBody();
  const token = body.token as string;

  if (!token) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const result = await OIDCProviderService.introspectToken(token);
  return c.json(result);
});

// ==========================================
// Token Revocation (RFC 7009)
// ==========================================

/**
 * POST /oauth/revoke
 * Token revocation endpoint
 */
app.post('/oauth/revoke', async (c) => {
  // Authenticate the client (optional for public clients)
  let clientId: string | undefined;

  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const parts = decoded.split(':');
    const id = parts[0];
    const secret = parts[1];

    if (id && secret) {
      clientId = decodeURIComponent(id);

      const client = await OIDCProviderService.validateClientCredentials(
        clientId,
        decodeURIComponent(secret)
      );

      if (!client) {
        return c.json({ error: 'invalid_client' }, 401);
      }
    }
  }

  // Get token to revoke
  const body = await c.req.parseBody();
  const token = body.token as string;
  const tokenTypeHint = body.token_type_hint as string | undefined;

  if (!token) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  await OIDCProviderService.revokeToken(token, tokenTypeHint);

  // RFC 7009: Always return 200 even if token was invalid
  return c.body(null, 200);
});

// ==========================================
// Helper Functions
// ==========================================

function redirectWithError(
  redirectUri: string,
  error: string,
  description: string,
  state?: string
): Response {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) {
    url.searchParams.set('state', state);
  }
  return Response.redirect(url.toString(), 302);
}

export default app;
