/**
 * Workflow Event Handlers
 * Handles events emitted by the WorkflowEngine
 */

import { db } from '../../db/index.js';
import { notifications, adminUsers, moderationItems } from '../../db/schema.js';
import { eq, sql, and, asc, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getWorkflowEngine } from './WorkflowEngine.js';
import { analyzeContent } from './ai-providers.js';
import { redis } from '../../cache/redis.js';
import type { ContentType } from './types.js';

// Helper to safely call redis publish if available
async function tryPublish(channel: string, message: string): Promise<boolean> {
  try {
    // Check if redis has publish method (real Redis vs memory cache)
    if (typeof (redis as any).publish === 'function') {
      await (redis as any).publish(channel, message);
      return true;
    }
  } catch {
    // Publish not available or failed
  }
  return false;
}

// Admin notification channels
const ADMIN_NOTIFICATION_CHANNEL = 'admin:notifications';

/**
 * Initialize workflow event handlers
 * Should be called once at application startup
 */
export function initializeWorkflowEventHandlers(): void {
  const workflowEngine = getWorkflowEngine();

  // Handle user notifications
  workflowEngine.on('user-notification', handleUserNotification);

  // Handle admin notifications
  workflowEngine.on('admin-notification', handleAdminNotification);

  // Handle AI review requests
  workflowEngine.on('ai-review-requested', handleAIReviewRequest);

  // Handle action execution for logging/metrics
  workflowEngine.on('action-executed', handleActionExecuted);

  console.log('[WorkflowEventHandlers] Event handlers initialized');
}

/**
 * Handle user notification event
 */
async function handleUserNotification(data: {
  userDid: string;
  type: string;
  message: string;
  contentId?: string;
}): Promise<void> {
  try {
    const now = new Date();

    await db.insert(notifications).values({
      id: nanoid(),
      userDid: data.userDid,
      actorDid: 'system:moderation',
      reason: `moderation_${data.type}`,
      reasonSubject: data.message,
      targetUri: data.contentId ? `at://moderation/${data.contentId}` : undefined,
      subjectType: 'moderation',
      isRead: false,
      createdAt: now,
      indexedAt: now,
    });

    // Publish to real-time notification channel if available
    await tryPublish(`user:${data.userDid}:notifications`, JSON.stringify({
      type: 'moderation',
      message: data.message,
      contentId: data.contentId,
      timestamp: now.toISOString(),
    }));

    console.log(`[WorkflowEventHandlers] User notification sent to ${data.userDid}`);
  } catch (error) {
    console.error('[WorkflowEventHandlers] Failed to send user notification:', error);
  }
}

/**
 * Handle admin notification event
 */
async function handleAdminNotification(data: {
  type: string;
  message: string;
  context: Record<string, unknown>;
}): Promise<void> {
  try {
    // Get admin users
    const admins = await db
      .select({ did: adminUsers.userDid })
      .from(adminUsers)
      .where(
        inArray(adminUsers.role, ['admin', 'super_admin', 'moderator'])
      );

    const now = new Date();

    // Create notifications for all admins
    if (admins.length > 0) {
      await db.insert(notifications).values(
        admins.map(admin => ({
          id: nanoid(),
          userDid: admin.did,
          actorDid: 'system:workflow',
          reason: `admin_${data.type}`,
          reasonSubject: data.message,
          subjectType: 'admin_alert',
          isRead: false,
          createdAt: now,
          indexedAt: now,
        }))
      );
    }

    // Publish to admin notification channel
    await tryPublish(ADMIN_NOTIFICATION_CHANNEL, JSON.stringify({
      type: data.type,
      message: data.message,
      context: data.context,
      timestamp: now.toISOString(),
    }));

    console.log(`[WorkflowEventHandlers] Admin notification sent to ${admins.length} admins`);
  } catch (error) {
    console.error('[WorkflowEventHandlers] Failed to send admin notification:', error);
  }
}

/**
 * Handle AI review request event
 */
async function handleAIReviewRequest(data: {
  contentId: string;
  contentType: string;
  authorDid?: string;
}): Promise<void> {
  try {
    // Get content details from moderation items
    const [item] = await db
      .select()
      .from(moderationItems)
      .where(eq(moderationItems.id, data.contentId))
      .limit(1);

    if (!item) {
      console.warn(`[WorkflowEventHandlers] Content not found for AI review: ${data.contentId}`);
      return;
    }

    // Request AI analysis
    const aiResult = await analyzeContent({
      text: item.contentText || undefined,
      url: item.contentUrl || undefined,
      type: item.contentType as ContentType,
    });

    // Update moderation item with AI results
    await db
      .update(moderationItems)
      .set({
        riskScore: aiResult.riskScore,
        toxicityScore: aiResult.toxicityScore,
        nsfwScore: aiResult.nsfwScore,
        spamScore: aiResult.spamScore,
        violenceScore: aiResult.violenceScore,
        hateSpeechScore: aiResult.hateSpeechScore,
        aiProvider: aiResult.provider,
        aiModel: aiResult.model,
        aiResponse: (aiResult.rawResponse || { ...aiResult }) as Record<string, unknown>,
        processedAt: new Date(),
      })
      .where(eq(moderationItems.id, data.contentId));

    // Trigger ai_review_complete workflow
    const { getModerationService } = await import('./service.js');
    await getModerationService().onAIReviewComplete({
      contentId: data.contentId,
      contentType: item.contentType,
      authorDid: item.userId || undefined,
      riskScore: aiResult.riskScore || 0,
      aiScores: {
        toxicity: aiResult.toxicityScore,
        nsfw: aiResult.nsfwScore,
        spam: aiResult.spamScore,
        violence: aiResult.violenceScore,
        hatespeech: aiResult.hateSpeechScore,
      },
    });

    console.log(`[WorkflowEventHandlers] AI review completed for ${data.contentId}`);
  } catch (error) {
    console.error('[WorkflowEventHandlers] AI review request failed:', error);
  }
}

/**
 * Handle action execution event (for metrics/logging)
 */
async function handleActionExecuted(data: {
  action: string;
  params: Record<string, unknown>;
  context: Record<string, unknown>;
}): Promise<void> {
  try {
    // Increment action metrics
    const metricsKey = `workflow:metrics:actions:${data.action}`;
    await redis.incr(metricsKey);

    // Set expiry for daily reset
    const ttl = await redis.ttl(metricsKey);
    if (ttl === -1) {
      // Key exists but has no expiry, set it
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const secondsUntilEndOfDay = Math.floor((endOfDay.getTime() - Date.now()) / 1000);
      await redis.expire(metricsKey, secondsUntilEndOfDay);
    }
  } catch {
    // Metrics collection failed, not critical
  }
}

/**
 * Get workflow action metrics
 */
export async function getWorkflowMetrics(): Promise<Record<string, number>> {
  const actions = [
    'auto_approve',
    'auto_reject',
    'escalate',
    'assign_moderator',
    'request_ai_review',
    'notify_user',
    'notify_admin',
    'apply_warning',
    'apply_mute',
    'apply_suspension',
    'apply_ban',
    'send_webhook',
  ];

  const metrics: Record<string, number> = {};

  for (const action of actions) {
    try {
      const count = await redis.get(`workflow:metrics:actions:${action}`);
      metrics[action] = count ? parseInt(count, 10) : 0;
    } catch {
      metrics[action] = 0;
    }
  }

  return metrics;
}
