/**
 * Identity routes for did:exprsn
 *
 * XRPC endpoints for creating, managing, and resolving did:exprsn identities.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS, authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { ExprsnDidService } from '../services/did/exprsn.js';
import { db } from '../db/index.js';
import {
  organizations,
  exprsnDidCertificates,
  organizationIntermediateCAs,
  caEntityCertificates,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { OrganizationType } from '@exprsn/shared';

const identityExprsnRouter = new Hono();

/**
 * POST /xrpc/io.exprsn.identity.createDid
 * Create a new did:exprsn identity with certificate-based authentication
 */
identityExprsnRouter.post('/io.exprsn.identity.createDid', async (c) => {
  const body = await c.req.json<{
    handle: string;
    email?: string;
    displayName?: string;
    certificateType: 'creator' | 'organization' | 'member';
    organizationId?: string;
    role?: string;
  }>();

  if (!body.handle || !body.certificateType) {
    throw new HTTPException(400, { message: 'Missing required fields: handle, certificateType' });
  }

  // Normalize handle (remove @ if present)
  const handle = body.handle.replace(/^@/, '');

  try {
    let result;

    switch (body.certificateType) {
      case 'creator':
        // Create individual creator DID with platform-issued certificate
        result = await ExprsnDidService.createCreatorDid({
          handle,
          email: body.email,
          displayName: body.displayName,
        });
        break;

      case 'organization':
        // Create organization owner DID (may create org intermediate CA)
        if (!body.organizationId) {
          throw new HTTPException(400, { message: 'organizationId required for organization certificate' });
        }

        // Get organization details from database
        const [org] = await db
          .select({
            id: organizations.id,
            name: organizations.name,
            type: organizations.type,
          })
          .from(organizations)
          .where(eq(organizations.id, body.organizationId))
          .limit(1);

        if (!org) {
          throw new HTTPException(404, { message: 'Organization not found' });
        }

        result = await ExprsnDidService.createOrganizationDid({
          handle,
          organizationId: body.organizationId,
          organizationType: (org.type || 'enterprise') as OrganizationType,
          organizationName: org.name,
          email: body.email,
        });
        break;

      case 'member':
        // Create organization member DID (uses org intermediate CA)
        if (!body.organizationId) {
          throw new HTTPException(400, { message: 'organizationId required for member certificate' });
        }

        result = await ExprsnDidService.createMemberDid({
          handle,
          organizationId: body.organizationId,
          role: body.role || 'member',
          email: body.email,
        });
        break;

      default:
        throw new HTTPException(400, { message: 'Invalid certificateType' });
    }

    return c.json(result, 201);
  } catch (error) {
    console.error('DID creation error:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to create DID',
    });
  }
});

/**
 * GET /xrpc/io.exprsn.identity.resolveDid
 * Resolve a did:exprsn to its DID document with certificate chain
 */
identityExprsnRouter.get('/io.exprsn.identity.resolveDid', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'Missing did parameter' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  try {
    const document = await ExprsnDidService.getDidDocument(did);

    if (!document) {
      throw new HTTPException(404, { message: 'DID not found' });
    }

    // Get certificate chain
    const certificateChain = await ExprsnDidService.getCertificateChain(did);

    // Get certificate status
    const status = await ExprsnDidService.checkCertificateStatus(did);

    // Get certificate info for handle
    const certInfo = await ExprsnDidService.getCertificateInfo(did);

    return c.json({
      did,
      document,
      handle: certInfo?.commonName || undefined,
      certificateChain,
      status: status.status === 'good' ? 'active' : status.status,
    });
  } catch (error) {
    console.error('DID resolution error:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to resolve DID',
    });
  }
});

/**
 * POST /xrpc/io.exprsn.identity.rotateKeys
 * Rotate cryptographic keys for a did:exprsn by reissuing certificate
 */
identityExprsnRouter.post('/io.exprsn.identity.rotateKeys', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    did: string;
  }>();

  if (!body.did) {
    throw new HTTPException(400, { message: 'Missing did parameter' });
  }

  if (!body.did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  // Only allow users to rotate their own keys (or admins)
  const isAdmin = c.get('adminUser');
  if (body.did !== userDid && !isAdmin) {
    throw new HTTPException(403, { message: 'Can only rotate keys for your own DID' });
  }

  try {
    const result = await ExprsnDidService.rotateKeys(body.did);

    return c.json(result);
  } catch (error) {
    console.error('Key rotation error:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to rotate keys',
    });
  }
});

/**
 * POST /xrpc/io.exprsn.identity.revokeDid
 * Revoke a did:exprsn by revoking its underlying certificate (admin only)
 */
identityExprsnRouter.post(
  '/io.exprsn.identity.revokeDid',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.USERS_BAN),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      did: string;
      reason: string;
    }>();

    if (!body.did || !body.reason) {
      throw new HTTPException(400, { message: 'Missing required fields: did, reason' });
    }

    if (!body.did.startsWith('did:exprsn:')) {
      throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
    }

    try {
      await ExprsnDidService.revokeDid(body.did, body.reason, adminUser.userDid);

      return c.json({
        success: true,
        did: body.did,
        revokedAt: new Date().toISOString(),
        reason: body.reason,
      });
    } catch (error) {
      console.error('DID revocation error:', error);

      if (error instanceof HTTPException) {
        throw error;
      }

      // Check for specific error types
      const errorMessage = error instanceof Error ? error.message : 'Failed to revoke DID';

      if (errorMessage.includes('not found')) {
        throw new HTTPException(404, { message: 'DID not found' });
      }

      if (errorMessage.includes('already revoked')) {
        throw new HTTPException(400, { message: 'DID is already revoked' });
      }

      throw new HTTPException(500, { message: errorMessage });
    }
  }
);

