import { Redis } from 'ioredis';

const ALERTS_KEY = 'prefetch:alerts';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertChannel = 'dashboard' | 'email' | 'slack' | 'webhook';
export type AlertCondition = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface PrefetchAlert {
  id: string;
  name: string;
  description?: string;
  metric: string;
  condition: AlertCondition;
  threshold: number;
  severity: AlertSeverity;
  channels: AlertChannel[];
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggered?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export class AlertManager {
  constructor(private redis: Redis) {}

  async listAlerts(): Promise<PrefetchAlert[]> {
    const raw = await this.redis.get(ALERTS_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  async createAlert(alert: Omit<PrefetchAlert, 'id' | 'triggerCount' | 'createdAt' | 'updatedAt'>): Promise<PrefetchAlert> {
    const alerts = await this.listAlerts();
    const newAlert: PrefetchAlert = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    alerts.push(newAlert);
    await this.redis.set(ALERTS_KEY, JSON.stringify(alerts));
    return newAlert;
  }

  async updateAlert(id: string, updates: Partial<Omit<PrefetchAlert, 'id' | 'createdAt'>>): Promise<PrefetchAlert | null> {
    const alerts = await this.listAlerts();
    const index = alerts.findIndex(a => a.id === id);
    if (index === -1) return null;
    alerts[index] = { ...alerts[index], ...updates, updatedAt: new Date().toISOString() };
    await this.redis.set(ALERTS_KEY, JSON.stringify(alerts));
    return alerts[index];
  }

  async deleteAlert(id: string): Promise<boolean> {
    const alerts = await this.listAlerts();
    const filtered = alerts.filter(a => a.id !== id);
    if (filtered.length === alerts.length) return false;
    await this.redis.set(ALERTS_KEY, JSON.stringify(filtered));
    return true;
  }

  async evaluateAlerts(metrics: Record<string, number>): Promise<PrefetchAlert[]> {
    const alerts = await this.listAlerts();
    const triggered: PrefetchAlert[] = [];

    for (const alert of alerts) {
      if (!alert.enabled) continue;

      const metricValue = metrics[alert.metric];
      if (metricValue === undefined) continue;

      // Check cooldown
      if (alert.lastTriggered) {
        const lastTriggered = new Date(alert.lastTriggered).getTime();
        const cooldownMs = alert.cooldownMinutes * 60 * 1000;
        if (Date.now() - lastTriggered < cooldownMs) continue;
      }

      let shouldTrigger = false;
      switch (alert.condition) {
        case 'gt': shouldTrigger = metricValue > alert.threshold; break;
        case 'gte': shouldTrigger = metricValue >= alert.threshold; break;
        case 'lt': shouldTrigger = metricValue < alert.threshold; break;
        case 'lte': shouldTrigger = metricValue <= alert.threshold; break;
        case 'eq': shouldTrigger = metricValue === alert.threshold; break;
      }

      if (shouldTrigger) {
        alert.lastTriggered = new Date().toISOString();
        alert.triggerCount++;
        triggered.push(alert);
      }
    }

    if (triggered.length > 0) {
      const allAlerts = await this.listAlerts();
      for (const t of triggered) {
        const idx = allAlerts.findIndex(a => a.id === t.id);
        if (idx !== -1) allAlerts[idx] = t;
      }
      await this.redis.set(ALERTS_KEY, JSON.stringify(allAlerts));
    }

    return triggered;
  }
}

export function createAlertManager(redis: Redis): AlertManager {
  return new AlertManager(redis);
}
