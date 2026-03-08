/**
 * Appeals Service
 * Handles appeals workflow, decision management, and reinstatement
 */

import { db } from '../../db/index.js';
import { eq, and, or, sql, desc, asc } from 'drizzle-orm';

export interface Appeal {
  id: string;
  originalActionId: string;
  originalActionType: 'report' | 'sanction' | 'content_removal' | 'account_action';
  userId: string;
  domainId: string;
  reason: string;
  evidence?: string;
  status: AppealStatus;
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignedTo?: string;
  reviewedBy?: string;
  outcome?: AppealOutcome;
  outcomeReason?: string;
  originalModerator?: string;
  originalDecision?: string;
  originalDecisionAt?: Date;
  createdAt: Date;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  updatedAt: Date;
}

export type AppealStatus = 'pending' | 'in_review' | 'awaiting_info' | 'resolved' | 'withdrawn';
export type AppealOutcome = 'upheld' | 'overturned' | 'partially_overturned' | 'dismissed';

export interface AppealDecision {
  appealId: string;
  outcome: AppealOutcome;
  reason: string;
  reinstateContent?: boolean;
  removeAction?: boolean;
  modifyAction?: {
    newActionType?: string;
    newDuration?: number;
    newSeverity?: string;
  };
  notifyUser: boolean;
  internalNotes?: string;
}

export interface AppealQueueFilters {
  domainId?: string;
  status?: AppealStatus | AppealStatus[];
  priority?: string | string[];
  assignedTo?: string;
  unassigned?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  userId?: string;
  originalModerator?: string;
}

export interface AppealStats {
  domainId: string;
  period: 'day' | 'week' | 'month' | 'all';
  totalAppeals: number;
  pending: number;
  inReview: number;
  resolved: number;
  withdrawn: number;
  upheld: number;
  overturned: number;
  partiallyOverturned: number;
  dismissed: number;
  averageResolutionHours: number;
  overturnRate: number;
}

export interface AppealHistoryEntry {
  id: string;
  appealId: string;
  action: string;
  actor: string;
  actorType: 'user' | 'moderator' | 'system';
  details: Record<string, any>;
  createdAt: Date;
}

export interface UserAppealEligibility {
  eligible: boolean;
  reason?: string;
  cooldownEnds?: Date;
  remainingAppeals?: number;
  maxAppeals?: number;
}

export class AppealsService {
  private appealCooldownHours: number = 72;
  private maxActiveAppeals: number = 3;
  private maxAppealsPerAction: number = 2;

  /**
   * Check if user is eligible to file an appeal
   */
  async checkEligibility(
    userId: string,
    originalActionId: string,
    domainId: string
  ): Promise<UserAppealEligibility> {
    // Check for active appeals on same action
    const existingAppeals = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM moderation_appeals
      WHERE user_id = ${userId}
        AND original_action_id = ${originalActionId}
        AND status NOT IN ('withdrawn', 'dismissed')
    `);

    const existingCount = Number((existingAppeals.rows[0] as any)?.count) || 0;
    if (existingCount >= this.maxAppealsPerAction) {
      return {
        eligible: false,
        reason: 'Maximum appeals for this action has been reached',
        maxAppeals: this.maxAppealsPerAction,
        remainingAppeals: 0,
      };
    }

    // Check for cooldown from last appeal on same action
    const lastAppeal = await db.execute(sql`
      SELECT resolved_at
      FROM moderation_appeals
      WHERE user_id = ${userId}
        AND original_action_id = ${originalActionId}
        AND status = 'resolved'
      ORDER BY resolved_at DESC
      LIMIT 1
    `);

    if (lastAppeal.rows.length > 0) {
      const lastResolvedAt = new Date((lastAppeal.rows[0] as any).resolved_at);
      const cooldownEnds = new Date(lastResolvedAt.getTime() + this.appealCooldownHours * 3600000);
      if (cooldownEnds > new Date()) {
        return {
          eligible: false,
          reason: 'Appeal cooldown period has not ended',
          cooldownEnds,
        };
      }
    }

    // Check total active appeals
    const activeAppeals = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM moderation_appeals
      WHERE user_id = ${userId}
        AND domain_id = ${domainId}
        AND status IN ('pending', 'in_review', 'awaiting_info')
    `);

