/**
 * DID (Decentralized Identifier) generation and management
 * Supports did:web method for self-hosted PDS
 */

/**
 * DID Document structure
 */
export interface DidDocument {
  '@context': string[];
  id: string;
  alsoKnownAs?: string[];
  verificationMethod: VerificationMethod[];
  service: Service[];
}

/**
 * Verification method in DID document
 */
export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase: string;
}

/**
 * Service endpoint in DID document
 */
export interface Service {
  id: string;
  type: string;
  serviceEndpoint: string;
}

/**
 * DID Web configuration
 */
export interface DidWebConfig {
  /** Domain name (e.g., "exprsn.io") */
  domain: string;
  /** Optional path prefix (e.g., "user") */
  pathPrefix?: string;
  /** PDS endpoint URL */
  pdsEndpoint: string;
}

/**
 * Generate a did:web identifier
 *
 * Format: did:web:domain:path:segments
 * Examples:
 * - did:web:exprsn.io (root domain)
 * - did:web:exprsn.io:user:alice (with path)
 */
export function generateDidWeb(domain: string, ...pathSegments: string[]): string {
  // Encode domain (: -> %3A for ports)
  const encodedDomain = domain.replace(/:/g, '%3A');

  if (pathSegments.length === 0) {
    return `did:web:${encodedDomain}`;
  }

  // Sanitize path segments
  const sanitizedParts = pathSegments.map((segment) =>
    segment.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  );

  return `did:web:${encodedDomain}:${sanitizedParts.join(':')}`;
}

/**
 * Parse a did:web identifier
 */
export function parseDidWeb(did: string): { domain: string; path: string[] } {
  if (!did.startsWith('did:web:')) {
    throw new Error(`Not a did:web: ${did}`);
  }

  const parts = did.slice(8).split(':');
  const domain = parts[0].replace(/%3A/g, ':');
  const path = parts.slice(1);

  return { domain, path };
}

/**
 * Get the URL where the DID document should be served
 *
 * did:web:example.com -> https://example.com/.well-known/did.json
 * did:web:example.com:user:alice -> https://example.com/user/alice/did.json
 */
export function getDidDocumentUrl(did: string): string {
  const { domain, path } = parseDidWeb(did);

  if (path.length === 0) {
    return `https://${domain}/.well-known/did.json`;
  }

  return `https://${domain}/${path.join('/')}/did.json`;
}

/**
 * Generate a DID document
 */
export function generateDidDocument(
  did: string,
  publicKeyMultibase: string,
  config: DidWebConfig,
  handle?: string
): DidDocument {
  const doc: DidDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/multikey/v1',
      'https://w3id.org/security/suites/secp256k1-2019/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#atproto`,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase,
      },
    ],
    service: [
      {
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: config.pdsEndpoint,
      },
    ],
  };

  // Add handle as alsoKnownAs
  if (handle) {
    doc.alsoKnownAs = [`at://${handle}`];
  }

  return doc;
}

/**
 * Validate a DID string
 */
export function isValidDid(did: string): boolean {
  // Basic DID format: did:method:identifier
  const match = did.match(/^did:([a-z]+):([a-zA-Z0-9._%-]+)$/);
  if (!match) return false;

  const method = match[1];

  // We support did:web and did:plc
  return method === 'web' || method === 'plc';
}

/**
 * Check if DID is a did:web
 */
export function isDidWeb(did: string): boolean {
  return did.startsWith('did:web:');
}

/**
 * Check if DID is a did:plc
 */
export function isDidPlc(did: string): boolean {
  return did.startsWith('did:plc:');
}

/**
 * Generate a handle-based did:web
 */
export function handleToDidWeb(handle: string, domain: string): string {
  // Handle format: alice.bsky.social or just alice
  const parts = handle.split('.');

  if (parts.length === 1) {
    // Simple handle, use domain path
    return generateDidWeb(domain, 'user', handle);
  }

  // Full handle - check if it matches our domain
  const handleDomain = parts.slice(1).join('.');
  if (handleDomain === domain) {
    return generateDidWeb(domain, 'user', parts[0]);
  }

  // External handle
  return generateDidWeb(domain, 'user', handle.replace(/\./g, '-'));
}

/**
 * DID service for managing DIDs
 */
export class DidService {
  constructor(private config: DidWebConfig) {}

  /**
   * Generate a new DID for a handle
   */
  generateDid(handle: string): string {
    const sanitized = handle.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    if (this.config.pathPrefix) {
      return generateDidWeb(this.config.domain, this.config.pathPrefix, sanitized);
    }

    return generateDidWeb(this.config.domain, 'user', sanitized);
  }

  /**
   * Get DID document URL
   */
  getDocumentUrl(did: string): string {
    return getDidDocumentUrl(did);
  }

  /**
   * Create DID document for a user
   */
  createDocument(
    did: string,
    publicKeyMultibase: string,
    handle?: string
  ): DidDocument {
    return generateDidDocument(did, publicKeyMultibase, this.config, handle);
  }
}

/**
 * Create a DID service
 */
export function createDidService(config: DidWebConfig): DidService {
  return new DidService(config);
}
