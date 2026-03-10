/**
 * Admin Domain Auth Routes
 * OAuth Provider and MFA settings management for domains
 */

import { Hono } from 'hono';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  domains,
  domainOAuthProviders,
  domainMfaSettings,
  adminUsers,
  adminAuditLog,
  users,
  type DomainOAuthProvider,
  type DomainMfaSettings,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { encryptSecret, safeDecryptSecret } from '../services/security/secrets.js';

export const adminDomainAuthRouter = new Hono();

// Apply admin auth to all routes
adminDomainAuthRouter.use('*', adminAuthMiddleware);

// ============================================
// Helper Functions
// ============================================

async function logAudit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  c: { req: { header: (name: string) => string | undefined } }
) {
  await db.insert(adminAuditLog).values({
    id: nanoid(),
    adminId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    userAgent: c.req.header('user-agent'),
  });
}

async function verifyDomainAccess(domainId: string): Promise<boolean> {
  const domain = await db.query.domains.findFirst({
    where: eq(domains.id, domainId),
  });
  return !!domain;
}

// ============================================
// OAUTH PROVIDER ENDPOINTS
// ============================================

/**
 * List OAuth providers for a domain
 * GET /xrpc/io.exprsn.admin.domain.oauth.list
 */
adminDomainAuthRouter.get(
  '/io.exprsn.admin.domain.oauth.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const enabled = c.req.query('enabled');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    if (!(await verifyDomainAccess(domainId))) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const conditions = [eq(domainOAuthProviders.domainId, domainId)];

    if (enabled !== undefined) {
      conditions.push(eq(domainOAuthProviders.enabled, enabled === 'true'));
    }

    const providers = await db
      .select()
      .from(domainOAuthProviders)
      .where(and(...conditions))
      .orderBy(domainOAuthProviders.priority, domainOAuthProviders.displayName);

    // Don't expose client secrets
    const sanitizedProviders = providers.map((p) => ({
      id: p.id,
      domainId: p.domainId,
      providerKey: p.providerKey,
      displayName: p.displayName,
      description: p.description,
      type: p.type,
      clientId: p.clientId,
      authorizationEndpoint: p.authorizationEndpoint,
      tokenEndpoint: p.tokenEndpoint,
      userinfoEndpoint: p.userinfoEndpoint,
      jwksUri: p.jwksUri,
      issuer: p.issuer,
      scopes: p.scopes,
      claimMapping: p.claimMapping,
      iconUrl: p.iconUrl,
      buttonColor: p.buttonColor,
      buttonText: p.buttonText,
      enabled: p.enabled,
      priority: p.priority,
      autoProvisionUsers: p.autoProvisionUsers,
      defaultRole: p.defaultRole,
      requiredEmailDomain: p.requiredEmailDomain,
      allowedEmailDomains: p.allowedEmailDomains,
      requirePkce: p.requirePkce,
      totalLogins: p.totalLogins,
      lastUsedAt: p.lastUsedAt?.toISOString(),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return c.json({ providers: sanitizedProviders });
  }
);

/**
 * Get specific OAuth provider configuration
 * GET /xrpc/io.exprsn.admin.domain.oauth.get
 */
adminDomainAuthRouter.get(
  '/io.exprsn.admin.domain.oauth.get',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const providerId = c.req.query('providerId');

    if (!providerId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing providerId' }, 400);
    }

    const provider = await db.query.domainOAuthProviders.findFirst({
      where: eq(domainOAuthProviders.id, providerId),
    });

    if (!provider) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    // Include client secret for viewing (admins need it for config)
    // Decrypt the client secret before returning
    return c.json({
      provider: {
        ...provider,
        clientSecret: provider.clientSecret
          ? safeDecryptSecret(provider.clientSecret)
          : null,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString(),
        lastUsedAt: provider.lastUsedAt?.toISOString(),
      },
    });
  }
);

/**
 * Create OAuth provider
 * POST /xrpc/io.exprsn.admin.domain.oauth.create
 */
adminDomainAuthRouter.post(
  '/io.exprsn.admin.domain.oauth.create',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      domainId: string;
      providerKey: string;
      displayName: string;
      description?: string;
      type: string;
      clientId: string;
      clientSecret: string;
      authorizationEndpoint: string;
      tokenEndpoint: string;
      userinfoEndpoint?: string;
      jwksUri?: string;
      issuer?: string;
      scopes?: string[];
      claimMapping?: Record<string, string>;
      iconUrl?: string;
      buttonColor?: string;
      buttonText?: string;
      enabled?: boolean;
      priority?: number;
      autoProvisionUsers?: boolean;
      defaultRole?: string;
      requiredEmailDomain?: string;
      allowedEmailDomains?: string[];
      requirePkce?: boolean;
    }>();

    // Validate required fields
    if (
      !body.domainId ||
      !body.providerKey ||
      !body.displayName ||
      !body.type ||
      !body.clientId ||
      !body.clientSecret ||
      !body.authorizationEndpoint ||
      !body.tokenEndpoint
    ) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing required fields' },
        400
      );
    }

    if (!(await verifyDomainAccess(body.domainId))) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    // Check for duplicate provider key in domain
    const existing = await db.query.domainOAuthProviders.findFirst({
      where: and(
        eq(domainOAuthProviders.domainId, body.domainId),
        eq(domainOAuthProviders.providerKey, body.providerKey)
      ),
    });

    if (existing) {
      return c.json(
        {
          error: 'Duplicate',
          message: 'Provider with this key already exists for this domain',
        },
        400
      );
    }

    const id = nanoid();

    await db.insert(domainOAuthProviders).values({
      id,
      domainId: body.domainId,
      providerKey: body.providerKey,
      displayName: body.displayName,
      description: body.description,
      type: body.type,
      clientId: body.clientId,
      clientSecret: encryptSecret(body.clientSecret),
      authorizationEndpoint: body.authorizationEndpoint,
      tokenEndpoint: body.tokenEndpoint,
      userinfoEndpoint: body.userinfoEndpoint,
      jwksUri: body.jwksUri,
      issuer: body.issuer,
      scopes: body.scopes || ['openid', 'profile', 'email'],
      claimMapping: body.claimMapping || {
        sub: 'external_id',
        email: 'email',
        name: 'display_name',
        picture: 'avatar',
      },
      iconUrl: body.iconUrl,
      buttonColor: body.buttonColor,
      buttonText: body.buttonText,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 0,
      autoProvisionUsers: body.autoProvisionUsers ?? true,
      defaultRole: body.defaultRole || 'member',
      requiredEmailDomain: body.requiredEmailDomain,
      allowedEmailDomains: body.allowedEmailDomains,
      requirePkce: body.requirePkce ?? true,
      createdBy: adminUser.userDid,
      updatedBy: adminUser.userDid,
    });

    await logAudit(
      adminUser.id,
      'domain_oauth_provider_created',
      'domain_oauth_provider',
      id,
      { domainId: body.domainId, providerKey: body.providerKey },
      c
    );

    const provider = await db.query.domainOAuthProviders.findFirst({
      where: eq(domainOAuthProviders.id, id),
    });

    return c.json({ provider }, 201);
  }
);

