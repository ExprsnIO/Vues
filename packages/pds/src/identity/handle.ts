/**
 * Handle validation and resolution for ATProto
 *
 * Handles are domain names that resolve to DIDs.
 * Format: [subdomain.]domain.tld
 */

/**
 * Reserved handles that cannot be registered
 */
const RESERVED_HANDLES = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'blog',
  'cdn',
  'config',
  'dashboard',
  'dev',
  'docs',
  'email',
  'ftp',
  'help',
  'host',
  'info',
  'localhost',
  'mail',
  'moderator',
  'news',
  'null',
  'oauth',
  'pop',
  'postmaster',
  'root',
  'security',
  'server',
  'smtp',
  'ssl',
  'staff',
  'staging',
  'static',
  'support',
  'system',
  'test',
  'undefined',
  'webmaster',
  'www',
  'xrpc',
]);

/**
 * Validate a handle string
 *
 * Rules:
 * - Must be a valid domain name
 * - 1-253 characters total
 * - Each label 1-63 characters
 * - Labels contain only a-z, 0-9, hyphen
 * - Labels cannot start/end with hyphen
 * - At least 2 labels (domain.tld)
 */
export function isValidHandle(handle: string): boolean {
  // Length check
  if (handle.length < 1 || handle.length > 253) {
    return false;
  }

  // Split into labels
  const labels = handle.toLowerCase().split('.');

  // Need at least 2 labels
  if (labels.length < 2) {
    return false;
  }

  for (const label of labels) {
    // Label length
    if (label.length < 1 || label.length > 63) {
      return false;
    }

    // Label characters
    if (!/^[a-z0-9-]+$/.test(label)) {
      return false;
    }

    // Cannot start/end with hyphen
    if (label.startsWith('-') || label.endsWith('-')) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a handle is reserved
 */
export function isReservedHandle(handle: string): boolean {
  const firstLabel = handle.toLowerCase().split('.')[0];
  return RESERVED_HANDLES.has(firstLabel);
}

/**
 * Normalize a handle (lowercase, trim)
 */
export function normalizeHandle(handle: string): string {
  return handle.toLowerCase().trim();
}

/**
 * Check if handle belongs to a domain
 */
export function handleBelongsToDomain(handle: string, domain: string): boolean {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedDomain = normalizeHandle(domain);

  // Handle could be subdomain.domain.tld or domain.tld
  return (
    normalizedHandle === normalizedDomain ||
    normalizedHandle.endsWith(`.${normalizedDomain}`)
  );
}

/**
 * Extract subdomain from handle if it belongs to domain
 */
export function extractSubdomain(handle: string, domain: string): string | null {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedDomain = normalizeHandle(domain);

  if (normalizedHandle === normalizedDomain) {
    return null;
  }

  if (normalizedHandle.endsWith(`.${normalizedDomain}`)) {
    const subdomain = normalizedHandle.slice(
      0,
      normalizedHandle.length - normalizedDomain.length - 1
    );
    return subdomain;
  }

  return null;
}

/**
 * Create a full handle from subdomain and domain
 */
export function createHandle(subdomain: string, domain: string): string {
  return `${subdomain.toLowerCase()}.${domain.toLowerCase()}`;
}

/**
 * Validate handle for registration
 */
export interface HandleValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

export function validateHandleForRegistration(
  handle: string,
  domain: string
): HandleValidationResult {
  const normalized = normalizeHandle(handle);

  if (!isValidHandle(normalized)) {
    return {
      valid: false,
      error: 'Invalid handle format',
    };
  }

  // Check if handle belongs to our domain
  if (!handleBelongsToDomain(normalized, domain)) {
    return {
      valid: false,
      error: `Handle must be under ${domain}`,
    };
  }

  // Check reserved
  const subdomain = extractSubdomain(normalized, domain);
  if (subdomain && isReservedHandle(subdomain)) {
    return {
      valid: false,
      error: 'This handle is reserved',
    };
  }

  // Check length of subdomain
  if (subdomain && subdomain.length < 3) {
    return {
      valid: false,
      error: 'Handle must be at least 3 characters',
    };
  }

  return {
    valid: true,
    normalized,
  };
}

/**
 * Handle resolution via DNS TXT record
 * Format: _atproto.handle.domain TXT "did=did:web:..."
 */
export async function resolveHandleViaDns(handle: string): Promise<string | null> {
  // This would use DNS lookup in real implementation
  // For now, return null (not resolved)
  console.log(`DNS resolution for handle: ${handle}`);
  return null;
}

/**
 * Handle resolution via HTTP .well-known
 * URL: https://handle.domain/.well-known/atproto-did
 */
export async function resolveHandleViaHttp(handle: string): Promise<string | null> {
  try {
    const url = `https://${handle}/.well-known/atproto-did`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const did = text.trim();

    // Validate DID format
    if (did.startsWith('did:')) {
      return did;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve handle to DID using both methods
 */
export async function resolveHandle(handle: string): Promise<string | null> {
  // Try DNS first (preferred)
  const dnsDid = await resolveHandleViaDns(handle);
  if (dnsDid) {
    return dnsDid;
  }

  // Fall back to HTTP
  return resolveHandleViaHttp(handle);
}
