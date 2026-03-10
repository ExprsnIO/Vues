/**
 * Tests for Admin Domain Auth Routes
 * OAuth Provider and MFA settings management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { adminDomainAuthRouter } from '../src/routes/admin-domain-auth';

// Mock the database
vi.mock('../src/db/index.js', () => ({
  db: {
    query: {
      domains: {
        findFirst: vi.fn(),
      },
      domainOAuthProviders: {
        findFirst: vi.fn(),
      },
      domainMfaSettings: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
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
}));

// Mock the auth middleware
vi.mock('../src/auth/middleware.js', () => ({
  adminAuthMiddleware: vi.fn((c, next) => {
    c.set('adminUser', {
      id: 'test-admin-id',
      userDid: 'did:plc:test-admin',
      role: 'super_admin',
    });
    return next();
  }),
  requirePermission: vi.fn(() => vi.fn((c, next) => next())),
  ADMIN_PERMISSIONS: {
    CONFIG_VIEW: 'config:view',
    CONFIG_EDIT: 'config:edit',
  },
}));

describe('Admin Domain Auth Routes', () => {
  describe('OAuth Provider Endpoints', () => {
    it('should require domainId for list endpoint', async () => {
      const app = new Hono();
      app.route('/xrpc', adminDomainAuthRouter);

      const res = await app.request('/xrpc/io.exprsn.admin.domain.oauth.list');

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('InvalidRequest');
      expect(json.message).toContain('domainId');
    });

    it('should require providerId for get endpoint', async () => {
      const app = new Hono();
      app.route('/xrpc', adminDomainAuthRouter);

      const res = await app.request('/xrpc/io.exprsn.admin.domain.oauth.get');

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('InvalidRequest');
      expect(json.message).toContain('providerId');
    });

    it('should validate required fields for create endpoint', async () => {
      const app = new Hono();
      app.route('/xrpc', adminDomainAuthRouter);

      const res = await app.request('/xrpc/io.exprsn.admin.domain.oauth.create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domainId: 'domain-123',
          providerKey: 'google',
          // Missing required fields
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('InvalidRequest');
      expect(json.message).toContain('required fields');
    });
  });

  describe('MFA Settings Endpoints', () => {
    it('should require domainId for get endpoint', async () => {
      const app = new Hono();
      app.route('/xrpc', adminDomainAuthRouter);

      const res = await app.request('/xrpc/io.exprsn.admin.domain.mfa.get');

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('InvalidRequest');
      expect(json.message).toContain('domainId');
    });

    it('should require domainId for update endpoint', async () => {
      const app = new Hono();
      app.route('/xrpc', adminDomainAuthRouter);

      const res = await app.request('/xrpc/io.exprsn.admin.domain.mfa.update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mfaMode: 'required',
          // Missing domainId
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('InvalidRequest');
      expect(json.message).toContain('domainId');
    });

    it('should require domainId for stats endpoint', async () => {
      const app = new Hono();
      app.route('/xrpc', adminDomainAuthRouter);

      const res = await app.request('/xrpc/io.exprsn.admin.domain.mfa.stats');

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('InvalidRequest');
      expect(json.message).toContain('domainId');
    });
  });
});
