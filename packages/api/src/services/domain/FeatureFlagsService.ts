/**
 * Feature Flags Service
 * Per-domain feature toggles and gradual rollout management
 */

import { nanoid } from 'nanoid';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

/**
 * Feature flag definition
 */
export interface FeatureFlag {
  key: string;
  name: string;
  description?: string;
  type: 'boolean' | 'percentage' | 'variant';
  defaultValue: boolean | number | string;
  category?: string;
  tags?: string[];
}

/**
 * Domain feature override
 */
export interface DomainFeatureOverride {
  featureKey: string;
  enabled: boolean;
  value?: string | number;
  // Percentage rollout (0-100)
  rolloutPercentage?: number;
  // A/B test variants
  variants?: Array<{
    name: string;
    weight: number;
    value: unknown;
  }>;
  // User/group targeting
  enabledForUsers?: string[];
  enabledForGroups?: string[];
  disabledForUsers?: string[];
  // Schedule
  enabledAt?: Date;
  disabledAt?: Date;
  // Metadata
  updatedBy?: string;
  updatedAt?: Date;
}

/**
 * Feature evaluation result
 */
export interface FeatureEvaluation {
  featureKey: string;
  enabled: boolean;
  value?: unknown;
  variant?: string;
  reason: 'default' | 'domain_override' | 'user_override' | 'rollout' | 'schedule';
}

// Built-in feature definitions
const BUILT_IN_FEATURES: FeatureFlag[] = [
  // Video features
  {
    key: 'video_hosting',
    name: 'Video Hosting',
    description: 'Enable video uploads and hosting',
    type: 'boolean',
    defaultValue: true,
    category: 'core',
  },
  {
    key: 'live_streaming',
    name: 'Live Streaming',
    description: 'Enable live video broadcasts',
    type: 'boolean',
    defaultValue: true,
    category: 'core',
  },
  {
    key: 'video_downloads',
    name: 'Video Downloads',
    description: 'Allow users to download videos',
    type: 'boolean',
    defaultValue: false,
    category: 'video',
  },
  {
    key: 'video_editor',
    name: 'Video Editor',
    description: 'In-browser video editing tools',
    type: 'boolean',
    defaultValue: true,
    category: 'video',
  },
  {
    key: 'duets',
    name: 'Duets',
    description: 'Allow duet video creation',
    type: 'boolean',
    defaultValue: true,
    category: 'video',
  },
  {
    key: 'stitches',
    name: 'Stitches',
    description: 'Allow stitch video creation',
    type: 'boolean',
    defaultValue: true,
    category: 'video',
  },
  // Social features
  {
    key: 'messaging',
    name: 'Direct Messaging',
    description: 'Enable direct messages between users',
    type: 'boolean',
    defaultValue: true,
    category: 'social',
  },
  {
    key: 'comments',
    name: 'Comments',
    description: 'Enable video comments',
    type: 'boolean',
    defaultValue: true,
    category: 'social',
  },
  {
    key: 'reactions',
    name: 'Reactions',
    description: 'Enable video reactions',
    type: 'boolean',
    defaultValue: true,
    category: 'social',
  },
  {
    key: 'challenges',
    name: 'Challenges',
    description: 'Enable hashtag challenges',
    type: 'boolean',
    defaultValue: true,
    category: 'social',
  },
  {
    key: 'watch_parties',
    name: 'Watch Parties',
    description: 'Enable synchronized video watching',
    type: 'boolean',
    defaultValue: true,
    category: 'social',
  },
  // Feed features
  {
    key: 'feed_personalization',
    name: 'Personalized Feed',
    description: 'Enable AI-powered feed recommendations',
    type: 'boolean',
    defaultValue: true,
    category: 'feed',
  },
  {
    key: 'trending_feed',
    name: 'Trending Feed',
    description: 'Show trending videos',
    type: 'boolean',
    defaultValue: true,
    category: 'feed',
  },
  {
    key: 'hashtag_feeds',
    name: 'Hashtag Feeds',
    description: 'Enable hashtag-based feeds',
    type: 'boolean',
    defaultValue: true,
    category: 'feed',
  },
  // Enterprise features
  {
    key: 'custom_branding',
    name: 'Custom Branding',
    description: 'Enable custom logos, colors, and themes',
    type: 'boolean',
    defaultValue: false,
    category: 'enterprise',
  },
  {
    key: 'api_access',
    name: 'API Access',
    description: 'Enable API access for integrations',
    type: 'boolean',
    defaultValue: false,
    category: 'enterprise',
  },
  {
    key: 'analytics',
    name: 'Analytics Dashboard',
    description: 'Enable analytics and insights',
    type: 'boolean',
    defaultValue: true,
    category: 'enterprise',
  },
  {
    key: 'sso',
    name: 'Single Sign-On',
    description: 'Enable SSO integration',
    type: 'boolean',
    defaultValue: false,
    category: 'enterprise',
  },
  {
    key: 'webhooks',
    name: 'Webhooks',
    description: 'Enable webhook notifications',
    type: 'boolean',
    defaultValue: false,
    category: 'enterprise',
  },
  // Moderation features
  {
    key: 'ai_moderation',
    name: 'AI Moderation',
    description: 'Enable AI-powered content moderation',
    type: 'boolean',
    defaultValue: true,
    category: 'moderation',
  },
  {
    key: 'user_reports',
    name: 'User Reports',
    description: 'Allow users to report content',
    type: 'boolean',
    defaultValue: true,
    category: 'moderation',
  },
  {
    key: 'content_warnings',
    name: 'Content Warnings',
    description: 'Show content warnings on flagged videos',
    type: 'boolean',
    defaultValue: true,
    category: 'moderation',
  },
  // Beta features
  {
    key: 'beta_tipping',
    name: 'Tipping (Beta)',
    description: 'Enable creator tipping',
    type: 'boolean',
    defaultValue: false,
    category: 'beta',
    tags: ['beta'],
  },
  {
    key: 'beta_monetization',
    name: 'Monetization (Beta)',
    description: 'Enable creator monetization',
    type: 'boolean',
    defaultValue: false,
    category: 'beta',
    tags: ['beta'],
  },
];

