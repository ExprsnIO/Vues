/**
 * Transcode Webhooks Service
 * Sends webhook notifications for video processing events
 * Uses BullMQ for reliable retry handling
 */

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '../../db/index.js';
import { webhookSubscriptions, webhookDeliveries } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createHmac } from 'crypto';

/**
 * Webhook event types for video processing
 */
export type WebhookEventType =
  | 'video.upload.started'
  | 'video.processing.started'
  | 'video.processing.progress'
  | 'video.processing.completed'
  | 'video.processing.failed'
  | 'video.deleted'
  | 'video.adaptive.started'
  | 'video.adaptive.progress'
  | 'video.adaptive.completed'
  | 'video.adaptive.failed';

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: {
    uploadId: string;
    videoUri?: string;
    userId: string;
    progress?: number;
    phase?: string;
    currentQuality?: string;
    cdnUrl?: string;
    hlsPlaylist?: string;
    hlsMasterUrl?: string;
    dashManifestUrl?: string;
    thumbnailSpriteUrl?: string;
    thumbnailVttUrl?: string;
    availableQualities?: string[];
    thumbnail?: string;
    duration?: number;
    error?: string;
    retryCount?: number;
  };
}

/**
 * Webhook delivery result
 */
export interface DeliveryResult {
  subscriptionId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  duration: number;
}

/**
 * Webhook retry job data
 */
export interface WebhookRetryJobData {
  subscriptionId: string;
  payload: WebhookPayload;
  attemptNumber: number;
}

/**
 * Transcode Webhooks Service
 */
export class TranscodeWebhooks {
  private deliveryTimeout = 30000; // 30 seconds
  private maxRetries = 3;
  private queue: Queue<WebhookRetryJobData> | null = null;
  private worker: Worker<WebhookRetryJobData> | null = null;
  private redisOptions: { host: string; port: number; password?: string; db: number } | null = null;

