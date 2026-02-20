/**
 * Certificate Authority Types
 * RSA-PSS based X.509 certificate management
 */

// Certificate types
export type CertificateType = 'root' | 'intermediate' | 'client' | 'server' | 'code_signing';
export type CertificateStatus = 'active' | 'revoked' | 'expired' | 'pending';
export type RevocationReason =
  | 'unspecified'
  | 'key_compromise'
  | 'ca_compromise'
  | 'affiliation_changed'
  | 'superseded'
  | 'cessation_of_operation'
  | 'certificate_hold'
  | 'privilege_withdrawn';

/**
 * Certificate algorithm configuration
 */
export interface CertificateAlgorithm {
  name: 'RSA-PSS';
  modulusLength: 2048 | 4096;
  hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
  saltLength: number;
}

/**
 * X.509 Distinguished Name
 */
export interface DistinguishedName {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  locality?: string;
  state?: string;
  country?: string;
  email?: string;
}

/**
 * Subject Alternative Names
 */
export interface SubjectAltNames {
  dnsNames?: string[];
  ipAddresses?: string[];
  emails?: string[];
  uris?: string[];
}

/**
 * Root CA certificate
 */
export interface RootCertificate {
  id: string;
  commonName: string;
  subject: DistinguishedName;
  certificate: string; // PEM encoded
  publicKey: string; // PEM encoded
  serialNumber: string;
  fingerprint: string; // SHA-256 fingerprint
  algorithm: CertificateAlgorithm;
  notBefore: string;
  notAfter: string;
  status: CertificateStatus;
  createdAt: string;
}

/**
 * Intermediate CA certificate
 */
export interface IntermediateCertificate {
  id: string;
  rootId: string;
  commonName: string;
  subject: DistinguishedName;
  certificate: string;
  publicKey: string;
  serialNumber: string;
  fingerprint: string;
  pathLength: number;
  algorithm: CertificateAlgorithm;
  notBefore: string;
  notAfter: string;
  status: CertificateStatus;
  createdAt: string;
}

/**
 * Entity certificate (client, server, code signing)
 */
export interface EntityCertificate {
  id: string;
  issuerId: string;
  issuerType: 'root' | 'intermediate';
  subjectDid?: string; // If issued to a user
  serviceId?: string; // If issued to a service
  certType: CertificateType;
  commonName: string;
  subject: DistinguishedName;
  subjectAltNames?: SubjectAltNames;
  certificate: string;
  publicKey: string;
  serialNumber: string;
  fingerprint: string;
  algorithm: CertificateAlgorithm;
  notBefore: string;
  notAfter: string;
  status: CertificateStatus;
  revokedAt?: string;
  revocationReason?: RevocationReason;
  createdAt: string;
}

/**
 * Certificate with private key (returned on creation)
 */
export interface CertificateWithKey extends EntityCertificate {
  privateKey: string; // PEM encoded, optionally encrypted
}

/**
 * Create root certificate input
 */
export interface CreateRootCertificateInput {
  commonName: string;
  subject?: Partial<DistinguishedName>;
  validityYears?: number; // Default 20
  keySize?: 2048 | 4096; // Default 4096
}

/**
 * Create intermediate certificate input
 */
export interface CreateIntermediateCertificateInput {
  rootId: string;
  commonName: string;
  subject?: Partial<DistinguishedName>;
  validityYears?: number; // Default 10
  pathLength?: number; // Default 0
}

/**
 * Issue entity certificate input
 */
export interface IssueEntityCertificateInput {
  issuerId: string;
  certType: CertificateType;
  commonName: string;
  subject?: Partial<DistinguishedName>;
  subjectAltNames?: SubjectAltNames;
  subjectDid?: string;
  serviceId?: string;
  validityDays?: number; // Default 365
  keySize?: 2048 | 4096; // Default 2048
  privateKeyPassword?: string; // Optional encryption
}

/**
 * Revoke certificate input
 */
export interface RevokeCertificateInput {
  certificateId: string;
  reason: RevocationReason;
}

/**
 * Certificate Revocation List entry
 */
export interface CRLEntry {
  serialNumber: string;
  revokedAt: string;
  reason: RevocationReason;
}

/**
 * Certificate Revocation List
 */
export interface CertificateRevocationList {
  id: string;
  issuerId: string;
  issuerType: 'root' | 'intermediate';
  crl: string; // PEM encoded
  entries: CRLEntry[];
  thisUpdate: string;
  nextUpdate: string;
  createdAt: string;
}

/**
 * Sign data request
 */
export interface SignDataInput {
  certificateId: string;
  data: string; // Base64 encoded data to sign
  algorithm?: 'RSA-PSS';
}

/**
 * Sign data result
 */
export interface SignDataResult {
  signature: string; // Base64 encoded signature
  algorithm: string;
  certificateId: string;
}

/**
 * Verify signature request
 */
export interface VerifySignatureInput {
  certificateId?: string;
  certificate?: string; // PEM if certificateId not provided
  data: string; // Base64 encoded original data
  signature: string; // Base64 encoded signature
}

/**
 * Verify signature result
 */
export interface VerifySignatureResult {
  valid: boolean;
  certificateId?: string;
  commonName?: string;
  notBefore?: string;
  notAfter?: string;
  status?: CertificateStatus;
}

/**
 * Verify certificate chain
 */
export interface VerifyCertificateInput {
  certificate: string; // PEM encoded certificate to verify
  trustedRoots?: string[]; // PEM encoded trusted roots (uses system if not provided)
}

export interface VerifyCertificateResult {
  valid: boolean;
  chain: Array<{
    subject: string;
    issuer: string;
    serialNumber: string;
    notBefore: string;
    notAfter: string;
  }>;
  errors?: string[];
}

/**
 * Service token for service-to-service auth
 */
export interface ServiceToken {
  token: string;
  certificateId: string;
  serviceId: string;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Generate service token input
 */
export interface GenerateServiceTokenInput {
  certificateId: string;
  audience?: string; // Target service
  expiresIn?: number; // Seconds, default 3600
}
