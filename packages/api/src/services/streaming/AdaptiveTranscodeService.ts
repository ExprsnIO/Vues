/**
 * Adaptive Transcode Service
 *
 * Orchestrates the adaptive bitrate transcoding pipeline using BullMQ.
 * Handles HLS/DASH generation, thumbnail sprites, and offline downloads.
 */

import { Queue, Worker, Job } from 'bullmq';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getRedisConnection } from '../../cache/redis.js';
import { uploadToS3, streamFromS3ToFile, S3_BUCKET, CDN_URL } from '../../utils/s3.js';
import {
  QUALITY_PRESETS,
  QualityLevel,
  getTargetQualities,
  generateMasterPlaylist,
  DEFAULT_STREAMING_CONFIG,
} from './QualityPresets.js';
import {
  getHLSTranscodeArgs,
  getDASHTranscodeArgs,
  getThumbnailExtractionArgs,
  getOfflineMP4Args,
  getProbeArgs,
  parseProbeOutput,
  getSpriteCommand,
  generateThumbnailVTT,
  VideoMetadata,
} from './FFmpegCommands.js';
import {
  emitTranscodeProgress,
  emitTranscodeComplete,
  emitTranscodeFailed,
  type TranscodeProgressUpdate,
  type TranscodeJobComplete,
  type TranscodeJobFailed,
} from '../../websocket/transcodeProgress.js';
import { getTranscodeWebhooks } from '../video/TranscodeWebhooks.js';

const QUEUE_NAME = 'adaptive-transcode';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';
const TEMP_DIR = process.env.TRANSCODE_TEMP_DIR || '/tmp/transcode';
const WORKER_CONCURRENCY = parseInt(process.env.TRANSCODE_WORKER_CONCURRENCY || '2', 10);

export interface TranscodeJobData {
  jobId: string;
  videoUri?: string;
  userDid: string;
  inputKey: string;
  config: schema.TranscodeJobConfig;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface TranscodeProgress {
  phase: string;
  percent: number;
  progress?: number;
  message?: string;
  currentQuality?: string;
}

type TranscodeStatus = 'pending' | 'probing' | 'transcoding' | 'packaging' | 'uploading' | 'completed' | 'failed';

export class AdaptiveTranscodeService {
  private queue: Queue<TranscodeJobData>;
  private worker: Worker<TranscodeJobData> | null = null;
  private static instance: AdaptiveTranscodeService;

