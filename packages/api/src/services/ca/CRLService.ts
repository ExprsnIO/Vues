/**
 * CRL Service
 * Certificate Revocation List generation and distribution
 */

import * as forge from 'node-forge';
import { db } from '../../db/index.js';
import {
  caEntityCertificates,
  caRootCertificates,
  caCRLHistory,
  caCertificateRevocationLists,
} from '../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { CAAuditService } from './CAAuditService.js';

const CA_ENCRYPTION_KEY = process.env.CA_ENCRYPTION_KEY || 'development-key-change-in-production';

// CRL caching
let cachedCRL: { pem: string; der: Buffer; generatedAt: Date; expiresAt: Date } | null = null;
const CRL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Helper to decrypt stored private keys
function decryptPrivateKey(encryptedKey: string, password: string): string {
  try {
    const key = forge.pki.decryptRsaPrivateKey(encryptedKey, password);
    if (!key) throw new Error('Failed to decrypt private key');
    return forge.pki.privateKeyToPem(key);
  } catch {
    return encryptedKey;
  }
}

// Revocation reason mapping
const REVOCATION_REASONS: Record<string, number> = {
  unspecified: 0,
  keyCompromise: 1,
  cACompromise: 2,
  affiliationChanged: 3,
  superseded: 4,
  cessationOfOperation: 5,
  certificateHold: 6,
  removeFromCRL: 8,
  privilegeWithdrawn: 9,
  aACompromise: 10,
};

export interface CRLStatus {
  lastGenerated: Date | null;
  nextUpdate: Date | null;
  revokedCount: number;
  size: number;
  crlNumber: number;
}

export class CRLService {
  private static CRL_VALIDITY_HOURS = 24;

