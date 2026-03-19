/**
 * Admin SSO Exprsn Routes
 * Management endpoints for registering and configuring Exprsn instances as
 * first-party OIDC/SSO providers.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { externalIdentityProviders } from '../db/schema.js';
import { adminAuthMiddleware } from '../auth/middleware.js';
import { OIDCConsumerService } from '../services/sso/OIDCConsumerService.js';

export const adminSSOExprsnRouter = new Hono();

// Apply admin auth to all routes
adminSSOExprsnRouter.use('*', adminAuthMiddleware);

// ============================================
// Supported Exprsn scopes
// ============================================

const EXPRSN_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'read',
  'write',
  'videos:read',
  'videos:write',
  'comments:read',
  'comments:write',
  'messages:read',
  'messages:write',
  'profile:read',
  'profile:write',
  'follows:read',
  'follows:write',
  'notifications:read',
  'live:stream',
  'payments:read',
  'payments:write',
  'admin',
] as const;

type ExprsnScope = (typeof EXPRSN_SCOPES)[number];

// ============================================
// Validation schemas
// ============================================

const discoverQuerySchema = z.object({
  issuerUrl: z.string().url('issuerUrl must be a valid URL'),
});

const registerBodySchema = z.object({
  issuerUrl: z.string().url('issuerUrl must be a valid URL'),
  clientId: z.string().min(1, 'clientId is required'),
  clientSecret: z.string().min(1, 'clientSecret is required'),
  domainId: z.string().optional(),
  displayName: z.string().optional(),
  autoProvision: z.boolean().default(true),
  defaultRole: z.string().default('member'),
  defaultAccountType: z.enum(['personal', 'creator', 'business']).default('personal'),
  allowedScopes: z.array(z.string()).optional(),
  roleMapping: z.record(z.string()).optional(),
  scopePolicy: z.enum(['inherit', 'restrict', 'expand']).default('inherit'),
});

const updateScopesBodySchema = z.object({
  providerId: z.string().min(1, 'providerId is required'),
  allowedScopes: z.array(z.string()),
  scopePolicy: z.enum(['inherit', 'restrict', 'expand']).optional(),
});

const getRoleMappingQuerySchema = z.object({
  providerId: z.string().min(1, 'providerId is required'),
});

const updateRoleMappingBodySchema = z.object({
  providerId: z.string().min(1, 'providerId is required'),
  roleMapping: z.record(z.string()),
});

// ============================================
// Helpers
// ============================================

interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  claims_supported?: string[];
}

async function fetchDiscoveryDocument(issuerUrl: string): Promise<OIDCDiscoveryDocument> {
  const normalized = issuerUrl.replace(/\/$/, '');
  const discoveryUrl = `${normalized}/sso/auth/.well-known/openid-configuration`;

  const response = await fetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new HTTPException(502, {
      message: `Failed to fetch OIDC discovery document from ${discoveryUrl}: HTTP ${response.status}`,
    });
  }

  const doc = (await response.json()) as OIDCDiscoveryDocument;

  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new HTTPException(502, {
      message: 'Remote OIDC discovery document is missing required fields',
    });
  }

  return doc;
}

function buildProviderKey(issuerUrl: string, domainId?: string): string {
  // Derive a stable slug from the issuer hostname so that multiple Exprsn
  // instances can be registered side-by-side. Format: exprsn:{slug}
  try {
    const { hostname } = new URL(issuerUrl);
    const slug = hostname.replace(/\./g, '-');
    return domainId ? `exprsn:${slug}:${domainId}` : `exprsn:${slug}`;
  } catch {
    return `exprsn:${Date.now()}`;
  }
}

// ============================================
// Routes
// ============================================

/**
 * GET /xrpc/io.exprsn.admin.sso.exprsn.discover
 *
 * Auto-discover Exprsn OIDC configuration from a remote instance URL.
 */
