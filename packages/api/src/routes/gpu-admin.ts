/**
 * GPU Admin API Routes
 * Manage GPU resources, allocations, and priorities
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  renderWorkers,
  gpuAllocations,
  gpuJobPriorities,
  gpuMetrics,
  renderJobs,
  renderClusters,
} from '../db/schema.js';
import { eq, desc, and, isNull, sql, gte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { adminAuthMiddleware } from '../auth/middleware.js';

const gpuAdminRouter = new Hono();

// Apply admin auth to all routes
gpuAdminRouter.use('*', adminAuthMiddleware);

/**
 * Get GPU overview across all clusters
 * GET /xrpc/io.exprsn.admin.gpu.overview
 */
gpuAdminRouter.get('/xrpc/io.exprsn.admin.gpu.overview', async (c) => {
  // Get all GPU-enabled workers
  const workers = await db
    .select()
    .from(renderWorkers)
    .where(eq(renderWorkers.gpuEnabled, true));

  // Get active GPU allocations
  const activeAllocations = await db
    .select()
    .from(gpuAllocations)
    .where(isNull(gpuAllocations.releasedAt));

  // Calculate totals
  const totalGPUs = workers.reduce((sum, w) => sum + (w.gpuCount || 0), 0);
  const allocatedGPUs = activeAllocations.length;
  const availableGPUs = totalGPUs - allocatedGPUs;

  // Get GPU types breakdown
  const gpuTypeBreakdown: Record<string, { total: number; allocated: number }> = {};
  workers.forEach((worker) => {
    const model = worker.gpuModel || 'Unknown';
    if (!gpuTypeBreakdown[model]) {
      gpuTypeBreakdown[model] = { total: 0, allocated: 0 };
    }
    gpuTypeBreakdown[model].total += worker.gpuCount || 0;
  });

  // Count allocations per GPU model
  for (const allocation of activeAllocations) {
    const worker = workers.find((w) => w.id === allocation.workerId);
    if (worker) {
      const model = worker.gpuModel || 'Unknown';
      if (gpuTypeBreakdown[model]) {
        gpuTypeBreakdown[model].allocated++;
      }
    }
  }

  // Calculate average utilization
  const avgUtilization =
    workers.length > 0
      ? workers.reduce((sum, w) => sum + (w.gpuUtilization || 0), 0) / workers.length
      : 0;

  return c.json({
    totalGPUs,
    allocatedGPUs,
    availableGPUs,
    utilizationPercent: Math.round(avgUtilization * 10) / 10,
    gpuTypes: gpuTypeBreakdown,
    workerCount: workers.length,
    activeWorkers: workers.filter((w) => w.status === 'active').length,
  });
});

/**
 * List workers with GPU info
 * GET /xrpc/io.exprsn.admin.gpu.workers
 */
gpuAdminRouter.get('/xrpc/io.exprsn.admin.gpu.workers', async (c) => {
  const gpuOnly = c.req.query('gpuOnly') === 'true';

  const workers = await db
    .select()
    .from(renderWorkers)
    .where(gpuOnly ? eq(renderWorkers.gpuEnabled, true) : undefined)
    .orderBy(desc(renderWorkers.lastHeartbeat));

  // Get active allocations for each worker
  const workersWithAllocations = await Promise.all(
    workers.map(async (worker) => {
      const allocations = await db
        .select({
          id: gpuAllocations.id,
          jobId: gpuAllocations.jobId,
          gpuIndex: gpuAllocations.gpuIndex,
          jobType: gpuAllocations.jobType,
          allocatedAt: gpuAllocations.allocatedAt,
          memoryAllocatedMB: gpuAllocations.memoryAllocatedMB,
        })
        .from(gpuAllocations)
        .where(
          and(
            eq(gpuAllocations.workerId, worker.id),
            isNull(gpuAllocations.releasedAt)
          )
        );

      return {
        ...worker,
        allocations,
        allocatedGPUs: allocations.length,
        availableGPUs: (worker.gpuCount || 0) - allocations.length,
      };
    })
  );

  return c.json({ workers: workersWithAllocations });
});

/**
 * Get current GPU allocations
 * GET /xrpc/io.exprsn.admin.gpu.allocations
 */
