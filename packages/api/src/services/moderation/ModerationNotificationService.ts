/**
 * Moderation Notification Service
 * Handles in-app notifications for moderators
 */

import { db } from '../../db/index.js';
import {
  moderationNotifications,
  adminUsers,
  moderationConfig,
} from '../../db/schema.js';
import { eq, and, isNull, lt, desc, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { broadcastAdminActivity } from '../../websocket/admin.js';

/**
 * Notification type
 */
export type NotificationType =
  | 'new_content'
  | 'escalation'
  | 'high_risk'
  | 'appeal'
  | 'queue_full';

/**
 * Notification priority
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Create notification options
 */
export interface CreateNotificationOptions {
  recipientId: string; // Admin user ID or 'all_moderators'
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  contentType?: string;
  contentId?: string;
  contentUri?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

/**
 * Notification response
 */
export interface NotificationResponse {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  contentType?: string;
  contentId?: string;
  contentUri?: string;
  metadata: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
}

/**
 * Moderation Notification Service
 */
export class ModerationNotificationService {
  /**
   * Create a notification
   */
  async createNotification(options: CreateNotificationOptions): Promise<string> {
    const id = nanoid();

    await db.insert(moderationNotifications).values({
      id,
      recipientId: options.recipientId,
      type: options.type,
      priority: options.priority || 'normal',
      title: options.title,
      message: options.message,
      contentType: options.contentType,
      contentId: options.contentId,
      contentUri: options.contentUri,
      metadata: options.metadata || {},
      expiresAt: options.expiresAt,
    });

    // Broadcast to admin WebSocket
    try {
      broadcastAdminActivity({
        adminDid: 'system',
        adminHandle: 'system',
        action: 'moderation_notification',
        targetType: options.contentType,
        targetId: options.contentId,
      });
    } catch (error) {
      console.error('[ModerationNotificationService] Failed to broadcast:', error);
    }

    return id;
  }

  /**
   * Notify all moderators about high-risk content
   */
  async notifyHighRiskContent(
    contentUri: string,
    contentType: string,
    riskScore: number,
    riskLevel: string
  ): Promise<void> {
    // Check if notifications are enabled
    const config = await db.query.moderationConfig.findFirst({
      where: eq(moderationConfig.id, 'default'),
    });

    if (!config?.notifyOnHighRisk) {
      return;
    }

    await this.createNotification({
      recipientId: 'all_moderators',
      type: 'high_risk',
      priority: riskLevel === 'critical' ? 'urgent' : 'high',
      title: `High-Risk ${contentType} Detected`,
      message: `A ${contentType} with risk level "${riskLevel}" (score: ${riskScore}) requires immediate review.`,
      contentType,
      contentUri,
      metadata: {
        riskScore,
        riskLevel,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });
  }

  /**
   * Notify about escalated content
   */
  async notifyEscalation(
    contentUri: string,
    contentType: string,
    reason: string,
    escalatedBy: string
  ): Promise<void> {
    const config = await db.query.moderationConfig.findFirst({
      where: eq(moderationConfig.id, 'default'),
    });

    if (!config?.notifyOnEscalation) {
      return;
    }

    // Get all admin users (super admins)
    const admins = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.role, 'super_admin'));

    for (const admin of admins) {
      await this.createNotification({
        recipientId: admin.id,
        type: 'escalation',
        priority: 'high',
        title: `Content Escalated for Review`,
        message: `A ${contentType} has been escalated: ${reason}`,
        contentType,
        contentUri,
        metadata: {
          escalatedBy,
          reason,
        },
      });
    }
  }

  /**
   * Notify about appeal submitted
   */
  async notifyAppeal(
    appealId: string,
    contentUri: string,
    contentType: string,
    userDid: string
  ): Promise<void> {
    const config = await db.query.moderationConfig.findFirst({
      where: eq(moderationConfig.id, 'default'),
    });

    if (!config?.notifyOnAppeal) {
      return;
    }

    await this.createNotification({
      recipientId: 'all_moderators',
      type: 'appeal',
      priority: 'normal',
      title: 'New Appeal Submitted',
      message: `A user has appealed a moderation decision on their ${contentType}.`,
      contentType,
      contentUri,
      metadata: {
        appealId,
        userDid,
      },
    });
  }

  /**
   * Notify when queue is getting full
   */
  async notifyQueueFull(queueSize: number, maxSize: number): Promise<void> {
    await this.createNotification({
      recipientId: 'all_moderators',
      type: 'queue_full',
      priority: queueSize >= maxSize * 0.9 ? 'urgent' : 'high',
      title: 'Moderation Queue Alert',
      message: `The moderation queue is at ${Math.round((queueSize / maxSize) * 100)}% capacity (${queueSize}/${maxSize} items).`,
      metadata: {
        queueSize,
        maxSize,
        percentage: Math.round((queueSize / maxSize) * 100),
      },
    });
  }

  /**
   * Notify user about their appeal decision
   * This creates a user-facing notification (not admin notification)
   */
  async notifyAppealDecision(
    userId: string,
    appealId: string,
    decision: 'approved' | 'denied',
    notes?: string
  ): Promise<void> {
    const { notifications } = await import('../../db/schema.js');
    const { nanoid } = await import('nanoid');

    // Create a user-facing notification in the notifications table
    const title = decision === 'approved'
      ? 'Your appeal has been approved'
      : 'Your appeal has been denied';

    const message = decision === 'approved'
      ? 'Good news! Your appeal has been reviewed and approved. Any sanctions have been reversed.'
      : `Your appeal has been reviewed and denied.${notes ? ` Reason: ${notes}` : ''}`;

    await db.insert(notifications).values({
      id: nanoid(),
      userDid: userId,
      actorDid: 'system', // System notification
      reason: 'appeal_decision',
      reasonSubject: appealId,
      targetUri: `at://${userId}/appeal/${appealId}`,
      isRead: false,
    });

    // Also broadcast to admin WebSocket for real-time updates
    try {
      broadcastAdminActivity({
        adminDid: 'system',
        adminHandle: 'system',
        action: 'appeal_decision',
        targetType: 'appeal',
        targetId: appealId,
      });
    } catch (error) {
      console.error('[ModerationNotificationService] Failed to broadcast appeal decision:', error);
    }
  }

  /**
   * Get notifications for a moderator
   */
  async getNotifications(
    recipientId: string,
    options: {
      unreadOnly?: boolean;
      type?: NotificationType;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{
    notifications: NotificationResponse[];
    cursor?: string;
    unreadCount: number;
  }> {
    const limit = options.limit || 20;
    const conditions = [
      eq(moderationNotifications.recipientId, recipientId),
    ];

    // Also include notifications for all_moderators
    const allModConditions = [
      eq(moderationNotifications.recipientId, 'all_moderators'),
    ];

    if (options.unreadOnly) {
      conditions.push(isNull(moderationNotifications.readAt));
      allModConditions.push(isNull(moderationNotifications.readAt));
    }

    if (options.type) {
      conditions.push(eq(moderationNotifications.type, options.type));
      allModConditions.push(eq(moderationNotifications.type, options.type));
    }

    // Get notifications for this user and all_moderators
    const userNotifications = await db
      .select()
      .from(moderationNotifications)
      .where(and(...conditions))
      .orderBy(desc(moderationNotifications.createdAt))
      .limit(limit + 1);

    const allModNotifications = await db
      .select()
      .from(moderationNotifications)
      .where(and(...allModConditions))
      .orderBy(desc(moderationNotifications.createdAt))
      .limit(limit + 1);

    // Merge and sort
    const allNotifications = [...userNotifications, ...allModNotifications]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit + 1);

    const hasMore = allNotifications.length > limit;
    const returnedNotifications = hasMore
      ? allNotifications.slice(0, limit)
      : allNotifications;

    // Get unread count
    const unreadUserCount = await db
      .select({ count: db.$count(moderationNotifications.id) })
      .from(moderationNotifications)
      .where(
        and(
          eq(moderationNotifications.recipientId, recipientId),
          isNull(moderationNotifications.readAt)
        )
      );

    const unreadAllModCount = await db
      .select({ count: db.$count(moderationNotifications.id) })
      .from(moderationNotifications)
      .where(
        and(
          eq(moderationNotifications.recipientId, 'all_moderators'),
          isNull(moderationNotifications.readAt)
        )
      );

    const unreadCount =
      (unreadUserCount[0]?.count || 0) + (unreadAllModCount[0]?.count || 0);

    return {
      notifications: returnedNotifications.map((n) => ({
        id: n.id,
        type: n.type as NotificationType,
        priority: n.priority as NotificationPriority,
        title: n.title,
        message: n.message,
        contentType: n.contentType || undefined,
        contentId: n.contentId || undefined,
        contentUri: n.contentUri || undefined,
        metadata: (n.metadata as Record<string, unknown>) || {},
        readAt: n.readAt || undefined,
        createdAt: n.createdAt,
      })),
      cursor:
        hasMore && returnedNotifications.length > 0
          ? returnedNotifications[returnedNotifications.length - 1]!.id
          : undefined,
      unreadCount,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await db
      .update(moderationNotifications)
      .set({ readAt: new Date() })
      .where(eq(moderationNotifications.id, notificationId));
  }

  /**
   * Mark all notifications as read for a recipient
   */
  async markAllAsRead(recipientId: string): Promise<void> {
    await db
      .update(moderationNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(moderationNotifications.recipientId, recipientId),
          isNull(moderationNotifications.readAt)
        )
      );
  }

  /**
   * Dismiss notification
   */
  async dismissNotification(notificationId: string): Promise<void> {
    await db
      .update(moderationNotifications)
      .set({ dismissedAt: new Date() })
      .where(eq(moderationNotifications.id, notificationId));
  }

  /**
   * Record action taken on notification
   */
  async recordAction(
    notificationId: string,
    actionedBy: string,
    actionTaken: string
  ): Promise<void> {
    await db
      .update(moderationNotifications)
      .set({
        actionedAt: new Date(),
        actionedBy,
        actionTaken,
        readAt: new Date(), // Also mark as read
      })
      .where(eq(moderationNotifications.id, notificationId));
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    // Use returning() to get deleted rows and count them
    const deleted = await db
      .delete(moderationNotifications)
      .where(lt(moderationNotifications.expiresAt, now))
      .returning({ id: moderationNotifications.id });

    return deleted.length;
  }

  /**
   * Get notification statistics
   */
  async getStats(): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    const allNotifications = await db
      .select()
      .from(moderationNotifications);

    const stats = {
      total: allNotifications.length,
      unread: allNotifications.filter((n) => !n.readAt).length,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
    };

    for (const n of allNotifications) {
      stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
      stats.byPriority[n.priority] = (stats.byPriority[n.priority] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance
let moderationNotificationService: ModerationNotificationService | null = null;

export function getModerationNotificationService(): ModerationNotificationService {
  if (!moderationNotificationService) {
    moderationNotificationService = new ModerationNotificationService();
  }
  return moderationNotificationService;
}

export default ModerationNotificationService;
