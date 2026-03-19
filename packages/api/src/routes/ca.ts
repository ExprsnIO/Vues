import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { certificateManager } from '../services/ca/index.js';
import { CRLService } from '../services/ca/CRLService.js';
import { OCSPResponder } from '../services/ca/OCSPResponder.js';
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
      pathLength?: number;
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
        pathLength: body.pathLength,
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

// Renew certificate
caRoutes.post('/io.exprsn.ca.renewCertificate', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    certificateId: string;
    revokeOld?: boolean;
    validityDays?: number;
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
    throw new HTTPException(400, { message: 'Cannot renew a revoked certificate' });
  }

  try {
    const result = await certificateManager.renewCertificate({
      certificateId: body.certificateId,
      revokeOld: body.revokeOld,
      validityDays: body.validityDays,
    });

    return c.json({
      id: result.id,
      certificate: result.certificate,
      privateKey: result.privateKey,
      serialNumber: result.serialNumber,
      fingerprint: result.fingerprint,
      previousCertificateId: result.oldCertificateId,
    });
  } catch (error) {
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to renew certificate',
    });
  }
});

// Get certificates expiring soon
caRoutes.get('/io.exprsn.ca.getExpiringCertificates', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const days = parseInt(c.req.query('days') || '30');

  const certificates = await certificateManager.getCertificatesExpiringSoon(days);

  // Filter to only return user's certificates
  const userCerts = certificates.filter((cert) => cert.subjectDid === userDid);

  return c.json({
    certificates: userCerts.map((cert) => ({
      id: cert.id,
      commonName: cert.commonName,
      notAfter: cert.notAfter.toISOString(),
      daysRemaining: cert.daysRemaining,
    })),
  });
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
          commonName: result.certificate.subject.commonName,
          organization: result.certificate.subject.organizationName,
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
// OCSP Responder
// ============================================

// OCSP status check (public)
caRoutes.post('/io.exprsn.ca.ocspCheck', async (c) => {
  const body = await c.req.json<{
    serialNumber: string;
  }>();

  if (!body.serialNumber) {
    throw new HTTPException(400, { message: 'Serial number required' });
  }

  const status = await certificateManager.getCertificateStatus(body.serialNumber);

  return c.json({
    status: status.status,
    revocationTime: status.revocationTime?.toISOString(),
    revocationReason: status.revocationReason,
    thisUpdate: status.thisUpdate.toISOString(),
    nextUpdate: status.nextUpdate.toISOString(),
  });
});

// OCSP GET endpoint (for browser/standard OCSP clients)
caRoutes.get('/io.exprsn.ca.ocsp/:serial', async (c) => {
  const serialNumber = c.req.param('serial');

  if (!serialNumber) {
    throw new HTTPException(400, { message: 'Serial number required' });
  }

  const status = await certificateManager.getCertificateStatus(serialNumber);

  return c.json({
    status: status.status,
    revocationTime: status.revocationTime?.toISOString(),
    revocationReason: status.revocationReason,
    thisUpdate: status.thisUpdate.toISOString(),
    nextUpdate: status.nextUpdate.toISOString(),
  });
});

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

// ============================================
// Admin Certificate Management
// ============================================

// Get certificate stats (admin only)
caRoutes.get(
  '/io.exprsn.ca.admin.getStats',
  adminAuthMiddleware,
  async (c) => {
    const stats = await certificateManager.getStats();
    return c.json(stats);
  }
);

// List all CAs (admin only)
caRoutes.get(
  '/io.exprsn.ca.admin.listCAs',
  adminAuthMiddleware,
  async (c) => {
    const cas = await certificateManager.listAllCAs();
    return c.json({ cas });
  }
);

// List all certificates (admin only) - not just user's own
caRoutes.get(
  '/io.exprsn.ca.admin.listAllCertificates',
  adminAuthMiddleware,
  async (c) => {
    const status = c.req.query('status');
    const certType = c.req.query('type');
    const search = c.req.query('q');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = parseInt(c.req.query('offset') || '0');

    const result = await certificateManager.listAllCertificates({
      status: status || undefined,
      certType: certType || undefined,
      search: search || undefined,
      limit,
      offset,
    });

    return c.json(result);
  }
);

// Batch revoke certificates (admin only)
caRoutes.post(
  '/io.exprsn.ca.admin.batchRevoke',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      certificateIds: string[];
      reason?: string;
    }>();

    if (!body.certificateIds || body.certificateIds.length === 0) {
      throw new HTTPException(400, { message: 'Certificate IDs required' });
    }

    const results = await certificateManager.batchRevokeCertificates(
      body.certificateIds,
      body.reason || 'unspecified'
    );

    return c.json(results);
  }
);

