import { Redis } from 'ioredis';
import { prefetchConfigSchema, PrefetchConfig, getDefaultConfig } from './schema.js';

const CONFIG_KEY = 'prefetch:config';

export class ConfigManager {
  constructor(private redis: Redis) {}

  async getConfig(): Promise<PrefetchConfig> {
    const raw = await this.redis.get(CONFIG_KEY);
    if (!raw) return getDefaultConfig();

    try {
      const parsed = JSON.parse(raw);
      const result = prefetchConfigSchema.safeParse(parsed);
      if (result.success) return result.data;
      console.warn('Invalid prefetch config in Redis, using defaults:', result.error.message);
      return getDefaultConfig();
    } catch {
      return getDefaultConfig();
    }
  }

  async updateConfig(partial: Partial<PrefetchConfig>): Promise<PrefetchConfig> {
    const current = await this.getConfig();
    const merged = this.deepMerge(current, partial);
    const validated = prefetchConfigSchema.parse(merged);
    await this.redis.set(CONFIG_KEY, JSON.stringify(validated));
    return validated;
  }

  async resetConfig(): Promise<PrefetchConfig> {
    const defaults = getDefaultConfig();
    await this.redis.set(CONFIG_KEY, JSON.stringify(defaults));
    return defaults;
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = this.deepMerge(target[key] || {}, source[key]);
      } else if (source[key] !== undefined) {
        output[key] = source[key];
      }
    }
    return output;
  }
}

export function createConfigManager(redis: Redis): ConfigManager {
  return new ConfigManager(redis);
}
