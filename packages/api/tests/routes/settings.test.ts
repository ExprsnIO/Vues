import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { settingsRouter } from '../../src/routes/settings.js';
import { testRequest, authHeader, createTestApp } from '../helpers.js';

// Mock the auth middleware
vi.mock('../../src/auth/middleware.js', () => ({
  authMiddleware: vi.fn(async (c, next) => {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return c.json({ message: 'Unauthorized' }, 401);
    }
    c.set('did', 'did:web:test.exprsn.local:user:testuser');
    await next();
  }),
  optionalAuthMiddleware: vi.fn(async (c, next) => {
    const auth = c.req.header('Authorization');
    if (auth?.startsWith('Bearer ')) {
      c.set('did', 'did:web:test.exprsn.local:user:testuser');
    }
    await next();
  }),
}));

// Mock the database
const mockSettings = {
  userDid: 'did:web:test.exprsn.local:user:testuser',
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock('../../src/db/index.js', () => ({
  db: {
    query: {
      userSettings: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  },
  userSettings: {},
}));

describe('Settings Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    app.route('/xrpc', settingsRouter);
    vi.clearAllMocks();
  });

  describe('GET /xrpc/io.exprsn.settings.getSettings', () => {
    it('should return default settings for unauthenticated users', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.settings.getSettings');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.settings).toBeDefined();
      expect(data.settings.themeId).toBe('slate');
      expect(data.settings.colorMode).toBe('dark');
    });

    it('should return default settings for authenticated users without saved settings', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.settings.getSettings', {
        headers: authHeader('exp_testtoken'),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.settings).toBeDefined();
      expect(data.settings.themeId).toBeDefined();
    });
  });

  describe('POST /xrpc/io.exprsn.settings.updateSettings', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.updateSettings', {
        body: { themeId: 'ocean' },
      });

      expect(res.status).toBe(401);
    });

    it('should validate themeId', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.updateSettings', {
        headers: authHeader('exp_testtoken'),
        body: { themeId: 'invalid_theme' },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      // Zod returns "Invalid enum value" for invalid enum values
      expect(data.message).toMatch(/Invalid (theme|enum value)/);
    });

    it('should validate colorMode', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.updateSettings', {
        headers: authHeader('exp_testtoken'),
        body: { colorMode: 'invalid_mode' },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      // Zod returns "Invalid enum value" for invalid enum values
      expect(data.message).toMatch(/Invalid (color mode|enum value)/);
    });

    it('should accept valid themeId values', async () => {
      const validThemes = ['ocean', 'forest', 'sunset', 'lavender', 'slate'];

      for (const theme of validThemes) {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.updateSettings', {
          headers: authHeader('exp_testtoken'),
          body: { themeId: theme },
        });

        // Should not return 400 for valid theme
        expect(res.status).not.toBe(400);
      }
    });

    it('should accept valid colorMode values', async () => {
      const validModes = ['light', 'dark', 'system'];

      for (const mode of validModes) {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.updateSettings', {
          headers: authHeader('exp_testtoken'),
          body: { colorMode: mode },
        });

        // Should not return 400 for valid color mode
        expect(res.status).not.toBe(400);
      }
    });

    it('should accept partial updates', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.updateSettings', {
        headers: authHeader('exp_testtoken'),
        body: {
          playback: { autoplay: false },
        },
      });

      // Should not fail
      expect(res.status).not.toBe(400);
    });

    it('should accept privacy settings updates', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.updateSettings', {
        headers: authHeader('exp_testtoken'),
        body: {
          privacy: {
            privateAccount: true,
            showActivityStatus: false,
          },
        },
      });

      expect(res.status).not.toBe(400);
    });
  });

  describe('POST /xrpc/io.exprsn.settings.resetSettings', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.resetSettings');

      expect(res.status).toBe(401);
    });

    it('should return default settings after reset', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.settings.resetSettings', {
        headers: authHeader('exp_testtoken'),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.settings).toBeDefined();
      expect(data.settings.themeId).toBe('slate');
      expect(data.settings.colorMode).toBe('dark');
    });
  });
});