// Batch download certificates (admin only)
caRoutes.post(
  '/io.exprsn.ca.admin.batchDownload',
  adminAuthMiddleware,
  async (c) => {
    const body = await c.req.json<{
      certificateIds: string[];
      format?: 'pem' | 'der' | 'pkcs12';
      includePrivateKey?: boolean;
      password?: string;
    }>();

    if (!body.certificateIds || body.certificateIds.length === 0) {
      throw new HTTPException(400, { message: 'Certificate IDs required' });
    }

    if (body.format === 'pkcs12' && body.includePrivateKey && !body.password) {
      throw new HTTPException(400, { message: 'Password required for PKCS#12 export' });
    }

    const results = await certificateManager.batchDownloadCertificates(
      body.certificateIds,
      body.format || 'pem',
      body.includePrivateKey || false,
      body.password
    );

    return c.json({ certificates: results });
  }
);

// Batch issue certificates (admin only)
caRoutes.post(
  '/io.exprsn.ca.admin.batchIssue',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      certificates: Array<{
        commonName: string;
        subjectDid?: string;
        serviceId?: string;
        email?: string;
      }>;
      issuerId?: string;
      certType?: 'client' | 'server' | 'code_signing';
      validityDays?: number;
    }>();

    if (!body.certificates || body.certificates.length === 0) {
      throw new HTTPException(400, { message: 'Certificates array required' });
    }

    const results = await certificateManager.batchIssueCertificates(
      body.certificates,
      body.issuerId,
      body.certType || 'client',
      body.validityDays || 365
    );

    return c.json(results);
  }
);

// Get certificate with full details (admin only)
caRoutes.get(
  '/io.exprsn.ca.admin.getCertificateDetails',
  adminAuthMiddleware,
  async (c) => {
    const id = c.req.query('id');
    if (!id) {
      throw new HTTPException(400, { message: 'Certificate ID required' });
    }

    const result = await certificateManager.getCertificateWithDetails(id);
    if (!result) {
      throw new HTTPException(404, { message: 'Certificate not found' });
    }

    return c.json(result);
  }
);

// Admin revoke with reason (admin only)
caRoutes.post(
  '/io.exprsn.ca.admin.revokeCertificate',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      certificateId: string;
      reason?: string;
    }>();

    if (!body.certificateId) {
      throw new HTTPException(400, { message: 'Certificate ID required' });
    }

    await certificateManager.revokeCertificate(body.certificateId, body.reason);
    return c.json({ success: true });
  }
);

// ============================================
// Admin CA Routes (io.exprsn.admin.ca.* naming)
// These match the frontend API client expectations
// ============================================

// List root CAs
caRoutes.get(
  '/io.exprsn.admin.ca.roots.list',
  adminAuthMiddleware,
  async (c) => {
    const cas = await certificateManager.listAllCAs();
    const roots = cas.filter((ca: any) => ca.type === 'root');
    return c.json({ roots });
  }
);

// Initialize root CA
caRoutes.post(
  '/io.exprsn.admin.ca.roots.initialize',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      commonName: string;
      organization?: string;
      validityYears?: number;
    }>();

    const result = await certificateManager.initializeRootCA({
      commonName: body.commonName,
      organization: body.organization,
      validityDays: (body.validityYears || 10) * 365,
    });

    return c.json(result);
  }
);

// Revoke root CA
caRoutes.post(
  '/io.exprsn.admin.ca.roots.revoke',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ rootId: string; reason?: string }>();
    await certificateManager.revokeCertificate(body.rootId, body.reason || 'unspecified');
    return c.json({ success: true });
  }
);

// List intermediate CAs
caRoutes.get(
  '/io.exprsn.admin.ca.intermediates.list',
  adminAuthMiddleware,
  async (c) => {
    const cas = await certificateManager.listAllCAs();
    const intermediates = cas.filter((ca: any) => ca.type === 'intermediate');
    return c.json({ intermediates });
  }
);

// Create intermediate CA
caRoutes.post(
  '/io.exprsn.admin.ca.intermediates.create',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      commonName: string;
      organization?: string;
      parentId?: string;
      validityYears?: number;
    }>();

    const result = await certificateManager.createIntermediateCA({
      commonName: body.commonName,
      organization: body.organization,
      validityDays: (body.validityYears || 5) * 365,
    });

    return c.json(result);
  }
);

// List all issuers (CAs that can issue certificates)
caRoutes.get(
  '/io.exprsn.admin.ca.issuers.list',
  adminAuthMiddleware,
  async (c) => {
    const cas = await certificateManager.listAllCAs();
    const issuers = cas
      .filter((ca: any) => ca.status === 'active')
      .map((ca: any) => ({
        id: ca.id,
        subject: ca.commonName || ca.subject || 'Unknown CA',
        type: ca.caType || ca.type || 'intermediate',
      }));
    return c.json({ issuers });
  }
);