  private constructor() {
    const redis = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
        },
      },
    });
  }

  static getInstance(): AdaptiveTranscodeService {
    if (!AdaptiveTranscodeService.instance) {
      AdaptiveTranscodeService.instance = new AdaptiveTranscodeService();
    }
    return AdaptiveTranscodeService.instance;
  }

  /**
   * Queue a new transcode job
   */
  async queueTranscode(data: Omit<TranscodeJobData, 'jobId'>): Promise<string> {
    const jobId = `transcode_${nanoid()}`;

    // Create database record
    await db.insert(schema.transcodeJobs).values({
      id: jobId,
      videoUri: data.videoUri,
      userDid: data.userDid,
      inputKey: data.inputKey,
      config: data.config,
      status: 'pending',
      progress: 0,
    });

    // Add to queue
    const priority = this.getPriorityValue(data.priority || 'normal');
    await this.queue.add('transcode', { ...data, jobId }, {
      priority,
      jobId,
    });

    console.log(`[AdaptiveTranscodeService] Queued job ${jobId} for user ${data.userDid}`);
    return jobId;
  }

  /**
   * Start the worker process
   */
  async startWorker(): Promise<void> {
    if (this.worker) {
      console.log('[AdaptiveTranscodeService] Worker already running');
      return;
    }

    const redis = getRedisConnection();
    this.worker = new Worker<TranscodeJobData>(
      QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection: redis,
        concurrency: WORKER_CONCURRENCY,
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`[AdaptiveTranscodeService] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[AdaptiveTranscodeService] Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[AdaptiveTranscodeService] Worker error:', err);
    });

    console.log(`[AdaptiveTranscodeService] Worker started with concurrency ${WORKER_CONCURRENCY}`);
  }

  /**
   * Stop the worker process
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[AdaptiveTranscodeService] Worker stopped');
    }
  }

  /**
   * Process a job by its ID (used by standalone worker)
   * Fetches job data from database and processes it
   */
  async processJobById(jobId: string): Promise<void> {
    // Get job data from database
    const [jobRecord] = await db
      .select()
      .from(schema.transcodeJobs)
      .where(eq(schema.transcodeJobs.id, jobId))
      .limit(1);

    if (!jobRecord) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Create a mock job object for processing
    const jobData: TranscodeJobData = {
      jobId,
      videoUri: jobRecord.videoUri || undefined,
      userDid: jobRecord.userDid,
      inputKey: jobRecord.inputKey,
      config: jobRecord.config,
      priority: 'normal',
    };

    // Process using internal method
    await this.processJobInternal(jobData);
  }

  /**
   * Process a transcode job from BullMQ
   */
  private async processJob(job: Job<TranscodeJobData>): Promise<void> {
    await this.processJobInternal(job.data);
  }

  /**
   * Internal job processing logic
   */
  private async processJobInternal(data: TranscodeJobData): Promise<void> {
    const { jobId, inputKey, config, userDid, videoUri } = data;
    const workDir = path.join(TEMP_DIR, jobId);

    try {
      // Create work directory
      await fs.mkdir(workDir, { recursive: true });

      // Send webhook for job start
      try {
        const webhooks = getTranscodeWebhooks();
        await webhooks.onAdaptiveTranscodeStarted(jobId, userDid, videoUri);
      } catch {
        // Webhook delivery is best-effort
      }

      // Update status to probing
      await this.updateJobStatus(jobId, 'probing', 'probe', 5, undefined, 'Analyzing video metadata', userDid);

      // Download input file from S3
      const inputPath = path.join(workDir, 'input.mp4');
      await this.downloadFromS3(inputKey, inputPath);

      // Probe input file
      const metadata = await this.probeVideo(inputPath);
      await this.updateJobMetadata(jobId, metadata);

      // Determine target qualities based on source
      const targetQualities = getTargetQualities(
        metadata.width,
        metadata.height,
        config.targetQualities[config.targetQualities.length - 1] as QualityLevel
      ).filter(q => config.targetQualities.includes(q));

      // Update status to transcoding
      await this.updateJobStatus(jobId, 'transcoding', 'hls_init', 10, undefined, 'Starting HLS transcoding', userDid);

      // Generate output base path
      const outputBasePath = `videos/${userDid}/${videoUri || jobId}`;

      // Process HLS variants
      let hlsMasterUrl: string | undefined;
      if (config.enableHls) {
        hlsMasterUrl = await this.generateHLS(
          jobId,
          inputPath,
          workDir,
          targetQualities,
          metadata,
          outputBasePath,
          config.segmentDuration,
          userDid
        );
      }

      // Process DASH
      let dashManifestUrl: string | undefined;
      if (config.enableDash) {
        await this.updateJobStatus(jobId, 'transcoding', 'dash', 70, undefined, 'Generating DASH manifest', userDid);
        dashManifestUrl = await this.generateDASH(
          jobId,
          inputPath,
          workDir,
          targetQualities,
          metadata,
          outputBasePath,
          config.segmentDuration
        );
      }

      // Generate thumbnail sprites
      let thumbnailSpriteUrl: string | undefined;
      let thumbnailVttUrl: string | undefined;
      if (config.enableThumbnails) {
        await this.updateJobStatus(jobId, 'transcoding', 'thumbnails', 80, undefined, 'Generating thumbnail sprites', userDid);
        const thumbnails = await this.generateThumbnails(
          jobId,
          inputPath,
          workDir,
          metadata,
          outputBasePath,
          config.thumbnailInterval
        );
        thumbnailSpriteUrl = thumbnails.spriteUrl;
        thumbnailVttUrl = thumbnails.vttUrl;
      }

      // Generate offline downloads
      let offlineDownloads: Record<string, string> | undefined;
      if (config.enableOffline) {
        await this.updateJobStatus(jobId, 'transcoding', 'offline', 90, undefined, 'Creating offline downloads', userDid);
        offlineDownloads = await this.generateOfflineDownloads(
          jobId,
          inputPath,
          workDir,
          metadata,
          outputBasePath,
          config.offlineQualities as QualityLevel[]
        );
      }

      // Update job completion
      await this.updateJobCompletion(jobId, userDid, videoUri, {
        hlsMasterUrl,
        dashManifestUrl,
        thumbnailSpriteUrl,
        thumbnailVttUrl,
        offlineDownloads,
        outputBasePath,
        availableQualities: targetQualities,
      });

      // Update video record if we have a videoUri
      if (videoUri) {
        await db
          .update(schema.videos)
          .set({
            hlsMasterUrl,
            dashManifestUrl,
            thumbnailSpriteUrl,
            thumbnailVttUrl,
            availableQualities: targetQualities,
            transcodeStatus: 'completed',
          })
          .where(eq(schema.videos.uri, videoUri));
      }

      console.log(`[AdaptiveTranscodeService] Job ${jobId} completed successfully`);

    } catch (error) {
      console.error(`[AdaptiveTranscodeService] Job ${jobId} failed:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      await db
        .update(schema.transcodeJobs)
        .set({
          status: 'failed',
          error: errorMessage,
          errorStack,
          updatedAt: new Date(),
        })
        .where(eq(schema.transcodeJobs.id, jobId));

      // Emit WebSocket failure event
      emitTranscodeFailed({
        jobId,
        videoUri,
        userDid,
        error: errorMessage,
        errorStack,
      });

      // Send webhook notification
      try {
        const webhooks = getTranscodeWebhooks();
        await webhooks.onAdaptiveTranscodeFailed(jobId, userDid, errorMessage);
      } catch {
        // Webhook delivery is best-effort
      }

      throw error;

    } finally {
      // Cleanup work directory
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate HLS variants for all quality levels
   */
  private async generateHLS(
    jobId: string,
    inputPath: string,
    workDir: string,
    qualities: QualityLevel[],
    metadata: VideoMetadata,
    outputBasePath: string,
    segmentDuration: number,
    userDid: string
  ): Promise<string> {
    const hlsDir = path.join(workDir, 'hls');
    await fs.mkdir(hlsDir, { recursive: true });

    const progressPerQuality = 50 / qualities.length;

    for (let i = 0; i < qualities.length; i++) {
      const quality = qualities[i]!;
      const qualityDir = path.join(hlsDir, quality);
      await fs.mkdir(qualityDir, { recursive: true });

      await this.updateJobStatus(
        jobId,
        'transcoding',
        `hls_${quality}`,
        15 + Math.round(i * progressPerQuality),
        quality,
        `Encoding HLS ${quality} variant`,
        userDid
      );

      const args = getHLSTranscodeArgs({
        inputPath,
        outputDir: hlsDir,
        quality,
        sourceWidth: metadata.width,
        sourceHeight: metadata.height,
        sourceFps: metadata.fps,
        segmentDuration,
      });

      await this.runFFmpeg(args);

      // Upload variant files to S3
      await this.uploadDirectory(
        qualityDir,
        `${outputBasePath}/hls/${quality}`
      );
    }

    // Generate and upload master playlist
    const cdnBaseUrl = CDN_URL;
    const masterPlaylist = generateMasterPlaylist(
      qualities,
      `${cdnBaseUrl}/${outputBasePath}/hls`
    );

    const masterPath = path.join(hlsDir, 'master.m3u8');
    await fs.writeFile(masterPath, masterPlaylist);

    const masterUrl = await this.uploadFile(
      masterPath,
      `${outputBasePath}/hls/master.m3u8`,
      'application/x-mpegURL'
    );

    return masterUrl;
  }

  /**
   * Generate DASH manifest and segments
   */
  private async generateDASH(
    jobId: string,
    inputPath: string,
    workDir: string,
    qualities: QualityLevel[],
    metadata: VideoMetadata,
    outputBasePath: string,
    segmentDuration: number
  ): Promise<string> {
    const dashDir = path.join(workDir, 'dash');
    await fs.mkdir(dashDir, { recursive: true });

    const args = getDASHTranscodeArgs(
      inputPath,
      workDir,
      qualities,
      metadata.width,
      metadata.height,
      metadata.fps,
      { segmentDuration }
    );

    await this.runFFmpeg(args);

    // Upload all DASH files
    await this.uploadDirectory(dashDir, `${outputBasePath}/dash`);

    const cdnBaseUrl = CDN_URL;
    return `${cdnBaseUrl}/${outputBasePath}/dash/manifest.mpd`;
  }

  /**
   * Generate thumbnail sprites
   */
  private async generateThumbnails(
    jobId: string,
    inputPath: string,
    workDir: string,
    metadata: VideoMetadata,
    outputBasePath: string,
    interval: number
  ): Promise<{ spriteUrl: string; vttUrl: string }> {
    const thumbDir = path.join(workDir, 'thumbnails');
    await fs.mkdir(thumbDir, { recursive: true });

    // Extract frames
    const extractArgs = getThumbnailExtractionArgs(inputPath, thumbDir, interval);
    await this.runFFmpeg(extractArgs);

    // Get list of extracted thumbnails
    const thumbFiles = (await fs.readdir(thumbDir))
      .filter(f => f.startsWith('thumb_'))
      .sort();

    // Create sprite sheets
    const { spriteColumns, spriteRows, thumbnailWidth, thumbnailHeight } = DEFAULT_STREAMING_CONFIG;
    const thumbsPerSprite = spriteColumns * spriteRows;
    const spriteUrls: string[] = [];

    for (let i = 0; i < thumbFiles.length; i += thumbsPerSprite) {
      const batch = thumbFiles.slice(i, i + thumbsPerSprite);
      const spriteIndex = Math.floor(i / thumbsPerSprite);
      const spritePath = path.join(thumbDir, `sprite_${spriteIndex}.jpg`);

      // Use ImageMagick montage if available, otherwise composite manually
      const montageArgs = getSpriteCommand(
        `${thumbDir}/thumb_*.jpg`,
        spritePath,
        spriteColumns,
        spriteRows,
        thumbnailWidth,
        thumbnailHeight
      );

      try {
        await this.runCommand(montageArgs[0]!, montageArgs.slice(1));
      } catch {
        // Fallback: skip sprite generation if montage not available
        console.warn('[AdaptiveTranscodeService] montage not available, skipping sprite generation');
        break;
      }

      const url = await this.uploadFile(
        spritePath,
        `${outputBasePath}/thumbnails/sprite_${spriteIndex}.jpg`,
        'image/jpeg'
      );
      spriteUrls.push(url);
    }

    // Generate VTT file
    const cdnBaseUrl = CDN_URL;
    const vttContent = generateThumbnailVTT(
      metadata.duration,
      interval,
      `${cdnBaseUrl}/${outputBasePath}/thumbnails/sprite_0.jpg`,
      spriteColumns,
      spriteRows,
      thumbnailWidth,
      thumbnailHeight
    );

    const vttPath = path.join(thumbDir, 'thumbnails.vtt');
    await fs.writeFile(vttPath, vttContent);

    const vttUrl = await this.uploadFile(
      vttPath,
      `${outputBasePath}/thumbnails/thumbnails.vtt`,
      'text/vtt'
    );

    return {
      spriteUrl: spriteUrls[0] || '',
      vttUrl,
    };
  }

  /**
   * Generate offline download MP4s
   */
  private async generateOfflineDownloads(
    jobId: string,
    inputPath: string,
    workDir: string,
    metadata: VideoMetadata,
    outputBasePath: string,
    qualities: QualityLevel[]
  ): Promise<Record<string, string>> {
    const offlineDir = path.join(workDir, 'offline');
    await fs.mkdir(offlineDir, { recursive: true });

    const downloads: Record<string, string> = {};

    for (const quality of qualities) {
      const args = getOfflineMP4Args({
        inputPath,
        outputDir: workDir,
        quality,
        sourceWidth: metadata.width,
        sourceHeight: metadata.height,
        sourceFps: metadata.fps,
      });

      await this.runFFmpeg(args);

      const outputPath = path.join(workDir, 'offline', `${quality}.mp4`);
      const url = await this.uploadFile(
        outputPath,
        `${outputBasePath}/offline/${quality}.mp4`,
        'video/mp4'
      );

      downloads[quality] = url;
    }

    return downloads;
  }

  /**
   * Run FFmpeg command
   */
  private async runFFmpeg(args: string[]): Promise<void> {
    return this.runCommand(FFMPEG_PATH, ['-y', '-hide_banner', '-loglevel', 'warning', ...args]);
  }

  /**
   * Run a shell command
   */
  private runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Probe video file for metadata
   */
  private async probeVideo(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const args = getProbeArgs(inputPath);
      const proc = spawn(FFPROBE_PATH, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const metadata = parseProbeOutput(stdout);
            resolve(metadata);
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`ffprobe failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Download file from S3 to local path
   */
  private async downloadFromS3(key: string, localPath: string): Promise<void> {
    await streamFromS3ToFile(key, localPath);
  }

  /**
   * Upload file to S3
   */
  private async uploadFile(localPath: string, key: string, contentType: string): Promise<string> {
    const content = await fs.readFile(localPath);
    await uploadToS3(key, content, contentType);

    const cdnBaseUrl = CDN_URL;
    return `${cdnBaseUrl}/${key}`;
  }

  /**
   * Upload entire directory to S3
   */
  private async uploadDirectory(localDir: string, s3Prefix: string): Promise<void> {
    const files = await fs.readdir(localDir, { withFileTypes: true });

    for (const file of files) {
      const localPath = path.join(localDir, file.name);
      const s3Key = `${s3Prefix}/${file.name}`;

      if (file.isDirectory()) {
        await this.uploadDirectory(localPath, s3Key);
      } else {
        const contentType = this.getContentType(file.name);
        await this.uploadFile(localPath, s3Key, contentType);
      }
    }
  }

  /**
   * Get MIME type for file
   */
  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: Record<string, string> = {
      '.m3u8': 'application/x-mpegURL',
      '.mpd': 'application/dash+xml',
      '.m4s': 'video/mp4',
      '.ts': 'video/MP2T',
      '.mp4': 'video/mp4',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.vtt': 'text/vtt',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Update job status in database and emit WebSocket progress
   */
  private async updateJobStatus(
    jobId: string,
    status: TranscodeStatus,
    phase: string,
    progress: number,
    currentQuality?: string,
    message?: string,
    userDid?: string
  ): Promise<void> {
    await db
      .update(schema.transcodeJobs)
      .set({
        status,
        phase,
        progress,
        updatedAt: new Date(),
        ...(status === 'transcoding' && !phase.includes('init') ? { startedAt: new Date() } : {}),
      })
      .where(eq(schema.transcodeJobs.id, jobId));

    // Emit WebSocket progress update
    emitTranscodeProgress({
      jobId,
      status,
      phase,
      progress,
      currentQuality,
      message,
    });

    // Send webhook for progress milestones
    if (userDid) {
      try {
        const webhooks = getTranscodeWebhooks();
        await webhooks.onAdaptiveTranscodeProgress(jobId, userDid, progress, phase, currentQuality);
      } catch {
        // Webhook delivery is best-effort, don't fail the job
      }
    }
  }

  /**
   * Update job metadata after probing
   */
  private async updateJobMetadata(jobId: string, metadata: VideoMetadata): Promise<void> {
    await db
      .update(schema.transcodeJobs)
      .set({
        inputWidth: metadata.width,
        inputHeight: metadata.height,
        inputDuration: metadata.duration,
        inputCodec: metadata.codec,
        inputBitrate: metadata.bitrate,
        inputFps: metadata.fps,
        updatedAt: new Date(),
      })
      .where(eq(schema.transcodeJobs.id, jobId));
  }

  /**
   * Update job completion and emit WebSocket complete event
   */
  private async updateJobCompletion(
    jobId: string,
    userDid: string,
    videoUri: string | undefined,
    outputs: {
      hlsMasterUrl?: string;
      dashManifestUrl?: string;
      thumbnailSpriteUrl?: string;
      thumbnailVttUrl?: string;
      offlineDownloads?: Record<string, string>;
      outputBasePath: string;
      availableQualities: QualityLevel[];
    }
  ): Promise<void> {
    await db
      .update(schema.transcodeJobs)
      .set({
        status: 'completed',
        progress: 100,
        hlsMasterUrl: outputs.hlsMasterUrl,
        dashManifestUrl: outputs.dashManifestUrl,
        thumbnailSpriteUrl: outputs.thumbnailSpriteUrl,
        thumbnailVttUrl: outputs.thumbnailVttUrl,
        offlineDownloads: outputs.offlineDownloads,
        outputBasePath: outputs.outputBasePath,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.transcodeJobs.id, jobId));

    // Emit WebSocket completion event
    emitTranscodeComplete({
      jobId,
      videoUri,
      userDid,
      hlsMasterUrl: outputs.hlsMasterUrl,
      dashManifestUrl: outputs.dashManifestUrl,
      thumbnailSpriteUrl: outputs.thumbnailSpriteUrl,
      thumbnailVttUrl: outputs.thumbnailVttUrl,
      availableQualities: outputs.availableQualities,
    });

    // Send webhook notification
    try {
      const webhooks = getTranscodeWebhooks();
      await webhooks.onAdaptiveTranscodeCompleted(jobId, userDid, {
        videoUri,
        hlsMasterUrl: outputs.hlsMasterUrl,
        dashManifestUrl: outputs.dashManifestUrl,
        thumbnailSpriteUrl: outputs.thumbnailSpriteUrl,
        thumbnailVttUrl: outputs.thumbnailVttUrl,
        availableQualities: outputs.availableQualities,
      });
    } catch {
      // Webhook delivery is best-effort
    }

    // Create video variants records
    for (const quality of outputs.availableQualities) {
      const preset = QUALITY_PRESETS[quality];

      // HLS variant
      if (outputs.hlsMasterUrl) {
        await db.insert(schema.videoVariants).values({
          id: `${jobId}_hls_${quality}`,
          videoUri: videoUri || jobId,
          quality,
          width: preset.width,
          height: preset.height,
          bitrate: preset.videoBitrate,
          codec: 'h264',
          format: 'hls',
          playlistUrl: outputs.hlsMasterUrl.replace('master.m3u8', `${quality}/playlist.m3u8`),
        }).onConflictDoNothing();
      }

      // DASH variant
      if (outputs.dashManifestUrl) {
        await db.insert(schema.videoVariants).values({
          id: `${jobId}_dash_${quality}`,
          videoUri: videoUri || jobId,
          quality,
          width: preset.width,
          height: preset.height,
          bitrate: preset.videoBitrate,
          codec: 'h264',
          format: 'dash',
          playlistUrl: outputs.dashManifestUrl,
        }).onConflictDoNothing();
      }
    }
  }

  /**
   * Get BullMQ priority value
   */
  private getPriorityValue(priority: string): number {
    const priorities: Record<string, number> = {
      urgent: 1,
      high: 2,
      normal: 3,
      low: 4,
    };
    return priorities[priority] || 3;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<schema.TranscodeJob | null> {
    const [job] = await db
      .select()
      .from(schema.transcodeJobs)
      .where(eq(schema.transcodeJobs.id, jobId))
      .limit(1);

    return job || null;
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}

export const adaptiveTranscodeService = AdaptiveTranscodeService.getInstance();
export default adaptiveTranscodeService;
