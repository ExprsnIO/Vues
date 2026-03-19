/**
 * Appeals Service
 * Handles appeals workflow, decision management, and reinstatement
 */

import { db } from '../../db/index.js';
import { eq, and, or, sql, desc, asc } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

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
    // Note: using sanction_id or user_action_id depending on originalActionType
    const existingAppeals = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM moderation_appeals
      WHERE user_id = ${userId}
        AND (sanction_id = ${originalActionId} OR user_action_id = ${originalActionId})
        AND status NOT IN ('denied')
    `);

    const existingCount = Number((existingAppeals[0] as any)?.count) || 0;
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
      SELECT reviewed_at
      FROM moderation_appeals
      WHERE user_id = ${userId}
        AND (sanction_id = ${originalActionId} OR user_action_id = ${originalActionId})
        AND status IN ('approved', 'denied')
      ORDER BY reviewed_at DESC
      LIMIT 1
    `);

    if (lastAppeal.length > 0) {
      const reviewedAt = (lastAppeal[0] as any).reviewed_at;
      if (reviewedAt) {
        const lastResolvedAt = new Date(reviewedAt);
        const cooldownEnds = new Date(lastResolvedAt.getTime() + this.appealCooldownHours * 3600000);
        if (cooldownEnds > new Date()) {
          return {
            eligible: false,
            reason: 'Appeal cooldown period has not ended',
            cooldownEnds,
          };
        }
      }
    }

    // Check total active appeals
    const activeAppeals = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM moderation_appeals
      WHERE user_id = ${userId}
        AND status IN ('pending', 'reviewing')
    `);

    const activeCount = Number((activeAppeals[0] as any)?.count) || 0;
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

    // Map originalActionType to correct column
    const sanctionId = params.originalActionType === 'sanction' ? params.originalActionId : null;
    const userActionId = params.originalActionType === 'account_action' ? params.originalActionId : null;
    const moderationItemId = ['report', 'content_removal'].includes(params.originalActionType) ? params.originalActionId : null;

    await db.execute(sql`
      INSERT INTO moderation_appeals (
        id, moderation_item_id, user_action_id, sanction_id, user_id,
        reason, additional_info, status, submitted_at, created_at, updated_at
      ) VALUES (
        ${id}, ${moderationItemId}, ${userActionId}, ${sanctionId},
        ${params.userId}, ${params.reason}, ${params.evidence || null},
        'pending', ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()}
      )
    `);

    // Record appeal creation in history
    await this.recordHistory(id, {
      action: 'created',
      actor: params.userId,
      actorType: 'user',
      details: {
        newStatus: 'pending',
        originalActionType: params.originalActionType,
        originalActionId: params.originalActionId,
        reason: params.reason,
      },
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

    if (result.length === 0) return null;

    return this.rowToAppeal(result[0] as any);
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

    // Note: domainId filtering removed as moderation_appeals doesn't have domain_id column
    // Would need to join with related tables to filter by domain

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      // Map status values to match schema: 'pending' | 'reviewing' | 'approved' | 'denied'
      const mappedStatuses = statuses.map(s => {
        if (s === 'in_review') return 'reviewing';
        if (s === 'resolved') return 'approved';
        if (s === 'withdrawn') return 'denied';
        if (s === 'awaiting_info') return 'reviewing'; // Map to reviewing as schema doesn't have awaiting_info
        return s;
      });
      whereConditions.push(sql`status IN (${sql.join(mappedStatuses.map(s => sql`${s}`), sql`, `)})`);
    }

    // Note: priority filtering removed as moderation_appeals doesn't have priority column

    // Note: assignedTo/unassigned filtering removed as moderation_appeals doesn't have assigned_to column

    if (filters.createdAfter) {
      whereConditions.push(sql`created_at >= ${filters.createdAfter.toISOString()}`);
    }

    if (filters.createdBefore) {
      whereConditions.push(sql`created_at <= ${filters.createdBefore.toISOString()}`);
    }

    if (filters.userId) {
      whereConditions.push(sql`user_id = ${filters.userId}`);
    }

    // Note: originalModerator filtering removed as it would require complex join

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
    const total = Number((countResult[0] as any)?.count) || 0;

    // Get appeals
    const result = await db.execute(sql`
      SELECT * FROM moderation_appeals
      ${whereClause}
      ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `);

    return {
      appeals: (result as any[]).map(row => this.rowToAppeal(row)),
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

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        reviewed_by = ${moderatorId},
        status = 'reviewing',
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    // Record assignment in history
    await this.recordHistory(appealId, {
      action: 'assigned',
      actor: assignedBy || 'system',
      actorType: assignedBy ? 'moderator' : 'system',
      details: {
        previousStatus: appeal.status,
        newStatus: 'reviewing',
        previousAssignee: appeal.assignedTo,
        newAssignee: moderatorId,
      },
    });
  }

  /**
   * Auto-assign appeals to available moderators
   */
  async autoAssignAppeals(domainId: string): Promise<number> {
    // Note: This method requires domain infrastructure that may not be fully set up
    // Simplified implementation without domain user roles

    // Get unassigned appeals
    const unassigned = await db.execute(sql`
      SELECT id
      FROM moderation_appeals
      WHERE status = 'pending'
        AND reviewed_by IS NULL
      ORDER BY created_at ASC
      LIMIT 50
    `);

    // Note: Without domain_user_roles integration, cannot actually assign
    // This would need proper domain moderator lookup
    return 0;
  }

  /**
   * Make a decision on an appeal
   */
  async decideAppeal(decision: AppealDecision, decidedBy: string): Promise<Appeal> {
    const appeal = await this.getAppeal(decision.appealId);
    if (!appeal) {
      throw new Error('Appeal not found');
    }

    // Map outcome to schema status values: 'pending' | 'reviewing' | 'approved' | 'denied'
    const status = decision.outcome === 'upheld' ? 'denied' : 'approved';

    const now = new Date();

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        status = ${status},
        decision = ${decision.outcome},
        review_notes = ${decision.reason},
        reviewed_by = ${decidedBy},
        reviewed_at = ${now.toISOString()},
        updated_at = ${now.toISOString()}
      WHERE id = ${decision.appealId}
    `);

    // Record decision in history
    await this.recordHistory(decision.appealId, {
      action: 'decision_made',
      actor: decidedBy,
      actorType: 'moderator',
      details: {
        previousStatus: appeal.status,
        newStatus: status,
        outcome: decision.outcome,
        reason: decision.reason,
        reinstateContent: decision.reinstateContent,
        removeAction: decision.removeAction,
        modifyAction: decision.modifyAction,
        notes: decision.internalNotes,
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

    // Update appeal status
    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        status = 'reviewing',
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    // Create info request record
    const { nanoid } = await import('nanoid');
    await db.insert(schema.appealInfoRequests).values({
      id: nanoid(),
      appealId,
      requestedBy,
      question: request.question,
      status: 'pending',
      dueAt: request.deadline,
    });

    // Record in history
    await this.recordHistory(appealId, {
      action: 'info_requested',
      actor: requestedBy,
      actorType: 'moderator',
      details: {
        question: request.question,
        deadline: request.deadline?.toISOString(),
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

    // Append response to additional_info
    const currentInfo = appeal.evidence || '';
    const updatedInfo = currentInfo ? `${currentInfo}\n\n[Response]: ${response}` : response;

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        additional_info = ${updatedInfo},
        status = 'reviewing',
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    // Update pending info requests for this appeal
    await db
      .update(schema.appealInfoRequests)
      .set({
        response,
        respondedAt: now,
        status: 'responded',
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.appealInfoRequests.appealId, appealId),
          eq(schema.appealInfoRequests.status, 'pending')
        )
      );

    // Record in history
    await this.recordHistory(appealId, {
      action: 'info_provided',
      actor: userId,
      actorType: 'user',
      details: {
        responseLength: response.length,
      },
    });

    // Notify assigned moderator
    if (appeal.reviewedBy) {
      await this.notifyModerator(appeal.reviewedBy, {
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

    // Check if already resolved (status is resolved in Appeal interface but approved/denied in DB)
    if (appeal.status === 'resolved') {
      throw new Error('Cannot withdraw resolved appeal');
    }

    const now = new Date();
    const withdrawReason = reason ? `Withdrawn by user: ${reason}` : 'Withdrawn by user';

    await db.execute(sql`
      UPDATE moderation_appeals
      SET
        status = 'denied',
        decision = 'dismissed',
        review_notes = ${withdrawReason},
        reviewed_at = ${now.toISOString()},
        updated_at = ${now.toISOString()}
      WHERE id = ${appealId}
    `);

    // Record withdrawal in history
    await this.recordHistory(appealId, {
      action: 'closed',
      actor: userId,
      actorType: 'user',
      details: {
        previousStatus: appeal.status,
        newStatus: 'denied',
        reason: withdrawReason,
        withdrawnByUser: true,
      },
    });
  }

  /**
   * Get appeal statistics
   */
  async getStats(domainId: string, period: AppealStats['period']): Promise<AppealStats> {
    let periodFilter = sql``;
    if (period !== 'all') {
      const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      periodFilter = sql`WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * ${days}`;
    }

    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'reviewing') as in_review,
        COUNT(*) FILTER (WHERE status IN ('approved', 'denied')) as resolved,
        COUNT(*) FILTER (WHERE decision = 'dismissed') as withdrawn,
        COUNT(*) FILTER (WHERE decision = 'upheld') as upheld,
        COUNT(*) FILTER (WHERE decision = 'overturned') as overturned,
        COUNT(*) FILTER (WHERE decision = 'partially_overturned') as partially_overturned,
        COUNT(*) FILTER (WHERE decision = 'dismissed') as dismissed,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at))/3600)
          FILTER (WHERE reviewed_at IS NOT NULL) as avg_resolution_hours
      FROM moderation_appeals
      ${periodFilter}
    `);

    const row = result[0] as any;
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
    const history = await db
      .select()
      .from(schema.appealHistory)
      .where(eq(schema.appealHistory.appealId, appealId))
      .orderBy(desc(schema.appealHistory.createdAt));

    return history.map((h) => ({
      id: h.id,
      appealId: h.appealId,
      action: h.action,
      actor: h.actorDid || 'system',
      actorType: h.actorType as 'user' | 'moderator' | 'system',
      details: {
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        previousAssignee: h.previousAssignee,
        newAssignee: h.newAssignee,
        notes: h.notes,
        ...(h.metadata as Record<string, unknown> || {}),
      },
      createdAt: h.createdAt,
    }));
  }

  // Private helpers

  private async getOriginalAction(
    actionId: string,
    actionType: string
  ): Promise<{ moderatorId?: string; decision?: string; decidedAt?: Date } | null> {
    // Map action types to actual tables in schema
    try {
      if (actionType === 'sanction') {
        const result = await db.execute(sql`
          SELECT admin_id, sanction_type, created_at
          FROM user_sanctions
          WHERE id = ${actionId}
        `);
        if (result.length === 0) return null;
        const row = result[0] as any;
        return {
          moderatorId: row.admin_id,
          decision: row.sanction_type,
          decidedAt: row.created_at ? new Date(row.created_at) : undefined,
        };
      } else if (actionType === 'account_action') {
        const result = await db.execute(sql`
          SELECT performed_by, action_type, performed_at
          FROM moderation_user_actions
          WHERE id = ${actionId}
        `);
        if (result.length === 0) return null;
        const row = result[0] as any;
        return {
          moderatorId: row.performed_by,
          decision: row.action_type,
          decidedAt: row.performed_at ? new Date(row.performed_at) : undefined,
        };
      } else if (actionType === 'report' || actionType === 'content_removal') {
        // Use moderation_items table
        const result = await db.execute(sql`
          SELECT reviewed_by, decision, reviewed_at
          FROM moderation_items
          WHERE id = ${actionId}
        `);
        if (result.length === 0) return null;
        const row = result[0] as any;
        return {
          moderatorId: row.reviewed_by,
          decision: row.decision,
          decidedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
        };
      }
    } catch (error) {
      console.error('Error fetching original action:', error);
    }
    return null;
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
    const { nanoid } = await import('nanoid');

    await db.insert(schema.appealHistory).values({
      id: nanoid(),
      appealId,
      action: entry.action,
      actorDid: entry.actor !== 'system' ? entry.actor : null,
      actorType: entry.actorType,
      previousStatus: entry.details?.previousStatus as string | undefined,
      newStatus: entry.details?.newStatus as string | undefined,
      previousAssignee: entry.details?.previousAssignee as string | undefined,
      newAssignee: entry.details?.newAssignee as string | undefined,
      notes: entry.details?.notes as string | undefined,
      metadata: entry.details || {},
    });
  }

  private async reinstateContent(appeal: Appeal): Promise<void> {
    // Reinstate content based on original action type
    if (appeal.originalActionType === 'content_removal' && appeal.originalActionId) {
      // Get the moderation item details
      const item = await db.execute(sql`
        SELECT content_type, content_id FROM moderation_items WHERE id = ${appeal.originalActionId}
      `);

      if (item.length > 0) {
        const row = item[0] as any;
        if (row.content_type === 'video') {
          await db.execute(sql`
            UPDATE videos
            SET status = 'published', moderation_status = 'approved', updated_at = CURRENT_TIMESTAMP
            WHERE uri = ${row.content_id}
          `);
        }
      }
    }
  }

  private async removeOriginalAction(appeal: Appeal): Promise<void> {
    // Remove/void the original action
    if (appeal.originalActionType === 'sanction' && appeal.originalActionId) {
      // Note: user_sanctions doesn't have voided columns in schema
      // Mark as appealed instead
      await db.execute(sql`
        UPDATE user_sanctions
        SET appeal_status = 'approved', appeal_note = 'Appeal overturned'
        WHERE id = ${appeal.originalActionId}
      `);
    } else if (appeal.originalActionType === 'account_action' && appeal.originalActionId) {
      await db.execute(sql`
        UPDATE moderation_user_actions
        SET active = false
        WHERE id = ${appeal.originalActionId}
      `);
    }
  }

  private async modifyOriginalAction(
    appeal: Appeal,
    modification: { newActionType?: string; newDuration?: number; newSeverity?: string }
  ): Promise<void> {
    if (appeal.originalActionType === 'sanction' && appeal.originalActionId) {
      // Note: user_sanctions doesn't have duration_hours in schema
      // Update expires_at if newDuration provided
      if (modification.newDuration) {
        await db.execute(sql`
          UPDATE user_sanctions
          SET
            expires_at = created_at + INTERVAL '1 hour' * ${modification.newDuration},
            appeal_note = 'Appeal partially overturned - duration modified'
          WHERE id = ${appeal.originalActionId}
        `);
      }
      if (modification.newActionType) {
        await db.execute(sql`
          UPDATE user_sanctions
          SET
            sanction_type = ${modification.newActionType},
            appeal_note = 'Appeal partially overturned - sanction type modified'
          WHERE id = ${appeal.originalActionId}
        `);
      }
    } else if (appeal.originalActionType === 'account_action' && appeal.originalActionId) {
      if (modification.newDuration) {
        await db.execute(sql`
          UPDATE moderation_user_actions
          SET
            duration_seconds = ${modification.newDuration * 3600},
            expires_at = performed_at + INTERVAL '1 second' * ${modification.newDuration * 3600}
          WHERE id = ${appeal.originalActionId}
        `);
      }
      if (modification.newActionType) {
        await db.execute(sql`
          UPDATE moderation_user_actions
          SET action_type = ${modification.newActionType}
          WHERE id = ${appeal.originalActionId}
        `);
      }
    }
  }

  private async notifyUser(userId: string, notification: any): Promise<void> {
    // Map notification to schema structure
    // Schema uses: userDid, actorDid, reason, reasonSubject, uri, cid, isRead, createdAt, indexedAt
    try {
      await db.execute(sql`
        INSERT INTO notifications (
          id, user_did, actor_did, reason, reason_subject, uri, is_read, created_at, indexed_at
        ) VALUES (
          ${crypto.randomUUID()},
          ${userId},
          'system',
          ${notification.type},
          ${notification.reason || notification.question || 'Appeal update'},
          ${notification.appealId ? `appeal:${notification.appealId}` : null},
          false,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  private async notifyModerators(domainId: string, notification: any): Promise<void> {
    // Note: Domain-based moderator lookup would require proper domain infrastructure
    // Skipping for now
  }

  private async notifyModerator(moderatorId: string, notification: any): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO notifications (
          id, user_did, actor_did, reason, reason_subject, uri, is_read, created_at, indexed_at
        ) VALUES (
          ${crypto.randomUUID()},
          ${moderatorId},
          'system',
          ${notification.type},
          'Appeal requires attention',
          ${notification.appealId ? `appeal:${notification.appealId}` : null},
          false,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `);
    } catch (error) {
      console.error('Error creating moderator notification:', error);
    }
  }

  private rowToAppeal(row: any): Appeal {
    // Map schema columns to Appeal interface
    // Schema: moderation_item_id, user_action_id, sanction_id, user_id, reason, additional_info,
    //         status, reviewed_by, reviewed_at, review_notes, decision, submitted_at, created_at, updated_at

    // Determine original action ID and type
    let originalActionId = '';
    let originalActionType: Appeal['originalActionType'] = 'report';

    if (row.sanction_id) {
      originalActionId = row.sanction_id;
      originalActionType = 'sanction';
    } else if (row.user_action_id) {
      originalActionId = row.user_action_id;
      originalActionType = 'account_action';
    } else if (row.moderation_item_id) {
      originalActionId = row.moderation_item_id;
      originalActionType = 'content_removal';
    }

    // Map status: schema has 'pending' | 'reviewing' | 'approved' | 'denied'
    // to 'pending' | 'in_review' | 'awaiting_info' | 'resolved' | 'withdrawn'
    let status: AppealStatus = 'pending';
    if (row.status === 'reviewing') status = 'in_review';
    else if (row.status === 'approved' || row.status === 'denied') status = 'resolved';
    else status = row.status as AppealStatus;

    return {
      id: row.id,
      originalActionId,
      originalActionType,
      userId: row.user_id,
      domainId: '', // Not in schema
      reason: row.reason,
      evidence: row.additional_info,
      status,
      priority: 'medium' as const, // Not in schema
      assignedTo: undefined, // Not in schema
      reviewedBy: row.reviewed_by,
      outcome: row.decision as AppealOutcome | undefined,
      outcomeReason: row.review_notes,
      originalModerator: undefined, // Would need to fetch from related table
      originalDecision: undefined, // Would need to fetch from related table
      originalDecisionAt: undefined,
      createdAt: new Date(row.created_at),
      firstResponseAt: undefined, // Not in schema
      resolvedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      updatedAt: new Date(row.updated_at),
    };
  }
}

export function createAppealsService(): AppealsService {
  return new AppealsService();
}
