/**
 * Certificate-DID Routes
 *
 * API endpoints for did:exprsn certificate operations
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ExprsnDidService } from '../services/did/index.js';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db } from '../db/index.js';
import { exprsnDidCertificates, actorRepos } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type AuthContext = {
  Variables: {
    did?: string;
  };
};

export const certificatesDidRoutes = new Hono<AuthContext>();

/**
 * Get DID document for a did:exprsn
 * GET /xrpc/io.exprsn.did.getDocument?did=...
 */
certificatesDidRoutes.get('/io.exprsn.did.getDocument', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'DID parameter required' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  const document = await ExprsnDidService.getDidDocument(did);

  if (!document) {
    throw new HTTPException(404, { message: 'DID not found' });
  }

  return c.json(document);
});

/**
 * Get certificate info for a DID (public)
 * GET /xrpc/io.exprsn.did.getCertificate?did=...
 */
certificatesDidRoutes.get('/io.exprsn.did.getCertificate', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'DID parameter required' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  const certInfo = await ExprsnDidService.getCertificateInfo(did);

  if (!certInfo) {
    throw new HTTPException(404, { message: 'DID or certificate not found' });
  }

  return c.json({
    did,
    certificate: {
      id: certInfo.certificateId,
      fingerprint: certInfo.fingerprint,
      commonName: certInfo.commonName,
      issuer: certInfo.issuer,
      notBefore: certInfo.notBefore.toISOString(),
      notAfter: certInfo.notAfter.toISOString(),
      status: certInfo.status,
      type: certInfo.certificateType,
    },
    organizationId: certInfo.organizationId,
  });
});

/**
 * Get certificate chain for a DID (public)
 * GET /xrpc/io.exprsn.did.getCertificateChain?did=...
 */
certificatesDidRoutes.get('/io.exprsn.did.getCertificateChain', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'DID parameter required' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  const chain = await ExprsnDidService.getCertificateChain(did);

  if (chain.length === 0) {
    throw new HTTPException(404, { message: 'DID or certificate chain not found' });
  }

  return c.json({
    did,
    certificateChain: chain,
    chainLength: chain.length,
  });
});

/**
 * Check certificate status (OCSP-like endpoint)
 * GET /xrpc/io.exprsn.did.checkCertificateStatus?did=...
 */
certificatesDidRoutes.get('/io.exprsn.did.checkCertificateStatus', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    throw new HTTPException(400, { message: 'DID parameter required' });
  }

  if (!did.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Invalid did:exprsn format' });
  }

  const status = await ExprsnDidService.checkCertificateStatus(did);

  const now = new Date();
  const nextUpdate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  return c.json({
    did,
    status: status.status,
    revocationTime: status.revocationTime?.toISOString(),
    revocationReason: status.revocationReason,
    certificateId: status.certificateId,
    thisUpdate: now.toISOString(),
    nextUpdate: nextUpdate.toISOString(),
  });
});

/**
 * Rotate keys for a did:exprsn (authenticated, owner only)
 * POST /xrpc/io.exprsn.did.rotateKeys
 */
certificatesDidRoutes.post('/io.exprsn.did.rotateKeys', authMiddleware, async (c) => {
  const userDid = c.get('did');

  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  if (!userDid.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Key rotation only available for did:exprsn accounts' });
  }

  try {
    const result = await ExprsnDidService.rotateKeys(userDid);

    return c.json({
      success: true,
      did: result.did,
      handle: result.handle,
      certificate: {
        id: result.certificate.id,
        pem: result.certificate.pem,
        fingerprint: result.certificate.fingerprint,
        validUntil: result.certificate.validUntil.toISOString(),
      },
      privateKey: result.privateKey,
      publicKeyMultibase: result.publicKeyMultibase,
    });
  } catch (error) {
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to rotate keys',
    });
  }
});

/**
 * Revoke a did:exprsn (authenticated, owner or admin)
 * POST /xrpc/io.exprsn.did.revokeDid
 */
