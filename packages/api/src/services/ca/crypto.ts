/**
 * Certificate Authority Cryptographic Operations
 * Implements X.509 certificate management with RSA and ECDSA support
 * RFC 5280 compliant certificate generation
 */

import forge from 'node-forge';
import crypto from 'crypto';

const { pki, asn1, md } = forge;

// OID constants for certificate extensions
const OID = {
  // Key Usage
  digitalSignature: '2.5.29.15',
  keyEncipherment: '2.5.29.15',
  // Extended Key Usage
  serverAuth: '1.3.6.1.5.5.7.3.1',
  clientAuth: '1.3.6.1.5.5.7.3.2',
  codeSigning: '1.3.6.1.5.5.7.3.3',
  emailProtection: '1.3.6.1.5.5.7.3.4',
  timeStamping: '1.3.6.1.5.5.7.3.8',
  ocspSigning: '1.3.6.1.5.5.7.3.9',
  // Authority Information Access
  ocsp: '1.3.6.1.5.5.7.48.1',
  caIssuers: '1.3.6.1.5.5.7.48.2',
  // Certificate Policies
  anyPolicy: '2.5.29.32.0',
};

// Algorithm configuration
export type KeyAlgorithm = 'RSA' | 'ECDSA';
export type ECCurve = 'P-256' | 'P-384' | 'P-521';
export type RSAKeySize = 2048 | 3072 | 4096;

export interface KeyPairOptions {
  algorithm: KeyAlgorithm;
  keySize?: RSAKeySize; // For RSA
  curve?: ECCurve; // For ECDSA
}

export interface KeyPairResult {
  privateKey: string;
  publicKey: string;
  privateKeyObj: forge.pki.rsa.PrivateKey | forge.pki.ed25519.NativeBuffer;
  publicKeyObj: forge.pki.rsa.PublicKey | forge.pki.ed25519.NativeBuffer;
  algorithm: KeyAlgorithm;
  parameters: Record<string, unknown>;
}

/**
 * Generate RFC 5280 compliant serial number
 * Serial numbers must be positive integers, unique per CA
 * Using 20 bytes (160 bits) for uniqueness
 */
export function generateSerialNumber(): string {
  // Generate 20 random bytes (RFC 5280 allows up to 20 octets)
  const bytes = crypto.randomBytes(20);
  // Ensure the first bit is 0 to make it a positive integer (per ASN.1 INTEGER encoding)
  bytes[0] = bytes[0]! & 0x7f;
  // Ensure non-zero
  if (bytes[0] === 0) {
    bytes[0] = 0x01;
  }
  return bytes.toString('hex');
}

/**
 * Generate monotonically increasing serial number with timestamp component
 * Format: [timestamp_hex][random_hex] - ensures uniqueness and sortability
 */
export function generateTimestampedSerialNumber(): string {
  const timestamp = Date.now().toString(16).padStart(12, '0');
  const random = crypto.randomBytes(8).toString('hex');
  return timestamp + random;
}

/**
 * Generate RSA key pair
 */
export async function generateRSAKeyPair(keySize: RSAKeySize = 4096): Promise<{
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
 * Generate ECDSA key pair using Node.js crypto
 * Returns PEM-encoded keys compatible with standard tools
 */
export async function generateECDSAKeyPair(curve: ECCurve = 'P-256'): Promise<{
  privateKey: string;
  publicKey: string;
  curve: ECCurve;
}> {
  const curveMap: Record<ECCurve, string> = {
    'P-256': 'prime256v1',
    'P-384': 'secp384r1',
    'P-521': 'secp521r1',
  };

  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'ec',
      {
        namedCurve: curveMap[curve],
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          return reject(err);
        }
        resolve({
          privateKey,
          publicKey,
          curve,
        });
      }
    );
  });
}

/**
 * Generate key pair with specified algorithm
 */
