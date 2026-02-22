/**
 * Cron Service
 * Handles scheduled background tasks like CRL generation
 */

import { db } from '../../db/index.js';
import { caConfig } from '../../db/schema.js';
import { certificateManager } from '../ca/CertificateManager.js';
import { eq } from 'drizzle-orm';

interface CronTask {
  name: string;
  interval: number; // in milliseconds
  lastRun: Date | null;
  running: boolean;
  handler: () => Promise<void>;
}

class CronService {
  private tasks: Map<string, CronTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private initialized = false;

  /**
   * Initialize the cron service and start all tasks
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('Initializing cron service...');

    // Register CRL generation task
    await this.registerCRLGenerationTask();

    this.initialized = true;
    console.log('Cron service initialized');
  }

  /**
   * Register the CRL generation task based on ca_config
   */
  private async registerCRLGenerationTask(): Promise<void> {
    try {
      // Get CA config
      const config = await db
        .select()
        .from(caConfig)
        .where(eq(caConfig.id, 'default'))
        .limit(1);

      if (!config[0] || !config[0].crlAutoGenerate) {
        console.log('CRL auto-generation is disabled');
        return;
      }

      const intervalHours = config[0].crlGenerationIntervalHours || 24;
      const intervalMs = intervalHours * 60 * 60 * 1000;

      this.register('crl-generation', intervalMs, async () => {
        console.log('Running scheduled CRL generation...');

        try {
          const result = await certificateManager.generateCRL();
          console.log(`CRL generated successfully: ${result.id}`);

          // Update last_crl_generated_at in config
          await db
            .update(caConfig)
            .set({ lastCrlGeneratedAt: new Date() })
            .where(eq(caConfig.id, 'default'));
        } catch (error) {
          console.error('Failed to generate CRL:', error);
        }
      });

      console.log(`CRL generation task registered (interval: ${intervalHours} hours)`);

      // Check if we need to generate a CRL now (if it's been too long)
      if (config[0].lastCrlGeneratedAt) {
        const hoursSinceLast = (Date.now() - config[0].lastCrlGeneratedAt.getTime()) / (60 * 60 * 1000);
        if (hoursSinceLast >= intervalHours) {
          console.log('CRL is stale, generating immediately...');
          await this.runTask('crl-generation');
        }
      } else {
        // No CRL has ever been generated, generate one now
        console.log('No previous CRL found, generating initial CRL...');
        await this.runTask('crl-generation');
      }
    } catch (error) {
      console.error('Failed to register CRL generation task:', error);
    }
  }

  /**
   * Register a new cron task
   */
  register(name: string, interval: number, handler: () => Promise<void>): void {
    if (this.tasks.has(name)) {
      console.warn(`Task ${name} already registered, replacing...`);
      this.unregister(name);
    }

    const task: CronTask = {
      name,
      interval,
      lastRun: null,
      running: false,
      handler,
    };

    this.tasks.set(name, task);

    // Schedule the task
    const timer = setInterval(async () => {
      await this.runTask(name);
    }, interval);

    this.timers.set(name, timer);
  }

  /**
   * Unregister a cron task
   */
  unregister(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    this.tasks.delete(name);
  }

  /**
   * Run a task immediately
   */
  async runTask(name: string): Promise<void> {
    const task = this.tasks.get(name);
    if (!task) {
      console.error(`Task ${name} not found`);
      return;
    }

    if (task.running) {
      console.warn(`Task ${name} is already running, skipping...`);
      return;
    }

    task.running = true;
    try {
      await task.handler();
      task.lastRun = new Date();
    } catch (error) {
      console.error(`Task ${name} failed:`, error);
    } finally {
      task.running = false;
    }
  }

  /**
   * Get status of all tasks
   */
  getStatus(): Array<{
    name: string;
    interval: number;
    lastRun: Date | null;
    running: boolean;
  }> {
    return Array.from(this.tasks.values()).map((task) => ({
      name: task.name,
      interval: task.interval,
      lastRun: task.lastRun,
      running: task.running,
    }));
  }

  /**
   * Stop all tasks
   */
  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.tasks.clear();
    this.initialized = false;
    console.log('Cron service stopped');
  }
}

// Export singleton instance
export const cronService = new CronService();
