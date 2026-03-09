/**
 * mTLS (Mutual TLS) Authentication Middleware
 * Authenticates users using client certificates
 */

import { Context, Next } from 'hono';
import * as forge from 'node-forge';
import { db } from '../db/index.js';
import { exprsnDidCertificates, caEntityCertificates } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { CAAuditService } from '../services/ca/CAAuditService.js';

/**
 * Extract DID from certificate Subject Alternative Names or CN
 */
function extractDidFromCertificate(cert: forge.pki.Certificate): string | null {
  // Check Subject Alternative Name for DID URI
  try {
    const sanExtension = cert.getExtension('subjectAltName');
    if (sanExtension && (sanExtension as { altNames?: Array<{ type: number; value: string }> }).altNames) {
      const altNames = (sanExtension as { altNames: Array<{ type: number; value: string }> }).altNames;
      for (const name of altNames) {
        // Type 6 = URI
        if (name.type === 6 && name.value.startsWith('did:exprsn:')) {
          return name.value;
        }
      }
    }
  } catch {
    // Extension not present or malformed
  }

  // Fallback: check CN for DID format
  const cn = cert.subject.getField('CN')?.value;
  if (typeof cn === 'string' && cn.startsWith('did:exprsn:')) {
    return cn;
  }

  return null;
}

/**
 * Get SHA-256 fingerprint of certificate
 */
function getCertificateFingerprint(cert: forge.pki.Certificate): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return md.digest().toHex();
}

/**
 * mTLS Authentication Middleware
 *
 * Expects headers set by reverse proxy:
 * - X-Client-Cert: URL-encoded PEM certificate
 * - X-Client-Cert-Verified: SUCCESS | FAILED | NONE
 * - X-Client-Cert-DN: Distinguished Name
 */
export const mtlsAuthMiddleware = async (c: Context, next: Next) => {
  // Get client certificate from request headers (set by reverse proxy)
  const clientCertEncoded = c.req.header('X-Client-Cert');
  const clientCertVerified = c.req.header('X-Client-Cert-Verified');

  // If no certificate or verification failed, skip to next auth method
  if (!clientCertEncoded || clientCertVerified !== 'SUCCESS') {
    return next();
  }

  try {
    // Decode URL-encoded PEM
    const certPem = decodeURIComponent(clientCertEncoded);
    const cert = forge.pki.certificateFromPem(certPem);

    // Extract DID from certificate
    const did = extractDidFromCertificate(cert);
    if (!did) {
      // Certificate valid but no DID found, skip to other auth
      return next();
    }

    // Get certificate fingerprint
    const fingerprint = getCertificateFingerprint(cert);

    // Verify certificate is in our database and active
    const [certRecord] = await db.select()
      .from(exprsnDidCertificates)
      .where(
        and(
          eq(exprsnDidCertificates.did, did),
          eq(exprsnDidCertificates.status, 'active')
        )
      )
      .limit(1);

    if (!certRecord) {
      await CAAuditService.logFailure(
        'auth.certificate_login_failed',
        did,
        'Certificate not found or revoked',
        {
          performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0],
          details: { fingerprint },
        }
      );
      return c.json({ error: 'Certificate is revoked or not registered' }, 401);
    }

    // Verify the fingerprint matches
    const [entityCert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certRecord.certificateId))
      .limit(1);

    if (!entityCert || entityCert.fingerprint !== fingerprint) {
      await CAAuditService.logFailure(
        'auth.certificate_login_failed',
        did,
        'Certificate fingerprint mismatch',
        {
          performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0],
          details: { expectedFingerprint: entityCert?.fingerprint, actualFingerprint: fingerprint },
        }
      );
      return c.json({ error: 'Certificate mismatch' }, 401);
    }

    // Check certificate expiration
    if (new Date(entityCert.notAfter) < new Date()) {
      await CAAuditService.logFailure(
        'auth.certificate_login_failed',
        did,
        'Certificate expired',
        {
          performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0],
          details: { expiredAt: entityCert.notAfter.toISOString() },
        }
      );
      return c.json({ error: 'Certificate has expired' }, 401);
    }

    // Set auth context
    c.set('did', did);
    c.set('authMethod', 'mtls');
    c.set('certificateFingerprint', fingerprint);
    c.set('certificateId', certRecord.certificateId);

    // Log successful auth
    await CAAuditService.logSuccess(
      'auth.certificate_login',
      did,
      {
        subjectDid: did,
        certificateId: certRecord.certificateId,
        performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0],
        details: { fingerprint },
      }
    );

    return next();
  } catch (error) {
    console.error('mTLS auth error:', error);
    // Don't fail, let other auth methods try
    return next();
  }
};

/**
 * Require mTLS authentication (use after mtlsAuthMiddleware)
 */
export const requireMtlsAuth = async (c: Context, next: Next) => {
  const authMethod = c.get('authMethod');

  if (authMethod !== 'mtls') {
    return c.json({ error: 'Client certificate authentication required' }, 401);
  }

  return next();
};

/**
 * Session-certificate binding middleware
 * Ensures session is bound to the same certificate
 */
export const certificateBoundSessionMiddleware = async (c: Context, next: Next) => {
  const sessionId = c.get('sessionId');
  const certFingerprint = c.get('certificateFingerprint');

  if (!sessionId) {
    return next();
  }

  // Check if session has a certificate binding
  const { sessionCertificateBindings } = await import('../db/schema.js');
  const [binding] = await db.select()
    .from(sessionCertificateBindings)
    .where(eq(sessionCertificateBindings.sessionId, sessionId))
    .limit(1);

  if (binding) {
    // Session is certificate-bound
    if (!certFingerprint || binding.certificateFingerprint !== certFingerprint) {
      return c.json({
        error: 'Session bound to different certificate',
        code: 'CERTIFICATE_MISMATCH',
      }, 403);
    }

    // Update last verified timestamp
    await db.update(sessionCertificateBindings)
      .set({ lastVerified: new Date() })
      .where(eq(sessionCertificateBindings.id, binding.id));
  }

  return next();
};
