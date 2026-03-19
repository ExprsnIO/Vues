/**
 * Stream Webhook Service
 * Allows streamers to configure webhooks for stream events
 */

import { db } from '../../db/index.js';
import { streamWebhooks, liveStreams, users } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { redis } from '../../cache/redis.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

// Webhook event types
export type StreamWebhookEvent =
  | 'stream.started'
  | 'stream.ended'
  | 'stream.viewer_milestone'
  | 'stream.raid_received'
  | 'stream.raid_sent'
  | 'stream.chat_message'
  | 'stream.follow'
  | 'stream.subscribe'
  | 'stream.donation'
  | 'stream.ban'
  | 'stream.timeout'
  | 'stream.mod_action';

export interface WebhookConfig {
  id: string;
  userDid: string;
  url: string;
  secret: string;
  events: StreamWebhookEvent[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date;
  failureCount: number;
}

export interface WebhookPayload {
  event: StreamWebhookEvent;
  timestamp: string;
  streamId?: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  duration: number;
}

// Cache keys
const CACHE_KEYS = {
  userWebhooks: (userDid: string) => `webhooks:user:${userDid}`,
  webhookSecret: (webhookId: string) => `webhooks:secret:${webhookId}`,
};

// Max failures before auto-disabling
const MAX_FAILURES = 10;

// Retry delays in milliseconds
const RETRY_DELAYS = [1000, 5000, 30000, 60000, 300000];

export class StreamWebhookService {
  /**
   * Create a new webhook configuration
   */
  async createWebhook(
    userDid: string,
    config: {
      url: string;
      events: StreamWebhookEvent[];
    }
  ): Promise<WebhookConfig> {
    // Validate URL
    this.validateWebhookUrl(config.url);

    // Generate secret for HMAC signing
    const secret = crypto.randomBytes(32).toString('hex');
    const now = new Date();

    const webhook: WebhookConfig = {
      id: nanoid(),
      userDid,
      url: config.url,
      secret,
      events: config.events,
      active: true,
      createdAt: now,
      updatedAt: now,
      failureCount: 0,
    };

    await db.insert(streamWebhooks).values({
      id: webhook.id,
      userDid: webhook.userDid,
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events,
      active: webhook.active,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
      failureCount: 0,
    });

    // Invalidate cache
    await this.invalidateCache(userDid);

    return webhook;
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    webhookId: string,
    userDid: string,
    updates: {
      url?: string;
      events?: StreamWebhookEvent[];
      active?: boolean;
    }
  ): Promise<WebhookConfig | null> {
    if (updates.url) {
      this.validateWebhookUrl(updates.url);
    }

    const [existing] = await db
      .select()
      .from(streamWebhooks)
      .where(and(eq(streamWebhooks.id, webhookId), eq(streamWebhooks.userDid, userDid)))
      .limit(1);

    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.url !== undefined) updateData.url = updates.url;
    if (updates.events !== undefined) updateData.events = updates.events;
    if (updates.active !== undefined) {
      updateData.active = updates.active;
      // Reset failure count when re-enabling
      if (updates.active) updateData.failureCount = 0;
    }

    await db
      .update(streamWebhooks)
      .set(updateData)
      .where(eq(streamWebhooks.id, webhookId));

    // Invalidate cache
    await this.invalidateCache(userDid);

    const [updated] = await db
      .select()
      .from(streamWebhooks)
      .where(eq(streamWebhooks.id, webhookId))
      .limit(1);

    return updated ? this.mapToConfig(updated) : null;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string, userDid: string): Promise<boolean> {
    const result = await db
      .delete(streamWebhooks)
      .where(and(eq(streamWebhooks.id, webhookId), eq(streamWebhooks.userDid, userDid)))
      .returning();

    await this.invalidateCache(userDid);

    return result.length > 0;
  }

