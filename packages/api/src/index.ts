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
import { createPdsApp, getPdsConfig, OnCommitCallback } from './pds/index.js';
import { initializeChatWebSocket } from './websocket/chat.js';
import { initializeEditorCollab } from './websocket/editorCollab.js';
import { createWellKnownRouterFromEnv } from './routes/well-known.js';
import { identityRouter } from './routes/identity.js';
import { registryRouter, initializeServiceRegistry } from './routes/registry.js';
import { federationRouter } from './routes/federation.js';
import { plcRouter } from './routes/plc.js';
import { syncRouter } from './routes/sync.js';
import { announcementsRouter } from './routes/announcements.js';
import { paymentsAdminRouter } from './routes/payments-admin.js';
import { liveAdminRouter } from './routes/live-admin.js';
import { moderationAdminRouter } from './routes/moderation-admin.js';
import { adminSettingsRouter } from './routes/admin-settings.js';
import { analyticsRoutes } from './routes/analytics.js';
import { studioRouter } from './routes/studio.js';
import { initializeIdentityService } from './services/identity/index.js';
import { cronService } from './services/cron/index.js';
import { oauthAgent } from './services/oauth/OAuthAgent.js';
import { scopeExtractMiddleware, configBasedRateLimit } from './auth/scope-middleware.js';
import { Redis } from 'ioredis';
import { RelayService, CommitEvent as RelayCommitEvent } from '@exprsn/relay';

// Global relay service reference for use by PDS
let relayService: RelayService | null = null;

const app = new Hono();

// Global middleware
app.use('*', cors());
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders({
  crossOriginResourcePolicy: false, // Disable CORP to allow cross-origin video loading
}));

// OAuth scope extraction middleware for /xrpc routes
app.use('/xrpc/*', scopeExtractMiddleware);

// Config-based rate limiting for /xrpc routes
app.use('/xrpc/*', configBasedRateLimit());

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
app.route('/xrpc', studioRouter);
app.route('/xrpc', configRoutes);
// Identity, registry, federation, sync, and PLC routes
app.route('/xrpc', identityRouter);
app.route('/xrpc', registryRouter);
app.route('/xrpc', federationRouter);
app.route('/', syncRouter); // Sync routes for federation
// Admin routes (must be before PLC to avoid /:did catch-all)
app.route('/xrpc', adminRouter);
app.route('/xrpc', announcementsRouter);
app.route('/xrpc', paymentsAdminRouter);
app.route('/xrpc', liveAdminRouter);
app.route('/xrpc', moderationAdminRouter);
app.route('/xrpc', adminSettingsRouter); // Admin settings for auth/CA/moderation
app.route('/xrpc', analyticsRoutes); // Creator analytics
// PLC routes - standard directory at /plc, XRPC routes already have /xrpc prefix
app.route('/plc', plcRouter); // Standard PLC directory endpoints (did:plc resolution)
app.route('/', plcRouter); // Mount at root so /xrpc/io.exprsn.plc.* routes work
app.route('/oauth', oauthRouter);

// PDS will be mounted after relay is initialized in main()
const pdsConfig = getPdsConfig();

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

/**
 * Create onCommit callback that bridges PDS commits to relay
 */
function createRelayBridge(): OnCommitCallback {
  return async (event) => {
    if (!relayService) {
      return;
    }

    // Convert PDS commit ops to relay commit events
    for (const op of event.ops) {
      const [collection, rkey] = op.path.split('/');
      if (!collection || !rkey) continue;

      const relayCommit: RelayCommitEvent = {
        rev: event.rev,
        operation: op.action,
        collection,
        rkey,
        cid: op.cid?.toString(),
        prev: event.since || undefined,
      };

      try {
        await relayService.emitCommit(event.did, relayCommit);
      } catch (err) {
        console.error('Failed to emit commit to relay:', err);
      }
    }
  };
}

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

  // Initialize relay service before PDS (so onCommit callback works)
  const relayEnabled = process.env.RELAY_ENABLED === 'true';
  let redis: Redis | null = null;

  if (relayEnabled) {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      redis = new Redis(redisUrl);

      relayService = new RelayService({
        redis,
        maxBackfillEvents: parseInt(process.env.RELAY_MAX_BACKFILL || '10000', 10),
      });

      console.log('Relay service initialized');
    } catch (err) {
      console.warn('Failed to initialize relay service:', err);
    }
  }

  // Initialize identity service with Redis for caching
  initializeIdentityService({
    redis: redis || undefined,
    plcUrl: process.env.PLC_URL,
    cacheTtlMs: parseInt(process.env.DID_CACHE_TTL || '3600', 10) * 1000,
    staleTtlMs: parseInt(process.env.DID_STALE_TTL || '86400', 10) * 1000,
    persistToDb: true,
  });
  console.log('Identity service initialized');

  // Initialize service registry with health checks
  const registryEnabled = process.env.REGISTRY_ENABLED !== 'false';
  if (registryEnabled) {
    initializeServiceRegistry({ startHealthChecks: true });
    console.log('Service registry initialized with health checks');
  }

  // Initialize cron service for scheduled tasks (CRL generation, etc.)
  const cronEnabled = process.env.CRON_ENABLED !== 'false';
  if (cronEnabled) {
    await cronService.initialize();
  }

  // Initialize OAuth agent for automated token management
  const oauthAgentEnabled = process.env.OAUTH_AGENT_ENABLED !== 'false';
  if (oauthAgentEnabled) {
    await oauthAgent.initialize();
  }

  // Mount PDS routes with relay callback
  if (pdsConfig.enabled) {
    const onCommit = relayEnabled ? createRelayBridge() : undefined;
    const pdsApp = createPdsApp({ config: pdsConfig, onCommit });
    app.route('/', pdsApp);
    console.log('PDS enabled at', pdsConfig.domain);
    if (onCommit) {
      console.log('PDS commits will be emitted to relay firehose');
    }
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

  // Initialize relay firehose WebSocket if enabled
  if (relayEnabled && relayService) {
    relayService.initialize(io);
    console.log('Relay firehose initialized at: /xrpc/com.atproto.sync.subscribeRepos');

    // Mount relay HTTP routes
    const relayRouter = relayService.createRouter();
    app.route('/xrpc', relayRouter);
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
