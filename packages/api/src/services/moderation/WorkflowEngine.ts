/**
 * Moderation Workflow Engine
 * Automates moderation actions based on rules and triggers
 */

import { EventEmitter } from 'events';
import { db } from '../../db/index.js';
import {
  moderationItems,
  moderationReviewQueue,
  moderationRules,
  moderationReports,
  moderationUserActions,
  modActionsLog,
} from '../../db/schema.js';
import { eq, and, gte, sql, count, desc, inArray } from 'drizzle-orm';
import { redis } from '../../cache/redis.js';

/**
 * Workflow trigger types
 */
export type WorkflowTrigger =
  | 'content_submitted'
  | 'report_received'
  | 'ai_review_complete'
  | 'manual_review'
  | 'appeal_submitted'
  | 'user_action_expired'
  | 'threshold_exceeded';

/**
 * Workflow action types
 */
export type WorkflowAction =
  | 'auto_approve'
  | 'auto_reject'
  | 'escalate'
  | 'assign_moderator'
  | 'request_ai_review'
  | 'notify_user'
  | 'notify_admin'
  | 'apply_warning'
  | 'apply_mute'
  | 'apply_suspension'
  | 'apply_ban'
  | 'send_webhook';

/**
 * Workflow condition
 */
export interface WorkflowCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'not_in';
  value: unknown;
}

/**
 * Workflow rule definition
 */
export interface WorkflowRule {
  id: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: Array<{
    type: WorkflowAction;
    params?: Record<string, unknown>;
  }>;
  priority: number;
  enabled: boolean;
  cooldownMs?: number;
  maxExecutionsPerHour?: number;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  trigger: WorkflowTrigger;
  contentId?: string;
  contentType?: string;
  authorDid?: string;
  reportId?: string;
  reporterDid?: string;
  moderatorDid?: string;
  riskScore?: number;
  riskLevel?: string;
  aiScores?: {
    toxicity?: number;
    nsfw?: number;
    spam?: number;
    violence?: number;
    hatespeech?: number;
  };
  reportCount?: number;
  userPriorOffenses?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  actionsExecuted: WorkflowAction[];
  errors: string[];
  duration: number;
}

/**
 * Moderation Workflow Engine
 */
export class WorkflowEngine extends EventEmitter {
  private rules: Map<string, WorkflowRule> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private executionCounts: Map<string, number> = new Map();

  constructor() {
    super();
    this.loadRules();
  }

  /**
   * Load rules from database
   */
  async loadRules(): Promise<void> {
    try {
      const dbRules = await db.query.moderationRules.findMany({
        where: eq(moderationRules.enabled, true),
        orderBy: [desc(moderationRules.priority)],
      });

      this.rules.clear();
      for (const rule of dbRules) {
        const workflowRule: WorkflowRule = {
          id: rule.id,
          name: rule.name,
          description: rule.description || undefined,
          trigger: (rule.conditions as any)?.trigger || 'content_submitted',
          conditions: (rule.conditions as any)?.conditions || [],
          actions: (rule.action as any)?.actions || [],
          priority: rule.priority || 0,
          enabled: rule.enabled ?? false,
          cooldownMs: (rule.conditions as any)?.cooldownMs,
          maxExecutionsPerHour: (rule.conditions as any)?.maxExecutionsPerHour,
        };
        this.rules.set(rule.id, workflowRule);
      }

      console.log(`[WorkflowEngine] Loaded ${this.rules.size} workflow rules`);
    } catch (error) {
      console.error('[WorkflowEngine] Failed to load rules:', error);
    }
  }