/**
 * Update OAuth provider configuration
 * PUT /xrpc/io.exprsn.admin.domain.oauth.update
 */
adminDomainAuthRouter.put(
  '/io.exprsn.admin.domain.oauth.update',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      providerId: string;
      displayName?: string;
      description?: string;
      clientId?: string;
      clientSecret?: string;
      authorizationEndpoint?: string;
      tokenEndpoint?: string;
      userinfoEndpoint?: string;
      jwksUri?: string;
      issuer?: string;
      scopes?: string[];
      claimMapping?: Record<string, string>;
      iconUrl?: string;
      buttonColor?: string;
      buttonText?: string;
      enabled?: boolean;
      priority?: number;
      autoProvisionUsers?: boolean;
      defaultRole?: string;
      requiredEmailDomain?: string;
      allowedEmailDomains?: string[];
      requirePkce?: boolean;
    }>();

    if (!body.providerId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing providerId' }, 400);
    }

    const existing = await db.query.domainOAuthProviders.findFirst({
      where: eq(domainOAuthProviders.id, body.providerId),
    });

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    const updates: Partial<typeof domainOAuthProviders.$inferInsert> = {
      updatedBy: adminUser.userDid,
      updatedAt: new Date(),
    };

    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.description !== undefined) updates.description = body.description;
    if (body.clientId !== undefined) updates.clientId = body.clientId;
    if (body.clientSecret !== undefined) updates.clientSecret = encryptSecret(body.clientSecret);
    if (body.authorizationEndpoint !== undefined)
      updates.authorizationEndpoint = body.authorizationEndpoint;
    if (body.tokenEndpoint !== undefined) updates.tokenEndpoint = body.tokenEndpoint;
    if (body.userinfoEndpoint !== undefined)
      updates.userinfoEndpoint = body.userinfoEndpoint;
    if (body.jwksUri !== undefined) updates.jwksUri = body.jwksUri;
    if (body.issuer !== undefined) updates.issuer = body.issuer;
    if (body.scopes !== undefined) updates.scopes = body.scopes;
    if (body.claimMapping !== undefined) updates.claimMapping = body.claimMapping;
    if (body.iconUrl !== undefined) updates.iconUrl = body.iconUrl;
    if (body.buttonColor !== undefined) updates.buttonColor = body.buttonColor;
    if (body.buttonText !== undefined) updates.buttonText = body.buttonText;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.autoProvisionUsers !== undefined)
      updates.autoProvisionUsers = body.autoProvisionUsers;
    if (body.defaultRole !== undefined) updates.defaultRole = body.defaultRole;
    if (body.requiredEmailDomain !== undefined)
      updates.requiredEmailDomain = body.requiredEmailDomain;
    if (body.allowedEmailDomains !== undefined)
      updates.allowedEmailDomains = body.allowedEmailDomains;
    if (body.requirePkce !== undefined) updates.requirePkce = body.requirePkce;

    await db
      .update(domainOAuthProviders)
      .set(updates)
      .where(eq(domainOAuthProviders.id, body.providerId));

    await logAudit(
      adminUser.id,
      'domain_oauth_provider_updated',
      'domain_oauth_provider',
      body.providerId,
      { changes: updates },
      c
    );

    const provider = await db.query.domainOAuthProviders.findFirst({
      where: eq(domainOAuthProviders.id, body.providerId),
    });

    return c.json({ provider });
  }
);

