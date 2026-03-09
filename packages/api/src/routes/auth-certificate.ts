/**
 * Certificate-Based Authentication Routes
 * Challenge-response authentication using X.509 certificates
 */

import { Hono } from 'hono';
import * as forge from 'node-forge';
import { db } from '../db/index.js';
import {
  certAuthChallenges,
  exprsnDidCertificates,
  sessionCertificateBindings,
} from '../db/schema.js';
import { eq, and, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { CAAuditService } from '../services/ca/CAAuditService.js';
import { certificateManager } from '../services/ca/CertificateManager.js';

const certAuthRouter = new Hono();

// Type definitions for request bodies
interface RequestChallengeBody {
  certificatePem: string;
}

interface LoginWithCertBody {
  challengeId: string;
  signedChallenge: string;
  certificatePem: string;
}

interface BindSessionBody {
  sessionId: string;
  certificatePem: string;
}

interface VerifyCertBody {
  certificatePem: string;
}

/**
 * Extract DID from certificate
 */
function extractDidFromCertificate(cert: forge.pki.Certificate): string | null {
  try {
    const sanExtension = cert.getExtension('subjectAltName');
    if (sanExtension && (sanExtension as { altNames?: Array<{ type: number; value: string }> }).altNames) {
      const altNames = (sanExtension as { altNames: Array<{ type: number; value: string }> }).altNames;
      for (const name of altNames) {
        if (name.type === 6 && name.value.startsWith('did:exprsn:')) {
          return name.value;
        }
      }
    }
  } catch {
    // Extension not present
  }

  const cn = cert.subject.getField('CN')?.value;
  if (typeof cn === 'string' && cn.startsWith('did:exprsn:')) {
    return cn;
  }

  return null;
}

/**
 * Get certificate fingerprint
 */
function getCertificateFingerprint(cert: forge.pki.Certificate): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return md.digest().toHex();
}

// Request authentication challenge
certAuthRouter.post(
  '/xrpc/io.exprsn.auth.requestCertChallenge',
  async (c) => {
    const body = await c.req.json<RequestChallengeBody>();

    if (!body.certificatePem || body.certificatePem.length < 100) {
      return c.json({ error: 'certificatePem is required' }, 400);
    }

    try {
      const cert = forge.pki.certificateFromPem(body.certificatePem);
      const fingerprint = getCertificateFingerprint(cert);
      const did = extractDidFromCertificate(cert);

      // Generate random challenge (32 bytes, base64 encoded)
      const challengeBytes = forge.random.getBytesSync(32);
      const challenge = forge.util.encode64(challengeBytes);

      // Store challenge with 5-minute expiry
      const challengeId = nanoid();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await db.insert(certAuthChallenges).values({
        id: challengeId,
        certificateFingerprint: fingerprint,
        challenge,
        expiresAt,
      });

      await CAAuditService.log({
        eventType: 'auth.challenge_created',
        performedBy: did || 'unknown',
        performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0],
        details: { fingerprint, challengeId },
      });

      return c.json({
        challenge,
        challengeId,
        expiresIn: 300,
        fingerprint,
        instructions: 'Sign the challenge using your certificate private key and submit to loginWithCertificate',
      });
    } catch (error) {
      console.error('Challenge request error:', error);
      return c.json({ error: 'Invalid certificate' }, 400);
    }
  }
);

