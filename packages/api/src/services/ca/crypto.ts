/**
 * Certificate Authority Cryptographic Operations
 * Implements RSA-PSS X.509 certificate management using node-forge
 */

import forge from 'node-forge';
import crypto from 'crypto';

const { pki, asn1, md } = forge;

/**
 * Generate RSA key pair
 */
export async function generateKeyPair(keySize: number = 2048): Promise<{
  privateKey: string;
  publicKey: string;
  privateKeyObj: forge.pki.rsa.PrivateKey;
  publicKeyObj: forge.pki.rsa.PublicKey;
}> {
  return new Promise((resolve, reject) => {
    pki.rsa.generateKeyPair({ bits: keySize, workers: -1 }, (err, keypair) => {
      if (err) {
        return reject(err);
      }

      const privateKeyPem = pki.privateKeyToPem(keypair.privateKey);
      const publicKeyPem = pki.publicKeyToPem(keypair.publicKey);

      resolve({
        privateKey: privateKeyPem,
        publicKey: publicKeyPem,
        privateKeyObj: keypair.privateKey,
        publicKeyObj: keypair.publicKey,
      });
    });
  });
}

/**
 * Generate serial number for certificate
 */
export function generateSerialNumber(): string {
  const bytes = crypto.randomBytes(16);
  return bytes.toString('hex');
}

/**
 * Calculate SHA-256 fingerprint of certificate
 */
export function calculateFingerprint(cert: forge.pki.Certificate): string {
  const der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
  const hash = crypto.createHash('sha256');
  hash.update(der, 'binary');
  return hash.digest('hex');
}

export interface RootCertificateOptions {
  commonName: string;
  country?: string;
  state?: string;
  locality?: string;
  organization?: string;
  organizationalUnit?: string;
  email?: string;
  keySize?: number;
  validityDays?: number;
}

export interface CertificateResult {
  certificate: string;
  privateKey: string;
  publicKey: string;
  serialNumber: string;
  fingerprint: string;
  notBefore: Date;
  notAfter: Date;
}

/**
 * Generate root CA certificate
 */
export async function generateRootCertificate(
  options: RootCertificateOptions
): Promise<CertificateResult> {
  const {
    commonName,
    country = 'US',
    state = '',
    locality = '',
    organization = 'Exprsn',
    organizationalUnit = 'Certificate Authority',
    keySize = 4096,
    validityDays = 7300, // 20 years
  } = options;

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey, publicKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: country },
    { shortName: 'ST', value: state },
    { name: 'localityName', value: locality },
    { name: 'organizationName', value: organization },
    { shortName: 'OU', value: organizationalUnit },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed

  // Extensions for root CA
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      critical: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
    {
      name: 'authorityKeyIdentifier',
    },
  ]);

  // Sign certificate with SHA-256
  cert.sign(privateKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    privateKey,
    publicKey,
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter,
  };
}

export interface IntermediateCertificateOptions extends RootCertificateOptions {
  issuerCert: string;
  issuerKey: string;
  pathLen?: number;
}

/**
 * Generate intermediate CA certificate
 */
export async function generateIntermediateCertificate(
  options: IntermediateCertificateOptions
): Promise<CertificateResult> {
  const {
    commonName,
    country = 'US',
    state = '',
    locality = '',
    organization = 'Exprsn',
    organizationalUnit = 'Certificate Authority',
    keySize = 4096,
    validityDays = 3650, // 10 years
    issuerCert,
    issuerKey,
    pathLen = 0,
  } = options;

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey, publicKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: country },
    { shortName: 'ST', value: state },
    { name: 'localityName', value: locality },
    { name: 'organizationName', value: organization },
    { shortName: 'OU', value: organizationalUnit },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Extensions for intermediate CA
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      pathLenConstraint: pathLen,
      critical: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      digitalSignature: true,
      critical: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes(),
    },
  ]);

  // Sign certificate
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    privateKey,
    publicKey,
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter,
  };
}

export interface EntityCertificateOptions {
  commonName: string;
  country?: string;
  state?: string;
  locality?: string;
  organization?: string;
  organizationalUnit?: string;
  email?: string;
  subjectAltNames?: string[];
  type?: 'client' | 'server' | 'code_signing';
  keySize?: number;
  validityDays?: number;
  issuerCert: string;
  issuerKey: string;
}

/**
 * Generate entity certificate (client, server, code signing)
 */
export async function generateEntityCertificate(
  options: EntityCertificateOptions
): Promise<CertificateResult> {
  const {
    commonName,
    country,
    state,
    locality,
    organization,
    organizationalUnit,
    email,
    subjectAltNames = [],
    type = 'client',
    keySize = 2048,
    validityDays = 365,
    issuerCert,
    issuerKey,
  } = options;

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey, publicKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs: forge.pki.CertificateField[] = [{ name: 'commonName', value: commonName }];

  if (country) attrs.push({ name: 'countryName', value: country });
  if (state) attrs.push({ shortName: 'ST', value: state });
  if (locality) attrs.push({ name: 'localityName', value: locality });
  if (organization) attrs.push({ name: 'organizationName', value: organization });
  if (organizationalUnit) attrs.push({ shortName: 'OU', value: organizationalUnit });
  if (email) attrs.push({ name: 'emailAddress', value: email });

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Build extensions based on type
  const extensions: forge.pki.ExtensionField[] = [
    {
      name: 'basicConstraints',
      cA: false,
      critical: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes(),
    },
  ];

  // Key usage based on type
  if (type === 'client') {
    extensions.push({
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    });
    extensions.push({
      name: 'extKeyUsage',
      clientAuth: true,
    });
  } else if (type === 'server') {
    extensions.push({
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    });
    extensions.push({
      name: 'extKeyUsage',
      serverAuth: true,
    });
  } else if (type === 'code_signing') {
    extensions.push({
      name: 'keyUsage',
      digitalSignature: true,
      critical: true,
    });
    extensions.push({
      name: 'extKeyUsage',
      codeSigning: true,
    });
  }

  // Add Subject Alternative Names
  if (subjectAltNames.length > 0) {
    const altNames = subjectAltNames.map((name) => {
      if (name.startsWith('IP:')) {
        return { type: 7, ip: name.substring(3) };
      } else if (name.startsWith('email:')) {
        return { type: 1, value: name.substring(6) };
      } else {
        return { type: 2, value: name }; // DNS
      }
    });

    extensions.push({
      name: 'subjectAltName',
      altNames,
    });
  }

  cert.setExtensions(extensions);

  // Sign certificate
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    privateKey,
    publicKey,
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter,
  };
}