export async function generateKeyPair(
  options: KeyPairOptions = { algorithm: 'RSA', keySize: 4096 }
): Promise<{
  privateKey: string;
  publicKey: string;
  privateKeyObj?: forge.pki.rsa.PrivateKey;
  publicKeyObj?: forge.pki.rsa.PublicKey;
  algorithm: KeyAlgorithm;
  parameters: Record<string, unknown>;
}> {
  if (options.algorithm === 'ECDSA') {
    const curve = options.curve || 'P-256';
    const keys = await generateECDSAKeyPair(curve);
    return {
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      algorithm: 'ECDSA',
      parameters: { curve },
    };
  }

  const keySize = options.keySize || 4096;
  const keys = await generateRSAKeyPair(keySize);
  return {
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    privateKeyObj: keys.privateKeyObj,
    publicKeyObj: keys.publicKeyObj,
    algorithm: 'RSA',
    parameters: { keySize },
  };
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

/**
 * Calculate SHA-1 fingerprint (for legacy compatibility)
 */
export function calculateSHA1Fingerprint(cert: forge.pki.Certificate): string {
  const der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
  const hash = crypto.createHash('sha1');
  hash.update(der, 'binary');
  return hash.digest('hex');
}

/**
 * Format fingerprint with colons for display
 */
export function formatFingerprint(fingerprint: string): string {
  return fingerprint.toUpperCase().match(/.{2}/g)?.join(':') || fingerprint;
}

export interface SubjectFields {
  commonName: string;
  country?: string;
  state?: string;
  locality?: string;
  organization?: string;
  organizationalUnit?: string;
  email?: string;
  serialNumber?: string; // For device certificates
}

export interface RootCertificateOptions extends SubjectFields {
  keySize?: RSAKeySize;
  algorithm?: KeyAlgorithm;
  curve?: ECCurve;
  validityDays?: number;
  // Certificate Policy
  policyOid?: string;
  cpsUri?: string; // Certificate Practice Statement URI
  // CRL/OCSP endpoints
  crlDistributionPoint?: string;
  ocspResponderUrl?: string;
}

export interface CertificateResult {
  certificate: string;
  privateKey: string;
  publicKey: string;
  serialNumber: string;
  fingerprint: string;
  sha1Fingerprint: string;
  notBefore: Date;
  notAfter: Date;
  algorithm: KeyAlgorithm;
  parameters: Record<string, unknown>;
}

/**
 * Build X.509 subject attributes from options
 */
function buildSubjectAttributes(options: SubjectFields): forge.pki.CertificateField[] {
  const attrs: forge.pki.CertificateField[] = [];

  if (options.country) {
    attrs.push({ name: 'countryName', value: options.country });
  }
  if (options.state) {
    attrs.push({ shortName: 'ST', value: options.state });
  }
  if (options.locality) {
    attrs.push({ name: 'localityName', value: options.locality });
  }
  if (options.organization) {
    attrs.push({ name: 'organizationName', value: options.organization });
  }
  if (options.organizationalUnit) {
    attrs.push({ shortName: 'OU', value: options.organizationalUnit });
  }
  // Common Name should come after organizational fields
  attrs.push({ name: 'commonName', value: options.commonName });
  if (options.email) {
    attrs.push({ name: 'emailAddress', value: options.email });
  }
  if (options.serialNumber) {
    attrs.push({ name: 'serialNumber', value: options.serialNumber });
  }

  return attrs;
}

/**
 * Generate root CA certificate
 * Creates a self-signed CA certificate with proper X.509v3 extensions
 */
export async function generateRootCertificate(
  options: RootCertificateOptions
): Promise<CertificateResult> {
  const {
    commonName,
    country = 'US',
    state,
    locality,
    organization = 'Exprsn',
    organizationalUnit = 'Certificate Authority',
    algorithm = 'RSA',
    keySize = 4096,
    curve = 'P-384',
    validityDays = 7300, // 20 years
    policyOid,
    cpsUri,
    crlDistributionPoint,
    ocspResponderUrl,
  } = options;

  // Generate key pair
  const keyPair = await generateKeyPair({
    algorithm,
    keySize,
    curve,
  });

  // For RSA keys, use forge directly
  if (algorithm === 'RSA' && keyPair.publicKeyObj) {
    const cert = pki.createCertificate();
    cert.publicKey = keyPair.publicKeyObj;
    cert.serialNumber = generateTimestampedSerialNumber();

    const notBefore = new Date();
    notBefore.setMinutes(notBefore.getMinutes() - 5); // Backdate 5 minutes for clock skew
    const notAfter = new Date();
    notAfter.setDate(notBefore.getDate() + validityDays);

    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;

    // Build subject
    const attrs = buildSubjectAttributes({
      commonName,
      country,
      state,
      locality,
      organization,
      organizationalUnit,
    });

    cert.setSubject(attrs);
    cert.setIssuer(attrs); // Self-signed

    // Build extensions for root CA
    // Note: Type assertions needed because node-forge types don't include extension properties
    const extensions: unknown[] = [
      {
        name: 'basicConstraints',
        cA: true,
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
    ];

    // Authority Key Identifier (same as subject for root)
    extensions.push({
      name: 'authorityKeyIdentifier',
      keyIdentifier: true,
      authorityCertIssuer: true,
      serialNumber: true,
    });

    // Certificate Policies
    if (policyOid || cpsUri) {
      const policyInfo: Record<string, unknown> = {};
      if (policyOid) {
        policyInfo.id = policyOid;
      }
      if (cpsUri) {
        policyInfo.qualifiers = [{ id: OID.anyPolicy, uri: cpsUri }];
      }
      extensions.push({
        name: 'certificatePolicies',
        value: [policyInfo],
      } as forge.pki.CertificateField);
    }

    // CRL Distribution Points
    if (crlDistributionPoint) {
      extensions.push({
        name: 'cRLDistributionPoints',
        value: [{ fullName: [{ type: 6, value: crlDistributionPoint }] }],
      } as forge.pki.CertificateField);
    }

    // Authority Information Access (OCSP)
    if (ocspResponderUrl) {
      extensions.push({
        name: 'authorityInfoAccess',
        value: [{ method: OID.ocsp, location: { type: 6, value: ocspResponderUrl } }],
      } as forge.pki.CertificateField);
    }

    cert.setExtensions(extensions as forge.pki.CertificateField[]);

    // Sign certificate with SHA-384 for root (stronger than SHA-256)
    cert.sign(keyPair.privateKeyObj!, md.sha384.create());

    const certificatePem = pki.certificateToPem(cert);
    const fingerprint = calculateFingerprint(cert);
    const sha1Fingerprint = calculateSHA1Fingerprint(cert);

    return {
      certificate: certificatePem,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      serialNumber: cert.serialNumber,
      fingerprint,
      sha1Fingerprint,
      notBefore,
      notAfter,
      algorithm,
      parameters: keyPair.parameters,
    };
  }

  // For ECDSA, we need to use Node.js crypto for certificate generation
  // This requires a different approach - generate CSR and self-sign
  const cert = await generateECDSACertificate({
    subject: {
      commonName,
      country,
      state,
      locality,
      organization,
      organizationalUnit,
    },
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    validityDays,
    isCA: true,
    keyUsage: ['keyCertSign', 'cRLSign', 'digitalSignature'],
    crlDistributionPoint,
    ocspResponderUrl,
  });

  return {
    ...cert,
    algorithm,
    parameters: keyPair.parameters,
  };
}

/**
 * Generate ECDSA certificate using Node.js crypto
 * Uses a hybrid approach: ASN.1 structure with node-forge, signing with Node.js crypto
 */
async function generateECDSACertificate(options: {
  subject: SubjectFields;
  privateKey: string;
  publicKey: string;
  validityDays: number;
  isCA: boolean;
  issuerCert?: string;
  issuerKey?: string;
  keyUsage: string[];
  extKeyUsage?: string[];
  subjectAltNames?: string[];
  crlDistributionPoint?: string;
  ocspResponderUrl?: string;
  pathLength?: number;
}): Promise<Omit<CertificateResult, 'algorithm' | 'parameters'>> {
  const {
    subject,
    privateKey,
    publicKey,
    validityDays,
    isCA,
    issuerCert,
    issuerKey,
    keyUsage,
    extKeyUsage,
    subjectAltNames,
    crlDistributionPoint,
    ocspResponderUrl,
    pathLength = 0,
  } = options;

  // Set validity dates
  const notBefore = new Date();
  notBefore.setMinutes(notBefore.getMinutes() - 5); // Backdate 5 minutes
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  // Generate serial number
  const serialNumber = generateTimestampedSerialNumber();

  // Determine issuer details (self-signed if no issuer provided)
  const isSelfSigned = !issuerCert || !issuerKey;
  let issuerSubject: forge.pki.CertificateField[];
  let signingKey: string;

  if (isSelfSigned) {
    issuerSubject = buildSubjectAttributes(subject);
    signingKey = privateKey;
  } else {
    const parsedIssuer = pki.certificateFromPem(issuerCert!);
    issuerSubject = parsedIssuer.subject.attributes;
    signingKey = issuerKey!;
  }

  // Build TBS (To Be Signed) Certificate using ASN.1
  const subjectAttrs = buildSubjectAttributes(subject);

  // Create version (v3 = 2)
  const versionAsn = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(2).getBytes()),
  ]);

  // Serial number
  const serialAsn = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    forge.util.hexToBytes(serialNumber)
  );

  // Signature algorithm (ECDSA with SHA-256)
  const signatureAlgoAsn = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.2.840.10045.4.3.2').getBytes()),
  ]);

  // Issuer
  const issuerAsn = buildDistinguishedName(issuerSubject);

  // Validity
  const validityAsn = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false, dateToUTCTime(notBefore)),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false, dateToUTCTime(notAfter)),
  ]);

  // Subject
  const subjectAsn = buildDistinguishedName(subjectAttrs);

  // Subject Public Key Info - parse from PEM
  const pubKeyDer = pemToDer(publicKey);
  const subjectPKInfoAsn = asn1.fromDer(pubKeyDer);

  // Extensions
  const extensions: forge.asn1.Asn1[] = [];

  // Basic Constraints
  if (isCA) {
    extensions.push(
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.5.29.19').getBytes()),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, '\xff'), // critical
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.OCTETSTRING,
          false,
          asn1.toDer(
            asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
              asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, '\xff'), // cA = true
              ...(pathLength >= 0
                ? [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(pathLength).getBytes())]
                : []),
            ])
          ).getBytes()
        ),
      ])
    );
  }

  // Key Usage
  if (keyUsage.length > 0) {
    let keyUsageBits = 0;
    if (keyUsage.includes('digitalSignature')) keyUsageBits |= 0x80;
    if (keyUsage.includes('nonRepudiation')) keyUsageBits |= 0x40;
    if (keyUsage.includes('keyEncipherment')) keyUsageBits |= 0x20;
    if (keyUsage.includes('dataEncipherment')) keyUsageBits |= 0x10;
    if (keyUsage.includes('keyAgreement')) keyUsageBits |= 0x08;
    if (keyUsage.includes('keyCertSign')) keyUsageBits |= 0x04;
    if (keyUsage.includes('cRLSign')) keyUsageBits |= 0x02;

    extensions.push(
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.5.29.15').getBytes()),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, '\xff'), // critical
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.OCTETSTRING,
          false,
          asn1.toDer(
            asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BITSTRING, false, String.fromCharCode(7) + String.fromCharCode(keyUsageBits))
          ).getBytes()
        ),
      ])
    );
  }

  // Extended Key Usage
  if (extKeyUsage && extKeyUsage.length > 0) {
    const ekuOids: string[] = [];
    if (extKeyUsage.includes('serverAuth')) ekuOids.push('1.3.6.1.5.5.7.3.1');
    if (extKeyUsage.includes('clientAuth')) ekuOids.push('1.3.6.1.5.5.7.3.2');
    if (extKeyUsage.includes('codeSigning')) ekuOids.push('1.3.6.1.5.5.7.3.3');
    if (extKeyUsage.includes('emailProtection')) ekuOids.push('1.3.6.1.5.5.7.3.4');

    if (ekuOids.length > 0) {
      extensions.push(
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.5.29.37').getBytes()),
          asn1.create(
            asn1.Class.UNIVERSAL,
            asn1.Type.OCTETSTRING,
            false,
            asn1.toDer(
              asn1.create(
                asn1.Class.UNIVERSAL,
                asn1.Type.SEQUENCE,
                true,
                ekuOids.map((oid) =>
                  asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes())
                )
              )
            ).getBytes()
          ),
        ])
      );
    }
  }

  // Subject Alternative Names
  if (subjectAltNames && subjectAltNames.length > 0) {
    const sanEntries = subjectAltNames.map((san) => {
      if (san.startsWith('DNS:')) {
        return asn1.create(asn1.Class.CONTEXT_SPECIFIC, 2, false, san.substring(4));
      } else if (san.startsWith('email:')) {
        return asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, false, san.substring(6));
      } else if (san.startsWith('URI:')) {
        return asn1.create(asn1.Class.CONTEXT_SPECIFIC, 6, false, san.substring(4));
      }
      // Default to DNS
      return asn1.create(asn1.Class.CONTEXT_SPECIFIC, 2, false, san);
    });

    extensions.push(
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.5.29.17').getBytes()),
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.OCTETSTRING,
          false,
          asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, sanEntries)).getBytes()
        ),
      ])
    );
  }

  // Build extensions wrapper
  const extensionsAsn =
    extensions.length > 0
      ? asn1.create(asn1.Class.CONTEXT_SPECIFIC, 3, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, extensions),
        ])
      : null;

  // Build TBS Certificate
  const tbsCertAsn = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    versionAsn,
    serialAsn,
    signatureAlgoAsn,
    issuerAsn,
    validityAsn,
    subjectAsn,
    subjectPKInfoAsn,
    ...(extensionsAsn ? [extensionsAsn] : []),
  ]);

  // Get TBS bytes for signing
  const tbsDer = asn1.toDer(tbsCertAsn).getBytes();
  const tbsBuffer = Buffer.from(tbsDer, 'binary');

  // Sign with ECDSA
  const sign = crypto.createSign('SHA256');
  sign.update(tbsBuffer);
  const signature = sign.sign(signingKey);

  // Build signature ASN.1 (BIT STRING)
  const signatureAsn = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.BITSTRING,
    false,
    String.fromCharCode(0) + signature.toString('binary')
  );

  // Build complete certificate
  const certAsn = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    tbsCertAsn,
    signatureAlgoAsn,
    signatureAsn,
  ]);

  // Convert to PEM
  const certDer = asn1.toDer(certAsn).getBytes();
  const certBase64 = forge.util.encode64(certDer);
  const certificatePem =
    '-----BEGIN CERTIFICATE-----\n' +
    certBase64.match(/.{1,64}/g)!.join('\n') +
    '\n-----END CERTIFICATE-----';

  // Parse back to get fingerprints (also validates the certificate)
  const cert = pki.certificateFromPem(certificatePem);
  const fingerprint = calculateFingerprint(cert);
  const sha1Fingerprint = calculateSHA1Fingerprint(cert);

  return {
    certificate: certificatePem,
    privateKey,
    publicKey,
    serialNumber,
    fingerprint,
    sha1Fingerprint,
    notBefore,
    notAfter,
  };
}

