/**
 * Directory Sync Service
 * Handles syncing platform directories with proper job queue management
 */

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '../../db/index.js';
import { platformDirectories } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/**
 * Directory sync job data
 */
export interface DirectorySyncJobData {
  jobId: string;
  directoryId: string;
  url: string;
  fullSync?: boolean;
}

/**
 * Directory sync result
 */
export interface DirectorySyncResult {
  recordCount: number;
  syncedAt: Date;
  version?: string;
  errors?: string[];
}

/**
 * Directory Sync Service for platform directory management
 */
export class DirectorySyncService {
  private redis: Redis;
  private redisOptions: { host: string; port: number; password?: string; db: number };
  private queue: Queue;
  private worker: Worker | null = null;
  private static instance: DirectorySyncService | null = null;

  constructor(config: { redis: Redis }) {
    this.redis = config.redis;

    // Extract Redis connection options for BullMQ
    this.redisOptions = {
      host: config.redis.options.host || 'localhost',
      port: config.redis.options.port || 6379,
      password: config.redis.options.password,
      db: config.redis.options.db || 0,
    };

    // Create BullMQ queue for directory sync
    this.queue = new Queue('directory-sync', {
      connection: this.redisOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: { redis: Redis }): DirectorySyncService {
    if (!DirectorySyncService.instance && config) {
      DirectorySyncService.instance = new DirectorySyncService(config);
    }
    if (!DirectorySyncService.instance) {
      throw new Error('DirectorySyncService not initialized');
    }
    return DirectorySyncService.instance;
  }

  /**
   * Initialize singleton with Redis connection
   */
  static initialize(redis: Redis): DirectorySyncService {
    if (!DirectorySyncService.instance) {
      DirectorySyncService.instance = new DirectorySyncService({ redis });
    }
    return DirectorySyncService.instance;
  }

  /**
   * Start the directory sync worker
   */
  startWorker(concurrency = 2): void {
    if (this.worker) return;

    this.worker = new Worker<DirectorySyncJobData>(
      'directory-sync',
      async (job) => this.processDirectorySync(job),
      {
        connection: this.redisOptions,
        concurrency,
      }
    );

    this.worker.on('completed', async (job) => {
      console.log(`[DirectorySyncService] Job ${job.id} completed`);
    });

    this.worker.on('failed', async (job, err) => {
      console.error(`[DirectorySyncService] Job ${job?.id} failed:`, err);

      // Update directory status to error
      if (job?.data.directoryId) {
        await db
          .update(platformDirectories)
          .set({
            status: 'error',
            updatedAt: new Date(),
          })
          .where(eq(platformDirectories.id, job.data.directoryId));
      }
    });

    console.log(`[DirectorySyncService] Worker started with concurrency ${concurrency}`);
  }

  /**
   * Stop the directory sync worker
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  /**
   * Queue a directory sync job
   */
  async queueSync(params: {
    directoryId: string;
    fullSync?: boolean;
  }): Promise<string> {
    const jobId = `dirsync-${nanoid()}`;

    // Get directory info
    const [directory] = await db
      .select()
      .from(platformDirectories)
      .where(eq(platformDirectories.id, params.directoryId));

    if (!directory) {
      throw new Error('Directory not found');
    }

    // Update directory status to syncing
    await db
      .update(platformDirectories)
      .set({
        status: 'syncing',
        updatedAt: new Date(),
      })
      .where(eq(platformDirectories.id, params.directoryId));

    // Add to queue
    await this.queue.add(
      'sync',
      {
        jobId,
        directoryId: params.directoryId,
        url: directory.url,
        fullSync: params.fullSync,
      },
      {
        jobId,
      }
    );

    return jobId;
  }

  /**
   * Process a directory sync job
   */
  private async processDirectorySync(
    job: Job<DirectorySyncJobData>
  ): Promise<DirectorySyncResult> {
    const { directoryId, url, fullSync } = job.data;

    console.log(`[DirectorySyncService] Processing sync for directory ${directoryId}`);

    try {
      // Update progress
      await job.updateProgress(10);

      // Fetch directory metadata
      const metadataUrl = new URL('/.well-known/plc-directory', url);
      const metadataResponse = await fetch(metadataUrl.toString(), {
        signal: AbortSignal.timeout(30000),
        headers: {
          Accept: 'application/json',
        },
      });

      if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch directory metadata: ${metadataResponse.status}`);
      }

      const metadata = await metadataResponse.json() as {
        version?: string;
        totalRecords?: number;
      };

      await job.updateProgress(30);

      // Fetch export data (DIDs)
      let recordCount = 0;
      let errors: string[] = [];

      if (fullSync) {
        // Full sync: fetch all records
        const exportUrl = new URL('/export', url);
        const exportResponse = await fetch(exportUrl.toString(), {
          signal: AbortSignal.timeout(300000), // 5 minute timeout for large exports
          headers: {
            Accept: 'application/jsonl',
          },
        });

        if (exportResponse.ok) {
          const text = await exportResponse.text();
          const lines = text.trim().split('\n').filter(Boolean);
          recordCount = lines.length;

          await job.updateProgress(70);

          // Process each record (in a real implementation, this would
          // store the records in a local cache or database)
          for (const line of lines) {
            try {
              const record = JSON.parse(line);
              // Store or cache the DID document
              // This is where you'd implement actual storage logic
              if (record.did) {
                // Cache in Redis for quick lookups
                await this.redis.set(
                  `plc:${record.did}`,
                  JSON.stringify(record),
                  'EX',
                  86400 // 24 hour TTL
                );
              }
            } catch {
              errors.push(`Failed to parse record: ${line.substring(0, 50)}...`);
            }
          }
        }
      } else {
        // Incremental sync: just verify connectivity and get count
        recordCount = metadata.totalRecords || 0;
      }

      await job.updateProgress(90);

      // Update directory with sync results
      await db
        .update(platformDirectories)
        .set({
          status: 'online',
          lastSyncAt: new Date(),
          recordCount,
          version: metadata.version || '1.0.0',
          updatedAt: new Date(),
        })
        .where(eq(platformDirectories.id, directoryId));

      await job.updateProgress(100);

      const result: DirectorySyncResult = {
        recordCount,
        syncedAt: new Date(),
        version: metadata.version,
        errors: errors.length > 0 ? errors : undefined,
      };

      return result;
    } catch (error) {
      console.error(`[DirectorySyncService] Sync failed for ${directoryId}:`, error);

      // Update directory status to error
      await db
        .update(platformDirectories)
        .set({
          status: 'error',
          updatedAt: new Date(),
        })
        .where(eq(platformDirectories.id, directoryId));

      throw error;
    }
  }

  /**
   * Get sync job status
   */
  async getSyncJobStatus(jobId: string): Promise<{
    status: string;
    progress: number;
    result?: DirectorySyncResult;
    error?: string;
  } | null> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress as number;

    return {
      status: state,
      progress: typeof progress === 'number' ? progress : 0,
      result: job.returnvalue as DirectorySyncResult | undefined,
      error: job.failedReason,
    };
  }

  /**
   * Get pending sync jobs for a directory
   */
  async getPendingSyncs(directoryId: string): Promise<string[]> {
    const jobs = await this.queue.getJobs(['waiting', 'active', 'delayed']);
    return jobs
      .filter((job) => job.data.directoryId === directoryId)
      .map((job) => job.id as string);
  }

  /**
   * Cancel a pending sync job
   */
  async cancelSync(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      return true;
    }

    return false;
  }
}

// Export singleton getter
export function getDirectorySyncService(): DirectorySyncService {
  return DirectorySyncService.getInstance();
}
