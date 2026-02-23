/**
 * Cluster Admin API Routes
 * Manage render clusters (Docker/Kubernetes)
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import { renderClusters, renderWorkers } from '../db/schema.js';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { adminAuthMiddleware } from '../auth/middleware.js';

const clusterAdminRouter = new Hono();

// Apply admin auth to all routes
clusterAdminRouter.use('*', adminAuthMiddleware);

/**
 * List all clusters
 * GET /xrpc/io.exprsn.admin.cluster.list
 */
clusterAdminRouter.get('/xrpc/io.exprsn.admin.cluster.list', async (c) => {
  const clusters = await db
    .select()
    .from(renderClusters)
    .orderBy(desc(renderClusters.createdAt));

  // Get worker counts for each cluster
  const clusterStats = await Promise.all(
    clusters.map(async (cluster) => {
      const [workers] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where status = 'active')`,
          offline: sql<number>`count(*) filter (where last_heartbeat < now() - interval '1 minute')`,
        })
        .from(renderWorkers)
        .where(
          sql`metadata->>'clusterId' = ${cluster.id}`
        );

      return {
        ...cluster,
        workerStats: workers || { total: 0, active: 0, offline: 0 },
      };
    })
  );

  return c.json({ clusters: clusterStats });
});

/**
 * Get a specific cluster
 * GET /xrpc/io.exprsn.admin.cluster.get
 */
clusterAdminRouter.get('/xrpc/io.exprsn.admin.cluster.get', async (c) => {
  const clusterId = c.req.query('clusterId');

  if (!clusterId) {
    return c.json({ error: 'clusterId is required' }, 400);
  }

  const [cluster] = await db
    .select()
    .from(renderClusters)
    .where(eq(renderClusters.id, clusterId))
    .limit(1);

  if (!cluster) {
    return c.json({ error: 'Cluster not found' }, 404);
  }

  // Get workers for this cluster
  const workers = await db
    .select()
    .from(renderWorkers)
    .where(sql`metadata->>'clusterId' = ${clusterId}`)
    .orderBy(desc(renderWorkers.lastHeartbeat));

  return c.json({ cluster, workers });
});

/**
 * Create a new cluster
 * POST /xrpc/io.exprsn.admin.cluster.create
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.cluster.create', async (c) => {
  const body = await c.req.json<{
    name: string;
    type: 'docker' | 'kubernetes';
    endpoint?: string;
    region?: string;
    maxWorkers?: number;
    gpuEnabled?: boolean;
    config?: Record<string, unknown>;
    priorityRouting?: {
      urgent?: boolean;
      high?: boolean;
      normal?: boolean;
      low?: boolean;
    };
  }>();

  if (!body.name || !body.type) {
    return c.json({ error: 'name and type are required' }, 400);
  }

  const clusterId = `cluster_${nanoid(12)}`;

  const [cluster] = await db
    .insert(renderClusters)
    .values({
      id: clusterId,
      name: body.name,
      type: body.type,
      endpoint: body.endpoint,
      region: body.region,
      maxWorkers: body.maxWorkers,
      gpuEnabled: body.gpuEnabled || false,
      config: body.config,
      priorityRouting: body.priorityRouting || {
        urgent: true,
        high: true,
        normal: true,
        low: true,
      },
      status: 'active',
    })
    .returning();

  return c.json({ cluster }, 201);
});

/**
 * Update a cluster
 * POST /xrpc/io.exprsn.admin.cluster.update
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.cluster.update', async (c) => {
  const body = await c.req.json<{
    clusterId: string;
    name?: string;
    endpoint?: string;
    region?: string;
    maxWorkers?: number;
    gpuEnabled?: boolean;
    config?: Record<string, unknown>;
    priorityRouting?: {
      urgent?: boolean;
      high?: boolean;
      normal?: boolean;
      low?: boolean;
    };
    status?: 'active' | 'draining' | 'offline';
  }>();

  if (!body.clusterId) {
    return c.json({ error: 'clusterId is required' }, 400);
  }

  const updates: Partial<typeof renderClusters.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.endpoint !== undefined) updates.endpoint = body.endpoint;
  if (body.region !== undefined) updates.region = body.region;
  if (body.maxWorkers !== undefined) updates.maxWorkers = body.maxWorkers;
  if (body.gpuEnabled !== undefined) updates.gpuEnabled = body.gpuEnabled;
  if (body.config !== undefined) updates.config = body.config;
  if (body.priorityRouting !== undefined) updates.priorityRouting = body.priorityRouting;
  if (body.status !== undefined) updates.status = body.status;

  const [cluster] = await db
    .update(renderClusters)
    .set(updates)
    .where(eq(renderClusters.id, body.clusterId))
    .returning();

  if (!cluster) {
    return c.json({ error: 'Cluster not found' }, 404);
  }

  return c.json({ cluster });
});

/**
 * Delete a cluster
 * POST /xrpc/io.exprsn.admin.cluster.delete
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.cluster.delete', async (c) => {
  const body = await c.req.json<{ clusterId: string }>();

  if (!body.clusterId) {
    return c.json({ error: 'clusterId is required' }, 400);
  }

  // Check if cluster has active workers
  const [activeWorkers] = await db
    .select({ count: sql<number>`count(*)` })
    .from(renderWorkers)
    .where(
      and(
        sql`metadata->>'clusterId' = ${body.clusterId}`,
        eq(renderWorkers.status, 'active')
      )
    );

  if (activeWorkers && activeWorkers.count > 0) {
    return c.json(
      { error: 'Cannot delete cluster with active workers. Drain workers first.' },
      400
    );
  }

  await db.delete(renderClusters).where(eq(renderClusters.id, body.clusterId));

  return c.json({ success: true });
});

/**
 * Scale cluster workers (for Kubernetes clusters)
 * POST /xrpc/io.exprsn.admin.cluster.scale
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.cluster.scale', async (c) => {
  const body = await c.req.json<{
    clusterId: string;
    replicas: number;
  }>();

  if (!body.clusterId || body.replicas === undefined) {
    return c.json({ error: 'clusterId and replicas are required' }, 400);
  }

  const [cluster] = await db
    .select()
    .from(renderClusters)
    .where(eq(renderClusters.id, body.clusterId))
    .limit(1);

  if (!cluster) {
    return c.json({ error: 'Cluster not found' }, 404);
  }

  if (cluster.type !== 'kubernetes') {
    return c.json({ error: 'Scaling is only supported for Kubernetes clusters' }, 400);
  }

  // In a real implementation, this would call the Kubernetes API
  // For now, we just update the desired worker count
  const [updated] = await db
    .update(renderClusters)
    .set({
      maxWorkers: body.replicas,
      updatedAt: new Date(),
    })
    .where(eq(renderClusters.id, body.clusterId))
    .returning();

  // TODO: Implement actual Kubernetes scaling via kubectl or client-go
  // const k8sClient = getK8sClient(cluster.config);
  // await k8sClient.apps.v1.deployments.scale('render-worker', body.replicas);

  return c.json({
    cluster: updated,
    message: `Scaling to ${body.replicas} workers requested`,
  });
});

/**
 * Get cluster metrics
 * GET /xrpc/io.exprsn.admin.cluster.getMetrics
 */
clusterAdminRouter.get('/xrpc/io.exprsn.admin.cluster.getMetrics', async (c) => {
  const clusterId = c.req.query('clusterId');

  if (!clusterId) {
    return c.json({ error: 'clusterId is required' }, 400);
  }

  const [cluster] = await db
    .select()
    .from(renderClusters)
    .where(eq(renderClusters.id, clusterId))
    .limit(1);

  if (!cluster) {
    return c.json({ error: 'Cluster not found' }, 404);
  }

  // Get worker metrics
  const workers = await db
    .select()
    .from(renderWorkers)
    .where(sql`metadata->>'clusterId' = ${clusterId}`);

  const totalProcessed = workers.reduce((sum, w) => sum + (w.totalProcessed || 0), 0);
  const totalFailed = workers.reduce((sum, w) => sum + (w.failedJobs || 0), 0);
  const activeJobs = workers.reduce((sum, w) => sum + (w.activeJobs || 0), 0);
  const avgProcessingTime =
    workers.length > 0
      ? workers.reduce((sum, w) => sum + (w.avgProcessingTime || 0), 0) / workers.length
      : 0;

  return c.json({
    clusterId,
    metrics: {
      workerCount: workers.length,
      activeWorkers: workers.filter((w) => w.status === 'active').length,
      offlineWorkers: workers.filter(
        (w) => !w.lastHeartbeat || new Date().getTime() - w.lastHeartbeat.getTime() > 60000
      ).length,
      totalJobsProcessed: totalProcessed,
      totalJobsFailed: totalFailed,
      activeJobs,
      averageProcessingTimeSeconds: Math.round(avgProcessingTime),
      successRate: totalProcessed > 0 ? ((totalProcessed - totalFailed) / totalProcessed) * 100 : 100,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Drain a cluster (stop accepting new jobs)
 * POST /xrpc/io.exprsn.admin.cluster.drain
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.cluster.drain', async (c) => {
  const body = await c.req.json<{ clusterId: string }>();

  if (!body.clusterId) {
    return c.json({ error: 'clusterId is required' }, 400);
  }

  const [cluster] = await db
    .update(renderClusters)
    .set({
      status: 'draining',
      updatedAt: new Date(),
    })
    .where(eq(renderClusters.id, body.clusterId))
    .returning();

  if (!cluster) {
    return c.json({ error: 'Cluster not found' }, 404);
  }

  // Update all workers in this cluster to draining
  await db
    .update(renderWorkers)
    .set({ status: 'draining' })
    .where(sql`metadata->>'clusterId' = ${body.clusterId}`);

  return c.json({ cluster, message: 'Cluster is now draining' });
});

/**
 * Activate a cluster
 * POST /xrpc/io.exprsn.admin.cluster.activate
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.cluster.activate', async (c) => {
  const body = await c.req.json<{ clusterId: string }>();

  if (!body.clusterId) {
    return c.json({ error: 'clusterId is required' }, 400);
  }

  const [cluster] = await db
    .update(renderClusters)
    .set({
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(renderClusters.id, body.clusterId))
    .returning();

  if (!cluster) {
    return c.json({ error: 'Cluster not found' }, 404);
  }

  return c.json({ cluster });
});

export { clusterAdminRouter };