export class FeatureFlagsService {
  private db: PostgresJsDatabase<typeof schema>;
  private featureCache: Map<string, Map<string, DomainFeatureOverride>> = new Map();
  private cacheTtlMs = 60000; // 1 minute
  private cacheTimestamps: Map<string, number> = new Map();

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Get all feature definitions
   */
  getFeatureDefinitions(): FeatureFlag[] {
    return BUILT_IN_FEATURES;
  }

  /**
   * Get features by category
   */
  getFeaturesByCategory(category: string): FeatureFlag[] {
    return BUILT_IN_FEATURES.filter((f) => f.category === category);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set(BUILT_IN_FEATURES.map((f) => f.category).filter(Boolean));
    return Array.from(categories) as string[];
  }

  /**
   * Get feature overrides for a domain
   */
  async getDomainFeatures(domainId: string): Promise<Map<string, DomainFeatureOverride>> {
    // Check cache
    const cached = this.featureCache.get(domainId);
    const timestamp = this.cacheTimestamps.get(domainId);
    if (cached && timestamp && Date.now() - timestamp < this.cacheTtlMs) {
      return cached;
    }

    // Get domain features
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    const features = new Map<string, DomainFeatureOverride>();

    if (domain && domain.features) {
      const featureOverrides = domain.features as unknown as Record<string, DomainFeatureOverride>;

      for (const [key, override] of Object.entries(featureOverrides)) {
        features.set(key, override);
      }
    }

    // Update cache
    this.featureCache.set(domainId, features);
    this.cacheTimestamps.set(domainId, Date.now());

    return features;
  }

  /**
   * Evaluate a feature for a domain/user
   */
  async evaluateFeature(
    featureKey: string,
    domainId: string,
    userId?: string
  ): Promise<FeatureEvaluation> {
    const definition = BUILT_IN_FEATURES.find((f) => f.key === featureKey);
    if (!definition) {
      return {
        featureKey,
        enabled: false,
        reason: 'default',
      };
    }

    // Get domain overrides
    const overrides = await this.getDomainFeatures(domainId);
    const override = overrides.get(featureKey);

    // No override - use default
    if (!override) {
      return {
        featureKey,
        enabled: definition.defaultValue as boolean,
        value: definition.defaultValue,
        reason: 'default',
      };
    }

    // Check schedule
    const now = new Date();
    if (override.enabledAt && now < override.enabledAt) {
      return {
        featureKey,
        enabled: false,
        reason: 'schedule',
      };
    }
    if (override.disabledAt && now > override.disabledAt) {
      return {
        featureKey,
        enabled: false,
        reason: 'schedule',
      };
    }

    // Check user-specific overrides
    if (userId) {
      if (override.disabledForUsers?.includes(userId)) {
        return {
          featureKey,
          enabled: false,
          reason: 'user_override',
        };
      }
      if (override.enabledForUsers?.includes(userId)) {
        return {
          featureKey,
          enabled: true,
          value: override.value,
          reason: 'user_override',
        };
      }
    }

    // Check percentage rollout
    if (override.rolloutPercentage !== undefined && override.rolloutPercentage < 100) {
      if (userId) {
        const hash = this.hashUserForRollout(userId, featureKey);
        const inRollout = hash < override.rolloutPercentage;
        return {
          featureKey,
          enabled: inRollout && override.enabled,
          value: inRollout ? override.value : undefined,
          reason: 'rollout',
        };
      }
      // No user ID - use override.enabled directly
    }

    // Check variants (A/B testing)
    if (override.variants && override.variants.length > 0 && userId) {
      const variant = this.selectVariant(userId, featureKey, override.variants);
      return {
        featureKey,
        enabled: override.enabled,
        value: variant.value,
        variant: variant.name,
        reason: 'domain_override',
      };
    }

    // Use domain override
    return {
      featureKey,
      enabled: override.enabled,
      value: override.value,
      reason: 'domain_override',
    };
  }

