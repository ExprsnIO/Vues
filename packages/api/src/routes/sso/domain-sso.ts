/**
 * Domain SSO Routes - Per-Domain SSO Configuration
 *
 * Implements:
 * - GET /domains/:domainId/sso - Get SSO status for domain
 * - GET /domains/:domainId/sso/config - Get SSO configuration (admin)
 * - PUT /domains/:domainId/sso/config - Update SSO configuration (admin)
 * - POST /domains/:domainId/sso/providers - Add provider to domain (admin)
 * - DELETE /domains/:domainId/sso/providers/:providerId - Remove provider (admin)
 * - POST /domains/:domainId/sso/email-domains - Add allowed email domain
 * - DELETE /domains/:domainId/sso/email-domains/:domain - Remove email domain
 */

import { Hono } from 'hono';
import { DomainSSOService } from '../../services/sso/DomainSSOService.js';
import { authMiddleware, requireDomainPermission } from '../../auth/middleware.js';
import { DOMAIN_PERMISSIONS } from '@exprsn/shared';

const app = new Hono();

// ==========================================
// Public Discovery
// ==========================================

/**
 * GET /domains/:domainId/sso
 * Get SSO status for a domain (public - for login page)
 */
app.get('/domains/:domainId/sso', async (c) => {
  const domainId = c.req.param('domainId')!;
  const status = await DomainSSOService.getSSOStatus(domainId);

  if (!status) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  return c.json(status);
});

/**
 * GET /sso/check-email
 * Check if SSO is required for an email address
 */
app.get('/sso/check-email', async (c) => {
  const email = c.req.query('email');
  const domainId = c.req.query('domainId');

  if (!email) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const result = await DomainSSOService.isSSORequired(email, domainId || undefined);
  return c.json(result);
});

// ==========================================
// Admin Configuration
// ==========================================

/**
 * GET /domains/:domainId/sso/config
 * Get detailed SSO configuration (admin only)
 */
app.get('/domains/:domainId/sso/config', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_VIEW), async (c) => {
  const domainId = c.req.param('domainId')!;
  const config = await DomainSSOService.getConfig(domainId);

  if (!config) {
    return c.json({
      domainId,
      ssoMode: 'disabled',
      allowedIdpIds: [],
      jitProvisioning: true,
      defaultRole: 'member',
      emailDomainVerification: true,
      allowedEmailDomains: [],
      forceReauthAfterHours: 24,
    });
  }

  return c.json({ config });
});

/**
 * PUT /domains/:domainId/sso/config
 * Update SSO configuration (admin only)
 */
app.put('/domains/:domainId/sso/config', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const body = await c.req.json();

  const {
    ssoMode,
    primaryIdpId,
    allowedIdpIds,
    jitProvisioning,
    defaultOrganizationId,
    defaultRole,
    emailDomainVerification,
    allowedEmailDomains,
    forceReauthAfterHours,
  } = body;

  try {
    const config = await DomainSSOService.upsertConfig(domainId, {
      ssoMode,
      primaryIdpId,
      allowedIdpIds,
      jitProvisioning,
      defaultOrganizationId,
      defaultRole,
      emailDomainVerification,
      allowedEmailDomains,
      forceReauthAfterHours,
    });

    return c.json({ config });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to update config' },
      400
    );
  }
});

/**
 * DELETE /domains/:domainId/sso/config
 * Delete SSO configuration (disable SSO) (admin only)
 */
app.delete('/domains/:domainId/sso/config', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;

  const deleted = await DomainSSOService.deleteConfig(domainId);
  return c.json({ success: deleted });
});

// ==========================================
// Provider Management
// ==========================================

/**
 * POST /domains/:domainId/sso/providers
 * Add identity provider to domain
 */
app.post('/domains/:domainId/sso/providers', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const body = await c.req.json();
  const { providerId, setPrimary } = body;

  if (!providerId) {
    return c.json({ error: 'providerId is required' }, 400);
  }

  await DomainSSOService.addProviderToDomain(domainId, providerId);

  if (setPrimary) {
    await DomainSSOService.setPrimaryProvider(domainId, providerId);
  }

  const config = await DomainSSOService.getConfig(domainId);
  return c.json({ config });
});

/**
 * DELETE /domains/:domainId/sso/providers/:providerId
 * Remove identity provider from domain
 */
