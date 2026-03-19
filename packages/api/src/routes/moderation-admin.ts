/**
 * Moderation Admin Routes
 * Admin endpoints for content moderation
 */

import { Hono } from 'hono';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { getModerationService } from '../services/moderation/service.js';
import {
  getWorkflowEngine,
  type WorkflowTrigger,
  type WorkflowAction,
  type WorkflowCondition,
} from '../services/moderation/WorkflowEngine.js';
import { getWorkflowMetrics } from '../services/moderation/WorkflowEventHandlers.js';

export const moderationAdminRouter = new Hono();

// Apply admin auth to all routes
moderationAdminRouter.use('*', adminAuthMiddleware);

// ============================================
// Dashboard & Stats
// ============================================

/**
 * Get moderation statistics
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.getStats',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    try {
      const service = getModerationService();
      const stats = await service.getStats();
      return c.json(stats);
    } catch (error) {
      console.error('Failed to get moderation stats:', error);
      return c.json({
        overview: {
          totalModerated: 0,
          autoApproved: 0,
          autoRejected: 0,
          manuallyReviewed: 0,
          pendingReview: 0,
          appealed: 0,
        },
        queue: {
          pending: 0,
          escalated: 0,
          avgWaitTime: 0,
        },
        riskDistribution: {
          safe: 0,
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
        aiProviders: [],
      });
    }
  }
);

/**
 * Get moderation service health
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.getHealth',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    try {
      const service = getModerationService();
      const health = await service.getHealth();
      return c.json(health);
    } catch (error) {
      return c.json({
        status: 'unhealthy',
        components: {
          database: false,
          redis: false,
          aiProviders: { claude: false, openai: false, deepseek: false },
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================
// Review Queue
// ============================================

/**
 * Get moderation queue
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.getQueue',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const status = c.req.query('status') || 'pending';
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    try {
      const service = getModerationService();
      const result = await service.getQueue({ status, limit, offset });
      return c.json(result);
    } catch (error) {
      console.error('Failed to get moderation queue:', error);
      return c.json({ items: [], total: 0 });
    }
  }
);

/**
 * Approve content in queue
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.approveContent',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ itemId: string; notes?: string }>();
    const adminUser = c.get('adminUser');

    if (!body.itemId) {
      return c.json({ error: 'itemId is required' }, 400);
    }

    try {
      const service = getModerationService();
      const result = await service.approveContent(body.itemId, adminUser.userDid, body.notes);
      return c.json(result);
    } catch (error) {
      console.error('Failed to approve content:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to approve content' }, 500);
    }
  }
);

/**
 * Reject content in queue
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.rejectContent',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ itemId: string; notes?: string }>();
    const adminUser = c.get('adminUser');

    if (!body.itemId) {
      return c.json({ error: 'itemId is required' }, 400);
    }

    try {
      const service = getModerationService();
      const result = await service.rejectContent(body.itemId, adminUser.userDid, body.notes);
      return c.json(result);
    } catch (error) {
      console.error('Failed to reject content:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to reject content' }, 500);
    }
  }
);

/**
 * Escalate queue item
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.escalateItem',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ itemId: string; reason: string }>();

    if (!body.itemId || !body.reason) {
      return c.json({ error: 'itemId and reason are required' }, 400);
    }

    try {
      const service = getModerationService();
      await service.escalateItem(body.itemId, body.reason);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to escalate item:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to escalate item' }, 500);
    }
  }
);

/**
 * Assign queue item to moderator
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.assignToModerator',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ queueId: string; moderatorId: string }>();

    if (!body.queueId || !body.moderatorId) {
      return c.json({ error: 'queueId and moderatorId are required' }, 400);
    }

    try {
      const service = getModerationService();
      await service.assignToModerator(body.queueId, body.moderatorId);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to assign to moderator:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to assign' }, 500);
    }
  }
);

// ============================================
// Appeals
// ============================================

/**
 * List appeals
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.listAppeals',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const userId = c.req.query('userId');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    try {
      const service = getModerationService();
      const result = await service.getAppeals({ status, userId, limit, offset });
      return c.json(result);
    } catch (error) {
      console.error('Failed to list appeals:', error);
      return c.json({ appeals: [], total: 0 });
    }
  }
);

/**
 * Get appeal by ID with related sanction
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.getAppeal',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const appealId = c.req.query('appealId');

    if (!appealId) {
      return c.json({ error: 'appealId is required' }, 400);
    }

    try {
      const service = getModerationService();
      const result = await service.getAppealById(appealId);
      if (!result) {
        return c.json({ error: 'Appeal not found' }, 404);
      }
      return c.json(result);
    } catch (error) {
      console.error('Failed to get appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to get appeal' }, 500);
    }
  }
);

/**
 * Review an appeal (approve or deny)
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.reviewAppeal',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      appealId: string;
      decision: 'approved' | 'denied';
      reviewNotes?: string;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.appealId || !body.decision) {
      return c.json({ error: 'appealId and decision are required' }, 400);
    }

    if (!['approved', 'denied'].includes(body.decision)) {
      return c.json({ error: 'decision must be "approved" or "denied"' }, 400);
    }

    try {
      const service = getModerationService();
      const appeal = await service.reviewAppeal(
        body.appealId,
        body.decision,
        adminUser.userDid,
        body.reviewNotes
      );

      // Send notification to user about appeal decision
      const { getModerationNotificationService } = await import('../services/moderation/ModerationNotificationService.js');
      const notificationService = getModerationNotificationService();
      await notificationService.notifyAppealDecision(
        appeal.userId,
        appeal.id,
        body.decision,
        body.reviewNotes
      );

      return c.json({ success: true, appeal });
    } catch (error) {
      console.error('Failed to review appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to review appeal' }, 500);
    }
  }
);

/**
 * Assign an appeal to a moderator
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.assignAppeal',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{ appealId: string; assigneeId: string }>();

    if (!body.appealId || !body.assigneeId) {
      return c.json({ error: 'appealId and assigneeId are required' }, 400);
    }

    try {
      const service = getModerationService();
      await service.assignAppeal(body.appealId, body.assigneeId);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to assign appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to assign appeal' }, 500);
    }
  }
);

// ============================================
// Reports
// ============================================

/**
 * List reports
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.listReports',
  requirePermission(ADMIN_PERMISSIONS.REPORTS_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    try {
      const service = getModerationService();
      const result = await service.getReports({ status, limit, offset });
      return c.json(result);
    } catch (error) {
      console.error('Failed to list reports:', error);
      return c.json({ reports: [], total: 0 });
    }
  }
);

// ============================================
// Rules
// ============================================

/**
 * List moderation rules
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.listRules',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const enabledParam = c.req.query('enabled');
    const enabled = enabledParam ? enabledParam === 'true' : undefined;
    const limit = parseInt(c.req.query('limit') || '100', 10);

    try {
      const service = getModerationService();
      const result = await service.getRules({ enabled, limit });
      return c.json(result);
    } catch (error) {
      console.error('Failed to list rules:', error);
      return c.json({ rules: [] });
    }
  }
);

/**
 * Create moderation rule
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.createRule',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      name: string;
      description?: string;
      appliesTo?: string[];
      sourceServices?: string[];
      conditions?: Record<string, unknown>;
      thresholdScore?: number;
      action: string;
      enabled?: boolean;
      priority?: number;
    }>();
    const adminUser = c.get('adminUser');

    if (!body.name || !body.action) {
      return c.json({ error: 'name and action are required' }, 400);
    }

    try {
      const service = getModerationService();
      const rule = await service.createRule({
        name: body.name,
        description: body.description,
        appliesTo: body.appliesTo || [],
        sourceServices: body.sourceServices || [],
        conditions: body.conditions || {},
        thresholdScore: body.thresholdScore,
        action: body.action,
        enabled: body.enabled ?? true,
        priority: body.priority ?? 0,
        createdBy: adminUser.userDid,
      });
      return c.json(rule);
    } catch (error) {
      console.error('Failed to create rule:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create rule' }, 500);
    }
  }
);

/**
 * Update moderation rule
 */
