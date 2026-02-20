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
import { eq, and, desc, sql } from 'drizzle-orm';
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

// Environment variable for private key encryption
const CA_ENCRYPTION_KEY = process.env.CA_ENCRYPTION_KEY || 'development-key-change-in-production';

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
    const encryptedKey = encryptPrivateKey(certResult.privateKey, CA_ENCRYPTION_KEY);

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
    pathLen?: number;
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
    const rootPrivateKey = decryptPrivateKey(rootCA[0].privateKey, CA_ENCRYPTION_KEY);

    const certResult = await generateIntermediateCertificate({
      commonName: options.commonName,
      organization: options.organization || 'Exprsn',
      organizationalUnit: options.organizationalUnit || 'Services',
      validityDays: options.validityDays || 3650,
      pathLen: options.pathLen || 0,
      issuerCert: rootCA[0].certificate,
      issuerKey: rootPrivateKey,
    });

    // Encrypt private key before storing
    const encryptedKey = encryptPrivateKey(certResult.privateKey, CA_ENCRYPTION_KEY);

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
      pathLength: options.pathLen || 0,
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
      issuerKey = decryptPrivateKey(intermediate[0].privateKey, CA_ENCRYPTION_KEY);
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
      issuerKey = decryptPrivateKey(rootCA[0].privateKey, CA_ENCRYPTION_KEY);
      issuerId = rootCA[0].id;
    }

    // Map certificate type
    const certType = options.type === 'server' ? 'server' : options.type === 'code_signing' ? 'code_signing' : 'client';

    const certResult = await generateEntityCertificate({
      commonName: options.commonName,
      organization: options.organization,
      email: options.email,
      subjectAltNames: options.subjectAltNames,
      type: certType,
      validityDays: options.validityDays || 365,
      issuerCert,
      issuerKey,
    });

    // Encrypt private key before storing
    const encryptedEntityKey = encryptPrivateKey(certResult.privateKey, CA_ENCRYPTION_KEY);

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
    const result = await db
      .update(caEntityCertificates)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revocationReason: reason,
      })
      .where(eq(caEntityCertificates.id, certificateId));

    return { success: true };
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
      const privateKey = decryptPrivateKey(intermediateCert[0].privateKey, CA_ENCRYPTION_KEY);
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
      const privateKey = decryptPrivateKey(rootCert[0].privateKey, CA_ENCRYPTION_KEY);
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

    const revokedList = revokedCerts.map((cert) => ({
      serialNumber: cert.serialNumber,
      revocationDate: cert.revokedAt || new Date(),
      reason: cert.revocationReason ?? undefined,
    }));

    const rootPrivateKey = decryptPrivateKey(rootCA[0].privateKey, CA_ENCRYPTION_KEY);
    const crl = generateCRL(rootCA[0].certificate, rootPrivateKey, revokedList, 30);

    // Store CRL
    const id = nanoid();
    await db.insert(caCertificateRevocationLists).values({
      id,
      issuerId: rootCA[0].id,
      issuerType: 'root',
      crl,
      thisUpdate: new Date(),
      nextUpdate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return { crl, id };
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
}

// Export singleton instance
export const certificateManager = new CertificateManager();
