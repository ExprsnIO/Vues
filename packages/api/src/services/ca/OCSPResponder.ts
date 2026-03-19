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
import { redis } from '../../cache/redis.js';

const CA_ENCRYPTION_KEY = process.env.CA_ENCRYPTION_KEY || 'development-key-change-in-production';

// Cache configuration
const OCSP_CACHE_PREFIX = 'ocsp:status:';
const OCSP_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours (matches RESPONSE_VALIDITY_HOURS)

// Cache statistics
let cacheHits = 0;
let cacheMisses = 0;

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

// OCSP request logging table (in-memory for now, could be persisted to DB)
let ocspRequestLog: Array<{
  id: string;
  serialNumber: string;
  status: OCSPCertStatus;
  requestedAt: Date;
  responseTime: number;
  clientIp?: string;
}> = [];

// OCSP responder enabled state
let ocspEnabled = true;

// Max log entries to keep
const MAX_LOG_ENTRIES = 10000;

export class OCSPResponder {
  private static RESPONSE_VALIDITY_HOURS = 24;

  /**
   * Parse an OCSP request from DER format
   */
  static parseOCSPRequest(derBuffer: Buffer): OCSPRequest {
    try {
      const asn1 = forge.asn1.fromDer(forge.util.createBuffer(derBuffer.toString('binary')));

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
    const cacheKey = `${OCSP_CACHE_PREFIX}${normalizedSerial}`;

    // Check cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        cacheHits++;
        const cachedStatus = JSON.parse(cached) as {
          status: OCSPCertStatus;
          revocationTime?: string;
          revocationReason?: string;
        };
        return {
          serialNumber,
          status: cachedStatus.status,
          thisUpdate,
          nextUpdate,
          revocationTime: cachedStatus.revocationTime ? new Date(cachedStatus.revocationTime) : undefined,
          revocationReason: cachedStatus.revocationReason,
        };
      }
    } catch {
      // Cache miss or error, continue to database lookup
    }
    cacheMisses++;

