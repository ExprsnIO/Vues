import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { notificationRouter } from '../../src/routes/notification.js';
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
vi.mock('../../src/db/index.js', () => ({
  db: {
    query: {
      notifications: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      users: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      notificationSeenAt: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      notificationSubscriptions: {
        findFirst: vi.fn(() => Promise.resolve({
          userDid: 'did:web:test.exprsn.local:user:testuser',
          likes: true,
          comments: true,
          follows: true,
          mentions: true,
          reposts: true,
        })),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    })),
  },
  notifications: {},
  users: {},
  notificationSeenAt: {},
  notificationSubscriptions: {},
}));

describe('Notification Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    app.route('/xrpc', notificationRouter);
    vi.clearAllMocks();
  });

  describe('GET /xrpc/io.exprsn.notification.listNotifications', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.listNotifications');

      expect(res.status).toBe(401);
    });

    it('should return notifications list', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.listNotifications', {
        headers: authHeader('exp_testtoken'),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notifications).toBeDefined();
      expect(Array.isArray(data.notifications)).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.listNotifications', {
        headers: authHeader('exp_testtoken'),
        query: { cursor: 'somecursor', limit: '20' },
      });

      expect(res.status).toBe(200);
    });

    it('should support filter parameter', async () => {
      const filters = ['all', 'likes', 'comments', 'follows', 'mentions'];

      for (const filter of filters) {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.listNotifications', {
          headers: authHeader('exp_testtoken'),
          query: { filter },
        });

        expect(res.status).toBe(200);
      }
    });
  });

  describe('GET /xrpc/io.exprsn.notification.getUnreadCount', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.getUnreadCount');

      expect(res.status).toBe(401);
    });

    it('should return unread count', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.getUnreadCount', {
        headers: authHeader('exp_testtoken'),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.count).toBe('number');
    });
  });

  describe('POST /xrpc/io.exprsn.notification.updateSeen', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.notification.updateSeen', {
        body: {},
      });

      expect(res.status).toBe(401);
    });

    it('should update seen timestamp', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.notification.updateSeen', {
        headers: authHeader('exp_testtoken'),
        body: { seenAt: new Date().toISOString() },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /xrpc/io.exprsn.notification.getSubscription', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.getSubscription');

      expect(res.status).toBe(401);
    });

    it('should return subscription settings', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.notification.getSubscription', {
        headers: authHeader('exp_testtoken'),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.subscription).toBeDefined();
    });
  });

  describe('POST /xrpc/io.exprsn.notification.updateSubscription', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.notification.updateSubscription', {
        body: { likes: false },
      });

      expect(res.status).toBe(401);
    });

    it('should update subscription settings', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.notification.updateSubscription', {
        headers: authHeader('exp_testtoken'),
        body: {
          likes: false,
          comments: true,
          follows: true,
          mentions: false,
        },
      });

      // Should not be unauthorized
      expect(res.status).not.toBe(401);
    });
  });
});
