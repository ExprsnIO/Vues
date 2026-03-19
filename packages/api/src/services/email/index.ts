/**
 * Email Service
 *
 * Standalone nodemailer-backed email service for transactional emails.
 * Complements the existing NotificationService/EmailProvider by providing
 * a simpler fire-and-forget interface for common email types.
 *
 * nodemailer (^8.0.1) is already listed in package.json dependencies.
 * @types/nodemailer (^7.0.11) is already listed in devDependencies.
 *
 * MailHog is available in docker-compose for local dev:
 *   SMTP on port 1025, UI on port 8025
 */

import { createTransport, type Transporter } from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  initialize(): void {
    const host = process.env.SMTP_HOST || 'localhost';
    const port = parseInt(process.env.SMTP_PORT || '1025', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    this.transporter = createTransport({
      host,
      port,
      secure,
      // MailHog does not require auth; omit when credentials are absent
      auth: user && pass ? { user, pass } : undefined,
    });

    console.log(`[email] Service initialized (${host}:${port})`);
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn('[email] Service not initialized, skipping email');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Exprsn" <noreply@exprsn.app>',
        ...options,
      });
      console.log(`[email] Sent to ${options.to}: ${options.subject}`);
      return true;
    } catch (err) {
      console.error(`[email] Failed to send to ${options.to}:`, err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Pre-built email senders
  // ---------------------------------------------------------------------------

  async sendWelcome(to: string, handle: string, displayName?: string): Promise<boolean> {
    return this.send({
      to,
      subject: `Welcome to Exprsn, ${displayName || `@${handle}`}!`,
      html: this.welcomeTemplate(handle, displayName),
      text: `Welcome to Exprsn! Start exploring at ${process.env.APP_URL || 'https://exprsn.app'}`,
    });
  }

  async sendPasswordReset(to: string, token: string, handle: string): Promise<boolean> {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    return this.send({
      to,
      subject: 'Reset your Exprsn password',
      html: this.passwordResetTemplate(handle, resetUrl),
      text: `Reset your password: ${resetUrl}`,
    });
  }

  async sendDigest(
    to: string,
    handle: string,
    stats: {
      newFollowers: number;
      newLikes: number;
      newComments: number;
      topVideoCaption?: string;
      topVideoViews?: number;
    }
  ): Promise<boolean> {
    return this.send({
      to,
      subject: 'Your weekly Exprsn recap',
      html: this.digestTemplate(handle, stats),
      text: `You got ${stats.newFollowers} new followers, ${stats.newLikes} likes, and ${stats.newComments} comments this week.`,
    });
  }

  async sendMentionNotification(
    to: string,
    mentionedBy: string,
    contentUri: string,
    contentType: string
  ): Promise<boolean> {
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/video/${encodeURIComponent(contentUri)}`;
    return this.send({
      to,
      subject: `@${mentionedBy} mentioned you on Exprsn`,
      html: this.mentionTemplate(mentionedBy, url, contentType),
      text: `@${mentionedBy} mentioned you in a ${contentType}. View it at: ${url}`,
    });
  }

  // ---------------------------------------------------------------------------
  // HTML Templates
  // ---------------------------------------------------------------------------

  private baseTemplate(content: string): string {
    const appUrl = process.env.APP_URL || 'https://exprsn.app';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#f83b85,#e91f63);border-radius:12px;padding:8px 16px;">
        <span style="color:white;font-weight:bold;font-size:18px;">Exprsn</span>
      </div>
    </div>
    <div style="background:#18181b;border-radius:12px;padding:32px;border:1px solid #27272a;">
      ${content}
    </div>
    <div style="text-align:center;margin-top:24px;color:#71717a;font-size:12px;">
      <p>Exprsn &mdash; Express yourself with short-form videos</p>
      <p>
        <a href="${appUrl}/settings" style="color:#71717a;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`;
  }

  private welcomeTemplate(handle: string, displayName?: string): string {
    const appUrl = process.env.APP_URL || 'https://exprsn.app';
    return this.baseTemplate(`
      <h1 style="color:#fafafa;font-size:24px;margin:0 0 16px;">Welcome to Exprsn!</h1>
      <p style="color:#a1a1aa;font-size:16px;line-height:1.6;">
        Hey ${displayName || `@${handle}`}, we're thrilled to have you on board.
      </p>
      <p style="color:#a1a1aa;font-size:16px;line-height:1.6;">Here's what you can do:</p>
      <ul style="color:#a1a1aa;font-size:14px;line-height:2;">
        <li>Create and share short-form videos</li>
        <li>Discover trending content and creators</li>
        <li>Connect with others through comments and DMs</li>
        <li>Join challenges and grow your audience</li>
      </ul>
      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}" style="display:inline-block;background:#f83b85;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">
          Start Exploring
        </a>
      </div>
    `);
  }

  private passwordResetTemplate(handle: string, resetUrl: string): string {
    return this.baseTemplate(`
      <h1 style="color:#fafafa;font-size:24px;margin:0 0 16px;">Reset Your Password</h1>
      <p style="color:#a1a1aa;font-size:16px;line-height:1.6;">
        Hi @${handle}, we received a request to reset your password.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#f83b85;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
      </div>
      <p style="color:#71717a;font-size:13px;">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
    `);
  }

  private digestTemplate(
    handle: string,
    stats: {
      newFollowers: number;
      newLikes: number;
      newComments: number;
      topVideoCaption?: string;
      topVideoViews?: number;
    }
  ): string {
    const appUrl = process.env.APP_URL || 'https://exprsn.app';
    const topVideoRow =
      stats.topVideoCaption
        ? `<p style="color:#a1a1aa;font-size:14px;">
             Your top video &ldquo;${stats.topVideoCaption}&rdquo; got ${(stats.topVideoViews ?? 0).toLocaleString()} views!
           </p>`
        : '';

    return this.baseTemplate(`
      <h1 style="color:#fafafa;font-size:24px;margin:0 0 16px;">Your Weekly Recap</h1>
      <p style="color:#a1a1aa;font-size:16px;line-height:1.6;">Here's what happened this week, @${handle}:</p>
      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin:16px 0;">
        <tr>
          <td style="background:#27272a;border-radius:8px;padding:16px;text-align:center;">
            <div style="color:#fafafa;font-size:24px;font-weight:bold;">${stats.newFollowers}</div>
            <div style="color:#71717a;font-size:12px;">New Followers</div>
          </td>
          <td style="background:#27272a;border-radius:8px;padding:16px;text-align:center;">
            <div style="color:#fafafa;font-size:24px;font-weight:bold;">${stats.newLikes}</div>
            <div style="color:#71717a;font-size:12px;">Likes</div>
          </td>
          <td style="background:#27272a;border-radius:8px;padding:16px;text-align:center;">
            <div style="color:#fafafa;font-size:24px;font-weight:bold;">${stats.newComments}</div>
            <div style="color:#71717a;font-size:12px;">Comments</div>
          </td>
        </tr>
      </table>
      ${topVideoRow}
      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}/analytics" style="display:inline-block;background:#f83b85;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">
          View Full Analytics
        </a>
      </div>
    `);
  }

  private mentionTemplate(mentionedBy: string, url: string, contentType: string): string {
    return this.baseTemplate(`
      <h1 style="color:#fafafa;font-size:24px;margin:0 0 16px;">You were mentioned!</h1>
      <p style="color:#a1a1aa;font-size:16px;line-height:1.6;">
        @${mentionedBy} mentioned you in a ${contentType}.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${url}" style="display:inline-block;background:#f83b85;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">
          View ${contentType}
        </a>
      </div>
    `);
  }
}

export const emailService = new EmailService();
