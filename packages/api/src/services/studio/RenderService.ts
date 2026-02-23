/**
 * Video Render Service
 * Converts editor projects to video files using FFmpeg
 */

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '../../db/index.js';
import {
  renderJobs,
  renderBatches,
  userRenderQuotas,
  renderWorkers,
  editorProjects,
  editorDocumentSnapshots,
  editorTracks,
  editorClips,
  editorTransitions,
  editorAssets,
} from '../../db/schema.js';
import { eq, and, desc, asc, inArray, count, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getEffectsService } from './EffectsService.js';
import type { ClipTransform, ClipEffect } from './EditorService.js';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Editor element types from the editor
 */
interface EditorElement {
  id: string;
  type: 'video' | 'image' | 'text' | 'shape' | 'audio';
  name: string;
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: { x: number; y: number };
  opacity: number;
  startFrame: number;
  endFrame: number;
  visible: boolean;
  locked: boolean;
  blendMode?: string;
  effects?: Array<{ id?: string; type: string; enabled?: boolean; params: Record<string, unknown> }>;
  keyframes?: Record<string, Array<{ frame: number; value: unknown }>>;
  // Clip properties
  sourceStart?: number;
  sourceEnd?: number | null;
  speed?: number;
  reverse?: boolean;
  loop?: boolean;
  // Audio properties
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  // Text-specific
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  textAlign?: string;
  textStyle?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    align?: string;
    stroke?: { color: string; width: number };
    shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  };
  // Shape-specific
  shapeType?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shapeStyle?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    cornerRadius?: number;
  };
  solidColor?: string;
}

/**
 * Project state from Yjs document
 */
interface ProjectState {
  elements: EditorElement[];
  audioTracks: Array<{
    id: string;
    name: string;
    src: string;
    startFrame: number;
    duration: number;
    volume: number;
  }>;
  settings: {
    fps: number;
    width: number;
    height: number;
    duration: number;
    backgroundColor?: string;
  };
}

/**
 * Render job data
 */
export interface RenderJobData {
  jobId: string;
  projectId: string;
  userDid: string;
  format: 'mp4' | 'webm' | 'mov';
  quality: 'draft' | 'medium' | 'high' | 'ultra';
  resolution?: { width: number; height: number };
  fps?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  batchId?: string;
  dependsOnJobId?: string;
}

/**
 * Priority values for BullMQ (lower = higher priority)
 */
const PRIORITY_VALUES: Record<string, number> = {
  urgent: 1,
  high: 5,
  normal: 10,
  low: 20,
};

/**
 * Priority scores for database sorting (higher = higher priority)
 */
const PRIORITY_SCORES: Record<string, number> = {
  urgent: 100,
  high: 75,
  normal: 50,
  low: 25,
};

/**
 * Quality presets for rendering
 */
const QUALITY_PRESETS = {
  draft: { crf: 28, preset: 'ultrafast', audioBitrate: '128k' },
  medium: { crf: 23, preset: 'medium', audioBitrate: '192k' },
  high: { crf: 18, preset: 'slow', audioBitrate: '256k' },
  ultra: { crf: 15, preset: 'veryslow', audioBitrate: '320k' },
};

/**
 * Render Service for video export
 */
export class RenderService {
  private redis: Redis;
  private redisOptions: { host: string; port: number; password?: string; db: number };
  private queue: Queue;
  private worker: Worker | null = null;
  private storageProvider: StorageProvider;

