import type { RelayService, CommitEvent } from '@exprsn/relay';

/**
 * Global relay service accessor
 *
 * This module provides a way to access the relay service from routes
 * after it's been initialized in index.ts
 */

let relayServiceInstance: RelayService | null = null;

/**
 * Set the relay service instance (called from index.ts)
 */
export function setRelayService(service: RelayService | null): void {
  relayServiceInstance = service;
}

/**
 * Get the relay service instance
 */
export function getRelayService(): RelayService | null {
  return relayServiceInstance;
}

/**
 * Check if relay is enabled
 */
export function isRelayEnabled(): boolean {
  return relayServiceInstance !== null;
}

/**
 * Emit a commit to the relay if enabled
 *
 * @param did - The DID of the user making the commit
 * @param commit - The commit event
 * @returns The relay event if emitted, null otherwise
 */
export async function emitCommitToRelay(
  did: string,
  commit: CommitEvent
): Promise<{ seq: number; time: string } | null> {
  if (!relayServiceInstance) {
    return null;
  }

  try {
    const event = await relayServiceInstance.emitCommit(did, commit);
    return { seq: event.seq, time: event.time };
  } catch (error) {
    console.error('Failed to emit commit to relay:', error);
    return null;
  }
}

export type { CommitEvent };