// Login with certificate (challenge-response)
certAuthRouter.post(
  '/xrpc/io.exprsn.auth.loginWithCertificate',
  async (c) => {
    const body = await c.req.json<LoginWithCertBody>();

    if (!body.challengeId || !body.signedChallenge || !body.certificatePem) {
      return c.json({ error: 'challengeId, signedChallenge, and certificatePem are required' }, 400);
    }

    try {
      const cert = forge.pki.certificateFromPem(body.certificatePem);
      const did = extractDidFromCertificate(cert);
      const fingerprint = getCertificateFingerprint(cert);

      if (!did) {
        return c.json({ error: 'Certificate does not contain valid DID' }, 400);
      }

      // Get pending challenge
      const [challengeRecord] = await db.select()
        .from(certAuthChallenges)
        .where(
          and(
            eq(certAuthChallenges.id, body.challengeId),
            eq(certAuthChallenges.certificateFingerprint, fingerprint)
          )
        )
        .limit(1);

      if (!challengeRecord) {
        await CAAuditService.logFailure(
          'auth.certificate_login_failed',
          did,
          'Challenge not found',
          { performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0] }
        );
        return c.json({ error: 'Challenge not found or fingerprint mismatch' }, 400);
      }

      if (challengeRecord.usedAt) {
        return c.json({ error: 'Challenge already used' }, 400);
      }

      if (new Date(challengeRecord.expiresAt) < new Date()) {
        return c.json({ error: 'Challenge expired' }, 400);
      }

      // Verify certificate chain
      const verification = await certificateManager.verifyCertificate(body.certificatePem);
      if (!verification.valid) {
        await CAAuditService.logFailure(
          'auth.certificate_login_failed',
          did,
          `Certificate verification failed: ${verification.reason}`,
          { performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0] }
        );
        return c.json({ error: verification.reason }, 401);
      }

      // Verify certificate is registered for this DID
      const [didCertRecord] = await db.select()
        .from(exprsnDidCertificates)
        .where(
          and(
            eq(exprsnDidCertificates.did, did),
            eq(exprsnDidCertificates.status, 'active')
          )
        )
        .limit(1);

      if (!didCertRecord) {
        await CAAuditService.logFailure(
          'auth.certificate_login_failed',
          did,
          'Certificate not registered',
          { performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0] }
        );
        return c.json({ error: 'Certificate not registered for this DID' }, 401);
      }

      // Verify signature
      const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
      const md = forge.md.sha256.create();
      md.update(challengeRecord.challenge, 'utf8');

      const signatureBytes = forge.util.decode64(body.signedChallenge);
      const signatureValid = publicKey.verify(md.digest().bytes(), signatureBytes);

      if (!signatureValid) {
        await CAAuditService.logFailure(
          'auth.certificate_login_failed',
          did,
          'Signature verification failed',
          { performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0] }
        );
        return c.json({ error: 'Challenge signature verification failed' }, 401);
      }

      // Mark challenge as used
      await db.update(certAuthChallenges)
        .set({ usedAt: new Date() })
        .where(eq(certAuthChallenges.id, body.challengeId));

      // Generate session tokens
      // This would integrate with your existing token generation
      const sessionId = nanoid();
      const accessToken = nanoid(64);
      const refreshToken = nanoid(64);

      // Create session-certificate binding
      await db.insert(sessionCertificateBindings).values({
        id: nanoid(),
        sessionId,
        certificateFingerprint: fingerprint,
        did,
        boundAt: new Date(),
      });

      await CAAuditService.logSuccess(
        'auth.certificate_login',
        did,
        {
          subjectDid: did,
          certificateId: didCertRecord.certificateId,
          performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0],
          details: { fingerprint, sessionId },
        }
      );

      return c.json({
        success: true,
        did,
        accessJwt: accessToken,
        refreshJwt: refreshToken,
        authMethod: 'certificate',
        sessionId,
      });
    } catch (error) {
      console.error('Certificate login error:', error);
      return c.json({ error: 'Certificate authentication failed' }, 500);
    }
  }
);

// Bind existing session to certificate
certAuthRouter.post(
  '/xrpc/io.exprsn.auth.bindSessionToCertificate',
  async (c) => {
    const body = await c.req.json<BindSessionBody>();

    if (!body.sessionId || !body.certificatePem) {
      return c.json({ error: 'sessionId and certificatePem are required' }, 400);
    }

    try {
      const cert = forge.pki.certificateFromPem(body.certificatePem);
      const did = extractDidFromCertificate(cert);
      const fingerprint = getCertificateFingerprint(cert);

      if (!did) {
        return c.json({ error: 'Certificate does not contain valid DID' }, 400);
      }

      // Verify certificate
      const verification = await certificateManager.verifyCertificate(body.certificatePem);
      if (!verification.valid) {
        return c.json({ error: verification.reason }, 401);
      }

      // Check if session already bound
      const [existingBinding] = await db.select()
        .from(sessionCertificateBindings)
        .where(eq(sessionCertificateBindings.sessionId, body.sessionId))
        .limit(1);

      if (existingBinding) {
        return c.json({ error: 'Session already bound to a certificate' }, 400);
      }

      // Create binding
      await db.insert(sessionCertificateBindings).values({
        id: nanoid(),
        sessionId: body.sessionId,
        certificateFingerprint: fingerprint,
        did,
        boundAt: new Date(),
      });

      await CAAuditService.logSuccess(
        'auth.session_bound',
        did,
        { details: { sessionId: body.sessionId, fingerprint } }
      );

      return c.json({
        success: true,
        bound: true,
        fingerprint,
      });
    } catch (error) {
      console.error('Session binding error:', error);
      return c.json({ error: 'Failed to bind session' }, 500);
    }
  }
);

// Verify certificate (public endpoint)
certAuthRouter.post(
  '/xrpc/io.exprsn.auth.verifyCertificate',
  async (c) => {
    const body = await c.req.json<VerifyCertBody>();

    if (!body.certificatePem) {
      return c.json({ error: 'certificatePem is required' }, 400);
    }

    try {
      const verification = await certificateManager.verifyCertificate(body.certificatePem);

      const cert = forge.pki.certificateFromPem(body.certificatePem);
      const did = extractDidFromCertificate(cert);
      const fingerprint = getCertificateFingerprint(cert);

      return c.json({
        valid: verification.valid,
        reason: verification.reason,
        did,
        fingerprint,
        subject: verification.certificate?.subject,
        issuer: verification.certificate?.issuer,
        notBefore: verification.certificate?.notBefore,
        notAfter: verification.certificate?.notAfter,
      });
    } catch (error) {
      return c.json({
        valid: false,
        reason: 'Invalid certificate format',
      });
    }
  }
);

// Clean up expired challenges (called by cron or on startup)
certAuthRouter.post(
  '/xrpc/io.exprsn.auth.cleanupChallenges',
  async (c) => {
    await db.delete(certAuthChallenges)
      .where(lt(certAuthChallenges.expiresAt, new Date()));

    return c.json({ success: true });
  }
);

export { certAuthRouter };