/**
 * Create RSA-SHA256-PSS signature
 */
export function signData(data: string, privateKeyPem: string): string {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  const digest = md.sha256.create();
  digest.update(data, 'utf8');

  // PSS padding
  const pss = forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 32,
  });

  const signature = privateKey.sign(digest, pss);
  return forge.util.encode64(signature);
}

/**
 * Verify RSA-SHA256-PSS signature
 */
export function verifySignature(data: string, signature: string, publicKeyPem: string): boolean {
  try {
    const publicKey = pki.publicKeyFromPem(publicKeyPem);
    const digest = md.sha256.create();
    digest.update(data, 'utf8');

    const signatureBytes = forge.util.decode64(signature);

    // PSS padding
    const pss = forge.pss.create({
      md: forge.md.sha256.create(),
      mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
      saltLength: 32,
    });

    return publicKey.verify(digest.digest().bytes(), signatureBytes, pss);
  } catch {
    return false;
  }
}

/**
 * Calculate SHA-256 checksum of data
 */
export function calculateChecksum(data: Record<string, unknown>): string {
  // Canonical JSON serialization (sorted keys)
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verify certificate chain
 */
export function verifyCertificateChain(certPem: string, chainPems: string[]): boolean {
  try {
    const cert = pki.certificateFromPem(certPem);
    const caStore = pki.createCaStore();

    // Add CA certificates to store
    for (const caPem of chainPems) {
      const caCert = pki.certificateFromPem(caPem);
      caStore.addCertificate(caCert);
    }

    // Verify certificate
    return pki.verifyCertificateChain(caStore, [cert]);
  } catch {
    return false;
  }
}

/**
 * Encrypt private key with password
 */
export function encryptPrivateKey(privateKeyPem: string, password: string): string {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  return pki.encryptRsaPrivateKey(privateKey, password, {
    algorithm: 'aes256',
  });
}

/**
 * Decrypt private key with password
 */
export function decryptPrivateKey(encryptedPem: string, password: string): string {
  const privateKey = pki.decryptRsaPrivateKey(encryptedPem, password);
  if (!privateKey) {
    throw new Error('Failed to decrypt private key - invalid password');
  }
  return pki.privateKeyToPem(privateKey);
}

/**
 * Parse certificate and extract information
 */
export function parseCertificate(certPem: string): {
  serialNumber: string;
  commonName: string;
  organization?: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  isCA: boolean;
  issuer: string;
} {
  const cert = pki.certificateFromPem(certPem);

  const getAttr = (attrs: forge.pki.CertificateField[], name: string): string | undefined => {
    const attr = attrs.find((a) => a.name === name || a.shortName === name);
    return attr?.value as string | undefined;
  };

  return {
    serialNumber: cert.serialNumber,
    commonName: getAttr(cert.subject.attributes, 'commonName') || '',
    organization: getAttr(cert.subject.attributes, 'organizationName'),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    fingerprint: calculateFingerprint(cert),
    isCA: (cert.getExtension('basicConstraints') as forge.pki.ExtensionField | null)?.cA || false,
    issuer: getAttr(cert.issuer.attributes, 'commonName') || '',
  };
}

/**
 * Check if certificate is expired
 */
export function isCertificateExpired(certPem: string): boolean {
  const cert = pki.certificateFromPem(certPem);
  return new Date() > cert.validity.notAfter;
}

/**
 * Check if certificate is valid (not before and not after)
 */
export function isCertificateValid(certPem: string): boolean {
  const cert = pki.certificateFromPem(certPem);
  const now = new Date();
  return now >= cert.validity.notBefore && now <= cert.validity.notAfter;
}

/**
 * Generate a Certificate Revocation List (CRL)
 */
export function generateCRL(
  issuerCert: string,
  issuerKey: string,
  revokedCerts: Array<{ serialNumber: string; revocationDate: Date; reason?: string }>,
  validityDays: number = 30
): string {
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  const crl = forge.pki.createCertificateRevocationList();

  crl.setIssuer(issuerCertObj.subject);
  crl.thisUpdate = new Date();
  crl.nextUpdate = new Date();
  crl.nextUpdate.setDate(crl.nextUpdate.getDate() + validityDays);

  // Add revoked certificates
  for (const revoked of revokedCerts) {
    crl.addRevokedCertificate({
      serialNumber: revoked.serialNumber,
      revocationDate: revoked.revocationDate,
      reason: revoked.reason ? { name: 'reasonCode', value: revoked.reason } : undefined,
    });
  }

  // Sign CRL
  crl.sign(issuerKeyObj, md.sha256.create());

  return forge.pki.crlToPem(crl);
}