moderationAdminRouter.put(
  '/io.exprsn.admin.moderation.updateRule',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      ruleId: string;
      updates: Partial<{
        name: string;
        description: string;
        appliesTo: string[];
        sourceServices: string[];
        conditions: Record<string, unknown>;
        thresholdScore: number;
        action: string;
        enabled: boolean;
        priority: number;
      }>;
    }>();

    if (!body.ruleId) {
      return c.json({ error: 'ruleId is required' }, 400);
    }

    try {
      const service = getModerationService();
      const rule = await service.updateRule(body.ruleId, body.updates);
      return c.json(rule);
    } catch (error) {
      console.error('Failed to update rule:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to update rule' }, 500);
    }
  }
);

/**
 * Delete moderation rule
 */
moderationAdminRouter.delete(
  '/io.exprsn.admin.moderation.deleteRule',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const ruleId = c.req.query('ruleId');

    if (!ruleId) {
      return c.json({ error: 'ruleId is required' }, 400);
    }

    try {
      const service = getModerationService();
      await service.deleteRule(ruleId);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to delete rule:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to delete rule' }, 500);
    }
  }
);

// ============================================
// User Actions
// ============================================

/**
 * Warn user
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.warnUser',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{ userId: string; reason: string; expiresIn?: number }>();
    const adminUser = c.get('adminUser');

    if (!body.userId || !body.reason) {
      return c.json({ error: 'userId and reason are required' }, 400);
    }

    try {
      const service = getModerationService();
      const id = await service.warnUser(body.userId, body.reason, adminUser.userDid, body.expiresIn);
      return c.json({ id });
    } catch (error) {
      console.error('Failed to warn user:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to warn user' }, 500);
    }
  }
);

/**
 * Suspend user
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.suspendUser',
  requirePermission(ADMIN_PERMISSIONS.USERS_SANCTION),
  async (c) => {
    const body = await c.req.json<{ userId: string; duration: number; reason: string }>();
    const adminUser = c.get('adminUser');

    if (!body.userId || !body.duration || !body.reason) {
      return c.json({ error: 'userId, duration, and reason are required' }, 400);
    }

    try {
      const service = getModerationService();
      const id = await service.suspendUser(body.userId, body.duration, body.reason, adminUser.userDid);
      return c.json({ id });
    } catch (error) {
      console.error('Failed to suspend user:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to suspend user' }, 500);
    }
  }
);

/**
 * Ban user
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.banUser',
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const body = await c.req.json<{ userId: string; reason: string; permanent?: boolean }>();
    const adminUser = c.get('adminUser');

    if (!body.userId || !body.reason) {
      return c.json({ error: 'userId and reason are required' }, 400);
    }

    try {
      const service = getModerationService();
      const id = await service.banUser(body.userId, body.reason, adminUser.userDid, body.permanent);
      return c.json({ id });
    } catch (error) {
      console.error('Failed to ban user:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to ban user' }, 500);
    }
  }
);

// ============================================
// AI Agents
// ============================================

/**
 * List AI agents
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.listAgents',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    try {
      const service = getModerationService();
      const result = await service.getAgents();
      return c.json(result);
    } catch (error) {
      console.error('Failed to list agents:', error);
      return c.json({ agents: [] });
    }
  }
);

// ============================================
// Content Moderation API (for services)
// ============================================

/**
 * Moderate content (callable by other services)
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.moderateContent',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      contentType: string;
      contentId: string;
      sourceService: string;
      userId: string;
      contentText?: string;
      contentUrl?: string;
      contentMetadata?: Record<string, unknown>;
      aiProvider?: 'claude' | 'openai' | 'deepseek' | 'local';
    }>();

    if (!body.contentType || !body.contentId || !body.sourceService || !body.userId) {
      return c.json({ error: 'contentType, contentId, sourceService, and userId are required' }, 400);
    }

    try {
      const service = getModerationService();
      const result = await service.moderateContent({
        contentType: body.contentType as 'text' | 'image' | 'video' | 'audio' | 'post' | 'comment' | 'message' | 'profile',
        contentId: body.contentId,
        sourceService: body.sourceService as 'timeline' | 'spark' | 'gallery' | 'live' | 'filevault',
        userId: body.userId,
        contentText: body.contentText,
        contentUrl: body.contentUrl,
        contentMetadata: body.contentMetadata,
        aiProvider: body.aiProvider,
      });
      return c.json(result);
    } catch (error) {
      console.error('Failed to moderate content:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to moderate content' }, 500);
    }
  }
);

/**
 * Get content moderation status
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.getContentStatus',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const sourceService = c.req.query('sourceService');
    const contentType = c.req.query('contentType');
    const contentId = c.req.query('contentId');

    if (!sourceService || !contentType || !contentId) {
      return c.json({ error: 'sourceService, contentType, and contentId are required' }, 400);
    }

    try {
      const service = getModerationService();
      const result = await service.getModerationStatus(sourceService, contentType, contentId);
      if (!result) {
        return c.json({ error: 'Content not found' }, 404);
      }
      return c.json(result);
    } catch (error) {
      console.error('Failed to get content status:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to get content status' }, 500);
    }
  }
);

// ============================================
// Workflow Management
// ============================================

const VALID_TRIGGERS: WorkflowTrigger[] = [
  'content_submitted',
  'report_received',
  'ai_review_complete',
  'manual_review',
  'appeal_submitted',
  'user_action_expired',
  'threshold_exceeded',
];

const VALID_ACTIONS: WorkflowAction[] = [
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

/**
 * Get all workflow rules
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.workflows.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    try {
      const engine = getWorkflowEngine();
      const rules = engine.getRules();

      return c.json({
        rules: rules.map(rule => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          trigger: rule.trigger,
          conditions: rule.conditions,
          actions: rule.actions,
          priority: rule.priority,
          enabled: rule.enabled,
          cooldownMs: rule.cooldownMs,
          maxExecutionsPerHour: rule.maxExecutionsPerHour,
        })),
      });
    } catch (error) {
      console.error('Failed to list workflow rules:', error);
      return c.json({ error: 'Failed to list workflow rules' }, 500);
    }
  }
);

/**
 * Get a single workflow rule
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.workflows.get',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const ruleId = c.req.query('id');

    if (!ruleId) {
      return c.json({ error: 'Rule ID is required' }, 400);
    }

    try {
      const engine = getWorkflowEngine();
      const rule = engine.getRule(ruleId);

      if (!rule) {
        return c.json({ error: 'Rule not found' }, 404);
      }

      return c.json({ rule });
    } catch (error) {
      console.error('Failed to get workflow rule:', error);
      return c.json({ error: 'Failed to get workflow rule' }, 500);
    }
  }
);

/**
 * Create a new workflow rule
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.workflows.create',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    try {
      const body = await c.req.json<{
        name: string;
        description?: string;
        trigger: WorkflowTrigger;
        conditions: WorkflowCondition[];
        actions: Array<{ type: WorkflowAction; params?: Record<string, unknown> }>;
        priority?: number;
        enabled?: boolean;
        cooldownMs?: number;
        maxExecutionsPerHour?: number;
      }>();

      // Validate required fields
      if (!body.name || body.name.length < 1) {
        return c.json({ error: 'Name is required' }, 400);
      }

      if (!body.trigger || !VALID_TRIGGERS.includes(body.trigger)) {
        return c.json({ error: 'Invalid trigger type', validTriggers: VALID_TRIGGERS }, 400);
      }

      if (!Array.isArray(body.actions) || body.actions.length === 0) {
        return c.json({ error: 'At least one action is required' }, 400);
      }

      // Validate actions
      for (const action of body.actions) {
        if (!VALID_ACTIONS.includes(action.type)) {
          return c.json({ error: `Invalid action type: ${action.type}`, validActions: VALID_ACTIONS }, 400);
        }
      }

      const engine = getWorkflowEngine();
      const ruleId = await engine.addRule({
        name: body.name,
        description: body.description,
        trigger: body.trigger,
        conditions: body.conditions || [],
        actions: body.actions,
        priority: body.priority || 0,
        enabled: body.enabled ?? true,
        cooldownMs: body.cooldownMs,
        maxExecutionsPerHour: body.maxExecutionsPerHour,
      });

      const rule = engine.getRule(ruleId);

      return c.json({ rule }, 201);
    } catch (error) {
      console.error('Failed to create workflow rule:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create workflow rule' }, 500);
    }
  }
);

/**
 * Update a workflow rule
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.workflows.update',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    try {
      const body = await c.req.json<{
        id: string;
        name?: string;
        description?: string;
        trigger?: WorkflowTrigger;
        conditions?: WorkflowCondition[];
        actions?: Array<{ type: WorkflowAction; params?: Record<string, unknown> }>;
        priority?: number;
        enabled?: boolean;
        cooldownMs?: number;
        maxExecutionsPerHour?: number;
      }>();

      if (!body.id) {
        return c.json({ error: 'Rule ID is required' }, 400);
      }

      // Validate trigger if provided
      if (body.trigger && !VALID_TRIGGERS.includes(body.trigger)) {
        return c.json({ error: 'Invalid trigger type', validTriggers: VALID_TRIGGERS }, 400);
      }

      // Validate actions if provided
      if (body.actions) {
        for (const action of body.actions) {
          if (!VALID_ACTIONS.includes(action.type)) {
            return c.json({ error: `Invalid action type: ${action.type}`, validActions: VALID_ACTIONS }, 400);
          }
        }
      }

      const engine = getWorkflowEngine();

      await engine.updateRule(body.id, {
        name: body.name,
        description: body.description,
        trigger: body.trigger,
        conditions: body.conditions,
        actions: body.actions,
        priority: body.priority,
        enabled: body.enabled,
        cooldownMs: body.cooldownMs,
        maxExecutionsPerHour: body.maxExecutionsPerHour,
      });

      const rule = engine.getRule(body.id);

      return c.json({ rule });
    } catch (error) {
      console.error('Failed to update workflow rule:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to update workflow rule' }, 500);
    }
  }
);

/**
 * Delete a workflow rule
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.workflows.delete',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    try {
      const body = await c.req.json<{ id: string }>();

      if (!body.id) {
        return c.json({ error: 'Rule ID is required' }, 400);
      }

      const engine = getWorkflowEngine();
      await engine.deleteRule(body.id);

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to delete workflow rule:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to delete workflow rule' }, 500);
    }
  }
);

/**
 * Toggle workflow rule enabled/disabled
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.workflows.toggle',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    try {
      const body = await c.req.json<{ id: string; enabled: boolean }>();

      if (!body.id) {
        return c.json({ error: 'Rule ID is required' }, 400);
      }

      if (typeof body.enabled !== 'boolean') {
        return c.json({ error: 'enabled must be a boolean' }, 400);
      }

      const engine = getWorkflowEngine();
      await engine.updateRule(body.id, { enabled: body.enabled });

      const rule = engine.getRule(body.id);

      return c.json({ rule });
    } catch (error) {
      console.error('Failed to toggle workflow rule:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to toggle workflow rule' }, 500);
    }
  }
);

/**
 * Get workflow metrics
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.workflows.metrics',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    try {
      const metrics = await getWorkflowMetrics();
      const engine = getWorkflowEngine();
      const rules = engine.getRules();

      return c.json({
        actionMetrics: metrics,
        ruleCount: rules.length,
        enabledRuleCount: rules.filter(r => r.enabled).length,
        triggerCounts: rules.reduce((acc, rule) => {
          acc[rule.trigger] = (acc[rule.trigger] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      });
    } catch (error) {
      console.error('Failed to get workflow metrics:', error);
      return c.json({ error: 'Failed to get workflow metrics' }, 500);
    }
  }
);

/**
 * Reload workflow rules from database
 */