/**
 * Convert Date to UTCTime string format
 */
function dateToUTCTime(date: Date): string {
  const year = date.getUTCFullYear().toString().slice(-2);
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hour = date.getUTCHours().toString().padStart(2, '0');
  const minute = date.getUTCMinutes().toString().padStart(2, '0');
  const second = date.getUTCSeconds().toString().padStart(2, '0');
  return `${year}${month}${day}${hour}${minute}${second}Z`;
}

/**
 * Convert PEM to DER
 */
function pemToDer(pem: string): forge.util.ByteStringBuffer {
  const lines = pem.split('\n');
  const base64 = lines.filter((line) => !line.startsWith('-----')).join('');
  const der = forge.util.decode64(base64);
  return forge.util.createBuffer(der);
}

/**
 * Build Distinguished Name ASN.1 from attributes
 */
function buildDistinguishedName(attrs: forge.pki.CertificateField[]): forge.asn1.Asn1 {
  const rdnSequences = attrs.map((attr) => {
    const oid = getAttributeOid(attr.name || attr.shortName || '');
    const value = attr.value || '';

    return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.PRINTABLESTRING, false, value),
      ]),
    ]);
  });

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, rdnSequences);
}

/**
 * Get OID for attribute name
 */
function getAttributeOid(name: string): string {
  const oids: Record<string, string> = {
    commonName: '2.5.4.3',
    CN: '2.5.4.3',
    countryName: '2.5.4.6',
    C: '2.5.4.6',
    stateOrProvinceName: '2.5.4.8',
    ST: '2.5.4.8',
    localityName: '2.5.4.7',
    L: '2.5.4.7',
    organizationName: '2.5.4.10',
    O: '2.5.4.10',
    organizationalUnitName: '2.5.4.11',
    OU: '2.5.4.11',
    emailAddress: '1.2.840.113549.1.9.1',
  };
  return oids[name] || '2.5.4.3'; // Default to CN
}

