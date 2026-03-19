/**
 * Distributed Presence Service
 * Redis-based presence tracking with pub/sub for multi-server support
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { db } from '../../db/index.js';
import { userPresence } from '../../db/schema.js';
import { eq, inArray, lt, and, sql } from 'drizzle-orm';

/**
 * User presence status
 */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

/**
 * Presence data for a user
 */
export interface UserPresenceData {
  userDid: string;
  status: PresenceStatus;
  lastSeen: Date;
  currentActivity?: string;
  currentContext?: string; // e.g., conversationId, videoId, etc.
  metadata?: Record<string, unknown>;
}

/**
 * Presence update event
 */
export interface PresenceUpdateEvent {
  userDid: string;
  status: PresenceStatus;
  previousStatus?: PresenceStatus;
  lastSeen: string;
  currentActivity?: string;
  serverId: string;
}

/**
 * Presence query options
 */
export interface PresenceQueryOptions {
  includeAway?: boolean;
  contextType?: string;
  contextId?: string;
}

/**
 * Presence service configuration
 */
export interface PresenceServiceConfig {
  redis: Redis;
  serverId?: string;
  heartbeatIntervalMs?: number;
  awayTimeoutMs?: number;
  offlineTimeoutMs?: number;
  cleanupIntervalMs?: number;
}

// Redis key prefixes
const KEYS = {
  PRESENCE: 'presence:user:',
  CONTEXT: 'presence:context:',
  SERVER_USERS: 'presence:server:',
  HEARTBEAT: 'presence:heartbeat:',
  CHANNEL: 'presence:updates',
} as const;

/**
 * Distributed Presence Service
 * Provides real-time presence tracking across multiple servers
 */
export class PresenceService extends EventEmitter {
  private redis: Redis;
  private redisSub: Redis;
  private serverId: string;
  private heartbeatIntervalMs: number;
  private awayTimeoutMs: number;
  private offlineTimeoutMs: number;
  private cleanupIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private localUsers = new Map<string, { lastHeartbeat: number; status: PresenceStatus }>();

  constructor(config: PresenceServiceConfig) {
    super();
    this.redis = config.redis;
    // Disable ready check for subscriber connection to avoid INFO command after subscribe
    this.redisSub = config.redis.duplicate({ enableReadyCheck: false });
    this.serverId = config.serverId || `server-${process.pid}-${Date.now()}`;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs || 30000; // 30s
    this.awayTimeoutMs = config.awayTimeoutMs || 300000; // 5 min
    this.offlineTimeoutMs = config.offlineTimeoutMs || 600000; // 10 min
    this.cleanupIntervalMs = config.cleanupIntervalMs || 60000; // 1 min

    this.setupSubscriptions();
    this.startHeartbeat();
    this.startCleanup();
  }

  /**
   * Set up Redis pub/sub for presence updates
   */
  private setupSubscriptions(): void {
    this.redisSub.subscribe(KEYS.CHANNEL, (err) => {
      if (err) {
        console.error('[PresenceService] Failed to subscribe:', err);
      }
    });

    this.redisSub.on('message', (channel, message) => {
      if (channel === KEYS.CHANNEL) {
        try {
          const event = JSON.parse(message) as PresenceUpdateEvent;
          // Don't emit events from this server (already handled locally)
          if (event.serverId !== this.serverId) {
            this.emit('presence-update', event);
          }
        } catch (error) {
          console.error('[PresenceService] Failed to parse presence update:', error);
        }
      }
    });
  }