gpuAdminRouter.get('/xrpc/io.exprsn.admin.gpu.allocations', async (c) => {
  const allocations = await db
    .select({
      id: gpuAllocations.id,
      workerId: gpuAllocations.workerId,
      workerHostname: renderWorkers.hostname,
      workerGPUModel: renderWorkers.gpuModel,
      jobId: gpuAllocations.jobId,
      jobStatus: renderJobs.status,
      jobPriority: renderJobs.priority,
      gpuIndex: gpuAllocations.gpuIndex,
      jobType: gpuAllocations.jobType,
      allocatedAt: gpuAllocations.allocatedAt,
      memoryAllocatedMB: gpuAllocations.memoryAllocatedMB,
      currentStep: renderJobs.currentStep,
      progress: renderJobs.progress,
    })
    .from(gpuAllocations)
    .leftJoin(renderWorkers, eq(gpuAllocations.workerId, renderWorkers.id))
    .leftJoin(renderJobs, eq(gpuAllocations.jobId, renderJobs.id))
    .where(isNull(gpuAllocations.releasedAt))
    .orderBy(desc(gpuAllocations.allocatedAt));

  return c.json({ allocations });
});

/**
 * Get GPU job priorities
 * GET /xrpc/io.exprsn.admin.gpu.priority
 */
gpuAdminRouter.get('/xrpc/io.exprsn.admin.gpu.priority', async (c) => {
  const priorities = await db
    .select()
    .from(gpuJobPriorities)
    .orderBy(desc(gpuJobPriorities.priority));

  return c.json({ priorities });
});

/**
 * Set GPU allocation priority for job types
 * PUT /xrpc/io.exprsn.admin.gpu.priority
 */
gpuAdminRouter.put('/xrpc/io.exprsn.admin.gpu.priority', async (c) => {
  const body = await c.req.json<{
    jobType: string;
    priority: number;
    requiresGPU?: boolean;
    preferredGPUModel?: string;
    maxGPUMemoryMB?: number;
  }>();

  if (!body.jobType || body.priority === undefined) {
    return c.json({ error: 'jobType and priority are required' }, 400);
  }

  if (body.priority < 0 || body.priority > 100) {
    return c.json({ error: 'priority must be between 0 and 100' }, 400);
  }

  // Check if priority config exists
  const [existing] = await db
    .select()
    .from(gpuJobPriorities)
    .where(eq(gpuJobPriorities.jobType, body.jobType))
    .limit(1);

  let priority;

  if (existing) {
    // Update existing
    const updates: any = {
      priority: body.priority,
      updatedAt: new Date(),
    };
    if (body.requiresGPU !== undefined) updates.requiresGPU = body.requiresGPU;
    if (body.preferredGPUModel !== undefined)
      updates.preferredGPUModel = body.preferredGPUModel;
    if (body.maxGPUMemoryMB !== undefined)
      updates.maxGPUMemoryMB = body.maxGPUMemoryMB;

    [priority] = await db
      .update(gpuJobPriorities)
      .set(updates)
      .where(eq(gpuJobPriorities.jobType, body.jobType))
      .returning();
  } else {
    // Create new
    [priority] = await db
      .insert(gpuJobPriorities)
      .values({
        id: `gpu_priority_${nanoid(12)}`,
        jobType: body.jobType,
        priority: body.priority,
        requiresGPU: body.requiresGPU || false,
        preferredGPUModel: body.preferredGPUModel,
        maxGPUMemoryMB: body.maxGPUMemoryMB,
      })
      .returning();
  }

  return c.json({ priority });
});

/**
 * Delete GPU job priority
 * DELETE /xrpc/io.exprsn.admin.gpu.priority
 */
gpuAdminRouter.delete('/xrpc/io.exprsn.admin.gpu.priority', async (c) => {
  const jobType = c.req.query('jobType');

  if (!jobType) {
    return c.json({ error: 'jobType is required' }, 400);
  }

  await db
    .delete(gpuJobPriorities)
    .where(eq(gpuJobPriorities.jobType, jobType));

  return c.json({ success: true });
});

/**
 * Get GPU metrics over time
 * GET /xrpc/io.exprsn.admin.gpu.metrics
 */