  constructor(config: {
    redis: Redis;
    storageProvider: StorageProvider;
    concurrency?: number;
  }) {
    this.redis = config.redis;
    this.storageProvider = config.storageProvider;

    // Extract Redis connection options for BullMQ (to avoid ioredis version conflicts)
    this.redisOptions = {
      host: config.redis.options.host || 'localhost',
      port: config.redis.options.port || 6379,
      password: config.redis.options.password,
      db: config.redis.options.db || 0,
    };

    // Create BullMQ queue
    this.queue = new Queue('render-jobs', {
      connection: this.redisOptions,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }

  /**
   * Start the render worker
   */
  startWorker(concurrency = 2): void {
    if (this.worker) return;

    this.worker = new Worker<RenderJobData>(
      'render-jobs',
      async (job) => this.processRenderJob(job),
      {
        connection: this.redisOptions,
        concurrency,
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`[RenderService] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[RenderService] Job ${job?.id} failed:`, err);
    });

    console.log(`[RenderService] Worker started with concurrency ${concurrency}`);
  }

  /**
   * Stop the render worker
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  /**
   * Create a new render job
   */
  async createRenderJob(params: {
    projectId: string;
    userDid: string;
    format?: 'mp4' | 'webm' | 'mov';
    quality?: 'draft' | 'medium' | 'high' | 'ultra';
    resolution?: { width: number; height: number };
    fps?: number;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    batchId?: string;
    dependsOnJobId?: string;
  }): Promise<string> {
    const jobId = `render-${nanoid()}`;
    const priority = params.priority || 'normal';

    // Verify project exists and user has access
    const project = await db.query.editorProjects.findFirst({
      where: eq(editorProjects.id, params.projectId),
    });

    if (!project) {
      throw new Error('Project not found');
    }

    if (project.ownerDid !== params.userDid) {
      // Check if user is a collaborator with edit access
      const collaborator = await db.query.editorCollaborators?.findFirst({
        where: and(
          eq((await import('../../db/schema.js')).editorCollaborators.projectId, params.projectId),
          eq((await import('../../db/schema.js')).editorCollaborators.userDid, params.userDid)
        ),
      });

      if (!collaborator || collaborator.accessLevel === 'viewer') {
        throw new Error('Access denied');
      }
    }

    // Get user's priority boost if applicable
    let priorityBoost = 0;
    const quota = await db.query.userRenderQuotas.findFirst({
      where: eq(userRenderQuotas.userDid, params.userDid),
    });
    if (quota?.priorityBoost) {
      priorityBoost = quota.priorityBoost;
    }

    // Create database record
    await db.insert(renderJobs).values({
      id: jobId,
      projectId: params.projectId,
      userDid: params.userDid,
      status: 'pending',
      format: params.format || 'mp4',
      quality: params.quality || 'high',
      resolution: params.resolution || project.settings,
      fps: params.fps || project.settings?.fps || 30,
      priority,
      priorityScore: (PRIORITY_SCORES[priority] || 50) + priorityBoost,
      batchId: params.batchId,
      dependsOnJobId: params.dependsOnJobId,
    });

    // If this job depends on another, don't add to queue yet
    // It will be added when the dependency completes
    if (params.dependsOnJobId) {
      await db.update(renderJobs).set({ status: 'waiting' }).where(eq(renderJobs.id, jobId));
      return jobId;
    }

    // Add to queue with priority
    await this.queue.add('render', {
      jobId,
      projectId: params.projectId,
      userDid: params.userDid,
      format: params.format || 'mp4',
      quality: params.quality || 'high',
      resolution: params.resolution,
      fps: params.fps,
      priority,
      batchId: params.batchId,
    }, {
      priority: PRIORITY_VALUES[priority],
      jobId, // Use jobId as the BullMQ job ID for easier lookup
    });

    // Increment user's daily usage
    await this.incrementQuotaUsage(params.userDid);

    return jobId;
  }

  /**
   * Create batch render jobs for multiple projects
   */
  async createBatchRenderJobs(params: {
    projectIds: string[];
    userDid: string;
    format?: 'mp4' | 'webm' | 'mov';
    quality?: 'draft' | 'medium' | 'high' | 'ultra';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    name?: string;
  }): Promise<{ batchId: string; jobIds: string[] }> {
    const batchId = `batch-${nanoid()}`;
    const jobIds: string[] = [];

    // Create batch record
    await db.insert(renderBatches).values({
      id: batchId,
      userDid: params.userDid,
      name: params.name,
      totalJobs: params.projectIds.length,
      status: 'pending',
    });

    // Create individual jobs
    for (const projectId of params.projectIds) {
      try {
        const jobId = await this.createRenderJob({
          projectId,
          userDid: params.userDid,
          format: params.format,
          quality: params.quality,
          priority: params.priority,
          batchId,
        });
        jobIds.push(jobId);
      } catch (error) {
        console.error(`[RenderService] Failed to create job for project ${projectId}:`, error);
        // Continue with other projects
      }
    }

    // Update batch with actual job count
    await db.update(renderBatches).set({
      totalJobs: jobIds.length,
      status: jobIds.length > 0 ? 'processing' : 'failed',
    }).where(eq(renderBatches.id, batchId));

    return { batchId, jobIds };
  }

  /**
   * Create a job that depends on another job
   */
  async createDependentJob(params: {
    projectId: string;
    userDid: string;
    dependsOnJobId: string;
    format?: 'mp4' | 'webm' | 'mov';
    quality?: 'draft' | 'medium' | 'high' | 'ultra';
  }): Promise<string> {
    // Verify dependency exists
    const dependency = await db.query.renderJobs.findFirst({
      where: eq(renderJobs.id, params.dependsOnJobId),
    });

    if (!dependency) {
      throw new Error('Dependency job not found');
    }

    return this.createRenderJob({
      ...params,
      dependsOnJobId: params.dependsOnJobId,
    });
  }

  /**
   * Check rate limits for a user
   */
  async checkRateLimits(userDid: string): Promise<{
    canRender: boolean;
    dailyRemaining: number;
    weeklyRemaining: number;
    currentConcurrent: number;
    maxConcurrent: number;
    reason?: string;
  }> {
    // Get or create quota
    let quota = await db.query.userRenderQuotas.findFirst({
      where: eq(userRenderQuotas.userDid, userDid),
    });

    if (!quota) {
      await db.insert(userRenderQuotas).values({ userDid });
      quota = await db.query.userRenderQuotas.findFirst({
        where: eq(userRenderQuotas.userDid, userDid),
      });
    }

    const now = new Date();
    let dailyUsed = quota!.dailyUsed || 0;
    let weeklyUsed = quota!.weeklyUsed || 0;

    // Reset daily counter if needed
    if (!quota!.dailyResetAt || new Date(quota!.dailyResetAt) < now) {
      dailyUsed = 0;
      await db.update(userRenderQuotas).set({
        dailyUsed: 0,
        dailyResetAt: new Date(now.getTime() + 86400000),
      }).where(eq(userRenderQuotas.userDid, userDid));
    }

    // Reset weekly counter if needed
    if (!quota!.weeklyResetAt || new Date(quota!.weeklyResetAt) < now) {
      weeklyUsed = 0;
      await db.update(userRenderQuotas).set({
        weeklyUsed: 0,
        weeklyResetAt: new Date(now.getTime() + 604800000),
      }).where(eq(userRenderQuotas.userDid, userDid));
    }

    // Count concurrent jobs
    const [concurrent] = await db
      .select({ count: count() })
      .from(renderJobs)
      .where(and(
        eq(renderJobs.userDid, userDid),
        inArray(renderJobs.status, ['pending', 'queued', 'rendering'])
      ));

    const dailyLimit = quota!.dailyLimit || 10;
    const weeklyLimit = quota!.weeklyLimit || 50;
    const concurrentLimit = quota!.concurrentLimit || 2;
    const currentConcurrent = concurrent?.count || 0;

    const dailyRemaining = dailyLimit - dailyUsed;
    const weeklyRemaining = weeklyLimit - weeklyUsed;

    let reason: string | undefined;
    if (dailyRemaining <= 0) {
      reason = 'Daily render limit reached';
    } else if (weeklyRemaining <= 0) {
      reason = 'Weekly render limit reached';
    } else if (currentConcurrent >= concurrentLimit) {
      reason = 'Maximum concurrent renders reached';
    }

    return {
      canRender: dailyRemaining > 0 && weeklyRemaining > 0 && currentConcurrent < concurrentLimit,
      dailyRemaining,
      weeklyRemaining,
      currentConcurrent,
      maxConcurrent: concurrentLimit,
      reason,
    };
  }

  /**
   * Estimate render resources for a project
   */
  async estimateRender(projectId: string): Promise<{
    estimatedDurationSeconds: number;
    estimatedMemoryMb: number;
    estimatedFileSizeMb: number;
    warnings: string[];
  }> {
    const projectState = await this.getProjectState(projectId);
    if (!projectState) {
      throw new Error('Project not found');
    }

    const duration = projectState.settings.duration / projectState.settings.fps;
    const elementCount = projectState.elements.length;
    const hasVideo = projectState.elements.some((e) => e.type === 'video');
    const hasEffects = projectState.elements.some((e) => e.effects && e.effects.length > 0);
    const hasAudio = projectState.audioTracks.length > 0;

    const warnings: string[] = [];
    if (duration > 300) {
      warnings.push('Long video (> 5 min) may take significant time to render');
    }
    if (elementCount > 50) {
      warnings.push('High element count may increase memory usage and render time');
    }
    if (hasEffects) {
      warnings.push('Video effects will increase render time');
    }

    // Estimate based on complexity
    const baseTimeMultiplier = 2; // 2x real-time for basic encoding
    const complexityMultiplier = 1 + (elementCount * 0.05) + (hasEffects ? 0.5 : 0) + (hasVideo ? 0.3 : 0);

    return {
      estimatedDurationSeconds: Math.ceil(duration * baseTimeMultiplier * complexityMultiplier),
      estimatedMemoryMb: Math.ceil(512 + (elementCount * 50) + (hasVideo ? 500 : 0) + (hasAudio ? 100 : 0)),
      estimatedFileSizeMb: Math.ceil(duration * 2), // ~2MB per second for high quality
      warnings,
    };
  }

  /**
   * Admin: Pause a render job
   */
  async adminPauseJob(jobId: string, adminId: string): Promise<boolean> {
    const job = await db.query.renderJobs.findFirst({
      where: eq(renderJobs.id, jobId),
    });

    if (!job || !['pending', 'queued'].includes(job.status)) {
      return false;
    }

    // Remove from queue
    const bullJob = await this.queue.getJob(jobId);
    if (bullJob) {
      await bullJob.moveToDelayed(Date.now() + 86400000 * 365); // Move far into the future
    }

    await db.update(renderJobs).set({
      status: 'paused',
      pausedAt: new Date(),
      pausedByAdminId: adminId,
      updatedAt: new Date(),
    }).where(eq(renderJobs.id, jobId));

    return true;
  }

  /**
   * Admin: Resume a paused job
   */
  async adminResumeJob(jobId: string): Promise<boolean> {
    const job = await db.query.renderJobs.findFirst({
      where: and(eq(renderJobs.id, jobId), eq(renderJobs.status, 'paused')),
    });

    if (!job) {
      return false;
    }

    // Re-add to queue
    await this.queue.add('render', {
      jobId: job.id,
      projectId: job.projectId,
      userDid: job.userDid,
      format: job.format as 'mp4' | 'webm' | 'mov',
      quality: job.quality as 'draft' | 'medium' | 'high' | 'ultra',
      resolution: job.resolution as { width: number; height: number } | undefined,
      fps: job.fps || undefined,
      priority: job.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined,
      batchId: job.batchId || undefined,
    }, {
      priority: PRIORITY_VALUES[job.priority || 'normal'],
      jobId,
    });

    await db.update(renderJobs).set({
      status: 'pending',
      pausedAt: null,
      pausedByAdminId: null,
      updatedAt: new Date(),
    }).where(eq(renderJobs.id, jobId));

    return true;
  }

  /**
   * Admin: Update job priority
   */
  async adminUpdatePriority(
    jobId: string,
    priority: 'low' | 'normal' | 'high' | 'urgent'
  ): Promise<boolean> {
    const job = await db.query.renderJobs.findFirst({
      where: eq(renderJobs.id, jobId),
    });

    if (!job) {
      return false;
    }

    await db.update(renderJobs).set({
      priority,
      priorityScore: PRIORITY_SCORES[priority],
      updatedAt: new Date(),
    }).where(eq(renderJobs.id, jobId));

    // Update queue priority if job is pending
    if (job.status === 'pending') {
      const bullJob = await this.queue.getJob(jobId);
      if (bullJob) {
        await bullJob.changePriority({ priority: PRIORITY_VALUES[priority] });
      }
    }

    return true;
  }

  /**
   * Increment user's quota usage
   */
  private async incrementQuotaUsage(userDid: string): Promise<void> {
    await db.update(userRenderQuotas).set({
      dailyUsed: sql`${userRenderQuotas.dailyUsed} + 1`,
      weeklyUsed: sql`${userRenderQuotas.weeklyUsed} + 1`,
      updatedAt: new Date(),
    }).where(eq(userRenderQuotas.userDid, userDid));
  }

  /**
   * Update batch status when a job completes or fails
   */
  async updateBatchStatus(batchId: string, jobStatus: 'completed' | 'failed'): Promise<void> {
    if (!batchId) return;

    // Increment appropriate counter
    if (jobStatus === 'completed') {
      await db.update(renderBatches).set({
        completedJobs: sql`${renderBatches.completedJobs} + 1`,
      }).where(eq(renderBatches.id, batchId));
    } else {
      await db.update(renderBatches).set({
        failedJobs: sql`${renderBatches.failedJobs} + 1`,
      }).where(eq(renderBatches.id, batchId));
    }

    // Check if batch is complete
    const batch = await db.query.renderBatches.findFirst({
      where: eq(renderBatches.id, batchId),
    });

    if (batch) {
      const completed = (batch.completedJobs || 0) + (batch.failedJobs || 0);
      if (completed >= (batch.totalJobs || 0)) {
        const status = batch.failedJobs === 0 ? 'completed' : batch.completedJobs === 0 ? 'failed' : 'partial';
        await db.update(renderBatches).set({
          status,
          completedAt: new Date(),
        }).where(eq(renderBatches.id, batchId));
      }
    }
  }

  /**
   * Process dependent jobs when a job completes
   */
  async processDependentJobs(completedJobId: string): Promise<void> {
    const dependentJobs = await db
      .select()
      .from(renderJobs)
      .where(and(
        eq(renderJobs.dependsOnJobId, completedJobId),
        eq(renderJobs.status, 'waiting')
      ));

    for (const job of dependentJobs) {
      // Add to queue
      await this.queue.add('render', {
        jobId: job.id,
        projectId: job.projectId,
        userDid: job.userDid,
        format: job.format as 'mp4' | 'webm' | 'mov',
        quality: job.quality as 'draft' | 'medium' | 'high' | 'ultra',
        resolution: job.resolution as { width: number; height: number } | undefined,
        fps: job.fps || undefined,
        priority: job.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined,
        batchId: job.batchId || undefined,
      }, {
        priority: PRIORITY_VALUES[job.priority || 'normal'],
        jobId: job.id,
      });

      await db.update(renderJobs).set({
        status: 'pending',
        updatedAt: new Date(),
      }).where(eq(renderJobs.id, job.id));
    }
  }

  /**
   * Get render job status
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    status: string;
    progress: number;
    currentStep?: string;
    outputUrl?: string;
    error?: string;
  } | null> {
    const job = await db.query.renderJobs.findFirst({
      where: eq(renderJobs.id, jobId),
    });

    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      progress: job.progress || 0,
      currentStep: job.currentStep || undefined,
      outputUrl: job.outputUrl || undefined,
      error: job.errorMessage || undefined,
    };
  }

  /**
   * Get render jobs for a user
   */
  async getUserJobs(
    userDid: string,
    options: { projectId?: string; status?: string; limit?: number } = {}
  ): Promise<Array<{
    id: string;
    projectId: string;
    status: string;
    progress: number;
    format: string;
    quality: string;
    outputUrl?: string;
    createdAt: Date;
  }>> {
    const { projectId, status, limit = 20 } = options;

    // Build conditions
    const conditions = [eq(renderJobs.userDid, userDid)];
    if (projectId) {
      conditions.push(eq(renderJobs.projectId, projectId));
    }
    if (status) {
      conditions.push(eq(renderJobs.status, status));
    }

    const jobs = await db
      .select()
      .from(renderJobs)
      .where(and(...conditions))
      .orderBy(desc(renderJobs.createdAt))
      .limit(limit);

    return jobs.map((job) => ({
      id: job.id,
      projectId: job.projectId,
      status: job.status,
      progress: job.progress || 0,
      format: job.format,
      quality: job.quality,
      outputUrl: job.outputUrl || undefined,
      createdAt: job.createdAt,
    }));
  }

  /**
   * Retry a failed render job
   */
  async retryJob(jobId: string, userDid: string): Promise<string | null> {
    const job = await db.query.renderJobs.findFirst({
      where: and(
        eq(renderJobs.id, jobId),
        eq(renderJobs.userDid, userDid)
      ),
    });

    if (!job || job.status !== 'failed') {
      return null;
    }

    // Create a new job with the same parameters
    return this.createRenderJob({
      projectId: job.projectId,
      userDid: job.userDid,
      format: job.format as 'mp4' | 'webm' | 'mov',
      quality: job.quality as 'draft' | 'medium' | 'high' | 'ultra',
      resolution: job.resolution as { width: number; height: number } | undefined,
    });
  }

  /**
   * Cancel a render job
   */
  async cancelJob(jobId: string, userDid: string): Promise<boolean> {
    const job = await db.query.renderJobs.findFirst({
      where: and(
        eq(renderJobs.id, jobId),
        eq(renderJobs.userDid, userDid)
      ),
    });

    if (!job || job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    // Remove from queue if pending
    const bullJob = await this.queue.getJob(jobId);
    if (bullJob) {
      await bullJob.remove();
    }

    // Update status
    await db
      .update(renderJobs)
      .set({ status: 'failed', errorMessage: 'Cancelled by user' })
      .where(eq(renderJobs.id, jobId));

    return true;
  }

  /**
   * Process a render job
   */
  private async processRenderJob(job: Job<RenderJobData>): Promise<void> {
    const { jobId, projectId, format, quality, resolution, fps } = job.data;

    const updateProgress = async (progress: number, step: string) => {
      await db
        .update(renderJobs)
        .set({ progress, currentStep: step, updatedAt: new Date() })
        .where(eq(renderJobs.id, jobId));
      await job.updateProgress(progress);
    };

    try {
      // Update status to rendering
      await db
        .update(renderJobs)
        .set({ status: 'rendering', renderStartedAt: new Date() })
        .where(eq(renderJobs.id, jobId));

      await updateProgress(5, 'Loading project...');

      // Get project state
      const projectState = await this.getProjectState(projectId);
      if (!projectState) {
        throw new Error('Could not load project state');
      }

      await updateProgress(10, 'Preparing assets...');

      // Create temp directory
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-'));
      const outputPath = path.join(tempDir, `output.${format}`);

      try {
        await updateProgress(15, 'Downloading media assets...');

        // Download all media assets
        const assetPaths = await this.downloadAssets(projectState, tempDir);

        await updateProgress(25, 'Generating render script...');

        // Generate FFmpeg filter complex
        const renderSettings = {
          width: resolution?.width || projectState.settings.width,
          height: resolution?.height || projectState.settings.height,
          fps: fps || projectState.settings.fps,
          duration: projectState.settings.duration / (fps || projectState.settings.fps),
          backgroundColor: projectState.settings.backgroundColor || '#000000',
        };

        await updateProgress(30, 'Rendering video...');

        // Render the video
        await this.renderWithFFmpeg(
          projectState,
          assetPaths,
          renderSettings,
          quality,
          format,
          outputPath,
          async (progress) => {
            await updateProgress(30 + Math.floor(progress * 0.5), 'Rendering video...');
          }
        );

        await updateProgress(80, 'Encoding final output...');

        // Get output file stats
        const stats = await fs.stat(outputPath);

        await updateProgress(85, 'Uploading to storage...');

        // Upload to storage
        const outputKey = `renders/${job.data.userDid}/${jobId}/output.${format}`;
        const outputUrl = await this.storageProvider.upload(outputPath, outputKey);

        await updateProgress(95, 'Finalizing...');

        // Get the job to check for batch and update with actual metrics
        const completedJob = await db.query.renderJobs.findFirst({
          where: eq(renderJobs.id, jobId),
        });

        // Update job as completed
        await db
          .update(renderJobs)
          .set({
            status: 'completed',
            progress: 100,
            currentStep: 'Complete',
            outputKey,
            outputUrl,
            outputSize: stats.size,
            duration: Math.floor(renderSettings.duration),
            actualDurationSeconds: completedJob?.renderStartedAt
              ? Math.floor((Date.now() - completedJob.renderStartedAt.getTime()) / 1000)
              : undefined,
            renderCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(renderJobs.id, jobId));

        // Update batch status if part of a batch
        if (completedJob?.batchId) {
          await this.updateBatchStatus(completedJob.batchId, 'completed');
        }

        // Process any dependent jobs
        await this.processDependentJobs(jobId);

      } finally {
        // Cleanup temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
      }

    } catch (error) {
      console.error(`[RenderService] Render failed:`, error);

      // Get the job to check for batch
      const failedJob = await db.query.renderJobs.findFirst({
        where: eq(renderJobs.id, jobId),
      });

      await db
        .update(renderJobs)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error instanceof Error ? { stack: error.stack } : {},
          updatedAt: new Date(),
        })
        .where(eq(renderJobs.id, jobId));

      // Update batch status if part of a batch
      if (failedJob?.batchId) {
        await this.updateBatchStatus(failedJob.batchId, 'failed');
      }

      throw error;
    }
  }

  /**
   * Get project state from database (new data model)
   */
  private async getProjectStateFromDB(projectId: string): Promise<ProjectState | null> {
    const project = await db.query.editorProjects.findFirst({
      where: eq(editorProjects.id, projectId),
    });

    if (!project) return null;

    // Get all tracks with their clips
    const tracks = await db
      .select()
      .from(editorTracks)
      .where(eq(editorTracks.projectId, projectId))
      .orderBy(asc(editorTracks.order));

    const allClips = await db
      .select()
      .from(editorClips)
      .where(eq(editorClips.projectId, projectId))
      .orderBy(asc(editorClips.startFrame));

    // Get assets for source URLs
    const assetIds = allClips
      .filter((c) => c.assetId)
      .map((c) => c.assetId as string);

    const assets = assetIds.length > 0
      ? await db
          .select()
          .from(editorAssets)
          .where(eq(editorAssets.projectId, projectId))
      : [];

    const assetMap = new Map(assets.map((a) => [a.id, a]));

    // Get transitions
    const transitions = await db
      .select()
      .from(editorTransitions)
      .where(eq(editorTransitions.projectId, projectId));

    const settings = (project.settings as ProjectState['settings']) || {
      fps: 30,
      width: 1920,
      height: 1080,
      duration: 300,
    };

    // Convert clips to EditorElement format
    const elements: EditorElement[] = allClips.map((clip) => {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : null;
      const transform = (clip.transform as ClipTransform) || {
        x: 0,
        y: 0,
        width: settings.width,
        height: settings.height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
      };

      return {
        id: clip.id,
        type: clip.type as EditorElement['type'],
        name: clip.name,
        src: asset?.cdnUrl || undefined,
        x: transform.x || 0,
        y: transform.y || 0,
        width: transform.width || settings.width,
        height: transform.height || settings.height,
        rotation: transform.rotation || 0,
        scale: { x: transform.scaleX || 1, y: transform.scaleY || 1 },
        opacity: transform.opacity ?? 1,
        startFrame: clip.startFrame,
        endFrame: clip.endFrame,
        visible: true,
        locked: clip.locked || false,
        blendMode: clip.blendMode || 'normal',
        effects: (clip.effects as ClipEffect[]) || [],
        keyframes: clip.keyframes as Record<string, Array<{ frame: number; value: unknown }>> || {},
        // Clip-specific properties
        sourceStart: clip.sourceStart || 0,
        sourceEnd: clip.sourceEnd,
        speed: clip.speed || 1,
        reverse: clip.reverse || false,
        loop: clip.loop || false,
        // Text properties
        text: clip.textContent || undefined,
        textStyle: clip.textStyle as EditorElement['textStyle'],
        // Shape properties
        shapeType: clip.shapeType || undefined,
        shapeStyle: clip.shapeStyle as EditorElement['shapeStyle'],
        solidColor: clip.solidColor || undefined,
        // Audio properties
        volume: clip.volume || 1,
        fadeIn: clip.fadeIn || 0,
        fadeOut: clip.fadeOut || 0,
      };
    });

    // Extract audio clips into audioTracks format
    const audioTracks: ProjectState['audioTracks'] = allClips
      .filter((clip) => clip.type === 'audio')
      .map((clip) => {
        const asset = clip.assetId ? assetMap.get(clip.assetId) : null;
        return {
          id: clip.id,
          name: clip.name,
          src: asset?.cdnUrl || '',
          startFrame: clip.startFrame,
          duration: clip.endFrame - clip.startFrame,
          volume: clip.volume || 1,
        };
      });

    // Store transitions for rendering
    (settings as unknown as { transitions: typeof transitions }).transitions = transitions;

    return { elements, audioTracks, settings };
  }

  /**
   * Get project state - tries database first, falls back to Yjs snapshot
   */
  private async getProjectState(projectId: string): Promise<ProjectState | null> {
    // First try the new data model
    const dbState = await this.getProjectStateFromDB(projectId);

    // If we have elements from the database, use that
    if (dbState && dbState.elements.length > 0) {
      return dbState;
    }

    // Fallback to Yjs snapshot for legacy/collaborative projects
    const snapshot = await db.query.editorDocumentSnapshots.findFirst({
      where: eq(editorDocumentSnapshots.projectId, projectId),
      orderBy: [desc(editorDocumentSnapshots.version)],
    });

    if (!snapshot) {
      // Return project from database or null
      return dbState;
    }

    try {
      // Decode Yjs state
      const yjs = await import('yjs');
      const doc = new yjs.Doc();
      const update = Buffer.from(snapshot.snapshot, 'base64');
      yjs.applyUpdate(doc, update);

      const elementsMap = doc.getMap('elements');
      const audioTracksArray = doc.getArray('audioTracks');
      const settingsMap = doc.getMap('settings');

      const elements: EditorElement[] = [];
      elementsMap.forEach((value, key) => {
        if (value && typeof value === 'object') {
          elements.push({ id: key, ...value } as EditorElement);
        }
      });

      const audioTracks = audioTracksArray.toArray() as ProjectState['audioTracks'];

      const settings = {
        fps: (settingsMap.get('fps') as number) || 30,
        width: (settingsMap.get('width') as number) || 1920,
        height: (settingsMap.get('height') as number) || 1080,
        duration: (settingsMap.get('duration') as number) || 300,
        backgroundColor: settingsMap.get('backgroundColor') as string | undefined,
      };

      return { elements, audioTracks, settings };
    } catch (error) {
      console.error('[RenderService] Failed to parse project state:', error);
      return dbState; // Return database state if Yjs fails
    }
  }

  /**
   * Download media assets to temp directory
   */
  private async downloadAssets(
    state: ProjectState,
    tempDir: string
  ): Promise<Map<string, string>> {
    const assetPaths = new Map<string, string>();

    // Download element media
    for (const element of state.elements) {
      if (element.src && (element.type === 'video' || element.type === 'image' || element.type === 'audio')) {
        const ext = path.extname(element.src) || (element.type === 'video' ? '.mp4' : element.type === 'image' ? '.png' : '.mp3');
        const localPath = path.join(tempDir, `asset-${element.id}${ext}`);

        try {
          await this.storageProvider.download(element.src, localPath);
          assetPaths.set(element.id, localPath);
        } catch (error) {
          console.warn(`[RenderService] Failed to download asset ${element.src}:`, error);
        }
      }
    }

    // Download audio tracks
    for (const track of state.audioTracks) {
      if (track.src) {
        const ext = path.extname(track.src) || '.mp3';
        const localPath = path.join(tempDir, `audio-${track.id}${ext}`);

        try {
          await this.storageProvider.download(track.src, localPath);
          assetPaths.set(track.id, localPath);
        } catch (error) {
          console.warn(`[RenderService] Failed to download audio ${track.src}:`, error);
        }
      }
    }

    return assetPaths;
  }

  /**
   * Render video using FFmpeg
   */
  private async renderWithFFmpeg(
    state: ProjectState,
    assetPaths: Map<string, string>,
    settings: {
      width: number;
      height: number;
      fps: number;
      duration: number;
      backgroundColor: string;
    },
    quality: 'draft' | 'medium' | 'high' | 'ultra',
    format: string,
    outputPath: string,
    onProgress: (progress: number) => Promise<void>
  ): Promise<void> {
    const preset = QUALITY_PRESETS[quality];

    // Build FFmpeg command
    const args: string[] = [];

    // Create blank canvas as base
    args.push(
      '-f', 'lavfi',
      '-i', `color=c=${settings.backgroundColor.replace('#', '0x')}:s=${settings.width}x${settings.height}:d=${settings.duration}:r=${settings.fps}`
    );

    // Add input files
    const inputIndices = new Map<string, number>();
    let inputIndex = 1;

    for (const element of state.elements) {
      if (assetPaths.has(element.id)) {
        args.push('-i', assetPaths.get(element.id)!);
        inputIndices.set(element.id, inputIndex++);
      }
    }

    for (const track of state.audioTracks) {
      if (assetPaths.has(track.id)) {
        args.push('-i', assetPaths.get(track.id)!);
        inputIndices.set(track.id, inputIndex++);
      }
    }

    // Build filter complex
    const filters: string[] = [];
    let lastVideoOutput = '0:v';

    // Sort elements by layer order (startFrame as proxy for z-index)
    const sortedElements = [...state.elements]
      .filter((e) => e.visible && (e.type === 'video' || e.type === 'image'))
      .sort((a, b) => a.startFrame - b.startFrame);

    const effectsService = getEffectsService();

    sortedElements.forEach((element, i) => {
      const idx = inputIndices.get(element.id);
      if (idx === undefined) return;

      const inputLabel = `${idx}:v`;
      const outputLabel = `v${i}`;

      const startTime = element.startFrame / settings.fps;
      const endTime = element.endFrame / settings.fps;

      // Build filter chain for this element
      const elementFilters: string[] = [];

      // Handle speed changes
      const speed = element.speed || 1;
      if (speed !== 1) {
        elementFilters.push(`setpts=${1 / speed}*PTS`);
      }

      // Handle reverse
      if (element.reverse) {
        elementFilters.push('reverse');
      }

      // Source trimming if specified
      if (element.sourceStart !== undefined && element.sourceStart > 0) {
        const trimStart = element.sourceStart / settings.fps;
        elementFilters.push(`trim=start=${trimStart}`);
        elementFilters.push('setpts=PTS-STARTPTS');
      }

      // Scale and transform
      elementFilters.push(
        `scale=${Math.round(element.width * element.scale.x)}:${Math.round(element.height * element.scale.y)}`
      );

      // Apply rotation if needed
      if (element.rotation !== 0) {
        const radians = (element.rotation * Math.PI) / 180;
        elementFilters.push(`rotate=${radians}:c=none`);
      }

      // Apply effects using EffectsService
      if (element.effects && element.effects.length > 0) {
        const effectsToApply = element.effects
          .filter((e) => e.enabled !== false)
          .map((e) => ({
            type: e.type,
            params: e.params as Record<string, number | string | boolean>,
            enabled: true,
          }));

        if (effectsToApply.length > 0) {
          const effectChain = effectsService.generateFilterChain(effectsToApply);
          if (effectChain) {
            elementFilters.push(effectChain);
          }
        }
      }

      // Apply opacity
      if (element.opacity !== undefined && element.opacity < 1) {
        elementFilters.push(`colorchannelmixer=aa=${element.opacity}`);
      }

      // Set PTS for timeline positioning
      elementFilters.push(`setpts=PTS-STARTPTS+${startTime}/TB`);

      // Combine all filters for this element
      filters.push(`[${inputLabel}]${elementFilters.join(',')}[scaled${i}]`);

      // Overlay with blend mode support
      let overlayFilter = `overlay=${Math.round(element.x)}:${Math.round(element.y)}:enable='between(t,${startTime},${endTime})'`;

      // Handle blend modes (limited support in FFmpeg)
      if (element.blendMode && element.blendMode !== 'normal') {
        const blendModes: Record<string, string> = {
          'multiply': 'multiply',
          'screen': 'screen',
          'overlay': 'overlay',
          'darken': 'darken',
          'lighten': 'lighten',
          'difference': 'difference',
        };
        const ffmpegBlend = blendModes[element.blendMode];
        if (ffmpegBlend) {
          // Use blend filter instead of overlay for blend modes
          filters.push(`[${lastVideoOutput}][scaled${i}]blend=all_mode=${ffmpegBlend}:all_opacity=1[${outputLabel}]`);
          lastVideoOutput = outputLabel;
          return;
        }
      }

      filters.push(`[${lastVideoOutput}][scaled${i}]${overlayFilter}[${outputLabel}]`);
      lastVideoOutput = outputLabel;
    });

    // Audio mixing
    const audioInputs = state.audioTracks
      .filter((t) => inputIndices.has(t.id))
      .map((t) => `[${inputIndices.get(t.id)}:a]volume=${t.volume}[a${t.id}]`)
      .join(';');

    if (audioInputs) {
      filters.push(audioInputs);
      const audioMix = state.audioTracks
        .filter((t) => inputIndices.has(t.id))
        .map((t) => `[a${t.id}]`)
        .join('');
      filters.push(`${audioMix}amix=inputs=${state.audioTracks.length}[aout]`);
    }

    // Apply filter complex
    if (filters.length > 0) {
      args.push('-filter_complex', filters.join(';'));
      args.push('-map', `[${lastVideoOutput}]`);
      if (audioInputs) {
        args.push('-map', '[aout]');
      }
    }

    // Output settings
    if (format === 'mp4') {
      args.push(
        '-c:v', 'libx264',
        '-preset', preset.preset,
        '-crf', preset.crf.toString(),
        '-c:a', 'aac',
        '-b:a', preset.audioBitrate,
        '-movflags', '+faststart'
      );
    } else if (format === 'webm') {
      args.push(
        '-c:v', 'libvpx-vp9',
        '-crf', preset.crf.toString(),
        '-b:v', '0',
        '-c:a', 'libopus',
        '-b:a', preset.audioBitrate
      );
    }

    args.push('-y', outputPath);

    // Run FFmpeg
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);
      let duration = settings.duration;

      ffmpeg.stderr.on('data', (data: Buffer) => {
        const output = data.toString();

        // Parse duration
        const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const [, hours, minutes, seconds] = durationMatch;
          duration = parseInt(hours || '0') * 3600 + parseInt(minutes || '0') * 60 + parseFloat(seconds || '0');
        }

        // Parse progress
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours || '0') * 3600 + parseInt(minutes || '0') * 60 + parseFloat(seconds || '0');
          const progress = Math.min(currentTime / duration, 1);
          onProgress(progress).catch(console.error);
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }
}

