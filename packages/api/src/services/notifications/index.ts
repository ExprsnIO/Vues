import { db } from '../../db/index.js';
import { notificationSettings, notificationLog, users, renderJobs } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { EmailProvider } from './email.js';
import { WebhookProvider } from './webhook.js';
import type {
  NotificationPayload,
  NotificationResult,
  RenderCompletePayload,
  RenderFailedPayload,
  NotificationEvent,
} from './types.js';

export * from './types.js';
export { EmailProvider } from './email.js';
export { WebhookProvider } from './webhook.js';

export class NotificationService {
  private email: EmailProvider;
  private webhook: WebhookProvider;

  constructor() {
    this.email = new EmailProvider();
    this.webhook = new WebhookProvider();
  }

  /**
   * Get notification settings for a user
   */
  async getSettings(userDid: string) {
    const [settings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userDid, userDid))
      .limit(1);

    return settings;
  }

  /**
   * Update notification settings for a user
   */
  async updateSettings(
    userDid: string,
    updates: Partial<{
      email: string;
      emailEnabled: boolean;
      webhookUrl: string;
      webhookSecret: string;
      notifyOnComplete: boolean;
      notifyOnFailed: boolean;
    }>
  ) {
    await db
      .insert(notificationSettings)
      .values({
        userDid,
        ...updates,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: notificationSettings.userDid,
        set: {
          ...updates,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Send render complete notification
   */
  async sendRenderComplete(jobId: string): Promise<NotificationResult[]> {
    const [job] = await db
      .select()
      .from(renderJobs)
      .where(eq(renderJobs.id, jobId))
      .limit(1);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, job.userDid))
      .limit(1);

    if (!user) {
      throw new Error(`User not found: ${job.userDid}`);
    }

    const settings = await this.getSettings(job.userDid);

    // Check if user wants to be notified
    if (settings && !settings.notifyOnComplete) {
      return [];
    }

    const payload: RenderCompletePayload = {
      event: 'render.complete',
      userDid: job.userDid,
      timestamp: new Date().toISOString(),
      data: {
        jobId: job.id,
        projectId: job.projectId,
        outputUrl: job.outputUrl || '',
        outputKey: job.outputKey || '',
        fileSize: job.outputSize || 0,
        duration: job.actualDurationSeconds || 0,
        format: job.format,
        quality: job.quality,
        resolution: (job.resolution as { width: number; height: number }) || { width: 1920, height: 1080 },
      },
    };

    const results: NotificationResult[] = [];

    // Send email notification
    if (settings?.emailEnabled !== false && settings?.email) {
      const emailResult = await this.email.sendRenderComplete(settings.email, payload);
      results.push({
        type: 'email',
        success: emailResult.success,
        error: emailResult.error,
        details: { messageId: emailResult.messageId },
      });

      await this.logNotification({
        userDid: job.userDid,
        type: 'email',
        event: 'render.complete',
        status: emailResult.success ? 'sent' : 'failed',
        recipientEmail: settings.email,
        payload,
        errorMessage: emailResult.error,
      });
    }

    // Send webhook notification
    if (settings?.webhookUrl) {
      const webhookResult = await this.webhook.send(
        {
          url: settings.webhookUrl,
          secret: settings.webhookSecret || undefined,
        },
        payload
      );

      results.push({
        type: 'webhook',
        success: webhookResult.success,
        error: webhookResult.error,
        details: { statusCode: webhookResult.statusCode, duration: webhookResult.duration },
      });

      await this.logNotification({
        userDid: job.userDid,
        type: 'webhook',
        event: 'render.complete',
        status: webhookResult.success ? 'sent' : 'failed',
        webhookUrl: settings.webhookUrl,
        payload,
        errorMessage: webhookResult.error,
        responseCode: webhookResult.statusCode,
      });
    }

    return results;
  }

  /**
   * Send render failed notification
   */
  async sendRenderFailed(
    jobId: string,
    errorMessage: string,
    errorDetails?: Record<string, unknown>
  ): Promise<NotificationResult[]> {
    const [job] = await db
      .select()
      .from(renderJobs)
      .where(eq(renderJobs.id, jobId))
      .limit(1);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.did, job.userDid))
      .limit(1);

    if (!user) {
      throw new Error(`User not found: ${job.userDid}`);
    }

    const settings = await this.getSettings(job.userDid);

    // Check if user wants to be notified
    if (settings && !settings.notifyOnFailed) {
      return [];
    }

    const payload: RenderFailedPayload = {
      event: 'render.failed',
      userDid: job.userDid,
      timestamp: new Date().toISOString(),
      data: {
        jobId: job.id,
        projectId: job.projectId,
        errorMessage,
        errorDetails,
      },
    };

    const results: NotificationResult[] = [];

    // Send email notification
    if (settings?.emailEnabled !== false && settings?.email) {
      const emailResult = await this.email.sendRenderFailed(settings.email, payload);
      results.push({
        type: 'email',
        success: emailResult.success,
        error: emailResult.error,
        details: { messageId: emailResult.messageId },
      });

      await this.logNotification({
        userDid: job.userDid,
        type: 'email',
        event: 'render.failed',
        status: emailResult.success ? 'sent' : 'failed',
        recipientEmail: settings.email,
        payload,
        errorMessage: emailResult.error,
      });
    }

    // Send webhook notification
    if (settings?.webhookUrl) {
      const webhookResult = await this.webhook.send(
        {
          url: settings.webhookUrl,
          secret: settings.webhookSecret || undefined,
        },
        payload
      );

      results.push({
        type: 'webhook',
        success: webhookResult.success,
        error: webhookResult.error,
        details: { statusCode: webhookResult.statusCode, duration: webhookResult.duration },
      });

      await this.logNotification({
        userDid: job.userDid,
        type: 'webhook',
        event: 'render.failed',
        status: webhookResult.success ? 'sent' : 'failed',
        webhookUrl: settings.webhookUrl,
        payload,
        errorMessage: webhookResult.error,
        responseCode: webhookResult.statusCode,
      });
    }

    return results;
  }

  /**
   * Get notification log for a user
   */
  async getNotificationLog(
    userDid: string,
    options?: { limit?: number; offset?: number; event?: NotificationEvent }
  ) {
    const conditions = [eq(notificationLog.userDid, userDid)];

    if (options?.event) {
      conditions.push(eq(notificationLog.event, options.event));
    }

    return db
      .select()
      .from(notificationLog)
      .where(and(...conditions))
      .orderBy(desc(notificationLog.createdAt))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);
  }

  /**
   * Test webhook configuration
   */
  async testWebhook(url: string, secret?: string): Promise<{ success: boolean; error?: string }> {
    const testPayload: NotificationPayload = {
      event: 'render.complete',
      userDid: 'test:user',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'This is a test webhook from Exprsn',
      },
    };

    const result = await this.webhook.send({ url, secret }, testPayload);
    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Test email configuration
   */
  async testEmail(to: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.email.send({
      to,
      subject: 'Test email from Exprsn',
      html: `
        <h1>Test Email</h1>
        <p>This is a test email from Exprsn to verify your notification settings.</p>
        <p>If you received this, your email notifications are working correctly!</p>
      `,
    });

    return {
      success: result.success,
      error: result.error,
    };
  }

  private async logNotification(data: {
    userDid: string;
    type: 'email' | 'webhook';
    event: string;
    status: 'sent' | 'failed';
    recipientEmail?: string;
    webhookUrl?: string;
    payload: NotificationPayload;
    errorMessage?: string;
    responseCode?: number;
  }) {
    await db.insert(notificationLog).values({
      id: nanoid(),
      userDid: data.userDid,
      type: data.type,
      event: data.event,
      status: data.status,
      recipientEmail: data.recipientEmail,
      webhookUrl: data.webhookUrl,
      payload: data.payload as unknown as Record<string, unknown>,
      errorMessage: data.errorMessage,
      responseCode: data.responseCode,
    });
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}
