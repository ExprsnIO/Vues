import type {
  PushNotificationOptions,
  PushDeliveryResult,
  PushPlatform,
  FCMMessage,
} from './types.js';

// Firebase Admin SDK types (loaded dynamically to avoid bundling issues)
interface FirebaseAdmin {
  messaging(): {
    send(message: FCMMessage): Promise<string>;
    sendEachForMulticast(message: FCMMessage): Promise<{
      successCount: number;
      failureCount: number;
      responses: Array<{ success: boolean; messageId?: string; error?: { code: string } }>;
    }>;
  };
}

let firebaseAdmin: FirebaseAdmin | null = null;

// APNs client for direct iOS push (optional, FCM can handle iOS too)
interface APNsClient {
  send(notification: unknown, tokens: string[]): Promise<{
    sent: Array<{ device: string }>;
    failed: Array<{ device: string; response: { reason: string } }>;
  }>;
}

let apnsClient: APNsClient | null = null;

// Helper to safely import optional modules
async function safeImport(moduleName: string): Promise<any> {
  try {
    // @ts-ignore - Dynamic import of optional peer dependency
    return await import(moduleName);
  } catch {
    return null;
  }
}

export class PushProvider {
  private fcmEnabled: boolean;
  private apnsEnabled: boolean;

  constructor() {
    this.fcmEnabled = false;
    this.apnsEnabled = false;
    this.initializeProviders();
  }

