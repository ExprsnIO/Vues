import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import bcrypt from 'bcryptjs';
import { eq, and, or, ne, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { db, actorRepos, users, sessions, ssoAuditLog, userSettings, notificationSubscriptions, userRenderQuotas, userFeedPreferences, apiTokens, organizations, organizationMembers, organizationRoles, repositories, repoCommits, caEntityCertificates, plcIdentities, domains, domainUsers } from '../db/index.js';
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS, type SystemRoleName } from '@exprsn/shared';
import { PlcService, getPlcConfig, type DidMethod } from '../services/plc/index.js';
import { ExprsnDidService } from '../services/did/index.js';
import { queueTimelinePrefetch } from '../services/prefetch/producer.js';
import type { OrganizationType } from '@exprsn/shared';
import {
  authRateLimiter,
  trackFailedAuth,
  clearFailedAuth,
  getAuthDelay,
  sanitizeInput,
} from '../auth/security-middleware.js';
import { getNotificationService } from '../services/notifications/index.js';
import { zValidator, getValidatedData } from '../utils/zod-validator.js';
import {
  createAccountSchema,
  createSessionSchema,
  revokeSessionSchema,
} from '../utils/validation-schemas.js';
import {
  generateSessionTokens,
  hashSessionToken,
} from '../utils/session-tokens.js';
import { redis } from '../cache/redis.js';
import { emailService } from '../services/email/index.js';
import { promises as dnsPromises } from 'dns';

export const authRouter = new Hono();

// Domain for DID generation (fallback for legacy did:web)
const PDS_DOMAIN = process.env.PDS_DOMAIN || 'localhost:3002';
const PDS_ENDPOINT = process.env.PDS_ENDPOINT || 'http://localhost:3002';

/**
 * Generate a DID based on the configured method
 * Supports: did:plc (default), did:web (legacy), did:exprn (future)
 */
async function generateDid(handle: string, method?: DidMethod): Promise<string> {
  const config = await getPlcConfig();
  const didMethod = method || (config.enabled ? 'plc' : 'web');

  switch (didMethod) {
    case 'plc':
      // Generate a proper did:plc identifier
      return PlcService.generateDid();

    case 'exprn':
      // Future: Custom Exprsn DID method
      // For now, use same format as plc but with exprn prefix
      const randomBytes = crypto.randomBytes(16);
      const base32Chars = 'abcdefghijklmnopqrstuvwxyz234567';
      let result = '';
      for (let i = 0; i < 24; i++) {
        const byte = randomBytes[i % randomBytes.length];
        if (byte !== undefined) {
          result += base32Chars[byte % 32];
        }
      }
      return `did:exprn:${result}`;

    case 'web':
    default:
      // Legacy did:web format
      const safeHandle = handle.replace(/[^a-z0-9]/gi, '').toLowerCase();
      return `did:web:${PDS_DOMAIN}:user:${safeHandle}`;
  }
}

/**
 * Generate ECDSA P-256 key pair for signing
 */
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyRaw = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: Buffer.from(publicKeyRaw).toString('base64'),
    privateKey: Buffer.from(privateKeyRaw).toString('base64'),
  };
}

// Session token generation moved to utils/session-tokens.ts
// Uses generateSessionTokens() which provides both raw tokens and hashes

/**
 * Validate handle format
 */
function validateHandle(handle: string): { valid: boolean; error?: string; normalized?: string } {
  // Handle must be 3-20 characters, alphanumeric and underscores only
  const normalized = handle.toLowerCase().trim();

  if (normalized.length < 3) {
    return { valid: false, error: 'Handle must be at least 3 characters' };
  }

  if (normalized.length > 20) {
    return { valid: false, error: 'Handle must be at most 20 characters' };
  }

  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return { valid: false, error: 'Handle can only contain letters, numbers, and underscores' };
  }

  if (normalized.startsWith('_') || normalized.endsWith('_')) {
    return { valid: false, error: 'Handle cannot start or end with underscore' };
  }

  // Reserved handles
  const reserved = ['admin', 'api', 'app', 'auth', 'root', 'system', 'exprsn', 'support', 'help'];
  if (reserved.includes(normalized)) {
    return { valid: false, error: 'This handle is reserved' };
  }

  return { valid: true, normalized };
}

/**
 * Validate email format
 */
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================================================
// Sign Up
// =============================================================================

/**
 * Account types that should use did:exprsn by default
 */
type AccountType = 'personal' | 'creator' | 'business' | 'organization';

function determineDefaultDidMethod(accountType?: AccountType): DidMethod {
  // Creator/org/business accounts → did:exprsn
  if (['creator', 'organization', 'business'].includes(accountType || '')) {
    return 'exprn';
  }
  return 'plc';
}

/**
 * Generate default user settings based on account type
 */