adminSSOExprsnRouter.get(
  '/io.exprsn.admin.sso.exprsn.discover',
  zValidator('query', discoverQuerySchema),
  async (c) => {
    const { issuerUrl } = c.req.valid('query');

    let doc: OIDCDiscoveryDocument;
    try {
      doc = await fetchDiscoveryDocument(issuerUrl);
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      throw new HTTPException(502, {
        message: `Could not reach remote Exprsn instance at ${issuerUrl}`,
      });
    }

    return c.json({
      issuer: doc.issuer,
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      userinfoEndpoint: doc.userinfo_endpoint,
      jwksUri: doc.jwks_uri,
      scopesSupported: doc.scopes_supported ?? [],
      responseTypesSupported: doc.response_types_supported ?? [],
      grantTypesSupported: doc.grant_types_supported ?? [],
      claimsSupported: doc.claims_supported ?? [],
    });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.sso.exprsn.register
 *
 * Register a remote Exprsn instance as an OIDC SSO provider.
 * Performs discovery to resolve endpoints, then stores the provider record.
 */
adminSSOExprsnRouter.post(
  '/io.exprsn.admin.sso.exprsn.register',
  zValidator('json', registerBodySchema),
  async (c) => {
    const body = c.req.valid('json');

    // Perform OIDC discovery to get absolute endpoint URLs
    let doc: OIDCDiscoveryDocument;
    try {
      doc = await fetchDiscoveryDocument(body.issuerUrl);
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      throw new HTTPException(502, {
        message: `Could not reach remote Exprsn instance at ${body.issuerUrl}`,
      });
    }

    const providerKey = buildProviderKey(body.issuerUrl, body.domainId);

    // Check for an existing registration with this key to prevent duplicates
    const [existing] = await db
      .select({ id: externalIdentityProviders.id })
      .from(externalIdentityProviders)
      .where(eq(externalIdentityProviders.providerKey, providerKey));

    if (existing) {
      throw new HTTPException(409, {
        message: `An Exprsn SSO provider for ${body.issuerUrl} is already registered (id: ${existing.id})`,
      });
    }

    const provider = await OIDCConsumerService.registerProvider({
      name: body.displayName ?? `Exprsn (${new URL(body.issuerUrl).hostname})`,
      providerKey,
      type: 'oidc',
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      userinfoEndpoint: doc.userinfo_endpoint,
      jwksUri: doc.jwks_uri,
      issuer: doc.issuer,
      scopes: ['openid', 'profile', 'email'],
      domainId: body.domainId,
      displayName: body.displayName ?? `Exprsn (${new URL(body.issuerUrl).hostname})`,
      autoProvisionUsers: body.autoProvision,
      defaultRole: body.defaultRole,
      // Exprsn-specific
      allowedScopes: body.allowedScopes,
      scopePolicy: body.scopePolicy,
      roleMapping: body.roleMapping,
      defaultAccountType: body.defaultAccountType,
    });

    return c.json(
      {
        id: provider.id,
        providerKey: provider.providerKey,
        displayName: provider.displayName,
        issuer: provider.issuer,
        authorizationEndpoint: provider.authorizationEndpoint,
        tokenEndpoint: provider.tokenEndpoint,
        userinfoEndpoint: provider.userinfoEndpoint,
        jwksUri: provider.jwksUri,
        scopes: provider.scopes,
        allowedScopes: provider.allowedScopes,
        scopePolicy: provider.scopePolicy,
        roleMapping: provider.roleMapping,
        defaultAccountType: provider.defaultAccountType,
        defaultRole: provider.defaultRole,
        autoProvisionUsers: provider.autoProvisionUsers,
        status: provider.status,
      },
      201
    );
  }
);

/**
 * GET /xrpc/io.exprsn.admin.sso.exprsn.scopes
 *
 * List all scopes available for Exprsn SSO providers plus the currently
 * configured allowed scopes for a specific provider.
 */
adminSSOExprsnRouter.get('/io.exprsn.admin.sso.exprsn.scopes', async (c) => {
  const providerId = c.req.query('providerId');

  let currentAllowedScopes: string[] = [];
  let currentScopePolicy: string = 'inherit';

  if (providerId) {
    const provider = await OIDCConsumerService.getProvider(providerId);
    if (!provider) {
      throw new HTTPException(404, { message: 'Provider not found' });
    }
    if (!provider.providerKey.startsWith('exprsn')) {
      throw new HTTPException(400, { message: 'Provider is not an Exprsn provider' });
    }
    currentAllowedScopes = provider.allowedScopes ?? [];
    currentScopePolicy = provider.scopePolicy ?? 'inherit';
  }

  return c.json({
    availableScopes: EXPRSN_SCOPES as unknown as ExprsnScope[],
    currentAllowedScopes,
    currentScopePolicy,
  });
});

/**
 * PUT /xrpc/io.exprsn.admin.sso.exprsn.scopes
 *
 * Update the allowed scopes and scope policy for a registered Exprsn provider.
 */
adminSSOExprsnRouter.put(
  '/io.exprsn.admin.sso.exprsn.scopes',
  zValidator('json', updateScopesBodySchema),
  async (c) => {
    const { providerId, allowedScopes, scopePolicy } = c.req.valid('json');

    const provider = await OIDCConsumerService.getProvider(providerId);
    if (!provider) {
      throw new HTTPException(404, { message: 'Provider not found' });
    }
    if (!provider.providerKey.startsWith('exprsn')) {
      throw new HTTPException(400, { message: 'Provider is not an Exprsn provider' });
    }

    // Validate that all requested scopes are recognised
    const unknown = allowedScopes.filter((s) => !(EXPRSN_SCOPES as readonly string[]).includes(s));
    if (unknown.length > 0) {
      throw new HTTPException(400, {
        message: `Unknown scope(s): ${unknown.join(', ')}. Valid scopes: ${EXPRSN_SCOPES.join(', ')}`,
      });
    }

    // Merge updated Exprsn fields back into jitConfig via a direct DB update
    // because updateProvider does not expose jitConfig.
    const currentJit = ((await db
      .select({ jitConfig: externalIdentityProviders.jitConfig })
      .from(externalIdentityProviders)
      .where(eq(externalIdentityProviders.id, providerId))
      .then(([row]) => row?.jitConfig)) as Record<string, unknown> | null) ?? {};

    const updatedJit: Record<string, unknown> = {
      ...currentJit,
      allowedScopes,
    };
    if (scopePolicy !== undefined) {
      updatedJit.scopePolicy = scopePolicy;
    }

    await db
      .update(externalIdentityProviders)
      .set({ jitConfig: updatedJit, updatedAt: new Date() })
      .where(eq(externalIdentityProviders.id, providerId));

    return c.json({
      providerId,
      allowedScopes,
      scopePolicy: (updatedJit.scopePolicy as string) ?? 'inherit',
    });
  }
);

/**
 * GET /xrpc/io.exprsn.admin.sso.exprsn.roleMapping
 *
 * Get the role mapping configuration for a registered Exprsn provider.
 */
adminSSOExprsnRouter.get(
  '/io.exprsn.admin.sso.exprsn.roleMapping',
  zValidator('query', getRoleMappingQuerySchema),
  async (c) => {
    const { providerId } = c.req.valid('query');

    const provider = await OIDCConsumerService.getProvider(providerId);
    if (!provider) {
      throw new HTTPException(404, { message: 'Provider not found' });
    }
    if (!provider.providerKey.startsWith('exprsn')) {
      throw new HTTPException(400, { message: 'Provider is not an Exprsn provider' });
    }

    return c.json({
      providerId,
      roleMapping: provider.roleMapping ?? {},
      defaultRole: provider.defaultRole,
      defaultAccountType: provider.defaultAccountType ?? 'personal',
    });
  }
);

/**
 * PUT /xrpc/io.exprsn.admin.sso.exprsn.roleMapping
 *
 * Update the role mapping configuration for a registered Exprsn provider.
 * Keys are remote role names; values are local role names.
 */
adminSSOExprsnRouter.put(
  '/io.exprsn.admin.sso.exprsn.roleMapping',
  zValidator('json', updateRoleMappingBodySchema),
  async (c) => {
    const { providerId, roleMapping } = c.req.valid('json');

    const provider = await OIDCConsumerService.getProvider(providerId);
    if (!provider) {
      throw new HTTPException(404, { message: 'Provider not found' });
    }
    if (!provider.providerKey.startsWith('exprsn')) {
      throw new HTTPException(400, { message: 'Provider is not an Exprsn provider' });
    }

    const currentJit = ((await db
      .select({ jitConfig: externalIdentityProviders.jitConfig })
      .from(externalIdentityProviders)
      .where(eq(externalIdentityProviders.id, providerId))
      .then(([row]) => row?.jitConfig)) as Record<string, unknown> | null) ?? {};

    const updatedJit: Record<string, unknown> = {
      ...currentJit,
      roleMapping,
    };

    await db
      .update(externalIdentityProviders)
      .set({ jitConfig: updatedJit, updatedAt: new Date() })
      .where(eq(externalIdentityProviders.id, providerId));

    return c.json({
      providerId,
      roleMapping,
    });
  }
);

export default adminSSOExprsnRouter;
