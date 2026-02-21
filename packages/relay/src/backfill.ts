import { Sequencer, RelayEvent } from './sequencer.js';

/**
 * Backfill configuration
 */
export interface BackfillConfig {
  sequencer: Sequencer;
  maxEvents?: number;
  batchSize?: number;
}

/**
 * Backfill service for retrieving historical events
 */
export class Backfill {
  private sequencer: Sequencer;
  private maxEvents: number;
  private batchSize: number;

  constructor(config: BackfillConfig) {
    this.sequencer = config.sequencer;
    this.maxEvents = config.maxEvents || 10000;
    this.batchSize = config.batchSize || 100;
  }

  /**
   * Get events since cursor
   */
  async getEvents(cursor: number, limit?: number): Promise<RelayEvent[]> {
    const maxLimit = limit || this.maxEvents;
    const events: RelayEvent[] = [];
    let currentCursor = cursor;

    while (events.length < maxLimit) {
      const remaining = maxLimit - events.length;
      const batchLimit = Math.min(this.batchSize, remaining);

      const batch = await this.sequencer.getEventsSince(currentCursor, batchLimit);

      if (batch.length === 0) break;

      events.push(...batch);
      currentCursor = batch[batch.length - 1].seq;
    }

    return events;
  }

  /**
   * Get events for a specific DID since cursor
   */
  async getEventsForDid(
    did: string,
    cursor: number,
    limit?: number
  ): Promise<RelayEvent[]> {
    const maxLimit = limit || this.maxEvents;
    return this.sequencer.getEventsForDid(did, cursor, maxLimit);
  }

  /**
   * Get events in a sequence range
   */
  async getEventsInRange(
    startSeq: number,
    endSeq: number
  ): Promise<RelayEvent[]> {
    const events: RelayEvent[] = [];
    let currentCursor = startSeq - 1;

    while (true) {
      const batch = await this.sequencer.getEventsSince(currentCursor, this.batchSize);

      if (batch.length === 0) break;

      for (const event of batch) {
        if (event.seq > endSeq) {
          return events;
        }
        events.push(event);
        currentCursor = event.seq;
      }
    }

    return events;
  }

  /**
   * Get event count since cursor
   */
  async getEventCount(cursor: number): Promise<number> {
    const currentSeq = await this.sequencer.currentSeq();
    if (cursor >= currentSeq) return 0;
    return currentSeq - cursor;
  }

  /**
   * Check if cursor is still valid (events are available)
   */
  async isCursorValid(cursor: number): Promise<boolean> {
    const oldestSeq = await this.sequencer.oldestSeq();
    if (oldestSeq === null) return true; // No events, any cursor is valid
    return cursor >= oldestSeq - 1;
  }

  /**
   * Get the oldest available cursor
   */
  async getOldestCursor(): Promise<number | null> {
    const oldestSeq = await this.sequencer.oldestSeq();
    if (oldestSeq === null) return null;
    return oldestSeq - 1;
  }

  /**
   * Stream events with a callback
   */
  async streamEvents(
    cursor: number,
    callback: (event: RelayEvent) => Promise<boolean>,
    limit?: number
  ): Promise<number> {
    const maxLimit = limit || this.maxEvents;
    let processed = 0;
    let currentCursor = cursor;

    while (processed < maxLimit) {
      const remaining = maxLimit - processed;
      const batchLimit = Math.min(this.batchSize, remaining);

      const batch = await this.sequencer.getEventsSince(currentCursor, batchLimit);

      if (batch.length === 0) break;

      for (const event of batch) {
        const shouldContinue = await callback(event);
        processed++;
        currentCursor = event.seq;

        if (!shouldContinue) {
          return processed;
        }
      }
    }

    return processed;
  }

  /**
   * Get summary of available events
   */
  async getSummary(): Promise<{
    oldestSeq: number | null;
    currentSeq: number;
    eventCount: number;
  }> {
    const currentSeq = await this.sequencer.currentSeq();
    const oldestSeq = await this.sequencer.oldestSeq();

    let eventCount = 0;
    if (oldestSeq !== null && currentSeq > 0) {
      eventCount = currentSeq - oldestSeq + 1;
    }

    return {
      oldestSeq,
      currentSeq,
      eventCount,
    };
  }
}

export default Backfill;
