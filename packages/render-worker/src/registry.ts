import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import { pgTable, text, integer, boolean, timestamp, real, jsonb } from 'drizzle-orm/pg-core';
import os from 'os';

// Define the renderWorkers table schema locally
const renderWorkers = pgTable('render_workers', {
  id: text('id').primaryKey(),
  hostname: text('hostname').notNull(),
  status: text('status').notNull().default('active'),
  concurrency: integer('concurrency').default(2),
  activeJobs: integer('active_jobs').default(0),
  totalProcessed: integer('total_processed').default(0),
  failedJobs: integer('failed_jobs').default(0),
  avgProcessingTime: real('avg_processing_time'),
  gpuEnabled: boolean('gpu_enabled').default(false),
  gpuModel: text('gpu_model'),
  lastHeartbeat: timestamp('last_heartbeat'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
});

export interface WorkerConfig {
  id: string;
  concurrency: number;
  gpuEnabled: boolean;
  gpuModel?: string;
}

export class WorkerRegistry {
  private db: PostgresJsDatabase;
  private workerId: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private config: WorkerConfig;

  constructor(databaseUrl: string, config: WorkerConfig) {
    const client = postgres(databaseUrl);
    this.db = drizzle(client);
    this.workerId = config.id;
    this.config = config;
  }

  async register(): Promise<void> {
    const hostname = os.hostname();

    await this.db
      .insert(renderWorkers)
      .values({
        id: this.workerId,
        hostname,
        status: 'active',
        concurrency: this.config.concurrency,
        activeJobs: 0,
        totalProcessed: 0,
        failedJobs: 0,
        gpuEnabled: this.config.gpuEnabled,
        gpuModel: this.config.gpuModel,
        lastHeartbeat: new Date(),
        metadata: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemory: os.totalmem(),
        },
      })
      .onConflictDoUpdate({
        target: renderWorkers.id,
        set: {
          hostname,
          status: 'active',
          concurrency: this.config.concurrency,
          gpuEnabled: this.config.gpuEnabled,
          gpuModel: this.config.gpuModel,
          lastHeartbeat: new Date(),
          metadata: {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
          },
        },
      });

    console.log(`Worker ${this.workerId} registered with hostname ${hostname}`);
  }

  startHeartbeat(intervalMs: number = 15000): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.db
          .update(renderWorkers)
          .set({ lastHeartbeat: new Date() })
          .where(eq(renderWorkers.id, this.workerId));
      } catch (err) {
        console.error('Failed to send heartbeat:', err);
      }
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async updateStats(stats: {
    activeJobs?: number;
    totalProcessed?: number;
    failedJobs?: number;
    avgProcessingTime?: number;
  }): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (stats.activeJobs !== undefined) updates.activeJobs = stats.activeJobs;
    if (stats.totalProcessed !== undefined) updates.totalProcessed = stats.totalProcessed;
    if (stats.failedJobs !== undefined) updates.failedJobs = stats.failedJobs;
    if (stats.avgProcessingTime !== undefined) updates.avgProcessingTime = stats.avgProcessingTime;

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(renderWorkers)
        .set(updates)
        .where(eq(renderWorkers.id, this.workerId));
    }
  }

  async incrementActiveJobs(): Promise<void> {
    await this.db
      .update(renderWorkers)
      .set({ activeJobs: sql`${renderWorkers.activeJobs} + 1` })
      .where(eq(renderWorkers.id, this.workerId));
  }

  async decrementActiveJobs(): Promise<void> {
    await this.db
      .update(renderWorkers)
      .set({ activeJobs: sql`GREATEST(0, ${renderWorkers.activeJobs} - 1)` })
      .where(eq(renderWorkers.id, this.workerId));
  }

  async incrementProcessed(): Promise<void> {
    await this.db
      .update(renderWorkers)
      .set({ totalProcessed: sql`${renderWorkers.totalProcessed} + 1` })
      .where(eq(renderWorkers.id, this.workerId));
  }

  async incrementFailed(): Promise<void> {
    await this.db
      .update(renderWorkers)
      .set({ failedJobs: sql`${renderWorkers.failedJobs} + 1` })
      .where(eq(renderWorkers.id, this.workerId));
  }

  async setDraining(): Promise<void> {
    await this.db
      .update(renderWorkers)
      .set({ status: 'draining' })
      .where(eq(renderWorkers.id, this.workerId));
  }

  async setOffline(): Promise<void> {
    await this.db
      .update(renderWorkers)
      .set({ status: 'offline', activeJobs: 0 })
      .where(eq(renderWorkers.id, this.workerId));
  }

  async deregister(): Promise<void> {
    this.stopHeartbeat();
    await this.setOffline();
    console.log(`Worker ${this.workerId} deregistered`);
  }
}