/**
 * Delete OAuth provider
 * DELETE /xrpc/io.exprsn.admin.domain.oauth.delete
 */
adminDomainAuthRouter.delete(
  '/io.exprsn.admin.domain.oauth.delete',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const providerId = c.req.query('providerId');

    if (!providerId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing providerId' }, 400);
    }

    const existing = await db.query.domainOAuthProviders.findFirst({
      where: eq(domainOAuthProviders.id, providerId),
    });

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    await db.delete(domainOAuthProviders).where(eq(domainOAuthProviders.id, providerId));

    await logAudit(
      adminUser.id,
      'domain_oauth_provider_deleted',
      'domain_oauth_provider',
      providerId,
      { domainId: existing.domainId, providerKey: existing.providerKey },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * Toggle OAuth provider enabled/disabled
 * POST /xrpc/io.exprsn.admin.domain.oauth.toggle
 */
adminDomainAuthRouter.post(
  '/io.exprsn.admin.domain.oauth.toggle',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { providerId, enabled } = await c.req.json<{
      providerId: string;
      enabled: boolean;
    }>();

    if (!providerId || enabled === undefined) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing providerId or enabled' },
        400
      );
    }

    const existing = await db.query.domainOAuthProviders.findFirst({
      where: eq(domainOAuthProviders.id, providerId),
    });

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    await db
      .update(domainOAuthProviders)
      .set({
        enabled,
        updatedBy: adminUser.userDid,
        updatedAt: new Date(),
      })
      .where(eq(domainOAuthProviders.id, providerId));

    await logAudit(
      adminUser.id,
      'domain_oauth_provider_toggled',
      'domain_oauth_provider',
      providerId,
      { enabled, previousEnabled: existing.enabled },
      c
    );

    return c.json({ success: true, enabled });
  }
);

