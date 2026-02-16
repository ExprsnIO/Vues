import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getOAuthClient } from '../auth/oauth-client.js';

export const oauthRouter = new Hono();

/**
 * Initiate OAuth login flow
 * GET /oauth/login?handle=user.bsky.social
 */
oauthRouter.get('/login', async (c) => {
  const handle = c.req.query('handle');

  if (!handle) {
    throw new HTTPException(400, { message: 'Handle is required' });
  }

  try {
    const oauthClient = getOAuthClient();
    const url = await oauthClient.authorize(handle, {
      scope: 'atproto',
    });

    return c.redirect(url.toString());
  } catch (error) {
    console.error('OAuth login error:', error);
    throw new HTTPException(500, { message: 'Failed to initiate OAuth flow' });
  }
});

/**
 * OAuth callback handler
 * GET /oauth/callback?code=...&state=...
 */
oauthRouter.get('/callback', async (c) => {
  const params = new URLSearchParams(c.req.url.split('?')[1] || '');

  try {
    const oauthClient = getOAuthClient();
    const { session } = await oauthClient.callback(params);

    // Return session info that client can use
    // Note: OAuthSession only provides DID, handle resolution is done separately
    return c.json({
      success: true,
      did: session.did,
      handle: session.did, // Handle resolution done client-side
      sessionId: session.did, // The DID is used as the session identifier
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    throw new HTTPException(400, { message: 'OAuth callback failed' });
  }
});

/**
 * Get current session info
 * GET /oauth/session
 */
oauthRouter.get('/session', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ authenticated: false });
  }

  const sessionId = authHeader.replace('Bearer ', '');

  try {
    const oauthClient = getOAuthClient();
    const session = await oauthClient.restore(sessionId);

    if (!session) {
      return c.json({ authenticated: false });
    }

    return c.json({
      authenticated: true,
      did: session.did,
      handle: session.did, // Handle resolution done client-side
    });
  } catch (error) {
    return c.json({ authenticated: false });
  }
});

/**
 * Logout - revoke session
 * POST /oauth/logout
 */
oauthRouter.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: true });
  }

  const sessionId = authHeader.replace('Bearer ', '');

  try {
    const oauthClient = getOAuthClient();
    const session = await oauthClient.restore(sessionId);

    if (session) {
      await session.signOut();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    // Still return success - session might already be invalid
    return c.json({ success: true });
  }
});
