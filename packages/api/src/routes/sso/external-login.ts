/**
 * External Login Routes - Social Login / Enterprise SSO Consumer
 *
 * Implements:
 * - GET /auth/providers - List available identity providers
 * - GET /auth/:providerId/login - Initiate login with provider
 * - GET /auth/callback - OAuth callback handler
 * - GET /auth/me/identities - List linked external identities
 * - POST /auth/:providerId/link - Link external identity to account
 * - DELETE /auth/:providerId/link - Unlink external identity
 */

import { Hono } from 'hono';
import { OIDCConsumerService } from '../../services/sso/OIDCConsumerService.js';
import { authMiddleware, optionalAuthMiddleware, adminAuthMiddleware, ADMIN_PERMISSIONS, requirePermission } from '../../auth/middleware.js';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import { users, actorRepos, sessions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const app = new Hono();

// ==========================================
// Provider Discovery
// ==========================================

/**
 * GET /auth/providers
 * List available external identity providers
 */
app.get('/auth/providers', async (c) => {
  const domainId = c.req.query('domainId');
  const providers = await OIDCConsumerService.listProviders(domainId || undefined);

  // Return public info only (no secrets)
  return c.json({
    providers: providers.map((p) => ({
      id: p.id,
      providerKey: p.providerKey,
      displayName: p.displayName,
      iconUrl: p.iconUrl,
      buttonColor: p.buttonColor,
      type: p.type,
    })),
  });
});

// ==========================================
// Login Flow
// ==========================================

/**
 * GET /auth/:providerId/login
 * Initiate login with external provider
 */
app.get('/auth/:providerId/login', optionalAuthMiddleware, async (c) => {
  const providerId = c.req.param('providerId')!;
  const redirectAfter = c.req.query('redirect');
  const link = c.req.query('link') === 'true';

  // If linking, user must be authenticated
  const userDid = c.get('did');
  if (link && !userDid) {
    return c.json({ error: 'Must be authenticated to link identity' }, 401);
  }

  try {
    const { authUrl, state } = await OIDCConsumerService.startAuthorization(
      providerId,
      redirectAfter,
      link ? userDid : undefined
    );

    // Set state cookie for additional security
    c.header('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);

    return c.redirect(authUrl);
  } catch (error) {
    console.error('[External Login] Error starting auth:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to start authentication' },
      400
    );
  }
});

/**
 * GET /auth/callback
 * OAuth callback - handles code exchange and user creation/login
 */
app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  // Check for OAuth errors
  if (error) {
    const redirectUrl = new URL('/login', process.env.WEB_URL || 'http://localhost:3000');
    redirectUrl.searchParams.set('error', errorDescription || error);
    return c.redirect(redirectUrl.toString());
  }

  if (!code || !state) {
    return c.json({ error: 'Missing code or state' }, 400);
  }

  // Validate state cookie
  const cookieState = getCookieValue(c.req.header('cookie'), 'oauth_state');
  if (cookieState && cookieState !== state) {
    return c.json({ error: 'State mismatch' }, 400);
  }

  try {
    const { userInfo, provider, tokens, linkToUserDid, redirectAfter } =
      await OIDCConsumerService.handleCallback(code, state);

    // Clear state cookie
    c.header('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Max-Age=0');

    // Check email domain restriction
    if (provider.requiredEmailDomain && userInfo.email) {
      const emailDomain = userInfo.email.split('@')[1];
      if (emailDomain !== provider.requiredEmailDomain) {
        const redirectUrl = new URL('/login', process.env.WEB_URL || 'http://localhost:3000');
        redirectUrl.searchParams.set('error', `Email domain ${emailDomain} not allowed`);
        return c.redirect(redirectUrl.toString());
      }
    }

    let userDid: string;

    if (linkToUserDid) {
      // Link to existing account
      userDid = linkToUserDid;
      await OIDCConsumerService.linkIdentity(userDid, provider, userInfo, tokens);
    } else {
      // Find or create user
      const existingIdentity = await OIDCConsumerService.findUserByExternalId(
        provider.id,
        userInfo.id
      );

      if (existingIdentity) {
        // Existing user - update tokens
        userDid = existingIdentity.userDid;
        await OIDCConsumerService.linkIdentity(userDid, provider, userInfo, tokens);
      } else {
        // Check if email already exists
        const emailIdentity = userInfo.email
          ? await OIDCConsumerService.findUserByEmail(userInfo.email)
          : null;

        if (emailIdentity) {
          // Link to existing account with same email
          userDid = emailIdentity.userDid;
          await OIDCConsumerService.linkIdentity(userDid, provider, userInfo, tokens);
        } else if (provider.autoProvisionUsers) {
          // Create new user
          userDid = await createUserFromExternalInfo(userInfo);
          await OIDCConsumerService.linkIdentity(userDid, provider, userInfo, tokens);
        } else {
          // Redirect to registration with pre-filled info
          const redirectUrl = new URL('/register', process.env.WEB_URL || 'http://localhost:3000');
          redirectUrl.searchParams.set('provider', provider.id);
          redirectUrl.searchParams.set('externalId', userInfo.id);
          if (userInfo.email) redirectUrl.searchParams.set('email', userInfo.email);
          if (userInfo.name) redirectUrl.searchParams.set('name', userInfo.name);
          return c.redirect(redirectUrl.toString());
        }
      }
    }

    // Create session and store in database
    const sessionToken = nanoid(48);
    const refreshToken = nanoid(64);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(sessions).values({
      id: nanoid(),
      did: userDid,
      accessJwt: sessionToken,
      refreshJwt: refreshToken,
      expiresAt,
    });

    // Redirect to app with session token
    const redirectUrl = new URL(
      redirectAfter || '/',
      process.env.WEB_URL || 'http://localhost:3000'
    );
    redirectUrl.searchParams.set('session', sessionToken);
    redirectUrl.searchParams.set('did', userDid);

    return c.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[External Login] Callback error:', err);
    const redirectUrl = new URL('/login', process.env.WEB_URL || 'http://localhost:3000');
    redirectUrl.searchParams.set('error', err instanceof Error ? err.message : 'Authentication failed');
    return c.redirect(redirectUrl.toString());
  }
});

