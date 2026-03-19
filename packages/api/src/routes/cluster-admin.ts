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
import { getClusterOrchestrator } from '../services/cluster/index.js';

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
    type: 'docker' | 'kubernetes' | 'docker-compose' | 'docker-swarm';
    endpoint?: string;
    region?: string;
    maxWorkers?: number;
    gpuEnabled?: boolean;
    config?: {
      kubeconfig?: string;
      namespace?: string;
      context?: string;
      kubeconfigPath?: string;
      dockerHost?: string;
      labels?: Record<string, string>;
    };
    tls?: {
      enabled: boolean;
      caCert?: string;
      clientCert?: string;
      clientKey?: string;
      skipVerify?: boolean;
    };
    auth?: {
      type: 'none' | 'basic' | 'token' | 'certificate';
      username?: string;
      password?: string;
      token?: string;
    };
    resources?: {
      maxCpu?: string;
      maxMemory?: string;
      maxGpu?: number;
    };
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
      tls: body.tls || { enabled: false },
      auth: body.auth || { type: 'none' },
      resources: body.resources,
      priorityRouting: body.priorityRouting || {
        urgent: true,
        high: true,
        normal: true,
        low: true,
      },
      status: 'inactive',
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
    config?: {
      kubeconfig?: string;
      namespace?: string;
      context?: string;
      kubeconfigPath?: string;
      dockerHost?: string;
      labels?: Record<string, string>;
    };
    tls?: {
      enabled: boolean;
      caCert?: string;
      clientCert?: string;
      clientKey?: string;
      skipVerify?: boolean;
    };
    auth?: {
      type: 'none' | 'basic' | 'token' | 'certificate';
      username?: string;
      password?: string;
      token?: string;
    };
    resources?: {
      maxCpu?: string;
      maxMemory?: string;
      maxGpu?: number;
    };
    priorityRouting?: {
      urgent?: boolean;
      high?: boolean;
      normal?: boolean;
      low?: boolean;
    };
    status?: 'active' | 'draining' | 'offline' | 'inactive' | 'error';
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
  if (body.tls !== undefined) updates.tls = body.tls;
  if (body.auth !== undefined) updates.auth = body.auth;
  if (body.resources !== undefined) updates.resources = body.resources;
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

  // Use ClusterOrchestratorService for actual Kubernetes scaling
  const orchestrator = getClusterOrchestrator();
  const scaleResult = await orchestrator.scaleKubernetesDeployment(body.clusterId, body.replicas);

  // Get updated cluster
  const [updated] = await db
    .select()
    .from(renderClusters)
    .where(eq(renderClusters.id, body.clusterId))
    .limit(1);

  if (!scaleResult.success) {
    return c.json({
      cluster: updated,
      message: `Scaling requested but Kubernetes API call failed: ${scaleResult.error}`,
      warning: scaleResult.error,
      previousReplicas: scaleResult.previousReplicas,
      requestedReplicas: body.replicas,
    });
  }

  return c.json({
    cluster: updated,
    message: `Successfully scaled from ${scaleResult.previousReplicas} to ${body.replicas} workers`,
    previousReplicas: scaleResult.previousReplicas,
    newReplicas: scaleResult.newReplicas,
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

/**
 * Test cluster connection
 * POST /xrpc/io.exprsn.admin.cluster.testConnection
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.cluster.testConnection', async (c) => {
  const body = await c.req.json<{
    clusterId?: string;
    type: 'docker' | 'kubernetes' | 'docker-compose' | 'docker-swarm';
    endpoint: string;
    tls?: {
      enabled: boolean;
      caCert?: string;
      clientCert?: string;
      clientKey?: string;
      skipVerify?: boolean;
    };
    auth?: {
      type: 'none' | 'basic' | 'token' | 'certificate';
      username?: string;
      password?: string;
      token?: string;
    };
    config?: {
      namespace?: string;
      context?: string;
    };
  }>();

  if (!body.endpoint || !body.type) {
    return c.json({ error: 'endpoint and type are required' }, 400);
  }

  try {
    let connectionSuccess = false;
    let responseMessage = '';
    let details: Record<string, unknown> = {};

    // Test connection based on cluster type
    if (body.type === 'kubernetes') {
      // Test Kubernetes API server connection
      const headers: Record<string, string> = {};

      if (body.auth?.type === 'token' && body.auth.token) {
        headers['Authorization'] = `Bearer ${body.auth.token}`;
      } else if (body.auth?.type === 'basic' && body.auth.username && body.auth.password) {
        const credentials = Buffer.from(`${body.auth.username}:${body.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${body.endpoint}/version`, {
          signal: controller.signal,
          headers,
          // TLS verification handling would go here in production
        });

        clearTimeout(timeout);

        if (response.ok) {
          const versionData = await response.json();
          connectionSuccess = true;
          responseMessage = 'Successfully connected to Kubernetes cluster';
          details = {
            version: versionData,
            namespace: body.config?.namespace || 'default',
          };
        } else {
          responseMessage = `Kubernetes API returned status ${response.status}`;
          details = { statusText: response.statusText };
        }
      } catch (error) {
        clearTimeout(timeout);
        responseMessage = `Failed to connect to Kubernetes API: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    } else if (body.type === 'docker' || body.type === 'docker-compose' || body.type === 'docker-swarm') {
      // Test Docker API connection
      const headers: Record<string, string> = {};

      if (body.auth?.type === 'basic' && body.auth.username && body.auth.password) {
        const credentials = Buffer.from(`${body.auth.username}:${body.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${body.endpoint}/version`, {
          signal: controller.signal,
          headers,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const versionData = await response.json() as Record<string, unknown>;
          connectionSuccess = true;
          responseMessage = `Successfully connected to Docker ${body.type === 'docker-swarm' ? 'Swarm' : ''} host`;
          details = {
            version: versionData,
            apiVersion: versionData.ApiVersion,
          };
        } else {
          responseMessage = `Docker API returned status ${response.status}`;
          details = { statusText: response.statusText };
        }
      } catch (error) {
        clearTimeout(timeout);
        responseMessage = `Failed to connect to Docker API: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    // Update cluster health check if clusterId provided
    if (body.clusterId && connectionSuccess) {
      await db
        .update(renderClusters)
        .set({
          lastHealthCheck: new Date(),
          status: 'active',
          errorMessage: null,
        })
        .where(eq(renderClusters.id, body.clusterId));
    } else if (body.clusterId && !connectionSuccess) {
      await db
        .update(renderClusters)
        .set({
          lastHealthCheck: new Date(),
          status: 'error',
          errorMessage: responseMessage,
        })
        .where(eq(renderClusters.id, body.clusterId));
    }

    return c.json({
      success: connectionSuccess,
      message: responseMessage,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// ============================================================================
// Worker Management Routes
// ============================================================================

/**
 * List all workers (optionally filter by cluster)
 * GET /xrpc/io.exprsn.admin.workers.list
 */
clusterAdminRouter.get('/xrpc/io.exprsn.admin.workers.list', async (c) => {
  const clusterId = c.req.query('clusterId');

  const workers = await db
    .select()
    .from(renderWorkers)
    .where(clusterId ? sql`metadata->>'clusterId' = ${clusterId}` : undefined)
    .orderBy(desc(renderWorkers.lastHeartbeat));

  // Enrich workers with cluster info and online status
  const enrichedWorkers = workers.map((worker) => {
    const isOnline = worker.lastHeartbeat
      ? new Date().getTime() - worker.lastHeartbeat.getTime() < 60000
      : false;

    return {
      ...worker,
      isOnline,
      clusterId: worker.metadata?.clusterId as string | undefined,
    };
  });

  return c.json({ workers: enrichedWorkers });
});

/**
 * Get a specific worker with detailed metrics
 * GET /xrpc/io.exprsn.admin.workers.get
 */
clusterAdminRouter.get('/xrpc/io.exprsn.admin.workers.get', async (c) => {
  const workerId = c.req.query('workerId');

  if (!workerId) {
    return c.json({ error: 'workerId is required' }, 400);
  }

  const [worker] = await db
    .select()
    .from(renderWorkers)
    .where(eq(renderWorkers.id, workerId))
    .limit(1);

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  const isOnline = worker.lastHeartbeat
    ? new Date().getTime() - worker.lastHeartbeat.getTime() < 60000
    : false;

  return c.json({
    worker: {
      ...worker,
      isOnline,
      clusterId: worker.metadata?.clusterId as string | undefined,
    },
  });
});

/**
 * Get worker metrics and resource usage
 * GET /xrpc/io.exprsn.admin.workers.metrics
 */
clusterAdminRouter.get('/xrpc/io.exprsn.admin.workers.metrics', async (c) => {
  const workerId = c.req.query('workerId');

  if (!workerId) {
    return c.json({ error: 'workerId is required' }, 400);
  }

  const [worker] = await db
    .select()
    .from(renderWorkers)
    .where(eq(renderWorkers.id, workerId))
    .limit(1);

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  // Calculate uptime
  const uptimeMs = worker.startedAt ? new Date().getTime() - worker.startedAt.getTime() : 0;
  const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));

  // Calculate success rate
  const totalJobs = worker.totalProcessed || 0;
  const failedJobs = worker.failedJobs || 0;
  const successRate = totalJobs > 0 ? ((totalJobs - failedJobs) / totalJobs) * 100 : 100;

  // Get resource usage from metadata
  const resourceUsage = {
    cpu: (worker.metadata?.cpu as number) || 0,
    memory: (worker.metadata?.memory as number) || 0,
    disk: (worker.metadata?.disk as number) || 0,
    gpu: worker.gpuEnabled ? ((worker.metadata?.gpu as number) || 0) : undefined,
  };

  return c.json({
    workerId,
    metrics: {
      activeJobs: worker.activeJobs || 0,
      totalProcessed: worker.totalProcessed || 0,
      failedJobs: worker.failedJobs || 0,
      successRate,
      avgProcessingTimeSeconds: Math.round(worker.avgProcessingTime || 0),
      concurrency: worker.concurrency || 2,
      uptimeHours,
      resourceUsage,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Drain a worker (stop accepting new jobs)
 * POST /xrpc/io.exprsn.admin.workers.drain
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.workers.drain', async (c) => {
  const body = await c.req.json<{ workerId: string }>();

  if (!body.workerId) {
    return c.json({ error: 'workerId is required' }, 400);
  }

  const [worker] = await db
    .update(renderWorkers)
    .set({ status: 'draining' })
    .where(eq(renderWorkers.id, body.workerId))
    .returning();

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  return c.json({ worker, message: 'Worker is now draining' });
});

/**
 * Activate a drained worker
 * POST /xrpc/io.exprsn.admin.workers.activate
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.workers.activate', async (c) => {
  const body = await c.req.json<{ workerId: string }>();

  if (!body.workerId) {
    return c.json({ error: 'workerId is required' }, 400);
  }

  const [worker] = await db
    .update(renderWorkers)
    .set({ status: 'active' })
    .where(eq(renderWorkers.id, body.workerId))
    .returning();

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  return c.json({ worker, message: 'Worker is now active' });
});

/**
 * Restart a worker (via cluster management)
 * POST /xrpc/io.exprsn.admin.workers.restart
 */
clusterAdminRouter.post('/xrpc/io.exprsn.admin.workers.restart', async (c) => {
  const body = await c.req.json<{ workerId: string }>();

  if (!body.workerId) {
    return c.json({ error: 'workerId is required' }, 400);
  }

  const [worker] = await db
    .select()
    .from(renderWorkers)
    .where(eq(renderWorkers.id, body.workerId))
    .limit(1);

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  // In a real implementation, this would call the cluster orchestration API
  // to restart the worker pod/container
  const clusterId = worker.metadata?.clusterId as string | undefined;

  if (!clusterId) {
    return c.json({ error: 'Worker is not associated with a cluster' }, 400);
  }

  const [cluster] = await db
    .select()
    .from(renderClusters)
    .where(eq(renderClusters.id, clusterId))
    .limit(1);

  if (!cluster) {
    return c.json({ error: 'Associated cluster not found' }, 404);
  }

  // Use ClusterOrchestratorService for actual restart operations
  const orchestrator = getClusterOrchestrator();
  const containerInfo = orchestrator.getWorkerContainerInfo(worker);
  let restartResult;

  if (cluster.type === 'kubernetes' && containerInfo.podName) {
    restartResult = await orchestrator.restartKubernetesPod(body.workerId, containerInfo.podName);
  } else if (cluster.type === 'docker' && containerInfo.containerId) {
    restartResult = await orchestrator.restartDockerContainer(body.workerId, containerInfo.containerId);
  } else {
    // Fallback: just mark as offline and let the worker re-register
    await db
      .update(renderWorkers)
      .set({
        status: 'offline',
        lastHeartbeat: new Date(0),
      })
      .where(eq(renderWorkers.id, body.workerId));

    return c.json({
      success: true,
      message: `Worker ${worker.hostname} marked as offline (no pod/container info available)`,
      warning: 'Could not restart via orchestration API - missing pod/container metadata',
    });
  }

  if (!restartResult.success) {
    return c.json({
      success: false,
      message: `Failed to restart worker ${worker.hostname}`,
      error: restartResult.error,
    }, 500);
  }

  return c.json({
    success: true,
    message: `Successfully restarted worker ${worker.hostname}`,
    clusterType: cluster.type,
    podName: containerInfo.podName,
    containerId: containerInfo.containerId,
  });
});

/**
 * Remove a worker from the cluster
 * DELETE /xrpc/io.exprsn.admin.workers.remove
 */
clusterAdminRouter.delete('/xrpc/io.exprsn.admin.workers.remove', async (c) => {
  const workerId = c.req.query('workerId');

  if (!workerId) {
    return c.json({ error: 'workerId is required' }, 400);
  }

  const [worker] = await db
    .select()
    .from(renderWorkers)
    .where(eq(renderWorkers.id, workerId))
    .limit(1);

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  // Check if worker has active jobs
  if (worker.activeJobs && worker.activeJobs > 0) {
    return c.json(
      { error: 'Cannot remove worker with active jobs. Drain worker first.' },
      400
    );
  }

  await db.delete(renderWorkers).where(eq(renderWorkers.id, workerId));

  return c.json({ success: true, message: 'Worker removed' });
});

/**
 * Get worker logs (last N lines)
 * GET /xrpc/io.exprsn.admin.workers.logs
 */
clusterAdminRouter.get('/xrpc/io.exprsn.admin.workers.logs', async (c) => {
  const workerId = c.req.query('workerId');
  const tailLines = parseInt(c.req.query('lines') || '100');

  if (!workerId) {
    return c.json({ error: 'workerId is required' }, 400);
  }

  const [worker] = await db
    .select()
    .from(renderWorkers)
    .where(eq(renderWorkers.id, workerId))
    .limit(1);

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  const metadata = worker.metadata as Record<string, unknown> | null;
  const clusterId = metadata?.clusterId as string | undefined;
  const containerId = metadata?.containerId as string | undefined;
  const podName = metadata?.podName as string | undefined;
  const namespace = metadata?.namespace as string | undefined;

  let logs: string[] = [];
  let source = 'status'; // Default source

  // Try to fetch actual logs based on available metadata
  if (clusterId) {
    // Get cluster to determine type
    const [cluster] = await db
      .select()
      .from(renderClusters)
      .where(eq(renderClusters.id, clusterId))
      .limit(1);

    if (cluster?.type === 'kubernetes' && podName) {
      // Fetch Kubernetes pod logs
      try {
        const k8sApiUrl = cluster.endpoint || process.env.KUBERNETES_API_URL;
        const k8sNamespace = namespace || 'default';

        if (k8sApiUrl) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(
            `${k8sApiUrl}/api/v1/namespaces/${k8sNamespace}/pods/${podName}/log?tailLines=${tailLines}&timestamps=true`,
            {
              signal: controller.signal,
              headers: {
                'Authorization': `Bearer ${process.env.KUBERNETES_TOKEN || ''}`,
              },
            }
          );

          clearTimeout(timeout);

          if (response.ok) {
            const logText = await response.text();
            logs = logText.split('\n').filter(line => line.trim());
            source = 'kubernetes';
          }
        }
      } catch (error) {
        console.warn('Failed to fetch Kubernetes logs:', error);
      }
    } else if (cluster?.type === 'docker' && containerId) {
      // Fetch Docker container logs
      try {
        const dockerHost = cluster.endpoint || process.env.DOCKER_HOST || 'unix:///var/run/docker.sock';

        // For HTTP-based Docker API (not unix socket)
        if (dockerHost.startsWith('http')) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(
            `${dockerHost}/containers/${containerId}/logs?stdout=true&stderr=true&tail=${tailLines}&timestamps=true`,
            { signal: controller.signal }
          );

          clearTimeout(timeout);

          if (response.ok) {
            const logText = await response.text();
            // Docker logs have a header byte per line, strip it
            logs = logText.split('\n')
              .map(line => line.slice(8)) // Remove Docker log header
              .filter(line => line.trim());
            source = 'docker';
          }
        }
      } catch (error) {
        console.warn('Failed to fetch Docker logs:', error);
      }
    }
  }

  // Fall back to worker status info if no logs available
  if (logs.length === 0) {
    const now = new Date().toISOString();
    logs = [
      `[${now}] Worker: ${worker.hostname}`,
      `[${now}] Status: ${worker.status}`,
      `[${now}] GPU: ${worker.gpuModel || 'N/A'} (${worker.gpuMemoryMB || 0}MB)`,
      `[${now}] Active jobs: ${worker.activeJobs || 0}`,
      `[${now}] Total processed: ${worker.totalProcessed || 0}`,
      `[${now}] Last heartbeat: ${worker.lastHeartbeat?.toISOString() || 'N/A'}`,
    ];

    // Check for error info in metadata
    const metadata = worker.metadata as Record<string, unknown> | null;
    if (metadata?.lastError) {
      logs.push(`[${now}] Last error: ${metadata.lastError}`);
    }
  }

  return c.json({
    workerId,
    hostname: worker.hostname,
    logs,
    lines: logs.length,
    source,
  });
});

export { clusterAdminRouter };