    const activeCount = Number((activeAppeals.rows[0] as any)?.count) || 0;
    if (activeCount >= this.maxActiveAppeals) {
      return {
        eligible: false,
        reason: 'Maximum number of active appeals reached',
        maxAppeals: this.maxActiveAppeals,
        remainingAppeals: 0,
      };
    }

    return {
      eligible: true,
      remainingAppeals: this.maxActiveAppeals - activeCount,
      maxAppeals: this.maxActiveAppeals,
    };
  }

  /**
   * Submit a new appeal
   */
  async submitAppeal(params: {
    originalActionId: string;
    originalActionType: Appeal['originalActionType'];
    userId: string;
    domainId: string;
    reason: string;
    evidence?: string;
  }): Promise<Appeal> {
    const eligibility = await this.checkEligibility(
      params.userId,
      params.originalActionId,
      params.domainId
    );

    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || 'Not eligible to file appeal');
    }

    // Get original action details
    const originalAction = await this.getOriginalAction(
      params.originalActionId,
      params.originalActionType
    );

    const id = crypto.randomUUID();
    const now = new Date();

    // Determine priority based on original action severity
    const priority = this.calculatePriority(originalAction);

    await db.execute(sql`
      INSERT INTO moderation_appeals (
        id, original_action_id, original_action_type, user_id, domain_id,
        reason, evidence, status, priority, original_moderator,
        original_decision, original_decision_at, created_at, updated_at
      ) VALUES (
        ${id}, ${params.originalActionId}, ${params.originalActionType},
        ${params.userId}, ${params.domainId}, ${params.reason},
        ${params.evidence || null}, 'pending', ${priority},
        ${originalAction?.moderatorId || null},
        ${originalAction?.decision || null},
        ${originalAction?.decidedAt?.toISOString() || null},
        ${now.toISOString()}, ${now.toISOString()}
      )
    `);

    // Record in history
    await this.recordHistory(id, {
      action: 'appeal_submitted',
      actor: params.userId,
      actorType: 'user',
      details: { reason: params.reason },
    });

    // Notify moderators
    await this.notifyModerators(params.domainId, {
      type: 'new_appeal',
      appealId: id,
      priority,
    });

    return this.getAppeal(id) as Promise<Appeal>;
  }

  /**
   * Get an appeal by ID
   */
  async getAppeal(appealId: string): Promise<Appeal | null> {
    const result = await db.execute(sql`
      SELECT * FROM moderation_appeals WHERE id = ${appealId}
    `);

    if (result.rows.length === 0) return null;

    return this.rowToAppeal(result.rows[0] as any);
  }

  /**
   * Get appeals queue with filters
   */
  async getAppealsQueue(
    filters: AppealQueueFilters,
    options: { page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}
  ): Promise<{ appeals: Appeal[]; total: number }> {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'asc' } = options;
    const offset = (page - 1) * limit;

    let whereConditions: any[] = [];

    if (filters.domainId) {
      whereConditions.push(sql`domain_id = ${filters.domainId}`);
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      whereConditions.push(sql`status IN (${sql.join(statuses.map(s => sql`${s}`), sql`, `)})`);
    }

    if (filters.priority) {
      const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
      whereConditions.push(sql`priority IN (${sql.join(priorities.map(p => sql`${p}`), sql`, `)})`);
    }

    if (filters.assignedTo) {
      whereConditions.push(sql`assigned_to = ${filters.assignedTo}`);
    }

    if (filters.unassigned) {
      whereConditions.push(sql`assigned_to IS NULL`);
    }

    if (filters.createdAfter) {
      whereConditions.push(sql`created_at >= ${filters.createdAfter.toISOString()}`);
    }

    if (filters.createdBefore) {
      whereConditions.push(sql`created_at <= ${filters.createdBefore.toISOString()}`);
    }

    if (filters.userId) {
      whereConditions.push(sql`user_id = ${filters.userId}`);
    }

    if (filters.originalModerator) {
      whereConditions.push(sql`original_moderator = ${filters.originalModerator}`);
    }

    const whereClause = whereConditions.length > 0
      ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
      : sql``;

    const orderClause = sortOrder === 'asc'
      ? sql`ORDER BY ${sql.raw(sortBy)} ASC`
      : sql`ORDER BY ${sql.raw(sortBy)} DESC`;

    // Get total count
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM moderation_appeals ${whereClause}
    `);
    const total = Number((countResult.rows[0] as any)?.count) || 0;

    // Get appeals
    const result = await db.execute(sql`
      SELECT * FROM moderation_appeals
      ${whereClause}
      ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `);

    return {
      appeals: (result.rows as any[]).map(row => this.rowToAppeal(row)),
      total,
    };
  }

  /**
   * Assign appeal to moderator
   */
  async assignAppeal(appealId: string, moderatorId: string, assignedBy?: string): Promise<void> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) {
      throw new Error('Appeal not found');
    }

    // Check that moderator is not the original moderator
    if (appeal.originalModerator === moderatorId) {
      throw new Error('Cannot assign appeal to original moderator');
    }

    const now = new Date();
    const isFirstResponse = !appeal.firstResponseAt;

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        assigned_to = ${moderatorId},
        status = 'in_review',
        first_response_at = COALESCE(first_response_at, ${now.toISOString()}),
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    await this.recordHistory(appealId, {
      action: 'appeal_assigned',
      actor: assignedBy || 'system',
      actorType: assignedBy ? 'moderator' : 'system',
      details: {
        assignedTo: moderatorId,
        isFirstResponse,
      },
    });
  }

  /**
   * Auto-assign appeals to available moderators
   */
  async autoAssignAppeals(domainId: string): Promise<number> {
    // Get available moderators with capacity
    const moderators = await db.execute(sql`
      SELECT
        dur.user_id,
        COUNT(ma.id) as current_load
      FROM domain_user_roles dur
      LEFT JOIN moderation_appeals ma ON
        ma.assigned_to = dur.user_id AND
        ma.status IN ('in_review', 'awaiting_info')
      WHERE dur.domain_id = ${domainId}
        AND dur.role_id IN (
          SELECT id FROM domain_roles
          WHERE domain_id = ${domainId}
          AND permissions @> ARRAY['moderation:appeals:review']
        )
      GROUP BY dur.user_id
      HAVING COUNT(ma.id) < 10
      ORDER BY COUNT(ma.id) ASC
    `);

    if (moderators.rows.length === 0) return 0;

    // Get unassigned appeals
    const unassigned = await db.execute(sql`
      SELECT id, original_moderator
      FROM moderation_appeals
      WHERE domain_id = ${domainId}
        AND status = 'pending'
        AND assigned_to IS NULL
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        created_at ASC
      LIMIT 50
    `);

    let assigned = 0;
    let modIndex = 0;

    for (const appeal of unassigned.rows as any[]) {
      // Find a moderator who wasn't the original
      let attempts = 0;
      while (attempts < moderators.rows.length) {
        const mod = moderators.rows[modIndex] as any;
        modIndex = (modIndex + 1) % moderators.rows.length;
        attempts++;

        if (mod.user_id !== appeal.original_moderator) {
          await this.assignAppeal(appeal.id, mod.user_id);
          assigned++;
          break;
        }
      }
    }

    return assigned;
  }

  /**
   * Make a decision on an appeal
   */
  async decideAppeal(decision: AppealDecision, decidedBy: string): Promise<Appeal> {
    const appeal = await this.getAppeal(decision.appealId);
    if (!appeal) {
      throw new Error('Appeal not found');
    }

    if (appeal.status === 'resolved') {
      throw new Error('Appeal already resolved');
    }

    const now = new Date();

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        status = 'resolved',
        outcome = ${decision.outcome},
        outcome_reason = ${decision.reason},
        reviewed_by = ${decidedBy},
        resolved_at = ${now.toISOString()},
        updated_at = ${now.toISOString()}
      WHERE id = ${decision.appealId}
    `);

    // Record decision in history
    await this.recordHistory(decision.appealId, {
      action: 'appeal_decided',
      actor: decidedBy,
      actorType: 'moderator',
      details: {
        outcome: decision.outcome,
        reason: decision.reason,
        reinstateContent: decision.reinstateContent,
        removeAction: decision.removeAction,
        modifyAction: decision.modifyAction,
      },
    });

    // Execute reinstatement if needed
    if (decision.outcome === 'overturned' || decision.outcome === 'partially_overturned') {
      if (decision.reinstateContent) {
        await this.reinstateContent(appeal);
      }

      if (decision.removeAction) {
        await this.removeOriginalAction(appeal);
      }

      if (decision.modifyAction) {
        await this.modifyOriginalAction(appeal, decision.modifyAction);
      }
    }

    // Notify user
    if (decision.notifyUser) {
      await this.notifyUser(appeal.userId, {
        type: 'appeal_decision',
        appealId: decision.appealId,
        outcome: decision.outcome,
        reason: decision.reason,
      });
    }

    return this.getAppeal(decision.appealId) as Promise<Appeal>;
  }

  /**
   * Request additional information from user
   */
  async requestInfo(
    appealId: string,
    request: { question: string; deadline?: Date },
    requestedBy: string
  ): Promise<void> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) {
      throw new Error('Appeal not found');
    }

    const now = new Date();

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        status = 'awaiting_info',
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    // Store the request
    await db.execute(sql`
      INSERT INTO appeal_info_requests (
        id, appeal_id, question, deadline, requested_by, created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${appealId},
        ${request.question},
        ${request.deadline?.toISOString() || null},
        ${requestedBy},
        ${now.toISOString()}
      )
    `);

    await this.recordHistory(appealId, {
      action: 'info_requested',
      actor: requestedBy,
      actorType: 'moderator',
      details: {
        question: request.question,
        deadline: request.deadline,
      },
    });

    // Notify user
    await this.notifyUser(appeal.userId, {
      type: 'appeal_info_needed',
      appealId,
      question: request.question,
      deadline: request.deadline,
    });
  }

  /**
   * User provides additional information
   */
  async provideInfo(appealId: string, response: string, userId: string): Promise<void> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) {
      throw new Error('Appeal not found');
    }

    if (appeal.userId !== userId) {
      throw new Error('Not authorized to respond to this appeal');
    }

    const now = new Date();

    // Update info request
    await db.execute(sql`
      UPDATE appeal_info_requests
      SET
        response = ${response},
        responded_at = ${now.toISOString()}
      WHERE appeal_id = ${appealId}
        AND responded_at IS NULL
    `);

    // Return to in_review status
    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        status = 'in_review',
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    await this.recordHistory(appealId, {
      action: 'info_provided',
      actor: userId,
      actorType: 'user',
      details: { response },
    });

    // Notify assigned moderator
    if (appeal.assignedTo) {
      await this.notifyModerator(appeal.assignedTo, {
        type: 'appeal_info_received',
        appealId,
      });
    }
  }

  /**
   * Withdraw an appeal
   */
  async withdrawAppeal(appealId: string, userId: string, reason?: string): Promise<void> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) {
      throw new Error('Appeal not found');
    }

    if (appeal.userId !== userId) {
      throw new Error('Not authorized to withdraw this appeal');
    }

    if (appeal.status === 'resolved') {
      throw new Error('Cannot withdraw resolved appeal');
    }

    const now = new Date();

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        status = 'withdrawn',
        resolved_at = ${now.toISOString()},
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    await this.recordHistory(appealId, {
      action: 'appeal_withdrawn',
      actor: userId,
      actorType: 'user',
      details: { reason },
    });
  }

  /**
   * Get appeal statistics
   */
  async getStats(domainId: string, period: AppealStats['period']): Promise<AppealStats> {
    let periodFilter = sql``;
    if (period !== 'all') {
      const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      periodFilter = sql`AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * ${days}`;
    }

    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_review') as in_review,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'withdrawn') as withdrawn,
        COUNT(*) FILTER (WHERE outcome = 'upheld') as upheld,
        COUNT(*) FILTER (WHERE outcome = 'overturned') as overturned,
        COUNT(*) FILTER (WHERE outcome = 'partially_overturned') as partially_overturned,
        COUNT(*) FILTER (WHERE outcome = 'dismissed') as dismissed,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
          FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours
      FROM moderation_appeals
      WHERE domain_id = ${domainId}
      ${periodFilter}
    `);

    const row = result.rows[0] as any;
    const total = Number(row?.total) || 0;
    const overturned = Number(row?.overturned) || 0;
    const partiallyOverturned = Number(row?.partially_overturned) || 0;
    const resolved = Number(row?.resolved) || 0;

    return {
      domainId,
      period,
      totalAppeals: total,
      pending: Number(row?.pending) || 0,
      inReview: Number(row?.in_review) || 0,
      resolved,
      withdrawn: Number(row?.withdrawn) || 0,
      upheld: Number(row?.upheld) || 0,
      overturned,
      partiallyOverturned,
      dismissed: Number(row?.dismissed) || 0,
      averageResolutionHours: Number(row?.avg_resolution_hours) || 0,
      overturnRate: resolved > 0 ? ((overturned + partiallyOverturned) / resolved) * 100 : 0,
    };
  }

  /**
   * Get appeal history
   */
  async getHistory(appealId: string): Promise<AppealHistoryEntry[]> {
    const result = await db.execute(sql`
      SELECT * FROM appeal_history
      WHERE appeal_id = ${appealId}
      ORDER BY created_at ASC
    `);

    return (result.rows as any[]).map(row => ({
      id: row.id,
      appealId: row.appeal_id,
      action: row.action,
      actor: row.actor,
      actorType: row.actor_type,
      details: row.details || {},
      createdAt: new Date(row.created_at),
    }));
  }

  // Private helpers

  private async getOriginalAction(
    actionId: string,
    actionType: string
  ): Promise<{ moderatorId?: string; decision?: string; decidedAt?: Date } | null> {
    let table: string;
    switch (actionType) {
      case 'report':
        table = 'moderation_reports';
        break;
      case 'sanction':
        table = 'user_sanctions';
        break;
      case 'content_removal':
        table = 'content_removals';
        break;
      case 'account_action':
        table = 'account_actions';
        break;
      default:
        return null;
    }

    const result = await db.execute(sql`
      SELECT resolved_by, outcome, resolved_at
      FROM ${sql.raw(table)}
      WHERE id = ${actionId}
    `);

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as any;
    return {
      moderatorId: row.resolved_by,
      decision: row.outcome,
      decidedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    };
  }

  private calculatePriority(originalAction: any): string {
    // High priority for severe actions
    if (!originalAction) return 'medium';

    const decision = originalAction.decision?.toLowerCase();
    if (decision?.includes('ban') || decision?.includes('suspend')) {
      return 'high';
    }
    if (decision?.includes('removal') || decision?.includes('delete')) {
      return 'medium';
    }
    return 'low';
  }

  private async recordHistory(
    appealId: string,
    entry: Omit<AppealHistoryEntry, 'id' | 'appealId' | 'createdAt'>
  ): Promise<void> {
    await db.execute(sql`
      INSERT INTO appeal_history (id, appeal_id, action, actor, actor_type, details, created_at)
      VALUES (
        ${crypto.randomUUID()},
        ${appealId},
        ${entry.action},
        ${entry.actor},
        ${entry.actorType},
        ${JSON.stringify(entry.details)},
        CURRENT_TIMESTAMP
      )
    `);
  }

  private async reinstateContent(appeal: Appeal): Promise<void> {
    // Reinstate content based on original action type
    if (appeal.originalActionType === 'content_removal') {
      await db.execute(sql`
        UPDATE videos
        SET status = 'published', moderation_status = 'approved', updated_at = CURRENT_TIMESTAMP
        WHERE id = (
          SELECT content_id FROM content_removals WHERE id = ${appeal.originalActionId}
        )
      `);
    }
  }

  private async removeOriginalAction(appeal: Appeal): Promise<void> {
    // Remove/void the original action
    if (appeal.originalActionType === 'sanction') {
      await db.execute(sql`
        UPDATE user_sanctions
        SET voided = 1, voided_reason = 'Appeal overturned', voided_at = CURRENT_TIMESTAMP
        WHERE id = ${appeal.originalActionId}
      `);
    }
  }

  private async modifyOriginalAction(
    appeal: Appeal,
    modification: { newActionType?: string; newDuration?: number; newSeverity?: string }
  ): Promise<void> {
    if (appeal.originalActionType === 'sanction' && modification.newDuration) {
      await db.execute(sql`
        UPDATE user_sanctions
        SET
          duration_hours = ${modification.newDuration},
          expires_at = created_at + INTERVAL '1 hour' * ${modification.newDuration},
          modified_reason = 'Appeal partially overturned',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${appeal.originalActionId}
      `);
    }
  }

  private async notifyUser(userId: string, notification: any): Promise<void> {
    await db.execute(sql`
      INSERT INTO notifications (
        id, user_id, type, title, body, data, created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${userId},
        ${notification.type},
        'Appeal Update',
        ${notification.reason || notification.question || 'Your appeal has been updated'},
        ${JSON.stringify(notification)},
        CURRENT_TIMESTAMP
      )
    `);
  }

  private async notifyModerators(domainId: string, notification: any): Promise<void> {
    // Notify moderators with appeal permissions
    const moderators = await db.execute(sql`
      SELECT DISTINCT dur.user_id
      FROM domain_user_roles dur
      JOIN domain_roles dr ON dur.role_id = dr.id
      WHERE dur.domain_id = ${domainId}
        AND dr.permissions @> ARRAY['moderation:appeals:review']
    `);

    for (const mod of moderators.rows as any[]) {
      await this.notifyModerator(mod.user_id, notification);
    }
  }

  private async notifyModerator(moderatorId: string, notification: any): Promise<void> {
    await db.execute(sql`
      INSERT INTO notifications (
        id, user_id, type, title, body, data, created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${moderatorId},
        ${notification.type},
        'Appeal Notification',
        'An appeal requires your attention',
        ${JSON.stringify(notification)},
        CURRENT_TIMESTAMP
      )
    `);
  }

  private rowToAppeal(row: any): Appeal {
    return {
      id: row.id,
      originalActionId: row.original_action_id,
      originalActionType: row.original_action_type,
      userId: row.user_id,
      domainId: row.domain_id,
      reason: row.reason,
      evidence: row.evidence,
      status: row.status,
      priority: row.priority,
      assignedTo: row.assigned_to,
      reviewedBy: row.reviewed_by,
      outcome: row.outcome,
      outcomeReason: row.outcome_reason,
      originalModerator: row.original_moderator,
      originalDecision: row.original_decision,
      originalDecisionAt: row.original_decision_at ? new Date(row.original_decision_at) : undefined,
      createdAt: new Date(row.created_at),
      firstResponseAt: row.first_response_at ? new Date(row.first_response_at) : undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      updatedAt: new Date(row.updated_at),
    };
  }
}

export function createAppealsService(): AppealsService {
  return new AppealsService();
}
