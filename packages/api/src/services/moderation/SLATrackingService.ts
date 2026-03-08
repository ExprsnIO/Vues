/**
 * SLA Tracking Service
 * Monitors moderator response times, tracks SLA compliance, and sends alerts
 */

import { db } from '../../db/index.js';
import { eq, and, lt, gt, isNull, sql, desc } from 'drizzle-orm';

// SLA configuration by priority
export interface SLAConfig {
  priority: 'critical' | 'high' | 'medium' | 'low';
  firstResponseMinutes: number;
  resolutionMinutes: number;
  escalationMinutes: number;
  warningThresholdPercent: number;
}

// Default SLA configurations
export const DEFAULT_SLA_CONFIGS: SLAConfig[] = [
  {
    priority: 'critical',
    firstResponseMinutes: 15,
    resolutionMinutes: 60,
    escalationMinutes: 30,
    warningThresholdPercent: 75,
  },
  {
    priority: 'high',
    firstResponseMinutes: 60,
    resolutionMinutes: 240,
    escalationMinutes: 120,
    warningThresholdPercent: 80,
  },
  {
    priority: 'medium',
    firstResponseMinutes: 240,
    resolutionMinutes: 1440,
    escalationMinutes: 480,
    warningThresholdPercent: 85,
  },
  {
    priority: 'low',
    firstResponseMinutes: 1440,
    resolutionMinutes: 4320,
    escalationMinutes: 2880,
    warningThresholdPercent: 90,
  },
];

export interface SLAStatus {
  itemId: string;
  itemType: 'report' | 'appeal' | 'review';
  priority: string;
  createdAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  assignedTo: string | null;
  slaConfig: SLAConfig;
  firstResponseDue: Date;
  resolutionDue: Date;
  escalationDue: Date;
  isFirstResponseBreached: boolean;
  isResolutionBreached: boolean;
  isEscalationDue: boolean;
  timeToFirstResponse: number | null;
  timeToResolution: number | null;
  percentToFirstResponseSLA: number;
  percentToResolutionSLA: number;
}

export interface ModeratorMetrics {
  moderatorId: string;
  period: 'day' | 'week' | 'month';
  totalAssigned: number;
  totalResolved: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  slaComplianceRate: number;
  breachedCount: number;
  escalatedCount: number;
  accuracyRate: number;
  appealOverturns: number;
}

