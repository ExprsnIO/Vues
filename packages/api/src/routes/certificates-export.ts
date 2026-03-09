/**
 * Certificate Export Routes
 * Endpoints for exporting certificates in various formats
 */

import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware.js';
import { CertificateExportService } from '../services/ca/CertificateExport.js';
import { CAAuditService } from '../services/ca/CAAuditService.js';
import { db } from '../db/index.js';
import { exprsnDidCertificates, caEntityCertificates } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const certExportRouter = new Hono();

// Type definitions for request bodies
interface ExportPKCS12Body {
  password: string;
  includeChain?: boolean;
}

interface ExportPEMBody {
  includePrivateKey?: boolean;
  includeChain?: boolean;
}

interface EncryptKeyBody {
  password: string;
}

// Export certificate as PKCS#12
certExportRouter.post(
  '/xrpc/io.exprsn.cert.exportPKCS12',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<ExportPKCS12Body>();

    if (!body.password || body.password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Get user's certificate
    const [didCert] = await db.select()
      .from(exprsnDidCertificates)
      .where(
        and(
          eq(exprsnDidCertificates.did, userDid),
          eq(exprsnDidCertificates.status, 'active')
        )
      )
      .limit(1);

    if (!didCert) {
      return c.json({ error: 'No active certificate found for your account' }, 404);
    }

    try {
      const result = await CertificateExportService.exportCertificateById(
        didCert.certificateId,
        {
          format: 'pkcs12',
          includePrivateKey: true,
          includeChain: body.includeChain ?? true,
          password: body.password,
        }
      );

      await CAAuditService.log({
        eventType: 'certificate.exported',
        certificateId: didCert.certificateId,
        subjectDid: userDid,
        performedBy: userDid,
        performedByIp: c.req.header('X-Forwarded-For')?.split(',')[0],
        details: { format: 'pkcs12', includeChain: body.includeChain ?? true },
      });

      return new Response(result.data as Buffer, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      return c.json({ error: message }, 500);
    }
  }
);

// Export certificate as PEM
certExportRouter.post(
  '/xrpc/io.exprsn.cert.exportPEM',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<ExportPEMBody>();

    const [didCert] = await db.select()
      .from(exprsnDidCertificates)
      .where(
        and(
          eq(exprsnDidCertificates.did, userDid),
          eq(exprsnDidCertificates.status, 'active')
        )
      )
      .limit(1);

    if (!didCert) {
      return c.json({ error: 'No active certificate found for your account' }, 404);
    }

    try {
      const result = await CertificateExportService.exportCertificateById(
        didCert.certificateId,
        {
          format: 'pem',
          includePrivateKey: body.includePrivateKey ?? false,
          includeChain: body.includeChain ?? true,
        }
      );

      await CAAuditService.log({
        eventType: 'certificate.exported',
        certificateId: didCert.certificateId,
        subjectDid: userDid,
        performedBy: userDid,
        details: { format: 'pem', includePrivateKey: body.includePrivateKey ?? false },
      });

      return c.json({
        pem: result.data as string,
        filename: result.filename,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      return c.json({ error: message }, 500);
    }
  }
);

// Export certificate as DER
certExportRouter.get(
  '/xrpc/io.exprsn.cert.exportDER',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;

    const [didCert] = await db.select()
      .from(exprsnDidCertificates)
      .where(
        and(
          eq(exprsnDidCertificates.did, userDid),
          eq(exprsnDidCertificates.status, 'active')
        )
      )
      .limit(1);

    if (!didCert) {
      return c.json({ error: 'No active certificate found' }, 404);
    }

    try {
      const result = await CertificateExportService.exportCertificateById(
        didCert.certificateId,
        { format: 'der', includePrivateKey: false }
      );

      return new Response(result.data as Buffer, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      return c.json({ error: message }, 500);
    }
  }
);

// Encrypt private key with password
certExportRouter.post(
  '/xrpc/io.exprsn.cert.encryptKey',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const body = await c.req.json<EncryptKeyBody>();

    if (!body.password || body.password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const [didCert] = await db.select()
      .from(exprsnDidCertificates)
      .where(
        and(
          eq(exprsnDidCertificates.did, userDid),
          eq(exprsnDidCertificates.status, 'active')
        )
      )
      .limit(1);

    if (!didCert) {
      return c.json({ error: 'No active certificate found' }, 404);
    }

    // Get the certificate with private key
    const [entityCert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, didCert.certificateId))
      .limit(1);

    if (!entityCert) {
      return c.json({ error: 'Certificate not found' }, 404);
    }

    try {
      // Note: In production, you'd need to decrypt the stored key first
      // This is a simplified example
      const encryptedKey = CertificateExportService.encryptPrivateKey(
        entityCert.privateKey, // This would need to be decrypted first
        body.password
      );

      return c.json({
        encryptedKey,
        algorithm: 'aes256',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Encryption failed';
      return c.json({ error: message }, 500);
    }
  }
);

// Get certificate info
certExportRouter.get(
  '/xrpc/io.exprsn.cert.info',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;

    const [didCert] = await db.select()
      .from(exprsnDidCertificates)
      .where(
        and(
          eq(exprsnDidCertificates.did, userDid),
          eq(exprsnDidCertificates.status, 'active')
        )
      )
      .limit(1);

    if (!didCert) {
      return c.json({ error: 'No active certificate found' }, 404);
    }

    const [entityCert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, didCert.certificateId))
      .limit(1);

    if (!entityCert) {
      return c.json({ error: 'Certificate not found' }, 404);
    }

    const fingerprints = CertificateExportService.getCertificateFingerprints(entityCert.certificate);

    return c.json({
      id: entityCert.id,
      commonName: entityCert.commonName,
      serialNumber: entityCert.serialNumber,
      fingerprint: {
        sha1: fingerprints.sha1,
        sha256: fingerprints.sha256,
      },
      notBefore: entityCert.notBefore.toISOString(),
      notAfter: entityCert.notAfter.toISOString(),
      status: entityCert.status,
      certType: entityCert.certType,
      daysUntilExpiry: Math.ceil(
        (new Date(entityCert.notAfter).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      ),
    });
  }
);

export { certExportRouter };
