/**
 * TID (Timestamp Identifier) generation for ATProto
 *
 * TIDs are 13-character base32-sortable identifiers that encode:
 * - Microsecond timestamp (53 bits)
 * - Clock ID / random bits (10 bits)
 *
 * Format: [timestamp][clockid] encoded in base32-sortable
 */

// Base32-sortable alphabet (case-insensitive, no ambiguous chars)
const BASE32_SORTABLE = '234567abcdefghijklmnopqrstuvwxyz';

let lastTimestamp = 0;
let clockId = Math.floor(Math.random() * 1024);

/**
 * Generate a new TID
 * Guaranteed to be unique and monotonically increasing
 */
export function generateTid(): string {
  let timestamp = Date.now() * 1000; // Convert to microseconds

  // Ensure monotonically increasing
  if (timestamp <= lastTimestamp) {
    timestamp = lastTimestamp + 1;
  }
  lastTimestamp = timestamp;

  // Rotate clock ID occasionally
  clockId = (clockId + 1) % 1024;

  // Combine timestamp (53 bits) and clockId (10 bits) = 63 bits
  // We'll encode as 13 base32 characters (65 bits, 2 bits unused)
  const combined = BigInt(timestamp) * BigInt(1024) + BigInt(clockId);

  return encodeBase32Sortable(combined, 13);
}

/**
 * Parse a TID back to its components
 */
export function parseTid(tid: string): { timestamp: number; clockId: number } {
  const combined = decodeBase32Sortable(tid);
  const clockId = Number(combined % BigInt(1024));
  const timestamp = Number(combined / BigInt(1024));

  return {
    timestamp: Math.floor(timestamp / 1000), // Convert back to milliseconds
    clockId,
  };
}

/**
 * Check if a string is a valid TID
 */
export function isValidTid(tid: string): boolean {
  if (tid.length !== 13) return false;

  for (const char of tid.toLowerCase()) {
    if (!BASE32_SORTABLE.includes(char)) {
      return false;
    }
  }

  return true;
}

/**
 * Compare two TIDs (for sorting)
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareTids(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Get the timestamp from a TID as a Date
 */
export function tidToDate(tid: string): Date {
  const { timestamp } = parseTid(tid);
  return new Date(timestamp);
}

// Encoding helpers

function encodeBase32Sortable(value: bigint, length: number): string {
  let result = '';
  let remaining = value;

  for (let i = 0; i < length; i++) {
    const idx = Number(remaining % BigInt(32));
    result = BASE32_SORTABLE[idx] + result;
    remaining = remaining / BigInt(32);
  }

  return result;
}

function decodeBase32Sortable(str: string): bigint {
  let result = BigInt(0);
  const lower = str.toLowerCase();

  for (const char of lower) {
    const idx = BASE32_SORTABLE.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32-sortable character: ${char}`);
    }
    result = result * BigInt(32) + BigInt(idx);
  }

  return result;
}

/**
 * Generate a record key (rkey)
 * By default, this is just a TID
 */
export function generateRkey(): string {
  return generateTid();
}

/**
 * Special rkey for singleton records (like profile)
 */
export const RKEY_SELF = 'self';