/**
 * Storage provider interface
 */
export interface StorageProvider {
  upload(localPath: string, key: string): Promise<string>;
  download(url: string, localPath: string): Promise<void>;
}

/**
 * S3 Storage Provider
 */
export class S3StorageProvider implements StorageProvider {
  private bucketName: string;
  private cdnBaseUrl: string;

  constructor(config: { bucketName: string; cdnBaseUrl: string }) {
    this.bucketName = config.bucketName;
    this.cdnBaseUrl = config.cdnBaseUrl;
  }

  async upload(localPath: string, key: string): Promise<string> {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({});

    const fileContent = await fs.readFile(localPath);

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: this.getContentType(key),
      })
    );

    return `${this.cdnBaseUrl}/${key}`;
  }

  async download(url: string, localPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
  }

  private getContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    const types: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    return types[ext] || 'application/octet-stream';
  }
}

// Singleton
let renderService: RenderService | null = null;

export function getRenderService(): RenderService {
  if (!renderService) {
    throw new Error('RenderService not initialized');
  }
  return renderService;
}

export function initializeRenderService(config: {
  redis: Redis;
  storageProvider: StorageProvider;
  concurrency?: number;
}): RenderService {
  if (renderService) return renderService;

  renderService = new RenderService(config);
  renderService.startWorker(config.concurrency);
  return renderService;
}

export default RenderService;