  /**
   * Execute workflows for a given trigger
   */
  async execute(context: WorkflowContext): Promise<WorkflowExecutionResult[]> {
    const results: WorkflowExecutionResult[] = [];
    const applicableRules = this.getApplicableRules(context.trigger);

    for (const rule of applicableRules) {
      const startTime = Date.now();
      const result: WorkflowExecutionResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        actionsExecuted: [],
        errors: [],
        duration: 0,
      };

      try {
        // Check cooldown
        if (!this.checkCooldown(rule)) {
          continue;
        }

        // Check rate limit
        if (!this.checkRateLimit(rule)) {
          continue;
        }

        // Evaluate conditions
        if (!this.evaluateConditions(rule.conditions, context)) {
          continue;
        }

        result.triggered = true;

        // Execute actions
        for (const action of rule.actions) {
          try {
            await this.executeAction(action.type, action.params || {}, context);
            result.actionsExecuted.push(action.type);
          } catch (error) {
            result.errors.push(`Action ${action.type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Update cooldown and rate limit
        this.updateCooldown(rule);
        this.incrementExecutionCount(rule);

        // Log execution
        await this.logExecution(rule, context, result);

      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }

      result.duration = Date.now() - startTime;
      results.push(result);
    }

    return results;
  }

  /**
   * Get rules applicable to a trigger
   */
  private getApplicableRules(trigger: WorkflowTrigger): WorkflowRule[] {
    return Array.from(this.rules.values())
      .filter(rule => rule.enabled && rule.trigger === trigger)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if rule is in cooldown
   */
  private checkCooldown(rule: WorkflowRule): boolean {
    if (!rule.cooldownMs) return true;

    const lastExecution = this.cooldowns.get(rule.id);
    if (!lastExecution) return true;

    return Date.now() - lastExecution > rule.cooldownMs;
  }

  /**
   * Check rate limit for rule
   */
  private checkRateLimit(rule: WorkflowRule): boolean {
    if (!rule.maxExecutionsPerHour) return true;

    const count = this.executionCounts.get(rule.id) || 0;
    return count < rule.maxExecutionsPerHour;
  }

  /**
   * Evaluate workflow conditions
   */
  private evaluateConditions(conditions: WorkflowCondition[], context: WorkflowContext): boolean {
    if (conditions.length === 0) return true;

    return conditions.every(condition => {
      const value = this.getContextValue(condition.field, context);
      return this.evaluateCondition(condition, value);
    });
  }

  /**
   * Get value from context by field path
   */
  private getContextValue(field: string, context: WorkflowContext): unknown {
    const parts = field.split('.');
    let value: unknown = context;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: WorkflowCondition, value: unknown): boolean {
    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'ne':
        return value !== condition.value;
      case 'gt':
        return typeof value === 'number' && value > (condition.value as number);
      case 'gte':
        return typeof value === 'number' && value >= (condition.value as number);
      case 'lt':
        return typeof value === 'number' && value < (condition.value as number);
      case 'lte':
        return typeof value === 'number' && value <= (condition.value as number);
      case 'contains':
        return typeof value === 'string' && value.includes(condition.value as string);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      default:
        return false;
    }
  }

  /**
   * Execute a workflow action
   */
  private async executeAction(
    action: WorkflowAction,
    params: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<void> {
    switch (action) {
      case 'auto_approve':
        await this.actionAutoApprove(context);
        break;
      case 'auto_reject':
        await this.actionAutoReject(context, params);
        break;
      case 'escalate':
        await this.actionEscalate(context, params);
        break;
      case 'assign_moderator':
        await this.actionAssignModerator(context, params);
        break;
      case 'request_ai_review':
        await this.actionRequestAIReview(context);
        break;
      case 'notify_user':
        await this.actionNotifyUser(context, params);
        break;
      case 'notify_admin':
        await this.actionNotifyAdmin(context, params);
        break;
      case 'apply_warning':
        await this.actionApplyWarning(context, params);
        break;
      case 'apply_mute':
        await this.actionApplyMute(context, params);
        break;
      case 'apply_suspension':
        await this.actionApplySuspension(context, params);
        break;
      case 'apply_ban':
        await this.actionApplyBan(context, params);
        break;
      case 'send_webhook':
        await this.actionSendWebhook(context, params);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    this.emit('action-executed', { action, params, context });
  }

  /**
   * Auto-approve content
   */
  private async actionAutoApprove(context: WorkflowContext): Promise<void> {
    if (!context.contentId) return;

    await db
      .update(moderationItems)
      .set({
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: 'system:workflow',
      })
      .where(eq(moderationItems.id, context.contentId));

    await db
      .update(moderationReviewQueue)
      .set({ status: 'completed' })
      .where(eq(moderationReviewQueue.moderationItemId, context.contentId));
  }

  /**
   * Auto-reject content
   */
  private async actionAutoReject(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.contentId) return;

    await db
      .update(moderationItems)
      .set({
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: 'system:workflow',
        reviewNotes: params.reason as string || 'Automatically rejected by workflow',
      })
      .where(eq(moderationItems.id, context.contentId));

    await db
      .update(moderationReviewQueue)
      .set({ status: 'completed' })
      .where(eq(moderationReviewQueue.moderationItemId, context.contentId));
  }

  /**
   * Escalate to higher priority
   */
  private async actionEscalate(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.contentId) return;

    const priority = (params.priority as number) || 10;
    const reason = (params.reason as string) || 'Escalated by workflow';

    await db
      .update(moderationReviewQueue)
      .set({
        priority,
        escalated: true,
        escalatedReason: reason,
      })
      .where(eq(moderationReviewQueue.moderationItemId, context.contentId));
  }

  /**
   * Assign to specific moderator
   */
  private async actionAssignModerator(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.contentId) return;

    const moderatorId = params.moderatorId as string;
    if (!moderatorId) return;

    await db
      .update(moderationReviewQueue)
      .set({
        assignedTo: moderatorId,
        assignedAt: new Date(),
      })
      .where(eq(moderationReviewQueue.moderationItemId, context.contentId));
  }

  /**
   * Request AI review
   */
  private async actionRequestAIReview(context: WorkflowContext): Promise<void> {
    // Emit event for AI moderation service to pick up
    this.emit('ai-review-requested', {
      contentId: context.contentId,
      contentType: context.contentType,
      authorDid: context.authorDid,
    });
  }

  /**
   * Notify user
   */
  private async actionNotifyUser(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.authorDid) return;

    const message = params.message as string || 'Your content is under review';
    const notificationType = params.type as string || 'moderation';

    // Emit notification event
    this.emit('user-notification', {
      userDid: context.authorDid,
      type: notificationType,
      message,
      contentId: context.contentId,
    });
  }

  /**
   * Notify admin
   */
  private async actionNotifyAdmin(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    const message = params.message as string || 'Moderation attention required';

    this.emit('admin-notification', {
      type: 'moderation_alert',
      message,
      context,
    });
  }

  /**
   * Apply warning to user
   */
  private async actionApplyWarning(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.authorDid) return;

    await db.insert(moderationUserActions).values({
      id: `warn-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: context.authorDid,
      actionType: 'warn',
      reason: params.reason as string || 'Automated warning from workflow',
      performedBy: 'system:workflow',
      relatedContentId: context.contentId,
      active: true,
      performedAt: new Date(),
    });
  }

  /**
   * Apply mute to user
   */
  private async actionApplyMute(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.authorDid) return;

    const durationHours = (params.durationHours as number) || 24;
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    await db.insert(moderationUserActions).values({
      id: `mute-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: context.authorDid,
      actionType: 'mute',
      reason: params.reason as string || 'Automated mute from workflow',
      performedBy: 'system:workflow',
      relatedContentId: context.contentId,
      durationSeconds: durationHours * 60 * 60,
      expiresAt,
      active: true,
      performedAt: new Date(),
    });
  }

  /**
   * Apply suspension to user
   */
  private async actionApplySuspension(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.authorDid) return;

    const durationDays = (params.durationDays as number) || 7;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    await db.insert(moderationUserActions).values({
      id: `suspend-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: context.authorDid,
      actionType: 'suspend',
      reason: params.reason as string || 'Automated suspension from workflow',
      performedBy: 'system:workflow',
      relatedContentId: context.contentId,
      durationSeconds: durationDays * 24 * 60 * 60,
      expiresAt,
      active: true,
      performedAt: new Date(),
    });
  }

  /**
   * Apply permanent ban to user
   */
  private async actionApplyBan(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    if (!context.authorDid) return;

    await db.insert(moderationUserActions).values({
      id: `ban-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: context.authorDid,
      actionType: 'ban',
      reason: params.reason as string || 'Automated ban from workflow',
      performedBy: 'system:workflow',
      relatedContentId: context.contentId,
      active: true,
      performedAt: new Date(),
    });
  }

  /**
   * Send webhook notification
   */
  private async actionSendWebhook(context: WorkflowContext, params: Record<string, unknown>): Promise<void> {
    const url = params.url as string;
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'moderation_workflow',
          timestamp: new Date().toISOString(),
          context,
        }),
      });
    } catch (error) {
      console.error('[WorkflowEngine] Webhook failed:', error);
      throw error;
    }
  }

  /**
   * Update cooldown timestamp
   */
  private updateCooldown(rule: WorkflowRule): void {
    if (rule.cooldownMs) {
      this.cooldowns.set(rule.id, Date.now());
    }
  }

  /**
   * Increment execution count
   */
  private incrementExecutionCount(rule: WorkflowRule): void {
    if (rule.maxExecutionsPerHour) {
      const current = this.executionCounts.get(rule.id) || 0;
      this.executionCounts.set(rule.id, current + 1);

      // Reset counts every hour
      setTimeout(() => {
        const count = this.executionCounts.get(rule.id);
        if (count !== undefined && count > 0) {
          this.executionCounts.set(rule.id, count - 1);
        }
      }, 3600000);
    }
  }

  /**
   * Log workflow execution
   */
  private async logExecution(
    rule: WorkflowRule,
    context: WorkflowContext,
    result: WorkflowExecutionResult
  ): Promise<void> {
    try {
      await db.insert(modActionsLog).values({
        id: `wf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        action: 'workflow_execution',
        contentType: context.contentType || 'unknown',
        contentId: context.contentId || '',
        sourceService: 'workflow_engine',
        performedBy: 'system:workflow',
        isAutomated: true,
        performedAt: new Date(),
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          actionsExecuted: result.actionsExecuted,
          errors: result.errors,
          duration: result.duration,
        },
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('[WorkflowEngine] Failed to log execution:', error);
    }
  }

  /**
   * Add a new workflow rule
   */
  async addRule(rule: Omit<WorkflowRule, 'id'>): Promise<string> {
    const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await db.insert(moderationRules).values({
      id,
      name: rule.name,
      description: rule.description || null,
      conditions: {
        trigger: rule.trigger,
        conditions: rule.conditions,
        cooldownMs: rule.cooldownMs,
        maxExecutionsPerHour: rule.maxExecutionsPerHour,
      },
      action: JSON.stringify({ actions: rule.actions }),
      priority: rule.priority,
      enabled: rule.enabled,
    });

    await this.loadRules();
    return id;
  }

  /**
   * Update an existing workflow rule
   */
  async updateRule(id: string, updates: Partial<WorkflowRule>): Promise<void> {
    const existing = this.rules.get(id);
    if (!existing) {
      throw new Error(`Rule not found: ${id}`);
    }

    await db
      .update(moderationRules)
      .set({
        name: updates.name,
        description: updates.description,
        conditions: {
          trigger: updates.trigger || existing.trigger,
          conditions: updates.conditions || existing.conditions,
          cooldownMs: updates.cooldownMs,
          maxExecutionsPerHour: updates.maxExecutionsPerHour,
        },
        action: JSON.stringify({ actions: updates.actions || existing.actions }),
        priority: updates.priority,
        enabled: updates.enabled,
      })
      .where(eq(moderationRules.id, id));

    await this.loadRules();
  }

  /**
   * Delete a workflow rule
   */
  async deleteRule(id: string): Promise<void> {
    await db.delete(moderationRules).where(eq(moderationRules.id, id));
    this.rules.delete(id);
  }

  /**
   * Get all rules
   */
  getRules(): WorkflowRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific rule
   */
  getRule(id: string): WorkflowRule | undefined {
    return this.rules.get(id);
  }
}

// Singleton instance
let workflowEngine: WorkflowEngine | null = null;

/**
 * Get workflow engine instance
 */
export function getWorkflowEngine(): WorkflowEngine {
  if (!workflowEngine) {
    workflowEngine = new WorkflowEngine();
  }
  return workflowEngine;
}

export default WorkflowEngine;
