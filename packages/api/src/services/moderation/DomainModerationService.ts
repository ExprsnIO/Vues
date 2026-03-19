/**
 * Domain Moderation Service
 * Per-domain moderation policies, blocked words, content filters, and policy inheritance
 */

import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, or, sql, desc, asc } from 'drizzle-orm';

export interface ModerationPolicy {
  id: string;
  domainId: string;
  name: string;
  description?: string;
  type: PolicyType;
  enabled: boolean;
  priority: number;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  exceptionRules?: ExceptionRule[];
  inheritFromParent: boolean;
  allowChildOverride: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type PolicyType =
  | 'content_filter'
  | 'word_filter'
  | 'spam_prevention'
  | 'rate_limit'
  | 'user_restriction'
  | 'media_policy'
  | 'auto_moderation'
  | 'custom';

export interface PolicyCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches' | 'in' | 'not_in';
  value: any;
  caseSensitive?: boolean;
}

export interface PolicyAction {
  type: PolicyActionType;
  params?: Record<string, any>;
  delay?: number;
  notify?: boolean;
}

export type PolicyActionType =
  | 'block'
  | 'flag'
  | 'quarantine'
  | 'shadow_ban'
  | 'rate_limit'
  | 'warn'
  | 'notify_moderator'
  | 'auto_remove'
  | 'require_review'
  | 'restrict_user'
  | 'custom_webhook';

export interface ExceptionRule {
  type: 'user' | 'role' | 'trust_level' | 'organization';
  values: string[];
  effect: 'bypass' | 'reduced';
}

export interface WordFilter {
  id: string;
  domainId: string;
  category: WordFilterCategory;
  words: string[];
  patterns?: string[];
  action: PolicyActionType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type WordFilterCategory =
  | 'profanity'
  | 'slurs'
  | 'hate_speech'
  | 'spam'
  | 'scam'
  | 'adult'
  | 'violence'
  | 'custom';

export interface ContentClassification {
  category: string;
  confidence: number;
  flags: string[];
  matchedPatterns?: string[];
  matchedWords?: string[];
  riskScore: number;
}

export interface ShadowBanConfig {
  userId: string;
  domainId: string;
  scope: 'full' | 'comments' | 'posts' | 'replies';
  visibleTo: 'self_only' | 'followers_only' | 'none';
  reason: string;
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface DomainModerationConfig {
  domainId: string;
  autoModerationEnabled: boolean;
  aiModerationEnabled: boolean;
  requireReviewForNewUsers: boolean;
  newUserReviewPeriodDays: number;
  trustLevelThresholds: {
    level: number;
    requiresVideos: number;
    requiresDays: number;
    requiresFollowers: number;
  }[];
  appealEnabled: boolean;
  appealCooldownHours: number;
  maxActiveAppeals: number;
  shadowBanEnabled: boolean;
  notifyOnFlag: boolean;
  notifyOnRemoval: boolean;
  escalationThresholds: {
    reportCount: number;
    action: PolicyActionType;
  }[];
}

export class DomainModerationService {
  private policyCache: Map<string, ModerationPolicy[]> = new Map();
  private wordFilterCache: Map<string, WordFilter[]> = new Map();
  private configCache: Map<string, DomainModerationConfig> = new Map();
  private shadowBanCache: Map<string, Map<string, ShadowBanConfig>> = new Map();

  /**
   * Get all policies for a domain (including inherited)
   */
  async getPolicies(domainId: string, includeInherited = true): Promise<ModerationPolicy[]> {
    // Check cache
    const cacheKey = `${domainId}:${includeInherited}`;
    if (this.policyCache.has(cacheKey)) {
      return this.policyCache.get(cacheKey)!;
    }

    let policies: ModerationPolicy[] = [];

    // Get domain's own policies
    const ownPolicies = await db.execute<any>(sql`
      SELECT * FROM moderation_policies
      WHERE domain_id = ${domainId}
      ORDER BY priority DESC, created_at ASC
    `);

    policies = (ownPolicies as any[]).map(row => this.rowToPolicy(row));

    // Get inherited policies if enabled
    if (includeInherited) {
      const parentDomains = await this.getParentDomains(domainId);

      for (const parentId of parentDomains) {
        const parentPolicies = await db.execute<any>(sql`
          SELECT * FROM moderation_policies
          WHERE domain_id = ${parentId}
            AND inherit_from_parent = 1
          ORDER BY priority DESC
        `);

        const inherited = (parentPolicies as any[])
          .map(row => this.rowToPolicy(row))
          .filter(p => {
            // Check if child domain has override
            if (p.allowChildOverride) {
              const override = policies.find(op => op.name === p.name);
              return !override;
            }
            return true;
          });

        policies = [...inherited, ...policies];
      }
    }

    // Sort by priority
    policies.sort((a, b) => b.priority - a.priority);

    // Cache result
    this.policyCache.set(cacheKey, policies);

    return policies;
  }

