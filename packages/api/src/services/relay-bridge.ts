/**
 * Relay Bridge
 *
 * Thin utility that lets any write path in the API emit a commit event to
 * both the local firehose (SyncService) and the optional RelayService.
 *
 * Usage:
 *   import { emitRepoEvent } from './services/relay-bridge.js';
 *   await emitRepoEvent(did, 'io.exprsn.video', rkey, 'create', record);
 *
 * Initialization (called once from index.ts after both services are ready):
 *   import { initRelayBridge } from './services/relay-bridge.js';
 *   initRelayBridge(relayService, syncService);
 */

import { randomBytes } from 'crypto';
import type { RelayService } from '@exprsn/relay';
import { buildCommitCar, buildDeleteCar } from '@exprsn/relay';
import type { SyncService } from './sync/index.js';

let _relay: RelayService | null = null;
let _sync: SyncService | null = null;

/**
 * Wire up the relay bridge.  Call this once from index.ts after both
 * services are initialised.
 */
export function initRelayBridge(relay: RelayService | null, sync: SyncService): void {
  _relay = relay;
  _sync = sync;
}

/**
 * Emit a repository commit event to the local firehose and (if enabled) the
 * external relay.  Non-throwing — failures are logged and swallowed so that
 * write paths are never blocked by federation infrastructure.
 */
export async function emitRepoEvent(
  did: string,
  collection: string,
  rkey: string,
  action: 'create' | 'update' | 'delete',
  _record?: unknown
): Promise<void> {
  if (!_sync && !_relay) return;

  const seq = Date.now();
  // Generate a pseudo-CID that is structurally valid for indexers.
  const cid =
    action !== 'delete'
      ? `bafyrei${randomBytes(16).toString('hex').slice(0, 43)}`
      : null;

  // Emit to local firehose so raw-WebSocket and SSE subscribers receive it.
  if (_sync) {
    try {
      _sync.getFirehose().emitEvent({
        seq,
        did,
        eventType: 'commit',
        commit: cid || undefined,
        ops: [
          {
            action,
            path: `${collection}/${rkey}`,
            cid: cid || undefined,
          },
        ],
      });
    } catch (err) {
      console.warn('[relay-bridge] local firehose emit failed:', err);
    }
  }

  // Forward to external relay when available, with proper CAR bytes
  // so the CBOR firehose sends real blocks instead of empty Uint8Array(0).
  if (_relay) {
    try {
      let carBytes: Uint8Array | undefined;
      let commitCid = cid || undefined;

      if (action === 'delete') {
        const result = await buildDeleteCar({
          did,
          rev: seq.toString(),
          collection,
          rkey,
        });
        carBytes = result.carBytes;
        commitCid = result.commitCid;
      } else if (_record) {
        const result = await buildCommitCar({
          did,
          rev: seq.toString(),
          collection,
          rkey,
          record: _record,
        });
        carBytes = result.carBytes;
        commitCid = result.commitCid;
      }

      await _relay.emitCommit(did, {
        rev: seq.toString(),
        operation: action,
        collection,
        rkey,
        record: _record,
        cid: commitCid,
        blocks: carBytes,
      });
    } catch (err) {
      console.warn('[relay-bridge] relay emit failed:', err);
    }
  }
}
