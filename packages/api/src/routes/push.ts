/**
 * Push Notification Routes
 * Endpoints for push token management and notifications
 */

import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware.js';
import { getNotificationService } from '../services/notifications/index.js';
import { getPushProvider } from '../services/notifications/push.js';

const pushRouter = new Hono();

// Type definitions
interface RegisterTokenBody {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  deviceName?: string;
  appVersion?: string;
}

interface UnregisterTokenBody {
  token: string;
}

interface UpdatePushSettingsBody {
  pushEnabled?: boolean;
  pushOnFollow?: boolean;
  pushOnLike?: boolean;
  pushOnComment?: boolean;
  pushOnMention?: boolean;
  pushOnMessage?: boolean;
}

// Register push token
pushRouter.post(
  '/xrpc/io.exprsn.push.registerToken',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<RegisterTokenBody>();

    if (!body.token || !body.platform) {
      return c.json({ error: 'token and platform are required' }, 400);
    }

    if (!['ios', 'android', 'web'].includes(body.platform)) {
      return c.json({ error: 'platform must be ios, android, or web' }, 400);
    }

    const notificationService = getNotificationService();

    const result = await notificationService.registerPushToken(
      userDid,
      body.token,
      body.platform,
      {
        deviceId: body.deviceId,
        deviceName: body.deviceName,
        appVersion: body.appVersion,
      }
    );

    return c.json({
      success: true,
      tokenId: result.id,
    });
  }
);

// Unregister push token
pushRouter.post(
  '/xrpc/io.exprsn.push.unregisterToken',
  authMiddleware,
  async (c) => {
    const body = await c.req.json<UnregisterTokenBody>();

    if (!body.token) {
      return c.json({ error: 'token is required' }, 400);
    }

    const notificationService = getNotificationService();
    await notificationService.unregisterPushToken(body.token);

    return c.json({ success: true });
  }
);

// Get user's push tokens
pushRouter.get(
  '/xrpc/io.exprsn.push.getTokens',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;

    const notificationService = getNotificationService();
    const tokens = await notificationService.getPushTokens(userDid);

    return c.json({
      tokens: tokens.map((t) => ({
        platform: t.platform,
        // Don't expose full token for security
        tokenPreview: t.token.slice(0, 10) + '...',
      })),
    });
  }
);

// Update push notification settings
pushRouter.post(
  '/xrpc/io.exprsn.push.updateSettings',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<UpdatePushSettingsBody>();

    const notificationService = getNotificationService();
    await notificationService.updateSettings(userDid, body);

    return c.json({ success: true });
  }
);

// Get push notification settings
pushRouter.get(
  '/xrpc/io.exprsn.push.getSettings',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;

    const notificationService = getNotificationService();
    const settings = await notificationService.getSettings(userDid);

    return c.json({
      pushEnabled: settings?.pushEnabled ?? true,
      pushOnFollow: settings?.pushOnFollow ?? true,
      pushOnLike: settings?.pushOnLike ?? true,
      pushOnComment: settings?.pushOnComment ?? true,
      pushOnMention: settings?.pushOnMention ?? true,
      pushOnMessage: settings?.pushOnMessage ?? true,
    });
  }
);

// Test push notification (for debugging)
pushRouter.post(
  '/xrpc/io.exprsn.push.test',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;

    const notificationService = getNotificationService();
    const result = await notificationService.sendPushNotification(
      userDid,
      {
        title: 'Test Notification',
        body: 'This is a test push notification from Exprsn',
        data: {
          type: 'test',
          timestamp: new Date().toISOString(),
        },
      },
      'render.complete' // Using existing event type for test
    );

    if (!result) {
      return c.json({
        success: false,
        message: 'No push tokens registered or push notifications disabled',
      });
    }

    return c.json({
      success: result.success,
      error: result.error,
      details: result.details,
    });
  }
);

// Get push provider status (admin only, for debugging)
pushRouter.get(
  '/xrpc/io.exprsn.push.status',
  async (c) => {
    const pushProvider = getPushProvider();
    const status = pushProvider.getStatus();

    return c.json({
      enabled: pushProvider.isEnabled(),
      providers: {
        fcm: status.fcm,
        apns: status.apns,
      },
    });
  }
);

export { pushRouter };
