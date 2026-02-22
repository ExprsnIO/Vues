/**
 * Moderation Service
 * Core business logic for content moderation
 */

import { eq, and, desc, asc, sql, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import {
  moderationItems,
  moderationReviewQueue,
  modActionsLog,
  moderationRules,
  moderationReports,
  moderationUserActions,
  moderationAppeals,
  moderationAiAgents,
  moderationBannedWords,
  moderationBannedTags,
} from '../../db/schema.js';
import { analyzeContent, getAvailableProviders, hasAIProvider } from './ai-providers.js';
import {
  calculateOverallRisk,
  getRiskLevel,
  requiresManualReview,
  determineAction,
  calculatePriority,
  getStatusFromAction,
} from './risk-calculator.js';
import type {
  ModerationContent,
  ModerationResult,
  QueueItem,
  ModerationStats,
  ModerationActionType,
  AIProvider,
} from './types.js';

class ModerationService {
  /**
   * Moderate content
   */
  async moderateContent(params: ModerationContent): Promise<ModerationResult> {
    const {
      contentType,
      contentId,
      sourceService,
      userId,
      contentText,
      contentUrl,
      contentMetadata = {},
      aiProvider,
    } = params;

    // Check if already moderated
    const existing = await db.query.moderationItems.findFirst({
      where: and(
        eq(moderationItems.sourceService, sourceService),
        eq(moderationItems.contentType, contentType),
        eq(moderationItems.contentId, contentId)
      ),
    });

    if (existing) {
      return this.formatResult(existing);
    }

    // Analyze content with AI
    const aiResult = await analyzeContent(
      {
        text: contentText,
        url: contentUrl,
        type: contentType,
      },
      aiProvider
    );

    // Calculate overall risk
    const overallRisk = aiResult.riskScore || calculateOverallRisk({
      toxicity: aiResult.toxicityScore,
      nsfw: aiResult.nsfwScore,
      spam: aiResult.spamScore,
      violence: aiResult.violenceScore,
      hateSpeech: aiResult.hateSpeechScore,
    });

    const riskLevel = getRiskLevel(overallRisk);

    // Check custom rules
    const ruleAction = await this.applyCustomRules({
      contentType,
      sourceService,
      riskScore: overallRisk,
    });

    // Determine action
    const needsReview = requiresManualReview(overallRisk, {
      toxicity: aiResult.toxicityScore,
      nsfw: aiResult.nsfwScore,
      spam: aiResult.spamScore,
      violence: aiResult.violenceScore,
      hateSpeech: aiResult.hateSpeechScore,
    });
    const action = ruleAction || determineAction(overallRisk, { requiresReview: needsReview });
    const status = getStatusFromAction(action);

    // Create moderation item
    const id = uuidv4();
    const now = new Date();

    const [moderationItem] = await db.insert(moderationItems).values({
      id,
      contentType,
      contentId,
      sourceService,
      userId,
      contentText,
      contentUrl,
      contentMetadata,
      riskScore: overallRisk,
      riskLevel,
      toxicityScore: aiResult.toxicityScore,
      nsfwScore: aiResult.nsfwScore,
      spamScore: aiResult.spamScore,
      violenceScore: aiResult.violenceScore,
      hateSpeechScore: aiResult.hateSpeechScore,
      aiProvider: aiResult.provider,
      aiModel: aiResult.model,
      aiResponse: (aiResult.rawResponse || { ...aiResult }) as Record<string, unknown>,
      status,
      action,
      requiresReview: needsReview,
      submittedAt: now,
      processedAt: now,
    }).returning();

    if (!moderationItem) {
      throw new Error('Failed to create moderation item');
    }

    // Add to review queue if needed
    if (needsReview) {
      await this.addToReviewQueue(moderationItem.id, overallRisk);
    }

    // Log action
    await this.logAction({
      action,
      contentType,
      contentId,
      sourceService,
      moderationItemId: moderationItem.id,
      isAutomated: true,
      reason: aiResult.explanation || `Risk score: ${overallRisk}`,
    });

    return this.formatResult(moderationItem);
  }

  /**
   * Get moderation status for content
   */
  async getModerationStatus(
    sourceService: string,
    contentType: string,
    contentId: string
  ): Promise<ModerationResult | null> {
    const item = await db.query.moderationItems.findFirst({
      where: and(
        eq(moderationItems.sourceService, sourceService),
        eq(moderationItems.contentType, contentType),
        eq(moderationItems.contentId, contentId)
      ),
    });

    if (!item) {
      return null;
    }

    return this.formatResult(item);
  }

  /**
   * Get review queue
   */
  async getQueue(options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: QueueItem[]; total: number }> {
    const { status = 'pending', limit = 50, offset = 0 } = options;

    const whereClause = eq(moderationReviewQueue.status, status);

    const [items, totalResult] = await Promise.all([
      db.select()
        .from(moderationReviewQueue)
        .innerJoin(moderationItems, eq(moderationReviewQueue.moderationItemId, moderationItems.id))
        .where(whereClause)
        .orderBy(desc(moderationReviewQueue.priority), asc(moderationReviewQueue.queuedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() })
        .from(moderationReviewQueue)
        .where(whereClause),
    ]);

    return {
      items: items.map((row) => ({
        id: row.moderation_review_queue.id,
        moderationItemId: row.moderation_review_queue.moderationItemId,
        priority: row.moderation_review_queue.priority || 0,
        escalated: row.moderation_review_queue.escalated || false,
        escalatedReason: row.moderation_review_queue.escalatedReason,
        status: row.moderation_review_queue.status,
        assignedTo: row.moderation_review_queue.assignedTo,
        queuedAt: row.moderation_review_queue.queuedAt,
        content: {
          id: row.moderation_items.id,
          type: row.moderation_items.contentType,
          text: row.moderation_items.contentText,
          url: row.moderation_items.contentUrl,
          riskScore: row.moderation_items.riskScore,
          riskLevel: row.moderation_items.riskLevel,
          userId: row.moderation_items.userId,
        },
      })),
      total: totalResult[0]?.count || 0,
    };
  }

  /**
   * Approve content in queue
   */
  async approveContent(
    queueItemId: string,
    moderatorId: string,
    notes?: string
  ): Promise<ModerationResult> {
    return this.reviewContent(queueItemId, moderatorId, 'approve', notes);
  }

  /**
   * Reject content in queue
   */
  async rejectContent(
    queueItemId: string,
    moderatorId: string,
    notes?: string
  ): Promise<ModerationResult> {
    return this.reviewContent(queueItemId, moderatorId, 'reject', notes);
  }

  /**
   * Review content (approve/reject)
   */
  private async reviewContent(
    queueItemId: string,
    moderatorId: string,
    decision: 'approve' | 'reject',
    notes?: string
  ): Promise<ModerationResult> {
    const queueItem = await db.query.moderationReviewQueue.findFirst({
      where: eq(moderationReviewQueue.id, queueItemId),
    });

    if (!queueItem) {
      throw new Error('Review queue item not found');
    }

    const modItem = await db.query.moderationItems.findFirst({
      where: eq(moderationItems.id, queueItem.moderationItemId),
    });

    if (!modItem) {
      throw new Error('Moderation item not found');
    }

    const action = decision as ModerationActionType;
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const now = new Date();

    // Update moderation item
    await db.update(moderationItems)
      .set({
        status,
        action,
        reviewedBy: moderatorId,
        reviewedAt: now,
        reviewNotes: notes,
        updatedAt: now,
      })
      .where(eq(moderationItems.id, modItem.id));

    // Update queue item
    await db.update(moderationReviewQueue)
      .set({
        status,
        assignedTo: moderatorId,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(moderationReviewQueue.id, queueItemId));

    // Log action
    await this.logAction({
      action,
      contentType: modItem.contentType,
      contentId: modItem.contentId,
      sourceService: modItem.sourceService,
      moderationItemId: modItem.id,
      performedBy: moderatorId,
      isAutomated: false,
      reason: notes,
    });

    const updated = await db.query.moderationItems.findFirst({
      where: eq(moderationItems.id, modItem.id),
    });

    return this.formatResult(updated!);
  }

  /**
   * Escalate queue item
   */
  async escalateItem(queueItemId: string, reason: string): Promise<void> {
    await db.update(moderationReviewQueue)
      .set({
        escalated: true,
        escalatedReason: reason,
        priority: 15, // Max priority
        updatedAt: new Date(),
      })
      .where(eq(moderationReviewQueue.id, queueItemId));
  }

  /**
   * Assign queue item to moderator
   */
  async assignToModerator(queueItemId: string, moderatorId: string): Promise<void> {
    await db.update(moderationReviewQueue)
      .set({
        assignedTo: moderatorId,
        assignedAt: new Date(),
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(moderationReviewQueue.id, queueItemId));
  }

  /**
   * Get appeals
   */
  async getAppeals(options: {
    status?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ appeals: typeof moderationAppeals.$inferSelect[]; total: number }> {
    const { status, userId, limit = 50, offset = 0 } = options;

    let whereClause;
    if (status && userId) {
      whereClause = and(
        eq(moderationAppeals.status, status),
        eq(moderationAppeals.userId, userId)
      );
    } else if (status) {
      whereClause = eq(moderationAppeals.status, status);
    } else if (userId) {
      whereClause = eq(moderationAppeals.userId, userId);
    }

    const [appeals, totalResult] = await Promise.all([
      db.select()
        .from(moderationAppeals)
        .where(whereClause)
        .orderBy(desc(moderationAppeals.submittedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() })
        .from(moderationAppeals)
        .where(whereClause),
    ]);

    return {
      appeals,
      total: totalResult[0]?.count || 0,
    };
  }

  /**
   * Get reports
   */
  async getReports(options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ reports: typeof moderationReports.$inferSelect[]; total: number }> {
    const { status, limit = 50, offset = 0 } = options;

    const whereClause = status ? eq(moderationReports.status, status) : undefined;

    const [reports, totalResult] = await Promise.all([
      db.select()
        .from(moderationReports)
        .where(whereClause)
        .orderBy(desc(moderationReports.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() })
        .from(moderationReports)
        .where(whereClause),
    ]);

    return {
      reports,
      total: totalResult[0]?.count || 0,
    };
  }

  /**
   * Get rules
   */
  async getRules(options: {
    enabled?: boolean;
    limit?: number;
  } = {}): Promise<{ rules: typeof moderationRules.$inferSelect[] }> {
    const { enabled, limit = 100 } = options;

    const whereClause = enabled !== undefined ? eq(moderationRules.enabled, enabled) : undefined;

    const rules = await db.select()
      .from(moderationRules)
      .where(whereClause)
      .orderBy(desc(moderationRules.priority))
      .limit(limit);

    return { rules };
  }

  /**
   * Create rule
   */
  async createRule(rule: Omit<typeof moderationRules.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>): Promise<typeof moderationRules.$inferSelect> {
    const [created] = await db.insert(moderationRules).values({
      id: uuidv4(),
      ...rule,
    }).returning();

    if (!created) {
      throw new Error('Failed to create rule');
    }

    return created;
  }

  /**
   * Update rule
   */
  async updateRule(
    ruleId: string,
    updates: Partial<typeof moderationRules.$inferInsert>
  ): Promise<typeof moderationRules.$inferSelect> {
    const [updated] = await db.update(moderationRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(moderationRules.id, ruleId))
      .returning();

    if (!updated) {
      throw new Error('Rule not found');
    }

    return updated;
  }

  /**
   * Delete rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    await db.delete(moderationRules).where(eq(moderationRules.id, ruleId));
  }

  /**
   * Get AI agents
   */
  async getAgents(): Promise<{ agents: typeof moderationAiAgents.$inferSelect[] }> {
    const agents = await db.select()
      .from(moderationAiAgents)
      .orderBy(desc(moderationAiAgents.priority));

    return { agents };
  }

  /**
   * User actions (warn, suspend, ban)
   */
  async warnUser(userId: string, reason: string, performedBy: string, expiresIn?: number): Promise<string> {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

    await db.insert(moderationUserActions).values({
      id,
      userId,
      actionType: 'warn',
      reason,
      durationSeconds: expiresIn || null,
      expiresAt,
      performedBy,
      performedAt: now,
    });

    return id;
  }

  async suspendUser(userId: string, duration: number, reason: string, performedBy: string): Promise<string> {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 1000);

    await db.insert(moderationUserActions).values({
      id,
      userId,
      actionType: 'suspend',
      reason,
      durationSeconds: duration,
      expiresAt,
      performedBy,
      performedAt: now,
    });

    return id;
  }

  async banUser(userId: string, reason: string, performedBy: string, permanent?: boolean): Promise<string> {
    const id = uuidv4();
    const now = new Date();

    await db.insert(moderationUserActions).values({
      id,
      userId,
      actionType: 'ban',
      reason,
      durationSeconds: permanent ? null : 86400 * 365, // 1 year if not permanent
      expiresAt: permanent ? null : new Date(now.getTime() + 86400 * 365 * 1000),
      performedBy,
      performedAt: now,
    });

    return id;
  }

  /**
   * Get moderation stats
   */
  async getStats(): Promise<ModerationStats> {
    type OverviewRow = { total: number; autoApproved: number; autoRejected: number; manuallyReviewed: number; pendingReview: number; appealed: number };
    type QueueRow = { pending: number; escalated: number };
    type RiskRow = { safe: number; low: number; medium: number; high: number; critical: number };

    const [
      overviewResult,
      queueResult,
      riskResult,
    ] = await Promise.all([
      db.select({
        total: count(),
        autoApproved: sql<number>`COUNT(*) FILTER (WHERE action = 'auto_approve')`,
        autoRejected: sql<number>`COUNT(*) FILTER (WHERE action = 'reject' AND reviewed_by IS NULL)`,
        manuallyReviewed: sql<number>`COUNT(*) FILTER (WHERE reviewed_by IS NOT NULL)`,
        pendingReview: sql<number>`COUNT(*) FILTER (WHERE requires_review = true AND reviewed_by IS NULL)`,
        appealed: sql<number>`COUNT(*) FILTER (WHERE status = 'appealed')`,
      }).from(moderationItems) as Promise<OverviewRow[]>,
      db.select({
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
        escalated: sql<number>`COUNT(*) FILTER (WHERE escalated = true)`,
      }).from(moderationReviewQueue) as Promise<QueueRow[]>,
      db.select({
        safe: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'safe')`,
        low: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'low')`,
        medium: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'medium')`,
        high: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'high')`,
        critical: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'critical')`,
      }).from(moderationItems) as Promise<RiskRow[]>,
    ]);

    const overview = overviewResult[0] || { total: 0, autoApproved: 0, autoRejected: 0, manuallyReviewed: 0, pendingReview: 0, appealed: 0 };
    const queue = queueResult[0] || { pending: 0, escalated: 0 };
    const risk = riskResult[0] || { safe: 0, low: 0, medium: 0, high: 0, critical: 0 };

    return {
      overview: {
        totalModerated: Number(overview.total) || 0,
        autoApproved: Number(overview.autoApproved) || 0,
        autoRejected: Number(overview.autoRejected) || 0,
        manuallyReviewed: Number(overview.manuallyReviewed) || 0,
        pendingReview: Number(overview.pendingReview) || 0,
        appealed: Number(overview.appealed) || 0,
      },
      queue: {
        pending: Number(queue.pending) || 0,
        escalated: Number(queue.escalated) || 0,
        avgWaitTime: 0, // Would need timestamp calculation
      },
      riskDistribution: {
        safe: Number(risk.safe) || 0,
        low: Number(risk.low) || 0,
        medium: Number(risk.medium) || 0,
        high: Number(risk.high) || 0,
        critical: Number(risk.critical) || 0,
      },
      aiProviders: getAvailableProviders().map((provider) => ({
        provider,
        requests: 0,
        avgResponseTime: 0,
        successRate: 100,
      })),
    };
  }

  /**
   * Get system health
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      database: boolean;
      redis: boolean;
      aiProviders: { claude: boolean; openai: boolean; deepseek: boolean };
    };
  }> {
    let dbHealthy = false;

    try {
      await db.execute(sql`SELECT 1`);
      dbHealthy = true;
    } catch {
      // Database unhealthy
    }

    const aiProviders = {
      claude: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY,
    };

    const hasAnyAI = Object.values(aiProviders).some(Boolean);
    const status = dbHealthy && hasAnyAI ? 'healthy' : dbHealthy ? 'degraded' : 'unhealthy';

    return {
      status,
      components: {
        database: dbHealthy,
        redis: true, // Assume healthy for now
        aiProviders,
      },
    };
  }

  // Private helper methods

  private async addToReviewQueue(moderationItemId: string, riskScore: number): Promise<void> {
    const priority = calculatePriority(riskScore);
    const escalated = riskScore >= 90;

    await db.insert(moderationReviewQueue).values({
      id: uuidv4(),
      moderationItemId,
      priority,
      escalated,
      escalatedReason: escalated ? 'High risk score' : null,
      status: 'pending',
      queuedAt: new Date(),
    });
  }

  private async logAction(params: {
    action: string;
    contentType: string;
    contentId: string;
    sourceService: string;
    moderationItemId?: string;
    reportId?: string;
    performedBy?: string;
    isAutomated?: boolean;
    reason?: string;
  }): Promise<void> {
    await db.insert(modActionsLog).values({
      id: uuidv4(),
      action: params.action,
      contentType: params.contentType,
      contentId: params.contentId,
      sourceService: params.sourceService,
      moderationItemId: params.moderationItemId,
      reportId: params.reportId,
      performedBy: params.performedBy,
      isAutomated: params.isAutomated || false,
      reason: params.reason,
      performedAt: new Date(),
    });
  }

  private async applyCustomRules(params: {
    contentType: string;
    sourceService: string;
    riskScore: number;
  }): Promise<ModerationActionType | null> {
    const rules = await db.select()
      .from(moderationRules)
      .where(eq(moderationRules.enabled, true))
      .orderBy(desc(moderationRules.priority));

    for (const rule of rules) {
      const appliesTo = rule.appliesTo as string[] || [];
      const sourceServices = rule.sourceServices as string[] || [];

      // Check if rule applies to this content type
      if (appliesTo.length > 0 && !appliesTo.includes(params.contentType)) {
        continue;
      }

      // Check if rule applies to this service
      if (sourceServices.length > 0 && !sourceServices.includes(params.sourceService)) {
        continue;
      }

      // Check threshold
      if (rule.thresholdScore !== null && params.riskScore < rule.thresholdScore) {
        continue;
      }

      // Rule applies
      return rule.action as ModerationActionType;
    }

    return null;
  }

  private formatResult(item: typeof moderationItems.$inferSelect): ModerationResult {
    return {
      id: item.id,
      contentId: item.contentId,
      contentType: item.contentType,
      status: item.status as ModerationResult['status'],
      action: item.action as ModerationActionType | null,
      riskScore: item.riskScore,
      riskLevel: item.riskLevel as ModerationResult['riskLevel'],
      scores: {
        toxicity: item.toxicityScore || 0,
        nsfw: item.nsfwScore || 0,
        spam: item.spamScore || 0,
        violence: item.violenceScore || 0,
        hateSpeech: item.hateSpeechScore || 0,
      },
      requiresReview: item.requiresReview || false,
      aiProvider: item.aiProvider,
      aiModel: item.aiModel,
      approved: item.status === 'approved',
      rejected: item.status === 'rejected',
      pending: item.status === 'pending' || item.status === 'reviewing',
      processedAt: item.processedAt,
    };
  }
}

// Singleton instance
let moderationService: ModerationService | null = null;

export function getModerationService(): ModerationService {
  if (!moderationService) {
    moderationService = new ModerationService();
  }
  return moderationService;
}

export { ModerationService };