  private async initializeProviders() {
    // Initialize FCM
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      try {
        // Dynamic import with proper error handling
        const admin = await safeImport('firebase-admin');

        if (!admin) {
          console.log('firebase-admin module not installed, skipping FCM initialization');
          return;
        }

        if (!admin.apps?.length) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
          });
        }

        firebaseAdmin = admin as unknown as FirebaseAdmin;
        this.fcmEnabled = true;
        console.log('FCM push notifications enabled');
      } catch (error) {
        console.warn('Failed to initialize Firebase Admin:', error);
      }
    } else {
      console.log('FCM not configured (missing FIREBASE_PROJECT_ID or FIREBASE_PRIVATE_KEY)');
    }

    // Initialize APNs (optional - FCM can handle iOS via FCM tokens)
    if (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY_PATH) {
      try {
        // Dynamic import with proper error handling
        const apn = await safeImport('apn');

        if (!apn) {
          console.log('apn module not installed, skipping APNs initialization');
          return;
        }

        apnsClient = new apn.Provider({
          token: {
            key: process.env.APNS_KEY_PATH,
            keyId: process.env.APNS_KEY_ID,
            teamId: process.env.APNS_TEAM_ID,
          },
          production: process.env.NODE_ENV === 'production',
        }) as APNsClient;

        this.apnsEnabled = true;
        console.log('APNs push notifications enabled');
      } catch (error) {
        console.warn('APNs not configured or failed to initialize:', error);
      }
    }
  }

  /**
   * Send push notification to a single token
   */
  async sendToToken(
    token: string,
    platform: PushPlatform,
    options: PushNotificationOptions
  ): Promise<PushDeliveryResult> {
    if (platform === 'ios' && this.apnsEnabled && apnsClient) {
      return this.sendViaAPNs([token], options);
    }

    if (this.fcmEnabled && firebaseAdmin) {
      return this.sendViaFCM([token], options);
    }

    return {
      success: false,
      successCount: 0,
      failureCount: 1,
      invalidTokens: [],
      error: 'No push provider configured',
    };
  }

  /**
   * Send push notification to multiple tokens
   */
  async sendToTokens(
    tokens: Array<{ token: string; platform: PushPlatform }>,
    options: PushNotificationOptions
  ): Promise<PushDeliveryResult> {
    if (tokens.length === 0) {
      return {
        success: true,
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      };
    }

    // Group by platform
    const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
    const androidWebTokens = tokens.filter((t) => t.platform !== 'ios').map((t) => t.token);

    const results: PushDeliveryResult[] = [];

    // Send to iOS via APNs if available, otherwise FCM
    if (iosTokens.length > 0) {
      if (this.apnsEnabled && apnsClient) {
        results.push(await this.sendViaAPNs(iosTokens, options));
      } else if (this.fcmEnabled && firebaseAdmin) {
        results.push(await this.sendViaFCM(iosTokens, options));
      }
    }

    // Send to Android/Web via FCM
    if (androidWebTokens.length > 0 && this.fcmEnabled && firebaseAdmin) {
      results.push(await this.sendViaFCM(androidWebTokens, options));
    }

    // Merge results
    return this.mergeResults(results);
  }

  /**
   * Send push notification via FCM
   */
  private async sendViaFCM(
    tokens: string[],
    options: PushNotificationOptions
  ): Promise<PushDeliveryResult> {
    if (!firebaseAdmin) {
      return {
        success: false,
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
        error: 'FCM not initialized',
      };
    }

    try {
      const message: FCMMessage = {
        tokens,
        notification: {
          title: options.title,
          body: options.body,
          imageUrl: options.imageUrl,
        },
        data: options.data,
        android: {
          priority: options.priority === 'high' ? 'high' : 'normal',
          ttl: options.ttl ? `${options.ttl}s` : undefined,
          notification: {
            channelId: options.channelId || 'default',
            sound: options.sound || 'default',
            clickAction: options.clickAction,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: options.title,
                subtitle: options.subtitle,
                body: options.body,
              },
              badge: options.badge,
              sound: options.sound || 'default',
              'thread-id': options.threadId,
              'mutable-content': options.imageUrl ? 1 : 0,
            },
          },
        },
        webpush: {
          notification: {
            icon: '/icon-192.png',
            badge: '/badge-72.png',
          },
          fcmOptions: {
            link: options.clickAction,
          },
        },
      };

      if (tokens.length === 1) {
        // Single token - use send
        message.token = tokens[0];
        delete message.tokens;

        await firebaseAdmin.messaging().send(message);

        return {
          success: true,
          successCount: 1,
          failureCount: 0,
          invalidTokens: [],
        };
      } else {
        // Multiple tokens - use sendEachForMulticast
        const response = await firebaseAdmin.messaging().sendEachForMulticast(message);

        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
            const token = tokens[idx];
            if (token) {
              invalidTokens.push(token);
            }
          }
        });

        return {
          success: response.successCount > 0,
          successCount: response.successCount,
          failureCount: response.failureCount,
          invalidTokens,
        };
      }
    } catch (error) {
      console.error('FCM send error:', error);
      return {
        success: false,
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
        error: error instanceof Error ? error.message : 'FCM send failed',
      };
    }
  }

  /**
   * Send push notification via APNs (direct iOS push)
   */
  private async sendViaAPNs(
    tokens: string[],
    options: PushNotificationOptions
  ): Promise<PushDeliveryResult> {
    if (!apnsClient) {
      return {
        success: false,
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
        error: 'APNs not initialized',
      };
    }

    try {
      // Dynamic import to avoid bundling issues
      const apn = await safeImport('apn');

      if (!apn) {
        return {
          success: false,
          successCount: 0,
          failureCount: tokens.length,
          invalidTokens: [],
          error: 'apn module not installed',
        };
      }

      const notification = new apn.Notification();
      notification.alert = {
        title: options.title,
        subtitle: options.subtitle,
        body: options.body,
      };
      notification.badge = options.badge;
      notification.sound = options.sound || 'default';
      notification.threadId = options.threadId;
      notification.payload = options.data || {};
      notification.topic = process.env.APNS_BUNDLE_ID || 'io.exprsn.app';

      if (options.imageUrl) {
        notification.mutableContent = 1;
        notification.payload['image-url'] = options.imageUrl;
      }

      const response = await apnsClient.send(notification, tokens);

      const invalidTokens = response.failed
        .filter((f) => f.response.reason === 'BadDeviceToken' || f.response.reason === 'Unregistered')
        .map((f) => f.device);

      return {
        success: response.sent.length > 0,
        successCount: response.sent.length,
        failureCount: response.failed.length,
        invalidTokens,
      };
    } catch (error) {
      console.error('APNs send error:', error);
      return {
        success: false,
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
        error: error instanceof Error ? error.message : 'APNs send failed',
      };
    }
  }

  /**
   * Merge multiple delivery results
   */
  private mergeResults(results: PushDeliveryResult[]): PushDeliveryResult {
    if (results.length === 0) {
      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
        error: 'No push provider available',
      };
    }

    const merged: PushDeliveryResult = {
      success: results.some((r) => r.success),
      successCount: results.reduce((sum, r) => sum + r.successCount, 0),
      failureCount: results.reduce((sum, r) => sum + r.failureCount, 0),
      invalidTokens: results.flatMap((r) => r.invalidTokens),
    };

    const errors = results.filter((r) => r.error).map((r) => r.error);
    if (errors.length > 0) {
      merged.error = errors.join('; ');
    }

    return merged;
  }

  /**
   * Check if push is enabled
   */
  isEnabled(): boolean {
    return this.fcmEnabled || this.apnsEnabled;
  }

  /**
   * Get status
   */
  getStatus(): { fcm: boolean; apns: boolean } {
    return {
      fcm: this.fcmEnabled,
      apns: this.apnsEnabled,
    };
  }
}

// Singleton instance
let pushProviderInstance: PushProvider | null = null;

export function getPushProvider(): PushProvider {
  if (!pushProviderInstance) {
    pushProviderInstance = new PushProvider();
  }
  return pushProviderInstance;
}
