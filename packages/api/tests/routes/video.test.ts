import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { xrpcRouter } from '../../src/routes/xrpc.js';
import { testRequest, authHeader, createMockVideo, createTestApp } from '../helpers.js';

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
      users: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      videos: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      comments: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      likes: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      views: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      follows: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      sounds: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      tags: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
      commentReactions: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      blocks: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
      mutes: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ uri: 'at://test/video/123' }])),
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
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
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
  users: {},
  videos: {},
  comments: {},
  likes: {},
  views: {},
  follows: {},
  sounds: {},
  tags: {},
  commentReactions: {},
  blocks: {},
  mutes: {},
}));

// Mock cache
vi.mock('../../src/cache/redis.js', () => ({
  getCache: vi.fn(() => Promise.resolve(null)),
  setCache: vi.fn(() => Promise.resolve()),
  deleteCache: vi.fn(() => Promise.resolve()),
}));

describe('Video Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    app.route('/xrpc', xrpcRouter);
    vi.clearAllMocks();
  });

  describe('GET /xrpc/io.exprsn.video.getFeed', () => {
    it('should return feed without authentication', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getFeed', {
        query: { feed: 'trending' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.feed).toBeDefined();
      expect(Array.isArray(data.feed)).toBe(true);
    });

    it('should support different feed types', async () => {
      const feedTypes = ['trending', 'following', 'foryou'];

      for (const feed of feedTypes) {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getFeed', {
          query: { feed },
        });

        expect(res.status).toBe(200);
      }
    });

    it('should support pagination with cursor', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getFeed', {
        query: {
          feed: 'trending',
          cursor: 'somecursor',
          limit: '10',
        },
      });

      expect(res.status).toBe(200);
    });

    it('should default to trending feed', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getFeed');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /xrpc/io.exprsn.video.getVideo', () => {
    it('should require uri parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getVideo');

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('uri');
    });

    it('should return 404 for non-existent video', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getVideo', {
        query: { uri: 'at://test/video/nonexistent' },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /xrpc/io.exprsn.video.getComments', () => {
    it('should require uri parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getComments');

      expect(res.status).toBe(400);
    });

    it('should return comments list', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getComments', {
        query: { uri: 'at://test/video/123' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.comments).toBeDefined();
    });

    it('should support sort parameter', async () => {
      const sortTypes = ['top', 'recent', 'hot'];

      for (const sort of sortTypes) {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getComments', {
          query: { uri: 'at://test/video/123', sort },
        });

        expect(res.status).toBe(200);
      }
    });
  });

  describe('POST /xrpc/io.exprsn.video.uploadVideo', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.uploadVideo', {
        body: { contentType: 'video/mp4' },
      });

      expect(res.status).toBe(401);
    });

    it('should require contentType', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.uploadVideo', {
        headers: authHeader('exp_testtoken'),
        body: {},
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /xrpc/io.exprsn.video.createPost', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.createPost', {
        body: {
          videoUrl: 'https://cdn.test.com/video.mp4',
          caption: 'Test caption',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should require videoUrl', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.createPost', {
        headers: authHeader('exp_testtoken'),
        body: { caption: 'Test caption' },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /xrpc/io.exprsn.video.like', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.like', {
        body: { uri: 'at://test/video/123' },
      });

      expect(res.status).toBe(401);
    });

    it('should require uri', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.like', {
        headers: authHeader('exp_testtoken'),
        body: {},
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /xrpc/io.exprsn.video.unlike', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.unlike', {
        body: { uri: 'at://test/video/123' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /xrpc/io.exprsn.video.trackView', () => {
    it('should require uri', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.trackView', {
        body: {},
      });

      expect(res.status).toBe(400);
    });

    it('should accept view tracking without auth', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.trackView', {
        body: { uri: 'at://test/video/123' },
      });

      // Should not require auth
      expect(res.status).not.toBe(401);
    });
  });

  describe('POST /xrpc/io.exprsn.video.createComment', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.createComment', {
        body: {
          videoUri: 'at://test/video/123',
          text: 'Test comment',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should require videoUri', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.createComment', {
        headers: authHeader('exp_testtoken'),
        body: { text: 'Test comment' },
      });

      expect(res.status).toBe(400);
    });

    it('should require text', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.createComment', {
        headers: authHeader('exp_testtoken'),
        body: { videoUri: 'at://test/video/123' },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /xrpc/io.exprsn.video.deleteComment', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.deleteComment', {
        body: { uri: 'at://test/comment/123' },
      });

      expect(res.status).toBe(401);
    });

    it('should require uri', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.deleteComment', {
        headers: authHeader('exp_testtoken'),
        body: {},
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /xrpc/io.exprsn.video.reactToComment', () => {
    it('should require authentication', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.reactToComment', {
        body: {
          commentUri: 'at://test/comment/123',
          reaction: 'like',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should require commentUri', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.reactToComment', {
        headers: authHeader('exp_testtoken'),
        body: { reaction: 'like' },
      });

      expect(res.status).toBe(400);
    });

    it('should require reaction', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.reactToComment', {
        headers: authHeader('exp_testtoken'),
        body: { commentUri: 'at://test/comment/123' },
      });

      expect(res.status).toBe(400);
    });

    it('should validate reaction type', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.video.reactToComment', {
        headers: authHeader('exp_testtoken'),
        body: {
          commentUri: 'at://test/comment/123',
          reaction: 'invalid_reaction',
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /xrpc/io.exprsn.video.getSounds', () => {
    it('should return sounds list', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getSounds');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sounds).toBeDefined();
    });

    it('should support pagination', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getSounds', {
        query: { cursor: 'somecursor', limit: '10' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /xrpc/io.exprsn.video.getSound', () => {
    it('should require id parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getSound');

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent sound', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getSound', {
        query: { id: 'nonexistent' },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /xrpc/io.exprsn.video.getTrendingTags', () => {
    it('should return trending tags', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.getTrendingTags');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tags).toBeDefined();
    });
  });

  describe('GET /xrpc/io.exprsn.video.search', () => {
    it('should require query parameter', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.search');

      expect(res.status).toBe(400);
    });

    it('should search videos', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.search', {
        query: { q: 'test' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.videos).toBeDefined();
    });

    it('should support pagination', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.video.search', {
        query: { q: 'test', cursor: 'somecursor', limit: '10' },
      });

      expect(res.status).toBe(200);
    });
  });
});
