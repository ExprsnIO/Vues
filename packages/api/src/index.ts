import { serve } from '@hono/node-server';
import { compress } from 'hono/compress';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { createReadStream, statSync, existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createHttpsServer } from 'node:https';

import { createOAuthClient } from './auth/oauth-client.js';
import { xrpcRouter } from './routes/xrpc.js';
import { oauthRouter } from './routes/oauth.js';
import { settingsRouter } from './routes/settings.js';
import { adminRouter } from './routes/admin.js';
import { inviteCodeRouter } from './routes/invite-codes.js';
import { socialRouter } from './routes/social.js';
import { chatRouter } from './routes/chat.js';
import { actorRouter } from './routes/actor.js';
import { notificationRouter } from './routes/notification.js';
import { feedRouter } from './routes/feed.js';
import { graphRouter } from './routes/graph.js';
import { videoExtendedRouter } from './routes/video-extended.js';
import { authRouter } from './routes/auth.js';
import { organizationRoutes } from './routes/organization.js';
import { orgFeaturesRoutes } from './routes/organization-features.js';
import { liveRoutes } from './routes/live.js';
import { paymentRoutes } from './routes/payments.js';
import { caRoutes } from './routes/ca.js';
import { certificatesDidRoutes } from './routes/certificates-did.js';
import { audioRouter } from './routes/audio.js';
import configRoutes from './routes/config.js';
import { createPdsApp, getPdsConfig, OnCommitCallback } from './pds/index.js';
import { initializeChatWebSocket } from './websocket/chat.js';
import { initializeEditorCollab } from './websocket/editorCollab.js';
import { initializeRenderProgressWebSocket } from './websocket/renderProgress.js';
import { initializeAdminWebSocket } from './websocket/admin.js';
import { initializeWatchPartyWebSocket } from './websocket/watchParty.js';
import { initializeLiveChatWebSocket } from './websocket/liveChat.js';
import { initializeTranscodeProgressWebSocket } from './websocket/transcodeProgress.js';
import { createWellKnownRouterFromEnv, createOCSPRouter } from './routes/well-known.js';
import { tokenRouter } from './routes/tokens.js';
import { certAuthRouter } from './routes/auth-certificate.js';
import { certExportRouter } from './routes/certificates-export.js';
import { pinningRouter } from './routes/pinning.js';
import { identityRouter } from './routes/identity.js';
import { identityExprsnRouter } from './routes/identity-exprsn.js';
import { registryRouter, initializeServiceRegistry } from './routes/registry.js';
import { federationRouter } from './routes/federation.js';
import { plcRouter } from './routes/plc.js';
import { syncRouter } from './routes/sync.js';
import { atprotoRouter } from './routes/atproto.js';
import { announcementsRouter } from './routes/announcements.js';
import { paymentsAdminRouter } from './routes/payments-admin.js';
import { liveAdminRouter } from './routes/live-admin.js';
import { moderationAdminRouter } from './routes/moderation-admin.js';
import { adminSettingsRouter } from './routes/admin-settings.js';
import { adminDomainRolesRouter } from './routes/admin-domain-roles.js';
import { adminDomainGroupsRouter } from './routes/admin-domain-groups.js';
import { adminDomainAuthRouter } from './routes/admin-domain-auth.js';
import { adminDomainAppealsRouter } from './routes/admin-domain-appeals.js';
import { adminDomainTransfersRouter } from './routes/admin-domain-transfers.js';
import { adminPaymentsRouter } from './routes/admin-payments.js';
import { renderAdminRouter } from './routes/render-admin.js';
import { presetsRouter } from './routes/presets.js';
import { clusterAdminRouter } from './routes/cluster-admin.js';
import { gpuAdminRouter } from './routes/gpu-admin.js';
import { adminPlatformRouter } from './routes/admin-platform.js';
import { adminTokensRouter } from './routes/admin-tokens.js';
import { adminThemesRouter } from './routes/admin-themes.js';
import { adminPrefetchRouter } from './routes/admin-prefetch.js';
import { adminWorkersRouter } from './routes/admin-workers.js';
import { adminRelayRouter } from './routes/admin-relay.js';
import adminSSOExprsnRouter from './routes/admin-sso-exprsn.js';
import { studioRouter } from './routes/studio.js';
import { effectsRouter } from './routes/effects.js';
import soundsRouter from './routes/sounds.js';
import challengesRouter from './routes/challenges.js';
import { watchPartyRouter } from './routes/watchParty.js';
import { reactionsRouter } from './routes/reactions.js';
import ssoRoutes from './routes/sso/index.js';
import { videoDeletionRouter } from './routes/video-deletion.js';
import { videoModerationRouter } from './routes/video-moderation.js';
import { userModerationRouter } from './routes/user-moderation.js';
import { searchRouter } from './routes/search.js';
import { pushRouter } from './routes/push.js';
import { analyticsRouter } from './routes/analytics.js';
import streamingRouter from './routes/streaming.js';
import renderQueueRouter from './routes/render-queue.js';
import { initializeIdentityService } from './services/identity/index.js';
import { cronService } from './services/cron/index.js';
import { oauthAgent } from './services/oauth/OAuthAgent.js';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { scopeExtractMiddleware, domainContextMiddleware, configBasedRateLimit } from './auth/scope-middleware.js';
import { Redis } from 'ioredis';
import { RelayService, CommitEvent as RelayCommitEvent } from '@exprsn/relay';
import { initializeRenderService, S3StorageProvider } from './services/studio/RenderService.js';
import { setRelayService } from './services/relay/index.js';
import { globalErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/logger.js';
import { DirectorySyncService } from './services/platform/DirectorySyncService.js';
import { initializeTranscodeWebhooks } from './services/video/TranscodeWebhooks.js';
import { adaptiveTranscodeService } from './services/streaming/index.js';
import { emailService } from './services/email/index.js';
import { WebSocketServer, WebSocket } from 'ws';
import { syncService } from './services/sync/index.js';
import { initRelayBridge } from './services/relay-bridge.js';

// Global relay service reference for use by PDS
let relayService: RelayService | null = null;

const app = new Hono();

// Global middleware
app.use('*', cors({
  origin: (origin) => {
    // Allow requests from configured origins or common development origins
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
    ];
    // Allow if no origin (same-origin or non-browser) or if origin is in allowed list
    if (!origin || allowedOrigins.includes(origin)) {
      return origin || '*';
    }
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Dev-Admin',
    'X-Request-ID',
    // Service-to-service authentication headers for AT Protocol federation
    'X-Exprsn-Certificate',
    'X-Exprsn-Signature',
    'X-Exprsn-Timestamp',
    'X-Exprsn-Nonce',
    // Standard ATProto headers
    'Atproto-Proxy',
    'Atproto-Accept-Labelers',
  ],
}));
app.use('*', requestLogger);
app.use('*', prettyJSON());
app.use('*', secureHeaders({
  crossOriginResourcePolicy: false, // Disable CORP to allow cross-origin video loading
}));

