import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authRouter } from '../../src/routes/auth.js';
import { testRequest, createMockUser, createTestApp } from '../helpers.js';

// Mock the database
vi.mock('../../src/db/index.js', () => {
  const mockUsers = new Map();
  const mockSessions = new Map();
  const mockActorRepos = new Map();

  return {
    db: {
      query: {
        actorRepos: {
          findFirst: vi.fn(({ where }) => {
            // Simple mock implementation
            return Promise.resolve(null);
          }),
        },
        users: {
          findFirst: vi.fn(() => Promise.resolve(null)),
        },
        sessions: {
          findFirst: vi.fn(() => Promise.resolve(null)),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve()),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    },
    actorRepos: {},
    users: {},
    sessions: {},
  };
});

describe('Auth Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    app.route('/xrpc', authRouter);
    vi.clearAllMocks();
  });

  describe('POST /xrpc/io.exprsn.auth.createAccount', () => {
    it('should require handle, email, and password', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createAccount', {
        body: {},
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('Missing required fields');
    });

    it('should validate handle format - minimum length', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createAccount', {
        body: {
          handle: 'ab',
          email: 'test@test.com',
          password: 'password123',
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('at least 3 characters');
    });

    it('should validate handle format - maximum length', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createAccount', {
        body: {
          handle: 'a'.repeat(21),
          email: 'test@test.com',
          password: 'password123',
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('at most 20 characters');
    });

    it('should validate handle format - allowed characters', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createAccount', {
        body: {
          handle: 'test-user',
          email: 'test@test.com',
          password: 'password123',
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('letters, numbers, and underscores');
    });

    it('should validate email format', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createAccount', {
        body: {
          handle: 'testuser',
          email: 'invalid-email',
          password: 'password123',
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('Invalid email');
    });

    it('should validate password length', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createAccount', {
        body: {
          handle: 'testuser',
          email: 'test@test.com',
          password: 'short',
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('at least 8 characters');
    });

    it('should reject reserved handles', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createAccount', {
        body: {
          handle: 'admin',
          email: 'test@test.com',
          password: 'password123',
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('reserved');
    });
  });

  describe('POST /xrpc/io.exprsn.auth.createSession', () => {
    it('should require identifier and password', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createSession', {
        body: {},
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('Missing required fields');
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.createSession', {
        body: {
          identifier: 'nonexistent',
          password: 'wrongpassword',
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('Invalid credentials');
    });
  });

  describe('GET /xrpc/io.exprsn.auth.getSession', () => {
    it('should require authorization header', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.auth.getSession');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('Not authenticated');
    });

    it('should return 401 for invalid session', async () => {
      const res = await testRequest(app, 'GET', '/xrpc/io.exprsn.auth.getSession', {
        headers: { Authorization: 'Bearer invalid_token' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /xrpc/io.exprsn.auth.refreshSession', () => {
    it('should require authorization header with refresh token', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.refreshSession');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('Missing refresh token');
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.refreshSession', {
        headers: { Authorization: 'Bearer invalid_refresh_token' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /xrpc/io.exprsn.auth.deleteSession', () => {
    it('should require authorization header', async () => {
      const res = await testRequest(app, 'POST', '/xrpc/io.exprsn.auth.deleteSession');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('Not authenticated');
    });
  });
});
