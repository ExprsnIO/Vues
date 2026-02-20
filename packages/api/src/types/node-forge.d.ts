import 'node-forge';

declare module 'node-forge' {
  namespace pki {
    // CRL reason type
    interface CRLReason {
      name: string;
      value: string;
    }

    // CRL interface
    interface CertificateRevocationList {
      setIssuer(issuer: Certificate['subject']): void;
      thisUpdate: Date;
      nextUpdate: Date;
      addRevokedCertificate(revokedCert: {
        serialNumber: string;
        revocationDate: Date;
        reason?: CRLReason;
      }): void;
      sign(privateKey: PrivateKey, md: md.MessageDigest): void;
    }

    // Create CRL function
    function createCertificateRevocationList(): CertificateRevocationList;

    // CRL to PEM function
    function crlToPem(crl: CertificateRevocationList): string;

    // Extended certificate field interface for extensions
    interface ExtensionField {
      name: string;
      critical?: boolean;
      // Basic Constraints
      cA?: boolean;
      pathLenConstraint?: number;
      // Subject/Authority Key Identifier
      keyIdentifier?: string;
      // Key Usage
      digitalSignature?: boolean;
      nonRepudiation?: boolean;
      keyEncipherment?: boolean;
      dataEncipherment?: boolean;
      keyAgreement?: boolean;
      keyCertSign?: boolean;
      cRLSign?: boolean;
      encipherOnly?: boolean;
      decipherOnly?: boolean;
      // Extended Key Usage
      serverAuth?: boolean;
      clientAuth?: boolean;
      codeSigning?: boolean;
      emailProtection?: boolean;
      timeStamping?: boolean;
      OCSPSigning?: boolean;
      // Subject Alternative Name
      altNames?: Array<{
        type: number;
        value?: string;
        ip?: string;
      }>;
    }

    // Override setExtensions to accept ExtensionField[]
    interface Certificate {
      setExtensions(extensions: ExtensionField[]): void;
      getExtension(name: string): ExtensionField | null;
    }
  }
}