// Response compression (gzip/deflate)
app.use('*', compress());

// OAuth scope extraction middleware for /xrpc routes
app.use('/xrpc/*', scopeExtractMiddleware);

// Domain context extraction middleware for /xrpc routes
app.use('/xrpc/*', domainContextMiddleware);

// Config-based rate limiting for /xrpc routes (uses domain context for domain-specific limits)
app.use('/xrpc/*', configBasedRateLimit());

// Health check endpoints
import { performHealthCheck, checkLiveness, checkReadiness } from './services/health/index.js';

// Full health check with component status
app.get('/health', async (c) => {
  const health = await performHealthCheck();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  return c.json(health, statusCode);
});

// Kubernetes liveness probe - is the process alive?
app.get('/health/live', (c) => {
  return c.json(checkLiveness());
});

// Kubernetes readiness probe - can accept traffic?
app.get('/health/ready', async (c) => {
  const readiness = await checkReadiness();
  return c.json(readiness, readiness.ready ? 200 : 503);
});

// AT Protocol XRPC health endpoint
app.get('/xrpc/_health', async (c) => {
  const health = await performHealthCheck();
  return c.json({
    version: health.version,
    status: health.status,
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
app.route('/xrpc', reactionsRouter);
app.route('/xrpc', chatRouter);
app.route('/xrpc', actorRouter);
app.route('/xrpc', notificationRouter);
app.route('/xrpc', feedRouter);
app.route('/xrpc', graphRouter);
app.route('/xrpc', videoExtendedRouter);
app.route('/xrpc', organizationRoutes);
app.route('/xrpc', orgFeaturesRoutes);
app.route('/xrpc', liveRoutes);
app.route('/xrpc', paymentRoutes);
app.route('/xrpc', caRoutes);
app.route('/xrpc', certificatesDidRoutes);
app.route('/xrpc', tokenRouter);
app.route('/xrpc', certAuthRouter);
app.route('/xrpc', certExportRouter);
app.route('/', pinningRouter);
app.route('/xrpc', audioRouter);
app.route('/xrpc', soundsRouter);
app.route('/xrpc', challengesRouter);
app.route('/xrpc', watchPartyRouter);
app.route('/xrpc', studioRouter);
app.route('/xrpc', effectsRouter);
app.route('/xrpc', configRoutes);
// Identity, registry, federation, sync, and PLC routes
app.route('/xrpc', identityRouter);
app.route('/xrpc', identityExprsnRouter); // did:exprsn identity management
app.route('/xrpc', registryRouter);
app.route('/xrpc', federationRouter);
app.route('/', syncRouter); // Sync routes for federation
// AT Protocol repository and sync routes (com.atproto.repo.* and com.atproto.sync.*)
app.route('/xrpc', atprotoRouter);
// Admin routes (must be before PLC to avoid /:did catch-all)
app.route('/xrpc', adminRouter);
app.route('/xrpc', inviteCodeRouter);
app.route('/xrpc', announcementsRouter);
app.route('/xrpc', paymentsAdminRouter);
app.route('/xrpc', liveAdminRouter);
app.route('/xrpc', moderationAdminRouter);
app.route('/xrpc', adminSettingsRouter); // Admin settings for auth/CA/moderation
app.route('/xrpc', adminDomainRolesRouter); // Admin domain roles management
app.route('/xrpc', adminDomainGroupsRouter); // Admin domain groups management
app.route('/xrpc', adminDomainAuthRouter); // Admin domain OAuth and MFA settings
app.route('/xrpc', adminDomainAppealsRouter); // Admin domain appeals workflow
app.route('/xrpc', adminDomainTransfersRouter); // Admin domain transfers
app.route('/xrpc', adminPaymentsRouter); // Admin payment provider management
app.route('/xrpc', adminThemesRouter); // Admin theme configuration
app.route('/xrpc', adminPrefetchRouter); // Prefetch engine admin
app.route('/xrpc', adminWorkersRouter); // Worker monitoring & control
app.route('/xrpc', adminRelayRouter); // Relay protocol admin
app.route('/xrpc', adminSSOExprsnRouter); // Exprsn SSO provider management
app.route('/xrpc', renderAdminRouter); // Render pipeline admin
// NOTE: presetsRouter and clusterAdminRouter are mounted in main() after setup wizard
// because clusterAdminRouter.use('*', adminAuthMiddleware) would intercept /first-run
app.route('/xrpc', videoDeletionRouter); // Video deletion and upload retry
app.route('/xrpc', videoModerationRouter); // Content moderation gate and queue
app.route('/xrpc', userModerationRouter); // User-facing moderation (reports, sanctions, appeals)
app.route('/xrpc', searchRouter); // Search across videos, users, sounds
app.route('/', pushRouter); // Push notification token management
app.route('/', analyticsRouter); // Creator analytics dashboard
app.route('/streaming', streamingRouter); // Adaptive streaming (HLS/DASH) endpoints
app.route('/render', renderQueueRouter); // Render job queue management
// PLC routes - standard directory at /plc, XRPC routes already have /xrpc prefix
app.route('/plc', plcRouter); // Standard PLC directory endpoints (did:plc resolution)
// NOTE: plcRouter at '/' is mounted in main() after setup wizard to avoid /:did catching /first-run
app.route('/oauth', oauthRouter);

// SSO routes (OIDC Provider, SAML Provider, Social Login, Domain SSO)
app.route('/sso', ssoRoutes);

// PDS will be mounted after relay is initialized in main()
const pdsConfig = getPdsConfig();

// Mount well-known routes for AT Protocol and federation discovery
const wellKnownRouter = createWellKnownRouterFromEnv();
app.route('/.well-known', wellKnownRouter);

// Mount OCSP responder for certificate status checking
const ocspRouter = createOCSPRouter();
app.route('/ocsp', ocspRouter);

// Global error handling
app.onError(globalErrorHandler);

// 404 handler
app.notFound(notFoundHandler);

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

/**
 * Handle a raw WebSocket connection to the AT Protocol firehose.
 * Sends DAG-CBOR encoded frames for each commit event, matching the
 * format expected by standard atproto clients.
 */
async function handleFirehoseConnection(ws: WebSocket, url: URL): Promise<void> {
  const cursorParam = url.searchParams.get('cursor');
  const wantedCollections = url.searchParams.getAll('wantedCollections');
  const startSeq = cursorParam ? parseInt(cursorParam, 10) : 0;

  // Send historical events for backfill when cursor is supplied
  if (startSeq > 0) {
    try {
      const { db: dbInstance } = await import('./db/index.js');
      const { syncEvents } = await import('./db/schema.js');
      const { gt } = await import('drizzle-orm');
      const { encode: encodeCbor } = await import('@ipld/dag-cbor');

      const historical = await dbInstance
        .select()
        .from(syncEvents)
        .where(gt(syncEvents.seq, startSeq))
        .orderBy(syncEvents.seq)
        .limit(1000);

      for (const ev of historical) {
        if (ws.readyState !== WebSocket.OPEN) break;
        try {
          const frame = buildCborFrame(ev);
          ws.send(encodeCbor(frame));
        } catch {
          // Skip malformed historical events
        }
      }
    } catch (err) {
      console.warn('[firehose-ws] backfill error:', err);
    }
  }

  // Subscribe to live events
  const listener = async (event: any) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    // Filter by wantedCollections when specified
    if (wantedCollections.length > 0) {
      const firstOp = event.ops?.[0];
      const collection = firstOp?.path?.split('/')[0];
      if (collection && !wantedCollections.includes(collection)) return;
    }

    try {
      const { encode: encodeCbor } = await import('@ipld/dag-cbor');
      const frame = buildCborFrame(event);
      ws.send(encodeCbor(frame));
    } catch (err) {
      console.error('[firehose-ws] encode error:', err);
    }
  };

  syncService.onFirehoseEvent(listener);

  ws.on('close', () => syncService.offFirehoseEvent(listener));
  ws.on('error', () => syncService.offFirehoseEvent(listener));
}

/**
 * Build the DAG-CBOR frame object for a firehose event.
 */
function buildCborFrame(event: any): Record<string, unknown> {
  return {
    $type: 'com.atproto.sync.subscribeRepos#commit',
    seq: event.seq ?? 0,
    rebase: event.rebase ?? false,
    tooBig: event.tooBig ?? false,
    repo: event.did ?? '',
    commit: event.commit ?? '',
    prev: null,
    rev: String(event.seq ?? Date.now()),
    since: null,
    blocks: new Uint8Array(0),
    ops: (event.ops ?? []).map((op: any) => ({
      action: op.action,
      path: op.path,
      cid: op.cid ?? null,
    })),
    blobs: [],
    time: new Date().toISOString(),
  };
}

/**
 * Handle a Jetstream-compatible JSON WebSocket connection.
 * Sends events in the same JSON format as the Bluesky Jetstream service so
 * that the feed generator's JetstreamConsumer can point at this local endpoint.
 */
function handleJetstreamConnection(ws: WebSocket, url: URL): void {
  const wantedCollections = url.searchParams.getAll('wantedCollections');

  const listener = (event: any) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    // Filter by wantedCollections when specified
    if (wantedCollections.length > 0) {
      const firstOp = event.ops?.[0];
      const collection = firstOp?.path?.split('/')[0];
      if (collection && !wantedCollections.includes(collection)) return;
    }

    const firstOp = event.ops?.[0];
    const jetstreamEvent = {
      did: event.did ?? '',
      time_us: Date.now() * 1000,
      kind: (event.eventType as string) ?? 'commit',
      commit: firstOp
        ? {
            rev: String(event.seq ?? Date.now()),
            operation: firstOp.action as 'create' | 'update' | 'delete',
            collection: firstOp.path?.split('/')[0] ?? '',
            rkey: firstOp.path?.split('/')[1] ?? '',
            cid: firstOp.cid ?? undefined,
            record: event.record ?? undefined,
          }
        : undefined,
    };

    ws.send(JSON.stringify(jetstreamEvent));
  };

  syncService.onFirehoseEvent(listener);

  ws.on('close', () => syncService.offFirehoseEvent(listener));
  ws.on('error', () => syncService.offFirehoseEvent(listener));
}

// Initialize and start server
async function main() {
  // ── Environment file resolution ──
  // Resolve env file based on EXPRSN_ENV (development | staging | production)
  const exprsnEnv = process.env.EXPRSN_ENV || 'development';
  const __mainDirname = dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = resolve(__mainDirname, '../../..');
  const envFileMap: Record<string, string> = {
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
  };
  const envFileName = envFileMap[exprsnEnv] || '.env';
  const envFilePath = resolve(monorepoRoot, envFileName);

  if (existsSync(envFilePath)) {
    try {
      const envContent = readFileSync(envFilePath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        // Non-overwriting: process.env takes precedence
        if (!process.env[key]) process.env[key] = value;
      }
      console.log(`Loaded environment from ${envFileName} (EXPRSN_ENV=${exprsnEnv})`);
    } catch (err) {
      console.warn(`Failed to load ${envFileName}:`, err);
    }
  } else {
    console.log(`No ${envFileName} found — using existing process.env (EXPRSN_ENV=${exprsnEnv})`);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  // Mount setup wizard first (before any catch-all routes)
  // This must happen before PDS and other '/' mounted routes
  try {
    const optionalSetupPackage: string = '@exprsn/setup';
    const setupModule = (await import(optionalSetupPackage)) as {
      setupRouter?: Parameters<typeof app.route>[1];
    };
    if (setupModule.setupRouter) {
      app.route('/first-run', setupModule.setupRouter);
      console.log('Setup wizard mounted at /first-run');
    }
  } catch {
    // @exprsn/setup not installed - skip
  }

  // Mount routers that have global middleware AFTER setup wizard
  // This prevents adminAuthMiddleware from catching /first-run
  app.route('/', presetsRouter);
  app.route('/', clusterAdminRouter);
  app.route('/', gpuAdminRouter);
  app.route('/', adminPlatformRouter);
  app.route('/', adminTokensRouter);
  app.route('/', plcRouter);

  // Initialize email service (nodemailer + MailHog in dev)
  try {
    emailService.initialize();
    console.log('Email service initialized');
  } catch (err) {
    console.warn('Email service failed to initialize:', err);
  }

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

  // Initialize Redis for various services (relay, render, caching)
  const relayEnabled = process.env.RELAY_ENABLED === 'true';
  const renderEnabled = process.env.RENDER_ENABLED !== 'false';
  let redis: Redis | null = null;

  // Redis is needed for relay, render service, and caching
  if (relayEnabled || renderEnabled) {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      redis = new Redis(redisUrl);
      console.log('Redis connected');
    } catch (err) {
      console.warn('Failed to connect to Redis:', err);
    }
  }

  // Initialize relay service if enabled
  if (relayEnabled && redis) {
    try {
      relayService = new RelayService({
        redis,
        enableSocketIO: process.env.RELAY_SOCKETIO !== 'false',
        enableWebSocket: process.env.RELAY_WEBSOCKET !== 'false',
        enableJetstream: process.env.RELAY_JETSTREAM !== 'false',
        maxWsSubscribers: parseInt(process.env.RELAY_MAX_WS_SUBSCRIBERS || '1000', 10),
        maxJetstreamSubscribers: parseInt(process.env.RELAY_MAX_JETSTREAM_SUBSCRIBERS || '5000', 10),
        maxBackfillEvents: parseInt(process.env.RELAY_MAX_BACKFILL || '10000', 10),
        verifySignatures: process.env.RELAY_VERIFY_SIGNATURES === 'true',
      });

      // Set global relay service accessor for use by routes
      setRelayService(relayService);

      console.log('Relay service initialized');
    } catch (err) {
      console.warn('Failed to initialize relay service:', err);
    }
  }

  // Initialize RenderService if Redis is available
  if (redis) {
    try {
      const bucketName = process.env.S3_BUCKET || process.env.DO_SPACES_BUCKET || 'exprsn-renders';
      const cdnBaseUrl = process.env.CDN_URL || process.env.DO_SPACES_CDN || `https://${bucketName}.s3.amazonaws.com`;

      const storageProvider = new S3StorageProvider({
        bucketName,
        cdnBaseUrl,
      });

      initializeRenderService({
        redis,
        storageProvider,
        concurrency: parseInt(process.env.RENDER_WORKER_CONCURRENCY || '2', 10),
      });
      console.log('RenderService initialized');
    } catch (err) {
      console.warn('Failed to initialize RenderService:', err);
    }

    // Initialize DirectorySyncService for platform directory management
    try {
      const directorySyncService = DirectorySyncService.initialize(redis);
      const directorySyncConcurrency = parseInt(process.env.DIRECTORY_SYNC_CONCURRENCY || '2', 10);
      directorySyncService.startWorker(directorySyncConcurrency);
      console.log('DirectorySyncService initialized');
    } catch (err) {
      console.warn('Failed to initialize DirectorySyncService:', err);
    }

    // Initialize TranscodeWebhooks with BullMQ for reliable retry handling
    try {
      initializeTranscodeWebhooks(redis);
      console.log('TranscodeWebhooks initialized with BullMQ');
    } catch (err) {
      console.warn('Failed to initialize TranscodeWebhooks:', err);
    }

    // Initialize Adaptive Transcode Worker for HLS/DASH streaming
    const transcodeWorkerEnabled = process.env.TRANSCODE_WORKER_ENABLED !== 'false';
    if (transcodeWorkerEnabled) {
      try {
        await adaptiveTranscodeService.startWorker();
        console.log('AdaptiveTranscodeService worker started');
      } catch (err) {
        console.warn('Failed to start AdaptiveTranscodeService worker:', err);
      }
    }

    // Initialize Stream Events Worker for webhooks and notifications
    const streamEventsWorkerEnabled = process.env.STREAM_EVENTS_WORKER_ENABLED !== 'false';
    if (streamEventsWorkerEnabled) {
      try {
        const { startStreamEventsWorker } = await import('./services/streaming/StreamEventsQueue.js');
        startStreamEventsWorker();
        console.log('StreamEventsWorker started');
      } catch (err) {
        console.warn('Failed to start StreamEventsWorker:', err);
      }
    }
  }

  // Initialize prefetch job producer
  const prefetchProducerEnabled = process.env.PREFETCH_PRODUCER_ENABLED !== 'false';
  if (prefetchProducerEnabled) {
    try {
      const { initializePrefetchProducer } = await import('./services/prefetch/producer.js');
      initializePrefetchProducer();
      console.log('Prefetch producer initialized');
    } catch (err) {
      console.warn('Failed to initialize prefetch producer:', err);
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

    // Register preference computation job (every 15 minutes)
    const { UserPreferenceModel } = await import('./services/preferences/UserPreferenceModel.js');
    const prefModel = new UserPreferenceModel({
      db: db as import('drizzle-orm/postgres-js').PostgresJsDatabase<typeof schema>,
      lookbackDays: 7,
      decayHalfLifeDays: 3,
    });

    cronService.register('preference-computation', 15 * 60 * 1000, async () => {
      try {
        // Get active users (interacted in last 24h)
        const activeUsers = await db
          .selectDistinct({ did: schema.userInteractions.userDid })
          .from(schema.userInteractions)
          .where(gte(schema.userInteractions.createdAt, sql`NOW() - INTERVAL '24 hours'`));

        console.log(`Computing preferences for ${activeUsers.length} active users`);

        for (const { did } of activeUsers) {
          await prefModel.computePreferences(did);
        }

        console.log('Preference computation complete');
      } catch (err) {
        console.error('Preference computation failed:', err);
      }
    });
    console.log('Preference computation cron job registered');

    // Register creator fund distribution job (1st of each month at midnight UTC)
    const creatorFundEnabled = process.env.CREATOR_FUND_ENABLED === 'true';
    if (creatorFundEnabled) {
      const { nanoid } = await import('nanoid');
      const { format, subMonths } = await import('date-fns');

      // Run daily at midnight-ish, check if it's the 1st of the month
      cronService.register('creator-fund-distribution', 24 * 60 * 60 * 1000, async () => {
        // Only run on the 1st of the month
        const today = new Date();
        if (today.getUTCDate() !== 1) {
          return;
        }

        try {
          const poolAmount = parseInt(process.env.CREATOR_FUND_MONTHLY_POOL || '10000', 10) * 100; // cents
          const period = format(subMonths(today, 1), 'yyyy-MM');

          console.log(`Starting creator fund distribution for ${period}, pool: $${poolAmount / 100}`);

          // Get engagement scores for eligible creators (1000+ views last month)
          const eligibleCreators = await db
            .select({
              creatorDid: schema.videos.authorDid,
              totalViews: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)::int`,
              totalLikes: sql<number>`COALESCE(SUM(${schema.videos.likeCount}), 0)::int`,
            })
            .from(schema.videos)
            .where(
              gte(schema.videos.createdAt, sql`DATE_TRUNC('month', NOW() - INTERVAL '1 month')`)
            )
            .groupBy(schema.videos.authorDid)
            .having(sql`SUM(${schema.videos.viewCount}) >= 1000`);

          if (eligibleCreators.length === 0) {
            console.log('No eligible creators for creator fund this period');
            return;
          }

          // Calculate total engagement (views * 1 + likes * 5)
          const totalEngagement = eligibleCreators.reduce(
            (sum, c) => sum + c.totalViews + c.totalLikes * 5,
            0
          );

          // Distribute pool based on engagement share
          for (const creator of eligibleCreators) {
            const engagement = creator.totalViews + creator.totalLikes * 5;
            const share = engagement / totalEngagement;
            const payout = Math.floor(poolAmount * share);

            if (payout < 100) continue; // Skip payouts under $1

            await db.insert(schema.creatorFundPayouts).values({
              id: nanoid(),
              creatorDid: creator.creatorDid,
              period,
              viewCount: creator.totalViews,
              engagementScore: engagement,
              poolShare: share,
              amount: payout,
              status: 'pending',
            }).onConflictDoNothing();

            // Add to creator earnings
            await db
              .insert(schema.creatorEarnings)
              .values({
                userDid: creator.creatorDid,
                totalEarnings: payout,
                pendingBalance: payout,
                availableBalance: 0,
              })
              .onConflictDoUpdate({
                target: schema.creatorEarnings.userDid,
                set: {
                  totalEarnings: sql`${schema.creatorEarnings.totalEarnings} + ${payout}`,
                  pendingBalance: sql`${schema.creatorEarnings.pendingBalance} + ${payout}`,
                  updatedAt: new Date(),
                },
              });
          }

          console.log(`Creator fund distributed to ${eligibleCreators.length} creators`);
        } catch (err) {
          console.error('Creator fund distribution failed:', err);
        }
      });
      console.log('Creator fund cron job registered');
    }

    // Register weekly digest email job (runs daily, fires on Mondays at ~9am UTC)
    const digestEnabled = process.env.EMAIL_DIGEST_ENABLED !== 'false';
    if (digestEnabled) {
      // Check every hour; actually send only on Monday between 09:00–10:00 UTC
      cronService.register('weekly-digest', 60 * 60 * 1000, async () => {
        const now = new Date();
        // getDay() returns 1 for Monday (UTC); only run during the 09:xx UTC hour
        if (now.getUTCDay() !== 1 || now.getUTCHours() !== 9) {
          return;
        }

        console.log('[digest] Starting weekly digest run...');

        try {
          // Find users who have opted into a weekly digest via their notification settings
          // emailDigest is stored as a jsonb column on user_settings
          const weeklyUsers = await db
            .select({
              did: schema.userSettings.userDid,
            })
            .from(schema.userSettings)
            .where(
              sql`${schema.userSettings.notifications}->>'emailDigest' = 'weekly'`
            );

          console.log(`[digest] Sending to ${weeklyUsers.length} weekly-digest users`);

          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          for (const { did } of weeklyUsers) {
            try {
              // Fetch the user record to get email and handle
              const account = await db.query.actorRepos.findFirst({
                where: eq(schema.actorRepos.did, did),
              });

              if (!account?.email) continue;

              // Compute new followers this week (use indexedAt — db-managed, always present)
              const [followerRow] = await db
                .select({ count: sql<number>`COUNT(*)::int` })
                .from(schema.follows)
                .where(
                  and(
                    eq(schema.follows.followeeDid, did),
                    gte(schema.follows.indexedAt, oneWeekAgo)
                  )
                );

              // Compute new likes this week across all the user's videos
              const [likeRow] = await db
                .select({ count: sql<number>`COUNT(*)::int` })
                .from(schema.likes)
                .innerJoin(schema.videos, eq(schema.likes.videoUri, schema.videos.uri))
                .where(
                  and(
                    eq(schema.videos.authorDid, did),
                    gte(schema.likes.indexedAt, oneWeekAgo)
                  )
                );

              // Compute new comments this week
              const [commentRow] = await db
                .select({ count: sql<number>`COUNT(*)::int` })
                .from(schema.comments)
                .innerJoin(schema.videos, eq(schema.comments.videoUri, schema.videos.uri))
                .where(
                  and(
                    eq(schema.videos.authorDid, did),
                    gte(schema.comments.indexedAt, oneWeekAgo)
                  )
                );

              // Find the top video by view count published this week
              const [topVideo] = await db
                .select({
                  caption: schema.videos.caption,
                  views: schema.videos.viewCount,
                })
                .from(schema.videos)
                .where(
                  and(
                    eq(schema.videos.authorDid, did),
                    gte(schema.videos.indexedAt, oneWeekAgo)
                  )
                )
                .orderBy(desc(schema.videos.viewCount))
                .limit(1);

              await emailService.sendDigest(account.email, account.handle, {
                newFollowers: followerRow?.count ?? 0,
                newLikes: likeRow?.count ?? 0,
                newComments: commentRow?.count ?? 0,
                topVideoCaption: topVideo?.caption ?? undefined,
                topVideoViews: topVideo?.views ?? undefined,
              });
            } catch (userErr) {
              console.error(`[digest] Failed for ${did}:`, userErr);
            }
          }

          console.log('[digest] Weekly digest run complete');
        } catch (err) {
          console.error('[digest] Weekly digest failed:', err);
        }
      });
      console.log('Weekly digest cron job registered');
    }
  }

  // Initialize OAuth agent for automated token management
  const oauthAgentEnabled = process.env.OAUTH_AGENT_ENABLED !== 'false';
  if (oauthAgentEnabled) {
    await oauthAgent.initialize();
  }

  // Initialize moderation workflow event handlers
  const { initializeWorkflowEventHandlers } = await import('./services/moderation/WorkflowEventHandlers.js');
  initializeWorkflowEventHandlers();

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

  // Wire up relay bridge so write paths can emit federation events without
  // importing the relay service directly.
  initRelayBridge(relayService, syncService);
  console.log('Relay bridge initialized');

  // ── Auto-bootstrap certificate chain ──
  const caAutoBootstrap = process.env.CA_AUTO_BOOTSTRAP !== 'false';
  if (caAutoBootstrap) {
    try {
      const { autoBootstrapCertificateChain } = await import('./services/ca/autoBootstrapCerts.js');
      await autoBootstrapCertificateChain({
        domain: process.env.SERVICE_DOMAIN || 'localhost',
      });
    } catch (err) {
      console.warn('[ca-bootstrap] Certificate auto-bootstrap failed:', err instanceof Error ? err.message : err);
    }
  }

  // ── TLS configuration ──
  const tlsEnabled = process.env.TLS_ENABLED === 'true';
  const tlsCertPath = process.env.TLS_CERT_PATH
    ? resolve(monorepoRoot, process.env.TLS_CERT_PATH)
    : resolve(monorepoRoot, 'deploy/nginx/ssl/fullchain.pem');
  const tlsKeyPath = process.env.TLS_KEY_PATH
    ? resolve(monorepoRoot, process.env.TLS_KEY_PATH)
    : resolve(monorepoRoot, 'deploy/nginx/ssl/privkey.pem');

  const hasTlsCerts = existsSync(tlsCertPath) && existsSync(tlsKeyPath);
  const useTls = tlsEnabled && hasTlsCerts;

  if (useTls) {
    console.log(`Starting Exprsn API server on https://${host}:${port} (TLS 1.3)`);
  } else {
    console.log(`Starting Exprsn API server on http://${host}:${port}`);
    if (tlsEnabled && !hasTlsCerts) {
      console.warn('TLS_ENABLED=true but certificate files not found — falling back to HTTP');
    }
  }

  const serveOptions: Parameters<typeof serve>[0] = {
    fetch: app.fetch,
    port,
    hostname: host,
  };

  if (useTls) {
    (serveOptions as any).createServer = createHttpsServer;
    (serveOptions as any).serverOptions = {
      cert: readFileSync(tlsCertPath, 'utf-8'),
      key: readFileSync(tlsKeyPath, 'utf-8'),
      minVersion: 'TLSv1.3' as const,
      maxVersion: 'TLSv1.3' as const,
    };
  }

  const server = serve(serveOptions);

  // ------------------------------------------------------------------
  // Raw WebSocket server for AT Protocol firehose endpoints.
  // This runs alongside Socket.IO so that standard atproto clients
  // (which expect plain WebSocket, not Socket.IO) can connect.
  // ------------------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true });

  (server as any).on('upgrade', (request: any, socket: any, head: any) => {
    try {
      const urlStr = request.url || '/';
      const baseUrl = `http://${request.headers.host || 'localhost'}`;
      const url = new URL(urlStr, baseUrl);

      if (url.pathname === '/xrpc/com.atproto.sync.subscribeRepos') {
        wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          // Delegate to relay service's proper WS firehose when available
          const wsFirehose = relayService?.getWsFirehose();
          if (wsFirehose) {
            wsFirehose.handleConnection(ws, url).catch((err) => {
              console.error('[ws-firehose] unhandled error:', err);
              ws.close();
            });
          } else {
            // Fallback to legacy shim
            handleFirehoseConnection(ws, url).catch((err) => {
              console.error('[firehose-ws] unhandled error:', err);
              ws.close();
            });
          }
        });
      } else if (
        url.pathname === '/jetstream/subscribe' ||
        url.pathname === '/xrpc/io.exprsn.sync.subscribeJetstream'
      ) {
        wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          // Delegate to relay service's Jetstream server when available
          const jsServer = relayService?.getJetstreamServer();
          if (jsServer) {
            jsServer.handleConnection(ws, url).catch((err) => {
              console.error('[jetstream] unhandled error:', err);
              ws.close();
            });
          } else {
            // Fallback to legacy shim
            handleJetstreamConnection(ws, url);
          }
        });
      }
      // All other upgrade requests (Socket.IO) are left for Socket.IO to
      // handle — we must NOT destroy the socket here.
    } catch (err) {
      console.error('[ws-upgrade] error parsing upgrade request:', err);
    }
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
  initializeRenderProgressWebSocket(io);
  initializeAdminWebSocket(io);
  initializeWatchPartyWebSocket(io);
  initializeLiveChatWebSocket(io);
  initializeTranscodeProgressWebSocket(io);

  // Initialize relay firehose WebSocket if enabled
  if (relayEnabled && relayService) {
    relayService.initialize(io);
    console.log('Relay firehose initialized at: /xrpc/com.atproto.sync.subscribeRepos');

    // Mount relay HTTP routes
    const relayRouter = relayService.createRouter();
    app.route('/xrpc', relayRouter);
  }

  // Initialize federation consumer for inbound federation
  const federationConsumerEnabled = process.env.FEDERATION_CONSUMER_ENABLED === 'true';
  if (federationConsumerEnabled) {
    try {
      const { FederationConsumerWorker } = await import('./workers/federationConsumer.js');
      const federationConsumer = new FederationConsumerWorker({
        db: db as import('drizzle-orm/postgres-js').PostgresJsDatabase<typeof schema>,
      });
      await federationConsumer.start();
      console.log('Federation consumer started');
    } catch (err) {
      console.error('Failed to start federation consumer:', err);
    }
  }

  console.log(`Server running at ${useTls ? 'https' : 'http'}://${host}:${port}`);
  console.log('Raw WebSocket endpoints: /xrpc/com.atproto.sync.subscribeRepos (DAG-CBOR firehose), /jetstream/subscribe (Jetstream JSON)');
  console.log('WebSocket namespaces: /chat, /editor-collab, /render-progress, /transcode-progress, /admin, /watch-party' + (relayEnabled ? ', /xrpc/com.atproto.sync.subscribeRepos (Socket.IO)' : ''));
  console.log('Well-known endpoints: /.well-known/atproto-did, /.well-known/did.json, /.well-known/openid-configuration, /.well-known/exprsn-services, /.well-known/crl.pem');
  console.log('CA/Token endpoints: /ocsp, /xrpc/io.exprsn.token.*, /xrpc/io.exprsn.auth.*, /xrpc/io.exprsn.cert.*, /xrpc/io.exprsn.security.*');
  console.log('SSO endpoints: /sso/oauth/authorize, /sso/oauth/token, /sso/oauth/userinfo, /sso/oauth/jwks');
  console.log('SAML endpoints: /sso/saml/metadata, /sso/saml/sso, /sso/saml/slo');
  console.log('Social login: /sso/auth/providers, /sso/auth/:providerId/login, /sso/auth/callback');

  // Graceful shutdown handling
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });

    // Close WebSocket connections
    io.close(() => {
      console.log('WebSocket server closed');
    });

    // Give ongoing requests time to complete (max 30 seconds)
    const shutdownTimeout = setTimeout(() => {
      console.warn('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, 30000);

    try {
      // Stop cron jobs if running
      if (cronEnabled) {
        cronService.stop();
        console.log('Cron service stopped');
      }

      // Close Redis connection if using Redis
      if (redis && typeof (redis as any).quit === 'function') {
        await (redis as any).quit();
        console.log('Redis connection closed');
      }

      // Wait for server to fully close
      await new Promise<void>((resolve) => {
        const checkClosed = setInterval(() => {
          if (!(server as any).connections || (server as any).connections === 0) {
            clearInterval(checkClosed);
            resolve();
          }
        }, 100);
      });

      clearTimeout(shutdownTimeout);
      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
