/**
 * Standard CBOR Frame Encoding for AT Protocol Firehose
 *
 * AT Protocol uses two concatenated CBOR objects per frame: header || body.
 * Header: { op: 1, t: '#commit' } for data, { op: -1 } for errors
 * Uses the `cbor` package for standard CBOR (NOT @ipld/dag-cbor which is DAG-CBOR).
 */

import cbor from 'cbor';
import type { RelayEvent } from './sequencer.js';

/**
 * Frame operation codes
 */
const OP_DATA = 1;
const OP_ERROR = -1;

/**
 * Encode a standard two-part CBOR frame (header || body)
 */
export function encodeFrame(type: string, body: Record<string, unknown>): Buffer {
  const header = cbor.encode({ op: OP_DATA, t: type });
  const bodyBuf = cbor.encode(body);
  return Buffer.concat([header, bodyBuf]);
}

/**
 * Encode an error frame
 */
export function encodeErrorFrame(name: string, message: string): Buffer {
  const header = cbor.encode({ op: OP_ERROR });
  const body = cbor.encode({ error: name, message });
  return Buffer.concat([header, body]);
}

/**
 * Encode a commit frame from a RelayEvent
 */
export function encodeCommitFrame(event: RelayEvent): Buffer {
  const blocks = event.commit.blocks instanceof Uint8Array
    ? event.commit.blocks
    : new Uint8Array(0);

  const tooBig = blocks.length === 0;

  const body: Record<string, unknown> = {
    seq: event.seq,
    rebase: false,
    tooBig,
    repo: event.did,
    commit: event.commit.cid || '',
    prev: event.commit.prev || null,
    rev: event.commit.rev,
    since: event.commit.prev || null,
    blocks,
    ops: [
      {
        action: event.commit.operation,
        path: `${event.commit.collection}/${event.commit.rkey}`,
        cid: event.commit.cid || null,
      },
    ],
    blobs: event.commit.blobs || [],
    time: event.time,
  };

  return encodeFrame('#commit', body);
}

/**
 * Encode an info frame
 */
export function encodeInfoFrame(name: string, message?: string): Buffer {
  const body: Record<string, unknown> = { name };
  if (message) body.message = message;
  return encodeFrame('#info', body);
}

/**
 * Encode a tombstone frame
 */
export function encodeTombstoneFrame(seq: number, did: string, time: string): Buffer {
  return encodeFrame('#tombstone', { seq, did, time });
}

/**
 * Encode a handle frame
 */
export function encodeHandleFrame(seq: number, did: string, handle: string, time: string): Buffer {
  return encodeFrame('#handle', { seq, did, handle, time });
}

export default {
  encodeFrame,
  encodeErrorFrame,
  encodeCommitFrame,
  encodeInfoFrame,
  encodeTombstoneFrame,
  encodeHandleFrame,
};
