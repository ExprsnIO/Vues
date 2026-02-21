import { Redis } from 'ioredis';

/**
 * Relay event representing a repository commit
 */
export interface RelayEvent {
  seq: number;
  did: string;
  time: string;
  commit: CommitEvent;
}

/**
 * Commit event data
 */
export interface CommitEvent {
  rev: string;
  operation: 'create' | 'update' | 'delete';
  collection: string;
  rkey: string;
  record?: unknown;
  cid?: string;
  prev?: string;
}

/**
 * Sequencer configuration
 */
export interface SequencerConfig {
  redis: Redis;
  keyPrefix?: string;
}

/**
 * Event sequencer for relay
 * Assigns monotonic sequence numbers to events using Redis INCR
 */
export class Sequencer {
  private redis: Redis;
  private keyPrefix: string;
  private readonly SEQ_KEY = 'relay:sequence';
  private readonly EVENTS_KEY = 'relay:events';
  private readonly EVENTS_BY_DID_PREFIX = 'relay:events:did:';

  constructor(config: SequencerConfig) {
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || '';
  }

  /**
   * Get the next sequence number atomically
   */
  async nextSeq(): Promise<number> {
    const key = this.keyPrefix + this.SEQ_KEY;
    const seq = await this.redis.incr(key);
    return seq;
  }

  /**
   * Get the current sequence number without incrementing
   */
  async currentSeq(): Promise<number> {
    const key = this.keyPrefix + this.SEQ_KEY;
    const seq = await this.redis.get(key);
    return seq ? parseInt(seq, 10) : 0;
  }

  /**
   * Sequence and store an event
   */
  async sequenceEvent(did: string, commit: CommitEvent): Promise<RelayEvent> {
    const seq = await this.nextSeq();
    const time = new Date().toISOString();

    const event: RelayEvent = {
      seq,
      did,
      time,
      commit,
    };

    // Store event in Redis
    const eventKey = this.keyPrefix + this.EVENTS_KEY;
    const eventData = JSON.stringify(event);

    // Use sorted set with seq as score for ordering
    await this.redis.zadd(eventKey, seq, eventData);

    // Also index by DID for faster per-DID queries
    const didKey = this.keyPrefix + this.EVENTS_BY_DID_PREFIX + did;
    await this.redis.zadd(didKey, seq, eventData);

    // Trim old events (keep last 100000)
    await this.redis.zremrangebyrank(eventKey, 0, -100001);

    return event;
  }

  /**
   * Get events since a cursor (sequence number)
   */
  async getEventsSince(cursor: number, limit: number = 100): Promise<RelayEvent[]> {
    const key = this.keyPrefix + this.EVENTS_KEY;

    // Get events with seq > cursor
    const events = await this.redis.zrangebyscore(
      key,
      cursor + 1,
      '+inf',
      'LIMIT',
      0,
      limit
    );

    return events.map((e: string) => JSON.parse(e) as RelayEvent);
  }

  /**
   * Get events for a specific DID since cursor
   */
  async getEventsForDid(
    did: string,
    cursor: number,
    limit: number = 100
  ): Promise<RelayEvent[]> {
    const key = this.keyPrefix + this.EVENTS_BY_DID_PREFIX + did;

    const events = await this.redis.zrangebyscore(
      key,
      cursor + 1,
      '+inf',
      'LIMIT',
      0,
      limit
    );

    return events.map((e: string) => JSON.parse(e) as RelayEvent);
  }

  /**
   * Get event by sequence number
   */
  async getEventBySeq(seq: number): Promise<RelayEvent | null> {
    const key = this.keyPrefix + this.EVENTS_KEY;
    const events = await this.redis.zrangebyscore(key, seq, seq);

    if (events.length === 0) return null;
    return JSON.parse(events[0]) as RelayEvent;
  }

  /**
   * Get the oldest available sequence number
   */
  async oldestSeq(): Promise<number | null> {
    const key = this.keyPrefix + this.EVENTS_KEY;
    const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');

    if (oldest.length < 2) return null;
    return parseInt(oldest[1], 10);
  }

  /**
   * Delete events older than a sequence number
   */
  async deleteEventsBefore(seq: number): Promise<number> {
    const key = this.keyPrefix + this.EVENTS_KEY;
    const deleted = await this.redis.zremrangebyscore(key, '-inf', seq);
    return deleted;
  }
}

export default Sequencer;
