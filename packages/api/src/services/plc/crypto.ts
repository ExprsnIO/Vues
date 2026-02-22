/**
 * PLC Cryptographic Operations
 * Implements signature verification and operation chain validation for did:plc
 */

import crypto from 'crypto';

/**
 * Supported key types in multibase format
 * - did:key:z6Mk... = Ed25519
 * - did:key:zQ3s... = secp256k1
 * - did:key:zDn... = P-256
 */

const MULTICODEC_ED25519_PUB = 0xed;
const MULTICODEC_SECP256K1_PUB = 0xe7;
const MULTICODEC_P256_PUB = 0x80;

/**
 * Base58btc alphabet
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode base58btc string to bytes
 */
function decodeBase58(str: string): Uint8Array {
  const bytes: number[] = [];

  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += (bytes[i] || 0) * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Handle leading zeros
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Parse multibase-encoded public key (did:key format)
 */
export function parseMultibaseKey(keyStr: string): {
  type: 'ed25519' | 'secp256k1' | 'p256';
  publicKey: Uint8Array;
} {
  // did:key:z... format - strip prefix
  let encoded = keyStr;
  if (keyStr.startsWith('did:key:')) {
    encoded = keyStr.slice(8);
  }

  // Multibase prefix 'z' = base58btc
  if (!encoded.startsWith('z')) {
    throw new Error('Only base58btc (z prefix) multibase keys are supported');
  }

  const decoded = decodeBase58(encoded.slice(1));

  if (decoded.length < 2) {
    throw new Error('Invalid multibase key: too short');
  }

  // First bytes are varint multicodec
  const multicodec = decoded[0];

  switch (multicodec) {
    case MULTICODEC_ED25519_PUB:
      return {
        type: 'ed25519',
        publicKey: decoded.slice(2), // Skip 2-byte multicodec prefix (0xed 0x01)
      };
    case MULTICODEC_SECP256K1_PUB:
      return {
        type: 'secp256k1',
        publicKey: decoded.slice(2), // Skip 2-byte multicodec prefix (0xe7 0x01)
      };
    case MULTICODEC_P256_PUB:
      return {
        type: 'p256',
        publicKey: decoded.slice(2), // Skip 2-byte multicodec prefix (0x80 0x24)
      };
    default:
      throw new Error(`Unsupported multicodec: 0x${multicodec?.toString(16)}`);
  }
}

/**
 * Create canonical JSON for signing (sorted keys, no whitespace)
 */
export function canonicalizeForSigning(data: Record<string, unknown>): string {
  return JSON.stringify(data, Object.keys(data).sort());
}

/**
 * Calculate SHA-256 hash of data
 */
export function sha256(data: string | Uint8Array): Uint8Array {
  const hash = crypto.createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }
  return new Uint8Array(hash.digest());
}

/**
 * Calculate operation CID (simplified - in production would use DAG-CBOR)
 */
export function calculateOperationCid(operation: Record<string, unknown>): string {
  // Remove signature for CID calculation
  const { sig, ...unsigned } = operation;
  const canonical = canonicalizeForSigning(unsigned);
  const hash = sha256(canonical);
  const hexHash = Buffer.from(hash).toString('hex');

  // Simplified CID format (in production would be proper CIDv1 with dag-cbor codec)
  return `bafyrei${hexHash.slice(0, 52)}`;
}

/**
 * Verify Ed25519 signature
 */
function verifyEd25519(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([
        // Ed25519 public key OID prefix
        Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]),
        Buffer.from(publicKey),
      ]),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify(null, message, keyObject, signature);
  } catch {
    return false;
  }
}

/**
 * Verify secp256k1 signature
 */
function verifySecp256k1(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    // Hash the message first (secp256k1 typically signs hashes)
    const messageHash = sha256(message);

    // Convert compressed public key to uncompressed if needed
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([
        // secp256k1 public key prefix for SPKI format
        Buffer.from([
          0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86,
          0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b,
          0x81, 0x04, 0x00, 0x0a, 0x03, 0x42, 0x00,
        ]),
        Buffer.from(publicKey.length === 33 ? decompressSecp256k1(publicKey) : publicKey),
      ]),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify('sha256', messageHash, keyObject, signature);
  } catch {
    return false;
  }
}

/**
 * Decompress secp256k1 public key (33 bytes -> 65 bytes)
 */
function decompressSecp256k1(compressed: Uint8Array): Uint8Array {
  // This is a simplified implementation
  // In production, use a proper EC library
  if (compressed.length !== 33) {
    return compressed;
  }

  // For now, return as-is if already compressed
  // Full decompression requires EC point calculation
  return compressed;
}

/**
 * Verify P-256 signature
 */
function verifyP256(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([
        // P-256 (prime256v1) public key prefix for SPKI format
        Buffer.from([
          0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
          0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
          0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
          0x42, 0x00,
        ]),
        Buffer.from(publicKey),
      ]),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify('sha256', message, keyObject, signature);
  } catch {
    return false;
  }
}

/**
 * Decode base64url signature
 */
