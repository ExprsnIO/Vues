/**
 * Certificate Manager Service
 * High-level API for managing X.509 certificates
 */

import { db } from '../../db/index.js';
import {
  caRootCertificates,
  caIntermediateCertificates,
  caEntityCertificates,
  caCertificateRevocationLists,
} from '../../db/schema.js';
import { eq, and, desc, sql, lt, gte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { CertificateType } from '@exprsn/shared/types';
import {
  generateRootCertificate,
  generateIntermediateCertificate,
  generateEntityCertificate,
  signData,
  verifySignature,
  parseCertificate,
  isCertificateValid,
  encryptPrivateKey,
  decryptPrivateKey,
  verifyCertificateChain,
  generateCRL,
  type RootCertificateOptions,
  type IntermediateCertificateOptions,
  type EntityCertificateOptions,
} from './crypto.js';
import { OCSPResponder } from './OCSPResponder.js';

// Track whether we've warned about missing CA encryption key
let caKeyWarningLogged = false;

/**
 * Get CA encryption key from environment
 * SECURITY: No fallback in production - will throw if not configured
 */
function getCAEncryptionKey(): string {
  const key = process.env.CA_ENCRYPTION_KEY;
  const nodeEnv = process.env.NODE_ENV as string | undefined;

  if (!key) {
    // Always throw in production or staging
    if (nodeEnv === 'production' || nodeEnv === 'staging') {
      throw new Error(
        'CRITICAL: CA_ENCRYPTION_KEY environment variable is required for certificate management. ' +
        'Generate a secure key with: openssl rand -base64 32'
      );
    }

    // In development/test, use a deterministic dev key but warn loudly
    if (!caKeyWarningLogged) {
      console.error('═'.repeat(70));
      console.error('⚠️  SECURITY WARNING: CA_ENCRYPTION_KEY not set!');
      console.error('   Using development-only key for CA operations.');
      console.error('   This MUST NOT reach production.');
      console.error('   Generate a secure key: openssl rand -base64 32');
      console.error('═'.repeat(70));
      caKeyWarningLogged = true;
    }

    return 'dev-ca-key-DO-NOT-USE-IN-PRODUCTION-12345';
  }

  if (key.length < 32) {
    throw new Error('CA_ENCRYPTION_KEY must be at least 32 characters long');
  }

  return key;
}

// Lazy-loaded CA encryption key (validated on first use)
const CA_ENCRYPTION_KEY = (() => {
  let cachedKey: string | null = null;
  return () => {
    if (cachedKey === null) {
      cachedKey = getCAEncryptionKey();
    }
    return cachedKey;
  };
})();

export class CertificateManager {
  /**
   * Create or get the root CA certificate
   */
  async ensureRootCA(options?: Partial<RootCertificateOptions>): Promise<{
    id: string;
    certificate: string;
    serialNumber: string;
    fingerprint: string;
  }> {
    // Check for existing active root CA
    const existing = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    if (existing[0]) {
      return {
        id: existing[0].id,
        certificate: existing[0].certificate,
        serialNumber: existing[0].serialNumber,
        fingerprint: existing[0].fingerprint,
      };
    }

    // Generate new root CA
    const certOptions: RootCertificateOptions = {
      commonName: options?.commonName || 'Vues Root CA',
      organization: options?.organization || 'Exprsn',
      organizationalUnit: options?.organizationalUnit || 'Certificate Authority',
      country: options?.country || 'US',
      keySize: options?.keySize || 4096,
      validityDays: options?.validityDays || 7300, // 20 years
    };

    const certResult = await generateRootCertificate(certOptions);

    // Encrypt private key before storing
    const encryptedKey = encryptPrivateKey(certResult.privateKey, CA_ENCRYPTION_KEY());

    const id = nanoid();
    await db.insert(caRootCertificates).values({
      id,
      commonName: certOptions.commonName,
      subject: {
        commonName: certOptions.commonName,
        organization: certOptions.organization,
        organizationalUnit: certOptions.organizationalUnit,
        country: certOptions.country,
      },
      certificate: certResult.certificate,
      publicKey: certResult.publicKey,
      privateKey: encryptedKey,
      serialNumber: certResult.serialNumber,
      fingerprint: certResult.fingerprint,
      algorithm: {
        name: 'RSA-SHA256',
        modulusLength: certOptions.keySize || 4096,
        hashAlgorithm: 'SHA-256',
      },
      notBefore: certResult.notBefore,
      notAfter: certResult.notAfter,
      status: 'active',
      createdAt: new Date(),
    });

    return {
      id,
      certificate: certResult.certificate,
      serialNumber: certResult.serialNumber,
      fingerprint: certResult.fingerprint,
    };
  }

  /**
   * Get the active root CA certificate
   */
  async getRootCA(): Promise<{
    id: string;
    certificate: string;
    serialNumber: string;
    fingerprint: string;
    notBefore: Date;
    notAfter: Date;
  } | null> {
    const result = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    const root = result[0];
    if (!root) return null;

    return {
      id: root.id,
      certificate: root.certificate,
      serialNumber: root.serialNumber,
      fingerprint: root.fingerprint,
      notBefore: root.notBefore,
      notAfter: root.notAfter,
    };
  }

  /**
   * Create an intermediate CA certificate
   */
  async createIntermediateCA(options: {
    commonName: string;
    organization?: string;
    organizationalUnit?: string;
    validityDays?: number;
    pathLength?: number;
  }): Promise<{
    id: string;
    certificate: string;
    serialNumber: string;
    fingerprint: string;
  }> {
    // Get root CA
    const rootCA = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    if (!rootCA[0]) {
      throw new Error('No active root CA found. Initialize root CA first.');
    }

    // Decrypt root CA private key
    const rootPrivateKey = decryptPrivateKey(rootCA[0].privateKey, CA_ENCRYPTION_KEY());

    const certResult = await generateIntermediateCertificate({
      commonName: options.commonName,
      organization: options.organization || 'Exprsn',
      organizationalUnit: options.organizationalUnit || 'Services',
      validityDays: options.validityDays || 3650,
      pathLength: options.pathLength || 0,
      issuerCert: rootCA[0].certificate,
      issuerKey: rootPrivateKey,
    });

    // Encrypt private key before storing
    const encryptedKey = encryptPrivateKey(certResult.privateKey, CA_ENCRYPTION_KEY());

    const id = nanoid();
    await db.insert(caIntermediateCertificates).values({
      id,
      rootId: rootCA[0].id,
      commonName: options.commonName,
      subject: {
        commonName: options.commonName,
        organization: options.organization || 'Exprsn',
        organizationalUnit: options.organizationalUnit || 'Services',
      },
      certificate: certResult.certificate,
      publicKey: certResult.publicKey,
      privateKey: encryptedKey,
      serialNumber: certResult.serialNumber,
      fingerprint: certResult.fingerprint,
      algorithm: {
        name: 'RSA-SHA256',
        modulusLength: 4096,
        hashAlgorithm: 'SHA-256',
      },
      notBefore: certResult.notBefore,
      notAfter: certResult.notAfter,
      pathLength: options.pathLength || 0,
      status: 'active',
      createdAt: new Date(),
    });

    return {
      id,
      certificate: certResult.certificate,
      serialNumber: certResult.serialNumber,
      fingerprint: certResult.fingerprint,
    };
  }

  /**
   * Issue an entity certificate (client or server)
   */
  async issueEntityCertificate(options: {
    commonName: string;
    subjectDid?: string;
    serviceId?: string;
    type: CertificateType;
    organization?: string;
    email?: string;
    subjectAltNames?: string[];
    validityDays?: number;
    intermediateId?: string;
  }): Promise<{
    id: string;
    certificate: string;
    privateKey: string;
    serialNumber: string;
    fingerprint: string;
  }> {
    // Get issuer (intermediate or root)
    let issuerCert: string;
    let issuerKey: string;
    let issuerId: string;

    if (options.intermediateId) {
      const intermediate = await db
        .select()
        .from(caIntermediateCertificates)
        .where(
          and(
            eq(caIntermediateCertificates.id, options.intermediateId),
            eq(caIntermediateCertificates.status, 'active')
          )
        )
        .limit(1);

      if (!intermediate[0]) {
        throw new Error('Intermediate CA not found or inactive');
      }

      issuerCert = intermediate[0].certificate;
      issuerKey = decryptPrivateKey(intermediate[0].privateKey, CA_ENCRYPTION_KEY());
      issuerId = intermediate[0].id;
    } else {
      // Use root CA directly
      const rootCA = await db
        .select()
        .from(caRootCertificates)
        .where(eq(caRootCertificates.status, 'active'))
        .limit(1);

      if (!rootCA[0]) {
        throw new Error('No active root CA found');
      }

      issuerCert = rootCA[0].certificate;
      issuerKey = decryptPrivateKey(rootCA[0].privateKey, CA_ENCRYPTION_KEY());
      issuerId = rootCA[0].id;
    }

    // Map certificate type
    const certType = options.type === 'server' ? 'server' : options.type === 'code_signing' ? 'code_signing' : 'client';

    // Convert string SANs to proper format
    const subjectAltNames = options.subjectAltNames?.map((san) => ({
      type: 'dns' as const,
      value: san,
    }));

    const certResult = await generateEntityCertificate({
      commonName: options.commonName,
      organization: options.organization,
      email: options.email,
      subjectAltNames,
      certType,
      validityDays: options.validityDays || 365,
      issuerCert,
      issuerKey,
    });

    // Encrypt private key before storing
    const encryptedEntityKey = encryptPrivateKey(certResult.privateKey, CA_ENCRYPTION_KEY());

    const id = nanoid();
    await db.insert(caEntityCertificates).values({
      id,
      issuerId,
      issuerType: options.intermediateId ? 'intermediate' : 'root',
      subjectDid: options.subjectDid || null,
      serviceId: options.serviceId || null,
      certType: options.type,
      commonName: options.commonName,
      subject: {
        commonName: options.commonName,
        organization: options.organization,
      },
      certificate: certResult.certificate,
      publicKey: certResult.publicKey,
      privateKey: encryptedEntityKey,
      serialNumber: certResult.serialNumber,
      fingerprint: certResult.fingerprint,
      algorithm: {
        name: 'RSA-SHA256',
        modulusLength: 2048,
        hashAlgorithm: 'SHA-256',
      },
      notBefore: certResult.notBefore,
      notAfter: certResult.notAfter,
      status: 'active',
      createdAt: new Date(),
    });

    return {
      id,
      certificate: certResult.certificate,
      privateKey: certResult.privateKey, // Return unencrypted to caller
      serialNumber: certResult.serialNumber,
      fingerprint: certResult.fingerprint,
    };
  }

  /**
   * Get an entity certificate by ID
   */
  async getEntityCertificate(id: string): Promise<{
    id: string;
    certificate: string;
    serialNumber: string;
    fingerprint: string;
    status: string;
    notBefore: Date;
    notAfter: Date;
    subjectDid: string | null;
    serviceId: string | null;
    certType: string;
  } | null> {
    const result = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, id))
      .limit(1);

    const cert = result[0];
    if (!cert) return null;

    return {
      id: cert.id,
      certificate: cert.certificate,
      serialNumber: cert.serialNumber,
      fingerprint: cert.fingerprint,
      status: cert.status || 'active',
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      subjectDid: cert.subjectDid,
      serviceId: cert.serviceId,
      certType: cert.certType,
    };
  }

  /**
   * List certificates for a user or service
   */
  async listCertificates(options: {
    subjectDid?: string;
    serviceId?: string;
    status?: string;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      commonName: string;
      serialNumber: string;
      fingerprint: string;
      status: string;
      certType: string;
      notBefore: Date;
      notAfter: Date;
    }>
  > {
    const conditions = [];

    if (options.subjectDid) {
      conditions.push(eq(caEntityCertificates.subjectDid, options.subjectDid));
    }
    if (options.serviceId) {
      conditions.push(eq(caEntityCertificates.serviceId, options.serviceId));
    }
    if (options.status) {
      conditions.push(eq(caEntityCertificates.status, options.status));
    }

    const query = db
      .select()
      .from(caEntityCertificates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(caEntityCertificates.createdAt))
      .limit(options.limit || 50);

    const results = await query;

    return results.map((cert) => ({
      id: cert.id,
      commonName: cert.commonName,
      serialNumber: cert.serialNumber,
      fingerprint: cert.fingerprint,
      status: cert.status || 'active',
      certType: cert.certType,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
    }));
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(
    certificateId: string,
    reason: string = 'unspecified'
  ): Promise<{ success: boolean }> {
    // Get the certificate to find its serial number for cache invalidation
    const [cert] = await db
      .select({ serialNumber: caEntityCertificates.serialNumber })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certificateId))
      .limit(1);

    await db
      .update(caEntityCertificates)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revocationReason: reason,
      })
      .where(eq(caEntityCertificates.id, certificateId));

    // Invalidate OCSP cache for this certificate
    if (cert) {
      await OCSPResponder.invalidateCertificateCache(cert.serialNumber);
    }

    return { success: true };
  }

  /**
   * Renew an existing certificate
   * Issues a new certificate with the same properties, optionally revoking the old one
   */
  async renewCertificate(options: {
    certificateId: string;
    revokeOld?: boolean;
    validityDays?: number;
  }): Promise<{
    id: string;
    certificate: string;
    privateKey: string;
    serialNumber: string;
    fingerprint: string;
    oldCertificateId: string;
  }> {
    // Get the existing certificate
    const existingCert = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, options.certificateId))
      .limit(1);

    if (!existingCert[0]) {
      throw new Error('Certificate not found');
    }

    const cert = existingCert[0];

    if (cert.status === 'revoked') {
      throw new Error('Cannot renew a revoked certificate');
    }

    // Parse the subject from existing certificate
    const subject = cert.subject as { commonName?: string; organization?: string } | null;

    // Issue new certificate with same properties
    const newCert = await this.issueEntityCertificate({
      commonName: cert.commonName,
      subjectDid: cert.subjectDid || undefined,
      serviceId: cert.serviceId || undefined,
      type: cert.certType as CertificateType,
      organization: subject?.organization,
      validityDays: options.validityDays || 365,
      intermediateId: cert.issuerType === 'intermediate' ? cert.issuerId : undefined,
    });

    // Link renewal in database
    await db
      .update(caEntityCertificates)
      .set({ renewedBy: newCert.id })
      .where(eq(caEntityCertificates.id, options.certificateId));

    // Optionally revoke the old certificate
    if (options.revokeOld) {
      await this.revokeCertificate(options.certificateId, 'superseded');
    }

    return {
      ...newCert,
      oldCertificateId: options.certificateId,
    };
  }

  /**
   * Get certificate status for OCSP
   */
  async getCertificateStatus(serialNumber: string): Promise<{
    status: 'good' | 'revoked' | 'unknown';
    revocationTime?: Date;
    revocationReason?: string;
    thisUpdate: Date;
    nextUpdate: Date;
  }> {
    const thisUpdate = new Date();
    const nextUpdate = new Date(thisUpdate.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Check entity certificates
    const entityCert = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.serialNumber, serialNumber))
      .limit(1);

    if (entityCert[0]) {
      if (entityCert[0].status === 'revoked') {
        return {
          status: 'revoked',
          revocationTime: entityCert[0].revokedAt || undefined,
          revocationReason: entityCert[0].revocationReason || undefined,
          thisUpdate,
          nextUpdate,
        };
      }

      // Check if certificate is expired
      if (entityCert[0].notAfter < new Date()) {
        return {
          status: 'revoked',
          revocationTime: entityCert[0].notAfter,
          revocationReason: 'expired',
          thisUpdate,
          nextUpdate,
        };
      }

      return {
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
    }

    // Check intermediate certificates
    const intermediateCert = await db
      .select()
      .from(caIntermediateCertificates)
      .where(eq(caIntermediateCertificates.serialNumber, serialNumber))
      .limit(1);

    if (intermediateCert[0]) {
      if (intermediateCert[0].status === 'revoked') {
        return {
          status: 'revoked',
          thisUpdate,
          nextUpdate,
        };
      }
      return {
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
    }

    // Check root certificate
    const rootCert = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.serialNumber, serialNumber))
      .limit(1);

    if (rootCert[0]) {
      if (rootCert[0].status === 'revoked') {
        return {
          status: 'revoked',
          thisUpdate,
          nextUpdate,
        };
      }
      return {
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
    }

    return {
      status: 'unknown',
      thisUpdate,
      nextUpdate,
    };
  }

  /**
   * Get certificates expiring soon (for renewal reminders)
   */
  async getCertificatesExpiringSoon(daysUntilExpiry: number): Promise<
    Array<{
      id: string;
      commonName: string;
      subjectDid: string | null;
      serviceId: string | null;
      notAfter: Date;
      daysRemaining: number;
    }>
  > {
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + daysUntilExpiry);

    const results = await db
      .select({
        id: caEntityCertificates.id,
        commonName: caEntityCertificates.commonName,
        subjectDid: caEntityCertificates.subjectDid,
        serviceId: caEntityCertificates.serviceId,
        notAfter: caEntityCertificates.notAfter,
      })
      .from(caEntityCertificates)
      .where(
        and(
          eq(caEntityCertificates.status, 'active'),
          sql`${caEntityCertificates.notAfter} <= ${expiryThreshold.toISOString()}`,
          sql`${caEntityCertificates.notAfter} > NOW()`
        )
      )
      .orderBy(caEntityCertificates.notAfter);

    return results.map((cert) => ({
      ...cert,
      daysRemaining: Math.ceil((cert.notAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    }));
  }

  /**
   * Verify a certificate
   */
  async verifyCertificate(certificatePem: string): Promise<{
    valid: boolean;
    reason?: string;
    certificate?: ReturnType<typeof parseCertificate>;
  }> {
    try {
      const certInfo = parseCertificate(certificatePem);

      // Check if certificate is time-valid
      if (!isCertificateValid(certificatePem)) {
        return {
          valid: false,
          reason: 'Certificate is expired or not yet valid',
          certificate: certInfo,
        };
      }

      // Check if certificate is in our database and not revoked
      const dbCert = await db
        .select()
        .from(caEntityCertificates)
        .where(eq(caEntityCertificates.serialNumber, certInfo.serialNumber))
        .limit(1);

      if (dbCert[0]) {
        if (dbCert[0].status === 'revoked') {
          return {
            valid: false,
            reason: 'Certificate has been revoked',
            certificate: certInfo,
          };
        }
      }

      // Get certificate chain for verification
      const rootCA = await this.getRootCA();
      if (!rootCA) {
        return {
          valid: false,
          reason: 'No root CA available for verification',
          certificate: certInfo,
        };
      }

      // Build chain
      const chain = [rootCA.certificate];

      // Add intermediates if applicable
      const intermediates = await db
        .select()
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.status, 'active'));

      for (const intermediate of intermediates) {
        chain.push(intermediate.certificate);
      }

      // Verify chain
      const chainValid = verifyCertificateChain(certificatePem, chain);
      if (!chainValid) {
        return {
          valid: false,
          reason: 'Certificate chain verification failed',
          certificate: certInfo,
        };
      }

      return {
        valid: true,
        certificate: certInfo,
      };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Unknown verification error',
      };
    }
  }

  /**
   * Sign data using a certificate's private key
   */
  async signWithCertificate(
    certificateId: string,
    data: string
  ): Promise<{ signature: string }> {
    // Try entity certificates first
    const entityCert = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certificateId))
      .limit(1);

    if (entityCert[0]) {
      throw new Error('Entity certificates do not have private keys stored. Use the private key returned at issuance.');
    }

    // Try intermediate certificates
    const intermediateCert = await db
      .select()
      .from(caIntermediateCertificates)
      .where(eq(caIntermediateCertificates.id, certificateId))
      .limit(1);

    if (intermediateCert[0]) {
      const privateKey = decryptPrivateKey(intermediateCert[0].privateKey, CA_ENCRYPTION_KEY());
      const signature = signData(data, privateKey);
      return { signature };
    }

    // Try root certificate
    const rootCert = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.id, certificateId))
      .limit(1);

    if (rootCert[0]) {
      const privateKey = decryptPrivateKey(rootCert[0].privateKey, CA_ENCRYPTION_KEY());
      const signature = signData(data, privateKey);
      return { signature };
    }

    throw new Error('Certificate not found');
  }

  /**
   * Verify a signature using a certificate's public key
   */
  async verifyWithCertificate(
    certificatePem: string,
    data: string,
    signature: string
  ): Promise<{ valid: boolean }> {
    const certInfo = parseCertificate(certificatePem);

    // Extract public key from certificate
    const forge = await import('node-forge');
    const cert = forge.pki.certificateFromPem(certificatePem);
    const publicKeyPem = forge.pki.publicKeyToPem(cert.publicKey);

    const valid = verifySignature(data, signature, publicKeyPem);
    return { valid };
  }

  /**
   * Generate a Certificate Revocation List
   */
  async generateCRL(): Promise<{ crl: string; id: string }> {
    const rootCA = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    if (!rootCA[0]) {
      throw new Error('No active root CA found');
    }

    // Get all revoked certificates
    const revokedCerts = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.status, 'revoked'));

    // Map revoked certs to CRL format with proper reason typing
    type RevocationReason = 'unspecified' | 'keyCompromise' | 'cACompromise' | 'affiliationChanged' |
      'superseded' | 'cessationOfOperation' | 'certificateHold' | 'removeFromCRL' |
      'privilegeWithdrawn' | 'aACompromise';

    const revokedList = revokedCerts.map((cert) => ({
      serialNumber: cert.serialNumber,
      revocationDate: cert.revokedAt || new Date(),
      reason: (cert.revocationReason as RevocationReason | undefined) ?? undefined,
    }));

    const rootPrivateKey = decryptPrivateKey(rootCA[0].privateKey, CA_ENCRYPTION_KEY());
    const crlResult = generateCRL(rootCA[0].certificate, rootPrivateKey, revokedList, { validityDays: 30 });

    // Store CRL
    const id = nanoid();
    await db.insert(caCertificateRevocationLists).values({
      id,
      issuerId: rootCA[0].id,
      issuerType: 'root',
      crl: crlResult.crl,
      thisUpdate: crlResult.thisUpdate,
      nextUpdate: crlResult.nextUpdate,
    });

    return { crl: crlResult.crl, id };
  }

  /**
   * Get the latest CRL
   */
  async getLatestCRL(): Promise<{ crl: string; nextUpdate: Date } | null> {
    const result = await db
      .select()
      .from(caCertificateRevocationLists)
      .orderBy(desc(caCertificateRevocationLists.createdAt))
      .limit(1);

    if (!result[0]) return null;

    return {
      crl: result[0].crl,
      nextUpdate: result[0].nextUpdate,
    };
  }

  // ============================================
  // Admin Methods
  // ============================================

  /**
   * Get certificate statistics
   */
  async getStats(): Promise<{
    totalCertificates: number;
    activeCertificates: number;
    revokedCertificates: number;
    expiredCertificates: number;
    rootCertificates: number;
    intermediateCAs: number;
    expiringIn30Days: number;
  }> {
    const [entityStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${caEntityCertificates.status} = 'active')::int`,
        revoked: sql<number>`count(*) filter (where ${caEntityCertificates.status} = 'revoked')::int`,
        expired: sql<number>`count(*) filter (where ${caEntityCertificates.status} = 'expired')::int`,
      })
      .from(caEntityCertificates);

    const [rootCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(caRootCertificates);

    const [intermediateCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(caIntermediateCertificates);

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [expiringCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(caEntityCertificates)
      .where(
        and(
          eq(caEntityCertificates.status, 'active'),
          sql`${caEntityCertificates.notAfter} < ${thirtyDaysFromNow.toISOString()}`
        )
      );

    return {
      totalCertificates: entityStats?.total || 0,
      activeCertificates: entityStats?.active || 0,
      revokedCertificates: entityStats?.revoked || 0,
      expiredCertificates: entityStats?.expired || 0,
      rootCertificates: rootCount?.count || 0,
      intermediateCAs: intermediateCount?.count || 0,
      expiringIn30Days: expiringCount?.count || 0,
    };
  }

  /**
   * List all CAs (roots and intermediates)
   */
  async listAllCAs(): Promise<Array<{
    id: string;
    commonName: string;
    serialNumber: string;
    fingerprint: string;
    status: string;
    notBefore: Date;
    notAfter: Date;
    certType: 'root' | 'intermediate';
    issuedCount: number;
  }>> {
    // Get root CAs
    const roots = await db
      .select({
        id: caRootCertificates.id,
        commonName: caRootCertificates.commonName,
        serialNumber: caRootCertificates.serialNumber,
        fingerprint: caRootCertificates.fingerprint,
        status: caRootCertificates.status,
        notBefore: caRootCertificates.notBefore,
        notAfter: caRootCertificates.notAfter,
      })
      .from(caRootCertificates)
      .orderBy(desc(caRootCertificates.createdAt));

    // Get intermediates
    const intermediates = await db
      .select({
        id: caIntermediateCertificates.id,
        commonName: caIntermediateCertificates.commonName,
        serialNumber: caIntermediateCertificates.serialNumber,
        fingerprint: caIntermediateCertificates.fingerprint,
        status: caIntermediateCertificates.status,
        notBefore: caIntermediateCertificates.notBefore,
        notAfter: caIntermediateCertificates.notAfter,
      })
      .from(caIntermediateCertificates)
      .orderBy(desc(caIntermediateCertificates.createdAt));

    // Get issued counts
    const rootResults = await Promise.all(
      roots.map(async (root) => {
        const countResult = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(caEntityCertificates)
          .where(
            and(
              eq(caEntityCertificates.issuerId, root.id),
              eq(caEntityCertificates.issuerType, 'root')
            )
          );
        return { ...root, certType: 'root' as const, issuedCount: countResult[0]?.count || 0 };
      })
    );

    const intResults = await Promise.all(
      intermediates.map(async (intermediate) => {
        const countResult = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(caEntityCertificates)
          .where(
            and(
              eq(caEntityCertificates.issuerId, intermediate.id),
              eq(caEntityCertificates.issuerType, 'intermediate')
            )
          );
        return { ...intermediate, certType: 'intermediate' as const, issuedCount: countResult[0]?.count || 0 };
      })
    );

    return [...rootResults, ...intResults];
  }

  /**
   * List all certificates (admin view)
   */
  async listAllCertificates(options: {
    status?: string;
    certType?: string;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{
    certificates: Array<{
      id: string;
      commonName: string;
      serialNumber: string;
      fingerprint: string;
      certType: string;
      status: string;
      subjectDid: string | null;
      serviceId: string | null;
      notBefore: Date;
      notAfter: Date;
      createdAt: Date;
    }>;
    total: number;
    hasMore: boolean;
    stats: {
      total: number;
      active: number;
      revoked: number;
      expired: number;
      server: number;
      client: number;
      codeSigning: number;
    };
  }> {
    const { status, certType, search, limit, offset } = options;

    let conditions = [];
    if (status && status !== 'all') {
      conditions.push(eq(caEntityCertificates.status, status));
    }
    if (certType && certType !== 'all') {
      conditions.push(eq(caEntityCertificates.certType, certType as CertificateType));
    }
    if (search) {
      conditions.push(
        sql`(${caEntityCertificates.commonName} ILIKE ${'%' + search + '%'} OR ${caEntityCertificates.serialNumber} ILIKE ${'%' + search + '%'})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const certificates = await db
      .select({
        id: caEntityCertificates.id,
        commonName: caEntityCertificates.commonName,
        serialNumber: caEntityCertificates.serialNumber,
        fingerprint: caEntityCertificates.fingerprint,
        certType: caEntityCertificates.certType,
        status: caEntityCertificates.status,
        subjectDid: caEntityCertificates.subjectDid,
        serviceId: caEntityCertificates.serviceId,
        notBefore: caEntityCertificates.notBefore,
        notAfter: caEntityCertificates.notAfter,
        createdAt: caEntityCertificates.createdAt,
      })
      .from(caEntityCertificates)
      .where(whereClause)
      .orderBy(desc(caEntityCertificates.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(caEntityCertificates)
      .where(whereClause);
    const totalCount = countResult[0]?.count || 0;

    // Get stats for the response
    const statsResult = await db
      .select({
        status: caEntityCertificates.status,
        certType: caEntityCertificates.certType,
        count: sql<number>`count(*)::int`,
      })
      .from(caEntityCertificates)
      .groupBy(caEntityCertificates.status, caEntityCertificates.certType);

    const stats = {
      total: 0,
      active: 0,
      revoked: 0,
      expired: 0,
      server: 0,
      client: 0,
      codeSigning: 0,
    };

    for (const row of statsResult) {
      stats.total += row.count;
      if (row.status === 'active') stats.active += row.count;
      if (row.status === 'revoked') stats.revoked += row.count;
      if (row.status === 'expired') stats.expired += row.count;
      if (row.certType === 'server') stats.server += row.count;
      if (row.certType === 'client') stats.client += row.count;
      if (row.certType === 'code_signing') stats.codeSigning += row.count;
    }

    return {
      certificates,
      total: totalCount,
      hasMore: offset + certificates.length < totalCount,
      stats,
    };
  }

  /**
   * Batch revoke certificates
   */
  async batchRevokeCertificates(
    certificateIds: string[],
    reason: string
  ): Promise<{ revokedCount: number; revokedAt: Date }> {
    const now = new Date();

    // Get serial numbers for cache invalidation before revoking
    const certs = await db
      .select({ serialNumber: caEntityCertificates.serialNumber })
      .from(caEntityCertificates)
      .where(sql`${caEntityCertificates.id} = ANY(${certificateIds})`);

    await db
      .update(caEntityCertificates)
      .set({
        status: 'revoked',
        revokedAt: now,
        revocationReason: reason,
      })
      .where(
        and(
          sql`${caEntityCertificates.id} = ANY(${certificateIds})`,
          eq(caEntityCertificates.status, 'active')
        )
      );

    // Invalidate OCSP cache for all revoked certificates
    await Promise.all(
      certs.map(cert => OCSPResponder.invalidateCertificateCache(cert.serialNumber))
    );

    return { revokedCount: certificateIds.length, revokedAt: now };
  }

  /**
   * Batch download certificates
   */
  async batchDownloadCertificates(
    certificateIds: string[],
    format: 'pem' | 'der' | 'pkcs12',
    includePrivateKey: boolean,
    password?: string
  ): Promise<Array<{
    id: string;
    commonName: string;
    serialNumber: string;
    format: string;
    data: string;
  }>> {
    const certificates = await db
      .select()
      .from(caEntityCertificates)
      .where(sql`${caEntityCertificates.id} = ANY(${certificateIds})`);

    return certificates.map((cert) => {
      let data: string;

      if (format === 'pkcs12' && includePrivateKey && password) {
        // For PKCS12, we'd need to implement proper export
        // For now, return PEM with encrypted private key marker
        const privateKey = decryptPrivateKey(cert.privateKey, CA_ENCRYPTION_KEY());
        data = `-----PKCS12 EXPORT-----\n${cert.certificate}\n${privateKey}\n-----END PKCS12-----`;
      } else if (format === 'der') {
        // Convert PEM to base64 DER
        const pemContent = cert.certificate
          .replace('-----BEGIN CERTIFICATE-----', '')
          .replace('-----END CERTIFICATE-----', '')
          .replace(/\s/g, '');
        data = pemContent;
      } else {
        // PEM format
        data = cert.certificate;
        if (includePrivateKey) {
          const privateKey = decryptPrivateKey(cert.privateKey, CA_ENCRYPTION_KEY());
          data = privateKey + '\n' + data;
        }
      }

      return {
        id: cert.id,
        commonName: cert.commonName,
        serialNumber: cert.serialNumber,
        format,
        data,
      };
    });
  }

  /**
   * Batch issue certificates
   */
  async batchIssueCertificates(
    certificates: Array<{
      commonName: string;
      subjectDid?: string;
      serviceId?: string;
      email?: string;
    }>,
    issuerId?: string,
    certType: 'client' | 'server' | 'code_signing' = 'client',
    validityDays: number = 365
  ): Promise<{
    results: Array<{
      success: boolean;
      id?: string;
      commonName: string;
      certificate?: string;
      privateKey?: string;
      error?: string;
    }>;
    summary: { total: number; successful: number; failed: number };
  }> {
    // Get issuer
    let issuerCert: string;
    let issuerKey: string;
    let actualIssuerId: string;
    let issuerType: 'root' | 'intermediate';

    if (issuerId) {
      // Try intermediate first
      const intermediate = await db
        .select()
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.id, issuerId))
        .limit(1);

      if (intermediate[0]) {
        issuerCert = intermediate[0].certificate;
        issuerKey = decryptPrivateKey(intermediate[0].privateKey, CA_ENCRYPTION_KEY());
        actualIssuerId = intermediate[0].id;
        issuerType = 'intermediate';
      } else {
        const root = await db
          .select()
          .from(caRootCertificates)
          .where(eq(caRootCertificates.id, issuerId))
          .limit(1);

        if (!root[0]) {
          throw new Error('Issuing CA not found');
        }

        issuerCert = root[0].certificate;
        issuerKey = decryptPrivateKey(root[0].privateKey, CA_ENCRYPTION_KEY());
        actualIssuerId = root[0].id;
        issuerType = 'root';
      }
    } else {
      // Use default intermediate or root
      const intermediate = await db
        .select()
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.status, 'active'))
        .limit(1);

      if (intermediate[0]) {
        issuerCert = intermediate[0].certificate;
        issuerKey = decryptPrivateKey(intermediate[0].privateKey, CA_ENCRYPTION_KEY());
        actualIssuerId = intermediate[0].id;
        issuerType = 'intermediate';
      } else {
        const root = await db
          .select()
          .from(caRootCertificates)
          .where(eq(caRootCertificates.status, 'active'))
          .limit(1);

        if (!root[0]) {
          throw new Error('No active CA found');
        }

        issuerCert = root[0].certificate;
        issuerKey = decryptPrivateKey(root[0].privateKey, CA_ENCRYPTION_KEY());
        actualIssuerId = root[0].id;
        issuerType = 'root';
      }
    }

    const results = await Promise.all(
      certificates.map(async (certRequest) => {
        try {
          const result = await generateEntityCertificate({
            commonName: certRequest.commonName,
            certType: certType as 'client' | 'server' | 'dual' | 'code_signing' | 'email',
            validityDays,
            issuerCert,
            issuerKey,
            email: certRequest.email,
          });

          const encryptedKey = encryptPrivateKey(result.privateKey, CA_ENCRYPTION_KEY());

          const id = nanoid();
          await db.insert(caEntityCertificates).values({
            id,
            issuerId: actualIssuerId,
            issuerType,
            subjectDid: certRequest.subjectDid || null,
            serviceId: certRequest.serviceId || null,
            certType,
            commonName: certRequest.commonName,
            subject: { commonName: certRequest.commonName },
            certificate: result.certificate,
            publicKey: result.publicKey,
            privateKey: encryptedKey,
            serialNumber: result.serialNumber,
            fingerprint: result.fingerprint,
            algorithm: { name: 'RSA-SHA256', modulusLength: 2048, hashAlgorithm: 'SHA-256' },
            notBefore: result.notBefore,
            notAfter: result.notAfter,
            status: 'active',
            createdAt: new Date(),
          });

          return {
            success: true,
            id,
            commonName: certRequest.commonName,
            certificate: result.certificate,
            privateKey: result.privateKey, // Return unencrypted for download
          };
        } catch (error) {
          return {
            success: false,
            commonName: certRequest.commonName,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      results,
      summary: { total: results.length, successful, failed },
    };
  }

  /**
   * Get certificate with full details (admin view)
   */
  async getCertificateWithDetails(id: string): Promise<{
    id: string;
    commonName: string;
    serialNumber: string;
    fingerprint: string;
    certType: string;
    status: string;
    subjectDid: string | null;
    serviceId: string | null;
    notBefore: Date;
    notAfter: Date;
    createdAt: Date;
    certificate: string;
    issuerName: string;
    keyUsage: string[];
    extKeyUsage: string[];
    subjectAltNames: Array<{ type: string; value: string }>;
  } | null> {
    const [cert] = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, id));

    if (!cert) return null;

    // Get issuer name
    let issuerName = 'Unknown';
    if (cert.issuerType === 'root') {
      const [issuer] = await db
        .select({ commonName: caRootCertificates.commonName })
        .from(caRootCertificates)
        .where(eq(caRootCertificates.id, cert.issuerId));
      issuerName = issuer?.commonName || 'Unknown';
    } else {
      const [issuer] = await db
        .select({ commonName: caIntermediateCertificates.commonName })
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.id, cert.issuerId));
      issuerName = issuer?.commonName || 'Unknown';
    }

    // Parse certificate for detailed info
    const parsed = parseCertificate(cert.certificate);

    return {
      id: cert.id,
      commonName: cert.commonName,
      serialNumber: cert.serialNumber,
      fingerprint: cert.fingerprint,
      certType: cert.certType,
      status: cert.status,
      subjectDid: cert.subjectDid,
      serviceId: cert.serviceId,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      createdAt: cert.createdAt,
      certificate: cert.certificate,
      issuerName,
      keyUsage: parsed.keyUsage,
      extKeyUsage: parsed.extKeyUsage,
      subjectAltNames: parsed.subjectAltNames,
    };
  }

  /**
   * Initialize root CA (admin interface) - alias for ensureRootCA with admin logging
   */
  async initializeRootCA(options?: Partial<RootCertificateOptions>): Promise<{
    id: string;
    certificate: string;
    serialNumber: string;
    fingerprint: string;
    commonName: string;
    notBefore: Date;
    notAfter: Date;
  }> {
    // Check for existing root CA first
    const existing = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    if (existing[0]) {
      return {
        id: existing[0].id,
        certificate: existing[0].certificate,
        serialNumber: existing[0].serialNumber,
        fingerprint: existing[0].fingerprint,
        commonName: existing[0].commonName,
        notBefore: existing[0].notBefore,
        notAfter: existing[0].notAfter,
      };
    }

    // Create new root CA
    const result = await this.ensureRootCA(options);

    // Fetch the full record for additional fields
    const [created] = await db
      .select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.id, result.id));

    return {
      ...result,
      commonName: created?.commonName || options?.commonName || 'Vues Root CA',
      notBefore: created?.notBefore || new Date(),
      notAfter: created?.notAfter || new Date(Date.now() + 7300 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Issue certificate (simplified admin interface)
   */
  async issueCertificate(options: {
    commonName: string;
    certType?: 'client' | 'server' | 'code_signing';
    subjectDid?: string;
    serviceId?: string;
    email?: string;
    validityDays?: number;
    issuerId?: string;
  }): Promise<{
    id: string;
    certificate: string;
    serialNumber: string;
    fingerprint: string;
  }> {
    return this.issueEntityCertificate({
      commonName: options.commonName,
      type: options.certType || 'client',
      subjectDid: options.subjectDid,
      serviceId: options.serviceId,
      email: options.email,
      validityDays: options.validityDays || 365,
      intermediateId: options.issuerId,
    });
  }

  /**
   * Get certificates expiring within specified days (admin interface)
   */
  async getExpiringCertificates(days: number = 30): Promise<Array<{
    id: string;
    commonName: string;
    serialNumber: string;
    certType: string;
    status: string;
    subjectDid: string | null;
    notAfter: Date;
    daysUntilExpiry: number;
  }>> {
    const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const certificates = await db
      .select()
      .from(caEntityCertificates)
      .where(
        and(
          eq(caEntityCertificates.status, 'active'),
          sql`${caEntityCertificates.notAfter} <= ${expiryDate.toISOString()}`
        )
      )
      .orderBy(caEntityCertificates.notAfter);

    return certificates.map(cert => ({
      id: cert.id,
      commonName: cert.commonName,
      serialNumber: cert.serialNumber,
      certType: cert.certType,
      status: cert.status,
      subjectDid: cert.subjectDid,
      notAfter: cert.notAfter,
      daysUntilExpiry: Math.ceil((cert.notAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    }));
  }
}

// Export singleton instance
export const certificateManager = new CertificateManager();
