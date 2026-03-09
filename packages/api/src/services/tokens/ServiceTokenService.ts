/**
 * Service Token Service
 * Service-to-service authentication using certificates and tokens
 */

import * as forge from 'node-forge';
import { createHash } from 'crypto';
import { db } from '../../db/index.js';
import { actorRepos, caEntityCertificates, apiTokens } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { TokenService } from './TokenService.js';
import { certificateManager } from '../ca/CertificateManager.js';
import { CAAuditService } from '../ca/CAAuditService.js';

const CA_ENCRYPTION_KEY = process.env.CA_ENCRYPTION_KEY || 'development-key-change-in-production';

export interface ServiceAccountResult {
  did: string;
  handle: string;
  token: string;
  tokenId: string;
  certificate: {
    id: string;
    pem: string;
    privateKey: string;
    fingerprint: string;
    validUntil: Date;
  };
}

export interface ServiceAssertionPayload {
  iss: string; // Issuer DID
  sub: string; // Subject DID (same as iss for service)
  aud: string; // Target service
  scope: string; // Space-separated scopes
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expiration (Unix timestamp)
  jti: string; // JWT ID (unique identifier)
}

export class ServiceTokenService {
  /**
   * Create a service account with certificate and long-lived token
   */
  static async createServiceAccount(options: {
    serviceName: string;
    organizationId?: string;
    scopes: string[];
    validityDays?: number;
  }): Promise<ServiceAccountResult> {
    const handle = `service-${options.serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const validityDays = options.validityDays || 730; // 2 years default

    // Create certificate for service
    const certResult = await certificateManager.issueEntityCertificate({
      commonName: `Service: ${options.serviceName}`,
      type: 'client',
      organization: options.organizationId ? undefined : 'Exprsn Services',
      validityDays,
      intermediateId: undefined, // Use root CA for services
    });

    // Generate DID from certificate fingerprint
    const didSuffix = createHash('sha256')
      .update(certResult.fingerprint)
      .digest('hex')
      .substring(0, 24);
    const did = `did:exprsn:svc${didSuffix}`;

    // Store service account
    // Use the certificate's public key for signing verification
    const certForKeys = forge.pki.certificateFromPem(certResult.certificate);
    const publicKeyPem = forge.pki.publicKeyToPem(certForKeys.publicKey);

    await db.insert(actorRepos).values({
      did,
      handle,
      signingKeyPublic: publicKeyPem,
      signingKeyPrivate: certResult.privateKey, // Use cert private key
      didMethod: 'exprn',
      certificateId: certResult.id,
      isService: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create long-lived service token
    const tokenResult = await TokenService.createToken({
      ownerDid: did,
      name: `${options.serviceName} Service Token`,
      description: `Auto-generated service token for ${options.serviceName}`,
      tokenType: 'service',
      scopes: options.scopes,
      certificateId: certResult.id,
      expiresInDays: validityDays,
    });

    await CAAuditService.log({
      eventType: 'token.issued',
      subjectDid: did,
      performedBy: 'system',
      certificateId: certResult.id,
      details: {
        serviceName: options.serviceName,
        scopes: options.scopes,
        handle,
      },
    });

    // Parse certificate to get validity
    const cert = forge.pki.certificateFromPem(certResult.certificate);

    return {
      did,
      handle,
      token: tokenResult.token,
      tokenId: tokenResult.tokenId,
      certificate: {
        id: certResult.id,
        pem: certResult.certificate,
        privateKey: certResult.privateKey,
        fingerprint: certResult.fingerprint,
        validUntil: cert.validity.notAfter,
      },
    };
  }

  /**
   * Create a JWT assertion for service-to-service authentication
   */
  static async createServiceAssertion(options: {
    serviceDid: string;
    privateKeyPem: string;
    targetService: string;
    scopes: string[];
    validitySeconds?: number;
  }): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (options.validitySeconds || 300); // 5 minutes default

    const payload: ServiceAssertionPayload = {
      iss: options.serviceDid,
      sub: options.serviceDid,
      aud: options.targetService,
      scope: options.scopes.join(' '),
      iat: now,
      exp,
      jti: nanoid(),
    };

    // Create JWT header
    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: options.serviceDid,
    };

    // Encode header and payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with private key
    const privateKey = forge.pki.privateKeyFromPem(options.privateKeyPem);
    const md = forge.md.sha256.create();
    md.update(signingInput, 'utf8');
    const signature = privateKey.sign(md);
    const encodedSignature = base64UrlEncode(signature);

    return `${signingInput}.${encodedSignature}`;
  }

  /**
   * Verify a service assertion JWT
   */
  static async verifyServiceAssertion(assertion: string): Promise<ServiceAssertionPayload> {
    const parts = assertion.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const encodedHeader = parts[0]!;
    const encodedPayload = parts[1]!;
    const encodedSignature = parts[2]!;

    // Decode and parse
    const _header = JSON.parse(base64UrlDecode(encodedHeader));
    const payload: ServiceAssertionPayload = JSON.parse(base64UrlDecode(encodedPayload));

    // Validate claims
    const now = Math.floor(Date.now() / 1000);

    if (!payload.iss || !payload.iss.startsWith('did:exprsn:')) {
      throw new Error('Invalid issuer');
    }

    if (payload.exp < now) {
      throw new Error('Token expired');
    }

    if (payload.iat > now + 60) { // Allow 60 seconds clock skew
      throw new Error('Token issued in the future');
    }

    // Get certificate for service DID
    const [account] = await db.select()
      .from(actorRepos)
      .where(eq(actorRepos.did, payload.iss))
      .limit(1);

    if (!account || !account.certificateId) {
      throw new Error('Service account not found or no certificate');
    }

    const [cert] = await db.select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, account.certificateId))
      .limit(1);

    if (!cert || cert.status !== 'active') {
      throw new Error('Certificate not found or revoked');
    }

    // Verify signature
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const certificate = forge.pki.certificateFromPem(cert.certificate);
    const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;

    const md = forge.md.sha256.create();
    md.update(signingInput, 'utf8');
    const signature = base64UrlDecode(encodedSignature);

    const valid = publicKey.verify(md.digest().bytes(), signature);
    if (!valid) {
      throw new Error('Invalid signature');
    }

    return payload;
  }

  /**
   * Exchange a service assertion for an access token
   */
  static async exchangeAssertion(assertion: string): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    scope: string;
  }> {
    const payload = await this.verifyServiceAssertion(assertion);

    // Create short-lived access token
    const accessToken = nanoid(64);
    const expiresIn = 3600; // 1 hour

    // Store the token (you might want to use Redis for short-lived tokens)
    // For now, we'll use the apiTokens table with short expiry
    const tokenHash = createHash('sha256').update(accessToken).digest('hex');

    await db.insert(apiTokens).values({
      id: nanoid(),
      tokenHash,
      tokenPrefix: accessToken.substring(0, 8),
      name: `Exchange token for ${payload.iss}`,
      ownerDid: payload.iss,
      tokenType: 'service',
      scopes: payload.scope.split(' '),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      status: 'active',
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      scope: payload.scope,
    };
  }

  /**
   * Get service account by DID
   */
  static async getServiceAccount(did: string): Promise<{
    did: string;
    handle: string;
    certificateId: string | null;
    tokenCount: number;
    createdAt: Date;
  } | null> {
    const [account] = await db.select()
      .from(actorRepos)
      .where(eq(actorRepos.did, did))
      .limit(1);

    if (!account || !account.isService) {
      return null;
    }

    // Count active tokens
    const tokens = await db.select()
      .from(apiTokens)
      .where(eq(apiTokens.ownerDid, did));

    return {
      did: account.did,
      handle: account.handle,
      certificateId: account.certificateId,
      tokenCount: tokens.filter(t => t.status === 'active').length,
      createdAt: account.createdAt,
    };
  }

  /**
   * Rotate service account credentials
   */
  static async rotateServiceCredentials(
    serviceDid: string,
    performedBy: string
  ): Promise<{
    newToken: string;
    newCertificate: {
      pem: string;
      privateKey: string;
      fingerprint: string;
    };
  }> {
    const [account] = await db.select()
      .from(actorRepos)
      .where(eq(actorRepos.did, serviceDid))
      .limit(1);

    if (!account || !account.isService) {
      throw new Error('Service account not found');
    }

    // Revoke old certificate
    if (account.certificateId) {
      await certificateManager.revokeCertificate(account.certificateId, 'superseded');
    }

    // Revoke old tokens
    await TokenService.revokeAllForUser(serviceDid, performedBy, 'Credential rotation');

    // Issue new certificate
    const newCert = await certificateManager.issueEntityCertificate({
      commonName: `Service: ${account.handle}`,
      type: 'client',
      validityDays: 730,
    });

    // Update account
    await db.update(actorRepos)
      .set({
        certificateId: newCert.id,
        updatedAt: new Date(),
      })
      .where(eq(actorRepos.did, serviceDid));

    // Get old token scopes
    const [oldToken] = await db.select()
      .from(apiTokens)
      .where(eq(apiTokens.ownerDid, serviceDid))
      .limit(1);

    const scopes = (oldToken?.scopes as string[]) || ['read:profile'];

    // Create new token
    const newToken = await TokenService.createToken({
      ownerDid: serviceDid,
      name: `${account.handle} Service Token (rotated)`,
      tokenType: 'service',
      scopes,
      certificateId: newCert.id,
      expiresInDays: 730,
    });

    await CAAuditService.log({
      eventType: 'token.rotated',
      subjectDid: serviceDid,
      performedBy,
      certificateId: newCert.id,
      details: { serviceName: account.handle },
    });

    return {
      newToken: newToken.token,
      newCertificate: {
        pem: newCert.certificate,
        privateKey: newCert.privateKey,
        fingerprint: newCert.fingerprint,
      },
    };
  }
}

// Helper functions for base64url encoding/decoding
function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}