  /**
   * Initialize the webhook service with Redis for BullMQ
   */
  initialize(redis: Redis): void {
    if (this.queue) return; // Already initialized

    this.redisOptions = {
      host: redis.options.host || 'localhost',
      port: redis.options.port || 6379,
      password: redis.options.password,
      db: redis.options.db || 0,
    };

    // Create BullMQ queue for webhook retries
    this.queue = new Queue<WebhookRetryJobData>('webhook-retries', {
      connection: this.redisOptions,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    // Start the worker
    this.startWorker();

    console.log('[TranscodeWebhooks] Initialized with BullMQ queue');
  }

  /**
   * Start the webhook retry worker
   */
  private startWorker(): void {
    if (this.worker || !this.redisOptions) return;

    this.worker = new Worker<WebhookRetryJobData>(
      'webhook-retries',
      async (job) => this.processRetryJob(job),
      {
        connection: this.redisOptions,
        concurrency: 5,
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`[TranscodeWebhooks] Retry job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[TranscodeWebhooks] Retry job ${job?.id} failed:`, err);
    });
  }

  /**
   * Process a retry job
   */
  private async processRetryJob(job: Job<WebhookRetryJobData>): Promise<void> {
    const { subscriptionId, payload, attemptNumber } = job.data;

    const subscription = await db.query.webhookSubscriptions.findFirst({
      where: eq(webhookSubscriptions.id, subscriptionId),
    });

    if (!subscription || !subscription.active) {
      console.log(`[TranscodeWebhooks] Subscription ${subscriptionId} no longer active, skipping retry`);
      return;
    }

    const result = await this.deliverWebhook(subscription, payload);

    // Record retry attempt
    await db.insert(webhookDeliveries).values({
      id: nanoid(),
      subscriptionId,
      eventId: payload.id,
      eventType: payload.type,
      payload: payload as unknown as Record<string, unknown>,
      statusCode: result.statusCode,
      success: result.success,
      error: result.error,
      duration: result.duration,
      attemptNumber: attemptNumber + 1,
      createdAt: new Date(),
    });

    // If still failing and under max retries, queue another retry
    if (!result.success && attemptNumber + 1 < this.maxRetries) {
      await this.queueRetry(subscriptionId, payload, attemptNumber + 1);
    }
  }

  /**
   * Stop the worker gracefully
   */
  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  /**
   * Send webhook for upload started
   */
  async onUploadStarted(uploadId: string, userId: string): Promise<void> {
    await this.sendWebhook('video.upload.started', {
      uploadId,
      userId,
    });
  }

  /**
   * Send webhook for processing started
   */
  async onProcessingStarted(uploadId: string, userId: string): Promise<void> {
    await this.sendWebhook('video.processing.started', {
      uploadId,
      userId,
    });
  }

  /**
   * Send webhook for processing progress
   */
  async onProcessingProgress(
    uploadId: string,
    userId: string,
    progress: number
  ): Promise<void> {
    // Only send progress webhooks at 25%, 50%, 75%
    if (progress !== 25 && progress !== 50 && progress !== 75) {
      return;
    }

    await this.sendWebhook('video.processing.progress', {
      uploadId,
      userId,
      progress,
    });
  }

  /**
   * Send webhook for processing completed
   */
  async onProcessingCompleted(
    uploadId: string,
    userId: string,
    result: {
      videoUri: string;
      cdnUrl: string;
      hlsPlaylist?: string;
      thumbnail?: string;
      duration?: number;
    }
  ): Promise<void> {
    await this.sendWebhook('video.processing.completed', {
      uploadId,
      userId,
      videoUri: result.videoUri,
      cdnUrl: result.cdnUrl,
      hlsPlaylist: result.hlsPlaylist,
      thumbnail: result.thumbnail,
      duration: result.duration,
    });
  }

  /**
   * Send webhook for processing failed
   */
  async onProcessingFailed(
    uploadId: string,
    userId: string,
    error: string,
    retryCount: number
  ): Promise<void> {
    await this.sendWebhook('video.processing.failed', {
      uploadId,
      userId,
      error,
      retryCount,
    });
  }

  /**
   * Send webhook for video deleted
   */
  async onVideoDeleted(
    videoUri: string,
    userId: string,
    deletedBy: string
  ): Promise<void> {
    await this.sendWebhook('video.deleted', {
      uploadId: '',
      userId,
      videoUri,
    });
  }

  /**
   * Send webhook for adaptive streaming transcode started
   */
  async onAdaptiveTranscodeStarted(
    jobId: string,
    userId: string,
    videoUri?: string
  ): Promise<void> {
    await this.sendWebhook('video.adaptive.started', {
      uploadId: jobId,
      userId,
      videoUri,
    });
  }

  /**
   * Send webhook for adaptive streaming transcode progress
   */
  async onAdaptiveTranscodeProgress(
    jobId: string,
    userId: string,
    progress: number,
    phase: string,
    currentQuality?: string
  ): Promise<void> {
    // Only send progress webhooks at significant milestones
    const milestones = [10, 25, 50, 75, 90];
    if (!milestones.includes(progress)) {
      return;
    }

    await this.sendWebhook('video.adaptive.progress', {
      uploadId: jobId,
      userId,
      progress,
      phase,
      currentQuality,
    });
  }

  /**
   * Send webhook for adaptive streaming transcode completed
   */
  async onAdaptiveTranscodeCompleted(
    jobId: string,
    userId: string,
    result: {
      videoUri?: string;
      hlsMasterUrl?: string;
      dashManifestUrl?: string;
      thumbnailSpriteUrl?: string;
      thumbnailVttUrl?: string;
      availableQualities: string[];
      duration?: number;
    }
  ): Promise<void> {
    await this.sendWebhook('video.adaptive.completed', {
      uploadId: jobId,
      userId,
      videoUri: result.videoUri,
      hlsMasterUrl: result.hlsMasterUrl,
      dashManifestUrl: result.dashManifestUrl,
      thumbnailSpriteUrl: result.thumbnailSpriteUrl,
      thumbnailVttUrl: result.thumbnailVttUrl,
      availableQualities: result.availableQualities,
      duration: result.duration,
    });
  }

  /**
   * Send webhook for adaptive streaming transcode failed
   */
  async onAdaptiveTranscodeFailed(
    jobId: string,
    userId: string,
    error: string,
    phase?: string
  ): Promise<void> {
    await this.sendWebhook('video.adaptive.failed', {
      uploadId: jobId,
      userId,
      error,
      phase,
    });
  }

  /**
   * Send webhook to all subscribers
   */
  private async sendWebhook(
    eventType: WebhookEventType,
    data: WebhookPayload['data']
  ): Promise<void> {
    // Get active subscriptions for this event type
    const subscriptions = await db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.active, true),
          // Check if event type is in the subscribed events array
        )
      );

    // Filter to subscriptions that want this event type
    const relevantSubs = subscriptions.filter(
      (sub) => {
        const events = sub.events as string[];
        return events.includes(eventType) || events.includes('*');
      }
    );

    if (relevantSubs.length === 0) {
      return;
    }

    // Build payload
    const payload: WebhookPayload = {
      id: nanoid(),
      type: eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    // Send to each subscriber
    const deliveries = await Promise.allSettled(
      relevantSubs.map((sub) => this.deliverWebhook(sub, payload))
    );

    // Log results
    const results = deliveries.map((d, i) => (
      d.status === 'fulfilled'
        ? d.value
        : { subscriptionId: relevantSubs[i]!.id, success: false, error: String(d.reason), duration: 0 }
    ));

    console.log(
      `[TranscodeWebhooks] Delivered ${eventType} to ${results.filter(r => r.success).length}/${results.length} subscribers`
    );
  }

  /**
   * Deliver webhook to a single subscriber
   */
  private async deliverWebhook(
    subscription: typeof webhookSubscriptions.$inferSelect,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    const deliveryId = nanoid();
    const startTime = Date.now();
    let statusCode: number | undefined;
    let error: string | undefined;
    let success = false;

    try {
      // Sign the payload
      const signature = this.signPayload(payload, subscription.secret);

      // Send the webhook
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-ID': payload.id,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': payload.timestamp,
          'User-Agent': 'Exprsn-Webhooks/1.0',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.deliveryTimeout),
      });

      statusCode = response.status;
      success = response.ok;

      if (!response.ok) {
        error = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const duration = Date.now() - startTime;

    // Record delivery attempt
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      subscriptionId: subscription.id,
      eventId: payload.id,
      eventType: payload.type,
      payload: payload as unknown as Record<string, unknown>,
      statusCode,
      success,
      error,
      duration,
      attemptNumber: 1,
      createdAt: new Date(),
    });

    // If failed, queue for retry
    if (!success) {
      await this.queueRetry(subscription.id, payload, 1);
    }

    return {
      subscriptionId: subscription.id,
      success,
      statusCode,
      error,
      duration,
    };
  }

  /**
   * Sign webhook payload with HMAC-SHA256
   */
  private signPayload(payload: WebhookPayload, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Queue webhook for retry using BullMQ
   */
  private async queueRetry(
    subscriptionId: string,
    payload: WebhookPayload,
    attemptNumber: number
  ): Promise<void> {
    if (attemptNumber >= this.maxRetries) {
      console.log(
        `[TranscodeWebhooks] Max retries reached for ${subscriptionId}, event ${payload.id}`
      );
      return;
    }

    // Calculate retry delay with exponential backoff (1s, 2s, 4s, ... up to 60s)
    const delayMs = Math.min(1000 * Math.pow(2, attemptNumber), 60000);

    if (this.queue) {
      // Use BullMQ for reliable retry handling
      await this.queue.add(
        'webhook-retry',
        {
          subscriptionId,
          payload,
          attemptNumber,
        },
        {
          delay: delayMs,
          attempts: 1, // We handle our own retry logic
          jobId: `${payload.id}-retry-${attemptNumber}`,
        }
      );
      console.log(
        `[TranscodeWebhooks] Queued retry ${attemptNumber + 1} for ${subscriptionId}, delay ${delayMs}ms`
      );
    } else {
      // Fallback to setTimeout if Redis/BullMQ not available
      console.warn('[TranscodeWebhooks] BullMQ not initialized, using setTimeout fallback');
      setTimeout(async () => {
        const subscription = await db.query.webhookSubscriptions.findFirst({
          where: eq(webhookSubscriptions.id, subscriptionId),
        });

        if (!subscription || !subscription.active) {
          return;
        }

        const result = await this.deliverWebhook(subscription, payload);

        await db.insert(webhookDeliveries).values({
          id: nanoid(),
          subscriptionId,
          eventId: payload.id,
          eventType: payload.type,
          payload: payload as unknown as Record<string, unknown>,
          statusCode: result.statusCode,
          success: result.success,
          error: result.error,
          duration: result.duration,
          attemptNumber: attemptNumber + 1,
          createdAt: new Date(),
        });

        if (!result.success && attemptNumber + 1 < this.maxRetries) {
          await this.queueRetry(subscriptionId, payload, attemptNumber + 1);
        }
      }, delayMs);
    }
  }

  /**
   * Register a webhook subscription
   */
  async registerSubscription(
    userId: string,
    url: string,
    events: WebhookEventType[],
    secret?: string
  ): Promise<{ id: string; secret: string }> {
    const id = nanoid();
    const webhookSecret = secret || nanoid(32);

    await db.insert(webhookSubscriptions).values({
      id,
      userId,
      url,
      events,
      secret: webhookSecret,
      active: true,
      createdAt: new Date(),
    });

    return { id, secret: webhookSecret };
  }

  /**
   * Unregister a webhook subscription
   */
  async unregisterSubscription(subscriptionId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.id, subscriptionId),
          eq(webhookSubscriptions.userId, userId)
        )
      );

    return true;
  }

  /**
   * List user's webhook subscriptions
   */
  async listSubscriptions(userId: string): Promise<Array<{
    id: string;
    url: string;
    events: string[];
    active: boolean;
    createdAt: Date;
  }>> {
    const subs = await db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, userId));

    return subs.map((sub) => ({
      id: sub.id,
      url: sub.url,
      events: sub.events as string[],
      active: sub.active,
      createdAt: sub.createdAt,
    }));
  }
}

// Singleton instance
let webhooksInstance: TranscodeWebhooks | null = null;

export function getTranscodeWebhooks(): TranscodeWebhooks {
  if (!webhooksInstance) {
    webhooksInstance = new TranscodeWebhooks();
  }
  return webhooksInstance;
}

/**
 * Initialize the webhook service with Redis for BullMQ support
 */
export function initializeTranscodeWebhooks(redis: Redis): TranscodeWebhooks {
  const instance = getTranscodeWebhooks();
  instance.initialize(redis);
  return instance;
}

export default TranscodeWebhooks;
