import { CID } from 'multiformats/cid';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';

/**
 * ATProto URI format: at://did/collection/rkey
 */
export interface AtUri {
  did: string;
  collection: string;
  rkey: string;
}

/**
 * Parse an AT URI
 */
export function parseAtUri(uri: string): AtUri {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid AT URI: ${uri}`);
  }

  return {
    did: match[1],
    collection: match[2],
    rkey: match[3],
  };
}

/**
 * Create an AT URI
 */
export function createAtUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}

/**
 * Validate AT URI format
 */
export function isValidAtUri(uri: string): boolean {
  try {
    parseAtUri(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strong reference to a record
 */
export interface StrongRef {
  uri: string;
  cid: string;
}

/**
 * Create a strong reference
 */
export function createStrongRef(uri: string, cid: CID): StrongRef {
  return {
    uri,
    cid: cid.toString(),
  };
}

/**
 * Parse a strong reference
 */
export function parseStrongRef(ref: StrongRef): { atUri: AtUri; cid: CID } {
  return {
    atUri: parseAtUri(ref.uri),
    cid: CID.parse(ref.cid),
  };
}

/**
 * Calculate CID for a record value
 */
export async function calculateRecordCid(value: unknown): Promise<CID> {
  const bytes = dagCbor.encode(value);
  const hash = await sha256.digest(bytes);
  return CID.create(1, dagCbor.code, hash);
}

/**
 * Encode a record to CBOR bytes
 */
export function encodeRecord(value: unknown): Uint8Array {
  return dagCbor.encode(value);
}

/**
 * Decode CBOR bytes to record
 */
export function decodeRecord(bytes: Uint8Array): unknown {
  return dagCbor.decode(bytes);
}

/**
 * Validate a collection NSID
 * Format: reverse-dns with at least 3 segments
 */
export function isValidCollection(collection: string): boolean {
  const parts = collection.split('.');
  if (parts.length < 3) return false;

  for (const part of parts) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(part)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a record key (rkey)
 * Must be 1-512 characters, base32-sortable or "self"
 */
export function isValidRkey(rkey: string): boolean {
  if (rkey === 'self') return true;
  if (rkey.length < 1 || rkey.length > 512) return false;
  return /^[a-z2-7]+$/.test(rkey.toLowerCase());
}

/**
 * Common record types
 */
export const RecordTypes = {
  // Bluesky types
  POST: 'app.bsky.feed.post',
  LIKE: 'app.bsky.feed.like',
  REPOST: 'app.bsky.feed.repost',
  FOLLOW: 'app.bsky.graph.follow',
  PROFILE: 'app.bsky.actor.profile',

  // Exprsn types
  VIDEO_POST: 'io.exprsn.video.post',
  VIDEO_LIKE: 'io.exprsn.video.like',
  VIDEO_COMMENT: 'io.exprsn.video.comment',
  VIDEO_FOLLOW: 'io.exprsn.video.follow',
  VIDEO_SOUND: 'io.exprsn.video.sound',
  ACTOR_PROFILE: 'io.exprsn.actor.profile',
} as const;

/**
 * Blob reference structure
 */
export interface BlobRef {
  $type: 'blob';
  ref: {
    $link: string; // CID
  };
  mimeType: string;
  size: number;
}

/**
 * Create a blob reference
 */
export function createBlobRef(cid: CID, mimeType: string, size: number): BlobRef {
  return {
    $type: 'blob',
    ref: {
      $link: cid.toString(),
    },
    mimeType,
    size,
  };
}

/**
 * Extract CID from blob reference
 */
export function extractBlobCid(ref: BlobRef): CID {
  return CID.parse(ref.ref.$link);
}
