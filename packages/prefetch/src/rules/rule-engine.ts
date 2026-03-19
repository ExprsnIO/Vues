import { Redis } from 'ioredis';
import { RuleCondition, EvaluationContext, evaluateCondition } from './conditions.js';
import { RuleAction } from './actions.js';

const RULES_KEY = 'prefetch:rules';

export interface PrefetchRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  logic: 'and' | 'or';
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: string;
  updatedAt: string;
}

export class RuleEngine {
  constructor(private redis: Redis) {}

  async listRules(): Promise<PrefetchRule[]> {
    const raw = await this.redis.get(RULES_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  async createRule(rule: Omit<PrefetchRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<PrefetchRule> {
    const rules = await this.listRules();
    const newRule: PrefetchRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    rules.push(newRule);
    await this.redis.set(RULES_KEY, JSON.stringify(rules));
    return newRule;
  }

  async updateRule(id: string, updates: Partial<Omit<PrefetchRule, 'id' | 'createdAt'>>): Promise<PrefetchRule | null> {
    const rules = await this.listRules();
    const index = rules.findIndex(r => r.id === id);
    if (index === -1) return null;
    rules[index] = { ...rules[index], ...updates, updatedAt: new Date().toISOString() };
    await this.redis.set(RULES_KEY, JSON.stringify(rules));
    return rules[index];
  }

  async deleteRule(id: string): Promise<boolean> {
    const rules = await this.listRules();
    const filtered = rules.filter(r => r.id !== id);
    if (filtered.length === rules.length) return false;
    await this.redis.set(RULES_KEY, JSON.stringify(filtered));
    return true;
  }

  async reorderRules(orderedIds: string[]): Promise<PrefetchRule[]> {
    const rules = await this.listRules();
    const ruleMap = new Map(rules.map(r => [r.id, r]));
    const reordered: PrefetchRule[] = [];
    for (const id of orderedIds) {
      const rule = ruleMap.get(id);
      if (rule) {
        reordered.push({ ...rule, priority: reordered.length });
      }
    }
    // Append any rules not in the ordered list
    for (const rule of rules) {
      if (!orderedIds.includes(rule.id)) {
        reordered.push({ ...rule, priority: reordered.length });
      }
    }
    await this.redis.set(RULES_KEY, JSON.stringify(reordered));
    return reordered;
  }

  evaluate(rules: PrefetchRule[], context: EvaluationContext): PrefetchRule | null {
    const enabledRules = rules
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of enabledRules) {
      const matches = rule.logic === 'and'
        ? rule.conditions.every(c => evaluateCondition(c, context))
        : rule.conditions.some(c => evaluateCondition(c, context));
      if (matches) return rule;
    }
    return null;
  }
}

export function createRuleEngine(redis: Redis): RuleEngine {
  return new RuleEngine(redis);
}