moderationAdminRouter.post(
  '/io.exprsn.admin.moderation.workflows.reload',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    try {
      const engine = getWorkflowEngine();
      await engine.loadRules();

      return c.json({
        success: true,
        ruleCount: engine.getRules().length,
      });
    } catch (error) {
      console.error('Failed to reload workflow rules:', error);
      return c.json({ error: 'Failed to reload workflow rules' }, 500);
    }
  }
);

/**
 * Get available workflow triggers and actions
 */
moderationAdminRouter.get(
  '/io.exprsn.admin.moderation.workflows.schema',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    return c.json({
      triggers: VALID_TRIGGERS.map(trigger => ({
        id: trigger,
        name: trigger.replace(/_/g, ' '),
        description: getTriggerDescription(trigger),
      })),
      actions: VALID_ACTIONS.map(action => ({
        id: action,
        name: action.replace(/_/g, ' '),
        description: getActionDescription(action),
        params: getActionParams(action),
      })),
      operators: [
        { id: 'eq', name: 'equals', description: 'Value equals' },
        { id: 'ne', name: 'not equals', description: 'Value does not equal' },
        { id: 'gt', name: 'greater than', description: 'Value is greater than' },
        { id: 'gte', name: 'greater or equal', description: 'Value is greater than or equal' },
        { id: 'lt', name: 'less than', description: 'Value is less than' },
        { id: 'lte', name: 'less or equal', description: 'Value is less than or equal' },
        { id: 'contains', name: 'contains', description: 'String contains substring' },
        { id: 'in', name: 'in', description: 'Value is in array' },
        { id: 'not_in', name: 'not in', description: 'Value is not in array' },
      ],
      contextFields: [
        { field: 'riskScore', type: 'number', description: 'AI risk score (0-1)' },
        { field: 'riskLevel', type: 'string', description: 'Risk level (safe, low, medium, high, critical)' },
        { field: 'contentType', type: 'string', description: 'Content type (video, comment, etc.)' },
        { field: 'reportCount', type: 'number', description: 'Number of reports for this content' },
        { field: 'userPriorOffenses', type: 'number', description: 'Number of prior user violations' },
        { field: 'aiScores.toxicity', type: 'number', description: 'AI toxicity score' },
        { field: 'aiScores.nsfw', type: 'number', description: 'AI NSFW score' },
        { field: 'aiScores.spam', type: 'number', description: 'AI spam score' },
        { field: 'aiScores.violence', type: 'number', description: 'AI violence score' },
        { field: 'aiScores.hatespeech', type: 'number', description: 'AI hate speech score' },
      ],
    });
  }
);