app.delete('/domains/:domainId/sso/providers/:providerId', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const providerId = c.req.param('providerId')!;

  const removed = await DomainSSOService.removeProviderFromDomain(domainId, providerId);

  if (!removed) {
    return c.json({ error: 'Provider not found in domain config' }, 404);
  }

  const config = await DomainSSOService.getConfig(domainId);
  return c.json({ config });
});

/**
 * PUT /domains/:domainId/sso/providers/:providerId/primary
 * Set primary identity provider for domain
 */
app.put('/domains/:domainId/sso/providers/:providerId/primary', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const providerId = c.req.param('providerId')!;

  await DomainSSOService.setPrimaryProvider(domainId, providerId);

  const config = await DomainSSOService.getConfig(domainId);
  return c.json({ config });
});

// ==========================================
// Email Domain Management
// ==========================================

/**
 * POST /domains/:domainId/sso/email-domains
 * Add allowed email domain
 */
app.post('/domains/:domainId/sso/email-domains', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const body = await c.req.json();
  const { emailDomain, verify } = body;

  if (!emailDomain) {
    return c.json({ error: 'emailDomain is required' }, 400);
  }

  // Optionally verify domain ownership
  if (verify) {
    const verification = await DomainSSOService.verifyEmailDomain(domainId, emailDomain);
    if (!verification.verified) {
      return c.json({
        verified: false,
        verificationRequired: true,
        verificationRecord: verification.verificationRecord,
        instructions: verification.error,
      });
    }
  }

  await DomainSSOService.addAllowedEmailDomain(domainId, emailDomain);

  const config = await DomainSSOService.getConfig(domainId);
  return c.json({ config });
});

/**
 * DELETE /domains/:domainId/sso/email-domains/:emailDomain
 * Remove allowed email domain
 */
app.delete('/domains/:domainId/sso/email-domains/:emailDomain', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const emailDomain = c.req.param('emailDomain')!;

  const removed = await DomainSSOService.removeAllowedEmailDomain(domainId, emailDomain);

  if (!removed) {
    return c.json({ error: 'Email domain not found' }, 404);
  }

  const config = await DomainSSOService.getConfig(domainId);
  return c.json({ config });
});

/**
 * POST /domains/:domainId/sso/email-domains/:emailDomain/verify
 * Verify email domain ownership
 */
app.post('/domains/:domainId/sso/email-domains/:emailDomain/verify', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const emailDomain = c.req.param('emailDomain')!;

  const result = await DomainSSOService.verifyEmailDomain(domainId, emailDomain);
  return c.json(result);
});

// ==========================================
// Provisioning Settings
// ==========================================

/**
 * GET /domains/:domainId/sso/provisioning
 * Get JIT provisioning settings
 */
app.get('/domains/:domainId/sso/provisioning', authMiddleware, async (c) => {
  const domainId = c.req.param('domainId')!;
  const config = await DomainSSOService.getConfig(domainId);

  return c.json({
    jitProvisioning: config?.jitProvisioning ?? true,
    defaultOrganizationId: config?.defaultOrganizationId,
    defaultRole: config?.defaultRole || 'member',
    emailDomainVerification: config?.emailDomainVerification ?? true,
    allowedEmailDomains: config?.allowedEmailDomains || [],
  });
});

/**
 * PUT /domains/:domainId/sso/provisioning
 * Update JIT provisioning settings
 */
app.put('/domains/:domainId/sso/provisioning', authMiddleware, requireDomainPermission(DOMAIN_PERMISSIONS.SSO_MANAGE), async (c) => {
  const domainId = c.req.param('domainId')!;
  const body = await c.req.json();

  const {
    jitProvisioning,
    defaultOrganizationId,
    defaultRole,
    emailDomainVerification,
  } = body;

  const config = await DomainSSOService.upsertConfig(domainId, {
    jitProvisioning,
    defaultOrganizationId,
    defaultRole,
    emailDomainVerification,
  });

  return c.json({
    jitProvisioning: config.jitProvisioning,
    defaultOrganizationId: config.defaultOrganizationId,
    defaultRole: config.defaultRole,
    emailDomainVerification: config.emailDomainVerification,
    allowedEmailDomains: config.allowedEmailDomains,
  });
});

export default app;