  /**
   * Create a new moderation policy
   */
  async createPolicy(policy: Omit<ModerationPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModerationPolicy> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.execute(sql`
      INSERT INTO moderation_policies (
        id, domain_id, name, description, type, enabled, priority,
        conditions, actions, exception_rules, inherit_from_parent,
        allow_child_override, metadata, created_by, created_at, updated_at
      ) VALUES (
        ${id}, ${policy.domainId}, ${policy.name}, ${policy.description || null},
        ${policy.type}, ${policy.enabled ? 1 : 0}, ${policy.priority},
        ${JSON.stringify(policy.conditions)}, ${JSON.stringify(policy.actions)},
        ${JSON.stringify(policy.exceptionRules || [])},
        ${policy.inheritFromParent ? 1 : 0}, ${policy.allowChildOverride ? 1 : 0},
        ${JSON.stringify(policy.metadata || {})}, ${policy.createdBy || null},
        ${now.toISOString()}, ${now.toISOString()}
      )
    `);

    // Invalidate cache
    this.invalidatePolicyCache(policy.domainId);

    return {
      ...policy,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update a policy
   */
  async updatePolicy(
    policyId: string,
    updates: Partial<Omit<ModerationPolicy, 'id' | 'domainId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ModerationPolicy | null> {
    const existing = await this.getPolicy(policyId);
    if (!existing) return null;

    const now = new Date();

    const updateFields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.enabled !== undefined) {
      updateFields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.priority !== undefined) {
      updateFields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.conditions !== undefined) {
      updateFields.push('conditions = ?');
      values.push(JSON.stringify(updates.conditions));
    }
    if (updates.actions !== undefined) {
      updateFields.push('actions = ?');
      values.push(JSON.stringify(updates.actions));
    }
    if (updates.exceptionRules !== undefined) {
      updateFields.push('exception_rules = ?');
      values.push(JSON.stringify(updates.exceptionRules));
    }

    await db.execute(sql`
      UPDATE moderation_policies
      SET ${sql.raw(updateFields.join(', '))}, updated_at = ${now.toISOString()}
      WHERE id = ${policyId}
    `);

    // Invalidate cache
    this.invalidatePolicyCache(existing.domainId);

    return this.getPolicy(policyId);
  }

  /**
   * Delete a policy
   */
  async deletePolicy(policyId: string): Promise<boolean> {
    const policy = await this.getPolicy(policyId);
    if (!policy) return false;

    await db.execute(sql`
      DELETE FROM moderation_policies WHERE id = ${policyId}
    `);

    this.invalidatePolicyCache(policy.domainId);
    return true;
  }

  /**
   * Get word filters for a domain
   */
  async getWordFilters(domainId: string): Promise<WordFilter[]> {
    if (this.wordFilterCache.has(domainId)) {
      return this.wordFilterCache.get(domainId)!;
    }

    const result = await db.execute<any>(sql`
      SELECT * FROM word_filters
      WHERE domain_id = ${domainId} AND enabled = 1
      ORDER BY severity DESC, category ASC
    `);

    const filters = (result as any[]).map(row => this.rowToWordFilter(row));
    this.wordFilterCache.set(domainId, filters);

    return filters;
  }

  /**
   * Create a word filter
   */
  async createWordFilter(filter: Omit<WordFilter, 'id' | 'createdAt' | 'updatedAt'>): Promise<WordFilter> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.execute(sql`
      INSERT INTO word_filters (
        id, domain_id, category, words, patterns, action, severity,
        enabled, case_sensitive, whole_word, created_at, updated_at
      ) VALUES (
        ${id}, ${filter.domainId}, ${filter.category},
        ${JSON.stringify(filter.words)}, ${JSON.stringify(filter.patterns || [])},
        ${filter.action}, ${filter.severity}, ${filter.enabled ? 1 : 0},
        ${filter.caseSensitive ? 1 : 0}, ${filter.wholeWord ? 1 : 0},
        ${now.toISOString()}, ${now.toISOString()}
      )
    `);

    this.wordFilterCache.delete(filter.domainId);

    return {
      ...filter,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Classify content against domain policies
   */
  async classifyContent(
    domainId: string,
    content: {
      text?: string;
      title?: string;
      description?: string;
      tags?: string[];
      mediaType?: string;
      userId?: string;
    }
  ): Promise<ContentClassification> {
    const classification: ContentClassification = {
      category: 'clean',
      confidence: 1.0,
      flags: [],
      matchedPatterns: [],
      matchedWords: [],
      riskScore: 0,
    };

    // Get word filters
    const wordFilters = await this.getWordFilters(domainId);

    // Combine all text content
    const allText = [
      content.text,
      content.title,
      content.description,
      ...(content.tags || []),
    ].filter(Boolean).join(' ');

    // Check word filters
    for (const filter of wordFilters) {
      if (!filter.enabled) continue;

      // Check exact words
      for (const word of filter.words) {
        const regex = filter.wholeWord
          ? new RegExp(`\\b${this.escapeRegex(word)}\\b`, filter.caseSensitive ? 'g' : 'gi')
          : new RegExp(this.escapeRegex(word), filter.caseSensitive ? 'g' : 'gi');

        if (regex.test(allText)) {
          classification.matchedWords!.push(word);
          classification.flags.push(`word_filter:${filter.category}`);

          const severityScore = {
            critical: 1.0,
            high: 0.8,
            medium: 0.5,
            low: 0.2,
          }[filter.severity];

          classification.riskScore = Math.max(classification.riskScore, severityScore);
        }
      }

      // Check patterns
      for (const pattern of filter.patterns || []) {
        try {
          const regex = new RegExp(pattern, filter.caseSensitive ? 'g' : 'gi');
          if (regex.test(allText)) {
            classification.matchedPatterns!.push(pattern);
            classification.flags.push(`pattern_match:${filter.category}`);

            const severityScore = {
              critical: 1.0,
              high: 0.8,
              medium: 0.5,
              low: 0.2,
            }[filter.severity];

            classification.riskScore = Math.max(classification.riskScore, severityScore);
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    // Determine category based on flags and score
    if (classification.riskScore >= 0.8) {
      classification.category = 'high_risk';
    } else if (classification.riskScore >= 0.5) {
      classification.category = 'medium_risk';
    } else if (classification.riskScore >= 0.2) {
      classification.category = 'low_risk';
    }

    classification.confidence = classification.flags.length > 0 ? 0.9 : 1.0;

    return classification;
  }

  /**
   * Apply policies to content
   */
  async applyPolicies(
    domainId: string,
    content: {
      id: string;
      type: 'video' | 'comment' | 'message';
      text?: string;
      userId: string;
      metadata?: Record<string, any>;
    }
  ): Promise<{
    allowed: boolean;
    actions: PolicyAction[];
    matchedPolicies: string[];
    reason?: string;
  }> {
    const policies = await this.getPolicies(domainId);
    const classification = await this.classifyContent(domainId, content);

    const result = {
      allowed: true,
      actions: [] as PolicyAction[],
      matchedPolicies: [] as string[],
      reason: undefined as string | undefined,
    };

    // Check user exemptions
    const userExemptions = await this.getUserExemptions(content.userId, domainId);

    for (const policy of policies) {
      if (!policy.enabled) continue;

      // Check exception rules
      let exempted = false;
      for (const exception of policy.exceptionRules || []) {
        if (exception.type === 'user' && exception.values.includes(content.userId)) {
          exempted = exception.effect === 'bypass';
          break;
        }
        if (exception.type === 'trust_level' && userExemptions.trustLevel) {
          if (exception.values.includes(userExemptions.trustLevel.toString())) {
            exempted = exception.effect === 'bypass';
            break;
          }
        }
      }

      if (exempted) continue;

      // Evaluate conditions
      let conditionsMet = true;
      for (const condition of policy.conditions) {
        if (!this.evaluateCondition(condition, { ...content, classification })) {
          conditionsMet = false;
          break;
        }
      }

      if (conditionsMet) {
        result.matchedPolicies.push(policy.id);

        for (const action of policy.actions) {
          result.actions.push(action);

          if (action.type === 'block' || action.type === 'auto_remove') {
            result.allowed = false;
            result.reason = `Blocked by policy: ${policy.name}`;
          }
        }
      }
    }

    return result;
  }

  /**
   * Shadow ban a user
   */
  async shadowBan(config: Omit<ShadowBanConfig, 'createdAt'>): Promise<void> {
    const now = new Date();

    await db.execute(sql`
      INSERT INTO shadow_bans (
        id, user_id, domain_id, scope, visible_to, reason,
        expires_at, created_by, created_at
      ) VALUES (
        ${crypto.randomUUID()}, ${config.userId}, ${config.domainId},
        ${config.scope}, ${config.visibleTo}, ${config.reason},
        ${config.expiresAt?.toISOString() || null}, ${config.createdBy},
        ${now.toISOString()}
      )
      ON CONFLICT (user_id, domain_id) DO UPDATE SET
        scope = ${config.scope},
        visible_to = ${config.visibleTo},
        reason = ${config.reason},
        expires_at = ${config.expiresAt?.toISOString() || null},
        created_by = ${config.createdBy},
        created_at = ${now.toISOString()}
    `);

    // Update cache
    if (!this.shadowBanCache.has(config.domainId)) {
      this.shadowBanCache.set(config.domainId, new Map());
    }
    this.shadowBanCache.get(config.domainId)!.set(config.userId, {
      ...config,
      createdAt: now,
    });

    // Log action
    await this.logModerationAction({
      type: 'shadow_ban',
      targetUserId: config.userId,
      domainId: config.domainId,
      actorId: config.createdBy,
      reason: config.reason,
      details: { scope: config.scope, visibleTo: config.visibleTo },
    });
  }

  /**
   * Check if user is shadow banned
   */
  async isShadowBanned(userId: string, domainId: string): Promise<ShadowBanConfig | null> {
    // Check cache first
    const domainCache = this.shadowBanCache.get(domainId);
    if (domainCache?.has(userId)) {
      const ban = domainCache.get(userId)!;
      if (!ban.expiresAt || ban.expiresAt > new Date()) {
        return ban;
      }
      // Expired, remove from cache
      domainCache.delete(userId);
    }

    const result = await db.execute<any>(sql`
      SELECT * FROM shadow_bans
      WHERE user_id = ${userId}
        AND domain_id = ${domainId}
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
    `);

    if (result.length === 0) return null;

    const row = result[0] as any;
    const ban: ShadowBanConfig = {
      userId: row.user_id,
      domainId: row.domain_id,
      scope: row.scope,
      visibleTo: row.visible_to,
      reason: row.reason,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    };

    // Cache result
    if (!this.shadowBanCache.has(domainId)) {
      this.shadowBanCache.set(domainId, new Map());
    }
    this.shadowBanCache.get(domainId)!.set(userId, ban);

    return ban;
  }

  /**
   * Remove shadow ban
   */
  async removeShadowBan(userId: string, domainId: string, removedBy: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM shadow_bans
      WHERE user_id = ${userId} AND domain_id = ${domainId}
    `);

    // Update cache
    this.shadowBanCache.get(domainId)?.delete(userId);

    // Log action
    await this.logModerationAction({
      type: 'shadow_ban_removed',
      targetUserId: userId,
      domainId,
      actorId: removedBy,
      reason: 'Shadow ban removed',
      details: {},
    });
  }

  /**
   * Get domain moderation configuration
   */
  async getConfig(domainId: string): Promise<DomainModerationConfig> {
    if (this.configCache.has(domainId)) {
      return this.configCache.get(domainId)!;
    }

    const result = await db.execute<any>(sql`
      SELECT * FROM domain_moderation_config WHERE domain_id = ${domainId}
    `);

    if (result.length === 0) {
      // Return defaults
      const defaults = this.getDefaultConfig(domainId);
      this.configCache.set(domainId, defaults);
      return defaults;
    }

    const row = result[0] as any;
    const config: DomainModerationConfig = {
      domainId: row.domain_id,
      autoModerationEnabled: Boolean(row.auto_moderation_enabled),
      aiModerationEnabled: Boolean(row.ai_moderation_enabled),
      requireReviewForNewUsers: Boolean(row.require_review_new_users),
      newUserReviewPeriodDays: row.new_user_review_days || 7,
      trustLevelThresholds: row.trust_level_thresholds || [],
      appealEnabled: Boolean(row.appeal_enabled),
      appealCooldownHours: row.appeal_cooldown_hours || 72,
      maxActiveAppeals: row.max_active_appeals || 3,
      shadowBanEnabled: Boolean(row.shadow_ban_enabled),
      notifyOnFlag: Boolean(row.notify_on_flag),
      notifyOnRemoval: Boolean(row.notify_on_removal),
      escalationThresholds: row.escalation_thresholds || [],
    };

    this.configCache.set(domainId, config);
    return config;
  }

  /**
   * Update domain moderation configuration
   */
  async updateConfig(
    domainId: string,
    updates: Partial<Omit<DomainModerationConfig, 'domainId'>>
  ): Promise<DomainModerationConfig> {
    const existing = await this.getConfig(domainId);
    const merged = { ...existing, ...updates };

    await db.execute(sql`
      INSERT INTO domain_moderation_config (
        domain_id, auto_moderation_enabled, ai_moderation_enabled,
        require_review_new_users, new_user_review_days, trust_level_thresholds,
        appeal_enabled, appeal_cooldown_hours, max_active_appeals,
        shadow_ban_enabled, notify_on_flag, notify_on_removal,
        escalation_thresholds, updated_at
      ) VALUES (
        ${domainId}, ${merged.autoModerationEnabled ? 1 : 0},
        ${merged.aiModerationEnabled ? 1 : 0},
        ${merged.requireReviewForNewUsers ? 1 : 0},
        ${merged.newUserReviewPeriodDays},
        ${JSON.stringify(merged.trustLevelThresholds)},
        ${merged.appealEnabled ? 1 : 0}, ${merged.appealCooldownHours},
        ${merged.maxActiveAppeals}, ${merged.shadowBanEnabled ? 1 : 0},
        ${merged.notifyOnFlag ? 1 : 0}, ${merged.notifyOnRemoval ? 1 : 0},
        ${JSON.stringify(merged.escalationThresholds)},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (domain_id) DO UPDATE SET
        auto_moderation_enabled = ${merged.autoModerationEnabled ? 1 : 0},
        ai_moderation_enabled = ${merged.aiModerationEnabled ? 1 : 0},
        require_review_new_users = ${merged.requireReviewForNewUsers ? 1 : 0},
        new_user_review_days = ${merged.newUserReviewPeriodDays},
        trust_level_thresholds = ${JSON.stringify(merged.trustLevelThresholds)},
        appeal_enabled = ${merged.appealEnabled ? 1 : 0},
        appeal_cooldown_hours = ${merged.appealCooldownHours},
        max_active_appeals = ${merged.maxActiveAppeals},
        shadow_ban_enabled = ${merged.shadowBanEnabled ? 1 : 0},
        notify_on_flag = ${merged.notifyOnFlag ? 1 : 0},
        notify_on_removal = ${merged.notifyOnRemoval ? 1 : 0},
        escalation_thresholds = ${JSON.stringify(merged.escalationThresholds)},
        updated_at = CURRENT_TIMESTAMP
    `);

    this.configCache.delete(domainId);
    return this.getConfig(domainId);
  }

  // Private helpers

  private async getPolicy(policyId: string): Promise<ModerationPolicy | null> {
    const result = await db.execute<any>(sql`
      SELECT * FROM moderation_policies WHERE id = ${policyId}
    `);

    if (result.length === 0) return null;
    return this.rowToPolicy(result[0] as any);
  }

  private async getParentDomains(domainId: string): Promise<string[]> {
    const result = await db.execute<any>(sql`
      WITH RECURSIVE domain_hierarchy AS (
        SELECT id, parent_domain_id, 0 as level
        FROM domains
        WHERE id = ${domainId}

        UNION ALL

        SELECT d.id, d.parent_domain_id, dh.level + 1
        FROM domains d
        JOIN domain_hierarchy dh ON d.id = dh.parent_domain_id
        WHERE dh.level < 10
      )
      SELECT id FROM domain_hierarchy
      WHERE id != ${domainId}
      ORDER BY level ASC
    `);

    return (result as any[]).map(row => row.id);
  }

  private async getUserExemptions(
    userId: string,
    domainId: string
  ): Promise<{ trustLevel?: number; roles?: string[] }> {
    // Get user roles for this domain
    const userRoles = await db
      .select({
        roleId: schema.domainUserRoles.roleId,
      })
      .from(schema.domainUserRoles)
      .innerJoin(schema.domainUsers, eq(schema.domainUserRoles.domainUserId, schema.domainUsers.id))
      .where(and(
        eq(schema.domainUsers.userDid, userId),
        eq(schema.domainUsers.domainId, domainId)
      ));

    // Check if user is in trusted users table
    const trustedUser = await db
      .select()
      .from(schema.trustedUsers)
      .where(eq(schema.trustedUsers.userDid, userId))
      .limit(1);

    // Map trust level string to numeric value
    const trustLevelMap: Record<string, number> = {
      'basic': 1,
      'verified': 2,
      'creator': 3,
      'partner': 4,
    };

    return {
      trustLevel: trustedUser[0] ? trustLevelMap[trustedUser[0].trustLevel] || 1 : 1,
      roles: userRoles.map(r => r.roleId),
    };
  }

  private evaluateCondition(
    condition: PolicyCondition,
    context: Record<string, any>
  ): boolean {
    const value = this.getNestedValue(context, condition.field);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'eq':
        return value === targetValue;
      case 'ne':
        return value !== targetValue;
      case 'gt':
        return value > targetValue;
      case 'gte':
        return value >= targetValue;
      case 'lt':
        return value < targetValue;
      case 'lte':
        return value <= targetValue;
      case 'contains':
        if (typeof value === 'string') {
          return condition.caseSensitive
            ? value.includes(targetValue)
            : value.toLowerCase().includes(targetValue.toLowerCase());
        }
        return false;
      case 'matches':
        try {
          const regex = new RegExp(targetValue, condition.caseSensitive ? '' : 'i');
          return regex.test(String(value));
        } catch {
          return false;
        }
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(value);
      case 'not_in':
        return Array.isArray(targetValue) && !targetValue.includes(value);
      default:
        return false;
    }
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private invalidatePolicyCache(domainId: string): void {
    for (const key of this.policyCache.keys()) {
      if (key.startsWith(domainId)) {
        this.policyCache.delete(key);
      }
    }
  }

  private getDefaultConfig(domainId: string): DomainModerationConfig {
    return {
      domainId,
      autoModerationEnabled: true,
      aiModerationEnabled: true,
      requireReviewForNewUsers: false,
      newUserReviewPeriodDays: 7,
      trustLevelThresholds: [
        { level: 1, requiresVideos: 0, requiresDays: 0, requiresFollowers: 0 },
        { level: 2, requiresVideos: 3, requiresDays: 7, requiresFollowers: 10 },
        { level: 3, requiresVideos: 10, requiresDays: 30, requiresFollowers: 50 },
        { level: 4, requiresVideos: 50, requiresDays: 90, requiresFollowers: 500 },
      ],
      appealEnabled: true,
      appealCooldownHours: 72,
      maxActiveAppeals: 3,
      shadowBanEnabled: true,
      notifyOnFlag: true,
      notifyOnRemoval: true,
      escalationThresholds: [
        { reportCount: 3, action: 'flag' },
        { reportCount: 5, action: 'require_review' },
        { reportCount: 10, action: 'auto_remove' },
      ],
    };
  }

  private async logModerationAction(action: {
    type: string;
    targetUserId: string;
    domainId: string;
    actorId: string;
    reason: string;
    details: Record<string, any>;
  }): Promise<void> {
    await db.execute(sql`
      INSERT INTO moderation_audit_log (
        id, action_type, target_user_id, domain_id, actor_id,
        reason, details, created_at
      ) VALUES (
        ${crypto.randomUUID()}, ${action.type}, ${action.targetUserId},
        ${action.domainId}, ${action.actorId}, ${action.reason},
        ${JSON.stringify(action.details)}, CURRENT_TIMESTAMP
      )
    `);
  }

  private rowToPolicy(row: any): ModerationPolicy {
    return {
      id: row.id,
      domainId: row.domain_id,
      name: row.name,
      description: row.description,
      type: row.type,
      enabled: Boolean(row.enabled),
      priority: row.priority,
      conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions,
      actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions,
      exceptionRules: row.exception_rules
        ? (typeof row.exception_rules === 'string' ? JSON.parse(row.exception_rules) : row.exception_rules)
        : [],
      inheritFromParent: Boolean(row.inherit_from_parent),
      allowChildOverride: Boolean(row.allow_child_override),
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
    };
  }

  private rowToWordFilter(row: any): WordFilter {
    return {
      id: row.id,
      domainId: row.domain_id,
      category: row.category,
      words: typeof row.words === 'string' ? JSON.parse(row.words) : row.words,
      patterns: row.patterns
        ? (typeof row.patterns === 'string' ? JSON.parse(row.patterns) : row.patterns)
        : [],
      action: row.action,
      severity: row.severity,
      enabled: Boolean(row.enabled),
      caseSensitive: Boolean(row.case_sensitive),
      wholeWord: Boolean(row.whole_word),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export function createDomainModerationService(): DomainModerationService {
  return new DomainModerationService();
}