function getTriggerDescription(trigger: WorkflowTrigger): string {
  switch (trigger) {
    case 'content_submitted': return 'Triggered when new content is submitted for moderation';
    case 'report_received': return 'Triggered when a user reports content';
    case 'ai_review_complete': return 'Triggered when AI finishes analyzing content';
    case 'manual_review': return 'Triggered when a moderator reviews content';
    case 'appeal_submitted': return 'Triggered when a user submits an appeal';
    case 'user_action_expired': return 'Triggered when a user sanction expires';
    case 'threshold_exceeded': return 'Triggered when content exceeds a threshold (e.g., report count)';
    default: return '';
  }
}

function getActionDescription(action: WorkflowAction): string {
  switch (action) {
    case 'auto_approve': return 'Automatically approve the content';
    case 'auto_reject': return 'Automatically reject the content';
    case 'escalate': return 'Escalate to higher priority queue';
    case 'assign_moderator': return 'Assign to a specific moderator or use load balancing';
    case 'request_ai_review': return 'Request AI analysis of the content';
    case 'notify_user': return 'Send notification to the content author';
    case 'notify_admin': return 'Send notification to admins';
    case 'apply_warning': return 'Issue a warning to the user';
    case 'apply_mute': return 'Temporarily mute the user';
    case 'apply_suspension': return 'Temporarily suspend the user';
    case 'apply_ban': return 'Permanently ban the user';
    case 'send_webhook': return 'Send webhook to external URL';
    default: return '';
  }
}