export interface IntermediateCertificateOptions extends SubjectFields {
  issuerCert: string;
  issuerKey: string;
  pathLength?: number;
  keySize?: RSAKeySize;
  algorithm?: KeyAlgorithm;
  curve?: ECCurve;
  validityDays?: number;
  crlDistributionPoint?: string;
  ocspResponderUrl?: string;
  caIssuersUrl?: string;
}

/**
 * Generate intermediate CA certificate
 * Creates a subordinate CA certificate signed by parent CA
 */
export async function generateIntermediateCertificate(
  options: IntermediateCertificateOptions
): Promise<CertificateResult> {
  const {
    commonName,
    country = 'US',
    state,
    locality,
    organization = 'Exprsn',
    organizationalUnit = 'Certificate Authority',
    keySize = 4096,
    validityDays = 3650, // 10 years
    issuerCert,
    issuerKey,
    pathLength = 0,
    crlDistributionPoint,
    ocspResponderUrl,
    caIssuersUrl,
  } = options;

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Validate issuer is a CA
  const issuerBasicConstraints = issuerCertObj.getExtension('basicConstraints');
  if (!issuerBasicConstraints || !(issuerBasicConstraints as { cA?: boolean }).cA) {
    throw new Error('Issuer certificate is not a CA');
  }

  // Check path length constraint
  const issuerPathLen = (issuerBasicConstraints as { pathLenConstraint?: number }).pathLenConstraint;
  if (issuerPathLen !== undefined && issuerPathLen < 1) {
    throw new Error('Issuer CA path length constraint does not allow issuing subordinate CAs');
  }

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey, publicKey } = await generateRSAKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateTimestampedSerialNumber();

  const notBefore = new Date();
  notBefore.setMinutes(notBefore.getMinutes() - 5); // Backdate 5 minutes
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  // Ensure intermediate doesn't expire after issuer
  if (notAfter > issuerCertObj.validity.notAfter) {
    notAfter.setTime(issuerCertObj.validity.notAfter.getTime() - 86400000); // 1 day before issuer expires
  }

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Build subject
  const attrs = buildSubjectAttributes({
    commonName,
    country,
    state,
    locality,
    organization,
    organizationalUnit,
  });

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Build extensions for intermediate CA
  // Note: Type assertions needed because node-forge types don't include extension properties
  const extensions: unknown[] = [
    {
      name: 'basicConstraints',
      cA: true,
      pathLenConstraint: pathLength,
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
      authorityCertIssuer: true,
      serialNumber: issuerCertObj.serialNumber,
    },
  ];

  // CRL Distribution Points
  if (crlDistributionPoint) {
    extensions.push({
      name: 'cRLDistributionPoints',
      value: [{ fullName: [{ type: 6, value: crlDistributionPoint }] }],
    });
  }

  // Authority Information Access
  const aiaEntries: Array<{ method: string; location: { type: number; value: string } }> = [];
  if (ocspResponderUrl) {
    aiaEntries.push({ method: OID.ocsp, location: { type: 6, value: ocspResponderUrl } });
  }
  if (caIssuersUrl) {
    aiaEntries.push({ method: OID.caIssuers, location: { type: 6, value: caIssuersUrl } });
  }
  if (aiaEntries.length > 0) {
    extensions.push({
      name: 'authorityInfoAccess',
      value: aiaEntries,
    });
  }

  cert.setExtensions(extensions as forge.pki.CertificateField[]);

  // Sign certificate with SHA-384
  cert.sign(issuerKeyObj, md.sha384.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);
  const sha1Fingerprint = calculateSHA1Fingerprint(cert);

  return {
    certificate: certificatePem,
    privateKey,
    publicKey,
    serialNumber: cert.serialNumber,
    fingerprint,
    sha1Fingerprint,
    notBefore,
    notAfter,
    algorithm: 'RSA',
    parameters: { keySize },
  };
}