// ==========================================
// Identity Management
// ==========================================

/**
 * GET /auth/me/identities
 * List current user's linked external identities
 */
app.get('/auth/me/identities', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const identities = await OIDCConsumerService.getUserIdentities(userDid);

  return c.json({
    identities: identities.map((i) => ({
      id: i.identity.id,
      providerId: i.identity.providerId,
      providerName: i.provider.displayName,
      providerKey: i.provider.providerKey,
      email: i.identity.email,
      displayName: i.identity.displayName,
      avatar: i.identity.avatar,
      linkedAt: i.identity.linkedAt,
      lastLoginAt: i.identity.lastLoginAt,
    })),
  });
});

/**
 * POST /auth/:providerId/link
 * Link external identity to current account
 */
app.post('/auth/:providerId/link', authMiddleware, async (c) => {
  const providerId = c.req.param('providerId')!;
  const userDid = c.get('did');
  const redirectAfter = c.req.query('redirect');

  try {
    const { authUrl } = await OIDCConsumerService.startAuthorization(
      providerId,
      redirectAfter,
      userDid
    );

    return c.json({ authUrl });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to start linking' },
      400
    );
  }
});

/**
 * DELETE /auth/:providerId/link
 * Unlink external identity from account
 */
app.delete('/auth/:providerId/link', authMiddleware, async (c) => {
  const providerId = c.req.param('providerId')!;
  const userDid = c.get('did');

  // Check that user has other login methods
  const identities = await OIDCConsumerService.getUserIdentities(userDid);
  if (identities.length <= 1) {
    // Check if user has password auth
    const [actor] = await db.select().from(actorRepos).where(eq(actorRepos.did, userDid));
    if (!actor?.passwordHash) {
      return c.json(
        { error: 'Cannot unlink last identity without password' },
        400
      );
    }
  }

  const success = await OIDCConsumerService.unlinkIdentity(userDid, providerId);

  if (!success) {
    return c.json({ error: 'Identity not found' }, 404);
  }

  return c.json({ success: true });
});

// ==========================================
// Admin: Provider Management
// ==========================================

/**
 * POST /auth/providers
 * Register a new external identity provider (admin only)
 */
app.post('/auth/providers', adminAuthMiddleware, requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT), async (c) => {
  const body = await c.req.json();

  const {
    name,
    providerKey,
    clientId,
    clientSecret,
    type,
    authorizationEndpoint,
    tokenEndpoint,
    userinfoEndpoint,
    jwksUri,
    issuer,
    scopes,
    claimMapping,
    displayName,
    iconUrl,
    buttonColor,
    domainId,
    autoProvisionUsers,
    defaultRole,
    requiredEmailDomain,
  } = body;

  if (!name || !providerKey || !clientId || !clientSecret) {
    return c.json(
      { error: 'name, providerKey, clientId, and clientSecret are required' },
      400
    );
  }

  try {
    const provider = await OIDCConsumerService.registerProvider({
      name,
      providerKey,
      clientId,
      clientSecret,
      type,
      authorizationEndpoint,
      tokenEndpoint,
      userinfoEndpoint,
      jwksUri,
      issuer,
      scopes,
      claimMapping,
      displayName,
      iconUrl,
      buttonColor,
      domainId,
      autoProvisionUsers,
      defaultRole,
      requiredEmailDomain,
    });

    return c.json({ provider }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to register provider' },
      400
    );
  }
});

/**
 * PUT /auth/providers/:id
 * Update external identity provider (admin only)
 */
app.put('/auth/providers/:id', adminAuthMiddleware, requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT), async (c) => {
  const id = c.req.param('id')!;
  const body = await c.req.json();

  const provider = await OIDCConsumerService.updateProvider(id, body);

  if (!provider) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  return c.json({ provider });
});

/**
 * DELETE /auth/providers/:id
 * Delete external identity provider (admin only)
 */
app.delete('/auth/providers/:id', adminAuthMiddleware, requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT), async (c) => {
  const id = c.req.param('id')!;

  const success = await OIDCConsumerService.deleteProvider(id);

  if (!success) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  return c.json({ success: true });
});

// ==========================================
// Helper Functions
// ==========================================

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] || null : null;
}

async function createUserFromExternalInfo(userInfo: {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<string> {
  // Generate DID
  const did = `did:plc:${nanoid(24)}`;

  // Generate handle from email or random
  let handle = userInfo.email
    ? userInfo.email.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '') || `user${nanoid(8)}`
    : `user${nanoid(8)}`;

  // Ensure handle is unique
  const [existing] = await db.select().from(users).where(eq(users.handle, handle));
  if (existing) {
    handle = `${handle}${nanoid(4)}`;
  }

  // Create user
  await db.insert(users).values({
    did,
    handle,
    displayName: userInfo.name || handle,
    avatar: userInfo.picture,
    createdAt: new Date(),
    updatedAt: new Date(),
    indexedAt: new Date(),
  });

  // Create actor repo for email
  if (userInfo.email) {
    await db.insert(actorRepos).values({
      did,
      handle,
      email: userInfo.email,
      signingKeyPublic: '', // Would generate actual keys
      signingKeyPrivate: '', // Would generate actual keys
    });
  }

  return did;
}

export default app;
