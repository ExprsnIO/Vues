/**
 * Transcode Webhooks Service
 * Sends webhook notifications for video processing events
 */

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
  | 'video.deleted';

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
    cdnUrl?: string;
    hlsPlaylist?: string;
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
 * Transcode Webhooks Service
 */
export class TranscodeWebhooks {
  private deliveryTimeout = 30000; // 30 seconds
  private maxRetries = 3;

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
    const results = deliveries.map((d, i) => ({
      subscriptionId: relevantSubs[i]!.id,
      ...(d.status === 'fulfilled' ? d.value : { success: false, error: String(d.reason) }),
    }));

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
      payload,
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
   * Queue webhook for retry
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

    // Calculate retry delay with exponential backoff
    const delayMs = Math.min(1000 * Math.pow(2, attemptNumber), 60000);

    // In a production system, this would use a job queue like BullMQ
    setTimeout(async () => {
      const subscription = await db.query.webhookSubscriptions.findFirst({
        where: eq(webhookSubscriptions.id, subscriptionId),
      });

      if (!subscription || !subscription.active) {
        return;
      }

      const result = await this.deliverWebhook(subscription, payload);

      // Record retry attempt
      await db.insert(webhookDeliveries).values({
        id: nanoid(),
        subscriptionId,
        eventId: payload.id,
        eventType: payload.type,
        payload,
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

export default TranscodeWebhooks;