// List certificates with filtering
caRoutes.get(
  '/io.exprsn.admin.ca.certificates.list',
  adminAuthMiddleware,
  async (c) => {
    const status = c.req.query('status');
    const certType = c.req.query('type');
    const issuerId = c.req.query('issuerId');
    const search = c.req.query('search');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = parseInt(c.req.query('offset') || '0');

    const result = await certificateManager.listAllCertificates({
      status: status || undefined,
      certType: certType || undefined,
      search: search || undefined,
      limit,
      offset,
    });

    // Transform response to match frontend expectations
    const certificates = result.certificates.map((cert) => ({
      id: cert.id,
      subject: cert.commonName,
      type: cert.certType,
      serialNumber: cert.serialNumber,
      status: cert.status,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      algorithm: 'RSA', // Default - could be stored in DB
      keySize: 2048,    // Default - could be stored in DB
      issuer: {
        id: 'intermediate',
        subject: 'Exprsn Intermediate CA',
      },
      subjectAltNames: [],
      keyUsage: cert.certType === 'server'
        ? ['digitalSignature', 'keyEncipherment']
        : cert.certType === 'code_signing'
        ? ['digitalSignature']
        : ['digitalSignature', 'keyAgreement'],
    }));

    return c.json({
      certificates,
      total: result.total,
      stats: result.stats,
    });
  }
);

// Issue certificate
caRoutes.post(
  '/io.exprsn.admin.ca.certificates.issue',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      commonName: string;
      issuerId?: string;
      certType?: 'client' | 'server' | 'code_signing';
      subjectDid?: string;
      email?: string;
      validityDays?: number;
    }>();

    const result = await certificateManager.issueCertificate({
      commonName: body.commonName,
      certType: body.certType || 'client',
      subjectDid: body.subjectDid,
      email: body.email,
      validityDays: body.validityDays || 365,
    });

    return c.json(result);
  }
);

// Revoke certificate
caRoutes.post(
  '/io.exprsn.admin.ca.certificates.revoke',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ certificateId: string; reason?: string }>();
    await certificateManager.revokeCertificate(body.certificateId, body.reason || 'unspecified');
    return c.json({ success: true });
  }
);

// Renew certificate
caRoutes.post(
  '/io.exprsn.admin.ca.certificates.renew',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ certificateId: string; validityDays?: number }>();
    const result = await certificateManager.renewCertificate({
      certificateId: body.certificateId,
      validityDays: body.validityDays,
    });
    return c.json(result);
  }
);

// Get expiring certificates
caRoutes.get(
  '/io.exprsn.admin.ca.certificates.expiring',
  adminAuthMiddleware,
  async (c) => {
    const days = parseInt(c.req.query('days') || '30');
    const certificates = await certificateManager.getExpiringCertificates(days);
    return c.json({ certificates });
  }
);

// Verify certificate
caRoutes.post(
  '/io.exprsn.admin.ca.certificates.verify',
  adminAuthMiddleware,
  async (c) => {
    const body = await c.req.json<{ certificatePem: string }>();
    const result = await certificateManager.verifyCertificate(body.certificatePem);
    return c.json(result);
  }
);

// List CRLs
caRoutes.get(
  '/io.exprsn.admin.ca.crl.list',
  adminAuthMiddleware,
  async (c) => {
    try {
      const crls = await CRLService.listCRLs();
      return c.json({ crls });
    } catch {
      return c.json({ crls: [] });
    }
  }
);

// Get CRL entries
caRoutes.get(
  '/io.exprsn.admin.ca.crl.entries',
  adminAuthMiddleware,
  async (c) => {
    const crlId = c.req.query('crlId');
    if (!crlId) {
      return c.json({ entries: [] });
    }
    try {
      const entries = await CRLService.getCRLEntries(crlId);
      return c.json({ entries });
    } catch {
      return c.json({ entries: [] });
    }
  }
);

// Generate CRL
caRoutes.post(
  '/io.exprsn.admin.ca.crl.generate',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ issuerId?: string; isDelta?: boolean }>();
    const result = await CRLService.generateCRL(body.issuerId, body.isDelta);
    return c.json(result);
  }
);

// OCSP status
caRoutes.get(
  '/io.exprsn.admin.ca.ocsp.status',
  adminAuthMiddleware,
  async (c) => {
    try {
      const status = await OCSPResponder.getStatus();
      return c.json(status);
    } catch {
      return c.json({
        enabled: false,
        totalRequests: 0,
        requestsToday: 0,
        cacheHitRate: 0,
      });
    }
  }
);

// OCSP requests log
caRoutes.get(
  '/io.exprsn.admin.ca.ocsp.requests',
  adminAuthMiddleware,
  async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = parseInt(c.req.query('offset') || '0');
    try {
      const requests = await OCSPResponder.getRequestLog(limit, offset);
      return c.json({ requests });
    } catch {
      return c.json({ requests: [] });
    }
  }
);

// OCSP check certificate status
caRoutes.get(
  '/io.exprsn.admin.ca.ocsp.check',
  adminAuthMiddleware,
  async (c) => {
    const serialNumber = c.req.query('serialNumber');
    if (!serialNumber) {
      throw new HTTPException(400, { message: 'Serial number required' });
    }
    const result = await OCSPResponder.checkCertificateStatus(serialNumber);
    return c.json(result);
  }
);

// Toggle OCSP responder
caRoutes.post(
  '/io.exprsn.admin.ca.ocsp.toggle',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{ enabled: boolean }>();
    await OCSPResponder.setEnabled(body.enabled);
    return c.json({ success: true, enabled: body.enabled });
  }
);

export default caRoutes;
