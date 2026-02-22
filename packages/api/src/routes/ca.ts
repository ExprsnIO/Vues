import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { certificateManager } from '../services/ca/index.js';
import type { CertificateType } from '@exprsn/shared/types';

type AuthContext = {
  Variables: {
    did: string;
  };
};

export const caRoutes = new Hono<AuthContext>();

// ============================================
// Root CA Management (Admin only)
// ============================================

// Initialize or get root CA (super admin only)
caRoutes.post(
  '/io.exprsn.ca.initializeRoot',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      commonName?: string;
      organization?: string;
      country?: string;
      validityDays?: number;
    }>();

    try {
      const result = await certificateManager.ensureRootCA({
        commonName: body.commonName,
        organization: body.organization,
        country: body.country,
        validityDays: body.validityDays,
      });

      return c.json({
        id: result.id,
        certificate: result.certificate,
        serialNumber: result.serialNumber,
        fingerprint: result.fingerprint,
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to initialize root CA',
      });
    }
  }
);

// Get root CA certificate (public)
caRoutes.get('/io.exprsn.ca.getRootCertificate', async (c) => {
  const result = await certificateManager.getRootCA();

  if (!result) {
    throw new HTTPException(404, { message: 'Root CA not initialized' });
  }

  return c.json({
    certificate: result.certificate,
    serialNumber: result.serialNumber,
    fingerprint: result.fingerprint,
    notBefore: result.notBefore.toISOString(),
    notAfter: result.notAfter.toISOString(),
  });
});

// ============================================
// Intermediate CA Management
// ============================================

// Create intermediate CA (admin only)
caRoutes.post(
  '/io.exprsn.ca.createIntermediate',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      commonName: string;
      organization?: string;
      organizationalUnit?: string;
      validityDays?: number;
      pathLen?: number;
    }>();

    if (!body.commonName) {
      throw new HTTPException(400, { message: 'Common name required' });
    }

    try {
      const result = await certificateManager.createIntermediateCA({
        commonName: body.commonName,
        organization: body.organization,
        organizationalUnit: body.organizationalUnit,
        validityDays: body.validityDays,
        pathLen: body.pathLen,
      });

      return c.json({
        id: result.id,
        certificate: result.certificate,
        serialNumber: result.serialNumber,
        fingerprint: result.fingerprint,
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to create intermediate CA',
      });
    }
  }
);

// ============================================
// Entity Certificate Management
// ============================================

// Issue entity certificate
caRoutes.post('/io.exprsn.ca.issueCertificate', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    commonName: string;
    type: CertificateType;
    organization?: string;
    email?: string;
    subjectAltNames?: string[];
    validityDays?: number;
    serviceId?: string;
    intermediateId?: string;
  }>();

  if (!body.commonName || !body.type) {
    throw new HTTPException(400, { message: 'Common name and type required' });
  }

  if (!['client', 'server', 'code_signing'].includes(body.type)) {
    throw new HTTPException(400, { message: 'Invalid certificate type' });
  }

  try {
    const result = await certificateManager.issueEntityCertificate({
      commonName: body.commonName,
      subjectDid: userDid,
      serviceId: body.serviceId,
      type: body.type,
      organization: body.organization,
      email: body.email,
      subjectAltNames: body.subjectAltNames,
      validityDays: body.validityDays,
      intermediateId: body.intermediateId,
    });

    return c.json({
      id: result.id,
      certificate: result.certificate,
      privateKey: result.privateKey,
      serialNumber: result.serialNumber,
      fingerprint: result.fingerprint,
    });
  } catch (error) {
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to issue certificate',
    });
  }
});

// Get certificate by ID
caRoutes.get('/io.exprsn.ca.getCertificate', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const id = c.req.query('id');
  if (!id) {
    throw new HTTPException(400, { message: 'Certificate ID required' });
  }

  const result = await certificateManager.getEntityCertificate(id);
  if (!result) {
    throw new HTTPException(404, { message: 'Certificate not found' });
  }

  // Only allow owner to view their certificate
  if (result.subjectDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  return c.json({
    id: result.id,
    certificate: result.certificate,
    serialNumber: result.serialNumber,
    fingerprint: result.fingerprint,
    status: result.status,
    certType: result.certType,
    notBefore: result.notBefore.toISOString(),
    notAfter: result.notAfter.toISOString(),
  });
});

// List user's certificates
caRoutes.get('/io.exprsn.ca.listCertificates', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

  const results = await certificateManager.listCertificates({
    subjectDid: userDid,
    status: status || undefined,
    limit,
  });

  return c.json({
    certificates: results.map((cert) => ({
      id: cert.id,
      commonName: cert.commonName,
      serialNumber: cert.serialNumber,
      fingerprint: cert.fingerprint,
      status: cert.status,
      certType: cert.certType,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString(),
    })),
  });
});