export interface EntityCertificateOptions extends SubjectFields {
  subjectAltNames?: Array<{
    type: 'dns' | 'email' | 'ip' | 'uri';
    value: string;
  }>;
  certType?: 'client' | 'server' | 'dual' | 'code_signing' | 'email';
  keySize?: RSAKeySize;
  algorithm?: KeyAlgorithm;
  curve?: ECCurve;
  validityDays?: number;
  issuerCert: string;
  issuerKey: string;
  // Optional custom key usage
  keyUsage?: {
    digitalSignature?: boolean;
    nonRepudiation?: boolean;
    keyEncipherment?: boolean;
    dataEncipherment?: boolean;
    keyAgreement?: boolean;
  };
  // Optional custom extended key usage
  extKeyUsage?: {
    serverAuth?: boolean;
    clientAuth?: boolean;
    codeSigning?: boolean;
    emailProtection?: boolean;
    timeStamping?: boolean;
    ocspSigning?: boolean;
  };
  crlDistributionPoint?: string;
  ocspResponderUrl?: string;
  caIssuersUrl?: string;
}

/**
 * Generate entity certificate (client, server, code signing)
 * Creates an end-entity certificate signed by CA
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
    serialNumber: subjectSerial,
    subjectAltNames = [],
    certType = 'client',
    keySize = 2048,
    validityDays = 365,
    issuerCert,
    issuerKey,
    keyUsage: customKeyUsage,
    extKeyUsage: customExtKeyUsage,
    crlDistributionPoint,
    ocspResponderUrl,
    caIssuersUrl,
  } = options;

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Validate issuer is a CA
  const issuerBasicConstraints = issuerCertObj.getExtension('basicConstraints');
  if (!issuerBasicConstraints || !(issuerBasicConstraints as { cA?: boolean }).cA) {
    throw new Error('Issuer certificate is not a CA');
  }

  // Check path length constraint (must be >= 0 to issue end-entity certs)
  const issuerPathLen = (issuerBasicConstraints as { pathLenConstraint?: number }).pathLenConstraint;
  if (issuerPathLen !== undefined && issuerPathLen < 0) {
    throw new Error('Issuer CA path length constraint does not allow issuing certificates');
  }

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey, publicKey } = await generateRSAKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateTimestampedSerialNumber();

  const notBefore = new Date();
  notBefore.setMinutes(notBefore.getMinutes() - 5); // Backdate 5 minutes
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  // Ensure cert doesn't expire after issuer
  if (notAfter > issuerCertObj.validity.notAfter) {
    notAfter.setTime(issuerCertObj.validity.notAfter.getTime() - 86400000);
  }

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Build subject
  const attrs = buildSubjectAttributes({
    commonName,
    country,
    state,
    locality,
    organization,
    organizationalUnit,
    email,
    serialNumber: subjectSerial,
  });

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Build extensions
  // Note: Type assertions needed because node-forge types don't include extension properties
  const extensions: unknown[] = [
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
      authorityCertIssuer: true,
      serialNumber: issuerCertObj.serialNumber,
    },
  ];

  // Determine key usage based on type or custom settings
  let keyUsageExt: unknown;
  let extKeyUsageExt: unknown;

  if (customKeyUsage) {
    keyUsageExt = {
      name: 'keyUsage',
      ...customKeyUsage,
      critical: true,
    };
  } else {
    // Default key usage based on cert type
    switch (certType) {
      case 'server':
        keyUsageExt = {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
          keyAgreement: true,
          critical: true,
        };
        break;
      case 'client':
        keyUsageExt = {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
          critical: true,
        };
        break;
      case 'dual':
        keyUsageExt = {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
          keyAgreement: true,
          critical: true,
        };
        break;
      case 'code_signing':
        keyUsageExt = {
          name: 'keyUsage',
          digitalSignature: true,
          critical: true,
        };
        break;
      case 'email':
        keyUsageExt = {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
          nonRepudiation: true,
          critical: true,
        };
        break;
      default:
        keyUsageExt = {
          name: 'keyUsage',
          digitalSignature: true,
          critical: true,
        };
    }
  }
  extensions.push(keyUsageExt);

  if (customExtKeyUsage) {
    extKeyUsageExt = {
      name: 'extKeyUsage',
      ...customExtKeyUsage,
    };
  } else {
    // Default extended key usage based on cert type
    switch (certType) {
      case 'server':
        extKeyUsageExt = { name: 'extKeyUsage', serverAuth: true };
        break;
      case 'client':
        extKeyUsageExt = { name: 'extKeyUsage', clientAuth: true };
        break;
      case 'dual':
        extKeyUsageExt = { name: 'extKeyUsage', serverAuth: true, clientAuth: true };
        break;
      case 'code_signing':
        extKeyUsageExt = { name: 'extKeyUsage', codeSigning: true };
        break;
      case 'email':
        extKeyUsageExt = { name: 'extKeyUsage', emailProtection: true, clientAuth: true };
        break;
      default:
        extKeyUsageExt = { name: 'extKeyUsage', clientAuth: true };
    }
  }
  extensions.push(extKeyUsageExt);

  // Subject Alternative Names
  if (subjectAltNames.length > 0) {
    const altNames = subjectAltNames.map((san) => {
      switch (san.type) {
        case 'dns':
          return { type: 2, value: san.value };
        case 'email':
          return { type: 1, value: san.value };
        case 'ip':
          return { type: 7, ip: san.value };
        case 'uri':
          return { type: 6, value: san.value };
        default:
          return { type: 2, value: san.value };
      }
    });

    extensions.push({
      name: 'subjectAltName',
      altNames,
      critical: certType === 'server', // Critical for server certs per CA/Browser Forum
    });
  } else if (certType === 'server') {
    // For server certs, add CN as DNS SAN if no SANs provided
    extensions.push({
      name: 'subjectAltName',
      altNames: [{ type: 2, value: commonName }],
      critical: true,
    });
  }

  // CRL Distribution Points
  if (crlDistributionPoint) {
    extensions.push({
      name: 'cRLDistributionPoints',
      value: [{ fullName: [{ type: 6, value: crlDistributionPoint }] }],
    });
  }

  // Authority Information Access
  const aiaEntries: Array<{ method: string; location: { type: number; value: string } }> = [];
  if (ocspResponderUrl) {
    aiaEntries.push({ method: OID.ocsp, location: { type: 6, value: ocspResponderUrl } });
  }
  if (caIssuersUrl) {
    aiaEntries.push({ method: OID.caIssuers, location: { type: 6, value: caIssuersUrl } });
  }
  if (aiaEntries.length > 0) {
    extensions.push({
      name: 'authorityInfoAccess',
      value: aiaEntries,
    });
  }

  cert.setExtensions(extensions as forge.pki.CertificateField[]);

  // Sign certificate with SHA-256
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);
  const sha1Fingerprint = calculateSHA1Fingerprint(cert);

  return {
    certificate: certificatePem,
    privateKey,
    publicKey,
    serialNumber: cert.serialNumber,
    fingerprint,
    sha1Fingerprint,
    notBefore,
    notAfter,
    algorithm: 'RSA',
    parameters: { keySize },
  };
}

/**
 * Create RSA-SHA256-PSS signature
 */
