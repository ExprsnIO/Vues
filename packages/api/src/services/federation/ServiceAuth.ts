import crypto from 'crypto';
import { signData, verifySignature, parseCertificate, isCertificateValid, verifyCertificateChain } from '../ca/crypto.js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

/**
 * Service authentication headers
 */
export interface ServiceAuthHeaders {
  'X-Exprsn-Certificate': string;
  'X-Exprsn-Signature': string;
  'X-Exprsn-Timestamp': string;
  'X-Exprsn-Nonce': string;
}

/**
 * Authenticated request information
 */
export interface AuthenticatedRequest {
  certificateId: string;
  serviceId?: string;
  subjectDid?: string;
  commonName: string;
  organization?: string;
  timestamp: Date;
  nonce: string;
}

/**
 * Service auth configuration
 */
export interface ServiceAuthConfig {
  db: PostgresJsDatabase<typeof schema>;
  timestampWindowMs?: number; // Max age of request timestamp
  nonceExpiryMs?: number; // How long to store nonces for replay protection
}

/**
 * Nonce store for replay protection
 */
const nonceStore = new Map<string, number>();

/**
 * Service-to-service authentication using Exprsn CA certificates
 */
export class ServiceAuth {
  private db: PostgresJsDatabase<typeof schema>;
  private timestampWindowMs: number;
  private nonceExpiryMs: number;
  private nonceCleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: ServiceAuthConfig) {
    this.db = config.db;
    this.timestampWindowMs = config.timestampWindowMs || 300000; // 5 minutes
    this.nonceExpiryMs = config.nonceExpiryMs || 600000; // 10 minutes

    // Start nonce cleanup
    this.startNonceCleanup();
  }

  /**
   * Create authentication headers for outgoing requests
   */
  async createAuthHeaders(
    certificateId: string,
    privateKey: string,
    method: string,
    path: string,
    body?: unknown
  ): Promise<ServiceAuthHeaders> {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomBytes(16).toString('hex');

    // Create signature payload
    const payload = this.createSignaturePayload(method, path, timestamp, nonce, body);

    // Sign the payload
    const signature = signData(payload, privateKey);

    return {
      'X-Exprsn-Certificate': certificateId,
      'X-Exprsn-Signature': signature,
      'X-Exprsn-Timestamp': timestamp,
      'X-Exprsn-Nonce': nonce,
    };
  }

  /**
   * Verify incoming request authentication
   */
  async verifyRequest(
    headers: Record<string, string | string[] | undefined>,
    method: string,
    path: string,
    body?: unknown
  ): Promise<AuthenticatedRequest | null> {
    const certificateId = this.getHeader(headers, 'x-exprsn-certificate');
    const signature = this.getHeader(headers, 'x-exprsn-signature');
    const timestamp = this.getHeader(headers, 'x-exprsn-timestamp');
    const nonce = this.getHeader(headers, 'x-exprsn-nonce');

    if (!certificateId || !signature || !timestamp || !nonce) {
      return null;
    }

    // Verify timestamp is within acceptable window
    const timestampDate = new Date(timestamp);
    const now = Date.now();
    const timestampMs = timestampDate.getTime();

    if (isNaN(timestampMs) || Math.abs(now - timestampMs) > this.timestampWindowMs) {
      console.warn('Request timestamp outside acceptable window');
      return null;
    }

    // Check for replay attack (nonce reuse)
    if (this.isNonceUsed(nonce)) {
      console.warn('Nonce already used - possible replay attack');
      return null;
    }

    // Look up certificate
    const cert = await this.getCertificate(certificateId);
    if (!cert) {
      console.warn(`Certificate not found: ${certificateId}`);
      return null;
    }

    // Verify certificate is valid
    if (!isCertificateValid(cert.certificate)) {
      console.warn(`Certificate expired or not yet valid: ${certificateId}`);
      return null;
    }

    // Verify certificate chain
    const chainValid = await this.verifyCertificateChain(cert);
    if (!chainValid) {
      console.warn(`Certificate chain validation failed: ${certificateId}`);
      return null;
    }

    // Create and verify signature payload
    const payload = this.createSignaturePayload(method, path, timestamp, nonce, body);
    const isValidSignature = verifySignature(payload, signature, cert.publicKey);

    if (!isValidSignature) {
      console.warn(`Signature verification failed for certificate: ${certificateId}`);
      return null;
    }

    // Record nonce to prevent replay
    this.recordNonce(nonce);

    // Parse certificate for info
    const certInfo = parseCertificate(cert.certificate);

    return {
      certificateId,
      serviceId: cert.serviceId || undefined,
      subjectDid: cert.subjectDid || undefined,
      commonName: certInfo.commonName,
      organization: certInfo.organization,
      timestamp: timestampDate,
      nonce,
    };
  }

  /**
   * Create signature payload
   */
  private createSignaturePayload(
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    body?: unknown
  ): string {
    const parts = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce,
    ];

    if (body !== undefined && body !== null) {
      // Canonical JSON for body
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
      parts.push(bodyHash);
    }

    return parts.join('\n');
  }

  /**
   * Get header value (handles array or string)
   */
  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | null {
    const value = headers[name] || headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0] || null;
    }
    return value || null;
  }

  /**
   * Get certificate from database
   */
  private async getCertificate(id: string): Promise<{
    certificate: string;
    publicKey: string;
    serviceId: string | null;
    subjectDid: string | null;
    issuerId: string;
    issuerType: string;
  } | null> {
    const results = await this.db
      .select()
      .from(schema.caEntityCertificates)
      .where(eq(schema.caEntityCertificates.id, id))
      .limit(1);

    const cert = results[0];
    if (!cert) {
      return null;
    }

    // Check if revoked
    if (cert.status === 'revoked') {
      return null;
    }

    return {
      certificate: cert.certificate,
      publicKey: cert.publicKey,
      serviceId: cert.serviceId,
      subjectDid: cert.subjectDid,
      issuerId: cert.issuerId,
      issuerType: cert.issuerType,
    };
  }

  /**
   * Verify certificate chain back to root
   */
  private async verifyCertificateChain(cert: {
    certificate: string;
    issuerId: string;
    issuerType: string;
  }): Promise<boolean> {
    const chain: string[] = [];

    // Get issuer certificate
    if (cert.issuerType === 'intermediate') {
      const intermediates = await this.db
        .select()
        .from(schema.caIntermediateCertificates)
        .where(eq(schema.caIntermediateCertificates.id, cert.issuerId))
        .limit(1);

      const intermediate = intermediates[0];
      if (!intermediate) {
        return false;
      }

      if (intermediate.status !== 'active') {
        return false;
      }

      chain.push(intermediate.certificate);

      // Get root certificate
      const roots = await this.db
        .select()
        .from(schema.caRootCertificates)
        .where(eq(schema.caRootCertificates.id, intermediate.rootId))
        .limit(1);

      const root = roots[0];
      if (!root) {
        return false;
      }

      if (root.status !== 'active') {
        return false;
      }

      chain.push(root.certificate);
    } else {
      // Issued directly by root
      const roots = await this.db
        .select()
        .from(schema.caRootCertificates)
        .where(eq(schema.caRootCertificates.id, cert.issuerId))
        .limit(1);

      const root = roots[0];
      if (!root) {
        return false;
      }

      if (root.status !== 'active') {
        return false;
      }

      chain.push(root.certificate);
    }

    return verifyCertificateChain(cert.certificate, chain);
  }

  /**
   * Check if nonce has been used
   */
  private isNonceUsed(nonce: string): boolean {
    return nonceStore.has(nonce);
  }

  /**
   * Record nonce as used
   */
  private recordNonce(nonce: string): void {
    nonceStore.set(nonce, Date.now());
  }

  /**
   * Start periodic nonce cleanup
   */
  private startNonceCleanup(): void {
    if (this.nonceCleanupInterval) {
      clearInterval(this.nonceCleanupInterval);
    }

    this.nonceCleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.nonceExpiryMs;
      for (const [nonce, timestamp] of nonceStore) {
        if (timestamp < cutoff) {
          nonceStore.delete(nonce);
        }
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Stop nonce cleanup
   */
  stopNonceCleanup(): void {
    if (this.nonceCleanupInterval) {
      clearInterval(this.nonceCleanupInterval);
      this.nonceCleanupInterval = null;
    }
  }

  /**
   * Create Hono middleware for service authentication
   */
  middleware() {
    return async (c: { req: { method: string; path: string; header: (name: string) => string | undefined }; set: (key: string, value: unknown) => void; json: (data: unknown, status?: number) => Response }, next: () => Promise<void>) => {
      const headers: Record<string, string | undefined> = {
        'x-exprsn-certificate': c.req.header('x-exprsn-certificate'),
        'x-exprsn-signature': c.req.header('x-exprsn-signature'),
        'x-exprsn-timestamp': c.req.header('x-exprsn-timestamp'),
        'x-exprsn-nonce': c.req.header('x-exprsn-nonce'),
      };

      // Skip auth if no certificate header
      if (!headers['x-exprsn-certificate']) {
        return next();
      }

      let body: unknown;
      try {
        const contentType = c.req.header('content-type');
        if (contentType?.includes('application/json')) {
          body = await (c.req as unknown as { json: () => Promise<unknown> }).json();
        }
      } catch {
        // No body or not JSON
      }

      const auth = await this.verifyRequest(
        headers as Record<string, string>,
        c.req.method,
        c.req.path,
        body
      );

      if (!auth) {
        return c.json({ error: 'Unauthorized', message: 'Service authentication failed' }, 401);
      }

      // Attach auth info to context
      c.set('serviceAuth', auth);

      return next();
    };
  }
}

export default ServiceAuth;
