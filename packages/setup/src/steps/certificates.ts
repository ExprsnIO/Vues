/**
 * Certificate Authority initialization step
 *
 * Sets up the root and intermediate CA certificates for the platform.
 */

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
}

/**
 * Initialize the Certificate Authority
 *
 * Creates the root CA certificate (if not exists) and an intermediate CA
 * for signing entity certificates.
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
      pathLen: 0, // Cannot sign other CAs
    });

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
