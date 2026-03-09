/**
 * ExprsnDidService
 *
 * Core service for did:exprsn operations - a certificate-backed DID method.
 *
 * The did:exprsn format is derived from certificate fingerprints:
 *   did:exprsn:<base32(sha256(cert_fingerprint)[0:15])>
 *
 * Certificate hierarchy:
 * - Platform Root CA → issues certificates for individual creators
 * - Organization Intermediate CAs → issue certificates for org members
 *
 * DID documents include X.509 certificate chains for verification.
 */

import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  exprsnDidCertificates,
  organizationIntermediateCAs,
  caEntityCertificates,
  caIntermediateCertificates,
  caRootCertificates,
  organizations,
  plcIdentities,
  actorRepos,
} from '../../db/schema.js';
import { certificateManager } from '../ca/CertificateManager.js';
import type { OrganizationType } from '@exprsn/shared';

// Base32 character set (RFC 4648)
const BASE32_CHARS = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * Result from creating a did:exprsn
 */
export interface ExprsnDidResult {
  did: string;
  handle: string;
  certificate: {
    id: string;
    pem: string;
    fingerprint: string;
    validUntil: Date;
  };
  privateKey: string; // PEM - returned once, not stored on server
  publicKeyMultibase: string;
}

/**
 * DID Document for did:exprsn
 */
export interface ExprsnDidDocument {
  '@context': string[];
  id: string;
  alsoKnownAs?: string[];
  verificationMethod?: Array<{
    id: string;
    type: string;
    controller: string;
    x509CertificateChain?: string[]; // PEM certificates in chain order
    publicKeyMultibase?: string;
  }>;
  authentication?: string[];
  assertionMethod?: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
}

/**
 * Organization types that get their own intermediate CA
 */
const ORG_TYPES_WITH_INTERMEDIATE_CA: OrganizationType[] = [
  'enterprise',
  'network',
  'label',
  'brand',
];

/**
 * ExprsnDidService - manages did:exprsn identities
 */
