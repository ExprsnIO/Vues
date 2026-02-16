import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * Prefetch job data
 */
export interface PrefetchJob {
  userId: string;
  priority: 'high' | 'medium' | 'low';
  type: 'timeline' | 'video' | 'user_profile';
  metadata?: Record<string, unknown>;
}

/**
 * Video prefetch job data
 */
export interface VideoPrefetchJob {
  videoUri: string;
  userId: string;
  hlsPlaylist: string;
  segmentsToFetch: number[];
}

/**
 * Queue statistics
 */
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * Prefetch queue configuration
 */
export interface PrefetchQueueConfig {
  redisUrl: string;
  concurrency?: number;
  maxAttempts?: number;
  backoffDelay?: number;
  removeOnComplete?: number;
  removeOnFail?: number;
}

const DEFAULT_CONFIG: Required<Omit<PrefetchQueueConfig, 'redisUrl'>> = {
  concurrency: 50,
  maxAttempts: 3,
  backoffDelay: 2000,
  removeOnComplete: 100,
  removeOnFail: 50,
};

/**
 * Priority values for job ordering
 */
const PRIORITY_VALUES = {
  high: 1,
  medium: 5,
  low: 10,
};

/**
 * Prefetch queue manager
 */
export class PrefetchQueue {
  private queue: Queue<PrefetchJob>;
  private videoQueue: Queue<VideoPrefetchJob>;
  private connection: Redis;
  private config: Required<PrefetchQueueConfig>;

  constructor(config: PrefetchQueueConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create Redis connection
    this.connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    // Create queues
    this.queue = new Queue<PrefetchJob>('prefetch', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.config.maxAttempts,
        backoff: {
          type: 'exponential',
          delay: this.config.backoffDelay,
        },
        removeOnComplete: this.config.removeOnComplete,
        removeOnFail: this.config.removeOnFail,
      },
    });

    this.videoQueue = new Queue<VideoPrefetchJob>('video-prefetch', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 50,
        removeOnFail: 25,
      },
    });
  }

  /**
   * Queue a prefetch job
   */
  async queuePrefetch(
    userId: string,
    priority: 'high' | 'medium' | 'low' = 'medium',
    type: 'timeline' | 'video' | 'user_profile' = 'timeline',
    options?: { delay?: number; metadata?: Record<string, unknown> }
  ): Promise<string> {
    const job = await this.queue.add(
      'prefetch',
      {
        userId,
        priority,
        type,
        metadata: options?.metadata,
      },
      {
        priority: PRIORITY_VALUES[priority],
        delay: options?.delay,
        jobId: `${type}:${userId}:${Date.now()}`,
      }
    );

    return job.id!;
  }

  /**
   * Queue multiple prefetch jobs
   */
  async queueBatchPrefetch(
    userIds: string[],
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<string[]> {
    const jobs = userIds.map((userId) => ({
      name: 'prefetch',
      data: {
        userId,
        priority,
        type: 'timeline' as const,
      },
      opts: {
        priority: PRIORITY_VALUES[priority],
        jobId: `timeline:${userId}:${Date.now()}`,
      },
    }));

    const results = await this.queue.addBulk(jobs);
    return results.map((job) => job.id!);
  }

  /**
   * Queue video segment prefetch
   */
  async queueVideoPrefetch(job: VideoPrefetchJob, priority: number = 2): Promise<string> {
    const result = await this.videoQueue.add('video-prefetch', job, {
      priority,
      jobId: `video:${job.videoUri}:${job.segmentsToFetch.join(',')}`,
    });

    return result.id!;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(limit: number = 10): Promise<Job<PrefetchJob>[]> {
    return this.queue.getFailed(0, limit);
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    await this.videoQueue.pause();
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    await this.videoQueue.resume();
  }

  /**
   * Clean old jobs
   */
  async clean(grace: number = 3600000): Promise<void> {
    await this.queue.clean(grace, 1000, 'completed');
    await this.queue.clean(grace, 1000, 'failed');
    await this.videoQueue.clean(grace, 1000, 'completed');
    await this.videoQueue.clean(grace, 1000, 'failed');
  }

  /**
   * Close the queue
   */
  async close(): Promise<void> {
    await this.queue.close();
    await this.videoQueue.close();
    await this.connection.quit();
  }

  /**
   * Get the underlying BullMQ queue
   */
  getQueue(): Queue<PrefetchJob> {
    return this.queue;
  }

  /**
   * Get the video prefetch queue
   */
  getVideoQueue(): Queue<VideoPrefetchJob> {
    return this.videoQueue;
  }

  /**
   * Get Redis connection
   */
  getConnection(): Redis {
    return this.connection;
  }
}

/**
 * Create a prefetch queue
 */
export function createPrefetchQueue(config: PrefetchQueueConfig): PrefetchQueue {
  return new PrefetchQueue(config);
}
