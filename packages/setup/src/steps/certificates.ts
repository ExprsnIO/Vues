/**
 * Certificate Authority initialization step
 *
 * Sets up the root and intermediate CA certificates for the platform,
 * plus code-signing and TLS server entity certificates.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { certificateManager } from '@exprsn/api/services/ca';

export interface CertificateResult {
  success: boolean;
  rootCA: {
    id: string;
    fingerprint: string;
    serialNumber: string;
    notAfter: Date;
  } | null;
  intermediateCA: {
    id: string;
    fingerprint: string;
    name: string;
  } | null;
  codeSigningCert?: {
    id: string;
    fingerprint: string;
  } | null;
  tlsServerCert?: {
    id: string;
    fingerprint: string;
  } | null;
  error?: string;
}

export interface CertificateOptions {
  rootCA?: {
    commonName?: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    validityDays?: number;
  };
  intermediateCA?: {
    commonName?: string;
    organization?: string;
    validityDays?: number;
  };
  /** Domain for TLS server certificate SANs */
  domain?: string;
  /** Additional SANs for TLS cert */
  additionalSANs?: string[];
  /** Directory to write fullchain.pem / privkey.pem */
  sslOutputDir?: string;
}

/**
 * Initialize the Certificate Authority
 *
 * Creates the full chain: Root CA → Intermediate CA → Code-Signing + TLS Server certs.
 * Writes fullchain.pem and privkey.pem to the SSL output directory.
 */
export async function initializeCertificates(
  options?: CertificateOptions
): Promise<CertificateResult> {
  try {
    // Step 1: Ensure Root CA exists
    const rootCA = await certificateManager.ensureRootCA({
      commonName: options?.rootCA?.commonName || 'Exprsn Root CA',
      organization: options?.rootCA?.organization || 'Exprsn',
      organizationalUnit: options?.rootCA?.organizationalUnit || 'Certificate Authority',
      country: options?.rootCA?.country || 'US',
      validityDays: options?.rootCA?.validityDays || 7300, // 20 years
    });

    // Get full root CA details
    const rootDetails = await certificateManager.getRootCA();
    if (!rootDetails) {
      return {
        success: false,
        rootCA: null,
        intermediateCA: null,
        error: 'Failed to retrieve root CA after creation',
      };
    }

    // Step 2: Create intermediate CA for signing
    const intermediateName = options?.intermediateCA?.commonName || 'Exprsn Signing CA';
    const intermediateCA = await certificateManager.createIntermediateCA({
      commonName: intermediateName,
      organization: options?.intermediateCA?.organization || 'Exprsn',
      organizationalUnit: 'Entity Signing',
      validityDays: options?.intermediateCA?.validityDays || 3650, // 10 years
      pathLength: 0, // Cannot sign other CAs
    });

    // Step 3: Issue code-signing certificate
    const codeSigningCert = await certificateManager.issueEntityCertificate({
      commonName: 'Exprsn Code Signing',
      type: 'code_signing',
      organization: 'Exprsn',
      intermediateId: intermediateCA.id,
      validityDays: 365,
    });

    // Step 4: Issue TLS server certificate with SANs
    const domain = options?.domain || process.env.SERVICE_DOMAIN || 'localhost';
    const sans = [
      domain,
      `*.${domain}`,
      `api.${domain}`,
      'localhost',
      '127.0.0.1',
      ...(options?.additionalSANs || []),
    ];

    const tlsCert = await certificateManager.issueEntityCertificate({
      commonName: domain,
      type: 'server',
      organization: 'Exprsn',
      subjectAltNames: sans,
      intermediateId: intermediateCA.id,
      validityDays: 365,
    });

    // Step 5: Write fullchain.pem and privkey.pem
    const outputDir = options?.sslOutputDir || resolve(process.cwd(), 'deploy/nginx/ssl');
    const fullchainPath = resolve(outputDir, 'fullchain.pem');
    const privkeyPath = resolve(outputDir, 'privkey.pem');

    mkdirSync(outputDir, { recursive: true });

    const fullchain = [
      tlsCert.certificate,
      intermediateCA.certificate,
      rootCA.certificate,
    ].join('\n');

    writeFileSync(fullchainPath, fullchain, 'utf-8');
    writeFileSync(privkeyPath, tlsCert.privateKey, { mode: 0o600, encoding: 'utf-8' });

    return {
      success: true,
      rootCA: {
        id: rootCA.id,
        fingerprint: rootCA.fingerprint,
        serialNumber: rootCA.serialNumber,
        notAfter: rootDetails.notAfter,
      },
      intermediateCA: {
        id: intermediateCA.id,
        fingerprint: intermediateCA.fingerprint,
        name: intermediateName,
      },
      codeSigningCert: {
        id: codeSigningCert.id,
        fingerprint: codeSigningCert.fingerprint,
      },
      tlsServerCert: {
        id: tlsCert.id,
        fingerprint: tlsCert.fingerprint,
      },
    };
  } catch (error) {
    return {
      success: false,
      rootCA: null,
      intermediateCA: null,
      error: error instanceof Error ? error.message : 'Failed to initialize certificates',
    };
  }
}

/**
 * Get the current CA status
 */
export async function getCertificateStatus(): Promise<{
  hasRootCA: boolean;
  rootFingerprint?: string;
  rootExpiry?: Date;
}> {
  const rootCA = await certificateManager.getRootCA();

  return {
    hasRootCA: !!rootCA,
    rootFingerprint: rootCA?.fingerprint,
    rootExpiry: rootCA?.notAfter,
  };
}

/**
 * Export the root CA certificate for distribution
 */
export async function exportRootCertificate(): Promise<string | null> {
  const rootCA = await certificateManager.getRootCA();
  return rootCA?.certificate || null;
}
