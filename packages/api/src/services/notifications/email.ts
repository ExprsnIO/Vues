import nodemailer, { Transporter } from 'nodemailer';
import type { EmailOptions, EmailDeliveryResult, RenderCompletePayload, RenderFailedPayload } from './types.js';

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

  private renderTemplate(
    template: 'render-complete' | 'render-failed',
    vars: Record<string, string>
  ): string {
    const templates: Record<string, string> = {
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
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
