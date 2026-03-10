/**
 * Certificate Pinning Routes
 * Endpoints for mobile app certificate pinning
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import { certificatePins, pinViolationReports, caRootCertificates, caIntermediateCertificates } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as forge from 'node-forge';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';

const pinningRouter = new Hono();

// Type definitions for request bodies
interface ReportViolationBody {
  expectedPins: string[];
  receivedChain?: string[];
  hostname: string;
  userAgent?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

interface UpdatePinsBody {
  pins: Array<{
    pinType: 'root' | 'intermediate' | 'leaf';
    fingerprint: string;
    certificateId?: string;
    validUntil: string;
    isBackup?: boolean;
  }>;
}

/**
 * Get SHA-256 fingerprint in pin format (sha256/base64)
 */
function getPinFingerprint(certificatePem: string): string {
  const cert = forge.pki.certificateFromPem(certificatePem);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return `sha256/${forge.util.encode64(md.digest().bytes())}`;
}

// Get current certificate pins
pinningRouter.get(
  '/xrpc/io.exprsn.security.getCertificatePins',
  async (c) => {
    const baseUrl = process.env.APP_URL || 'https://api.exprsn.io';

    // Get active pins from database
    const activePins = await db.select()
      .from(certificatePins)
      .where(
        and(
          eq(certificatePins.status, 'active'),
          gte(certificatePins.validUntil, new Date())
        )
      )
      .orderBy(certificatePins.pinType);

    // If no pins in database, generate from current certificates
    if (activePins.length === 0) {
      const pins = await generatePinsFromCertificates();
      return c.json({
        pins,
        backupPins: [],
        reportUri: `${baseUrl}/xrpc/io.exprsn.security.reportPinViolation`,
        maxAge: 2592000, // 30 days
        includeSubdomains: true,
      });
    }

    const primaryPins = activePins.filter(p => !p.isBackup);
    const backupPins = activePins.filter(p => p.isBackup);

    return c.json({
      pins: primaryPins.map(p => ({
        type: p.pinType,
        fingerprint: p.fingerprint,
        validUntil: p.validUntil.toISOString(),
      })),
      backupPins: backupPins.map(p => ({
        type: p.pinType,
        fingerprint: p.fingerprint,
        validUntil: p.validUntil.toISOString(),
      })),
      reportUri: `${baseUrl}/xrpc/io.exprsn.security.reportPinViolation`,
      maxAge: 2592000,
      includeSubdomains: true,
    });
  }
);

// Report pinning violation
pinningRouter.post(
  '/xrpc/io.exprsn.security.reportPinViolation',
  async (c) => {
    const body = await c.req.json<ReportViolationBody>();

    if (!body.expectedPins || !body.hostname) {
      return c.json({ error: 'expectedPins and hostname are required' }, 400);
    }

    const clientIp = c.req.header('X-Forwarded-For')?.split(',')[0] ||
                     c.req.header('X-Real-IP');

    // Store violation report
    await db.insert(pinViolationReports).values({
      id: nanoid(),
      expectedPins: body.expectedPins,
      receivedChain: body.receivedChain || null,
      hostname: body.hostname,
      userAgent: body.userAgent || null,
      clientIp: clientIp || null,
      reportedAt: new Date(),
      details: body.details || null,
    });

    // In production, you might want to alert on violations
    console.warn('Certificate pinning violation reported:', {
      hostname: body.hostname,
      clientIp,
      expectedPins: body.expectedPins.length,
    });

    return c.json({ received: true });
  }
);

// Get violation reports (admin only)
pinningRouter.get(
  '/xrpc/io.exprsn.security.getPinViolations',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.SECURITY_VIEW),
  async (c) => {
    const limit = parseInt(c.req.query('limit') || '50');

    const violations = await db.select()
      .from(pinViolationReports)
      .orderBy(desc(pinViolationReports.reportedAt))
      .limit(limit);

    return c.json({
      violations: violations.map(v => ({
        id: v.id,
        hostname: v.hostname,
        expectedPins: v.expectedPins,
        userAgent: v.userAgent,
        clientIp: v.clientIp,
        reportedAt: v.reportedAt.toISOString(),
      })),
    });
  }
);

// Helper function to generate pins from current certificates
async function generatePinsFromCertificates(): Promise<Array<{
  type: string;
  fingerprint: string;
  validUntil: string;
}>> {
  const pins: Array<{ type: string; fingerprint: string; validUntil: string }> = [];

  // Get root CA
  const [rootCA] = await db.select()
    .from(caRootCertificates)
    .where(eq(caRootCertificates.status, 'active'))
    .limit(1);

  if (rootCA) {
    pins.push({
      type: 'root',
      fingerprint: getPinFingerprint(rootCA.certificate),
      validUntil: rootCA.notAfter.toISOString(),
    });
  }

  // Get active intermediates
  const intermediates = await db.select()
    .from(caIntermediateCertificates)
    .where(eq(caIntermediateCertificates.status, 'active'));

  for (const intermediate of intermediates) {
    pins.push({
      type: 'intermediate',
      fingerprint: getPinFingerprint(intermediate.certificate),
      validUntil: intermediate.notAfter.toISOString(),
    });
  }

  return pins;
}

// Update pins (admin only)
pinningRouter.post(
  '/xrpc/io.exprsn.security.updatePins',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.SECURITY_MANAGE),
  async (c) => {
    const body = await c.req.json<UpdatePinsBody>();

    if (!body.pins || !Array.isArray(body.pins)) {
      return c.json({ error: 'pins array is required' }, 400);
    }

    for (const pin of body.pins) {
      await db.insert(certificatePins).values({
        id: nanoid(),
        pinType: pin.pinType,
        fingerprint: pin.fingerprint,
        certificateId: pin.certificateId || null,
        validFrom: new Date(),
        validUntil: new Date(pin.validUntil),
        isBackup: pin.isBackup ?? false,
        status: 'active',
      }).onConflictDoUpdate({
        target: certificatePins.fingerprint,
        set: {
          validUntil: new Date(pin.validUntil),
          isBackup: pin.isBackup ?? false,
          status: 'active',
        },
      });
    }

    return c.json({ success: true, updated: body.pins.length });
  }
);

// Generate pins from current CA certificates (admin utility)
pinningRouter.post(
  '/xrpc/io.exprsn.security.regeneratePins',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.SECURITY_MANAGE),
  async (c) => {
    // Get current certificates
    const [rootCA] = await db.select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    const intermediates = await db.select()
      .from(caIntermediateCertificates)
      .where(eq(caIntermediateCertificates.status, 'active'));

    const created: string[] = [];

    if (rootCA) {
      const fingerprint = getPinFingerprint(rootCA.certificate);
      await db.insert(certificatePins).values({
        id: nanoid(),
        pinType: 'root',
        fingerprint,
        certificateId: rootCA.id,
        validFrom: new Date(),
        validUntil: rootCA.notAfter,
        isBackup: false,
        status: 'active',
      }).onConflictDoNothing();
      created.push(fingerprint);
    }

    for (const intermediate of intermediates) {
      const fingerprint = getPinFingerprint(intermediate.certificate);
      await db.insert(certificatePins).values({
        id: nanoid(),
        pinType: 'intermediate',
        fingerprint,
        certificateId: intermediate.id,
        validFrom: new Date(),
        validUntil: intermediate.notAfter,
        isBackup: false,
        status: 'active',
      }).onConflictDoNothing();
      created.push(fingerprint);
    }

    return c.json({
      success: true,
      pins: created,
    });
  }
);

export { pinningRouter };
