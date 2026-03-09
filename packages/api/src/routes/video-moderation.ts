/**
 * Video Moderation Routes
 * Handles content moderation gate, approval, and trust management
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { getContentGateService } from '../services/moderation/ContentGateService.js';
import { getModerationNotificationService } from '../services/moderation/ModerationNotificationService.js';

export const videoModerationRouter = new Hono();

// =============================================================================
// User-Facing Moderation Status
// =============================================================================

/**
 * Get moderation status for a video
 * GET /xrpc/io.exprsn.moderation.getVideoStatus
 */
videoModerationRouter.get(
  '/io.exprsn.moderation.getVideoStatus',
  optionalAuthMiddleware,
  async (c) => {
    const videoUri = c.req.query('videoUri');

    if (!videoUri) {
      throw new HTTPException(400, { message: 'videoUri query parameter is required' });
    }

    const gateService = getContentGateService();
    const status = await gateService.getVideoModerationStatus(videoUri);

    if (!status) {
      throw new HTTPException(404, { message: 'Video not found' });
    }

    return c.json(status);
  }
);

// =============================================================================
// Moderator Actions
// =============================================================================

/**
 * Approve video from moderation queue
 * POST /xrpc/io.exprsn.moderation.approveVideo
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.approveVideo',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      videoUri: string;
      notes?: string;
    }>();

    if (!body.videoUri) {
      throw new HTTPException(400, { message: 'videoUri is required' });
    }

    const gateService = getContentGateService();
    const result = await gateService.approveVideo(body.videoUri, adminUser.id, body.notes);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({ success: true });
  }
);

/**
 * Reject video from moderation queue
 * POST /xrpc/io.exprsn.moderation.rejectVideo
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.rejectVideo',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      videoUri: string;
      reason: string;
      notes?: string;
    }>();

    if (!body.videoUri || !body.reason) {
      throw new HTTPException(400, { message: 'videoUri and reason are required' });
    }

    const gateService = getContentGateService();
    const result = await gateService.rejectVideo(
      body.videoUri,
      adminUser.id,
      body.reason,
      body.notes
    );

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({ success: true });
  }
);

/**
 * Escalate video for higher-level review
 * POST /xrpc/io.exprsn.moderation.escalateVideo
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.escalateVideo',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      videoUri: string;
      reason: string;
    }>();

    if (!body.videoUri || !body.reason) {
      throw new HTTPException(400, { message: 'videoUri and reason are required' });
    }

    const gateService = getContentGateService();
    const result = await gateService.escalateVideo(body.videoUri, adminUser.id, body.reason);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({ success: true });
  }
);

/**
 * Get moderation queue
 * GET /xrpc/io.exprsn.moderation.getQueue
 */
videoModerationRouter.get(
  '/io.exprsn.moderation.getQueue',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const riskLevel = c.req.query('riskLevel');
    const assignedTo = c.req.query('assignedTo');
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
    const cursor = c.req.query('cursor');

    const gateService = getContentGateService();
    const result = await gateService.getModerationQueue({
      status,
      riskLevel,
      assignedTo,
      limit,
      cursor,
    });

    return c.json(result);
  }
);

/**
 * Assign queue item to moderator
 * POST /xrpc/io.exprsn.moderation.assignToModerator
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.assignToModerator',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      queueId: string;
      moderatorId?: string; // If not provided, assign to self
    }>();

    if (!body.queueId) {
      throw new HTTPException(400, { message: 'queueId is required' });
    }

    const moderatorId = body.moderatorId || adminUser.id;

    const gateService = getContentGateService();
    const result = await gateService.assignToModerator(body.queueId, moderatorId);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({ success: true });
  }
);

// =============================================================================
// Trust Management
// =============================================================================

/**
 * Grant trust to a user (auto-approve their uploads)
 * POST /xrpc/io.exprsn.admin.users.grantTrust
 */