function getDefaultUserSettings(accountType?: AccountType) {
  // Base defaults for all users
  const baseSettings = {
    themeId: 'slate',
    colorMode: 'dark' as const,
    accessibility: {
      reducedMotion: false,
      highContrast: false,
      largeText: false,
      screenReaderOptimized: false,
    },
    playback: {
      autoplay: true,
      defaultQuality: 'auto' as const,
      defaultMuted: false,
      loopVideos: false,
      dataSaver: false,
    },
    content: {
      language: 'en',
      contentWarnings: true,
      sensitiveContent: false,
    },
    layout: {
      commentsPosition: 'side' as const,
    },
  };

  // Creator accounts get semi-private defaults (DMs/comments from followers only)
  if (accountType === 'creator') {
    return {
      ...baseSettings,
      privacy: {
        privateAccount: false, // Profile visible for discoverability
        showActivityStatus: true,
        allowDuets: true,
        allowStitches: true,
        allowComments: 'following' as const, // Comments from followers only
        allowMessages: 'following' as const, // DMs from followers only
      },
    };
  }

  // Business/organization accounts - public by default for brand presence
  if (accountType === 'business' || accountType === 'organization') {
    return {
      ...baseSettings,
      privacy: {
        privateAccount: false,
        showActivityStatus: true,
        allowDuets: false, // Brands typically don't want duets
        allowStitches: false,
        allowComments: 'everyone' as const,
        allowMessages: 'everyone' as const,
      },
    };
  }

  // Personal accounts - balanced defaults
  return {
    ...baseSettings,
    privacy: {
      privateAccount: false,
      showActivityStatus: true,
      allowDuets: true,
      allowStitches: true,
      allowComments: 'everyone' as const,
      allowMessages: 'everyone' as const,
    },
  };
}

/**
 * Get render quota limits based on account type
 */
function getRenderQuotaLimits(accountType?: AccountType) {
  switch (accountType) {
    case 'creator':
      return { dailyLimit: 25, weeklyLimit: 150, concurrentLimit: 3, maxQuality: 'ultra' as const };
    case 'business':
      return { dailyLimit: 50, weeklyLimit: 300, concurrentLimit: 5, maxQuality: 'ultra' as const };
    case 'organization':
      return { dailyLimit: 100, weeklyLimit: 500, concurrentLimit: 10, maxQuality: 'ultra' as const };
    default: // personal
      return { dailyLimit: 10, weeklyLimit: 50, concurrentLimit: 2, maxQuality: 'high' as const };
  }
}

/**
 * Generate a secure API token
 */
function generateApiToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `exp_${nanoid(32)}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenPrefix = token.slice(0, 12);
  return { token, tokenHash, tokenPrefix };
}

/**
 * Get default API token scopes based on account type
 */
function getDefaultApiScopes(accountType?: AccountType): string[] {
  const baseScopes = ['read:profile', 'write:profile', 'read:videos', 'write:videos', 'read:feed'];

  switch (accountType) {
    case 'creator':
      return [...baseScopes, 'read:analytics', 'write:comments'];
    case 'business':
    case 'organization':
      return [...baseScopes, 'read:analytics', 'write:comments', 'read:members', 'write:members'];
    default:
      return baseScopes;
  }
}

/**
 * Ensure a domain record exists in the database for the given domain suffix.
 * Performs a DNS lookup to determine if the domain is active.
 * Does not assign ownership — just ensures the domain is tracked.
 */
async function ensureDomainExists(domainSuffix: string): Promise<void> {
  // Normalize: strip leading dots
  const domainName = domainSuffix.replace(/^\.+/, '');
  if (!domainName || domainName.length < 2) return;

  // Check if domain already exists
  const existing = await db.query.domains.findFirst({
    where: eq(domains.domain, domainName),
  });

  if (existing) {
    // Domain already tracked — increment user count
    await db
      .update(domains)
      .set({ userCount: sql`${domains.userCount} + 1`, updatedAt: new Date() })
      .where(eq(domains.id, existing.id));
    return;
  }

  // Perform DNS lookup to check if domain resolves
  let dnsActive = false;
  let dnsRecords: string[] = [];
  try {
    const addresses = await dnsPromises.resolve4(domainName);
    if (addresses.length > 0) {
      dnsActive = true;
      dnsRecords = addresses;
    }
  } catch {
    // Domain doesn't resolve — that's fine, we still track it
    try {
      // Try CNAME as fallback
      const cname = await dnsPromises.resolveCname(domainName);
      if (cname.length > 0) {
        dnsActive = true;
        dnsRecords = cname;
      }
    } catch {
      // No DNS records found — domain is tracked but unverified
    }
  }

  const domainId = nanoid();
  const now = new Date();

  try {
    await db.insert(domains).values({
      id: domainId,
      name: domainName,
      domain: domainName,
      type: 'hosted',
      status: dnsActive ? 'active' : 'pending',
      handleSuffix: `.${domainName}`,
      dnsVerifiedAt: dnsActive ? now : null,
      userCount: 1,
      groupCount: 0,
      certificateCount: 0,
      identityCount: 0,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing(); // Race-safe: another request may have created it
  } catch (err) {
    // Domain insert failed (e.g. unique constraint race) — not critical
    console.warn(`Failed to auto-create domain record for ${domainName}:`, err);
  }
}

/**
 * Create additional user data during signup
 */
async function createUserSignupData(
  did: string,
  accountType?: AccountType,
  organizationData?: { name: string; type: string }
) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Create notification subscriptions (all enabled by default)
  await db.insert(notificationSubscriptions).values({
    userDid: did,
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    reposts: true,
    messages: true,
    fromFollowingOnly: false,
    pushEnabled: true,
    emailEnabled: false, // Requires email verification first
  });

  // Create render quotas based on account type
  const quotaLimits = getRenderQuotaLimits(accountType);
  await db.insert(userRenderQuotas).values({
    userDid: did,
    dailyLimit: quotaLimits.dailyLimit,
    dailyUsed: 0,
    dailyResetAt: tomorrow,
    weeklyLimit: quotaLimits.weeklyLimit,
    weeklyUsed: 0,
    weeklyResetAt: nextWeek,
    concurrentLimit: quotaLimits.concurrentLimit,
    maxQuality: quotaLimits.maxQuality,
    priorityBoost: 0,
  });

  // Create empty feed preferences for algorithm
  await db.insert(userFeedPreferences).values({
    userDid: did,
    tagAffinities: [],
    authorAffinities: [],
    soundAffinities: [],
    negativeSignals: {
      hiddenAuthors: [],
      hiddenTags: [],
      notInterestedVideos: [],
      seeLessAuthors: [],
      seeLessTags: [],
    },
    avgWatchCompletion: 0.5,
    likeThreshold: 0.7,
    commentThreshold: 0.8,
    totalInteractions: 0,
    totalWatchTime: 0,
  });

  // Generate personal API token
  const { token, tokenHash, tokenPrefix } = generateApiToken();
  const scopes = getDefaultApiScopes(accountType);

  await db.insert(apiTokens).values({
    id: nanoid(),
    tokenHash,
    tokenPrefix,
    name: 'Personal API Token',
    description: 'Auto-generated during signup',
    ownerDid: did,
    tokenType: 'personal',
    scopes,
    rateLimit: accountType === 'organization' ? 1000 : accountType === 'business' ? 500 : 100,
    status: 'active',
  });

  // Auto-create organization for organization/business account types
  let createdOrganization: { id: string; name: string } | null = null;
  if ((accountType === 'organization' || accountType === 'business') && organizationData) {
    const orgId = nanoid();

    await db.insert(organizations).values({
      id: orgId,
      ownerDid: did,
      name: organizationData.name,
      type: organizationData.type || (accountType === 'business' ? 'company' : 'team'),
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Create system roles for the organization
    const systemRoleNames = Object.keys(SYSTEM_ROLES) as SystemRoleName[];
    const roleIdMap: Record<string, string> = {};

    for (const roleName of systemRoleNames) {
      const roleConfig = SYSTEM_ROLES[roleName];
      const permissions = SYSTEM_ROLE_PERMISSIONS[roleName];
      const roleId = nanoid();
      roleIdMap[roleName] = roleId;

      await db.insert(organizationRoles).values({
        id: roleId,
        organizationId: orgId,
        name: roleName,
        displayName: roleConfig.displayName,
        description: roleConfig.description,
        permissions: permissions,
        priority: roleConfig.priority,
        color: roleConfig.color,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Add owner as member
    await db.insert(organizationMembers).values({
      id: nanoid(),
      organizationId: orgId,
      userDid: did,
      role: 'owner',
      roleId: roleIdMap['owner'],
      permissions: SYSTEM_ROLE_PERMISSIONS['owner'],
      joinedAt: now,
    });

    createdOrganization = { id: orgId, name: organizationData.name };
  }

  return {
    apiToken: token, // Return token once - not stored in plain text
    organization: createdOrganization,
  };
}

/**
 * Create a new account
 * POST /xrpc/io.exprsn.auth.createAccount
 * Rate limited: 3 signups per hour per IP
 */
authRouter.post('/io.exprsn.auth.createAccount', authRateLimiter('signup'), zValidator('json', createAccountSchema), async (c) => {
  const body = getValidatedData<typeof createAccountSchema._output>(c);

  const handle = body.handle.toLowerCase().trim();

  // Determine DID method based on account type
  const didMethod = body.didMethod || determineDefaultDidMethod(body.accountType);

  // Compute the full handle (with domain suffix) upfront so availability
  // checks compare against the same value that will be stored.
  const plcConfig = await getPlcConfig();
  const domainSuffix = didMethod === 'exprn'
    ? 'exprsn'
    : (plcConfig.handleSuffix || 'exprsn.io');
  const fullHandle = `${handle}.${domainSuffix}`;

  // ── Availability checks (across ALL identity tables) ─────────────────
  // Check actor_repos, users, AND plcIdentities for the full handle
  const [existingActor, existingUser, existingPlcIdentity, existingEmail] = await Promise.all([
    db.query.actorRepos.findFirst({
      where: or(eq(actorRepos.handle, handle), eq(actorRepos.handle, fullHandle)),
    }),
    db.query.users.findFirst({
      where: or(eq(users.handle, handle), eq(users.handle, fullHandle)),
    }),
    db.query.plcIdentities.findFirst({
      where: eq(plcIdentities.handle, fullHandle),
    }),
    db.query.actorRepos.findFirst({
      where: eq(actorRepos.email, body.email.toLowerCase()),
    }),
  ]);

  if (existingActor || existingUser || existingPlcIdentity) {
    throw new HTTPException(400, { message: 'Handle already taken' });
  }

  if (existingEmail) {
    throw new HTTPException(400, { message: 'Email already registered' });
  }

  // ── Ensure domain is tracked in the domains table ────────────────────
  // Fire-and-forget: domain creation is non-blocking for signup
  ensureDomainExists(domainSuffix).catch((err) =>
    console.warn('Failed to auto-create domain record during signup:', err)
  );

  // ── did:exprsn flow (creator/business/organization accounts) ─────────
  if (didMethod === 'exprn') {
    try {
      // Create did:exprsn with certificate
      const result = await ExprsnDidService.createCreatorDid({
        handle,
        email: body.email,
        displayName: body.displayName,
      });

      const passwordHash = await bcrypt.hash(body.password, 10);

      // Generate session tokens (returns raw tokens for user, hashes for storage)
      const { accessToken, refreshToken, accessTokenHash, refreshTokenHash } = generateSessionTokens();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Create account in actor_repos with certificate reference
      await db.insert(actorRepos).values({
        did: result.did,
        handle: result.handle,
        email: body.email.toLowerCase(),
        passwordHash,
        signingKeyPublic: result.publicKeyMultibase,
        signingKeyPrivate: '', // Private key not stored for did:exprsn
        didMethod: 'exprn',
        certificateId: result.certificate.id,
        status: 'active',
      });

      // Create in users table (must happen before linking certificates via subjectDid FK)
      await db.insert(users).values({
        did: result.did,
        handle: result.handle,
        displayName: body.displayName || handle,
        avatar: null,
        bio: null,
      });

      // Now link certificates to the user via subjectDid (FK requires users row)
      await db
        .update(caEntityCertificates)
        .set({ subjectDid: result.did })
        .where(eq(caEntityCertificates.id, result.certificate.id));

      if (result.additionalCertificates?.codeSigning) {
        await db
          .update(caEntityCertificates)
          .set({ subjectDid: result.did })
          .where(eq(caEntityCertificates.id, result.additionalCertificates.codeSigning.id));
      }

      // Create initial empty repository
      try {
        const initialCommitCid = `bafyrei${crypto.randomBytes(16).toString('hex').slice(0, 43)}`;

        await db.insert(repositories).values({
          did: result.did,
          head: initialCommitCid,
          rev: 1,
        }).onConflictDoNothing();

        await db.insert(repoCommits).values({
          cid: initialCommitCid,
          did: result.did,
          rev: '1',
          data: '',
        }).onConflictDoNothing();
      } catch (err) {
        console.warn('Failed to create initial repo commit:', err);
      }

      // Create default user settings based on account type
      const defaultSettings = getDefaultUserSettings(body.accountType);
      await db.insert(userSettings).values({
        userDid: result.did,
        ...defaultSettings,
      });

      // Create session (store hashes, not raw tokens)
      await db.insert(sessions).values({
        id: nanoid(),
        did: result.did,
        accessJwt: accessTokenHash,
        refreshJwt: refreshTokenHash,
        expiresAt,
      });

      // Create additional user data (notifications, quotas, feed prefs, API token, org)
      const signupData = await createUserSignupData(
        result.did,
        body.accountType,
        body.organizationName ? {
          name: body.organizationName,
          type: body.organizationType || (body.accountType === 'business' ? 'company' : 'team'),
        } : undefined
      );

      // Send welcome email (non-blocking)
      getNotificationService().sendWelcomeEmail(
        result.did,
        result.handle,
        body.email,
        body.displayName
      ).catch((err) => console.error('Failed to send welcome email:', err));

      // Return response with certificates (one-time download)
      return c.json({
        success: true,
        accessJwt: accessToken,
        refreshJwt: refreshToken,
        handle: result.handle,
        did: result.did,
        didMethod: 'exprn',
        user: {
          did: result.did,
          handle: result.handle,
          displayName: body.displayName || handle,
          avatar: null,
        },
        // Client auth certificate for mTLS authentication
        certificate: {
          pem: result.certificate.pem,
          privateKey: result.privateKey,
          fingerprint: result.certificate.fingerprint,
          validUntil: result.certificate.validUntil.toISOString(),
          type: 'client',
        },
        // Code signing certificate for signing commits/content
        codeSigningCertificate: result.additionalCertificates?.codeSigning ? {
          pem: result.additionalCertificates.codeSigning.pem,
          privateKey: result.additionalCertificates.codeSigning.privateKey,
          fingerprint: result.additionalCertificates.codeSigning.fingerprint,
          validUntil: result.additionalCertificates.codeSigning.validUntil.toISOString(),
          type: 'code_signing',
        } : undefined,
        // Personal API token (one-time)
        apiToken: signupData.apiToken,
        // Auto-created organization (if applicable)
        organization: signupData.organization,
      });
    } catch (error) {
      console.error('Failed to create did:exprsn account:', error);
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to create certificate-backed account',
      });
    }
  }

  // ── Standard did:plc or did:web flow ─────────────────────────────────
  const did = await generateDid(handle, didMethod);
  const { publicKey, privateKey } = await generateKeyPair();
  const passwordHash = await bcrypt.hash(body.password, 10);

  // Generate session tokens (returns raw tokens for user, hashes for storage)
  const { accessToken, refreshToken, accessTokenHash, refreshTokenHash } = generateSessionTokens();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // If PLC is enabled, register the DID with the PLC service
  if (plcConfig.enabled && did.startsWith('did:plc:')) {
    try {
      // Convert the SPKI public key to multibase format for PLC
      const publicKeyMultibase = `z${Buffer.from(publicKey, 'base64').toString('base64url')}`;

      // Register the already-generated DID with PLC
      await PlcService.registerDid(did, {
        handle: fullHandle,
        signingKey: publicKeyMultibase,
        rotationKeys: [publicKeyMultibase], // User controls their own rotation key
        pdsEndpoint: PDS_ENDPOINT,
      });
    } catch (plcError) {
      // Log but don't fail - PLC registration can be retried
      console.error('Failed to register DID with PLC:', plcError);
    }
  }

  // Create account in actor_repos with full handle
  await db.insert(actorRepos).values({
    did,
    handle: fullHandle,
    email: body.email.toLowerCase(),
    passwordHash,
    signingKeyPublic: publicKey,
    signingKeyPrivate: privateKey,
    didMethod: didMethod,
    status: 'active',
  });

  // Also create in users table for app functionality
  await db.insert(users).values({
    did,
    handle: fullHandle,
    displayName: body.displayName || handle,
    avatar: null,
    bio: null,
  });

  // Create initial empty repository
  try {
    const initialCommitCid = `bafyrei${crypto.randomBytes(16).toString('hex').slice(0, 43)}`;

    await db.insert(repositories).values({
      did,
      head: initialCommitCid,
      rev: 1,
    }).onConflictDoNothing();

    await db.insert(repoCommits).values({
      cid: initialCommitCid,
      did,
      rev: '1',
      data: '',
    }).onConflictDoNothing();
  } catch (err) {
    console.warn('Failed to create initial repo commit:', err);
  }

  // Create default user settings based on account type
  const defaultSettings = getDefaultUserSettings(body.accountType);
  await db.insert(userSettings).values({
    userDid: did,
    ...defaultSettings,
  });

  // Create session (store hashes, not raw tokens)
  await db.insert(sessions).values({
    id: nanoid(),
    did,
    accessJwt: accessTokenHash,
    refreshJwt: refreshTokenHash,
    expiresAt,
  });

  // Create additional user data (notifications, quotas, feed prefs, API token, org)
  const signupData = await createUserSignupData(
    did,
    body.accountType,
    body.organizationName ? {
      name: body.organizationName,
      type: body.organizationType || (body.accountType === 'business' ? 'company' : 'team'),
    } : undefined
  );

  // Send welcome email (non-blocking)
  getNotificationService().sendWelcomeEmail(
    did,
    fullHandle,
    body.email,
    body.displayName
  ).catch((err) => console.error('Failed to send welcome email:', err));

  return c.json({
    success: true,
    accessJwt: accessToken,
    refreshJwt: refreshToken,
    handle: fullHandle,
    did,
    didMethod,
    user: {
      did,
      handle: fullHandle,
      displayName: body.displayName || handle,
      avatar: null,
    },
    // Personal API token (one-time)
    apiToken: signupData.apiToken,
    // Auto-created organization (if applicable)
    organization: signupData.organization,
  });
});

// =============================================================================
// Sign In
// =============================================================================

/**
 * Login with existing account
 * POST /xrpc/io.exprsn.auth.createSession
 * Rate limited: 5 attempts per 15 minutes per IP
 */
authRouter.post('/io.exprsn.auth.createSession', authRateLimiter('login'), zValidator('json', createSessionSchema), async (c) => {
  const body = getValidatedData<typeof createSessionSchema._output>(c);

  const identifier = sanitizeInput(body.identifier);
  const clientIP = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') || 'unknown';

  // Apply progressive delay based on failed attempts
  const delay = await getAuthDelay(clientIP, identifier);
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Find account by handle or email
  let account = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.handle, identifier),
  });

  // Try with .exprsn.io suffix if bare handle was provided
  if (!account && !identifier.includes('.')) {
    account = await db.query.actorRepos.findFirst({
      where: eq(actorRepos.handle, `${identifier}.exprsn.io`),
    });
  }

  if (!account) {
    account = await db.query.actorRepos.findFirst({
      where: eq(actorRepos.email, identifier),
    });
  }

  if (!account) {
    // Track failed attempt but don't reveal if account exists
    await trackFailedAuth(clientIP, identifier);
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  // Verify password
  const valid = await bcrypt.compare(body.password, account.passwordHash || '');
  if (!valid) {
    // Track failed attempt
    await trackFailedAuth(clientIP, identifier);
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  // Clear failed auth tracking on successful login
  await clearFailedAuth(clientIP, identifier);

  // Check account status
  if (account.status !== 'active') {
    throw new HTTPException(403, { message: 'Account is not active' });
  }

  // Generate new session tokens (returns raw tokens for user, hashes for storage)
  const { accessToken, refreshToken, accessTokenHash, refreshTokenHash } = generateSessionTokens();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create session (store hashes, not raw tokens)
  await db.insert(sessions).values({
    id: nanoid(),
    did: account.did,
    accessJwt: accessTokenHash,
    refreshJwt: refreshTokenHash,
    expiresAt,
  });

  // Get user profile
  const user = await db.query.users.findFirst({
    where: eq(users.did, account.did),
  });

  // Queue high-priority timeline prefetch on login (fire-and-forget)
  queueTimelinePrefetch(account.did, 'high').catch(() => {});

  return c.json({
    success: true,
    accessJwt: accessToken,
    refreshJwt: refreshToken,
    handle: account.handle,
    did: account.did,
    email: account.email,
    user: user ? {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
    } : null,
  });
});

// =============================================================================
// Get Session
// =============================================================================

/**
 * Get current session info
 * GET /xrpc/io.exprsn.auth.getSession
 */
authRouter.get('/io.exprsn.auth.getSession', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);
  // Hash the token to look it up in the database
  const accessTokenHash = hashSessionToken(accessToken);

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.accessJwt, accessTokenHash),
  });

  if (!session || session.expiresAt < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired session' });
  }

  // Get account
  const account = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.did, session.did),
  });

  if (!account) {
    throw new HTTPException(401, { message: 'Account not found' });
  }

  // Get user profile
  const user = await db.query.users.findFirst({
    where: eq(users.did, session.did),
  });

  return c.json({
    handle: account.handle,
    did: account.did,
    email: account.email,
    user: user ? {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      videoCount: user.videoCount,
      verified: user.verified,
    } : null,
  });
});

// =============================================================================
// Refresh Session
// =============================================================================

/**
 * Refresh access token
 * POST /xrpc/io.exprsn.auth.refreshSession
 * Rate limited: 30 per minute per user
 */
authRouter.post('/io.exprsn.auth.refreshSession', authRateLimiter('refresh'), async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing refresh token' });
  }

  const refreshToken = auth.slice(7);
  // Hash the token to look it up in the database
  const refreshTokenHash = hashSessionToken(refreshToken);

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.refreshJwt, refreshTokenHash),
  });

  if (!session) {
    throw new HTTPException(401, { message: 'Invalid refresh token' });
  }

  // Check if the session has expired
  if (session.expiresAt < new Date()) {
    // Delete expired session
    await db.delete(sessions).where(eq(sessions.id, session.id));
    throw new HTTPException(401, { message: 'Session expired' });
  }

  // Get account
  const account = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.did, session.did),
  });

  if (!account) {
    throw new HTTPException(401, { message: 'Account not found' });
  }

  // Delete old session
  await db.delete(sessions).where(eq(sessions.id, session.id));

  // Generate new tokens (returns raw tokens for user, hashes for storage)
  const { accessToken: newAccessToken, refreshToken: newRefreshToken, accessTokenHash, refreshTokenHash: newRefreshTokenHash } = generateSessionTokens();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create new session (store hashes, not raw tokens)
  await db.insert(sessions).values({
    id: nanoid(),
    did: account.did,
    accessJwt: accessTokenHash,
    refreshJwt: newRefreshTokenHash,
    expiresAt,
  });

  return c.json({
    accessJwt: newAccessToken,
    refreshJwt: newRefreshToken,
    handle: account.handle,
    did: account.did,
  });
});

// =============================================================================
// Delete Session (Logout)
// =============================================================================

/**
 * Logout / delete session
 * POST /xrpc/io.exprsn.auth.deleteSession
 */
authRouter.post('/io.exprsn.auth.deleteSession', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);
  // Hash the token to look it up in the database
  const accessTokenHash = hashSessionToken(accessToken);

  await db.delete(sessions).where(eq(sessions.accessJwt, accessTokenHash));

  return c.json({ success: true });
});

// =============================================================================
// Session Management
// =============================================================================

/**
 * List all sessions for the current user
 * GET /xrpc/io.exprsn.auth.listSessions
 */
authRouter.get('/io.exprsn.auth.listSessions', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);
  // Hash the token to look it up in the database
  const accessTokenHash = hashSessionToken(accessToken);

  // Get current session to find the user
  const currentSession = await db.query.sessions.findFirst({
    where: eq(sessions.accessJwt, accessTokenHash),
  });

  if (!currentSession || currentSession.expiresAt < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired session' });
  }

  // Get all sessions for this user
  const userSessions = await db.query.sessions.findMany({
    where: eq(sessions.did, currentSession.did),
  });

  return c.json({
    sessions: userSessions.map((s) => ({
      id: s.id,
      deviceName: 'Unknown Device',
      browser: 'Web Browser',
      location: undefined,
      lastActive: s.createdAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.id === currentSession.id,
    })),
  });
});

/**
 * Revoke a specific session
 * POST /xrpc/io.exprsn.auth.revokeSession
 */
authRouter.post('/io.exprsn.auth.revokeSession', zValidator('json', revokeSessionSchema), async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);
  // Hash the token to look it up in the database
  const accessTokenHash = hashSessionToken(accessToken);
  const body = getValidatedData<typeof revokeSessionSchema._output>(c);

  // Get current session to verify ownership
  const currentSession = await db.query.sessions.findFirst({
    where: eq(sessions.accessJwt, accessTokenHash),
  });

  if (!currentSession || currentSession.expiresAt < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired session' });
  }

  // Find the session to revoke
  const targetSession = await db.query.sessions.findFirst({
    where: eq(sessions.id, body.sessionId),
  });

  if (!targetSession) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  // Ensure the session belongs to the current user
  if (targetSession.did !== currentSession.did) {
    throw new HTTPException(403, { message: 'Cannot revoke session belonging to another user' });
  }

  // Cannot revoke current session with this endpoint
  if (targetSession.id === currentSession.id) {
    throw new HTTPException(400, { message: 'Cannot revoke current session. Use deleteSession instead.' });
  }

  await db.delete(sessions).where(eq(sessions.id, body.sessionId));

  return c.json({ success: true });
});

/**
 * Revoke all other sessions (except current)
 * POST /xrpc/io.exprsn.auth.revokeAllSessions
 */
authRouter.post('/io.exprsn.auth.revokeAllSessions', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);
  // Hash the token to look it up in the database
  const accessTokenHash = hashSessionToken(accessToken);

  // Get current session
  const currentSession = await db.query.sessions.findFirst({
    where: eq(sessions.accessJwt, accessTokenHash),
  });

  if (!currentSession || currentSession.expiresAt < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired session' });
  }

  // Delete all sessions for this user except the current one
  const deletedSessions = await db.delete(sessions).where(
    and(
      eq(sessions.did, currentSession.did),
      ne(sessions.id, currentSession.id)
    )
  ).returning({ id: sessions.id });

  return c.json({ success: true, revokedCount: deletedSessions.length });
});

/**
 * Get login history for the current user
 * GET /xrpc/io.exprsn.auth.getLoginHistory
 */
authRouter.get('/io.exprsn.auth.getLoginHistory', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);
  // Hash the token to look it up in the database
  const accessTokenHash = hashSessionToken(accessToken);

  // Get current session to find the user
  const currentSession = await db.query.sessions.findFirst({
    where: eq(sessions.accessJwt, accessTokenHash),
  });

  if (!currentSession || currentSession.expiresAt < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired session' });
  }

  // Get login history from SSO audit log
  const loginEvents = await db
    .select()
    .from(ssoAuditLog)
    .where(
      and(
        eq(ssoAuditLog.userDid, currentSession.did),
        eq(ssoAuditLog.eventType, 'login')
      )
    )
    .orderBy(desc(ssoAuditLog.createdAt))
    .limit(50);

  // Parse user agent to extract device and browser info
  const parseUserAgent = (ua: string | null): { deviceName: string; browser: string } => {
    if (!ua) return { deviceName: 'Unknown Device', browser: 'Unknown Browser' };

    let browser = 'Unknown Browser';
    let deviceName = 'Desktop';

    // Detect browser
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      browser = 'Chrome';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      browser = 'Safari';
    } else if (ua.includes('Firefox')) {
      browser = 'Firefox';
    } else if (ua.includes('Edg')) {
      browser = 'Edge';
    } else if (ua.includes('Opera') || ua.includes('OPR')) {
      browser = 'Opera';
    }

    // Detect device type
    if (ua.includes('Mobile') || ua.includes('Android')) {
      deviceName = 'Mobile';
    } else if (ua.includes('Tablet') || ua.includes('iPad')) {
      deviceName = 'Tablet';
    }

    return { deviceName, browser };
  };

  return c.json({
    history: loginEvents.map((event) => {
      const { deviceName, browser } = parseUserAgent(event.userAgent);
      return {
        id: event.id,
        deviceName,
        browser,
        location: undefined,
        ipAddress: event.ipAddress,
        timestamp: event.createdAt.toISOString(),
        success: event.success,
      };
    }),
  });
});

// =============================================================================
// Password Reset
// =============================================================================

/**
 * Request a password reset
 * POST /xrpc/io.exprsn.auth.requestPasswordReset
 * Rate limited: 3 per hour per IP
 *
 * Accepts { email } or { handle } or { identifier } (auto-detect).
 * Always returns { success: true } to avoid revealing whether an account exists.
 */
authRouter.post('/io.exprsn.auth.requestPasswordReset', authRateLimiter('signup'), async (c) => {
  const body = await c.req.json<{ email?: string; handle?: string; identifier?: string }>();

  // Support { identifier } that could be either email or handle
  const email = body.email || (body.identifier && body.identifier.includes('@') ? body.identifier : undefined);
  const handle = body.handle || (body.identifier && !body.identifier.includes('@') ? body.identifier : undefined);

  if (!email && !handle) {
    // Still return success to avoid leaking info
    return c.json({ success: true });
  }

  try {
    // Look up user by email or handle
    let account = email
      ? await db.query.actorRepos.findFirst({
          where: eq(actorRepos.email, email.toLowerCase()),
        })
      : null;

    if (!account && handle) {
      account = await db.query.actorRepos.findFirst({
        where: eq(actorRepos.handle, handle.toLowerCase().trim()),
      });
    }

    if (account && account.email) {
      // Generate a reset token
      const token = nanoid(32);

      // Store in Redis with 1-hour TTL
      await redis.setex(
        `password-reset:${token}`,
        3600, // 1 hour
        JSON.stringify({
          did: account.did,
          email: account.email,
          handle: account.handle,
        })
      );

      // In development, log the token so it can be used without an actual inbox
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Password Reset] Token for ${account.handle} (${account.email}): ${token}`);
        console.log(`[Password Reset] Reset URL: ${process.env.WEB_URL || 'http://localhost:3001'}/reset-password?token=${token}`);
      }

      // Send password reset email (fire-and-forget)
      emailService.sendPasswordReset(account.email, token, account.handle).catch((err) =>
        console.error('[Password Reset] Failed to send email:', err)
      );
    }
  } catch (error) {
    // Log error but don't reveal it to the client
    console.error('Password reset request error:', error);
  }

  // Always return success to avoid revealing whether the account exists
  return c.json({ success: true });
});

