import nodemailer, { Transporter } from 'nodemailer';
import type {
  EmailOptions,
  EmailDeliveryResult,
  RenderCompletePayload,
  RenderFailedPayload,
  WelcomePayload,
  FollowPayload,
  VideoLikePayload,
  VideoCommentPayload,
  PasswordResetPayload,
  OrgInvitePayload,
} from './types.js';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
  fromName?: string;
}

export function getEmailConfigFromEnv(): EmailConfig {
  return {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    from: process.env.EMAIL_FROM || 'noreply@exprsn.io',
    fromName: process.env.EMAIL_FROM_NAME || 'Exprsn',
  };
}

export class EmailProvider {
  private transporter: Transporter;
  private config: EmailConfig;

  constructor(config?: EmailConfig) {
    this.config = config || getEmailConfigFromEnv();

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    });
  }

  async send(options: EmailOptions): Promise<EmailDeliveryResult> {
    try {
      const info = await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async sendRenderComplete(
    to: string,
    payload: RenderCompletePayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('render-complete', {
      projectName: data.projectName || 'Your project',
      downloadUrl: data.outputUrl,
      fileSize: this.formatFileSize(data.fileSize),
      duration: this.formatDuration(data.duration),
      format: data.format.toUpperCase(),
      quality: data.quality,
      resolution: `${data.resolution.width}x${data.resolution.height}`,
    });

    return this.send({
      to,
      subject: `Your render is ready: ${data.projectName || 'Untitled'}`,
      html,
    });
  }

  async sendRenderFailed(
    to: string,
    payload: RenderFailedPayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('render-failed', {
      projectName: data.projectName || 'Your project',
      errorMessage: data.errorMessage,
      retryUrl: data.retryUrl || '',
    });

    return this.send({
      to,
      subject: `Render failed: ${data.projectName || 'Untitled'}`,
      html,
    });
  }

  // ==================== USER ENGAGEMENT EMAILS ====================

  async sendWelcome(
    to: string,
    payload: WelcomePayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('welcome', {
      handle: data.handle,
      displayName: data.displayName || data.handle,
    });

    return this.send({
      to,
      subject: `Welcome to Exprsn, @${data.handle}!`,
      html,
    });
  }

  async sendFollowNotification(
    to: string,
    payload: FollowPayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('follow', {
      followerHandle: data.followerHandle,
      followerDisplayName: data.followerDisplayName || data.followerHandle,
      followerAvatar: data.followerAvatar || '',
      profileUrl: `${this.getBaseUrl()}/profile/${data.followerHandle}`,
    });

    return this.send({
      to,
      subject: `@${data.followerHandle} started following you`,
      html,
    });
  }

  async sendLikeNotification(
    to: string,
    payload: VideoLikePayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('like', {
      likerHandle: data.likerHandle,
      likerDisplayName: data.likerDisplayName || data.likerHandle,
      likerAvatar: data.likerAvatar || '',
      videoTitle: data.videoTitle || 'your video',
      videoThumbnail: data.videoThumbnail || '',
      totalLikes: data.totalLikes.toString(),
      videoUrl: `${this.getBaseUrl()}/video/${encodeURIComponent(data.videoUri)}`,
    });

    return this.send({
      to,
      subject: `@${data.likerHandle} liked your video`,
      html,
    });
  }

  async sendCommentNotification(
    to: string,
    payload: VideoCommentPayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('comment', {
      commenterHandle: data.commenterHandle,
      commenterDisplayName: data.commenterDisplayName || data.commenterHandle,
      commenterAvatar: data.commenterAvatar || '',
      commentText: this.truncateText(data.commentText, 150),
      videoTitle: data.videoTitle || 'your video',
      videoThumbnail: data.videoThumbnail || '',
      videoUrl: `${this.getBaseUrl()}/video/${encodeURIComponent(data.videoUri)}`,
    });

    return this.send({
      to,
      subject: `@${data.commenterHandle} commented on your video`,
      html,
    });
  }

  async sendPasswordReset(
    to: string,
    payload: PasswordResetPayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('password-reset', {
      resetUrl: data.resetUrl,
      expiresIn: this.formatExpiryTime(data.expiresAt),
    });

    return this.send({
      to,
      subject: 'Reset your Exprsn password',
      html,
    });
  }

  async sendOrgInvite(
    to: string,
    payload: OrgInvitePayload
  ): Promise<EmailDeliveryResult> {
    const { data } = payload;

    const html = this.renderTemplate('org-invite', {
      organizationName: data.organizationName,
      organizationLogo: data.organizationLogo || '',
      inviterHandle: data.inviterHandle,
      inviterDisplayName: data.inviterDisplayName || data.inviterHandle,
      role: data.role,
      acceptUrl: data.acceptUrl,
      expiresIn: this.formatExpiryTime(data.expiresAt),
    });

    return this.send({
      to,
      subject: `You've been invited to join ${data.organizationName} on Exprsn`,
      html,
    });
  }

  async verify(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private getBaseUrl(): string {
    return process.env.APP_URL || 'https://exprsn.io';
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  private formatExpiryTime(expiresAt: string): string {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 24) {
      return `${Math.floor(diffHours / 24)} days`;
    }
    if (diffHours > 0) {
      return `${diffHours} hours`;
    }
    return `${diffMins} minutes`;
  }

  private renderTemplate(
    template: string,
    vars: Record<string, string>
  ): string {
    const templates: Record<string, string> = {
      'welcome': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { margin: 0 0 10px; font-size: 28px; }
    .header p { margin: 0; opacity: 0.9; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .tips { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .tip { margin: 15px 0; padding-left: 30px; position: relative; }
    .tip::before { content: "✓"; position: absolute; left: 0; color: #6366f1; font-weight: bold; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Welcome to Exprsn!</h1>
    <p>Hey @{{handle}}, we're thrilled to have you</p>
  </div>
  <div class="content">
    <p>Hi {{displayName}},</p>
    <p>You've just joined the next generation of creative video sharing. Exprsn is built for creators who want to express themselves without limits.</p>

    <div class="tips">
      <h3>Get started:</h3>
      <div class="tip">Upload your first video and share your creativity</div>
      <div class="tip">Follow creators you love to build your personalized feed</div>
      <div class="tip">Use sounds from our library or add your own</div>
      <div class="tip">Collaborate with others in the editor</div>
    </div>

    <center>
      <a href="${this.getBaseUrl()}/upload" class="button">Create Your First Video</a>
    </center>

    <p>Questions? Reply to this email or visit our help center.</p>
  </div>
  <div class="footer">
    <p>Exprsn - Express yourself</p>
  </div>
</body>
</html>`,

      'follow': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #f8fafc; border-radius: 12px; padding: 30px; text-align: center; }
    .avatar { width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 15px; background: #e2e8f0; }
    .name { font-size: 20px; font-weight: 600; margin: 0; }
    .handle { color: #64748b; margin: 5px 0 20px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="card">
    {{#if followerAvatar}}
    <img src="{{followerAvatar}}" class="avatar" alt="{{followerDisplayName}}">
    {{/if}}
    <p class="name">{{followerDisplayName}}</p>
    <p class="handle">@{{followerHandle}}</p>
    <p>started following you on Exprsn!</p>
    <a href="{{profileUrl}}" class="button">View Profile</a>
  </div>
  <div class="footer">
    <p>Exprsn - Express yourself</p>
  </div>
</body>
</html>`,

      'like': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #f8fafc; border-radius: 12px; padding: 30px; }
    .header { display: flex; align-items: center; margin-bottom: 20px; }
    .avatar { width: 50px; height: 50px; border-radius: 50%; margin-right: 15px; background: #e2e8f0; }
    .info { flex: 1; }
    .name { font-weight: 600; margin: 0; }
    .handle { color: #64748b; font-size: 14px; }
    .heart { color: #ef4444; font-size: 24px; margin-right: 10px; }
    .video-preview { background: #1e293b; border-radius: 8px; padding: 20px; text-align: center; color: white; margin: 20px 0; }
    .stats { color: #64748b; font-size: 14px; margin-top: 15px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="heart">❤️</span>
      {{#if likerAvatar}}
      <img src="{{likerAvatar}}" class="avatar" alt="{{likerDisplayName}}">
      {{/if}}
      <div class="info">
        <p class="name">{{likerDisplayName}}</p>
        <p class="handle">@{{likerHandle}} liked your video</p>
      </div>
    </div>

    <div class="video-preview">
      {{#if videoThumbnail}}
      <img src="{{videoThumbnail}}" style="max-width: 100%; border-radius: 8px;">
      {{/if}}
      <p>{{videoTitle}}</p>
    </div>

    <p class="stats">Your video now has {{totalLikes}} likes!</p>

    <center>
      <a href="{{videoUrl}}" class="button">View Video</a>
    </center>
  </div>
  <div class="footer">
    <p>Exprsn - Express yourself</p>
  </div>
</body>
</html>`,

      'comment': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #f8fafc; border-radius: 12px; padding: 30px; }
    .header { display: flex; align-items: center; margin-bottom: 20px; }
    .avatar { width: 50px; height: 50px; border-radius: 50%; margin-right: 15px; background: #e2e8f0; }
    .info { flex: 1; }
    .name { font-weight: 600; margin: 0; }
    .handle { color: #64748b; font-size: 14px; }
    .comment-box { background: white; border-left: 4px solid #6366f1; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .comment-text { margin: 0; font-style: italic; }
    .video-ref { color: #64748b; font-size: 14px; margin-top: 15px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      {{#if commenterAvatar}}
      <img src="{{commenterAvatar}}" class="avatar" alt="{{commenterDisplayName}}">
      {{/if}}
      <div class="info">
        <p class="name">{{commenterDisplayName}}</p>
        <p class="handle">@{{commenterHandle}} commented on your video</p>
      </div>
    </div>

    <div class="comment-box">
      <p class="comment-text">"{{commentText}}"</p>
    </div>

    <p class="video-ref">On: {{videoTitle}}</p>

    <center>
      <a href="{{videoUrl}}" class="button">View & Reply</a>
    </center>
  </div>
  <div class="footer">
    <p>Exprsn - Express yourself</p>
  </div>
</body>
</html>`,

      'password-reset': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #f8fafc; border-radius: 12px; padding: 30px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h2 { margin: 0 0 20px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .warning { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin: 20px 0; color: #92400e; font-size: 14px; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐</div>
    <h2>Reset Your Password</h2>
    <p>We received a request to reset your Exprsn password. Click the button below to create a new password:</p>

    <a href="{{resetUrl}}" class="button">Reset Password</a>

    <div class="warning">
      <strong>This link expires in {{expiresIn}}.</strong><br>
      If you didn't request this, you can safely ignore this email.
    </div>
  </div>
  <div class="footer">
    <p>Exprsn - Express yourself</p>
  </div>
</body>
</html>`,

      'org-invite': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
    .org-card { background: white; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .org-logo { width: 80px; height: 80px; border-radius: 12px; margin-bottom: 15px; background: #e2e8f0; }
    .org-name { font-size: 20px; font-weight: 600; margin: 0; }
    .role-badge { display: inline-block; background: #ddd6fe; color: #6d28d9; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: 500; margin-top: 10px; }
    .inviter { color: #64748b; margin-top: 15px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .expires { color: #64748b; font-size: 14px; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>You're Invited!</h1>
  </div>
  <div class="content">
    <p>You've been invited to join an organization on Exprsn:</p>

    <div class="org-card">
      {{#if organizationLogo}}
      <img src="{{organizationLogo}}" class="org-logo" alt="{{organizationName}}">
      {{/if}}
      <p class="org-name">{{organizationName}}</p>
      <span class="role-badge">{{role}}</span>
      <p class="inviter">Invited by @{{inviterHandle}}</p>
    </div>

    <center>
      <a href="{{acceptUrl}}" class="button">Accept Invitation</a>
      <p class="expires">This invitation expires in {{expiresIn}}</p>
    </center>
  </div>
  <div class="footer">
    <p>Exprsn - Express yourself</p>
  </div>
</body>
</html>`,

      'render-complete': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .button:hover { background: #4f46e5; }
    .stats { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .stat { display: inline-block; margin-right: 30px; }
    .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .stat-value { font-size: 18px; font-weight: 600; color: #1e293b; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Your video is ready!</h1>
  </div>
  <div class="content">
    <p>Great news! Your render of <strong>{{projectName}}</strong> has completed successfully.</p>

    <a href="{{downloadUrl}}" class="button">Download Video</a>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Format</div>
        <div class="stat-value">{{format}}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Resolution</div>
        <div class="stat-value">{{resolution}}</div>
      </div>
      <div class="stat">
        <div class="stat-label">File Size</div>
        <div class="stat-value">{{fileSize}}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Render Time</div>
        <div class="stat-value">{{duration}}</div>
      </div>
    </div>

    <p>Your download link will be available for 7 days.</p>
  </div>
  <div class="footer">
    <p>Exprsn - Create amazing videos</p>
  </div>
</body>
</html>`,

      'render-failed': `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
    .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .error-message { color: #b91c1c; font-family: monospace; font-size: 14px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; color: #64748b; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Render Failed</h1>
  </div>
  <div class="content">
    <p>Unfortunately, your render of <strong>{{projectName}}</strong> encountered an error.</p>

    <div class="error-box">
      <p class="error-message">{{errorMessage}}</p>
    </div>

    <p>Don't worry - your project is safe. You can try rendering again or contact support if the problem persists.</p>

    {{#if retryUrl}}
    <a href="{{retryUrl}}" class="button">Try Again</a>
    {{/if}}
  </div>
  <div class="footer">
    <p>Need help? Contact support@exprsn.io</p>
  </div>
</body>
</html>`,
    };

    let html = templates[template] || '';

    // Simple template variable replacement
    for (const [key, value] of Object.entries(vars)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    // Handle conditional blocks (simple implementation)
    html = html.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (_, varName, content) => {
      return vars[varName] ? content : '';
    });

    return html;
  }

  private stripHtml(html: string): string {
    let result = html;
    // Loop until no more style tags can be removed (prevents bypass via nested fragments)
    let prev = '';
    while (prev !== result) {
      prev = result;
      result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    }
    // Loop until no more HTML tags can be removed
    prev = '';
    while (prev !== result) {
      prev = result;
      result = result.replace(/<[^>]+>/g, '');
    }
    return result.replace(/\s+/g, ' ').trim();
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}
