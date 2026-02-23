import { Hono } from 'hono';
import { serve } from '@hono/node-server';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'draining';
  activeJobs: number;
  totalProcessed: number;
  failedJobs: number;
  uptime: number;
  workerId: string;
}

export class HealthServer {
  private app: Hono;
  private server: ReturnType<typeof serve> | null = null;
  private startTime: number;
  private status: HealthStatus;

  constructor(workerId: string) {
    this.app = new Hono();
    this.startTime = Date.now();
    this.status = {
      status: 'healthy',
      activeJobs: 0,
      totalProcessed: 0,
      failedJobs: 0,
      uptime: 0,
      workerId,
    };
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Basic health check for container orchestration
    this.app.get('/health', (c) => {
      if (this.status.status === 'unhealthy') {
        return c.json({ status: 'unhealthy' }, 503);
      }
      return c.json({ status: 'ok' });
    });

    // Readiness check - not ready if draining or unhealthy
    this.app.get('/ready', (c) => {
      if (this.status.status !== 'healthy') {
        return c.json({ ready: false, status: this.status.status }, 503);
      }
      return c.json({ ready: true });
    });

    // Detailed metrics
    this.app.get('/metrics', (c) => {
      return c.json({
        ...this.status,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      });
    });

    // Liveness probe
    this.app.get('/live', (c) => {
      return c.json({ alive: true });
    });
  }

  start(port: number): void {
    this.server = serve({
      fetch: this.app.fetch,
      port,
    });
    console.log(`Health server listening on port ${port}`);
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  setDraining(): void {
    this.status.status = 'draining';
  }

  setUnhealthy(): void {
    this.status.status = 'unhealthy';
  }

  setHealthy(): void {
    this.status.status = 'healthy';
  }

  updateStats(stats: Partial<HealthStatus>): void {
    Object.assign(this.status, stats);
  }

  incrementActiveJobs(): void {
    this.status.activeJobs++;
  }

  decrementActiveJobs(): void {
    this.status.activeJobs = Math.max(0, this.status.activeJobs - 1);
  }

  incrementProcessed(): void {
    this.status.totalProcessed++;
  }

  incrementFailed(): void {
    this.status.failedJobs++;
  }

  getStatus(): HealthStatus {
    return {
      ...this.status,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}
