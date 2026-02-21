import { Hono } from 'hono';
import { ServiceRegistry, ServiceType, ServiceStatus } from '../services/registry/ServiceRegistry.js';
import { db } from '../db/index.js';

// Create registry singleton
let registry: ServiceRegistry | null = null;

export function getServiceRegistry(): ServiceRegistry {
  if (!registry) {
    registry = new ServiceRegistry({ db });
  }
  return registry;
}

export function initializeServiceRegistry(config?: { startHealthChecks?: boolean }): ServiceRegistry {
  registry = new ServiceRegistry({ db });

  if (config?.startHealthChecks) {
    registry.startHealthChecks();
  }

  return registry;
}

const registryRouter = new Hono();

/**
 * GET io.exprsn.registry.discover
 * Discover federated services by type
 */
registryRouter.get('/io.exprsn.registry.discover', async (c) => {
  const type = c.req.query('type') as ServiceType | undefined;
  const status = c.req.query('status') as ServiceStatus | undefined;
  const region = c.req.query('region');
  const capability = c.req.query('capability');

  try {
    const serviceRegistry = getServiceRegistry();
    const services = await serviceRegistry.discover(type, {
      status,
      region: region || undefined,
      capability: capability || undefined,
    });

    return c.json({
      services: services.map((s) => ({
        id: s.id,
        type: s.type,
        endpoint: s.endpoint,
        did: s.did,
        region: s.region,
        capabilities: s.capabilities,
        status: s.status,
        lastHealthCheck: s.lastHealthCheck?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Service discovery error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to discover services' }, 500);
  }
});

/**
 * GET io.exprsn.registry.getService
 * Get a specific service by ID
 */
registryRouter.get('/io.exprsn.registry.getService', async (c) => {
  const id = c.req.query('id');

  if (!id) {
    return c.json({ error: 'InvalidRequest', message: 'Missing id parameter' }, 400);
  }

  try {
    const serviceRegistry = getServiceRegistry();
    const service = await serviceRegistry.get(id);

    if (!service) {
      return c.json({ error: 'NotFound', message: 'Service not found' }, 404);
    }

    return c.json({
      id: service.id,
      type: service.type,
      endpoint: service.endpoint,
      did: service.did,
      certificateId: service.certificateId,
      region: service.region,
      capabilities: service.capabilities,
      status: service.status,
      lastHealthCheck: service.lastHealthCheck?.toISOString(),
      healthCheckFailures: service.healthCheckFailures,
      metadata: service.metadata,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Get service error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get service' }, 500);
  }
});

/**
 * POST io.exprsn.registry.register
 * Register a new federated service (requires auth)
 */
registryRouter.post('/io.exprsn.registry.register', async (c) => {
  // TODO: Add service auth or admin auth check

  const body = await c.req.json<{
    type: ServiceType;
    endpoint: string;
    did?: string;
    certificateId?: string;
    region?: string;
    capabilities?: string[];
    metadata?: Record<string, unknown>;
  }>();

  if (!body.type || !body.endpoint) {
    return c.json({ error: 'InvalidRequest', message: 'Missing type or endpoint' }, 400);
  }

  const validTypes: ServiceType[] = ['pds', 'relay', 'appview', 'labeler'];
  if (!validTypes.includes(body.type)) {
    return c.json({ error: 'InvalidRequest', message: 'Invalid service type' }, 400);
  }

  try {
    const serviceRegistry = getServiceRegistry();

    // Check if endpoint already registered
    const existing = await serviceRegistry.getByEndpoint(body.endpoint);
    if (existing) {
      return c.json({ error: 'Conflict', message: 'Service endpoint already registered' }, 409);
    }

    const id = await serviceRegistry.register({
      type: body.type,
      endpoint: body.endpoint,
      did: body.did,
      certificateId: body.certificateId,
      region: body.region,
      capabilities: body.capabilities,
      status: 'active',
      metadata: body.metadata,
    });

    return c.json({ id, success: true });
  } catch (error) {
    console.error('Service registration error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to register service' }, 500);
  }
});

/**
 * POST io.exprsn.registry.update
 * Update a registered service
 */
registryRouter.post('/io.exprsn.registry.update', async (c) => {
  // TODO: Add service auth or admin auth check

  const body = await c.req.json<{
    id: string;
    endpoint?: string;
    did?: string;
    certificateId?: string;
    region?: string;
    capabilities?: string[];
    status?: ServiceStatus;
    metadata?: Record<string, unknown>;
  }>();

  if (!body.id) {
    return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
  }

  try {
    const serviceRegistry = getServiceRegistry();
    const existing = await serviceRegistry.get(body.id);

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Service not found' }, 404);
    }

    await serviceRegistry.update(body.id, {
      endpoint: body.endpoint,
      did: body.did,
      certificateId: body.certificateId,
      region: body.region,
      capabilities: body.capabilities,
      status: body.status,
      metadata: body.metadata,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Service update error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to update service' }, 500);
  }
});

/**
 * POST io.exprsn.registry.remove
 * Remove a registered service
 */
registryRouter.post('/io.exprsn.registry.remove', async (c) => {
  // TODO: Add admin auth check

  const body = await c.req.json<{ id: string }>();

  if (!body.id) {
    return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
  }

  try {
    const serviceRegistry = getServiceRegistry();
    await serviceRegistry.remove(body.id);

    return c.json({ success: true });
  } catch (error) {
    console.error('Service removal error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to remove service' }, 500);
  }
});

/**
 * POST io.exprsn.registry.healthCheck
 * Trigger health check for a service or all services
 */
registryRouter.post('/io.exprsn.registry.healthCheck', async (c) => {
  // TODO: Add admin auth check

  const body = await c.req.json<{ id?: string; all?: boolean }>();

  try {
    const serviceRegistry = getServiceRegistry();

    if (body.all) {
      const results = await serviceRegistry.healthCheckAll();

      const summary: Record<string, { healthy: boolean; latencyMs: number; error?: string }> = {};
      for (const [id, result] of results) {
        summary[id] = {
          healthy: result.healthy,
          latencyMs: result.latencyMs,
          error: result.error,
        };
      }

      return c.json({ results: summary });
    }

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id or all flag' }, 400);
    }

    const service = await serviceRegistry.get(body.id);
    if (!service) {
      return c.json({ error: 'NotFound', message: 'Service not found' }, 404);
    }

    const result = await serviceRegistry.healthCheck(service);

    return c.json({
      id: body.id,
      healthy: result.healthy,
      latencyMs: result.latencyMs,
      error: result.error,
      version: result.version,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to perform health check' }, 500);
  }
});

/**
 * GET io.exprsn.registry.getRelays
 * Get all active relay endpoints
 */
registryRouter.get('/io.exprsn.registry.getRelays', async (c) => {
  try {
    const serviceRegistry = getServiceRegistry();
    const relays = await serviceRegistry.getRelays();

    return c.json({ relays });
  } catch (error) {
    console.error('Get relays error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get relays' }, 500);
  }
});

/**
 * GET io.exprsn.registry.getPdsEndpoints
 * Get all active PDS endpoints
 */
registryRouter.get('/io.exprsn.registry.getPdsEndpoints', async (c) => {
  try {
    const serviceRegistry = getServiceRegistry();
    const endpoints = await serviceRegistry.getPdsEndpoints();

    return c.json({ endpoints });
  } catch (error) {
    console.error('Get PDS endpoints error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get PDS endpoints' }, 500);
  }
});

/**
 * GET io.exprsn.registry.getAppviews
 * Get all active appview endpoints
 */
registryRouter.get('/io.exprsn.registry.getAppviews', async (c) => {
  try {
    const serviceRegistry = getServiceRegistry();
    const appviews = await serviceRegistry.getAppviews();

    return c.json({ appviews });
  } catch (error) {
    console.error('Get appviews error:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get appviews' }, 500);
  }
});

export { registryRouter };
export default registryRouter;
