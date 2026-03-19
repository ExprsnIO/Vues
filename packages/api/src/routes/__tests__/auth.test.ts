/**
 * Authentication Endpoints Tests
 *
 * Comprehensive test suite for all authentication endpoints in @exprsn/api.
 * Tests signup, login, session management, and security features.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { nanoid } from 'nanoid';

// Mock services BEFORE importing anything else (must be hoisted)
vi.mock('../../cache/redis.js');
vi.mock('../../services/notifications/index.js');
vi.mock('../../services/plc/index.js');
vi.mock('../../services/did/index.js');

import { testClient } from 'hono/testing';
import { authRouter } from '../auth.js';
import { db, actorRepos, users, sessions as sessionsTable, userSettings } from '../../db/index.js';
import { eq, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as redisModule from '../../cache/redis.js';
import * as notificationModule from '../../services/notifications/index.js';
import * as plcModule from '../../services/plc/index.js';
import * as didModule from '../../services/did/index.js';

// Setup mocks after import
vi.mocked(redisModule).redis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  setex: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockImplementation(() => Promise.resolve(1)),
  expire: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(300),
} as any;

vi.mocked(redisModule).cacheService = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
} as any;

vi.mocked(redisModule).CacheKeys = {
  trendingFeed: () => 'trending:feed',
  followingFeed: (did: string) => `following:feed:${did}`,
} as any;

vi.mocked(notificationModule).getNotificationService = vi.fn().mockReturnValue({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}) as any;

vi.mocked(plcModule).PlcService = {
  generateDid: vi.fn().mockImplementation(() => `did:plc:${nanoid()}`),
  createDid: vi.fn().mockResolvedValue({ success: true }),
} as any;

vi.mocked(plcModule).getPlcConfig = vi.fn().mockResolvedValue({
  enabled: true,
  handleSuffix: 'exprsn'
}) as any;

vi.mocked(didModule).ExprsnDidService = {
  createCreatorDid: vi.fn().mockImplementation(() => Promise.resolve({
    did: `did:exprn:${nanoid()}`,
    handle: 'testhandle',
    publicKeyMultibase: 'z' + Buffer.from('test-public-key').toString('base64url'),
    certificate: {
      id: nanoid(),
      pem: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
      fingerprint: 'test-fingerprint',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  })),
} as any;

// Helper to parse response (JSON or text)
async function getResponseData(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json();
  }
  return { message: await res.text() };
}

describe('Authentication Endpoints', () => {
  const testUserDid = `did:plc:${nanoid()}`;
  const testHandle = 'testuser';
  const testEmail = 'test@example.com';
  const testPassword = 'TestPass123';

  // Helper to create test user
  async function createTestUser(overrides?: { handle?: string; email?: string; did?: string }) {
    const handle = overrides?.handle || testHandle;
    const email = overrides?.email || testEmail;
    const did = overrides?.did || testUserDid;
    const passwordHash = await bcrypt.hash(testPassword, 10);

    await db.insert(actorRepos).values({
      did,
      handle,
      email,
      passwordHash,
      signingKeyPublic: 'test-public-key',
      signingKeyPrivate: 'test-private-key',
      didMethod: 'plc',
      status: 'active',
    });

    await db.insert(users).values({
      did,
      handle,
      displayName: handle,
      avatar: null,
      bio: null,
    });

    return { did, handle, email };
  }

  // Helper to create test session
  async function createTestSession(did: string) {
    const accessToken = `exp_${nanoid(32)}`;
    const refreshToken = `ref_${nanoid(48)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(sessionsTable).values({
      id: nanoid(),
      did,
      accessJwt: accessToken,
      refreshJwt: refreshToken,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  // Cleanup before tests
  beforeAll(async () => {
    // Clean up any existing test data
    try {
      await db.delete(sessionsTable).where(eq(sessionsTable.did, testUserDid));
      await db.delete(userSettings).where(eq(userSettings.userDid, testUserDid));
      await db.delete(users).where(eq(users.did, testUserDid));
      await db.delete(actorRepos).where(eq(actorRepos.did, testUserDid));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Cleanup after tests
  afterAll(async () => {
    try {
      await db.delete(sessionsTable).where(eq(sessionsTable.did, testUserDid));
      await db.delete(userSettings).where(eq(userSettings.userDid, testUserDid));
      await db.delete(users).where(eq(users.did, testUserDid));
      await db.delete(actorRepos).where(eq(actorRepos.did, testUserDid));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // POST /xrpc/io.exprsn.auth.createAccount (Signup)
  // =============================================================================

  describe('POST /xrpc/io.exprsn.auth.createAccount', () => {
    it('should create a new account with valid data', async () => {
      const client = testClient(authRouter);
      const handle = `newuser${Math.random().toString(36).substring(2, 8)}`;
      const email = `newuser${Math.random().toString(36).substring(2, 8)}@example.com`;

      const res = await client['io.exprsn.auth.createAccount'].$post({
        json: {
          handle,
          email,
          password: testPassword,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('accessJwt');
      expect(data).toHaveProperty('refreshJwt');
      // Handle should be returned with domain suffix (e.g., "user.exprsn" or "user.exprsn.io")
      expect(data.handle).toMatch(new RegExp(`^${handle}\\.`));
      expect(data).toHaveProperty('did');
      expect(data.did).toMatch(/^did:(plc|exprn):/);

      // Cleanup
      await db.delete(sessionsTable).where(eq(sessionsTable.did, data.did));
      await db.delete(userSettings).where(eq(userSettings.userDid, data.did));
      await db.delete(users).where(eq(users.did, data.did));
      await db.delete(actorRepos).where(eq(actorRepos.did, data.did));
    });

    it('should reject signup with existing handle', async () => {
      const client = testClient(authRouter);
      await createTestUser();

      const res = await client['io.exprsn.auth.createAccount'].$post({
        json: {
          handle: testHandle,
          email: 'different@example.com',
          password: testPassword,
        },
      });

      expect(res.status).toBe(400);
      const data = await getResponseData(res);
      expect(data.message).toContain('Handle already taken');
    });

    it('should reject invalid handle format', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.createAccount'].$post({
        json: {
          handle: 'ab', // Too short
          email: 'test@example.com',
          password: testPassword,
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject weak password', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.createAccount'].$post({
        json: {
          handle: 'validhandle',
          email: 'test@example.com',
          password: 'weak', // Too weak
        },
      });

      expect(res.status).toBe(400);
    });
  });

  // =============================================================================
  // POST /xrpc/io.exprsn.auth.createSession (Login)
  // =============================================================================

  describe('POST /xrpc/io.exprsn.auth.createSession', () => {
    beforeAll(async () => {
      try {
        await createTestUser();
      } catch (error) {
        // User might already exist
      }
    });

    it('should login with valid handle and password', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.createSession'].$post({
        json: {
          identifier: testHandle,
          password: testPassword,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('accessJwt');
      expect(data).toHaveProperty('refreshJwt');
      expect(data).toHaveProperty('handle', testHandle);

      // Cleanup session
      await db.delete(sessionsTable).where(eq(sessionsTable.accessJwt, data.accessJwt));
    });

    it('should reject login with invalid password', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.createSession'].$post({
        json: {
          identifier: testHandle,
          password: 'WrongPassword123',
        },
      });

      expect(res.status).toBe(401);
      const data = await getResponseData(res);
      expect(data.message).toContain('Invalid credentials');
    });

    it('should reject login with non-existent user', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.createSession'].$post({
        json: {
          identifier: 'nonexistentuser',
          password: testPassword,
        },
      });

      expect(res.status).toBe(401);
      const data = await getResponseData(res);
      expect(data.message).toContain('Invalid credentials');
    });
  });

  // =============================================================================
  // GET /xrpc/io.exprsn.auth.getSession
  // =============================================================================

  describe('GET /xrpc/io.exprsn.auth.getSession', () => {
    let validAccessToken: string;

    beforeAll(async () => {
      const { accessToken } = await createTestSession(testUserDid);
      validAccessToken = accessToken;
    });

    afterAll(async () => {
      await db.delete(sessionsTable).where(eq(sessionsTable.accessJwt, validAccessToken));
    });

    it('should return session info with valid token', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.getSession'].$get(
        {},
        {
          headers: {
            Authorization: `Bearer ${validAccessToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('handle', testHandle);
      expect(data).toHaveProperty('did', testUserDid);
      expect(data).toHaveProperty('email', testEmail);
    });

    it('should reject request without token', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.getSession'].$get({});

      expect(res.status).toBe(401);
      const data = await getResponseData(res);
      expect(data.message).toContain('Not authenticated');
    });

    it('should reject request with invalid token', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.getSession'].$get(
        {},
        {
          headers: {
            Authorization: 'Bearer exp_invalidtoken123',
          },
        }
      );

      expect(res.status).toBe(401);
    });
  });

  // =============================================================================
  // POST /xrpc/io.exprsn.auth.refreshSession
  // =============================================================================

  describe('POST /xrpc/io.exprsn.auth.refreshSession', () => {
    let validRefreshToken: string;

    beforeEach(async () => {
      const sessionId = nanoid();
      const accessToken = `exp_${nanoid(32)}`;
      validRefreshToken = `ref_${nanoid(48)}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(sessionsTable).values({
        id: sessionId,
        did: testUserDid,
        accessJwt: accessToken,
        refreshJwt: validRefreshToken,
        expiresAt,
      });
    });

    afterEach(async () => {
      await db.delete(sessionsTable).where(eq(sessionsTable.did, testUserDid));
    });

    it('should refresh session with valid refresh token', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.refreshSession'].$post(
        {},
        {
          headers: {
            Authorization: `Bearer ${validRefreshToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('accessJwt');
      expect(data).toHaveProperty('refreshJwt');
      expect(data).toHaveProperty('handle', testHandle);
      expect(data.refreshJwt).not.toBe(validRefreshToken);
    });

    it('should reject refresh with invalid token', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.refreshSession'].$post(
        {},
        {
          headers: {
            Authorization: 'Bearer ref_invalidtoken123',
          },
        }
      );

      expect(res.status).toBe(401);
    });
  });

  // =============================================================================
  // POST /xrpc/io.exprsn.auth.deleteSession (Logout)
  // =============================================================================

  describe('POST /xrpc/io.exprsn.auth.deleteSession', () => {
    it('should logout and delete session', async () => {
      const client = testClient(authRouter);
      const { accessToken } = await createTestSession(testUserDid);

      const res = await client['io.exprsn.auth.deleteSession'].$post(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Session should be deleted
      const session = await db.query.sessions.findFirst({
        where: eq(sessionsTable.accessJwt, accessToken),
      });

      expect(session).toBeUndefined();
    });
  });

  // =============================================================================
  // GET /xrpc/io.exprsn.auth.listSessions
  // =============================================================================

  describe('GET /xrpc/io.exprsn.auth.listSessions', () => {
    let session1Token: string;

    beforeAll(async () => {
      const session1 = await createTestSession(testUserDid);
      await createTestSession(testUserDid);
      session1Token = session1.accessToken;
    });

    afterAll(async () => {
      await db.delete(sessionsTable).where(eq(sessionsTable.did, testUserDid));
    });

    it('should list all user sessions', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.listSessions'].$get(
        {},
        {
          headers: {
            Authorization: `Bearer ${session1Token}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('sessions');
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBeGreaterThanOrEqual(2);

      const firstSession = data.sessions[0];
      expect(firstSession).toHaveProperty('id');
      expect(firstSession).toHaveProperty('deviceName');
      expect(firstSession).toHaveProperty('isCurrent');
    });
  });

  // =============================================================================
  // POST /xrpc/io.exprsn.auth.revokeSession
  // =============================================================================

  describe('POST /xrpc/io.exprsn.auth.revokeSession', () => {
    let currentToken: string;
    let targetSessionId: string;

    beforeEach(async () => {
      const current = await createTestSession(testUserDid);
      currentToken = current.accessToken;

      await createTestSession(testUserDid);

      const allSessions = await db.query.sessions.findMany({
        where: eq(sessionsTable.did, testUserDid),
      });

      targetSessionId = allSessions.find((s) => s.accessJwt !== currentToken)!.id;
    });

    afterEach(async () => {
      await db.delete(sessionsTable).where(eq(sessionsTable.did, testUserDid));
    });

    it('should revoke a specific session', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.revokeSession'].$post(
        {
          json: {
            sessionId: targetSessionId,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Target session should be deleted
      const session = await db.query.sessions.findFirst({
        where: eq(sessionsTable.id, targetSessionId),
      });

      expect(session).toBeUndefined();
    });

    it('should reject revoking non-existent session', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.revokeSession'].$post(
        {
          json: {
            sessionId: 'nonexistent-id',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  // =============================================================================
  // POST /xrpc/io.exprsn.auth.revokeAllSessions
  // =============================================================================

  describe('POST /xrpc/io.exprsn.auth.revokeAllSessions', () => {
    let currentToken: string;

    beforeEach(async () => {
      const current = await createTestSession(testUserDid);
      currentToken = current.accessToken;

      await createTestSession(testUserDid);
      await createTestSession(testUserDid);
    });

    afterEach(async () => {
      await db.delete(sessionsTable).where(eq(sessionsTable.did, testUserDid));
    });

    it('should revoke all sessions except current', async () => {
      const client = testClient(authRouter);

      const res = await client['io.exprsn.auth.revokeAllSessions'].$post(
        {},
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.revokedCount).toBeGreaterThanOrEqual(2);

      // Only current session should remain
      const remainingSessions = await db.query.sessions.findMany({
        where: eq(sessionsTable.did, testUserDid),
      });

      expect(remainingSessions.length).toBe(1);
      expect(remainingSessions[0]!.accessJwt).toBe(currentToken);
    });
  });

  // =============================================================================
  // Security Tests
  // =============================================================================

  describe('Security Features', () => {
    it('should hash passwords securely', async () => {
      const client = testClient(authRouter);
      const handle = `secureuser${Math.random().toString(36).substring(2, 8)}`;
      const email = `secure${Math.random().toString(36).substring(2, 8)}@example.com`;

      const res = await client['io.exprsn.auth.createAccount'].$post({
        json: {
          handle,
          email,
          password: testPassword,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Check that password is hashed in database
      const account = await db.query.actorRepos.findFirst({
        where: eq(actorRepos.did, data.did),
      });

      expect(account).toBeDefined();
      expect(account!.passwordHash).not.toBe(testPassword);
      expect(account!.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash format

      // Cleanup
      await db.delete(sessionsTable).where(eq(sessionsTable.did, data.did));
      await db.delete(userSettings).where(eq(userSettings.userDid, data.did));
      await db.delete(users).where(eq(users.did, data.did));
      await db.delete(actorRepos).where(eq(actorRepos.did, data.did));
    });

    it('should not leak user existence on login', async () => {
      const client = testClient(authRouter);

      // Login with non-existent user
      const res1 = await client['io.exprsn.auth.createSession'].$post({
        json: {
          identifier: 'nonexistent',
          password: testPassword,
        },
      });

      // Login with existing user but wrong password
      const res2 = await client['io.exprsn.auth.createSession'].$post({
        json: {
          identifier: testHandle,
          password: 'wrongpassword',
        },
      });

      // Both should return same error message
      const data1 = await getResponseData(res1);
      const data2 = await getResponseData(res2);

      expect(res1.status).toBe(401);
      expect(res2.status).toBe(401);
      expect(data1.message).toBe(data2.message);
    });
  });
});
