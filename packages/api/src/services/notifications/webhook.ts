import crypto from 'crypto';
import type { NotificationPayload, WebhookDeliveryResult } from './types.js';

export interface WebhookConfig {
  url: string;
  secret?: string;
  timeout?: number;
  retries?: number;
}

export class WebhookProvider {
  private defaultTimeout: number;
  private defaultRetries: number;

  constructor(options?: { timeout?: number; retries?: number }) {
    this.defaultTimeout = options?.timeout || 10000; // 10 seconds
    this.defaultRetries = options?.retries || 3;
  }

  /**
   * Sign a payload with HMAC-SHA256
   */
  sign(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify a webhook signature
   */
  verify(payload: string, signature: string, secret: string): boolean {
    const expected = this.sign(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  /**
   * Send a webhook notification
   */
  async send(
    config: WebhookConfig,
    payload: NotificationPayload
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const payloadString = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Exprsn-Webhooks/1.0',
      'X-Exprsn-Event': payload.event,
      'X-Exprsn-Delivery': crypto.randomUUID(),
      'X-Exprsn-Timestamp': new Date().toISOString(),
    };

    // Add signature if secret is provided
    if (config.secret) {
      const signature = this.sign(payloadString, config.secret);
      headers['X-Exprsn-Signature'] = `sha256=${signature}`;
    }

    const retries = config.retries ?? this.defaultRetries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          config.timeout || this.defaultTimeout
        );

        const response = await fetch(config.url, {
          method: 'POST',
          headers,
          body: payloadString,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const responseBody = await response.text();
        const duration = Date.now() - startTime;

        if (response.ok) {
          return {
            success: true,
            statusCode: response.status,
            responseBody,
            duration,
          };
        }

        // Non-2xx response
        lastError = new Error(`HTTP ${response.status}: ${responseBody}`);

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          return {
            success: false,
            statusCode: response.status,
            responseBody,
            error: lastError.message,
            duration,
          };
        }

        // Retry on server errors (5xx)
        if (attempt < retries) {
          // Exponential backoff: 1s, 2s, 4s...
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error');

        if (attempt < retries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      duration: Date.now() - startTime,
    };
  }

  /**
   * Send multiple webhooks in parallel
   */
  async sendBatch(
    configs: WebhookConfig[],
    payload: NotificationPayload
  ): Promise<Map<string, WebhookDeliveryResult>> {
    const results = new Map<string, WebhookDeliveryResult>();

    const deliveries = configs.map(async (config) => {
      const result = await this.send(config, payload);
      results.set(config.url, result);
    });

    await Promise.all(deliveries);
    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
