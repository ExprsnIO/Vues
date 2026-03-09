/**
 * Certificate Export Service
 * Handles exporting certificates in various formats (PKCS#12, PEM, DER)
 */

import * as forge from 'node-forge';
import { db } from '../../db/index.js';
import { caEntityCertificates, caIntermediateCertificates, caRootCertificates } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const CA_ENCRYPTION_KEY = process.env.CA_ENCRYPTION_KEY || 'development-key-change-in-production';

// Helper to decrypt stored private keys
function decryptPrivateKey(encryptedKey: string, password: string): string {
  try {
    const key = forge.pki.decryptRsaPrivateKey(encryptedKey, password);
    if (!key) throw new Error('Failed to decrypt private key');
    return forge.pki.privateKeyToPem(key);
  } catch {
    return encryptedKey; // Already unencrypted or different format
  }
}

export class CertificateExportService {
  /**
   * Export certificate + private key as PKCS#12 (.p12/.pfx)
   */
  static async exportPKCS12(options: {
    certificatePem: string;
    privateKeyPem: string;
    chainPems?: string[];
    password: string;
    friendlyName?: string;
  }): Promise<Buffer> {
    const cert = forge.pki.certificateFromPem(options.certificatePem);
    const key = forge.pki.privateKeyFromPem(options.privateKeyPem);
    const chain = options.chainPems?.map(pem => forge.pki.certificateFromPem(pem)) || [];

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      key,
      [cert, ...chain],
      options.password,
      {
        algorithm: '3des',
        friendlyName: options.friendlyName || 'Exprsn Identity',
      }
    );

    return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
  }

  /**
   * Export certificate and private key as PEM bundle
   */
  static exportPEMBundle(options: {
    certificatePem: string;
    privateKeyPem?: string;
    chainPems?: string[];
  }): string {
    const parts: string[] = [];

    if (options.privateKeyPem) {
      parts.push(options.privateKeyPem.trim());
    }
    parts.push(options.certificatePem.trim());

    if (options.chainPems) {
      parts.push(...options.chainPems.map(p => p.trim()));
    }

    return parts.join('\n\n');
  }

  /**
   * Encrypt a private key with a password (PKCS#8 format)
   */
  static encryptPrivateKey(privateKeyPem: string, password: string): string {
    const key = forge.pki.privateKeyFromPem(privateKeyPem);
    return forge.pki.encryptRsaPrivateKey(key, password, {
      algorithm: 'aes256',
    });
  }

  /**
   * Convert PEM to DER format
   */
  static pemToDer(certificatePem: string): Buffer {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const asn1 = forge.pki.certificateToAsn1(cert);
    const der = forge.asn1.toDer(asn1);
    return Buffer.from(der.getBytes(), 'binary');
  }

  /**
   * Export a certificate by ID with optional chain
   */
  static async exportCertificateById(
    certificateId: string,
    options: {
      format: 'pem' | 'der' | 'pkcs12';
      includePrivateKey?: boolean;
      includeChain?: boolean;
      password?: string;
    }
  ): Promise<{ data: Buffer | string; filename: string; contentType: string }> {
    // Get the certificate
    const [cert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, certificateId));

    if (!cert) {
      throw new Error('Certificate not found');
    }

    // Get chain if requested
    let chainPems: string[] = [];
    if (options.includeChain) {
      chainPems = await this.getCertificateChain(cert.issuerId, cert.issuerType);
    }

    // Get private key if requested
    let privateKeyPem: string | undefined;
    if (options.includePrivateKey) {
      privateKeyPem = decryptPrivateKey(cert.privateKey, CA_ENCRYPTION_KEY);
    }

    const baseFilename = cert.commonName.replace(/[^a-zA-Z0-9]/g, '_');

    switch (options.format) {
      case 'pkcs12': {
        if (!options.password) {
          throw new Error('Password required for PKCS#12 export');
        }
        if (!privateKeyPem) {
          throw new Error('Private key required for PKCS#12 export');
        }
        const p12 = await this.exportPKCS12({
          certificatePem: cert.certificate,
          privateKeyPem,
          chainPems,
          password: options.password,
          friendlyName: cert.commonName,
        });
        return {
          data: p12,
          filename: `${baseFilename}.p12`,
          contentType: 'application/x-pkcs12',
        };
      }

      case 'der': {
        const der = this.pemToDer(cert.certificate);
        return {
          data: der,
          filename: `${baseFilename}.der`,
          contentType: 'application/x-x509-ca-cert',
        };
      }

      case 'pem':
      default: {
        const bundle = this.exportPEMBundle({
          certificatePem: cert.certificate,
          privateKeyPem,
          chainPems,
        });
        return {
          data: bundle,
          filename: `${baseFilename}.pem`,
          contentType: 'application/x-pem-file',
        };
      }
    }
  }

  /**
   * Get certificate chain for a certificate
   */
  static async getCertificateChain(issuerId: string, issuerType: string): Promise<string[]> {
    const chain: string[] = [];

    if (issuerType === 'intermediate') {
      // Get intermediate
      const [intermediate] = await db.select()
        .from(caIntermediateCertificates)
        .where(eq(caIntermediateCertificates.id, issuerId));

      if (intermediate) {
        chain.push(intermediate.certificate);

        // Get root
        const [root] = await db.select()
          .from(caRootCertificates)
          .where(eq(caRootCertificates.id, intermediate.rootId));

        if (root) {
          chain.push(root.certificate);
        }
      }
    } else {
      // Get root directly
      const [root] = await db.select()
        .from(caRootCertificates)
        .where(eq(caRootCertificates.id, issuerId));

      if (root) {
        chain.push(root.certificate);
      }
    }

    return chain;
  }

  /**
   * Get certificate fingerprints for pinning
   */
  static getCertificateFingerprints(certificatePem: string): {
    sha1: string;
    sha256: string;
  } {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();

    const sha1 = forge.md.sha1.create();
    sha1.update(der);

    const sha256 = forge.md.sha256.create();
    sha256.update(der);

    return {
      sha1: sha1.digest().toHex(),
      sha256: sha256.digest().toHex(),
    };
  }

  /**
   * Verify a certificate against a password-protected PKCS#12 file
   */
  static parsePKCS12(p12Buffer: Buffer, password: string): {
    certificate: string;
    privateKey: string;
    chain: string[];
  } {
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    let certificate = '';
    let privateKey = '';
    const chain: string[] = [];

    // Extract bags
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    // Get certificate
    const certBag = certBags[forge.pki.oids.certBag];
    if (certBag && certBag.length > 0) {
      // First cert is typically the entity cert
      certificate = forge.pki.certificateToPem(certBag[0].cert!);

      // Additional certs are chain
      for (let i = 1; i < certBag.length; i++) {
        chain.push(forge.pki.certificateToPem(certBag[i].cert!));
      }
    }

    // Get private key
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    if (keyBag && keyBag.length > 0 && keyBag[0].key) {
      privateKey = forge.pki.privateKeyToPem(keyBag[0].key);
    }

    return { certificate, privateKey, chain };
  }
}