  /**
   * Get all webhooks for a user
   */
  async getWebhooks(userDid: string): Promise<WebhookConfig[]> {
    // Check cache
    const cacheKey = CACHE_KEYS.userWebhooks(userDid);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    const webhooks = await db
      .select()
      .from(streamWebhooks)
      .where(eq(streamWebhooks.userDid, userDid));

    const configs = webhooks.map(w => this.mapToConfig(w));

    // Cache for 5 minutes
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(configs));
    } catch {
      // Cache write failed
    }

    return configs;
  }

  /**
   * Get a single webhook (with secret masked)
   */
  async getWebhook(webhookId: string, userDid: string): Promise<WebhookConfig | null> {
    const [webhook] = await db
      .select()
      .from(streamWebhooks)
      .where(and(eq(streamWebhooks.id, webhookId), eq(streamWebhooks.userDid, userDid)))
      .limit(1);

    return webhook ? this.mapToConfig(webhook) : null;
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(webhookId: string, userDid: string): Promise<string | null> {
    const [existing] = await db
      .select()
      .from(streamWebhooks)
      .where(and(eq(streamWebhooks.id, webhookId), eq(streamWebhooks.userDid, userDid)))
      .limit(1);

    if (!existing) {
      return null;
    }

    const newSecret = crypto.randomBytes(32).toString('hex');

    await db
      .update(streamWebhooks)
      .set({ secret: newSecret, updatedAt: new Date() })
      .where(eq(streamWebhooks.id, webhookId));

    await this.invalidateCache(userDid);

    return newSecret;
  }

  /**
   * Trigger webhooks for a specific event
   */
  async triggerEvent(
    userDid: string,
    event: StreamWebhookEvent,
    data: Record<string, unknown>,
    streamId?: string
  ): Promise<{ triggered: number; successful: number }> {
    const webhooks = await this.getWebhooks(userDid);

    // Filter to active webhooks subscribed to this event
    const eligibleWebhooks = webhooks.filter(
      w => w.active && w.events.includes(event)
    );

    if (eligibleWebhooks.length === 0) {
      return { triggered: 0, successful: 0 };
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      streamId,
      data,
    };

    let successful = 0;

    // Deliver webhooks in parallel
    const deliveryPromises = eligibleWebhooks.map(async webhook => {
      const result = await this.deliverWebhook(webhook, payload);

      if (result.success) {
        successful++;
        await this.recordSuccess(webhook.id);
      } else {
        await this.recordFailure(webhook.id, webhook.userDid, result.error);
      }

      return result;
    });

    await Promise.all(deliveryPromises);

    return { triggered: eligibleWebhooks.length, successful };
  }

  /**
   * Trigger stream started event
   */
  async onStreamStarted(streamId: string, userDid: string): Promise<void> {
    const [stream] = await db
      .select({
        id: liveStreams.id,
        title: liveStreams.title,
        category: liveStreams.category,
        visibility: liveStreams.visibility,
      })
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream) return;

    await this.triggerEvent(userDid, 'stream.started', {
      title: stream.title,
      category: stream.category,
      visibility: stream.visibility,
    }, streamId);
  }

  /**
   * Trigger stream ended event
   */
  async onStreamEnded(
    streamId: string,
    userDid: string,
    stats: {
      duration: number;
      peakViewers: number;
      totalViews: number;
      chatMessages: number;
    }
  ): Promise<void> {
    await this.triggerEvent(userDid, 'stream.ended', stats, streamId);
  }

  /**
   * Trigger viewer milestone event
   */
  async onViewerMilestone(
    streamId: string,
    userDid: string,
    milestone: number,
    currentViewers: number
  ): Promise<void> {
    await this.triggerEvent(userDid, 'stream.viewer_milestone', {
      milestone,
      currentViewers,
    }, streamId);
  }

  /**
   * Trigger follow event during stream
   */
  async onFollowDuringStream(
    streamId: string,
    streamerDid: string,
    follower: { did: string; handle: string; displayName?: string }
  ): Promise<void> {
    await this.triggerEvent(streamerDid, 'stream.follow', {
      followerDid: follower.did,
      followerHandle: follower.handle,
      followerDisplayName: follower.displayName,
    }, streamId);
  }

  /**
   * Trigger raid received event
   */
  async onRaidReceived(
    streamId: string,
    streamerDid: string,
    raider: { did: string; handle: string; displayName?: string },
    viewerCount: number
  ): Promise<void> {
    await this.triggerEvent(streamerDid, 'stream.raid_received', {
      raiderDid: raider.did,
      raiderHandle: raider.handle,
      raiderDisplayName: raider.displayName,
      viewerCount,
    }, streamId);
  }

  /**
   * Test a webhook by sending a test payload
   */
  async testWebhook(webhookId: string, userDid: string): Promise<WebhookDeliveryResult> {
    const webhook = await this.getWebhook(webhookId, userDid);

    if (!webhook) {
      return { success: false, error: 'Webhook not found', duration: 0 };
    }

    // Get full webhook with secret
    const [fullWebhook] = await db
      .select()
      .from(streamWebhooks)
      .where(eq(streamWebhooks.id, webhookId))
      .limit(1);

    if (!fullWebhook) {
      return { success: false, error: 'Webhook not found', duration: 0 };
    }

    const payload: WebhookPayload = {
      event: 'stream.started',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'This is a test webhook delivery',
      },
    };

    return await this.deliverWebhook(
      { ...webhook, secret: fullWebhook.secret },
      payload
    );
  }

  // ============================================
  // Private helper methods
  // ============================================

  private validateWebhookUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // Must be HTTPS
      if (parsed.protocol !== 'https:') {
        throw new Error('Webhook URL must use HTTPS');
      }

      // Block localhost and private IPs
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.endsWith('.local')
      ) {
        throw new Error('Webhook URL cannot point to local or private addresses');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Webhook URL')) {
        throw error;
      }
      throw new Error('Invalid webhook URL');
    }
  }

  private async deliverWebhook(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const bodyString = JSON.stringify(payload);

    // Generate HMAC signature
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(bodyString)
      .digest('hex');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Exprsn-Signature': `sha256=${signature}`,
          'X-Exprsn-Event': payload.event,
          'X-Exprsn-Delivery': nanoid(),
          'X-Exprsn-Timestamp': payload.timestamp,
          'User-Agent': 'Exprsn-Webhook/1.0',
        },
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      if (response.ok) {
        return { success: true, statusCode: response.status, duration };
      }

      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: message.includes('aborted') ? 'Request timeout' : message,
        duration,
      };
    }
  }

  private async recordSuccess(webhookId: string): Promise<void> {
    await db
      .update(streamWebhooks)
      .set({
        lastTriggeredAt: new Date(),
        failureCount: 0,
      })
      .where(eq(streamWebhooks.id, webhookId));
  }

  private async recordFailure(
    webhookId: string,
    userDid: string,
    error?: string
  ): Promise<void> {
    const [webhook] = await db
      .select({ failureCount: streamWebhooks.failureCount })
      .from(streamWebhooks)
      .where(eq(streamWebhooks.id, webhookId))
      .limit(1);

    const newCount = (webhook?.failureCount || 0) + 1;
    const shouldDisable = newCount >= MAX_FAILURES;

    await db
      .update(streamWebhooks)
      .set({
        failureCount: newCount,
        active: shouldDisable ? false : undefined,
        lastError: error,
        lastTriggeredAt: new Date(),
      })
      .where(eq(streamWebhooks.id, webhookId));

    if (shouldDisable) {
      await this.invalidateCache(userDid);
      // Could send notification to user that webhook was disabled
    }
  }

  private async invalidateCache(userDid: string): Promise<void> {
    try {
      await redis.del(CACHE_KEYS.userWebhooks(userDid));
    } catch {
      // Cache invalidation failed
    }
  }

  private mapToConfig(row: typeof streamWebhooks.$inferSelect): WebhookConfig {
    return {
      id: row.id,
      userDid: row.userDid,
      url: row.url,
      secret: '***', // Mask secret in normal responses
      events: row.events as StreamWebhookEvent[],
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastTriggeredAt: row.lastTriggeredAt ?? undefined,
      failureCount: row.failureCount,
    };
  }
}

// Singleton instance
let streamWebhookService: StreamWebhookService | null = null;

export function getStreamWebhookService(): StreamWebhookService {
  if (!streamWebhookService) {
    streamWebhookService = new StreamWebhookService();
  }
  return streamWebhookService;
}