export class ExprsnDidService {
  /**
   * Generate did:exprsn from certificate fingerprint
   * Format: did:exprsn:<base32(sha256(cert_fingerprint)[0:15])>
   */
  static generateDid(certificateFingerprint: string): string {
    // Remove colons and convert fingerprint to bytes
    const cleanFingerprint = certificateFingerprint.replace(/:/g, '').toLowerCase();
    const fingerprintBuffer = Buffer.from(cleanFingerprint, 'hex');

    // Hash the fingerprint
    const hash = crypto.createHash('sha256').update(fingerprintBuffer).digest();

    // Take first 15 bytes (120 bits) for ~24 base32 characters
    const truncated = hash.subarray(0, 15);

    // Convert to base32
    let result = '';
    let bits = 0;
    let value = 0;

    for (const byte of truncated) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        bits -= 5;
        result += BASE32_CHARS[(value >> bits) & 0x1f];
      }
    }

    // Handle remaining bits
    if (bits > 0) {
      result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
    }

    return `did:exprsn:${result}`;
  }

  /**
   * Convert public key to multibase format for DID documents
   * Uses z-base32 (multibase prefix 'z')
   */
  static publicKeyToMultibase(publicKeyPem: string): string {
    // Extract the raw public key from PEM
    const pemContent = publicKeyPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '');

    const keyBuffer = Buffer.from(pemContent, 'base64');

    // Use multibase z-base32 encoding (prefix 'z')
    return 'z' + keyBuffer.toString('base64url');
  }

  /**
   * Create did:exprsn for individual creator (issued by platform root CA)
   */
  static async createCreatorDid(input: {
    handle: string;
    email?: string;
    displayName?: string;
  }): Promise<ExprsnDidResult> {
    // Ensure root CA exists
    await certificateManager.ensureRootCA();

    // Issue entity certificate from root CA
    const certResult = await certificateManager.issueEntityCertificate({
      commonName: `@${input.handle}.exprsn`,
      type: 'client',
      email: input.email,
      organization: 'Exprsn Creator',
      validityDays: 365, // 1 year default
    });

    // Generate DID from certificate fingerprint
    const did = this.generateDid(certResult.fingerprint);

    // Get certificate details for valid until date
    const certDetails = await certificateManager.getEntityCertificate(certResult.id);
    if (!certDetails) {
      throw new Error('Failed to retrieve certificate after creation');
    }

    // Convert public key to multibase
    const entityCert = await db
      .select({ publicKey: caEntityCertificates.publicKey })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certResult.id))
      .limit(1);

    const publicKeyMultibase = this.publicKeyToMultibase(entityCert[0]?.publicKey || '');

    // Store the DID-certificate link
    await db.insert(exprsnDidCertificates).values({
      id: nanoid(),
      did,
      certificateId: certResult.id,
      certificateType: 'platform',
      publicKeyMultibase,
      status: 'active',
    });

    // Also create PLC identity record for compatibility
    await db.insert(plcIdentities).values({
      did,
      handle: `${input.handle}.exprsn`,
      signingKey: publicKeyMultibase,
      rotationKeys: [publicKeyMultibase],
      alsoKnownAs: [`at://${input.handle}.exprsn`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: process.env.PDS_ENDPOINT || 'https://pds.exprsn.io',
        },
      },
      certificateId: certResult.id,
      certificateFingerprint: certResult.fingerprint,
      status: 'active',
    });

    return {
      did,
      handle: `${input.handle}.exprsn`,
      certificate: {
        id: certResult.id,
        pem: certResult.certificate,
        fingerprint: certResult.fingerprint,
        validUntil: certDetails.notAfter,
      },
      privateKey: certResult.privateKey,
      publicKeyMultibase,
    };
  }

  /**
   * Create organization intermediate CA
   * Organizations of certain types (enterprise, agency, network, label) get their own CA
   */
  static async createOrganizationCA(input: {
    organizationId: string;
    organizationName: string;
    organizationType: OrganizationType;
    validityDays?: number;
  }): Promise<{ id: string; certificate: string; fingerprint: string }> {
    // Check if org already has an intermediate CA
    const existing = await db
      .select()
      .from(organizationIntermediateCAs)
      .where(eq(organizationIntermediateCAs.organizationId, input.organizationId))
      .limit(1);

    if (existing[0]) {
      throw new Error('Organization already has an intermediate CA');
    }

    // Create intermediate CA
    const intermediateCa = await certificateManager.createIntermediateCA({
      commonName: `${input.organizationName} CA`,
      organization: input.organizationName,
      organizationalUnit: `${input.organizationType} Certificate Authority`,
      validityDays: input.validityDays || 3650, // 10 years
      pathLen: 0, // Cannot issue further intermediate CAs
    });

    // Store the org-CA link
    await db.insert(organizationIntermediateCAs).values({
      id: nanoid(),
      organizationId: input.organizationId,
      intermediateCertId: intermediateCa.id,
      commonName: `${input.organizationName} CA`,
      maxPathLength: 0,
      status: 'active',
    });

    return intermediateCa;
  }

  /**
   * Create did:exprsn for organization owner
   * Creates org intermediate CA if needed, then issues owner certificate
   */
  static async createOrganizationDid(input: {
    handle: string;
    organizationId: string;
    organizationType: OrganizationType;
    organizationName: string;
    email?: string;
  }): Promise<ExprsnDidResult> {
    // Ensure root CA exists
    await certificateManager.ensureRootCA();

    let intermediateId: string | undefined;

    // Create intermediate CA for qualifying org types
    if (ORG_TYPES_WITH_INTERMEDIATE_CA.includes(input.organizationType)) {
      try {
        const orgCa = await this.createOrganizationCA({
          organizationId: input.organizationId,
          organizationName: input.organizationName,
          organizationType: input.organizationType,
        });
        intermediateId = orgCa.id;
      } catch (e) {
        // If CA already exists, get its ID
        const existingCa = await db
          .select()
          .from(organizationIntermediateCAs)
          .where(eq(organizationIntermediateCAs.organizationId, input.organizationId))
          .limit(1);

        if (existingCa[0]) {
          intermediateId = existingCa[0].intermediateCertId;
        }
      }
    }

    // Issue entity certificate
    const certResult = await certificateManager.issueEntityCertificate({
      commonName: `@${input.handle}`,
      type: 'client',
      email: input.email,
      organization: input.organizationName,
      validityDays: 365,
      intermediateId,
    });

    // Generate DID from certificate fingerprint
    const did = this.generateDid(certResult.fingerprint);

    // Get certificate details
    const certDetails = await certificateManager.getEntityCertificate(certResult.id);
    if (!certDetails) {
      throw new Error('Failed to retrieve certificate after creation');
    }

    // Get public key for multibase
    const entityCert = await db
      .select({ publicKey: caEntityCertificates.publicKey })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certResult.id))
      .limit(1);

    const publicKeyMultibase = this.publicKeyToMultibase(entityCert[0]?.publicKey || '');

    // Store the DID-certificate link
    await db.insert(exprsnDidCertificates).values({
      id: nanoid(),
      did,
      certificateId: certResult.id,
      issuerIntermediateId: intermediateId,
      organizationId: input.organizationId,
      certificateType: 'organization',
      publicKeyMultibase,
      status: 'active',
    });

    // Create PLC identity record
    await db.insert(plcIdentities).values({
      did,
      handle: input.handle,
      signingKey: publicKeyMultibase,
      rotationKeys: [publicKeyMultibase],
      alsoKnownAs: [`at://${input.handle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: process.env.PDS_ENDPOINT || 'https://pds.exprsn.io',
        },
      },
      certificateId: certResult.id,
      certificateFingerprint: certResult.fingerprint,
      status: 'active',
    });

    return {
      did,
      handle: input.handle,
      certificate: {
        id: certResult.id,
        pem: certResult.certificate,
        fingerprint: certResult.fingerprint,
        validUntil: certDetails.notAfter,
      },
      privateKey: certResult.privateKey,
      publicKeyMultibase,
    };
  }

  /**
   * Create did:exprsn for organization member
   * Uses organization's intermediate CA to issue certificate
   */
  static async createMemberDid(input: {
    handle: string;
    organizationId: string;
    role: string;
    email?: string;
  }): Promise<ExprsnDidResult> {
    // Get organization's intermediate CA
    const orgCa = await db
      .select()
      .from(organizationIntermediateCAs)
      .where(
        and(
          eq(organizationIntermediateCAs.organizationId, input.organizationId),
          eq(organizationIntermediateCAs.status, 'active')
        )
      )
      .limit(1);

    // Get organization info
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error('Organization not found');
    }

    // Determine if we should use org CA or root CA
    const intermediateId = orgCa[0]?.intermediateCertId;

    // Issue entity certificate
    const certResult = await certificateManager.issueEntityCertificate({
      commonName: `@${input.handle}`,
      type: 'client',
      email: input.email,
      organization: org[0].name,
      validityDays: 365,
      intermediateId,
    });

    // Generate DID from certificate fingerprint
    const did = this.generateDid(certResult.fingerprint);

    // Get certificate details
    const certDetails = await certificateManager.getEntityCertificate(certResult.id);
    if (!certDetails) {
      throw new Error('Failed to retrieve certificate after creation');
    }

    // Get public key for multibase
    const entityCert = await db
      .select({ publicKey: caEntityCertificates.publicKey })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certResult.id))
      .limit(1);

    const publicKeyMultibase = this.publicKeyToMultibase(entityCert[0]?.publicKey || '');

    // Store the DID-certificate link
    await db.insert(exprsnDidCertificates).values({
      id: nanoid(),
      did,
      certificateId: certResult.id,
      issuerIntermediateId: intermediateId,
      organizationId: input.organizationId,
      certificateType: intermediateId ? 'organization' : 'platform',
      publicKeyMultibase,
      status: 'active',
    });

    // Create PLC identity record
    await db.insert(plcIdentities).values({
      did,
      handle: input.handle,
      signingKey: publicKeyMultibase,
      rotationKeys: [publicKeyMultibase],
      alsoKnownAs: [`at://${input.handle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: process.env.PDS_ENDPOINT || 'https://pds.exprsn.io',
        },
      },
      certificateId: certResult.id,
      certificateFingerprint: certResult.fingerprint,
      status: 'active',
    });

    return {
      did,
      handle: input.handle,
      certificate: {
        id: certResult.id,
        pem: certResult.certificate,
        fingerprint: certResult.fingerprint,
        validUntil: certDetails.notAfter,
      },
      privateKey: certResult.privateKey,
      publicKeyMultibase,
    };
  }

  /**
   * Get DID document with certificate chain
   */
  static async getDidDocument(did: string): Promise<ExprsnDidDocument | null> {
    // Get the DID certificate record
    const didCert = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did))
      .limit(1);

    if (!didCert[0]) {
      return null;
    }

    const record = didCert[0];

    // Check status
    if (record.status !== 'active') {
      return {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        // Deactivated/revoked - minimal document
      };
    }

    // Get certificate chain
    const chain = await this.getCertificateChain(did);

    // Get PLC identity for additional info
    const identity = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    const alsoKnownAs = identity[0]?.alsoKnownAs as string[] | undefined;
    const services = identity[0]?.services as Record<string, { type: string; endpoint: string }> | null;

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/x509-2020/v1',
        'https://w3id.org/security/multikey/v1',
      ],
      id: did,
      alsoKnownAs,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'X509Certificate2020',
          controller: did,
          x509CertificateChain: chain,
        },
        {
          id: `${did}#atproto`,
          type: 'Multikey',
          controller: did,
          publicKeyMultibase: record.publicKeyMultibase,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
      service: services
        ? Object.entries(services).map(([key, value]) => ({
            id: `${did}#${key}`,
            type: value.type,
            serviceEndpoint: value.endpoint,
          }))
        : [
            {
              id: `${did}#atproto_pds`,
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: process.env.PDS_ENDPOINT || 'https://pds.exprsn.io',
            },
          ],
    };
  }

  /**
   * Get certificate chain for a DID (entity cert → intermediate → root)
   */
  static async getCertificateChain(did: string): Promise<string[]> {
    // Get the DID certificate record
    const didCert = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did))
      .limit(1);

    if (!didCert[0]) {
      return [];
    }

    const chain: string[] = [];

    // Get entity certificate
    const entityCert = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, didCert[0].certificateId))
      .limit(1);

    if (entityCert[0]) {
      chain.push(entityCert[0].certificate);

      // Get intermediate if issued by one
      if (entityCert[0].issuerType === 'intermediate') {
        const intermediate = await db
          .select()
          .from(caIntermediateCertificates)
          .where(eq(caIntermediateCertificates.id, entityCert[0].issuerId))
          .limit(1);

        if (intermediate[0]) {
          chain.push(intermediate[0].certificate);
        }
      }
    }

    // Get root CA
    const rootCa = await certificateManager.getRootCA();
    if (rootCa) {
      chain.push(rootCa.certificate);
    }

    return chain;
  }

  /**
   * Revoke a did:exprsn (revokes the underlying certificate)
   */
  static async revokeDid(
    did: string,
    reason: string,
    performedBy: string
  ): Promise<void> {
    // Get the DID certificate record
    const didCert = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did))
      .limit(1);

    if (!didCert[0]) {
      throw new Error('DID not found');
    }

    if (didCert[0].status === 'revoked') {
      throw new Error('DID is already revoked');
    }

    // Revoke the underlying certificate
    await certificateManager.revokeCertificate(didCert[0].certificateId, reason);

    // Update the DID record
    await db
      .update(exprsnDidCertificates)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: performedBy,
        revocationReason: reason,
      })
      .where(eq(exprsnDidCertificates.did, did));

    // Also update PLC identity
    await db
      .update(plcIdentities)
      .set({
        status: 'tombstoned',
        tombstonedAt: new Date(),
        tombstonedBy: performedBy,
        tombstoneReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(plcIdentities.did, did));
  }

  /**
   * Rotate keys for a did:exprsn (reissues certificate)
   */
  static async rotateKeys(did: string): Promise<ExprsnDidResult> {
    // Get the DID certificate record
    const didCert = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did))
      .limit(1);

    if (!didCert[0]) {
      throw new Error('DID not found');
    }

    if (didCert[0].status !== 'active') {
      throw new Error('Cannot rotate keys for inactive DID');
    }

    // Get current certificate
    const currentCert = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, didCert[0].certificateId))
      .limit(1);

    if (!currentCert[0]) {
      throw new Error('Certificate not found');
    }

    // Get PLC identity for handle
    const identity = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    const handle = identity[0]?.handle || '';

    // Renew the certificate (issues new cert, optionally revokes old)
    const renewResult = await certificateManager.renewCertificate({
      certificateId: didCert[0].certificateId,
      revokeOld: true,
      validityDays: 365,
    });

    // Get new certificate details
    const newCertDetails = await certificateManager.getEntityCertificate(renewResult.id);
    if (!newCertDetails) {
      throw new Error('Failed to retrieve renewed certificate');
    }

    // Get new public key
    const newEntityCert = await db
      .select({ publicKey: caEntityCertificates.publicKey })
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, renewResult.id))
      .limit(1);

    const publicKeyMultibase = this.publicKeyToMultibase(newEntityCert[0]?.publicKey || '');

    // Note: The DID stays the same (based on original cert fingerprint)
    // But we update the certificate reference

    // Update the DID certificate record
    await db
      .update(exprsnDidCertificates)
      .set({
        certificateId: renewResult.id,
        publicKeyMultibase,
      })
      .where(eq(exprsnDidCertificates.did, did));

    // Update PLC identity
    await db
      .update(plcIdentities)
      .set({
        signingKey: publicKeyMultibase,
        rotationKeys: [publicKeyMultibase],
        certificateId: renewResult.id,
        certificateFingerprint: renewResult.fingerprint,
        updatedAt: new Date(),
      })
      .where(eq(plcIdentities.did, did));

    return {
      did,
      handle,
      certificate: {
        id: renewResult.id,
        pem: renewResult.certificate,
        fingerprint: renewResult.fingerprint,
        validUntil: newCertDetails.notAfter,
      },
      privateKey: renewResult.privateKey,
      publicKeyMultibase,
    };
  }

  /**
   * Check certificate status (OCSP-like)
   */
  static async checkCertificateStatus(did: string): Promise<{
    status: 'good' | 'revoked' | 'unknown';
    revocationTime?: Date;
    revocationReason?: string;
    certificateId?: string;
  }> {
    // Get the DID certificate record
    const didCert = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did))
      .limit(1);

    if (!didCert[0]) {
      return { status: 'unknown' };
    }

    if (didCert[0].status === 'revoked') {
      return {
        status: 'revoked',
        revocationTime: didCert[0].revokedAt || undefined,
        revocationReason: didCert[0].revocationReason || undefined,
        certificateId: didCert[0].certificateId,
      };
    }

    // Also check the underlying certificate status
    const certStatus = await certificateManager.getEntityCertificate(didCert[0].certificateId);
    if (!certStatus) {
      return { status: 'unknown' };
    }

    if (certStatus.status === 'revoked') {
      return {
        status: 'revoked',
        certificateId: didCert[0].certificateId,
      };
    }

    // Check if certificate is expired
    if (certStatus.notAfter < new Date()) {
      return {
        status: 'revoked',
        revocationTime: certStatus.notAfter,
        revocationReason: 'expired',
        certificateId: didCert[0].certificateId,
      };
    }

    return {
      status: 'good',
      certificateId: didCert[0].certificateId,
    };
  }

  /**
   * Get certificate info for a DID
   */
  static async getCertificateInfo(did: string): Promise<{
    certificateId: string;
    fingerprint: string;
    commonName: string;
    issuer: string;
    notBefore: Date;
    notAfter: Date;
    status: string;
    organizationId?: string;
    certificateType: string;
  } | null> {
    // Get the DID certificate record
    const didCert = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did))
      .limit(1);

    if (!didCert[0]) {
      return null;
    }

    // Get certificate details
    const cert = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, didCert[0].certificateId))
      .limit(1);

    if (!cert[0]) {
      return null;
    }

    // Determine issuer name
    let issuerName = 'Vues Root CA';
    if (cert[0].issuerType === 'intermediate') {
      const intermediate = await db
        .select()
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.id, cert[0].issuerId))
        .limit(1);
      issuerName = intermediate[0]?.commonName || 'Unknown Intermediate CA';
    }

    return {
      certificateId: cert[0].id,
      fingerprint: cert[0].fingerprint,
      commonName: cert[0].commonName,
      issuer: issuerName,
      notBefore: cert[0].notBefore,
      notAfter: cert[0].notAfter,
      status: didCert[0].status,
      organizationId: didCert[0].organizationId || undefined,
      certificateType: didCert[0].certificateType,
    };
  }

  /**
   * Upgrade existing user to organization certificate
   * Called when a user becomes an org owner
   */
  static async upgradeToOrgCertificate(
    did: string,
    organizationId: string
  ): Promise<void> {
    // Get current DID record
    const didCert = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, did))
      .limit(1);

    if (!didCert[0]) {
      throw new Error('DID not found');
    }

    // Get organization's intermediate CA if it exists
    const orgCa = await db
      .select()
      .from(organizationIntermediateCAs)
      .where(eq(organizationIntermediateCAs.organizationId, organizationId))
      .limit(1);

    // Update the DID record to link to organization
    await db
      .update(exprsnDidCertificates)
      .set({
        organizationId,
        issuerIntermediateId: orgCa[0]?.intermediateCertId,
        certificateType: orgCa[0] ? 'organization' : 'platform',
      })
      .where(eq(exprsnDidCertificates.did, did));
  }

  /**
   * Determine if an organization type should have intermediate CA
   */
  static shouldCreateIntermediateCA(orgType: OrganizationType): boolean {
    return ORG_TYPES_WITH_INTERMEDIATE_CA.includes(orgType);
  }
}

export default ExprsnDidService;
