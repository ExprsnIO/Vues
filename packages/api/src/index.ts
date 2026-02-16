import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';

import { createOAuthClient } from './auth/oauth-client.js';
import { xrpcRouter } from './routes/xrpc.js';
import { oauthRouter } from './routes/oauth.js';
import { settingsRouter } from './routes/settings.js';
import { createPdsApp, getPdsConfig } from './pds/index.js';

const app = new Hono();

// Global middleware
app.use('*', cors());
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// Client metadata for OAuth
app.get('/client-metadata.json', (c) => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return c.json({
    client_id: `${appUrl}/client-metadata.json`,
    client_name: 'Exprsn',
    client_uri: appUrl,
    redirect_uris: [`${appUrl}/oauth/callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'atproto',
    token_endpoint_auth_method: 'private_key_jwt',
    dpop_bound_access_tokens: true,
    application_type: 'web',
  });
});

// Mount routers
app.route('/xrpc', xrpcRouter);
app.route('/xrpc', settingsRouter);
app.route('/oauth', oauthRouter);

// Mount PDS routes if enabled
const pdsConfig = getPdsConfig();
if (pdsConfig.enabled) {
  const pdsApp = createPdsApp(pdsConfig);
  app.route('/', pdsApp);
  console.log('PDS enabled at', pdsConfig.domain);
}

// Error handling
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json(
    {
      error: 'InternalServerError',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'NotFound',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Initialize and start server
async function main() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  // Initialize OAuth client
  const appUrl = process.env.APP_URL || `http://localhost:${port}`;
  const privateKey = process.env.OAUTH_PRIVATE_KEY;

  if (privateKey) {
    await createOAuthClient({
      clientId: `${appUrl}/client-metadata.json`,
      privateKey,
      redirectUri: `${appUrl}/oauth/callback`,
      appUrl,
    });
    console.log('OAuth client initialized');
  } else {
    console.warn('OAUTH_PRIVATE_KEY not set - OAuth disabled');
  }

  console.log(`Starting Exprsn API server on ${host}:${port}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  console.log(`Server running at http://${host}:${port}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
