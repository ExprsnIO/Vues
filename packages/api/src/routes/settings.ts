import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import { db, dbType, userSettings } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type {
  UserSettings,
  UserSettingsUpdate,
  AccessibilitySettings,
  PlaybackSettings,
  NotificationSettings,
  PrivacySettings,
  ContentSettings,
  DEFAULT_SETTINGS,
} from '@exprsn/shared';

export const settingsRouter = new Hono();

// Default settings values
const defaultSettings: Omit<UserSettings, 'updatedAt'> = {
  themeId: 'slate',
  colorMode: 'dark',
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    largeText: false,
    screenReaderOptimized: false,
  },
  playback: {
    autoplay: true,
    defaultQuality: 'auto',
    defaultMuted: false,
    loopVideos: true,
    dataSaver: false,
  },
  notifications: {
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    directMessages: true,
    emailDigest: 'never',
  },
  privacy: {
    privateAccount: false,
    showActivityStatus: true,
    allowDuets: true,
    allowStitches: true,
    allowComments: 'everyone',
    allowMessages: 'everyone',
  },
  content: {
    language: 'en',
    contentWarnings: true,
    sensitiveContent: false,
  },
};

/**
 * Get user settings
 * GET /xrpc/io.exprsn.settings.getSettings
 */
settingsRouter.get('/io.exprsn.settings.getSettings', authMiddleware, async (c) => {
  const userDid = c.get('did');

  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userDid, userDid),
  });

  if (!existing) {
    // Return defaults for new users
    return c.json({
      settings: {
        ...defaultSettings,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // Merge stored settings with defaults to ensure all fields are present
  const settings: UserSettings = {
    themeId: existing.themeId as UserSettings['themeId'],
    colorMode: existing.colorMode as UserSettings['colorMode'],
    accessibility: {
      ...defaultSettings.accessibility,
      ...(existing.accessibility as AccessibilitySettings | null),
    },
    playback: {
      ...defaultSettings.playback,
      ...(existing.playback as PlaybackSettings | null),
    },
    notifications: {
      ...defaultSettings.notifications,
      ...(existing.notifications as NotificationSettings | null),
    },
    privacy: {
      ...defaultSettings.privacy,
      ...(existing.privacy as PrivacySettings | null),
    },
    content: {
      ...defaultSettings.content,
      ...(existing.content as ContentSettings | null),
    },
    updatedAt: existing.updatedAt.toISOString(),
  };

  return c.json({ settings });
});

/**
 * Update user settings (partial)
 * POST /xrpc/io.exprsn.settings.updateSettings
 */
settingsRouter.post('/io.exprsn.settings.updateSettings', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const update = await c.req.json<UserSettingsUpdate>();

  // Validate themeId if provided
  const validThemes = ['ocean', 'forest', 'sunset', 'lavender', 'slate'];
  if (update.themeId && !validThemes.includes(update.themeId)) {
    throw new HTTPException(400, { message: `Invalid theme: ${update.themeId}` });
  }

  // Validate colorMode if provided
  const validColorModes = ['light', 'dark', 'system'];
  if (update.colorMode && !validColorModes.includes(update.colorMode)) {
    throw new HTTPException(400, { message: `Invalid color mode: ${update.colorMode}` });
  }

  // Check if user has existing settings
  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userDid, userDid),
  });

  const now = new Date();

  if (!existing) {
    // Create new settings row
    const newRow = {
      userDid,
      themeId: update.themeId ?? defaultSettings.themeId,
      colorMode: update.colorMode ?? defaultSettings.colorMode,
      accessibility: update.accessibility
        ? { ...defaultSettings.accessibility, ...update.accessibility }
        : defaultSettings.accessibility,
      playback: update.playback
        ? { ...defaultSettings.playback, ...update.playback }
        : defaultSettings.playback,
      notifications: update.notifications
        ? { ...defaultSettings.notifications, ...update.notifications }
        : defaultSettings.notifications,
      privacy: update.privacy
        ? { ...defaultSettings.privacy, ...update.privacy }
        : defaultSettings.privacy,
      content: update.content
        ? { ...defaultSettings.content, ...update.content }
        : defaultSettings.content,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(userSettings).values(newRow);

    return c.json({
      settings: {
        ...newRow,
        updatedAt: now.toISOString(),
      },
    });
  }

  // Merge updates with existing settings
  const updateRow: Record<string, unknown> = {
    updatedAt: now,
  };

  if (update.themeId) {
    updateRow.themeId = update.themeId;
  }

  if (update.colorMode) {
    updateRow.colorMode = update.colorMode;
  }

  if (update.accessibility) {
    updateRow.accessibility = {
      ...(existing.accessibility as AccessibilitySettings | null),
      ...update.accessibility,
    };
  }

  if (update.playback) {
    updateRow.playback = {
      ...(existing.playback as PlaybackSettings | null),
      ...update.playback,
    };
  }

  if (update.notifications) {
    updateRow.notifications = {
      ...(existing.notifications as NotificationSettings | null),
      ...update.notifications,
    };
  }

  if (update.privacy) {
    updateRow.privacy = {
      ...(existing.privacy as PrivacySettings | null),
      ...update.privacy,
    };
  }

  if (update.content) {
    updateRow.content = {
      ...(existing.content as ContentSettings | null),
      ...update.content,
    };
  }

  await db.update(userSettings).set(updateRow).where(eq(userSettings.userDid, userDid));

  // Fetch updated settings
  const updated = await db.query.userSettings.findFirst({
    where: eq(userSettings.userDid, userDid),
  });

  const settings: UserSettings = {
    themeId: updated!.themeId as UserSettings['themeId'],
    colorMode: updated!.colorMode as UserSettings['colorMode'],
    accessibility: {
      ...defaultSettings.accessibility,
      ...(updated!.accessibility as AccessibilitySettings | null),
    },
    playback: {
      ...defaultSettings.playback,
      ...(updated!.playback as PlaybackSettings | null),
    },
    notifications: {
      ...defaultSettings.notifications,
      ...(updated!.notifications as NotificationSettings | null),
    },
    privacy: {
      ...defaultSettings.privacy,
      ...(updated!.privacy as PrivacySettings | null),
    },
    content: {
      ...defaultSettings.content,
      ...(updated!.content as ContentSettings | null),
    },
    updatedAt: updated!.updatedAt.toISOString(),
  };

  return c.json({ settings });
});

/**
 * Reset settings to defaults
 * POST /xrpc/io.exprsn.settings.resetSettings
 */
settingsRouter.post('/io.exprsn.settings.resetSettings', authMiddleware, async (c) => {
  const userDid = c.get('did');

  // Delete existing settings
  await db.delete(userSettings).where(eq(userSettings.userDid, userDid));

  // Return default settings
  return c.json({
    settings: {
      ...defaultSettings,
      updatedAt: new Date().toISOString(),
    },
  });
});