/**
 * GET /xrpc/io.exprsn.identity.getCertificateStatus
 * Check certificate status for a did:exprsn (OCSP-like functionality)
 */
identityExprsnRouter.get('/io.exprsn.identity.getCertificateStatus', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'Missing did parameter' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  try {
    const status = await ExprsnDidService.checkCertificateStatus(did);

    return c.json(status);
  } catch (error) {
    console.error('Certificate status check error:', error);

    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to check certificate status',
    });
  }
});

/**
 * GET /xrpc/io.exprsn.identity.getCertificateInfo
 * Get detailed certificate information for a did:exprsn
 */
identityExprsnRouter.get('/io.exprsn.identity.getCertificateInfo', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'Missing did parameter' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  try {
    const info = await ExprsnDidService.getCertificateInfo(did);

    if (!info) {
      throw new HTTPException(404, { message: 'Certificate not found' });
    }

    return c.json(info);
  } catch (error) {
    console.error('Certificate info fetch error:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to get certificate info',
    });
  }
});

/**
 * POST /xrpc/io.exprsn.identity.createOrganizationCA
 * Create an intermediate CA for an organization (admin only)
 */
identityExprsnRouter.post(
  '/io.exprsn.identity.createOrganizationCA',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      organizationId: string;
      organizationName: string;
      organizationType: OrganizationType;
      validityDays?: number;
    }>();

    if (!body.organizationId || !body.organizationName || !body.organizationType) {
      throw new HTTPException(400, {
        message: 'Missing required fields: organizationId, organizationName, organizationType',
      });
    }

    // Check if this org type qualifies for intermediate CA
    if (!ExprsnDidService.shouldCreateIntermediateCA(body.organizationType)) {
      throw new HTTPException(400, {
        message: `Organization type '${body.organizationType}' does not qualify for intermediate CA`,
      });
    }

    try {
      const result = await ExprsnDidService.createOrganizationCA({
        organizationId: body.organizationId,
        organizationName: body.organizationName,
        organizationType: body.organizationType,
        validityDays: body.validityDays,
      });

      return c.json({
        success: true,
        ...result,
      }, 201);
    } catch (error) {
      console.error('Organization CA creation error:', error);

      if (error instanceof HTTPException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Failed to create organization CA';

      if (errorMessage.includes('already has')) {
        throw new HTTPException(409, { message: errorMessage });
      }

      throw new HTTPException(500, { message: errorMessage });
    }
  }
);

/**
 * GET /xrpc/io.exprsn.identity.getDidDocument
 * Get the full DID document for a did:exprsn (returns application/did+json)
 */
identityExprsnRouter.get('/io.exprsn.identity.getDidDocument', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'Missing did parameter' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  try {
    const document = await ExprsnDidService.getDidDocument(did);

    if (!document) {
      throw new HTTPException(404, { message: 'DID not found' });
    }

    return c.json(document, 200, {
      'Content-Type': 'application/did+json',
    });
  } catch (error) {
    console.error('DID document fetch error:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to fetch DID document',
    });
  }
});

/**
 * GET /xrpc/io.exprsn.identity.verifyMembership
 * Verify that a DID is a certified member of an organization via certificate chain
 */
identityExprsnRouter.get('/io.exprsn.identity.verifyMembership', optionalAuthMiddleware, async (c) => {
  const memberDid = c.req.query('memberDid');
  const orgId = c.req.query('orgId');

  if (!memberDid || !orgId) return c.json({ error: 'memberDid and orgId required' }, 400);

  // Look up member's certificate
  const [memberCert] = await db.select()
    .from(exprsnDidCertificates)
    .where(eq(exprsnDidCertificates.did, memberDid))
    .limit(1);

  if (!memberCert || !memberCert.issuerIntermediateId) {
    return c.json({ verified: false, reason: 'No org-issued certificate' });
  }

  // Check if the intermediate CA belongs to this org
  const [intermediateCa] = await db.select()
    .from(organizationIntermediateCAs)
    .where(and(
      eq(organizationIntermediateCAs.id, memberCert.issuerIntermediateId),
      eq(organizationIntermediateCAs.organizationId, orgId)
    ))
    .limit(1);

  if (!intermediateCa) {
    return c.json({ verified: false, reason: 'Certificate not issued by this organization' });
  }

  // Get org info
  const [org] = await db.select({ name: organizations.name })
    .from(organizations).where(eq(organizations.id, orgId)).limit(1);

  // Get certificate validity
  const [entityCert] = await db.select()
    .from(caEntityCertificates)
    .where(eq(caEntityCertificates.id, memberCert.certificateId))
    .limit(1);

  return c.json({
    verified: true,
    orgName: org?.name,
    certifiedSince: entityCert?.notBefore,
    certifiedUntil: entityCert?.notAfter,
    certificateStatus: memberCert.status,
  });
});

export { identityExprsnRouter };
export default identityExprsnRouter;