  /**
   * Start heartbeat timer for local users
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.processHeartbeats();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupStalePresence();
    }, this.cleanupIntervalMs);
  }

  /**
   * Set user as online
   */
  async setOnline(
    userDid: string,
    options: {
      currentActivity?: string;
      currentContext?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    const previousStatus = await this.getStatus(userDid);
    const now = Date.now();

    const data: UserPresenceData = {
      userDid,
      status: 'online',
      lastSeen: new Date(now),
      currentActivity: options.currentActivity,
      currentContext: options.currentContext,
      metadata: options.metadata,
    };

    // Store in Redis with TTL
    await this.redis.setex(
      KEYS.PRESENCE + userDid,
      Math.floor(this.offlineTimeoutMs / 1000),
      JSON.stringify(data)
    );

    // Track on this server
    this.localUsers.set(userDid, { lastHeartbeat: now, status: 'online' });
    await this.redis.sadd(KEYS.SERVER_USERS + this.serverId, userDid);

    // Update context tracking if provided
    if (options.currentContext) {
      await this.redis.sadd(KEYS.CONTEXT + options.currentContext, userDid);
    }

    // Persist to database
    await this.persistPresence(data);

    // Publish update
    await this.publishUpdate({
      userDid,
      status: 'online',
      previousStatus,
      lastSeen: new Date(now).toISOString(),
      currentActivity: options.currentActivity,
      serverId: this.serverId,
    });
  }

  /**
   * Set user as away
   */
  async setAway(userDid: string): Promise<void> {
    const previousStatus = await this.getStatus(userDid);
    if (previousStatus === 'offline') return;

    const now = Date.now();
    const existing = await this.getPresence(userDid);

    const data: UserPresenceData = {
      userDid,
      status: 'away',
      lastSeen: new Date(now),
      currentActivity: existing?.currentActivity,
      currentContext: existing?.currentContext,
    };

    await this.redis.setex(
      KEYS.PRESENCE + userDid,
      Math.floor(this.offlineTimeoutMs / 1000),
      JSON.stringify(data)
    );

    const local = this.localUsers.get(userDid);
    if (local) {
      local.status = 'away';
    }

    await this.persistPresence(data);

    await this.publishUpdate({
      userDid,
      status: 'away',
      previousStatus,
      lastSeen: new Date(now).toISOString(),
      serverId: this.serverId,
    });
  }

  /**
   * Set user as busy (do not disturb)
   */
  async setBusy(userDid: string): Promise<void> {
    const previousStatus = await this.getStatus(userDid);
    const now = Date.now();

    const data: UserPresenceData = {
      userDid,
      status: 'busy',
      lastSeen: new Date(now),
    };

    await this.redis.setex(
      KEYS.PRESENCE + userDid,
      Math.floor(this.offlineTimeoutMs / 1000),
      JSON.stringify(data)
    );

    const local = this.localUsers.get(userDid);
    if (local) {
      local.status = 'busy';
    }

    await this.persistPresence(data);

    await this.publishUpdate({
      userDid,
      status: 'busy',
      previousStatus,
      lastSeen: new Date(now).toISOString(),
      serverId: this.serverId,
    });
  }

  /**
   * Set user as offline
   */
  async setOffline(userDid: string): Promise<void> {
    const previousStatus = await this.getStatus(userDid);
    if (previousStatus === 'offline') return;

    const existing = await this.getPresence(userDid);
    const now = Date.now();

    // Remove from Redis
    await this.redis.del(KEYS.PRESENCE + userDid);
    await this.redis.srem(KEYS.SERVER_USERS + this.serverId, userDid);

    // Remove from context tracking
    if (existing?.currentContext) {
      await this.redis.srem(KEYS.CONTEXT + existing.currentContext, userDid);
    }

    // Remove from local tracking
    this.localUsers.delete(userDid);

    // Persist to database
    await this.persistPresence({
      userDid,
      status: 'offline',
      lastSeen: new Date(now),
    });

    // Publish update
    await this.publishUpdate({
      userDid,
      status: 'offline',
      previousStatus,
      lastSeen: new Date(now).toISOString(),
      serverId: this.serverId,
    });
  }

  /**
   * Handle heartbeat from user (keeps them online)
   */
  async heartbeat(userDid: string): Promise<void> {
    const now = Date.now();
    const local = this.localUsers.get(userDid);

    if (local) {
      local.lastHeartbeat = now;
      if (local.status === 'away') {
        // User is active again
        await this.setOnline(userDid);
      } else {
        // Just refresh TTL
        await this.redis.expire(KEYS.PRESENCE + userDid, Math.floor(this.offlineTimeoutMs / 1000));
      }
    } else {
      // User connected on another server, track locally
      this.localUsers.set(userDid, { lastHeartbeat: now, status: 'online' });
      await this.setOnline(userDid);
    }
  }

  /**
   * Get presence for a single user
   */
  async getPresence(userDid: string): Promise<UserPresenceData | null> {
    const data = await this.redis.get(KEYS.PRESENCE + userDid);
    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data) as UserPresenceData;
      parsed.lastSeen = new Date(parsed.lastSeen);
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Get status for a single user
   */
  async getStatus(userDid: string): Promise<PresenceStatus> {
    const presence = await this.getPresence(userDid);
    return presence?.status || 'offline';
  }

  /**
   * Get presence for multiple users
   */
  async getPresenceMultiple(userDids: string[]): Promise<Map<string, UserPresenceData>> {
    const result = new Map<string, UserPresenceData>();
    if (userDids.length === 0) return result;

    const pipeline = this.redis.pipeline();
    for (const did of userDids) {
      pipeline.get(KEYS.PRESENCE + did);
    }

    const responses = await pipeline.exec();
    if (!responses) return result;

    for (let i = 0; i < userDids.length; i++) {
      const [err, data] = responses[i] || [];
      const did = userDids[i];
      if (!err && data && did) {
        try {
          const parsed = JSON.parse(data as string) as UserPresenceData;
          parsed.lastSeen = new Date(parsed.lastSeen);
          result.set(did, parsed);
        } catch {
          // Skip invalid data
        }
      }
    }

    return result;
  }

  /**
   * Get all online users in a context (e.g., conversation, video)
   */
  async getContextPresence(contextId: string): Promise<string[]> {
    const members = await this.redis.smembers(KEYS.CONTEXT + contextId);

    // Filter to only currently online users
    const presenceMap = await this.getPresenceMultiple(members);
    return members.filter(did => {
      const presence = presenceMap.get(did);
      return presence && presence.status !== 'offline';
    });
  }

  /**
   * Get count of online users
   */
  async getOnlineCount(): Promise<number> {
    // Count users across all servers
    const keys = await this.redis.keys(KEYS.PRESENCE + '*');
    return keys.length;
  }

  /**
   * Update user's current context (e.g., which conversation they're viewing)
   */
  async updateContext(userDid: string, contextId: string | null, previousContextId?: string): Promise<void> {
    // Remove from previous context
    if (previousContextId) {
      await this.redis.srem(KEYS.CONTEXT + previousContextId, userDid);
    }

    // Add to new context
    if (contextId) {
      await this.redis.sadd(KEYS.CONTEXT + contextId, userDid);
    }

    // Update presence data
    const existing = await this.getPresence(userDid);
    if (existing) {
      existing.currentContext = contextId || undefined;
      await this.redis.setex(
        KEYS.PRESENCE + userDid,
        Math.floor(this.offlineTimeoutMs / 1000),
        JSON.stringify(existing)
      );
    }
  }

  /**
   * Process heartbeats and mark users as away/offline
   */
  private async processHeartbeats(): Promise<void> {
    const now = Date.now();

    for (const [userDid, data] of this.localUsers) {
      const timeSinceHeartbeat = now - data.lastHeartbeat;

      if (timeSinceHeartbeat > this.offlineTimeoutMs) {
        // Mark as offline
        await this.setOffline(userDid);
      } else if (timeSinceHeartbeat > this.awayTimeoutMs && data.status === 'online') {
        // Mark as away
        await this.setAway(userDid);
      }
    }
  }

  /**
   * Clean up stale presence data
   */
  private async cleanupStalePresence(): Promise<void> {
    const cutoff = new Date(Date.now() - this.offlineTimeoutMs);

    try {
      // Clean up database entries using raw SQL for postgres.js Date compatibility
      await db
        .update(userPresence)
        .set({ status: 'offline' })
        .where(
          and(
            sql`${userPresence.lastSeen} < ${cutoff.toISOString()}`,
            eq(userPresence.status, 'online')
          )
        );

      // Clean up server user sets for this server
      const serverUsers = await this.redis.smembers(KEYS.SERVER_USERS + this.serverId);
      for (const userDid of serverUsers) {
        if (!this.localUsers.has(userDid)) {
          await this.redis.srem(KEYS.SERVER_USERS + this.serverId, userDid);
        }
      }
    } catch (error) {
      console.error('[PresenceService] Cleanup error:', error);
    }
  }

  /**
   * Persist presence to database
   */
  private async persistPresence(data: UserPresenceData): Promise<void> {
    try {
      await db
        .insert(userPresence)
        .values({
          userDid: data.userDid,
          status: data.status,
          lastSeen: data.lastSeen,
          currentConversationId: data.currentContext || null,
        })
        .onConflictDoUpdate({
          target: userPresence.userDid,
          set: {
            status: data.status,
            lastSeen: data.lastSeen,
            currentConversationId: data.currentContext || null,
          },
        });
    } catch (error) {
      console.error('[PresenceService] Failed to persist presence:', error);
    }
  }

  /**
   * Publish presence update via Redis pub/sub
   */
  private async publishUpdate(event: PresenceUpdateEvent): Promise<void> {
    try {
      await this.redis.publish(KEYS.CHANNEL, JSON.stringify(event));
      this.emit('presence-update', event);
    } catch (error) {
      console.error('[PresenceService] Failed to publish update:', error);
    }
  }

  /**
   * Subscribe to presence updates for specific users
   */
  subscribeToUsers(userDids: string[], callback: (event: PresenceUpdateEvent) => void): () => void {
    const handler = (event: PresenceUpdateEvent) => {
      if (userDids.includes(event.userDid)) {
        callback(event);
      }
    };

    this.on('presence-update', handler);

    return () => {
      this.off('presence-update', handler);
    };
  }

  /**
   * Clean up on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Mark all local users as offline
    for (const userDid of this.localUsers.keys()) {
      await this.setOffline(userDid);
    }

    // Clean up server user set
    await this.redis.del(KEYS.SERVER_USERS + this.serverId);

    // Close Redis subscriptions
    await this.redisSub.unsubscribe();
    await this.redisSub.quit();
  }
}

// Singleton instance
let presenceService: PresenceService | null = null;

/**
 * Get or create the presence service instance
 */
export function getPresenceService(redis?: Redis): PresenceService {
  if (!presenceService && redis) {
    presenceService = new PresenceService({ redis });
  }
  if (!presenceService) {
    throw new Error('PresenceService not initialized');
  }
  return presenceService;
}

/**
 * Initialize the presence service
 */
export function initializePresenceService(config: PresenceServiceConfig): PresenceService {
  if (presenceService) {
    return presenceService;
  }
  presenceService = new PresenceService(config);
  return presenceService;
}

export default PresenceService;