  /**
   * Generate a new CRL
   */
  static async generateCRL(performedBy = 'system'): Promise<{
    crlPem: string;
    crlDer: Buffer;
    expiresAt: Date;
  }> {
    // Get root CA
    const [rootCA] = await db.select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    if (!rootCA) {
      throw new Error('No active root CA found');
    }

    // Get all revoked certificates
    const revokedCerts = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.status, 'revoked'));

    // Get the last CRL number
    const [lastCRL] = await db.select()
      .from(caCRLHistory)
      .orderBy(desc(caCRLHistory.generatedAt))
      .limit(1);

    const crlNumber = (lastCRL?.crlNumber || 0) + 1;

    // Parse root CA certificate and key
    const rootCert = forge.pki.certificateFromPem(rootCA.certificate);
    const rootKey = forge.pki.privateKeyFromPem(
      decryptPrivateKey(rootCA.privateKey, CA_ENCRYPTION_KEY)
    );

    // Create CRL
    const crl = forge.pki.createCrl();
    crl.setIssuer(rootCert.subject.attributes);

    // Set CRL dates
    const now = new Date();
    const nextUpdate = new Date(now.getTime() + this.CRL_VALIDITY_HOURS * 60 * 60 * 1000);

    // Add revoked certificates
    for (const cert of revokedCerts) {
      const revocationDate = cert.revokedAt || new Date();
      const reason = REVOCATION_REASONS[cert.revocationReason || 'unspecified'] || 0;

      // Add certificate to CRL
      const certToBRevoked = forge.pki.certificateFromPem(cert.certificate);
      crl.setNextUpdate(nextUpdate);

      // Use crl.addCertificate properly - it accepts a certificate object
      const revokedCertEntry = {
        serialNumber: certToBRevoked.serialNumber,
        revocationDate,
        extensions: [
          {
            name: 'reasonCode',
            id: '2.5.29.21',
            value: String.fromCharCode(reason),
          },
        ],
      };

      // Add the revoked certificate entry
      if (!crl.revokedCertificates) {
        (crl as unknown as { revokedCertificates: typeof revokedCertEntry[] }).revokedCertificates = [];
      }
      (crl as unknown as { revokedCertificates: typeof revokedCertEntry[] }).revokedCertificates.push(revokedCertEntry);
    }

    // Set CRL number extension
    crl.setExtensions([
      {
        name: 'cRLNumber',
        value: crlNumber.toString(),
      },
    ]);

    // Sign the CRL
    crl.sign(rootKey, forge.md.sha256.create());

    // Convert to PEM and DER
    const crlPem = forge.pki.crlToPem(crl);
    const crlDer = Buffer.from(forge.asn1.toDer(forge.pki.crlToAsn1(crl)).getBytes(), 'binary');

    // Store CRL history
    const historyId = nanoid();
    await db.insert(caCRLHistory).values({
      id: historyId,
      crlPem,
      certCount: revokedCerts.length,
      crlNumber,
      generatedAt: now,
      expiresAt: nextUpdate,
      generatedBy: performedBy,
    });

    // Also update the main CRL table for backward compatibility
    await db.insert(caCertificateRevocationLists).values({
      id: nanoid(),
      issuerId: rootCA.id,
      issuerType: 'root',
      crl: crlPem,
      thisUpdate: now,
      nextUpdate,
    });

    // Update cache
    cachedCRL = {
      pem: crlPem,
      der: crlDer,
      generatedAt: now,
      expiresAt: nextUpdate,
    };

    // Log audit event
    await CAAuditService.log({
      eventType: 'ca.crl_generated',
      performedBy,
      details: {
        crlNumber,
        revokedCount: revokedCerts.length,
        expiresAt: nextUpdate.toISOString(),
      },
    });

    return { crlPem, crlDer, expiresAt: nextUpdate };
  }

  /**
   * Get the current CRL (with caching)
   */
  static async getCurrentCRL(format: 'pem' | 'der' = 'pem'): Promise<string | Buffer> {
    // Check cache
    if (cachedCRL && cachedCRL.expiresAt > new Date()) {
      const cacheAge = Date.now() - cachedCRL.generatedAt.getTime();
      if (cacheAge < CRL_CACHE_TTL_MS) {
        return format === 'der' ? cachedCRL.der : cachedCRL.pem;
      }
    }

    // Check database for recent CRL
    const [recentCRL] = await db.select()
      .from(caCRLHistory)
      .orderBy(desc(caCRLHistory.generatedAt))
      .limit(1);

    if (recentCRL && new Date(recentCRL.expiresAt) > new Date()) {
      // Convert PEM to DER if needed
      const crl = forge.pki.crlFromPem(recentCRL.crlPem);
      const der = Buffer.from(forge.asn1.toDer(forge.pki.crlToAsn1(crl)).getBytes(), 'binary');

      cachedCRL = {
        pem: recentCRL.crlPem,
        der,
        generatedAt: new Date(recentCRL.generatedAt),
        expiresAt: new Date(recentCRL.expiresAt),
      };

      return format === 'der' ? der : recentCRL.crlPem;
    }

    // Generate new CRL
    const result = await this.generateCRL();
    return format === 'der' ? result.crlDer : result.crlPem;
  }

  /**
   * Get delta CRL (certificates revoked since a specific date)
   */
  static async getDeltaCRL(since: Date): Promise<{
    crlPem: string;
    revokedCount: number;
  }> {
    // Get root CA
    const [rootCA] = await db.select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    if (!rootCA) {
      throw new Error('No active root CA found');
    }

    // Get certificates revoked since the specified date
    const revokedCerts = await db.select()
      .from(caEntityCertificates)
      .where(sql`${caEntityCertificates.status} = 'revoked' AND ${caEntityCertificates.revokedAt} >= ${since}`);

    // Parse root CA
    const rootCert = forge.pki.certificateFromPem(rootCA.certificate);
    const rootKey = forge.pki.privateKeyFromPem(
      decryptPrivateKey(rootCA.privateKey, CA_ENCRYPTION_KEY)
    );

    // Create delta CRL
    const crl = forge.pki.createCrl();
    crl.setIssuer(rootCert.subject.attributes);

    const now = new Date();
    const nextUpdate = new Date(now.getTime() + this.CRL_VALIDITY_HOURS * 60 * 60 * 1000);
    crl.setNextUpdate(nextUpdate);

    // Add revoked certificates
    for (const cert of revokedCerts) {
      const certToRevoke = forge.pki.certificateFromPem(cert.certificate);
      const revokedCertEntry = {
        serialNumber: certToRevoke.serialNumber,
        revocationDate: cert.revokedAt || new Date(),
        extensions: [],
      };

      if (!crl.revokedCertificates) {
        (crl as unknown as { revokedCertificates: typeof revokedCertEntry[] }).revokedCertificates = [];
      }
      (crl as unknown as { revokedCertificates: typeof revokedCertEntry[] }).revokedCertificates.push(revokedCertEntry);
    }

    // Sign
    crl.sign(rootKey, forge.md.sha256.create());
    const crlPem = forge.pki.crlToPem(crl);

    return {
      crlPem,
      revokedCount: revokedCerts.length,
    };
  }

  /**
   * Get CRL status information
   */
  static async getStatus(): Promise<CRLStatus> {
    const [recentCRL] = await db.select()
      .from(caCRLHistory)
      .orderBy(desc(caCRLHistory.generatedAt))
      .limit(1);

    const [revokedCount] = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.status, 'revoked'));

    return {
      lastGenerated: recentCRL?.generatedAt || null,
      nextUpdate: recentCRL?.expiresAt || null,
      revokedCount: revokedCount?.count || 0,
      size: recentCRL?.crlPem?.length || 0,
      crlNumber: recentCRL?.crlNumber || 0,
    };
  }

  /**
   * Get CRL distribution points information
   */
  static getCRLDistributionPoints(baseUrl: string): {
    fullCRL: string;
    deltaCRL: string;
    refreshInterval: number;
  } {
    return {
      fullCRL: `${baseUrl}/.well-known/crl.pem`,
      deltaCRL: `${baseUrl}/.well-known/crl-delta.pem`,
      refreshInterval: this.CRL_VALIDITY_HOURS * 3600, // seconds
    };
  }

  /**
   * Check if a certificate is in the CRL
   */
  static async isRevoked(serialNumber: string): Promise<boolean> {
    const [cert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.serialNumber, serialNumber))
      .limit(1);

    return cert?.status === 'revoked';
  }

  /**
   * Force regeneration of CRL
   */
  static async regenerate(performedBy: string): Promise<void> {
    // Clear cache
    cachedCRL = null;

    // Generate new CRL
    await this.generateCRL(performedBy);
  }

  /**
   * Get CRL history
   */
  static async getHistory(limit = 10): Promise<Array<{
    id: string;
    crlNumber: number | null;
    certCount: number;
    generatedAt: Date;
    expiresAt: Date;
    generatedBy: string | null;
  }>> {
    return db.select({
      id: caCRLHistory.id,
      crlNumber: caCRLHistory.crlNumber,
      certCount: caCRLHistory.certCount,
      generatedAt: caCRLHistory.generatedAt,
      expiresAt: caCRLHistory.expiresAt,
      generatedBy: caCRLHistory.generatedBy,
    })
      .from(caCRLHistory)
      .orderBy(desc(caCRLHistory.generatedAt))
      .limit(limit);
  }
}
