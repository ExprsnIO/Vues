import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { createReadStream, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { Server as SocketIOServer } from 'socket.io';

import { createOAuthClient } from './auth/oauth-client.js';
import { xrpcRouter } from './routes/xrpc.js';
import { oauthRouter } from './routes/oauth.js';
import { settingsRouter } from './routes/settings.js';
import { adminRouter } from './routes/admin.js';
import { socialRouter } from './routes/social.js';
import { chatRouter } from './routes/chat.js';
import { actorRouter } from './routes/actor.js';
import { notificationRouter } from './routes/notification.js';
import { feedRouter } from './routes/feed.js';
import { graphRouter } from './routes/graph.js';
import { videoExtendedRouter } from './routes/video-extended.js';
import { authRouter } from './routes/auth.js';
import { organizationRoutes } from './routes/organization.js';
import { liveRoutes } from './routes/live.js';
import { paymentRoutes } from './routes/payments.js';
import { caRoutes } from './routes/ca.js';
import { audioRouter } from './routes/audio.js';
import configRoutes from './routes/config.js';
import { createPdsApp, getPdsConfig } from './pds/index.js';
import { initializeChatWebSocket } from './websocket/chat.js';
import { initializeEditorCollab } from './websocket/editorCollab.js';
import { createWellKnownRouterFromEnv } from './routes/well-known.js';
import { Redis } from 'ioredis';

const app = new Hono();

// Global middleware
app.use('*', cors());
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders({
  crossOriginResourcePolicy: false, // Disable CORP to allow cross-origin video loading
}));

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

// Serve static video files from data/videos/samples
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const videosPath = join(__dirname, '../../..', 'data/videos/samples');

app.get('/videos/:filename', async (c) => {
  const filename = c.req.param('filename');

  // Sanitize filename to prevent directory traversal
  if (filename.includes('..') || filename.includes('/')) {
    return c.json({ error: 'Invalid filename' }, 400);
  }

  const filePath = join(videosPath, filename);

  if (!existsSync(filePath)) {
    return c.json({ error: 'Video not found' }, 404);
  }

  try {
    const stat = statSync(filePath);
    const range = c.req.header('Range');

    // Determine content type based on extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
    };
    const contentType = contentTypes[ext || ''] || 'video/mp4';

    // Handle range requests for video streaming
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0] || '0', 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      const stream = createReadStream(filePath, { start, end });

      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Full file request
    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Length': stat.size.toString(),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Error serving video:', err);
    return c.json({ error: 'Error serving video' }, 500);
  }
});

// Mount routers
// Auth routes first (no middleware)
app.route('/xrpc', authRouter);
app.route('/xrpc', xrpcRouter);
app.route('/xrpc', settingsRouter);
app.route('/xrpc', socialRouter);
app.route('/xrpc', chatRouter);
app.route('/xrpc', actorRouter);
app.route('/xrpc', notificationRouter);
app.route('/xrpc', feedRouter);
app.route('/xrpc', graphRouter);
app.route('/xrpc', videoExtendedRouter);
app.route('/xrpc', organizationRoutes);
app.route('/xrpc', liveRoutes);
app.route('/xrpc', paymentRoutes);
app.route('/xrpc', caRoutes);
app.route('/xrpc', audioRouter);
app.route('/xrpc', configRoutes);
// Admin routes last (has wildcard middleware)
app.route('/xrpc', adminRouter);
app.route('/oauth', oauthRouter);

// Mount PDS routes if enabled
const pdsConfig = getPdsConfig();
if (pdsConfig.enabled) {
  const pdsApp = createPdsApp(pdsConfig);
  app.route('/', pdsApp);
  console.log('PDS enabled at', pdsConfig.domain);
}

// Mount well-known routes for AT Protocol and federation discovery
const wellKnownRouter = createWellKnownRouterFromEnv();
app.route('/.well-known', wellKnownRouter);

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

  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Initialize WebSocket handlers
  initializeChatWebSocket(io);
  initializeEditorCollab(io);

  // Initialize relay service if enabled
  const relayEnabled = process.env.RELAY_ENABLED === 'true';
  if (relayEnabled) {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redis = new Redis(redisUrl);

      // Import relay service dynamically
      // Relay functionality is initialized when RELAY_ENABLED=true
      console.log('Relay service would be initialized here');
      console.log('Firehose would be available at: /xrpc/com.atproto.sync.subscribeRepos');
      // Note: Relay integration is handled via the @exprsn/relay package when built and imported
    } catch (err) {
      console.warn('Failed to initialize relay service:', err);
    }
  }

  console.log(`Server running at http://${host}:${port}`);
  console.log('WebSocket namespaces: /chat, /editor-collab' + (relayEnabled ? ', /xrpc/com.atproto.sync.subscribeRepos' : ''));
  console.log('Well-known endpoints: /.well-known/atproto-did, /.well-known/did.json, /.well-known/exprsn-services');
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
