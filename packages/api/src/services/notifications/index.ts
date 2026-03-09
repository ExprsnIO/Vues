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
  WelcomePayload,
  FollowPayload,
  VideoLikePayload,
  VideoCommentPayload,
  PasswordResetPayload,
  OrgInvitePayload,
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

  // ==================== USER ENGAGEMENT NOTIFICATIONS ====================

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(userDid: string, handle: string, email: string, displayName?: string): Promise<NotificationResult | null> {
    const payload: WelcomePayload = {
      event: 'user.welcome',
      userDid,
      timestamp: new Date().toISOString(),
      data: { handle, email, displayName },
    };

    try {
      const result = await this.email.sendWelcome(email, payload);

      await this.logNotification({
        userDid,
        type: 'email',
        event: 'user.welcome',
        status: result.success ? 'sent' : 'failed',
        recipientEmail: email,
        payload,
        errorMessage: result.error,
      });

      return {
        type: 'email',
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      return null;
    }
  }

  /**
   * Send follow notification to the followed user
   */
  async sendFollowNotification(
    followeeDid: string,
    follower: { did: string; handle: string; displayName?: string; avatar?: string }
  ): Promise<NotificationResult | null> {
    // Get followee's email settings
    const settings = await this.getSettings(followeeDid);
    if (!settings?.emailEnabled || !settings.email) {
      return null;
    }

    const payload: FollowPayload = {
      event: 'user.follow',
      userDid: followeeDid,
      timestamp: new Date().toISOString(),
      data: {
        followerDid: follower.did,
        followerHandle: follower.handle,
        followerDisplayName: follower.displayName,
        followerAvatar: follower.avatar,
      },
    };

    try {
      const result = await this.email.sendFollowNotification(settings.email, payload);

      await this.logNotification({
        userDid: followeeDid,
        type: 'email',
        event: 'user.follow',
        status: result.success ? 'sent' : 'failed',
        recipientEmail: settings.email,
        payload,
        errorMessage: result.error,
      });

      return {
        type: 'email',
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send follow notification:', error);
      return null;
    }
  }

  /**
   * Send like notification to video author
   */
  async sendLikeNotification(
    authorDid: string,
    video: { uri: string; title?: string; thumbnail?: string },
    liker: { did: string; handle: string; displayName?: string; avatar?: string },
    totalLikes: number
  ): Promise<NotificationResult | null> {
    const settings = await this.getSettings(authorDid);
    if (!settings?.emailEnabled || !settings.email) {
      return null;
    }

    const payload: VideoLikePayload = {
      event: 'video.like',
      userDid: authorDid,
      timestamp: new Date().toISOString(),
      data: {
        videoUri: video.uri,
        videoTitle: video.title,
        videoThumbnail: video.thumbnail,
        likerDid: liker.did,
        likerHandle: liker.handle,
        likerDisplayName: liker.displayName,
        likerAvatar: liker.avatar,
        totalLikes,
      },
    };

    try {
      const result = await this.email.sendLikeNotification(settings.email, payload);

      await this.logNotification({
        userDid: authorDid,
        type: 'email',
        event: 'video.like',
        status: result.success ? 'sent' : 'failed',
        recipientEmail: settings.email,
        payload,
        errorMessage: result.error,
      });

      return {
        type: 'email',
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send like notification:', error);
      return null;
    }
  }

  /**
   * Send comment notification to video author
   */
  async sendCommentNotification(
    authorDid: string,
    video: { uri: string; title?: string; thumbnail?: string },
    comment: { uri: string; text: string },
    commenter: { did: string; handle: string; displayName?: string; avatar?: string }
  ): Promise<NotificationResult | null> {
    // Don't notify if author is commenting on their own video
    if (authorDid === commenter.did) {
      return null;
    }

    const settings = await this.getSettings(authorDid);
    if (!settings?.emailEnabled || !settings.email) {
      return null;
    }

    const payload: VideoCommentPayload = {
      event: 'video.comment',
      userDid: authorDid,
      timestamp: new Date().toISOString(),
      data: {
        videoUri: video.uri,
        videoTitle: video.title,
        videoThumbnail: video.thumbnail,
        commentUri: comment.uri,
        commentText: comment.text,
        commenterDid: commenter.did,
        commenterHandle: commenter.handle,
        commenterDisplayName: commenter.displayName,
        commenterAvatar: commenter.avatar,
      },
    };

    try {
      const result = await this.email.sendCommentNotification(settings.email, payload);

      await this.logNotification({
        userDid: authorDid,
        type: 'email',
        event: 'video.comment',
        status: result.success ? 'sent' : 'failed',
        recipientEmail: settings.email,
        payload,
        errorMessage: result.error,
      });

      return {
        type: 'email',
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send comment notification:', error);
      return null;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    resetUrl: string,
    expiresAt: Date
  ): Promise<NotificationResult> {
    const payload: PasswordResetPayload = {
      event: 'auth.password_reset',
      userDid: '', // Not associated with a specific DID yet
      timestamp: new Date().toISOString(),
      data: {
        resetToken,
        resetUrl,
        expiresAt: expiresAt.toISOString(),
      },
    };

    const result = await this.email.sendPasswordReset(email, payload);

    return {
      type: 'email',
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Send organization invite email
   */
  async sendOrgInviteEmail(
    email: string,
    org: { id: string; name: string; logo?: string },
    inviter: { did: string; handle: string; displayName?: string },
    role: string,
    inviteToken: string,
    acceptUrl: string,
    expiresAt: Date
  ): Promise<NotificationResult> {
    const payload: OrgInvitePayload = {
      event: 'org.invite',
      userDid: '', // Invitee may not have an account yet
      timestamp: new Date().toISOString(),
      data: {
        organizationId: org.id,
        organizationName: org.name,
        organizationLogo: org.logo,
        inviterDid: inviter.did,
        inviterHandle: inviter.handle,
        inviterDisplayName: inviter.displayName,
        role,
        inviteToken,
        acceptUrl,
        expiresAt: expiresAt.toISOString(),
      },
    };

    const result = await this.email.sendOrgInvite(email, payload);

    return {
      type: 'email',
      success: result.success,
      error: result.error,
    };
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