// Revoke certificate
caRoutes.post('/io.exprsn.ca.revokeCertificate', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    certificateId: string;
    reason?: string;
  }>();

  if (!body.certificateId) {
    throw new HTTPException(400, { message: 'Certificate ID required' });
  }

  // Verify ownership
  const cert = await certificateManager.getEntityCertificate(body.certificateId);
  if (!cert) {
    throw new HTTPException(404, { message: 'Certificate not found' });
  }

  if (cert.subjectDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  if (cert.status === 'revoked') {
    throw new HTTPException(400, { message: 'Certificate already revoked' });
  }

  await certificateManager.revokeCertificate(body.certificateId, body.reason);

  return c.json({ success: true });
});

// ============================================
// Certificate Verification
// ============================================

// Verify a certificate
caRoutes.post('/io.exprsn.ca.verifyCertificate', async (c) => {
  const body = await c.req.json<{
    certificate: string;
  }>();

  if (!body.certificate) {
    throw new HTTPException(400, { message: 'Certificate required' });
  }

  const result = await certificateManager.verifyCertificate(body.certificate);

  return c.json({
    valid: result.valid,
    reason: result.reason,
    certificate: result.certificate
      ? {
          serialNumber: result.certificate.serialNumber,
          commonName: result.certificate.commonName,
          organization: result.certificate.organization,
          issuer: result.certificate.issuer,
          notBefore: result.certificate.notBefore.toISOString(),
          notAfter: result.certificate.notAfter.toISOString(),
          fingerprint: result.certificate.fingerprint,
          isCA: result.certificate.isCA,
        }
      : undefined,
  });
});

// ============================================
// Signing Operations
// ============================================

// Sign data with a certificate
caRoutes.post('/io.exprsn.ca.signData', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    data: string;
    privateKey: string;
  }>();

  if (!body.data || !body.privateKey) {
    throw new HTTPException(400, { message: 'Data and private key required' });
  }

  try {
    const { signData } = await import('../services/ca/crypto.js');
    const signature = signData(body.data, body.privateKey);

    return c.json({ signature });
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : 'Signing failed',
    });
  }
});

// Verify signature
caRoutes.post('/io.exprsn.ca.verifySignature', async (c) => {
  const body = await c.req.json<{
    data: string;
    signature: string;
    certificate: string;
  }>();

  if (!body.data || !body.signature || !body.certificate) {
    throw new HTTPException(400, { message: 'Data, signature, and certificate required' });
  }

  try {
    const result = await certificateManager.verifyWithCertificate(
      body.certificate,
      body.data,
      body.signature
    );

    return c.json({ valid: result.valid });
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : 'Verification failed',
    });
  }
});

// ============================================
// Certificate Revocation List
// ============================================

// Get CRL (public)
caRoutes.get('/io.exprsn.ca.getCRL', async (c) => {
  const result = await certificateManager.getLatestCRL();

  if (!result) {
    throw new HTTPException(404, { message: 'No CRL available' });
  }

  // Return raw CRL if requested via Accept header
  const accept = c.req.header('Accept');
  if (accept === 'application/pkix-crl') {
    return new Response(result.crl, {
      headers: {
        'Content-Type': 'application/pkix-crl',
        'Content-Disposition': 'attachment; filename="crl.pem"',
      },
    });
  }

  return c.json({
    crl: result.crl,
    nextUpdate: result.nextUpdate.toISOString(),
  });
});

// Generate new CRL (admin only)
caRoutes.post(
  '/io.exprsn.ca.generateCRL',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    try {
      const result = await certificateManager.generateCRL();

      return c.json({
        id: result.id,
        crl: result.crl,
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to generate CRL',
      });
    }
  }
);

// ============================================
// Service Certificate Endpoints
// ============================================

// Issue service certificate (for inter-service auth, admin only)
caRoutes.post(
  '/io.exprsn.ca.issueServiceCertificate',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      serviceId: string;
      serviceName: string;
      subjectAltNames?: string[];
      validityDays?: number;
    }>();

    if (!body.serviceId || !body.serviceName) {
      throw new HTTPException(400, { message: 'Service ID and name required' });
    }

    try {
      const result = await certificateManager.issueEntityCertificate({
        commonName: body.serviceName,
        serviceId: body.serviceId,
        type: 'server',
        subjectAltNames: body.subjectAltNames || [`DNS:${body.serviceId}.internal`],
        validityDays: body.validityDays || 365,
      });

      return c.json({
        id: result.id,
        certificate: result.certificate,
        privateKey: result.privateKey,
        serialNumber: result.serialNumber,
        fingerprint: result.fingerprint,
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to issue service certificate',
      });
    }
  }
);

export default caRoutes;
