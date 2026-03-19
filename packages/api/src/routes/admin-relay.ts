import { Hono } from 'hono';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { getRelayService } from '../services/relay/index.js';

const router = new Hono();

// Apply admin auth to all routes
router.use('*', adminAuthMiddleware);

/**
 * GET /xrpc/io.exprsn.admin.relay.getConfig
 * Returns relay protocol configuration
 */
router.get(
  '/io.exprsn.admin.relay.getConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const relay = getRelayService();
    if (!relay) {
      return c.json({ error: 'Relay service not enabled' }, 503);
    }

    const config = relay.getProtocolConfig();
    const summary = await relay.getBackfillSummary();

    return c.json({
      ...config,
      sequence: summary,
    });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.relay.updateConfig
 * Update relay configuration (audit logged)
 */
router.post(
  '/io.exprsn.admin.relay.updateConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    // Config changes require a restart to take effect since they are
    // set via environment variables. This endpoint acknowledges the
    // request and returns the current config.
    const relay = getRelayService();
    if (!relay) {
      return c.json({ error: 'Relay service not enabled' }, 503);
    }

    const config = relay.getProtocolConfig();
    return c.json({
      message: 'Relay configuration is set via environment variables. Restart the service to apply changes.',
      current: config,
    });
  }
);

/**
 * GET /xrpc/io.exprsn.admin.relay.getStats
 * Returns per-protocol live stats
 */
router.get(
  '/io.exprsn.admin.relay.getStats',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const relay = getRelayService();
    if (!relay) {
      return c.json({ error: 'Relay service not enabled' }, 503);
    }

    const stats = relay.getStats();
    const summary = await relay.getBackfillSummary();

    return c.json({
      protocols: stats,
      sequence: summary,
      totalClients: relay.getClientCount(),
    });
  }
);

/**
 * GET /xrpc/io.exprsn.admin.relay.getSubscribers
 * Returns subscribers filtered by protocol
 */
router.get(
  '/io.exprsn.admin.relay.getSubscribers',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const relay = getRelayService();
    if (!relay) {
      return c.json({ error: 'Relay service not enabled' }, 503);
    }

    const protocol = c.req.query('protocol');
    const subscribers = await relay.listSubscribers();

    const filtered = protocol
      ? subscribers.filter(s => s.endpoint === protocol)
      : subscribers;

    // Enrich with WebSocket/Jetstream client info
    const wsClients = relay.getWsFirehose()?.getClients() || [];
    const jsClients = relay.getJetstreamServer()?.getClients() || [];

    return c.json({
      subscribers: filtered,
      wsClients: protocol === 'websocket' || !protocol ? wsClients : [],
      jetstreamClients: protocol === 'jetstream' || !protocol ? jsClients : [],
    });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.relay.disconnectSubscriber
 * Force disconnect a subscriber
 */
router.post(
  '/io.exprsn.admin.relay.disconnectSubscriber',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const relay = getRelayService();
    if (!relay) {
      return c.json({ error: 'Relay service not enabled' }, 503);
    }

    const body = await c.req.json<{ subscriberId: string }>();
    if (!body.subscriberId) {
      return c.json({ error: 'subscriberId is required' }, 400);
    }

    relay.disconnectSubscriber(body.subscriberId);

    return c.json({ success: true, disconnected: body.subscriberId });
  }
);

/**
 * GET /xrpc/io.exprsn.admin.relay.getProtocolHealth
 * Health status per endpoint
 */
router.get(
  '/io.exprsn.admin.relay.getProtocolHealth',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const relay = getRelayService();
    if (!relay) {
      return c.json({ error: 'Relay service not enabled' }, 503);
    }

    const config = relay.getProtocolConfig();
    const stats = relay.getStats();

    const getHealth = (enabled: boolean, clients: number) => {
      if (!enabled) return 'disabled';
      if (clients > 0) return 'healthy';
      return 'idle';
    };

    return c.json({
      socketio: {
        enabled: config.socketio.enabled,
        status: getHealth(config.socketio.enabled, stats.socketio.connectedClients),
        clients: stats.socketio.connectedClients,
        eventsPerSec: stats.socketio.eventsPerSec,
      },
      websocket: {
        enabled: config.websocket.enabled,
        status: getHealth(config.websocket.enabled, stats.websocket.connectedClients),
        clients: stats.websocket.connectedClients,
        eventsPerSec: stats.websocket.eventsPerSec,
      },
      jetstream: {
        enabled: config.jetstream.enabled,
        status: getHealth(config.jetstream.enabled, stats.jetstream.connectedClients),
        clients: stats.jetstream.connectedClients,
        eventsPerSec: stats.jetstream.eventsPerSec,
      },
    });
  }
);

export { router as adminRelayRouter };
