/**
 * Service Health Service
 * Monitors health of domain services and infrastructure
 */

import { nanoid } from 'nanoid';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

/**
 * Service types
 */
export type ServiceType =
  | 'pds'
  | 'appview'
  | 'relay'
  | 'feed-generator'
  | 'labeler'
  | 'video-service'
  | 'render-worker'
  | 'cdn'
  | 'database'
  | 'redis'
  | 'storage';

/**
 * Service status
 */
export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Service definition
 */
export interface Service {
  id: string;
  domainId: string;
  type: ServiceType;
  name: string;
  description?: string;
  endpoint: string;
  healthEndpoint?: string;
  status: ServiceStatus;
  lastCheckedAt?: Date;
  lastHealthyAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  priority: number;
  enabled: boolean;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  serviceId: string;
  status: ServiceStatus;
  responseTime: number;
  details?: Record<string, unknown>;
  error?: string;
  checkedAt: Date;
}

/**
 * Service metrics
 */
export interface ServiceMetrics {
  serviceId: string;
  uptime: number;
  avgResponseTime: number;
  errorRate: number;
  requestsPerMinute: number;
  lastHour: Array<{
    timestamp: Date;
    status: ServiceStatus;
    responseTime: number;
  }>;
}

/**
 * Failover configuration
 */
export interface FailoverConfig {
  primaryServiceId: string;
  backupServiceIds: string[];
  autoFailover: boolean;
  healthCheckInterval: number;
  failureThreshold: number;
  recoveryThreshold: number;
}

export class ServiceHealthService {
  private db: PostgresJsDatabase<typeof schema>;
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private serviceStatuses: Map<string, { status: ServiceStatus; failures: number }> = new Map();

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  // ==========================================
  // Service Management
  // ==========================================