/**
 * Reset password using a token
 * POST /xrpc/io.exprsn.auth.resetPassword
 * Rate limited: 5 per 15 minutes per IP
 */
authRouter.post('/io.exprsn.auth.resetPassword', authRateLimiter('login'), async (c) => {
  const body = await c.req.json<{ token: string; newPassword: string }>();

  if (!body.token || !body.newPassword) {
    throw new HTTPException(400, { message: 'Token and new password are required' });
  }

  if (body.newPassword.length < 8) {
    throw new HTTPException(400, { message: 'Password must be at least 8 characters' });
  }

  // Look up token in Redis
  const tokenData = await redis.get(`password-reset:${body.token}`);

  if (!tokenData) {
    throw new HTTPException(400, { message: 'Invalid or expired reset token' });
  }

  let resetInfo: { did: string; email: string; handle: string };
  try {
    resetInfo = JSON.parse(tokenData);
  } catch {
    throw new HTTPException(400, { message: 'Invalid reset token' });
  }

  // Verify the account still exists
  const account = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.did, resetInfo.did),
  });

  if (!account) {
    throw new HTTPException(400, { message: 'Account not found' });
  }

  // Hash the new password
  const passwordHash = await bcrypt.hash(body.newPassword, 10);

  // Update the password
  await db
    .update(actorRepos)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(actorRepos.did, resetInfo.did));

  // Delete the reset token (single use)
  await redis.del(`password-reset:${body.token}`);

  // Delete all sessions for this user (force re-login)
  await db.delete(sessions).where(eq(sessions.did, resetInfo.did));

  return c.json({ success: true });
});
