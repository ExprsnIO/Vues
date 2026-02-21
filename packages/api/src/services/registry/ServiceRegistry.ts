import { eq, and, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema.js';

/**
 * Service types in the federation network
 */
export type ServiceType = 'pds' | 'relay' | 'appview' | 'labeler';

/**
 * Service status
 */
export type ServiceStatus = 'active' | 'inactive' | 'unhealthy';

/**
 * Service information
 */
export interface ServiceInfo {
  id: string;
  type: ServiceType;
  endpoint: string;
  did?: string;
  certificateId?: string;
  region?: string;
  capabilities?: string[];
  status: ServiceStatus;
  lastHealthCheck?: Date;
  healthCheckFailures: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  version?: string;
}

/**
 * Service Registry configuration
 */
export interface ServiceRegistryConfig {
  db: PostgresJsDatabase<typeof schema>;
  healthCheckIntervalMs?: number;
  maxHealthCheckFailures?: number;
  httpTimeout?: number;
}

/**
 * Service Registry for managing federated services
 */
export class ServiceRegistry {
  private db: PostgresJsDatabase<typeof schema>;
  private healthCheckIntervalMs: number;
  private maxHealthCheckFailures: number;
  private httpTimeout: number;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: ServiceRegistryConfig) {
    this.db = config.db;
    this.healthCheckIntervalMs = config.healthCheckIntervalMs || 60000; // 1 minute
    this.maxHealthCheckFailures = config.maxHealthCheckFailures || 3;
    this.httpTimeout = config.httpTimeout || 10000;
  }

  /**
   * Register a new service
   */
  async register(service: Omit<ServiceInfo, 'id' | 'createdAt' | 'updatedAt' | 'healthCheckFailures'>): Promise<string> {
    const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();

    await this.db.insert(schema.serviceRegistry).values({
      id,
      type: service.type,
      endpoint: service.endpoint,
      did: service.did,
      certificateId: service.certificateId,
      region: service.region,
      capabilities: service.capabilities,
      status: service.status,
      lastHealthCheck: service.lastHealthCheck,
      healthCheckFailures: 0,
      metadata: service.metadata,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  /**
   * Update a service
   */
  async update(id: string, updates: Partial<Omit<ServiceInfo, 'id' | 'createdAt'>>): Promise<void> {
    await this.db
      .update(schema.serviceRegistry)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(schema.serviceRegistry.id, id));
  }

  /**
   * Remove a service
   */
  async remove(id: string): Promise<void> {
    await this.db
      .delete(schema.serviceRegistry)
      .where(eq(schema.serviceRegistry.id, id));
  }

  /**
   * Get a service by ID
   */
  async get(id: string): Promise<ServiceInfo | null> {
    const results = await this.db
      .select()
      .from(schema.serviceRegistry)
      .where(eq(schema.serviceRegistry.id, id))
      .limit(1);

    const row = results[0];
    if (!row) return null;

    return this.toServiceInfo(row);
  }

  /**
   * Get a service by endpoint
   */
  async getByEndpoint(endpoint: string): Promise<ServiceInfo | null> {
    const results = await this.db
      .select()
      .from(schema.serviceRegistry)
      .where(eq(schema.serviceRegistry.endpoint, endpoint))
      .limit(1);

    const row = results[0];
    if (!row) return null;

    return this.toServiceInfo(row);
  }

  /**
   * Discover services by type
   */
  async discover(type?: ServiceType, options?: {
    status?: ServiceStatus;
    region?: string;
    capability?: string;
  }): Promise<ServiceInfo[]> {
    let query = this.db.select().from(schema.serviceRegistry);

    const conditions = [];

    if (type) {
      conditions.push(eq(schema.serviceRegistry.type, type));
    }

    if (options?.status) {
      conditions.push(eq(schema.serviceRegistry.status, options.status));
    }

    if (options?.region) {
      conditions.push(eq(schema.serviceRegistry.region, options.region));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    let services = results.map(this.toServiceInfo);

    // Filter by capability if specified
    if (options?.capability) {
      services = services.filter(
        (s) => s.capabilities?.includes(options.capability!)
      );
    }

    return services;
  }

  /**
   * List all services
   */
  async listAll(): Promise<ServiceInfo[]> {
    const results = await this.db.select().from(schema.serviceRegistry);
    return results.map(this.toServiceInfo);
  }

  /**
   * Perform health check on a single service
   */
  async healthCheck(service: ServiceInfo): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.httpTimeout);

      const response = await fetch(`${service.endpoint}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          healthy: false,
          latencyMs,
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json() as { version?: string };

      return {
        healthy: true,
        latencyMs,
        version: data.version,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Health check all services and update status
   */
  async healthCheckAll(): Promise<Map<string, HealthCheckResult>> {
    const services = await this.listAll();
    const results = new Map<string, HealthCheckResult>();

    await Promise.all(
      services.map(async (service) => {
        const result = await this.healthCheck(service);
        results.set(service.id, result);

        if (result.healthy) {
          // Reset failure count on success
          await this.update(service.id, {
            status: 'active',
            lastHealthCheck: new Date(),
            healthCheckFailures: 0,
          });
        } else {
          // Increment failure count
          const newFailures = service.healthCheckFailures + 1;
          const newStatus: ServiceStatus =
            newFailures >= this.maxHealthCheckFailures ? 'unhealthy' : service.status;

          await this.update(service.id, {
            status: newStatus,
            lastHealthCheck: new Date(),
            healthCheckFailures: newFailures,
          });
        }
      })
    );

    return results;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.healthCheckAll();
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, this.healthCheckIntervalMs);

    // Run initial health check
    this.healthCheckAll().catch(console.error);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Get healthy services by type
   */
  async getHealthyServices(type?: ServiceType): Promise<ServiceInfo[]> {
    return this.discover(type, { status: 'active' });
  }

  /**
   * Get relay endpoints
   */
  async getRelays(): Promise<string[]> {
    const relays = await this.discover('relay', { status: 'active' });
    return relays.map((r) => r.endpoint);
  }

  /**
   * Get PDS endpoints
   */
  async getPdsEndpoints(): Promise<string[]> {
    const pdsServices = await this.discover('pds', { status: 'active' });
    return pdsServices.map((p) => p.endpoint);
  }

  /**
   * Get appview endpoints
   */
  async getAppviews(): Promise<string[]> {
    const appviews = await this.discover('appview', { status: 'active' });
    return appviews.map((a) => a.endpoint);
  }

  /**
   * Convert database row to ServiceInfo
   */
  private toServiceInfo(row: typeof schema.serviceRegistry.$inferSelect): ServiceInfo {
    return {
      id: row.id,
      type: row.type as ServiceType,
      endpoint: row.endpoint,
      did: row.did || undefined,
      certificateId: row.certificateId || undefined,
      region: row.region || undefined,
      capabilities: row.capabilities as string[] | undefined,
      status: row.status as ServiceStatus,
      lastHealthCheck: row.lastHealthCheck || undefined,
      healthCheckFailures: row.healthCheckFailures,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export default ServiceRegistry;
