/**
 * OCSP Responder Service
 * Online Certificate Status Protocol responder for real-time certificate validation
 */

import * as forge from 'node-forge';
import { db } from '../../db/index.js';
import {
  caEntityCertificates,
  caIntermediateCertificates,
  caRootCertificates,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { CAAuditService } from './CAAuditService.js';

const CA_ENCRYPTION_KEY = process.env.CA_ENCRYPTION_KEY || 'development-key-change-in-production';

// Helper to decrypt stored private keys
function decryptPrivateKey(encryptedKey: string, password: string): string {
  try {
    const key = forge.pki.decryptRsaPrivateKey(encryptedKey, password);
    if (!key) throw new Error('Failed to decrypt private key');
    return forge.pki.privateKeyToPem(key);
  } catch {
    return encryptedKey;
  }
}

export type OCSPCertStatus = 'good' | 'revoked' | 'unknown';

export interface OCSPRequest {
  requestList: Array<{
    serialNumber: string;
    issuerNameHash: string;
    issuerKeyHash: string;
  }>;
  nonce?: string;
}

export interface OCSPSingleResponse {
  serialNumber: string;
  status: OCSPCertStatus;
  thisUpdate: Date;
  nextUpdate: Date;
  revocationTime?: Date;
  revocationReason?: string;
  // Issuer hashes from the request (for response building)
  issuerNameHash?: string;
  issuerKeyHash?: string;
}

export interface OCSPResponse {
  responseStatus: 'successful' | 'malformedRequest' | 'internalError' | 'tryLater' | 'sigRequired' | 'unauthorized';
  responses: OCSPSingleResponse[];
  producedAt: Date;
  nonce?: string;
}

// OCSP Response status codes
const OCSP_RESPONSE_STATUS = {
  successful: 0,
  malformedRequest: 1,
  internalError: 2,
  tryLater: 3,
  sigRequired: 5,
  unauthorized: 6,
};

// Revocation reason codes
const REVOCATION_REASONS: Record<string, number> = {
  unspecified: 0,
  keyCompromise: 1,
  cACompromise: 2,
  affiliationChanged: 3,
  superseded: 4,
  cessationOfOperation: 5,
  certificateHold: 6,
  removeFromCRL: 8,
  privilegeWithdrawn: 9,
  aACompromise: 10,
};

export class OCSPResponder {
  private static RESPONSE_VALIDITY_HOURS = 24;

  /**
   * Parse an OCSP request from DER format
   */
  static parseOCSPRequest(derBuffer: Buffer): OCSPRequest {
    try {
      const asn1 = forge.asn1.fromDer(forge.util.createBuffer(derBuffer));

      const requestList: OCSPRequest['requestList'] = [];
      let nonce: string | undefined;

      // Parse TBSRequest
      // OCSPRequest ::= SEQUENCE { tbsRequest TBSRequest, ... }
      // TBSRequest ::= SEQUENCE { requestList SEQUENCE OF Request, ... }

      const tbsRequest = asn1.value[0] as forge.asn1.Asn1;
      if (tbsRequest && tbsRequest.value) {
        // Find requestList (SEQUENCE OF Request)
        for (const item of tbsRequest.value as forge.asn1.Asn1[]) {
          if (item.tagClass === forge.asn1.Class.UNIVERSAL &&
              item.type === forge.asn1.Type.SEQUENCE) {
            // This should be the requestList
            for (const request of item.value as forge.asn1.Asn1[]) {
              if (request.tagClass === forge.asn1.Class.UNIVERSAL &&
                  request.type === forge.asn1.Type.SEQUENCE) {
                // Request ::= SEQUENCE { reqCert CertID, ... }
                // CertID ::= SEQUENCE { hashAlgorithm, issuerNameHash, issuerKeyHash, serialNumber }
                const reqCert = request.value[0] as forge.asn1.Asn1;
                if (reqCert && reqCert.value && Array.isArray(reqCert.value)) {
                  const values = reqCert.value as forge.asn1.Asn1[];
                  const issuerNameHash = forge.util.bytesToHex(values[1]?.value as string || '');
                  const issuerKeyHash = forge.util.bytesToHex(values[2]?.value as string || '');
                  const serialNumberBytes = values[3]?.value as string || '';
                  const serialNumber = forge.util.bytesToHex(serialNumberBytes);

                  requestList.push({
                    serialNumber,
                    issuerNameHash,
                    issuerKeyHash,
                  });
                }
              }
            }
          }
        }

        // Look for nonce in extensions
        // Extensions are in an optional field
        for (const item of tbsRequest.value as forge.asn1.Asn1[]) {
          if (item.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC) {
            // Parse extensions
            const extensions = item.value as forge.asn1.Asn1[];
            for (const ext of extensions) {
              if (ext.value && Array.isArray(ext.value)) {
                const extValues = ext.value as forge.asn1.Asn1[];
                const oid = forge.asn1.derToOid(extValues[0]?.value as string || '');
                // Nonce OID: 1.3.6.1.5.5.7.48.1.2
                if (oid === '1.3.6.1.5.5.7.48.1.2' && extValues[1]) {
                  nonce = forge.util.bytesToHex(extValues[1].value as string);
                }
              }
            }
          }
        }
      }

      return { requestList, nonce };
    } catch (error) {
      console.error('Failed to parse OCSP request:', error);
      throw new Error('Malformed OCSP request');
    }
  }

  /**
   * Check certificate status by serial number
   */
  static async checkCertificateStatus(serialNumber: string): Promise<OCSPSingleResponse> {
    const thisUpdate = new Date();
    const nextUpdate = new Date(thisUpdate.getTime() + this.RESPONSE_VALIDITY_HOURS * 60 * 60 * 1000);

    // Normalize serial number (remove leading zeros, uppercase)
    const normalizedSerial = serialNumber.replace(/^0+/, '').toUpperCase();

    // Check entity certificates
    const [entityCert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.serialNumber, normalizedSerial))
      .limit(1);

    if (entityCert) {
      if (entityCert.status === 'revoked') {
        return {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
          revocationTime: entityCert.revokedAt || undefined,
          revocationReason: entityCert.revocationReason || 'unspecified',
        };
      }

      // Check if expired
      if (new Date(entityCert.notAfter) < new Date()) {
        return {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
          revocationTime: entityCert.notAfter,
          revocationReason: 'expired',
        };
      }

      return {
        serialNumber,
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
    }

    // Check intermediate certificates
    const [intermediateCert] = await db.select()
      .from(caIntermediateCertificates)
      .where(eq(caIntermediateCertificates.serialNumber, normalizedSerial))
      .limit(1);

    if (intermediateCert) {
      if (intermediateCert.status === 'revoked') {
        return {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
        };
      }
      return {
        serialNumber,
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
    }

    // Check root certificates
    const [rootCert] = await db.select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.serialNumber, normalizedSerial))
      .limit(1);

    if (rootCert) {
      if (rootCert.status === 'revoked') {
        return {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
        };
      }
      return {
        serialNumber,
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
    }

    return {
      serialNumber,
      status: 'unknown',
      thisUpdate,
      nextUpdate,
    };
  }

  /**
   * Generate OCSP response
   */
  static async generateResponse(request: OCSPRequest): Promise<OCSPResponse> {
    const responses: OCSPSingleResponse[] = [];

    for (const certId of request.requestList) {
      const status = await this.checkCertificateStatus(certId.serialNumber);
      // Include issuer hashes from the request for response building
      responses.push({
        ...status,
        issuerNameHash: certId.issuerNameHash,
        issuerKeyHash: certId.issuerKeyHash,
      });
    }

    return {
      responseStatus: 'successful',
      responses,
      producedAt: new Date(),
      nonce: request.nonce,
    };
  }

  /**
   * Build signed OCSP response in DER format
   */
  static async buildSignedResponse(request: OCSPRequest): Promise<Buffer> {
    // Get root CA for signing
    const [rootCA] = await db.select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.status, 'active'))
      .limit(1);

    if (!rootCA) {
      // Return error response
      return this.buildErrorResponse('internalError');
    }

    try {
      const response = await this.generateResponse(request);
      const rootCert = forge.pki.certificateFromPem(rootCA.certificate);
      const rootKey = forge.pki.privateKeyFromPem(
        decryptPrivateKey(rootCA.privateKey, CA_ENCRYPTION_KEY)
      );

      // Build BasicOCSPResponse
      // This is a simplified implementation
      const responseBytes = this.buildBasicOCSPResponse(response, rootCert, rootKey);

      // Log audit event
      await CAAuditService.log({
        eventType: 'certificate.verified',
        performedBy: 'system',
        details: {
          serialNumbers: request.requestList.map(r => r.serialNumber),
          responses: response.responses.map(r => ({ serial: r.serialNumber, status: r.status })),
        },
      });

      return responseBytes;
    } catch (error) {
      console.error('Failed to build OCSP response:', error);
      return this.buildErrorResponse('internalError');
    }
  }

  /**
   * Build BasicOCSPResponse structure
   */
  private static buildBasicOCSPResponse(
    response: OCSPResponse,
    signerCert: forge.pki.Certificate,
    signerKey: forge.pki.rsa.PrivateKey
  ): Buffer {
    // Build ResponseData
    const responseData = this.buildResponseData(response, signerCert);

    // Sign the response data
    const md = forge.md.sha256.create();
    md.update(forge.asn1.toDer(responseData).getBytes());
    const signature = signerKey.sign(md);

    // Build BasicOCSPResponse
    const basicOCSPResponse = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      responseData,
      // signatureAlgorithm
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
          forge.asn1.oidToDer('1.2.840.113549.1.1.11').getBytes()), // sha256WithRSAEncryption
      ]),
      // signature
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.BITSTRING, false,
        String.fromCharCode(0) + signature),
      // certs (optional) - include signer cert
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
          forge.pki.certificateToAsn1(signerCert),
        ]),
      ]),
    ]);

    // Wrap in OCSPResponse
    const ocspResponse = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      // responseStatus
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.ENUMERATED, false,
        String.fromCharCode(OCSP_RESPONSE_STATUS.successful)),
      // responseBytes
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
          // responseType (id-pkix-ocsp-basic)
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
            forge.asn1.oidToDer('1.3.6.1.5.5.7.48.1.1').getBytes()),
          // response
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
            forge.asn1.toDer(basicOCSPResponse).getBytes()),
        ]),
      ]),
    ]);

    return Buffer.from(forge.asn1.toDer(ocspResponse).getBytes(), 'binary');
  }

  /**
   * Build ResponseData structure
   */
  private static buildResponseData(
    response: OCSPResponse,
    responderCert: forge.pki.Certificate
  ): forge.asn1.Asn1 {
    const singleResponses: forge.asn1.Asn1[] = [];

    for (const resp of response.responses) {
      const certStatus = this.buildCertStatus(resp);

      // Use issuer hashes from request, or compute from responder cert as fallback
      let issuerNameHashBytes: string;
      let issuerKeyHashBytes: string;

      if (resp.issuerNameHash && resp.issuerKeyHash) {
        // Use hashes from the original request
        issuerNameHashBytes = forge.util.hexToBytes(resp.issuerNameHash);
        issuerKeyHashBytes = forge.util.hexToBytes(resp.issuerKeyHash);
      } else {
        // Compute from responder certificate (fallback)
        const nameHash = forge.md.sha256.create();
        nameHash.update(forge.asn1.toDer(
          forge.pki.distinguishedNameToAsn1(responderCert.subject)
        ).getBytes());
        issuerNameHashBytes = nameHash.digest().getBytes();

        const keyHash = forge.md.sha256.create();
        keyHash.update(forge.asn1.toDer(
          responderCert.publicKey as unknown as forge.asn1.Asn1
        ).getBytes());
        issuerKeyHashBytes = keyHash.digest().getBytes();
      }

      singleResponses.push(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        // certID
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
          // hashAlgorithm (SHA-256)
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
              forge.asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
          ]),
          // issuerNameHash
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
            issuerNameHashBytes),
          // issuerKeyHash
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
            issuerKeyHashBytes),
          // serialNumber
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false,
            forge.util.hexToBytes(resp.serialNumber)),
        ]),
        // certStatus
        certStatus,
        // thisUpdate
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.GENERALIZEDTIME, false,
          this.formatGeneralizedTime(resp.thisUpdate)),
        // nextUpdate (optional)
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.GENERALIZEDTIME, false,
            this.formatGeneralizedTime(resp.nextUpdate)),
        ]),
      ]));
    }

    // ResponderID - use key hash
    const keyHash = forge.md.sha1.create();
    keyHash.update(forge.asn1.toDer(responderCert.publicKey as unknown as forge.asn1.Asn1).getBytes());

    return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      // version (optional, v1 = 0)
      // responderID
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 2, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
          keyHash.digest().getBytes()),
      ]),
      // producedAt
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.GENERALIZEDTIME, false,
        this.formatGeneralizedTime(response.producedAt)),
      // responses
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, singleResponses),
    ]);
  }

  /**
   * Build CertStatus structure
   */
  private static buildCertStatus(response: OCSPSingleResponse): forge.asn1.Asn1 {
    switch (response.status) {
      case 'good':
        // [0] IMPLICIT NULL
        return forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, false, '');

      case 'revoked':
        // [1] IMPLICIT RevokedInfo
        return forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 1, true, [
          // revocationTime
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.GENERALIZEDTIME, false,
            this.formatGeneralizedTime(response.revocationTime || new Date())),
          // revocationReason (optional)
          ...(response.revocationReason ? [
            forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.ENUMERATED, false,
                String.fromCharCode(REVOCATION_REASONS[response.revocationReason] || 0)),
            ]),
          ] : []),
        ]);

      case 'unknown':
      default:
        // [2] IMPLICIT UnknownInfo (NULL)
        return forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 2, false, '');
    }
  }

  /**
   * Build error OCSP response
   */
  private static buildErrorResponse(status: keyof typeof OCSP_RESPONSE_STATUS): Buffer {
    const ocspResponse = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.ENUMERATED, false,
        String.fromCharCode(OCSP_RESPONSE_STATUS[status])),
    ]);

    return Buffer.from(forge.asn1.toDer(ocspResponse).getBytes(), 'binary');
  }

  /**
   * Format date as GeneralizedTime
   */
  private static formatGeneralizedTime(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
           `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  }

  /**
   * Simple status check (JSON-based, not ASN.1)
   */
  static async checkStatus(serialNumber: string): Promise<{
    status: OCSPCertStatus;
    thisUpdate: string;
    nextUpdate: string;
    revocationTime?: string;
    revocationReason?: string;
  }> {
    const result = await this.checkCertificateStatus(serialNumber);
    return {
      status: result.status,
      thisUpdate: result.thisUpdate.toISOString(),
      nextUpdate: result.nextUpdate.toISOString(),
      revocationTime: result.revocationTime?.toISOString(),
      revocationReason: result.revocationReason,
    };
  }
}