videoModerationRouter.post(
  '/io.exprsn.admin.users.grantTrust',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      userDid: string;
      trustLevel?: 'basic' | 'verified' | 'creator' | 'partner';
      autoApprove?: boolean;
      skipAiReview?: boolean;
      extendedUploadLimits?: boolean;
      reason?: string;
    }>();

    if (!body.userDid) {
      throw new HTTPException(400, { message: 'userDid is required' });
    }

    const gateService = getContentGateService();
    const result = await gateService.grantTrust(body.userDid, adminUser.id, {
      trustLevel: body.trustLevel,
      autoApprove: body.autoApprove,
      skipAiReview: body.skipAiReview,
      extendedUploadLimits: body.extendedUploadLimits,
      reason: body.reason,
    });

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({ success: true });
  }
);

/**
 * Revoke trust from a user
 * POST /xrpc/io.exprsn.admin.users.revokeTrust
 */
videoModerationRouter.post(
  '/io.exprsn.admin.users.revokeTrust',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.USERS_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      userDid: string;
      reason: string;
    }>();

    if (!body.userDid || !body.reason) {
      throw new HTTPException(400, { message: 'userDid and reason are required' });
    }

    const gateService = getContentGateService();
    const result = await gateService.revokeTrust(body.userDid, adminUser.id, body.reason);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({ success: true });
  }
);

// =============================================================================
// Moderation Notifications
// =============================================================================

/**
 * Get moderation notifications for current admin
 * GET /xrpc/io.exprsn.moderation.getNotifications
 */
videoModerationRouter.get(
  '/io.exprsn.moderation.getNotifications',
  adminAuthMiddleware,
  async (c) => {
    const adminUser = c.get('adminUser');
    const unreadOnly = c.req.query('unreadOnly') === 'true';
    const type = c.req.query('type') as 'new_content' | 'escalation' | 'high_risk' | 'appeal' | 'queue_full' | undefined;
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
    const cursor = c.req.query('cursor');

    const notificationService = getModerationNotificationService();
    const result = await notificationService.getNotifications(adminUser.id, {
      unreadOnly,
      type,
      limit,
      cursor,
    });

    return c.json(result);
  }
);

/**
 * Mark notification as read
 * POST /xrpc/io.exprsn.moderation.markNotificationRead
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.markNotificationRead',
  adminAuthMiddleware,
  async (c) => {
    const body = await c.req.json<{
      notificationId: string;
    }>();

    if (!body.notificationId) {
      throw new HTTPException(400, { message: 'notificationId is required' });
    }

    const notificationService = getModerationNotificationService();
    await notificationService.markAsRead(body.notificationId);

    return c.json({ success: true });
  }
);

/**
 * Mark all notifications as read
 * POST /xrpc/io.exprsn.moderation.markAllNotificationsRead
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.markAllNotificationsRead',
  adminAuthMiddleware,
  async (c) => {
    const adminUser = c.get('adminUser');

    const notificationService = getModerationNotificationService();
    await notificationService.markAllAsRead(adminUser.id);

    return c.json({ success: true });
  }
);

/**
 * Dismiss notification
 * POST /xrpc/io.exprsn.moderation.dismissNotification
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.dismissNotification',
  adminAuthMiddleware,
  async (c) => {
    const body = await c.req.json<{
      notificationId: string;
    }>();

    if (!body.notificationId) {
      throw new HTTPException(400, { message: 'notificationId is required' });
    }

    const notificationService = getModerationNotificationService();
    await notificationService.dismissNotification(body.notificationId);

    return c.json({ success: true });
  }
);

/**
 * Record action taken on notification
 * POST /xrpc/io.exprsn.moderation.recordNotificationAction
 */
videoModerationRouter.post(
  '/io.exprsn.moderation.recordNotificationAction',
  adminAuthMiddleware,
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      notificationId: string;
      actionTaken: string;
    }>();

    if (!body.notificationId || !body.actionTaken) {
      throw new HTTPException(400, { message: 'notificationId and actionTaken are required' });
    }

    const notificationService = getModerationNotificationService();
    await notificationService.recordAction(body.notificationId, adminUser.id, body.actionTaken);

    return c.json({ success: true });
  }
);

/**
 * Get notification statistics
 * GET /xrpc/io.exprsn.moderation.getNotificationStats
 */
videoModerationRouter.get(
  '/io.exprsn.moderation.getNotificationStats',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const notificationService = getModerationNotificationService();
    const stats = await notificationService.getStats();

    return c.json(stats);
  }
);

export default videoModerationRouter;