export interface QueueMetrics {
  domainId: string;
  pending: number;
  inProgress: number;
  breached: number;
  nearingBreach: number;
  averageWaitTime: number;
  oldestItemAge: number;
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface SLAAlert {
  id: string;
  type: 'breach' | 'warning' | 'escalation' | 'queue_backup';
  severity: 'critical' | 'high' | 'medium' | 'low';
  itemId?: string;
  itemType?: string;
  domainId: string;
  message: string;
  details: Record<string, any>;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export class SLATrackingService {
  private slaConfigs: Map<string, SLAConfig[]> = new Map();
  private alertHandlers: ((alert: SLAAlert) => void)[] = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize with default configs
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: (alert: SLAAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Start periodic SLA checks
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.checkAllSLAs();
    }, intervalMs);

    // Run immediately
    this.checkAllSLAs().catch(console.error);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Get SLA configuration for a domain
   */
  getSLAConfig(domainId: string, priority: string): SLAConfig {
    const domainConfigs = this.slaConfigs.get(domainId);
    if (domainConfigs) {
      const config = domainConfigs.find(c => c.priority === priority);
      if (config) return config;
    }

    // Fall back to defaults
    return DEFAULT_SLA_CONFIGS.find(c => c.priority === priority) || DEFAULT_SLA_CONFIGS[2];
  }

  /**
   * Set custom SLA configuration for a domain
   */
  async setDomainSLAConfig(domainId: string, configs: SLAConfig[]): Promise<void> {
    this.slaConfigs.set(domainId, configs);

    // Persist to database
    await db.execute(sql`
      INSERT INTO domain_sla_configs (domain_id, configs, updated_at)
      VALUES (${domainId}, ${JSON.stringify(configs)}, CURRENT_TIMESTAMP)
      ON CONFLICT (domain_id) DO UPDATE SET
        configs = ${JSON.stringify(configs)},
        updated_at = CURRENT_TIMESTAMP
    `);
  }

  /**
   * Calculate SLA status for an item
   */
  calculateSLAStatus(
    item: {
      id: string;
      type: 'report' | 'appeal' | 'review';
      priority: string;
      domainId: string;
      createdAt: Date;
      firstResponseAt?: Date | null;
      resolvedAt?: Date | null;
      assignedTo?: string | null;
    }
  ): SLAStatus {
    const slaConfig = this.getSLAConfig(item.domainId, item.priority);
    const now = new Date();

    const firstResponseDue = new Date(item.createdAt.getTime() + slaConfig.firstResponseMinutes * 60000);
    const resolutionDue = new Date(item.createdAt.getTime() + slaConfig.resolutionMinutes * 60000);
    const escalationDue = new Date(item.createdAt.getTime() + slaConfig.escalationMinutes * 60000);

    const timeToFirstResponse = item.firstResponseAt
      ? (item.firstResponseAt.getTime() - item.createdAt.getTime()) / 60000
      : null;
    const timeToResolution = item.resolvedAt
      ? (item.resolvedAt.getTime() - item.createdAt.getTime()) / 60000
      : null;

    const elapsedMinutes = (now.getTime() - item.createdAt.getTime()) / 60000;

    const isFirstResponseBreached = item.firstResponseAt
      ? item.firstResponseAt > firstResponseDue
      : now > firstResponseDue;

    const isResolutionBreached = item.resolvedAt
      ? item.resolvedAt > resolutionDue
      : now > resolutionDue;

    const isEscalationDue = !item.resolvedAt && now > escalationDue;

    const percentToFirstResponseSLA = item.firstResponseAt
      ? (timeToFirstResponse! / slaConfig.firstResponseMinutes) * 100
      : (elapsedMinutes / slaConfig.firstResponseMinutes) * 100;

    const percentToResolutionSLA = item.resolvedAt
      ? (timeToResolution! / slaConfig.resolutionMinutes) * 100
      : (elapsedMinutes / slaConfig.resolutionMinutes) * 100;

    return {
      itemId: item.id,
      itemType: item.type,
      priority: item.priority,
      createdAt: item.createdAt,
      firstResponseAt: item.firstResponseAt || null,
      resolvedAt: item.resolvedAt || null,
      assignedTo: item.assignedTo || null,
      slaConfig,
      firstResponseDue,
      resolutionDue,
      escalationDue,
      isFirstResponseBreached,
      isResolutionBreached,
      isEscalationDue,
      timeToFirstResponse,
      timeToResolution,
      percentToFirstResponseSLA,
      percentToResolutionSLA,
    };
  }

  /**
   * Check all pending items for SLA breaches
   */
  async checkAllSLAs(): Promise<SLAAlert[]> {
    const alerts: SLAAlert[] = [];

    // Check moderation reports
    const pendingReports = await db.execute(sql`
      SELECT
        id, domain_id, priority, created_at,
        first_response_at, resolved_at, assigned_to
      FROM moderation_reports
      WHERE status IN ('pending', 'in_progress', 'escalated')
    `);

    for (const report of pendingReports.rows as any[]) {
      const status = this.calculateSLAStatus({
        id: report.id,
        type: 'report',
        priority: report.priority || 'medium',
        domainId: report.domain_id,
        createdAt: new Date(report.created_at),
        firstResponseAt: report.first_response_at ? new Date(report.first_response_at) : null,
        resolvedAt: report.resolved_at ? new Date(report.resolved_at) : null,
        assignedTo: report.assigned_to,
      });

      if (status.isFirstResponseBreached && !status.firstResponseAt) {
        alerts.push(this.createAlert({
          type: 'breach',
          severity: status.priority as any,
          itemId: status.itemId,
          itemType: 'report',
          domainId: report.domain_id,
          message: `First response SLA breached for report ${status.itemId}`,
          details: {
            priority: status.priority,
            dueAt: status.firstResponseDue,
            elapsedMinutes: status.percentToFirstResponseSLA * status.slaConfig.firstResponseMinutes / 100,
          },
        }));
      }

      if (status.isEscalationDue && !status.resolvedAt) {
        alerts.push(this.createAlert({
          type: 'escalation',
          severity: status.priority as any,
          itemId: status.itemId,
          itemType: 'report',
          domainId: report.domain_id,
          message: `Escalation required for report ${status.itemId}`,
          details: {
            priority: status.priority,
            escalationDue: status.escalationDue,
            assignedTo: status.assignedTo,
          },
        }));
      }

      // Warning for items nearing SLA
      if (!status.isResolutionBreached && status.percentToResolutionSLA >= status.slaConfig.warningThresholdPercent) {
        alerts.push(this.createAlert({
          type: 'warning',
          severity: 'medium',
          itemId: status.itemId,
          itemType: 'report',
          domainId: report.domain_id,
          message: `Report ${status.itemId} is nearing resolution SLA`,
          details: {
            priority: status.priority,
            percentComplete: status.percentToResolutionSLA,
            dueAt: status.resolutionDue,
          },
        }));
      }
    }

    // Check appeals
    const pendingAppeals = await db.execute(sql`
      SELECT
        id, domain_id, priority, created_at,
        first_response_at, resolved_at, assigned_to
      FROM moderation_appeals
      WHERE status IN ('pending', 'in_review')
    `);

    for (const appeal of pendingAppeals.rows as any[]) {
      const status = this.calculateSLAStatus({
        id: appeal.id,
        type: 'appeal',
        priority: appeal.priority || 'high',
        domainId: appeal.domain_id,
        createdAt: new Date(appeal.created_at),
        firstResponseAt: appeal.first_response_at ? new Date(appeal.first_response_at) : null,
        resolvedAt: appeal.resolved_at ? new Date(appeal.resolved_at) : null,
        assignedTo: appeal.assigned_to,
      });

      if (status.isFirstResponseBreached && !status.firstResponseAt) {
        alerts.push(this.createAlert({
          type: 'breach',
          severity: 'high',
          itemId: status.itemId,
          itemType: 'appeal',
          domainId: appeal.domain_id,
          message: `First response SLA breached for appeal ${status.itemId}`,
          details: {
            priority: status.priority,
            dueAt: status.firstResponseDue,
          },
        }));
      }
    }

    // Check queue health
    const queueMetrics = await this.getQueueMetrics();
    for (const metrics of queueMetrics) {
      if (metrics.breached > 0) {
        alerts.push(this.createAlert({
          type: 'queue_backup',
          severity: metrics.breached > 10 ? 'critical' : 'high',
          domainId: metrics.domainId,
          message: `${metrics.breached} items have breached SLA in domain ${metrics.domainId}`,
          details: {
            breachedCount: metrics.breached,
            pendingCount: metrics.pending,
            oldestItemAge: metrics.oldestItemAge,
          },
        }));
      }

      if (metrics.byPriority.critical > 0) {
        alerts.push(this.createAlert({
          type: 'queue_backup',
          severity: 'critical',
          domainId: metrics.domainId,
          message: `${metrics.byPriority.critical} critical priority items pending in domain ${metrics.domainId}`,
          details: {
            criticalCount: metrics.byPriority.critical,
            averageWaitTime: metrics.averageWaitTime,
          },
        }));
      }
    }

    // Emit alerts
    for (const alert of alerts) {
      await this.emitAlert(alert);
    }

    return alerts;
  }

  /**
   * Get queue metrics for all domains
   */
  async getQueueMetrics(domainId?: string): Promise<QueueMetrics[]> {
    const whereClause = domainId ? sql`WHERE domain_id = ${domainId}` : sql``;

    const result = await db.execute(sql`
      WITH report_stats AS (
        SELECT
          domain_id,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE priority = 'critical' AND status IN ('pending', 'in_progress')) as critical_count,
          COUNT(*) FILTER (WHERE priority = 'high' AND status IN ('pending', 'in_progress')) as high_count,
          COUNT(*) FILTER (WHERE priority = 'medium' AND status IN ('pending', 'in_progress')) as medium_count,
          COUNT(*) FILTER (WHERE priority = 'low' AND status IN ('pending', 'in_progress')) as low_count,
          AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))/60)
            FILTER (WHERE status IN ('pending', 'in_progress')) as avg_wait_minutes,
          MAX(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))/60)
            FILTER (WHERE status IN ('pending', 'in_progress')) as oldest_minutes
        FROM moderation_reports
        ${whereClause}
        GROUP BY domain_id
      )
      SELECT * FROM report_stats
    `);

    return (result.rows as any[]).map(row => ({
      domainId: row.domain_id,
      pending: Number(row.pending) || 0,
      inProgress: Number(row.in_progress) || 0,
      breached: 0, // Will be calculated
      nearingBreach: 0, // Will be calculated
      averageWaitTime: Number(row.avg_wait_minutes) || 0,
      oldestItemAge: Number(row.oldest_minutes) || 0,
      byPriority: {
        critical: Number(row.critical_count) || 0,
        high: Number(row.high_count) || 0,
        medium: Number(row.medium_count) || 0,
        low: Number(row.low_count) || 0,
      },
    }));
  }

  /**
   * Get moderator performance metrics
   */
  async getModeratorMetrics(
    moderatorId: string,
    period: 'day' | 'week' | 'month' = 'week',
    domainId?: string
  ): Promise<ModeratorMetrics> {
    const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const domainFilter = domainId ? sql`AND domain_id = ${domainId}` : sql``;

    const result = await db.execute(sql`
      WITH moderator_actions AS (
        SELECT
          COUNT(*) as total_assigned,
          COUNT(*) FILTER (WHERE status IN ('resolved', 'dismissed')) as total_resolved,
          AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))/60)
            FILTER (WHERE first_response_at IS NOT NULL) as avg_response_time,
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)
            FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_time,
          COUNT(*) FILTER (WHERE
            resolved_at IS NOT NULL AND
            EXTRACT(EPOCH FROM (resolved_at - created_at))/60 <=
              CASE priority
                WHEN 'critical' THEN 60
                WHEN 'high' THEN 240
                WHEN 'medium' THEN 1440
                ELSE 4320
              END
          ) as sla_met_count,
          COUNT(*) FILTER (WHERE status = 'escalated') as escalated_count
        FROM moderation_reports
        WHERE assigned_to = ${moderatorId}
          AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * ${periodDays}
          ${domainFilter}
      ),
      appeal_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE outcome = 'overturned' AND original_moderator = ${moderatorId}) as appeal_overturns
        FROM moderation_appeals
        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * ${periodDays}
          ${domainFilter}
      )
      SELECT
        ma.*,
        COALESCE(aps.appeal_overturns, 0) as appeal_overturns
      FROM moderator_actions ma
      CROSS JOIN appeal_stats aps
    `);

    const row = result.rows[0] as any;
    const totalResolved = Number(row?.total_resolved) || 0;
    const slaMet = Number(row?.sla_met_count) || 0;
    const appealOverturns = Number(row?.appeal_overturns) || 0;

    return {
      moderatorId,
      period,
      totalAssigned: Number(row?.total_assigned) || 0,
      totalResolved,
      averageResponseTime: Number(row?.avg_response_time) || 0,
      averageResolutionTime: Number(row?.avg_resolution_time) || 0,
      slaComplianceRate: totalResolved > 0 ? (slaMet / totalResolved) * 100 : 100,
      breachedCount: totalResolved - slaMet,
      escalatedCount: Number(row?.escalated_count) || 0,
      accuracyRate: totalResolved > 0 ? ((totalResolved - appealOverturns) / totalResolved) * 100 : 100,
      appealOverturns,
    };
  }

  /**
   * Record first response on an item
   */
  async recordFirstResponse(
    itemId: string,
    itemType: 'report' | 'appeal',
    moderatorId: string
  ): Promise<void> {
    const table = itemType === 'report' ? 'moderation_reports' : 'moderation_appeals';

    await db.execute(sql`
      UPDATE ${sql.raw(table)}
      SET
        first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
        assigned_to = ${moderatorId},
        status = 'in_progress',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${itemId}
    `);
  }

  /**
   * Record resolution of an item
   */
  async recordResolution(
    itemId: string,
    itemType: 'report' | 'appeal',
    moderatorId: string,
    outcome: string
  ): Promise<void> {
    const table = itemType === 'report' ? 'moderation_reports' : 'moderation_appeals';

    await db.execute(sql`
      UPDATE ${sql.raw(table)}
      SET
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by = ${moderatorId},
        outcome = ${outcome},
        status = 'resolved',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${itemId}
    `);
  }

  /**
   * Create an alert object
   */
  private createAlert(params: Omit<SLAAlert, 'id' | 'createdAt'>): SLAAlert {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...params,
    };
  }