function getActionParams(action: WorkflowAction): Array<{ name: string; type: string; required: boolean; description: string }> {
  switch (action) {
    case 'auto_reject':
      return [{ name: 'reason', type: 'string', required: false, description: 'Rejection reason' }];
    case 'escalate':
      return [
        { name: 'priority', type: 'number', required: false, description: 'New priority level (default: 10)' },
        { name: 'reason', type: 'string', required: false, description: 'Escalation reason' },
      ];
    case 'assign_moderator':
      return [
        { name: 'moderatorId', type: 'string', required: false, description: 'Specific moderator ID' },
        { name: 'loadBalanced', type: 'boolean', required: false, description: 'Use load balancing to find least-loaded moderator' },
        { name: 'role', type: 'string', required: false, description: 'Only assign to moderators with this role' },
      ];
    case 'notify_user':
      return [
        { name: 'message', type: 'string', required: false, description: 'Notification message' },
        { name: 'type', type: 'string', required: false, description: 'Notification type' },
      ];
    case 'notify_admin':
      return [{ name: 'message', type: 'string', required: false, description: 'Alert message' }];
    case 'apply_warning':
      return [{ name: 'reason', type: 'string', required: false, description: 'Warning reason' }];
    case 'apply_mute':
      return [
        { name: 'durationHours', type: 'number', required: false, description: 'Mute duration in hours (default: 24)' },
        { name: 'reason', type: 'string', required: false, description: 'Mute reason' },
      ];
    case 'apply_suspension':
      return [
        { name: 'durationDays', type: 'number', required: false, description: 'Suspension duration in days (default: 7)' },
        { name: 'reason', type: 'string', required: false, description: 'Suspension reason' },
      ];
    case 'apply_ban':
      return [{ name: 'reason', type: 'string', required: false, description: 'Ban reason' }];
    case 'send_webhook':
      return [{ name: 'url', type: 'string', required: true, description: 'Webhook URL' }];
    default:
      return [];
  }
}