// ============================================
// MFA SETTINGS ENDPOINTS
// ============================================

/**
 * Get MFA settings for a domain
 * GET /xrpc/io.exprsn.admin.domain.mfa.get
 */
adminDomainAuthRouter.get(
  '/io.exprsn.admin.domain.mfa.get',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    if (!(await verifyDomainAccess(domainId))) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    let settings = await db.query.domainMfaSettings.findFirst({
      where: eq(domainMfaSettings.domainId, domainId),
    });

    // Return defaults if no settings exist
    if (!settings) {
      settings = {
        id: nanoid(),
        domainId,
        mfaMode: 'optional',
        allowedMethods: ['totp', 'webauthn'],
        totpEnabled: true,
        totpIssuer: null,
        totpDigits: 6,
        totpPeriod: 30,
        totpAlgorithm: 'SHA1',
        webauthnEnabled: true,
        webauthnRpName: null,
        webauthnRpId: null,
        webauthnUserVerification: 'preferred',
        webauthnAttachment: 'cross-platform',
        smsEnabled: false,
        smsProvider: null,
        smsConfig: null,
        emailOtpEnabled: false,
        emailOtpExpiryMinutes: 10,
        backupCodesEnabled: true,
        backupCodesCount: 10,
        gracePeriodDays: 7,
        rememberDeviceEnabled: true,
        rememberDeviceDays: 30,
        recoveryEmailRequired: false,
        totalUsersEnrolled: 0,
        totpEnrolledCount: 0,
        webauthnEnrolledCount: 0,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return c.json({
      settings: {
        ...settings,
        createdAt: settings.createdAt.toISOString(),
        updatedAt: settings.updatedAt.toISOString(),
      },
    });
  }
);

/**
 * Update MFA settings for a domain
 * PUT /xrpc/io.exprsn.admin.domain.mfa.update
 */
adminDomainAuthRouter.put(
  '/io.exprsn.admin.domain.mfa.update',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      domainId: string;
      mfaMode?: string;
      allowedMethods?: string[];
      totpEnabled?: boolean;
      totpIssuer?: string;
      totpDigits?: number;
      totpPeriod?: number;
      totpAlgorithm?: string;
      webauthnEnabled?: boolean;
      webauthnRpName?: string;
      webauthnRpId?: string;
      webauthnUserVerification?: string;
      webauthnAttachment?: string;
      smsEnabled?: boolean;
      smsProvider?: string;
      smsConfig?: Record<string, unknown>;
      emailOtpEnabled?: boolean;
      emailOtpExpiryMinutes?: number;
      backupCodesEnabled?: boolean;
      backupCodesCount?: number;
      gracePeriodDays?: number;
      rememberDeviceEnabled?: boolean;
      rememberDeviceDays?: number;
      recoveryEmailRequired?: boolean;
    }>();

    if (!body.domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    if (!(await verifyDomainAccess(body.domainId))) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const existing = await db.query.domainMfaSettings.findFirst({
      where: eq(domainMfaSettings.domainId, body.domainId),
    });

    const updates: Partial<typeof domainMfaSettings.$inferInsert> = {
      updatedBy: adminUser.userDid,
      updatedAt: new Date(),
    };

    if (body.mfaMode !== undefined) updates.mfaMode = body.mfaMode;
    if (body.allowedMethods !== undefined) updates.allowedMethods = body.allowedMethods;
    if (body.totpEnabled !== undefined) updates.totpEnabled = body.totpEnabled;
    if (body.totpIssuer !== undefined) updates.totpIssuer = body.totpIssuer;
    if (body.totpDigits !== undefined) updates.totpDigits = body.totpDigits;
    if (body.totpPeriod !== undefined) updates.totpPeriod = body.totpPeriod;
    if (body.totpAlgorithm !== undefined) updates.totpAlgorithm = body.totpAlgorithm;
    if (body.webauthnEnabled !== undefined)
      updates.webauthnEnabled = body.webauthnEnabled;
    if (body.webauthnRpName !== undefined) updates.webauthnRpName = body.webauthnRpName;
    if (body.webauthnRpId !== undefined) updates.webauthnRpId = body.webauthnRpId;
    if (body.webauthnUserVerification !== undefined)
      updates.webauthnUserVerification = body.webauthnUserVerification;
    if (body.webauthnAttachment !== undefined)
      updates.webauthnAttachment = body.webauthnAttachment;
    if (body.smsEnabled !== undefined) updates.smsEnabled = body.smsEnabled;
    if (body.smsProvider !== undefined) updates.smsProvider = body.smsProvider;
    if (body.smsConfig !== undefined) updates.smsConfig = body.smsConfig;
    if (body.emailOtpEnabled !== undefined)
      updates.emailOtpEnabled = body.emailOtpEnabled;
    if (body.emailOtpExpiryMinutes !== undefined)
      updates.emailOtpExpiryMinutes = body.emailOtpExpiryMinutes;
    if (body.backupCodesEnabled !== undefined)
      updates.backupCodesEnabled = body.backupCodesEnabled;
    if (body.backupCodesCount !== undefined)
      updates.backupCodesCount = body.backupCodesCount;
    if (body.gracePeriodDays !== undefined) updates.gracePeriodDays = body.gracePeriodDays;
    if (body.rememberDeviceEnabled !== undefined)
      updates.rememberDeviceEnabled = body.rememberDeviceEnabled;
    if (body.rememberDeviceDays !== undefined)
      updates.rememberDeviceDays = body.rememberDeviceDays;
    if (body.recoveryEmailRequired !== undefined)
      updates.recoveryEmailRequired = body.recoveryEmailRequired;

    if (existing) {
      // Update existing settings
      await db
        .update(domainMfaSettings)
        .set(updates)
        .where(eq(domainMfaSettings.domainId, body.domainId));
    } else {
      // Create new settings
      await db.insert(domainMfaSettings).values({
        id: nanoid(),
        domainId: body.domainId,
        ...updates,
      });
    }

    await logAudit(
      adminUser.id,
      existing ? 'domain_mfa_settings_updated' : 'domain_mfa_settings_created',
      'domain_mfa_settings',
      body.domainId,
      { changes: updates },
      c
    );

    const settings = await db.query.domainMfaSettings.findFirst({
      where: eq(domainMfaSettings.domainId, body.domainId),
    });

    return c.json({ settings });
  }
);