export function signData(data: string, privateKeyPem: string): string {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  const digest = md.sha256.create();
  digest.update(data, 'utf8');

  // PSS padding with optimal salt length
  const pss = forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 32,
  });

  const signature = privateKey.sign(digest, pss);
  return forge.util.encode64(signature);
}

/**
 * Create signature with timestamp for non-repudiation
 */
export function signDataWithTimestamp(
  data: string,
  privateKeyPem: string
): { signature: string; timestamp: string; dataHash: string } {
  const timestamp = new Date().toISOString();
  const dataHash = crypto.createHash('sha256').update(data).digest('hex');

  // Sign the hash concatenated with timestamp
  const signedData = `${dataHash}:${timestamp}`;
  const signature = signData(signedData, privateKeyPem);

  return { signature, timestamp, dataHash };
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
 * Verify certificate chain with detailed validation
 */
export function verifyCertificateChain(
  certPem: string,
  chainPems: string[]
): { valid: boolean; error?: string; chain?: string[] } {
  try {
    const cert = pki.certificateFromPem(certPem);
    const caStore = pki.createCaStore();

    // Add CA certificates to store
    const chainCerts: forge.pki.Certificate[] = [];
    for (const caPem of chainPems) {
      const caCert = pki.certificateFromPem(caPem);
      caStore.addCertificate(caCert);
      chainCerts.push(caCert);
    }

    // Check validity period
    const now = new Date();
    if (now < cert.validity.notBefore) {
      return { valid: false, error: 'Certificate is not yet valid' };
    }
    if (now > cert.validity.notAfter) {
      return { valid: false, error: 'Certificate has expired' };
    }

    // Check chain certificates validity
    for (const caCert of chainCerts) {
      if (now < caCert.validity.notBefore) {
        return { valid: false, error: `CA certificate "${caCert.subject.getField('CN')?.value}" is not yet valid` };
      }
      if (now > caCert.validity.notAfter) {
        return { valid: false, error: `CA certificate "${caCert.subject.getField('CN')?.value}" has expired` };
      }
    }

    // Verify certificate chain
    const verified = pki.verifyCertificateChain(caStore, [cert]);
    if (!verified) {
      return { valid: false, error: 'Certificate chain verification failed' };
    }

    // Build chain path for response
    const chainPath = [cert.subject.getField('CN')?.value as string];
    let current = cert;
    for (const caCert of chainCerts) {
      if (current.issuer.hash === caCert.subject.hash) {
        chainPath.push(caCert.subject.getField('CN')?.value as string);
        current = caCert;
      }
    }

    return { valid: true, chain: chainPath };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Encrypt private key with password using AES-256-CBC
 */
export function encryptPrivateKey(privateKeyPem: string, password: string): string {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  return pki.encryptRsaPrivateKey(privateKey, password, {
    algorithm: 'aes256',
    count: 100000, // PBKDF2 iterations
    saltSize: 16,
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
 * Export certificate and key to PKCS#12 format
 */
export function exportToPKCS12(
  certPem: string,
  privateKeyPem: string,
  password: string,
  chainPems: string[] = [],
  friendlyName?: string
): string {
  const cert = pki.certificateFromPem(certPem);
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  const chain = chainPems.map((pem) => pki.certificateFromPem(pem));

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert, ...chain], password, {
    friendlyName: friendlyName || cert.subject.getField('CN')?.value as string,
    algorithm: '3des', // Compatible with most systems
  });

  const p12Der = asn1.toDer(p12Asn1).getBytes();
  return forge.util.encode64(p12Der);
}

/**
 * Import certificate and key from PKCS#12 format
 */
export function importFromPKCS12(
  p12Base64: string,
  password: string
): { certificate: string; privateKey: string; chain: string[] } {
  const p12Der = forge.util.decode64(p12Base64);
  const p12Asn1 = asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  let certificate = '';
  let privateKey = '';
  const chain: string[] = [];

  // Extract certificates and private key
  for (const bag of p12.getBags({ bagType: forge.pki.oids.certBag }).certBag || []) {
    if (bag.cert) {
      if (!certificate) {
        certificate = pki.certificateToPem(bag.cert);
      } else {
        chain.push(pki.certificateToPem(bag.cert));
      }
    }
  }

  for (const bag of p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }).pkcs8ShroudedKeyBag || []) {
    if (bag.key) {
      privateKey = pki.privateKeyToPem(bag.key as forge.pki.rsa.PrivateKey);
    }
  }

  return { certificate, privateKey, chain };
}

/**
 * Parse certificate and extract detailed information
 */
export function parseCertificate(certPem: string): {
  serialNumber: string;
  version: number;
  subject: Record<string, string>;
  issuer: Record<string, string>;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  sha1Fingerprint: string;
  isCA: boolean;
  pathLength?: number;
  keyUsage: string[];
  extKeyUsage: string[];
  subjectAltNames: Array<{ type: string; value: string }>;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize?: number;
} {
  const cert = pki.certificateFromPem(certPem);

  const extractAttributes = (attrs: forge.pki.CertificateField[]): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const attr of attrs) {
      const name = attr.name || attr.shortName || 'unknown';
      result[name] = attr.value as string;
    }
    return result;
  };

  // Extract key usage
  const keyUsage: string[] = [];
  const keyUsageExt = cert.getExtension('keyUsage');
  if (keyUsageExt) {
    const ku = keyUsageExt as unknown as Record<string, boolean>;
    if (ku.digitalSignature) keyUsage.push('digitalSignature');
    if (ku.nonRepudiation) keyUsage.push('nonRepudiation');
    if (ku.keyEncipherment) keyUsage.push('keyEncipherment');
    if (ku.dataEncipherment) keyUsage.push('dataEncipherment');
    if (ku.keyAgreement) keyUsage.push('keyAgreement');
    if (ku.keyCertSign) keyUsage.push('keyCertSign');
    if (ku.cRLSign) keyUsage.push('cRLSign');
  }

  // Extract extended key usage
  const extKeyUsage: string[] = [];
  const extKeyUsageExt = cert.getExtension('extKeyUsage');
  if (extKeyUsageExt) {
    const eku = extKeyUsageExt as unknown as Record<string, boolean>;
    if (eku.serverAuth) extKeyUsage.push('serverAuth');
    if (eku.clientAuth) extKeyUsage.push('clientAuth');
    if (eku.codeSigning) extKeyUsage.push('codeSigning');
    if (eku.emailProtection) extKeyUsage.push('emailProtection');
    if (eku.timeStamping) extKeyUsage.push('timeStamping');
  }

  // Extract SANs
  const subjectAltNames: Array<{ type: string; value: string }> = [];
  const sanExt = cert.getExtension('subjectAltName');
  if (sanExt && (sanExt as { altNames?: Array<{ type: number; value?: string; ip?: string }> }).altNames) {
    for (const alt of (sanExt as { altNames: Array<{ type: number; value?: string; ip?: string }> }).altNames) {
      let type = 'unknown';
      switch (alt.type) {
        case 1: type = 'email'; break;
        case 2: type = 'dns'; break;
        case 6: type = 'uri'; break;
        case 7: type = 'ip'; break;
      }
      subjectAltNames.push({ type, value: alt.value || alt.ip || '' });
    }
  }

  // Extract basic constraints
  const basicConstraints = cert.getExtension('basicConstraints') as { cA?: boolean; pathLenConstraint?: number } | null;

  // Get public key info
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  const publicKeySize = publicKey.n ? publicKey.n.bitLength() : undefined;

  return {
    serialNumber: cert.serialNumber,
    version: cert.version + 1, // forge uses 0-indexed version
    subject: extractAttributes(cert.subject.attributes),
    issuer: extractAttributes(cert.issuer.attributes),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    fingerprint: calculateFingerprint(cert),
    sha1Fingerprint: calculateSHA1Fingerprint(cert),
    isCA: basicConstraints?.cA || false,
    pathLength: basicConstraints?.pathLenConstraint,
    keyUsage,
    extKeyUsage,
    subjectAltNames,
    signatureAlgorithm: cert.signatureOid,
    publicKeyAlgorithm: 'RSA', // forge only supports RSA
    publicKeySize,
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
 * Check if certificate is valid (within validity period)
 */
export function isCertificateValid(certPem: string): boolean {
  const cert = pki.certificateFromPem(certPem);
  const now = new Date();
  return now >= cert.validity.notBefore && now <= cert.validity.notAfter;
}

/**
 * Get days until certificate expiration
 */
export function getDaysUntilExpiration(certPem: string): number {
  const cert = pki.certificateFromPem(certPem);
  const now = new Date();
  const diff = cert.validity.notAfter.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Generate a Certificate Revocation List (CRL)
 */
export function generateCRL(
  issuerCert: string,
  issuerKey: string,
  revokedCerts: Array<{
    serialNumber: string;
    revocationDate: Date;
    reason?: 'unspecified' | 'keyCompromise' | 'cACompromise' | 'affiliationChanged' |
      'superseded' | 'cessationOfOperation' | 'certificateHold' | 'removeFromCRL' |
      'privilegeWithdrawn' | 'aACompromise';
  }>,
  options: {
    validityDays?: number;
    crlNumber?: number;
  } = {}
): { crl: string; thisUpdate: Date; nextUpdate: Date } {
  const { validityDays = 30, crlNumber = 1 } = options;

  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  const crl = forge.pki.createCertificateRevocationList();

  crl.setIssuer(issuerCertObj.subject);

  const thisUpdate = new Date();
  const nextUpdate = new Date();
  nextUpdate.setDate(nextUpdate.getDate() + validityDays);

  crl.thisUpdate = thisUpdate;
  crl.nextUpdate = nextUpdate;

  // Add CRL extensions
  // Note: setExtensions exists at runtime but not in TypeScript types
  (crl as unknown as { setExtensions: (exts: unknown[]) => void }).setExtensions([
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes(),
    },
    {
      name: 'cRLNumber',
      value: crlNumber.toString(),
    },
  ]);

  // Add revoked certificates
  for (const revoked of revokedCerts) {
    const entry: {
      serialNumber: string;
      revocationDate: Date;
      reason?: { name: string; value: string };
    } = {
      serialNumber: revoked.serialNumber,
      revocationDate: revoked.revocationDate,
    };

    if (revoked.reason) {
      entry.reason = { name: 'reasonCode', value: revoked.reason };
    }

    crl.addRevokedCertificate(entry);
  }

  // Sign CRL
  crl.sign(issuerKeyObj, md.sha256.create());

  return {
    crl: forge.pki.crlToPem(crl),
    thisUpdate,
    nextUpdate,
  };
}

/**
 * Parse CRL and extract information
 */
export function parseCRL(crlPem: string): {
  issuer: Record<string, string>;
  thisUpdate: Date;
  nextUpdate: Date;
  revokedCertificates: Array<{ serialNumber: string; revocationDate: Date; reason?: string }>;
} {
  const crl = forge.pki.certificationRequestFromPem(crlPem); // forge doesn't have CRL parser
  // For now, return empty - would need custom ASN.1 parsing
  return {
    issuer: {},
    thisUpdate: new Date(),
    nextUpdate: new Date(),
    revokedCertificates: [],
  };
}

/**
 * Generate OCSP response
 */
export function generateOCSPResponse(
  issuerCert: string,
  issuerKey: string,
  serialNumber: string,
  status: 'good' | 'revoked' | 'unknown',
  revocationTime?: Date
): string {
  // OCSP response generation requires ASN.1 construction
  // This is a simplified implementation
  const response = {
    responseStatus: status === 'good' ? 0 : status === 'revoked' ? 1 : 2,
    serialNumber,
    certStatus: status,
    revocationTime: revocationTime?.toISOString(),
    thisUpdate: new Date().toISOString(),
    nextUpdate: new Date(Date.now() + 86400000).toISOString(), // 24 hours
  };

  return Buffer.from(JSON.stringify(response)).toString('base64');
}