function decodeBase64Url(str: string): Uint8Array {
  // Convert base64url to base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Verify PLC operation signature
 */
export function verifyOperationSignature(
  operation: Record<string, unknown>,
  signature: string,
  publicKey: string
): boolean {
  try {
    // Parse the public key
    const { type, publicKey: keyBytes } = parseMultibaseKey(publicKey);

    // Create unsigned operation for verification
    const { sig, ...unsigned } = operation;
    const canonical = canonicalizeForSigning(unsigned);
    const message = new Uint8Array(Buffer.from(canonical, 'utf8'));

    // Decode signature (base64url encoded)
    const signatureBytes = decodeBase64Url(signature);

    // Verify based on key type
    switch (type) {
      case 'ed25519':
        return verifyEd25519(message, signatureBytes, keyBytes);
      case 'secp256k1':
        return verifySecp256k1(message, signatureBytes, keyBytes);
      case 'p256':
        return verifyP256(message, signatureBytes, keyBytes);
      default:
        console.warn(`Unsupported key type: ${type}`);
        return false;
    }
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Verify operation is signed by one of the rotation keys
 */
export function verifyOperationSignedByRotationKey(
  operation: Record<string, unknown>,
  rotationKeys: string[]
): { valid: boolean; signingKey?: string; error?: string } {
  const signature = operation.sig as string;

  if (!signature) {
    return { valid: false, error: 'Operation has no signature' };
  }

  if (!rotationKeys || rotationKeys.length === 0) {
    return { valid: false, error: 'No rotation keys provided' };
  }

  // Try each rotation key
  for (const key of rotationKeys) {
    if (verifyOperationSignature(operation, signature, key)) {
      return { valid: true, signingKey: key };
    }
  }

  return { valid: false, error: 'Signature does not match any rotation key' };
}

/**
 * Validate operation chain (prev references)
 */
export interface OperationChainValidation {
  valid: boolean;
  errors: string[];
  operations: Array<{
    cid: string;
    type: string;
    prev: string | null;
    valid: boolean;
  }>;
}

export function validateOperationChain(
  operations: Array<{ cid: string; operation: Record<string, unknown> }>
): OperationChainValidation {
  const result: OperationChainValidation = {
    valid: true,
    errors: [],
    operations: [],
  };

  if (operations.length === 0) {
    return result;
  }

  // Sort by CID order (oldest first) - in real implementation would parse timestamps
  const sorted = [...operations].reverse();

  // Build CID set for reference checking
  const cidSet = new Set(sorted.map(op => op.cid));

  let expectedPrev: string | null = null;

  for (const { cid, operation } of sorted) {
    const opType = operation.type as string;
    const prev = operation.prev as string | null;

    const opResult = {
      cid,
      type: opType,
      prev,
      valid: true,
    };

    // First operation (genesis) must have prev = null
    if (expectedPrev === null) {
      if (opType !== 'create' && opType !== 'plc_operation') {
        // First op should be create
        if (prev !== null) {
          opResult.valid = false;
          result.errors.push(`Genesis operation ${cid} should have prev=null`);
        }
      }
    } else {
      // Subsequent operations must reference the previous CID
      if (prev !== expectedPrev) {
        opResult.valid = false;
        result.errors.push(
          `Operation ${cid} has invalid prev: expected ${expectedPrev}, got ${prev}`
        );
      }
    }

    // Verify the CID matches the operation content
    const calculatedCid = calculateOperationCid(operation);
    if (calculatedCid !== cid) {
      opResult.valid = false;
      result.errors.push(
        `Operation CID mismatch: expected ${calculatedCid}, got ${cid}`
      );
    }

    if (!opResult.valid) {
      result.valid = false;
    }

    result.operations.push(opResult);
    expectedPrev = cid;
  }

  return result;
}

/**
 * Full operation validation (signature + chain)
 */
export interface FullOperationValidation {
  valid: boolean;
  signatureValid: boolean;
  chainValid: boolean;
  signingKey?: string;
  errors: string[];
}

export async function validateOperation(
  operation: Record<string, unknown>,
  rotationKeys: string[],
  previousCid: string | null
): Promise<FullOperationValidation> {
  const result: FullOperationValidation = {
    valid: true,
    signatureValid: false,
    chainValid: false,
    errors: [],
  };

  // 1. Verify signature
  const sigResult = verifyOperationSignedByRotationKey(operation, rotationKeys);
  result.signatureValid = sigResult.valid;

  if (sigResult.valid) {
    result.signingKey = sigResult.signingKey;
  } else {
    result.valid = false;
    result.errors.push(sigResult.error || 'Signature verification failed');
  }

  // 2. Verify chain (prev reference)
  const operationPrev = operation.prev as string | null;

  if (previousCid === null) {
    // This should be a genesis operation
    if (operationPrev !== null) {
      result.valid = false;
      result.chainValid = false;
      result.errors.push('Genesis operation should have prev=null');
    } else {
      result.chainValid = true;
    }
  } else {
    // This should reference the previous operation
    if (operationPrev !== previousCid) {
      result.valid = false;
      result.chainValid = false;
      result.errors.push(`Invalid prev: expected ${previousCid}, got ${operationPrev}`);
    } else {
      result.chainValid = true;
    }
  }

  return result;
}

export default {
  parseMultibaseKey,
  canonicalizeForSigning,
  sha256,
  calculateOperationCid,
  verifyOperationSignature,
  verifyOperationSignedByRotationKey,
  validateOperationChain,
  validateOperation,
};