  /**
   * Register a service
   */
  async registerService(
    domainId: string,
    service: {
      type: ServiceType;
      name: string;
      description?: string;
      endpoint: string;
      healthEndpoint?: string;
      metadata?: Record<string, unknown>;
      config?: Record<string, unknown>;
      priority?: number;
    }
  ): Promise<Service> {
    const id = nanoid();

    const [inserted] = await this.db
      .insert(schema.domainServices)
      .values({
        id,
        domainId,
        serviceType: service.type,
        endpoint: service.endpoint,
        status: 'unknown',
        config: {
          ...(service.config || {}),
          customSettings: {
            name: service.name,
            description: service.description,
            healthEndpoint: service.healthEndpoint || `${service.endpoint}/health`,
            metadata: service.metadata || {},
            priority: service.priority || 0,
          },
        },
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return this.toService(inserted!);
  }

  /**
   * Get service by ID
   */
  async getService(serviceId: string): Promise<Service | null> {
    const service = await this.db.query.domainServices.findFirst({
      where: eq(schema.domainServices.id, serviceId),
    });

    return service ? this.toService(service) : null;
  }

  /**
   * Get services for a domain
   */
  async getDomainServices(
    domainId: string,
    type?: ServiceType
  ): Promise<Service[]> {
    let query = this.db
      .select()
      .from(schema.domainServices)
      .where(eq(schema.domainServices.domainId, domainId))
      .orderBy(desc(schema.domainServices.createdAt));

    if (type) {
      query = this.db
        .select()
        .from(schema.domainServices)
        .where(
          and(
            eq(schema.domainServices.domainId, domainId),
            eq(schema.domainServices.serviceType, type)
          )
        )
        .orderBy(desc(schema.domainServices.createdAt));
    }

    const services = await query;
    return services.map((s) => this.toService(s));
  }

  /**
   * Update service
   */
  async updateService(
    serviceId: string,
    updates: Partial<{
      name: string;
      description: string;
      endpoint: string;
      healthEndpoint: string;
      metadata: Record<string, unknown>;
      config: Record<string, unknown>;
      priority: number;
      enabled: boolean;
    }>
  ): Promise<Service | null> {
    // Get current service to merge config
    const current = await this.getService(serviceId);
    if (!current) return null;

    const currentConfig = (current.config || {}) as Record<string, unknown>;
    const customSettings = (currentConfig.customSettings as Record<string, unknown>) || {};

    if (updates.name !== undefined) customSettings.name = updates.name;
    if (updates.description !== undefined) customSettings.description = updates.description;
    if (updates.healthEndpoint !== undefined) customSettings.healthEndpoint = updates.healthEndpoint;
    if (updates.metadata !== undefined) customSettings.metadata = updates.metadata;
    if (updates.priority !== undefined) customSettings.priority = updates.priority;

    const configUpdates = {
      ...currentConfig,
      ...(updates.config || {}),
      customSettings,
    };

    const [updated] = await this.db
      .update(schema.domainServices)
      .set({
        ...(updates.endpoint !== undefined && { endpoint: updates.endpoint }),
        ...(updates.enabled !== undefined && { enabled: updates.enabled }),
        config: configUpdates,
        updatedAt: new Date(),
      })
      .where(eq(schema.domainServices.id, serviceId))
      .returning();

    return updated ? this.toService(updated) : null;
  }

  /**
   * Delete service
   */
  async deleteService(serviceId: string): Promise<boolean> {
    // Stop health checks
    this.stopHealthCheck(serviceId);

    const result = await this.db
      .delete(schema.domainServices)
      .where(eq(schema.domainServices.id, serviceId))
      .returning();

    return result.length > 0;
  }

  // ==========================================
  // Health Checks
  // ==========================================

  /**
   * Check service health
   */
  async checkHealth(serviceId: string): Promise<HealthCheckResult> {
    const service = await this.getService(serviceId);
    if (!service) {
      return {
        serviceId,
        status: 'unknown',
        responseTime: 0,
        error: 'Service not found',
        checkedAt: new Date(),
      };
    }

    const startTime = Date.now();
    let status: ServiceStatus = 'healthy';
    let details: Record<string, unknown> = {};
    let error: string | undefined;

    try {
      const healthEndpoint = service.healthEndpoint || `${service.endpoint}/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(healthEndpoint, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Exprsn-HealthCheck/1.0',
        },
      });

      clearTimeout(timeout);

      if (response.ok) {
        try {
          const data = await response.json();
          details = data as Record<string, unknown>;

          // Check for degraded status in response
          if (details.status === 'degraded' || details.degraded) {
            status = 'degraded';
          }
        } catch {
          // Non-JSON response is OK
        }
      } else {
        status = response.status >= 500 ? 'unhealthy' : 'degraded';
        error = `HTTP ${response.status}`;
      }
    } catch (err) {
      status = 'unhealthy';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const responseTime = Date.now() - startTime;

    // Update service status
    await this.updateServiceStatus(serviceId, status, error);

    // Record health check
    await this.recordHealthCheck(serviceId, status, responseTime, details, error);

    return {
      serviceId,
      status,
      responseTime,
      details,
      error,
      checkedAt: new Date(),
    };
  }

  /**
   * Check health of all domain services
   */
  async checkDomainHealth(domainId: string): Promise<HealthCheckResult[]> {
    const services = await this.getDomainServices(domainId);
    const results: HealthCheckResult[] = [];

    for (const service of services) {
      if (service.enabled) {
        const result = await this.checkHealth(service.id);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Start periodic health checks
   */
  startHealthCheck(serviceId: string, intervalMs: number = 60000): void {
    // Stop existing interval
    this.stopHealthCheck(serviceId);

    // Start new interval
    const interval = setInterval(async () => {
      await this.checkHealth(serviceId);
    }, intervalMs);

    this.healthCheckIntervals.set(serviceId, interval);

    // Run initial check
    this.checkHealth(serviceId);
  }

  /**
   * Stop health checks for a service
   */
  stopHealthCheck(serviceId: string): void {
    const interval = this.healthCheckIntervals.get(serviceId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(serviceId);
    }
  }

  /**
   * Start health checks for all domain services
   */
  async startDomainHealthChecks(
    domainId: string,
    intervalMs: number = 60000
  ): Promise<void> {
    const services = await this.getDomainServices(domainId);
    for (const service of services) {
      if (service.enabled) {
        this.startHealthCheck(service.id, intervalMs);
      }
    }
  }

  /**
   * Stop all health checks for a domain
   */
  async stopDomainHealthChecks(domainId: string): Promise<void> {
    const services = await this.getDomainServices(domainId);
    for (const service of services) {
      this.stopHealthCheck(service.id);
    }
  }

  // ==========================================
  // Metrics
  // ==========================================

  /**
   * Get service metrics
   */
  async getServiceMetrics(
    serviceId: string,
    periodHours: number = 24
  ): Promise<ServiceMetrics> {
    const periodStart = new Date(Date.now() - periodHours * 60 * 60 * 1000);

    // Get the service to find its domain
    const service = await this.getService(serviceId);
    if (!service) {
      return {
        serviceId,
        uptime: 100,
        avgResponseTime: 0,
        errorRate: 0,
        requestsPerMinute: 0,
        lastHour: [],
      };
    }

    // Get health check history from domainHealthChecks
    const checks = await this.db
      .select()
      .from(schema.domainHealthChecks)
      .where(
        and(
          eq(schema.domainHealthChecks.domainId, service.domainId),
          gte(schema.domainHealthChecks.checkedAt, periodStart)
        )
      )
      .orderBy(schema.domainHealthChecks.checkedAt);

    if (checks.length === 0) {
      return {
        serviceId,
        uptime: 100,
        avgResponseTime: 0,
        errorRate: 0,
        requestsPerMinute: 0,
        lastHour: [],
      };
    }

    // Calculate metrics
    const healthyChecks = checks.filter((c) => c.status === 'healthy').length;
    const uptime = (healthyChecks / checks.length) * 100;

    const avgResponseTime =
      checks.reduce((sum, c) => sum + (c.responseTime || 0), 0) / checks.length;

    const errorChecks = checks.filter((c) => c.status === 'unhealthy').length;
    const errorRate = (errorChecks / checks.length) * 100;

    // Get last hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastHour = checks
      .filter((c) => c.checkedAt >= hourAgo)
      .map((c) => ({
        timestamp: c.checkedAt,
        status: c.status as ServiceStatus,
        responseTime: c.responseTime || 0,
      }));

    return {
      serviceId,
      uptime: Math.round(uptime * 10) / 10,
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 10) / 10,
      requestsPerMinute: checks.length / (periodHours * 60),
      lastHour,
    };
  }

  /**
   * Get domain service overview
   */
  async getDomainServiceOverview(domainId: string): Promise<{
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
    services: Array<{
      id: string;
      name: string;
      type: ServiceType;
      status: ServiceStatus;
      lastChecked?: Date;
    }>;
  }> {
    const services = await this.getDomainServices(domainId);

    const counts = {
      total: services.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
    };

    for (const service of services) {
      counts[service.status]++;
    }

    return {
      ...counts,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        status: s.status,
        lastChecked: s.lastCheckedAt,
      })),
    };
  }

  // ==========================================
  // Failover
  // ==========================================

  /**
   * Configure failover
   */
  async configureFailover(
    domainId: string,
    serviceType: ServiceType,
    config: FailoverConfig
  ): Promise<void> {
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    const federationConfig = domain.federationConfig as unknown as Record<string, unknown>;
    const failoverConfigs = (federationConfig?.failover as Record<string, FailoverConfig>) || {};

    failoverConfigs[serviceType] = config;

    await this.db
      .update(schema.domains)
      .set({
        federationConfig: { ...federationConfig, failover: failoverConfigs } as any,
        updatedAt: new Date(),
      })
      .where(eq(schema.domains.id, domainId));
  }

  /**
   * Get failover configuration
   */
  async getFailoverConfig(
    domainId: string,
    serviceType: ServiceType
  ): Promise<FailoverConfig | null> {
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      return null;
    }

    const federationConfig = domain.federationConfig as unknown as Record<string, unknown>;
    const failoverConfigs = (federationConfig?.failover as Record<string, FailoverConfig>) || {};

    return failoverConfigs[serviceType] || null;
  }

  /**
   * Get best available service (with failover)
   */
  async getBestService(
    domainId: string,
    serviceType: ServiceType
  ): Promise<Service | null> {
    const services = await this.getDomainServices(domainId, serviceType);
    const enabledServices = services.filter((s) => s.enabled);

    if (enabledServices.length === 0) {
      return null;
    }

    // Sort by status (healthy first) then priority
    const statusPriority: Record<ServiceStatus, number> = {
      healthy: 0,
      degraded: 1,
      unhealthy: 2,
      unknown: 3,
    };

    enabledServices.sort((a, b) => {
      const statusDiff = statusPriority[a.status] - statusPriority[b.status];
      if (statusDiff !== 0) return statusDiff;
      return b.priority - a.priority;
    });

    return enabledServices[0] || null;
  }

  /**
   * Trigger failover
   */
  async triggerFailover(
    domainId: string,
    serviceType: ServiceType,
    reason: string
  ): Promise<Service | null> {
    const config = await this.getFailoverConfig(domainId, serviceType);
    if (!config) {
      console.warn(`[ServiceHealth] No failover config for ${serviceType}`);
      return null;
    }

    // Find next healthy backup
    for (const backupId of config.backupServiceIds) {
      const backup = await this.getService(backupId);
      if (backup && backup.enabled && backup.status === 'healthy') {
        console.log(`[ServiceHealth] Failing over to ${backup.name}: ${reason}`);
        return backup;
      }
    }

    console.error(`[ServiceHealth] No healthy backup found for ${serviceType}`);
    return null;
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private toService(s: typeof schema.domainServices.$inferSelect): Service {
    const config = (s.config as Record<string, unknown>) || {};
    const customSettings = (config.customSettings as Record<string, unknown>) || {};

    return {
      id: s.id,
      domainId: s.domainId,
      type: s.serviceType as ServiceType,
      name: (customSettings.name as string) || s.serviceType,
      description: (customSettings.description as string) || undefined,
      endpoint: s.endpoint || '',
      healthEndpoint: (customSettings.healthEndpoint as string) || undefined,
      status: (s.status as ServiceStatus) || 'unknown',
      lastCheckedAt: s.lastHealthCheck || undefined,
      lastHealthyAt: undefined, // Not stored in schema
      errorMessage: s.errorMessage || undefined,
      metadata: (customSettings.metadata as Record<string, unknown>) || undefined,
      config: config,
      priority: (customSettings.priority as number) || 0,
      enabled: s.enabled ?? true,
    };
  }

  private async updateServiceStatus(
    serviceId: string,
    status: ServiceStatus,
    error?: string
  ): Promise<void> {
    const updates: Partial<typeof schema.domainServices.$inferInsert> = {
      status,
      lastHealthCheck: new Date(),
      errorMessage: error,
      updatedAt: new Date(),
    };

    await this.db
      .update(schema.domainServices)
      .set(updates)
      .where(eq(schema.domainServices.id, serviceId));
  }

  private async recordHealthCheck(
    serviceId: string,
    status: ServiceStatus,
    responseTime: number,
    details?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    try {
      const service = await this.getService(serviceId);
      if (!service) return;

      await this.db.insert(schema.domainHealthChecks).values({
        id: nanoid(),
        domainId: service.domainId,
        checkType: service.type,
        status,
        responseTime,
        errorMessage: error,
        details: details || {},
        checkedAt: new Date(),
      });
    } catch (err) {
      console.error('[ServiceHealth] Failed to record health check:', err);
    }
  }

  /**
   * Cleanup old health checks
   */
  async cleanupOldHealthChecks(retentionDays: number = 7): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.db
      .delete(schema.domainHealthChecks)
      .where(sql`${schema.domainHealthChecks.checkedAt} < ${cutoff}`)
      .returning();

    return result.length;
  }
}

/**
 * Create ServiceHealthService instance
 */
export function createServiceHealthService(
  db: PostgresJsDatabase<typeof schema>
): ServiceHealthService {
  return new ServiceHealthService(db);
}