  /**
   * Evaluate all features for a domain
   */
  async evaluateAllFeatures(
    domainId: string,
    userId?: string
  ): Promise<Map<string, FeatureEvaluation>> {
    const results = new Map<string, FeatureEvaluation>();

    for (const feature of BUILT_IN_FEATURES) {
      const evaluation = await this.evaluateFeature(feature.key, domainId, userId);
      results.set(feature.key, evaluation);
    }

    return results;
  }

  /**
   * Set feature override for a domain
   */
  async setFeatureOverride(
    domainId: string,
    featureKey: string,
    override: Partial<DomainFeatureOverride>,
    updatedBy?: string
  ): Promise<void> {
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    const features = (domain.features as unknown as Record<string, DomainFeatureOverride>) || {};

    // Merge with existing override
    const existing = features[featureKey] || { featureKey, enabled: false };
    features[featureKey] = {
      ...existing,
      ...override,
      featureKey,
      updatedBy,
      updatedAt: new Date(),
    };

    await this.db
      .update(schema.domains)
      .set({
        features: features as unknown as schema.DomainFeatures,
        updatedAt: new Date(),
      })
      .where(eq(schema.domains.id, domainId));

    // Invalidate cache
    this.featureCache.delete(domainId);
    this.cacheTimestamps.delete(domainId);
  }

  /**
   * Remove feature override for a domain
   */
  async removeFeatureOverride(domainId: string, featureKey: string): Promise<void> {
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    const features = (domain.features as unknown as Record<string, DomainFeatureOverride>) || {};

    delete features[featureKey];

    await this.db
      .update(schema.domains)
      .set({
        features: features as unknown as schema.DomainFeatures,
        updatedAt: new Date(),
      })
      .where(eq(schema.domains.id, domainId));

    // Invalidate cache
    this.featureCache.delete(domainId);
    this.cacheTimestamps.delete(domainId);
  }

  /**
   * Bulk update feature overrides
   */
  async bulkSetFeatureOverrides(
    domainId: string,
    overrides: Array<{ featureKey: string; enabled: boolean }>,
    updatedBy?: string
  ): Promise<void> {
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    const features = (domain.features as unknown as Record<string, DomainFeatureOverride>) || {};

    for (const override of overrides) {
      const existing = features[override.featureKey] || { featureKey: override.featureKey };
      features[override.featureKey] = {
        ...existing,
        featureKey: override.featureKey,
        enabled: override.enabled,
        updatedBy,
        updatedAt: new Date(),
      };
    }

    await this.db
      .update(schema.domains)
      .set({
        features: features as unknown as schema.DomainFeatures,
        updatedAt: new Date(),
      })
      .where(eq(schema.domains.id, domainId));

    // Invalidate cache
    this.featureCache.delete(domainId);
    this.cacheTimestamps.delete(domainId);
  }

  /**
   * Hash user ID for consistent rollout assignment
   */
  private hashUserForRollout(userId: string, featureKey: string): number {
    const str = `${userId}:${featureKey}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100;
  }

  /**
   * Select variant based on weights
   */
  private selectVariant(
    userId: string,
    featureKey: string,
    variants: Array<{ name: string; weight: number; value: unknown }>
  ): { name: string; value: unknown } {
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    const hash = this.hashUserForRollout(userId, featureKey + ':variant');
    const target = (hash / 100) * totalWeight;

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight;
      if (target < cumulative) {
        return { name: variant.name, value: variant.value };
      }
    }

    // Fallback to first variant
    return { name: variants[0]!.name, value: variants[0]!.value };
  }

  /**
   * Clear cache for a domain
   */
  clearCache(domainId?: string): void {
    if (domainId) {
      this.featureCache.delete(domainId);
      this.cacheTimestamps.delete(domainId);
    } else {
      this.featureCache.clear();
      this.cacheTimestamps.clear();
    }
  }
}

/**
 * Create FeatureFlagsService instance
 */
export function createFeatureFlagsService(
  db: PostgresJsDatabase<typeof schema>
): FeatureFlagsService {
  return new FeatureFlagsService(db);
}