    // Check entity certificates
    const [entityCert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.serialNumber, normalizedSerial))
      .limit(1);

    if (entityCert) {
      if (entityCert.status === 'revoked') {
        const result: OCSPSingleResponse = {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
          revocationTime: entityCert.revokedAt || undefined,
          revocationReason: entityCert.revocationReason || 'unspecified',
        };
        await this.cacheResponse(cacheKey, result);
        return result;
      }

      // Check if expired
      if (new Date(entityCert.notAfter) < new Date()) {
        const result: OCSPSingleResponse = {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
          revocationTime: entityCert.notAfter,
          revocationReason: 'expired',
        };
        await this.cacheResponse(cacheKey, result);
        return result;
      }

      const result: OCSPSingleResponse = {
        serialNumber,
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
      await this.cacheResponse(cacheKey, result);
      return result;
    }

    // Check intermediate certificates
    const [intermediateCert] = await db.select()
      .from(caIntermediateCertificates)
      .where(eq(caIntermediateCertificates.serialNumber, normalizedSerial))
      .limit(1);

    if (intermediateCert) {
      if (intermediateCert.status === 'revoked') {
        const result: OCSPSingleResponse = {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
        };
        await this.cacheResponse(cacheKey, result);
        return result;
      }
      const result: OCSPSingleResponse = {
        serialNumber,
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
      await this.cacheResponse(cacheKey, result);
      return result;
    }

    // Check root certificates
    const [rootCert] = await db.select()
      .from(caRootCertificates)
      .where(eq(caRootCertificates.serialNumber, normalizedSerial))
      .limit(1);

    if (rootCert) {
      if (rootCert.status === 'revoked') {
        const result: OCSPSingleResponse = {
          serialNumber,
          status: 'revoked',
          thisUpdate,
          nextUpdate,
        };
        await this.cacheResponse(cacheKey, result);
        return result;
      }
      const result: OCSPSingleResponse = {
        serialNumber,
        status: 'good',
        thisUpdate,
        nextUpdate,
      };
      await this.cacheResponse(cacheKey, result);
      return result;
    }

    // Unknown certificate - cache with shorter TTL to allow re-checking
    const result: OCSPSingleResponse = {
      serialNumber,
      status: 'unknown',
      thisUpdate,
      nextUpdate,
    };
    // Cache unknown status for 1 hour only
    await this.cacheResponse(cacheKey, result, 60 * 60);
    return result;
  }

  /**
   * Cache an OCSP response
   */
  private static async cacheResponse(
    cacheKey: string,
    response: OCSPSingleResponse,
    ttlSeconds: number = OCSP_CACHE_TTL_SECONDS
  ): Promise<void> {
    try {
      const cacheData = {
        status: response.status,
        revocationTime: response.revocationTime?.toISOString(),
        revocationReason: response.revocationReason,
      };
      await redis.setex(cacheKey, ttlSeconds, JSON.stringify(cacheData));
    } catch {
      // Cache write failed, continue without caching
    }
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

  /**
   * Get OCSP responder status (admin interface)
   */
  static async getStatus(): Promise<{
    enabled: boolean;
    totalRequests: number;
    requestsToday: number;
    requestsThisHour: number;
    cacheHitRate: number;
    cacheHits: number;
    cacheMisses: number;
    averageResponseTime: number;
    uptime: string;
  }> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    const requestsToday = ocspRequestLog.filter(r => r.requestedAt >= startOfDay).length;
    const requestsThisHour = ocspRequestLog.filter(r => r.requestedAt >= startOfHour).length;

    const avgResponseTime = ocspRequestLog.length > 0
      ? ocspRequestLog.reduce((sum, r) => sum + r.responseTime, 0) / ocspRequestLog.length
      : 0;

    // Calculate cache hit rate
    const totalCacheRequests = cacheHits + cacheMisses;
    const hitRate = totalCacheRequests > 0
      ? Math.round((cacheHits / totalCacheRequests) * 100)
      : 0;

    return {
      enabled: ocspEnabled,
      totalRequests: ocspRequestLog.length,
      requestsToday,
      requestsThisHour,
      cacheHitRate: hitRate,
      cacheHits,
      cacheMisses,
      averageResponseTime: Math.round(avgResponseTime),
      uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    };
  }

  /**
   * Get OCSP request log with pagination (admin interface)
   */
  static async getRequestLog(limit: number = 50, offset: number = 0): Promise<Array<{
    id: string;
    serialNumber: string;
    status: OCSPCertStatus;
    requestedAt: string;
    responseTime: number;
    clientIp?: string;
  }>> {
    // Sort by most recent first
    const sorted = [...ocspRequestLog].sort(
      (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()
    );

    return sorted.slice(offset, offset + limit).map(r => ({
      id: r.id,
      serialNumber: r.serialNumber,
      status: r.status,
      requestedAt: r.requestedAt.toISOString(),
      responseTime: r.responseTime,
      clientIp: r.clientIp,
    }));
  }

  /**
   * Enable or disable the OCSP responder (admin interface)
   */
  static async setEnabled(enabled: boolean): Promise<void> {
    ocspEnabled = enabled;

    // Log the change
    await CAAuditService.log({
      eventType: 'ca.config_changed',
      eventCategory: 'ca',
      performedBy: 'admin',
      severity: 'warning',
      success: true,
      details: {
        setting: 'ocsp_enabled',
        value: ocspEnabled,
      },
    });
  }

  /**
   * Check if OCSP responder is enabled
   */
  static isEnabled(): boolean {
    return ocspEnabled;
  }

  /**
   * Log an OCSP request (for analytics)
   */
  static logRequest(
    serialNumber: string,
    status: OCSPCertStatus,
    responseTime: number,
    clientIp?: string
  ): void {
    const entry = {
      id: `ocsp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      serialNumber,
      status,
      requestedAt: new Date(),
      responseTime,
      clientIp,
    };

    ocspRequestLog.push(entry);

    // Trim log if it exceeds max size
    if (ocspRequestLog.length > MAX_LOG_ENTRIES) {
      ocspRequestLog = ocspRequestLog.slice(-MAX_LOG_ENTRIES);
    }
  }

  /**
   * Invalidate cache for a specific certificate (call when certificate status changes)
   */
  static async invalidateCertificateCache(serialNumber: string): Promise<void> {
    const normalizedSerial = serialNumber.replace(/^0+/, '').toUpperCase();
    const cacheKey = `${OCSP_CACHE_PREFIX}${normalizedSerial}`;
    try {
      await redis.del(cacheKey);
    } catch {
      // Cache deletion failed, continue
    }
  }

  /**
   * Clear all OCSP response cache
   */
  static async clearCache(): Promise<number> {
    try {
      const keys = await redis.keys(`${OCSP_CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return keys.length;
    } catch {
      return 0;
    }
  }

  /**
   * Reset cache statistics
   */
  static resetCacheStats(): void {
    cacheHits = 0;
    cacheMisses = 0;
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = cacheHits + cacheMisses;
    return {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: total > 0 ? Math.round((cacheHits / total) * 100) : 0,
    };
  }
}