/**
 * Get MFA adoption statistics for a domain
 * GET /xrpc/io.exprsn.admin.domain.mfa.stats
 */
adminDomainAuthRouter.get(
  '/io.exprsn.admin.domain.mfa.stats',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    if (!(await verifyDomainAccess(domainId))) {
      return c.json({ error: 'NotFound', message: 'Domain not found' }, 404);
    }

    const settings = await db.query.domainMfaSettings.findFirst({
      where: eq(domainMfaSettings.domainId, domainId),
    });

    // Get domain user count
    const domain = await db.query.domains.findFirst({
      where: eq(domains.id, domainId),
    });

    const totalUsers = domain?.userCount || 0;
    const enrolledUsers = settings?.totalUsersEnrolled || 0;
    const totpEnrolled = settings?.totpEnrolledCount || 0;
    const webauthnEnrolled = settings?.webauthnEnrolledCount || 0;

    const adoptionRate =
      totalUsers > 0 ? ((enrolledUsers / totalUsers) * 100).toFixed(2) : '0.00';

    return c.json({
      stats: {
        totalUsers,
        enrolledUsers,
        unenrolledUsers: totalUsers - enrolledUsers,
        adoptionRate: parseFloat(adoptionRate),
        byMethod: {
          totp: totpEnrolled,
          webauthn: webauthnEnrolled,
        },
        mfaMode: settings?.mfaMode || 'optional',
        enabledMethods: settings?.allowedMethods || [],
      },
    });
  }
);

export default adminDomainAuthRouter;
