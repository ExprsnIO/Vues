import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { graphRouter } from '../../src/routes/graph.js';
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

// Mock the database
vi.mock('../../src/db/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(() => Promise.resolve({
          did: 'did:web:test.exprsn.local:user:other',
          handle: 'other',
          displayName: 'Other User',
        })),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      follows: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      lists: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
      listItems: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
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
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
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
  users: {},
  follows: {},
  lists: {},
  listItems: {},
}));

describe('Graph Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    app.route('/xrpc', graphRouter);
    vi.clearAllMocks();
  });

  describe('Follow Operations', () => {
    describe('POST /xrpc/io.exprsn.graph.follow', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.follow', {
          body: { did: 'did:web:test.exprsn.local:user:other' },
        });

        expect(res.status).toBe(401);
      });

      it('should require did parameter', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.follow', {
          headers: authHeader('exp_testtoken'),
          body: {},
        });

        expect(res.status).toBe(400);
      });

      it('should prevent self-follow', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.follow', {
          headers: authHeader('exp_testtoken'),
          body: { did: 'did:web:test.exprsn.local:user:testuser' },
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /xrpc/io.exprsn.graph.unfollow', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.unfollow', {
          body: { did: 'did:web:test.exprsn.local:user:other' },
        });

        expect(res.status).toBe(401);
      });

      it('should require did parameter', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.unfollow', {
          headers: authHeader('exp_testtoken'),
          body: {},
        });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /xrpc/io.exprsn.graph.getFollowers', () => {
      it('should require did parameter', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getFollowers');

        expect(res.status).toBe(400);
      });

      it('should return followers list', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getFollowers', {
          query: { did: 'did:web:test.exprsn.local:user:testuser' },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.followers).toBeDefined();
        expect(Array.isArray(data.followers)).toBe(true);
      });

      it('should support pagination', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getFollowers', {
          query: {
            did: 'did:web:test.exprsn.local:user:testuser',
            limit: '10',
            cursor: 'somecursor',
          },
        });

        expect(res.status).toBe(200);
      });
    });

    describe('GET /xrpc/io.exprsn.graph.getFollowing', () => {
      it('should require did parameter', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getFollowing');

        expect(res.status).toBe(400);
      });

      it('should return following list', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getFollowing', {
          query: { did: 'did:web:test.exprsn.local:user:testuser' },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.following).toBeDefined();
      });
    });
  });

  describe('List Operations', () => {
    describe('POST /xrpc/io.exprsn.graph.createList', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.createList', {
          body: { name: 'Test List', purpose: 'curate' },
        });

        expect(res.status).toBe(401);
      });

      it('should require name', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.createList', {
          headers: authHeader('exp_testtoken'),
          body: { purpose: 'curate' },
        });

        expect(res.status).toBe(400);
      });

      it('should require purpose', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.createList', {
          headers: authHeader('exp_testtoken'),
          body: { name: 'Test List' },
        });

        expect(res.status).toBe(400);
      });

      it('should validate purpose value', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.createList', {
          headers: authHeader('exp_testtoken'),
          body: { name: 'Test List', purpose: 'invalid' },
        });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /xrpc/io.exprsn.graph.getLists', () => {
      it('should require did parameter', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getLists');

        expect(res.status).toBe(400);
      });

      it('should return lists for user', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getLists', {
          query: { did: 'did:web:test.exprsn.local:user:testuser' },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.lists).toBeDefined();
      });
    });

    describe('GET /xrpc/io.exprsn.graph.getList', () => {
      it('should require uri parameter', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getList');

        expect(res.status).toBe(400);
      });

      it('should return 404 for non-existent list', async () => {
        const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.graph.getList', {
          query: { uri: 'at://test/list/nonexistent' },
        });

        expect(res.status).toBe(404);
      });
    });

    describe('POST /xrpc/io.exprsn.graph.addListItem', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.addListItem', {
          body: {
            listUri: 'at://test/list/123',
            subject: 'did:web:test.exprsn.local:user:other',
          },
        });

        expect(res.status).toBe(401);
      });

      it('should require listUri', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.addListItem', {
          headers: authHeader('exp_testtoken'),
          body: { subject: 'did:web:test.exprsn.local:user:other' },
        });

        expect(res.status).toBe(400);
      });

      it('should require subject', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.addListItem', {
          headers: authHeader('exp_testtoken'),
          body: { listUri: 'at://test/list/123' },
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /xrpc/io.exprsn.graph.removeListItem', () => {
      it('should require authentication', async () => {
        const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.graph.removeListItem', {
          body: {
            listUri: 'at://test/list/123',
            subject: 'did:web:test.exprsn.local:user:other',
          },
        });

        expect(res.status).toBe(401);
      });
    });
  });
});
