import { Redis } from 'ioredis';
import type { PrefetchConfig } from './schema.js';

const DOMAIN_CONFIG_PREFIX = 'prefetch:config:domain:';
const USER_DOMAIN_PREFIX = 'user-domain:';
const WORKER_DOMAIN_CONFIG_PREFIX = 'workers:config:domain:';

export class DomainConfigManager {
  constructor(private redis: Redis) {}

  /**
   * Return the domainId for a given user DID, or null if no mapping is cached.
   */
  async getUserDomain(userId: string): Promise<string | null> {
    return this.redis.get(`${USER_DOMAIN_PREFIX}${userId}`);
  }

  /**
   * Get the effective PrefetchConfig for a user by merging the global config
   * with any domain-scoped overrides stored by the admin API.
   *
   * Keys read:
   *   user-domain:{did}              → domainId
   *   prefetch:config:domain:{id}    → partial PrefetchConfig overrides (JSON)
   */
  async getEffectiveConfig(userId: string, globalConfig: PrefetchConfig): Promise<PrefetchConfig> {
    const domainId = await this.getUserDomain(userId);
    if (!domainId) return globalConfig;

    const raw = await this.redis.get(`${DOMAIN_CONFIG_PREFIX}${domainId}`);
    if (!raw) return globalConfig;

    try {
      const overrides = JSON.parse(raw);
      return this.mergeConfig(globalConfig, overrides) as PrefetchConfig;
    } catch {
      return globalConfig;
    }
  }

  /**
   * Check whether a given BullMQ queue name is enabled for a domain.
   * Returns true when there is no domain config (safe default).
   *
   * Key read: workers:config:domain:{domainId}
   */
  async isQueueEnabled(domainId: string, queueName: string): Promise<boolean> {
    const raw = await this.redis.get(`${WORKER_DOMAIN_CONFIG_PREFIX}${domainId}`);
    if (!raw) return true;

    try {
      const config = JSON.parse(raw) as { enabledQueues?: string[] };
      if (!config.enabledQueues) return true;
      return config.enabledQueues.includes(queueName);
    } catch {
      return true;
    }
  }

  /**
   * Return the domain-specific rate limit, or null when not configured.
   *
   * Key read: workers:config:domain:{domainId}
   */
  async getDomainRateLimit(domainId: string): Promise<number | null> {
    const raw = await this.redis.get(`${WORKER_DOMAIN_CONFIG_PREFIX}${domainId}`);
    if (!raw) return null;

    try {
      const config = JSON.parse(raw) as { rateLimit?: number };
      return config.rateLimit ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Deep-merge `overrides` on top of `base`, skipping undefined values and
   * treating arrays as scalar replacements (not concatenated).
   */
  private mergeConfig(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
    const result = { ...base };
    for (const key of Object.keys(overrides)) {
      const val = overrides[key];
      if (val !== undefined && val !== null && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = this.mergeConfig(
          (base[key] as Record<string, unknown>) ?? {},
          val as Record<string, unknown>,
        );
      } else if (val !== undefined) {
        result[key] = val;
      }
    }
    return result;
  }
}