certificatesDidRoutes.post('/io.exprsn.did.revokeDid', authMiddleware, async (c) => {
  const userDid = c.get('did');

  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    did?: string;
    reason: string;
  }>();

  if (!body.reason) {
    throw new HTTPException(400, { message: 'Revocation reason required' });
  }

  // Determine which DID to revoke
  const targetDid = body.did || userDid;

  // If revoking someone else's DID, check admin permissions
  if (targetDid !== userDid) {
    // Get admin status from actor_repos (simplified - real implementation would check admin roles)
    const adminCheck = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, userDid))
      .limit(1);

    // For now, only allow self-revocation
    // TODO: Add proper admin check
    throw new HTTPException(403, { message: 'Cannot revoke another user\'s DID' });
  }

  if (!targetDid.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Revocation only available for did:exprsn accounts' });
  }

  try {
    await ExprsnDidService.revokeDid(targetDid, body.reason, userDid);

    return c.json({
      success: true,
      did: targetDid,
      revokedAt: new Date().toISOString(),
      revokedBy: userDid,
      reason: body.reason,
    });
  } catch (error) {
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to revoke DID',
    });
  }
});

/**
 * Get my certificate info (authenticated)
 * GET /xrpc/io.exprsn.did.getMyCertificate
 */
certificatesDidRoutes.get('/io.exprsn.did.getMyCertificate', authMiddleware, async (c) => {
  const userDid = c.get('did');

  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  if (!userDid.startsWith('did:exprsn:')) {
    return c.json({
      hasCertificate: false,
      didMethod: userDid.startsWith('did:plc:') ? 'plc' : 'web',
    });
  }

  const certInfo = await ExprsnDidService.getCertificateInfo(userDid);

  if (!certInfo) {
    return c.json({
      hasCertificate: false,
      didMethod: 'exprn',
    });
  }

  // Calculate days until expiry
  const daysUntilExpiry = Math.ceil(
    (certInfo.notAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  return c.json({
    hasCertificate: true,
    didMethod: 'exprn',
    certificate: {
      id: certInfo.certificateId,
      fingerprint: certInfo.fingerprint,
      commonName: certInfo.commonName,
      issuer: certInfo.issuer,
      notBefore: certInfo.notBefore.toISOString(),
      notAfter: certInfo.notAfter.toISOString(),
      status: certInfo.status,
      type: certInfo.certificateType,
      daysUntilExpiry,
      expiringsSoon: daysUntilExpiry <= 30,
    },
    organizationId: certInfo.organizationId,
  });
});

/**
 * Download certificate bundle (authenticated, owner only)
 * GET /xrpc/io.exprsn.did.downloadCertificateBundle
 *
 * Returns the certificate chain in various formats
 */
certificatesDidRoutes.get('/io.exprsn.did.downloadCertificateBundle', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const format = c.req.query('format') || 'pem';

  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  if (!userDid.startsWith('did:exprsn:')) {
    throw new HTTPException(400, { message: 'Certificate download only available for did:exprsn accounts' });
  }

  const chain = await ExprsnDidService.getCertificateChain(userDid);

  if (chain.length === 0) {
    throw new HTTPException(404, { message: 'Certificate not found' });
  }

  if (format === 'pem') {
    // Return PEM bundle (all certs concatenated)
    const bundle = chain.join('\n');
    c.header('Content-Type', 'application/x-pem-file');
    c.header('Content-Disposition', `attachment; filename="${userDid.replace('did:exprsn:', '')}-chain.pem"`);
    return c.body(bundle);
  }

  if (format === 'json') {
    return c.json({
      did: userDid,
      certificates: chain.map((cert, index) => ({
        index,
        type: index === 0 ? 'entity' : index === chain.length - 1 ? 'root' : 'intermediate',
        pem: cert,
      })),
    });
  }

  throw new HTTPException(400, { message: 'Unsupported format. Use "pem" or "json"' });
});

export default certificatesDidRoutes;
