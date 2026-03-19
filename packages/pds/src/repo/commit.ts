import { CID } from 'multiformats/cid';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';
import { generateTid } from './tid.js';
import * as crypto from '@atproto/crypto';
import { formatDidKey } from '@atproto/crypto';

/**
 * Commit structure for ATProto repositories
 * Version 3 format
 */
export interface Commit {
  /** DID of the repository owner */
  did: string;
  /** Commit format version (currently 3) */
  version: 3;
  /** CID of the MST root */
  data: CID;
  /** CID of the previous commit (null for initial) */
  prev: CID | null;
  /** Revision TID */
  rev: string;
  /** Signature bytes */
  sig: Uint8Array;
}

/**
 * Unsigned commit (before signing)
 */
export interface UnsignedCommit {
  did: string;
  version: 3;
  data: CID;
  prev: CID | null;
  rev: string;
}

/**
 * Serializable commit for CBOR encoding
 */
export interface CommitData {
  did: string;
  version: 3;
  data: Uint8Array;
  prev: Uint8Array | null;
  rev: string;
  sig: Uint8Array;
}

/**
 * Create an unsigned commit object
 */
export function createUnsignedCommit(
  did: string,
  dataCid: CID,
  prevCid: CID | null
): UnsignedCommit {
  return {
    did,
    version: 3,
    data: dataCid,
    prev: prevCid,
    rev: generateTid(),
  };
}

/**
 * Get bytes for signing (unsigned commit as CBOR)
 */
export function getSignBytes(commit: UnsignedCommit): Uint8Array {
  const data = {
    did: commit.did,
    version: commit.version,
    data: commit.data.bytes,
    prev: commit.prev?.bytes ?? null,
    rev: commit.rev,
  };
  return dagCbor.encode(data);
}

/**
 * Sign and finalize a commit
 */
export function signCommit(
  unsigned: UnsignedCommit,
  signature: Uint8Array
): Commit {
  return {
    ...unsigned,
    sig: signature,
  };
}

/**
 * Convert Commit to serializable format
 */
export function commitToData(commit: Commit): CommitData {
  return {
    did: commit.did,
    version: commit.version,
    data: commit.data.bytes,
    prev: commit.prev?.bytes ?? null,
    rev: commit.rev,
    sig: commit.sig,
  };
}

/**
 * Convert serializable format back to Commit
 */
export function dataToCommit(data: CommitData): Commit {
  return {
    did: data.did,
    version: data.version,
    data: CID.decode(data.data),
    prev: data.prev ? CID.decode(data.prev) : null,
    rev: data.rev,
    sig: data.sig,
  };
}

/**
 * Encode commit to CBOR bytes
 */
export function encodeCommit(commit: Commit): Uint8Array {
  return dagCbor.encode(commitToData(commit));
}

/**
 * Decode CBOR bytes to commit
 */
export function decodeCommit(bytes: Uint8Array): Commit {
  const data = dagCbor.decode(bytes) as CommitData;
  return dataToCommit(data);
}

/**
 * Create CID for a commit
 */
export async function createCommitCid(commit: Commit): Promise<CID> {
  const bytes = encodeCommit(commit);
  const hash = await sha256.digest(bytes);
  return CID.create(1, dagCbor.code, hash);
}

/**
 * Verify commit signature using @atproto/crypto
 */
export async function verifyCommitSignature(
  commit: Commit,
  publicKey: Uint8Array,
  jwtAlg: string = 'ES256K'
): Promise<boolean> {
  try {
    // Build the unsigned commit to get the bytes that were signed
    const unsigned: UnsignedCommit = {
      did: commit.did,
      version: commit.version,
      data: commit.data,
      prev: commit.prev,
      rev: commit.rev,
    };
    const signBytes = getSignBytes(unsigned);

    // Convert public key bytes to did:key format
    const didKey = formatDidKey(jwtAlg, publicKey);

    // Verify signature using @atproto/crypto
    return await crypto.verifySignature(didKey, signBytes, commit.sig);
  } catch (error) {
    console.error('[Commit] Signature verification failed:', error);
    return false;
  }
}