gpuAdminRouter.get('/xrpc/io.exprsn.admin.gpu.metrics', async (c) => {
  const workerId = c.req.query('workerId');
  const hours = parseInt(c.req.query('hours') || '24');
  const limit = parseInt(c.req.query('limit') || '100');

  // Calculate time window
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const whereConditions = workerId
    ? and(eq(gpuMetrics.workerId, workerId), gte(gpuMetrics.timestamp, since))
    : gte(gpuMetrics.timestamp, since);

  const metrics = await db
    .select()
    .from(gpuMetrics)
    .where(whereConditions)
    .orderBy(desc(gpuMetrics.timestamp))
    .limit(limit);

  // Calculate statistics
  const stats = {
    avgUtilization: 0,
    maxUtilization: 0,
    avgMemoryUsed: 0,
    maxMemoryUsed: 0,
    avgTemperature: 0,
    maxTemperature: 0,
    dataPoints: metrics.length,
  };

  if (metrics.length > 0) {
    stats.avgUtilization =
      metrics.reduce((sum, m) => sum + m.utilization, 0) / metrics.length;
    stats.maxUtilization = Math.max(...metrics.map((m) => m.utilization));
    stats.avgMemoryUsed =
      metrics.reduce((sum, m) => sum + m.memoryUsedMB, 0) / metrics.length;
    stats.maxMemoryUsed = Math.max(...metrics.map((m) => m.memoryUsedMB));

    const tempsWithValues = metrics.filter((m) => m.temperature !== null);
    if (tempsWithValues.length > 0) {
      stats.avgTemperature =
        tempsWithValues.reduce((sum, m) => sum + (m.temperature || 0), 0) /
        tempsWithValues.length;
      stats.maxTemperature = Math.max(
        ...tempsWithValues.map((m) => m.temperature || 0)
      );
    }
  }

  return c.json({
    metrics,
    stats,
    timeWindow: {
      hours,
      since: since.toISOString(),
    },
  });
});

/**
 * Get GPU worker details with recent metrics
 * GET /xrpc/io.exprsn.admin.gpu.worker
 */
gpuAdminRouter.get('/xrpc/io.exprsn.admin.gpu.worker', async (c) => {
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

  // Get active allocations
  const allocations = await db
    .select({
      id: gpuAllocations.id,
      jobId: gpuAllocations.jobId,
      jobStatus: renderJobs.status,
      gpuIndex: gpuAllocations.gpuIndex,
      jobType: gpuAllocations.jobType,
      allocatedAt: gpuAllocations.allocatedAt,
      memoryAllocatedMB: gpuAllocations.memoryAllocatedMB,
      progress: renderJobs.progress,
      currentStep: renderJobs.currentStep,
    })
    .from(gpuAllocations)
    .leftJoin(renderJobs, eq(gpuAllocations.jobId, renderJobs.id))
    .where(
      and(
        eq(gpuAllocations.workerId, workerId),
        isNull(gpuAllocations.releasedAt)
      )
    );

  // Get recent metrics (last hour)
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recentMetrics = await db
    .select()
    .from(gpuMetrics)
    .where(
      and(
        eq(gpuMetrics.workerId, workerId),
        gte(gpuMetrics.timestamp, since)
      )
    )
    .orderBy(desc(gpuMetrics.timestamp))
    .limit(60);

  return c.json({
    worker,
    allocations,
    recentMetrics,
  });
});

/**
 * Record GPU metrics (called by workers)
 * POST /xrpc/io.exprsn.admin.gpu.recordMetrics
 */
gpuAdminRouter.post('/xrpc/io.exprsn.admin.gpu.recordMetrics', async (c) => {
  const body = await c.req.json<{
    workerId: string;
    gpuIndex: number;
    utilization: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    temperature?: number;
    powerWatts?: number;
  }>();

  if (
    !body.workerId ||
    body.gpuIndex === undefined ||
    body.utilization === undefined ||
    !body.memoryUsedMB ||
    !body.memoryTotalMB
  ) {
    return c.json(
      { error: 'workerId, gpuIndex, utilization, memoryUsedMB, and memoryTotalMB are required' },
      400
    );
  }

  // Verify worker exists
  const [worker] = await db
    .select()
    .from(renderWorkers)
    .where(eq(renderWorkers.id, body.workerId))
    .limit(1);

  if (!worker) {
    return c.json({ error: 'Worker not found' }, 404);
  }

  // Insert metric
  const [metric] = await db
    .insert(gpuMetrics)
    .values({
      id: `gpu_metric_${nanoid(12)}`,
      workerId: body.workerId,
      gpuIndex: body.gpuIndex,
      utilization: body.utilization,
      memoryUsedMB: body.memoryUsedMB,
      memoryTotalMB: body.memoryTotalMB,
      temperature: body.temperature,
      powerWatts: body.powerWatts,
    })
    .returning();

  // Update worker's current GPU stats
  await db
    .update(renderWorkers)
    .set({
      gpuUtilization: body.utilization,
      gpuMemoryUsed: body.memoryUsedMB,
    })
    .where(eq(renderWorkers.id, body.workerId));

  return c.json({ metric }, 201);
});

export { gpuAdminRouter };