  /**
   * Emit alert to all handlers
   */
  private async emitAlert(alert: SLAAlert): Promise<void> {
    // Store alert
    await db.execute(sql`
      INSERT INTO sla_alerts (id, type, severity, item_id, item_type, domain_id, message, details, created_at)
      VALUES (
        ${alert.id},
        ${alert.type},
        ${alert.severity},
        ${alert.itemId || null},
        ${alert.itemType || null},
        ${alert.domainId},
        ${alert.message},
        ${JSON.stringify(alert.details)},
        ${alert.createdAt.toISOString()}
      )
      ON CONFLICT DO NOTHING
    `);

    // Notify handlers
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        console.error('SLA alert handler error:', error);
      }
    }
  }

  /**
   * Get pending alerts for a domain
   */
  async getAlerts(
    domainId: string,
    options: {
      acknowledged?: boolean;
      severity?: string;
      limit?: number;
    } = {}
  ): Promise<SLAAlert[]> {
    const { acknowledged, severity, limit = 100 } = options;

    let query = sql`
      SELECT * FROM sla_alerts
      WHERE domain_id = ${domainId}
    `;

    if (acknowledged !== undefined) {
      query = acknowledged
        ? sql`${query} AND acknowledged_at IS NOT NULL`
        : sql`${query} AND acknowledged_at IS NULL`;
    }

    if (severity) {
      query = sql`${query} AND severity = ${severity}`;
    }

    query = sql`${query} ORDER BY created_at DESC LIMIT ${limit}`;

    const result = await db.execute(query);

    return (result.rows as any[]).map(row => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      itemId: row.item_id,
      itemType: row.item_type,
      domainId: row.domain_id,
      message: row.message,
      details: row.details,
      createdAt: new Date(row.created_at),
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
      acknowledgedBy: row.acknowledged_by,
    }));
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    await db.execute(sql`
      UPDATE sla_alerts
      SET
        acknowledged_at = CURRENT_TIMESTAMP,
        acknowledged_by = ${acknowledgedBy}
      WHERE id = ${alertId}
    `);
  }
}

export function createSLATrackingService(): SLATrackingService {
  return new SLATrackingService();
}
