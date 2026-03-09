import { serve } from '@hono/node-server';
import { compress } from '@hono/node-server/compress';
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
import { createWellKnownRouterFromEnv, createOCSPRouter } from './routes/well-known.js';
import { tokenRouter } from './routes/tokens.js';
import { certAuthRouter } from './routes/auth-certificate.js';
import { certExportRouter } from './routes/certificates-export.js';
import { pinningRouter } from './routes/pinning.js';
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
import { renderAdminRouter } from './routes/render-admin.js';
import { presetsRouter } from './routes/presets.js';
import { clusterAdminRouter } from './routes/cluster-admin.js';
import { analyticsRoutes } from './routes/analytics.js';
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
import { initializeIdentityService } from './services/identity/index.js';
import { cronService } from './services/cron/index.js';
import { oauthAgent } from './services/oauth/OAuthAgent.js';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { gte, sql } from 'drizzle-orm';
import { scopeExtractMiddleware, domainContextMiddleware, configBasedRateLimit } from './auth/scope-middleware.js';
import { Redis } from 'ioredis';
import { RelayService, CommitEvent as RelayCommitEvent } from '@exprsn/relay';
import { initializeRenderService, S3StorageProvider } from './services/studio/RenderService.js';
import { setRelayService } from './services/relay/index.js';

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
  allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-Admin'],
}));
app.use('*', logger());
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
app.route('/xrpc', renderAdminRouter); // Render pipeline admin
// NOTE: presetsRouter and clusterAdminRouter are mounted in main() after setup wizard
// because clusterAdminRouter.use('*', adminAuthMiddleware) would intercept /first-run
app.route('/xrpc', analyticsRoutes); // Creator analytics
app.route('/xrpc', videoDeletionRouter); // Video deletion and upload retry
app.route('/xrpc', videoModerationRouter); // Content moderation gate and queue
app.route('/xrpc', userModerationRouter); // User-facing moderation (reports, sanctions, appeals)
app.route('/xrpc', searchRouter); // Search across videos, users, sounds
app.route('/', pushRouter); // Push notification token management
app.route('/', analyticsRouter); // Creator analytics dashboard
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
  app.route('/', plcRouter);

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
        maxBackfillEvents: parseInt(process.env.RELAY_MAX_BACKFILL || '10000', 10),
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
  initializeRenderProgressWebSocket(io);
  initializeAdminWebSocket(io);
  initializeWatchPartyWebSocket(io);
  initializeLiveChatWebSocket(io);

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

  console.log(`Server running at http://${host}:${port}`);
  console.log('WebSocket namespaces: /chat, /editor-collab, /render-progress, /admin, /watch-party' + (relayEnabled ? ', /xrpc/com.atproto.sync.subscribeRepos' : ''));
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
          // @ts-expect-error - connections is internal
          if (!server.connections || server.connections === 0) {
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
