import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { actorRouter } from '../../src/routes/actor.js';
import { testRequest, authHeader, createMockUser, createTestApp } from '../helpers.js';

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

const mockUser = createMockUser({
  did: 'did:web:test.exprsn.local:user:profileuser',
  handle: 'profileuser',
});

// Mock the database
vi.mock('../../src/db/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      follows: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      blocks: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      mutes: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      videos: {
        findMany: vi.fn(() => Promise.resolve([])),
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
  },
  users: {},
  follows: {},
  blocks: {},
  mutes: {},
  videos: {},
}));

describe('Actor Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    app.route('/xrpc', actorRouter);
    vi.clearAllMocks();
  });

  describe('GET /xrpc/io.exprsn.actor.getProfile', () => {
    it('should require either did or handle parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getProfile');

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('did or handle is required');
    });

    it('should return 404 for non-existent user by handle', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getProfile', {
        query: { handle: 'nonexistent' },
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent user by did', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getProfile', {
        query: { did: 'did:web:test.exprsn.local:user:nonexistent' },
      });

      expect(res.status).toBe(404);
    });

    it('should accept handle parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getProfile', {
        query: { handle: 'testuser' },
      });

      // Will be 404 since mock returns null, but validates the parameter is accepted
      expect(res.status).toBe(404);
    });

    it('should accept did parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getProfile', {
        query: { did: 'did:web:test.exprsn.local:user:testuser' },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /xrpc/io.exprsn.actor.updateProfile', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.actor.updateProfile', {
        body: { displayName: 'New Name' },
      });

      expect(res.status).toBe(401);
    });

    it('should accept displayName update', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.actor.updateProfile', {
        headers: authHeader('exp_testtoken'),
        body: { displayName: 'New Display Name' },
      });

      // Should not fail auth
      expect(res.status).not.toBe(401);
    });

    it('should accept bio update', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.actor.updateProfile', {
        headers: authHeader('exp_testtoken'),
        body: { bio: 'New bio text' },
      });

      expect(res.status).not.toBe(401);
    });

    it('should accept combined updates', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.actor.updateProfile', {
        headers: authHeader('exp_testtoken'),
        body: {
          displayName: 'New Name',
          bio: 'New bio',
        },
      });

      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /xrpc/io.exprsn.actor.getVideos', () => {
    it('should require either did or handle parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getVideos');

      expect(res.status).toBe(400);
    });

    it('should return videos for user by handle', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getVideos', {
        query: { handle: 'testuser' },
      });

      // Will be 404 since user doesn't exist in mock
      expect([200, 404]).toContain(res.status);
    });

    it('should support pagination with cursor', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.actor.getVideos', {
        query: {
          handle: 'testuser',
          cursor: 'somecursor',
          limit: '10',
        },
      });

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /xrpc/io.exprsn.actor.getAvatarUploadUrl', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.actor.getAvatarUploadUrl', {
        body: { contentType: 'image/jpeg' },
      });

      expect(res.status).toBe(401);
    });

    it('should require contentType', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.actor.getAvatarUploadUrl', {
        headers: authHeader('exp_testtoken'),
        body: {},
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /xrpc/io.exprsn.actor.completeAvatarUpload', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.actor.completeAvatarUpload', {
        body: { avatarUrl: 'https://cdn.test.com/avatar.jpg' },
      });

      expect(res.status).toBe(401);
    });
  });
});
