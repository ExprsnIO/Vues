import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { socialRouter } from '../../src/routes/social.js';
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
      reposts: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      bookmarks: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      videos: {
        findFirst: vi.fn(() => Promise.resolve({
          uri: 'at://test/video/123',
          authorDid: 'did:web:test.exprsn.local:user:other',
          videoUrl: 'https://cdn.test.com/video.mp4',
          caption: 'Test video',
        })),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      users: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({})),
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
        where: vi.fn(() => ({})),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })),
    })),
  },
  reposts: {},
  bookmarks: {},
  videos: {},
  users: {},
}));

describe('Social Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    app.route('/xrpc', socialRouter);
    vi.clearAllMocks();
  });

  describe('Repost Operations', () => {
    describe('POST /xrpc/io.exprsn.video.repost', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.repost', {
          body: { uri: 'at://test/video/123' },
        });

        expect(res.status).toBe(401);
      });

      it('should require uri', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.repost', {
          headers: authHeader('exp_testtoken'),
          body: {},
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /xrpc/io.exprsn.video.unrepost', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.unrepost', {
          body: { uri: 'at://test/video/123' },
        });

        expect(res.status).toBe(401);
      });

      it('should require uri', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.unrepost', {
          headers: authHeader('exp_testtoken'),
          body: {},
        });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /xrpc/io.exprsn.video.getReposts', () => {
      it('should require did', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getReposts');

        expect(res.status).toBe(400);
      });

      it('should return reposts list', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getReposts', {
          query: { did: 'did:web:test.exprsn.local:user:testuser' },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.reposts).toBeDefined();
      });
    });
  });

  describe('Bookmark Operations', () => {
    describe('POST /xrpc/io.exprsn.video.bookmark', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.bookmark', {
          body: { uri: 'at://test/video/123' },
        });

        expect(res.status).toBe(401);
      });

      it('should require uri', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.bookmark', {
          headers: authHeader('exp_testtoken'),
          body: {},
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /xrpc/io.exprsn.video.unbookmark', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.unbookmark', {
          body: { uri: 'at://test/video/123' },
        });

        expect(res.status).toBe(401);
      });
    });

    describe('GET /xrpc/io.exprsn.video.getBookmarks', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getBookmarks');

        expect(res.status).toBe(401);
      });

      it('should return bookmarks list', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getBookmarks', {
          headers: authHeader('exp_testtoken'),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.bookmarks).toBeDefined();
      });

      it('should support pagination', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getBookmarks', {
          headers: authHeader('exp_testtoken'),
          query: { cursor: 'somecursor', limit: '10' },
        });

        expect(res.status).toBe(200);
      });
    });
  });
});
