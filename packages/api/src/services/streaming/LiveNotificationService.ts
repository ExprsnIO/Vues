/**
 * Live Notification Service
 * Handles notifications for live stream events (go-live, scheduled reminders, etc.)
 */

import { db } from '../../db/index.js';
import {
  liveStreams,
  follows,
  users,
  notifications,
} from '../../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { redis } from '../../cache/redis.js';
import { nanoid } from 'nanoid';

// Cache keys
const CACHE_KEYS = {
  recentNotification: (userDid: string, streamerId: string) =>
    `live:notif:recent:${userDid}:${streamerId}`,
  streamerFollowers: (streamerDid: string) =>
    `live:followers:${streamerDid}`,
};

// Notification types
export type LiveNotificationType =
  | 'streamer_live'
  | 'stream_scheduled'
  | 'stream_starting_soon'
  | 'stream_ended'
  | 'guest_invited'
  | 'raid_incoming';

export interface LiveNotification {
  id: string;
  type: LiveNotificationType;
  recipientDid: string;
  streamId: string;
  streamerDid: string;
  streamerHandle?: string;
  streamerDisplayName?: string;
  streamerAvatar?: string;
  streamTitle: string;
  streamCategory?: string;
  thumbnailUrl?: string;
  message: string;
  createdAt: Date;
  read: boolean;
}

export interface NotificationPreferences {
  goLiveNotifications: boolean;
  scheduledReminders: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  goLiveNotifications: true,
  scheduledReminders: true,
  emailNotifications: false,
  pushNotifications: true,
};

export class LiveNotificationService {
  /**
   * Notify followers that a streamer has gone live
   */
  async notifyGoLive(streamId: string): Promise<{
    notificationsSent: number;
    followers: number;
  }> {
    // Get stream info
    const [stream] = await db
      .select({
        id: liveStreams.id,
        userDid: liveStreams.userDid,
        title: liveStreams.title,
        category: liveStreams.category,
        thumbnailUrl: liveStreams.thumbnailUrl,
        visibility: liveStreams.visibility,
      })
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream) {
      throw new Error('Stream not found');
    }

    // Only notify for public streams
    if (stream.visibility !== 'public') {
      return { notificationsSent: 0, followers: 0 };
    }

    // Get streamer info
    const [streamer] = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.did, stream.userDid))
      .limit(1);

    if (!streamer) {
      return { notificationsSent: 0, followers: 0 };
    }

    // Get all followers
    const followers = await this.getFollowers(stream.userDid);

    if (followers.length === 0) {
      return { notificationsSent: 0, followers: 0 };
    }

    // Filter out users who were recently notified (within last hour)
    const eligibleFollowers = await this.filterRecentlyNotified(
      followers,
      stream.userDid
    );

    // Create notifications in batch
    const streamUri = `at://${stream.userDid}/io.exprsn.video.stream/${stream.id}`;
    const now = new Date();

    const notificationRecords = eligibleFollowers.map(followerDid => ({
      id: nanoid(),
      userDid: followerDid,
      actorDid: stream.userDid,
      reason: 'live_stream',
      reasonSubject: `${streamer.displayName || streamer.handle} is now live: ${stream.title}`,
      targetUri: streamUri,
      subjectUri: streamUri,
      subjectType: 'stream',
      isRead: false,
      createdAt: now,
      indexedAt: now,
    }));

    if (notificationRecords.length > 0) {
      // Insert notifications in batches
      const batchSize = 100;
      for (let i = 0; i < notificationRecords.length; i += batchSize) {
        const batch = notificationRecords.slice(i, i + batchSize);
        await db.insert(notifications).values(batch);
      }

      // Mark users as recently notified
      await this.markRecentlyNotified(eligibleFollowers, stream.userDid);
    }

    // Emit real-time notifications via WebSocket would go here
    // This would integrate with the existing notification WebSocket namespace

    return {
      notificationsSent: notificationRecords.length,
      followers: followers.length,
    };
  }

  /**
   * Send scheduled stream reminder
   */
  async sendScheduledReminder(
    streamId: string,
    minutesBefore: number
  ): Promise<{ notificationsSent: number }> {
    const [stream] = await db
      .select({
        id: liveStreams.id,
        userDid: liveStreams.userDid,
        title: liveStreams.title,
        category: liveStreams.category,
        thumbnailUrl: liveStreams.thumbnailUrl,
        scheduledAt: liveStreams.scheduledAt,
        visibility: liveStreams.visibility,
      })
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream || !stream.scheduledAt || stream.visibility !== 'public') {
      return { notificationsSent: 0 };
    }

    const [streamer] = await db
      .select({
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.did, stream.userDid))
      .limit(1);

    const followers = await this.getFollowers(stream.userDid);

    const timeText = minutesBefore === 60
      ? '1 hour'
      : minutesBefore === 30
        ? '30 minutes'
        : minutesBefore === 15
          ? '15 minutes'
          : `${minutesBefore} minutes`;

    const streamUri = `at://${stream.userDid}/io.exprsn.video.stream/${stream.id}`;
    const now = new Date();

    const notificationRecords = followers.map(followerDid => ({
      id: nanoid(),
      userDid: followerDid,
      actorDid: stream.userDid,
      reason: 'stream_reminder',
      reasonSubject: `${streamer?.displayName || streamer?.handle} is going live in ${timeText}: ${stream.title}`,
      targetUri: streamUri,
      subjectUri: streamUri,
      subjectType: 'stream',
      isRead: false,
      createdAt: now,
      indexedAt: now,
    }));

    if (notificationRecords.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < notificationRecords.length; i += batchSize) {
        const batch = notificationRecords.slice(i, i + batchSize);
        await db.insert(notifications).values(batch);
      }
    }

    return { notificationsSent: notificationRecords.length };
  }

  /**
   * Notify user of guest invitation
   */
  async notifyGuestInvitation(
    streamId: string,
    guestDid: string,
    role: 'guest' | 'co-host'
  ): Promise<void> {
    const [stream] = await db
      .select({
        id: liveStreams.id,
        userDid: liveStreams.userDid,
        title: liveStreams.title,
      })
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream) return;

    const [streamer] = await db
      .select({
        handle: users.handle,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.did, stream.userDid))
      .limit(1);

    const streamUri = `at://${stream.userDid}/io.exprsn.video.stream/${stream.id}`;
    const now = new Date();
    const roleText = role === 'co-host' ? 'a co-host' : 'a guest';

    await db.insert(notifications).values({
      id: nanoid(),
      userDid: guestDid,
      actorDid: stream.userDid,
      reason: 'guest_invitation',
      reasonSubject: `${streamer?.displayName || streamer?.handle} invited you as ${roleText} on "${stream.title}"`,
      targetUri: streamUri,
      subjectUri: streamUri,
      subjectType: 'stream',
      isRead: false,
      createdAt: now,
      indexedAt: now,
    });
  }

  /**
   * Get live notifications for a user
   */
  async getNotifications(
    userDid: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    } = {}
  ): Promise<LiveNotification[]> {
    const { limit = 20, offset = 0, unreadOnly = false } = options;

    const conditions = [
      eq(notifications.userDid, userDid),
      inArray(notifications.reason, ['live_stream', 'stream_reminder', 'guest_invitation']),
    ];

    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    const results = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(sql`${notifications.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    // Extract stream IDs from target URIs to fetch streamer info
    const streamIds = results
      .map(n => this.extractStreamIdFromUri(n.targetUri))
      .filter((id): id is string => id !== null);

    // Batch fetch streamer info
    const streamerMap = await this.getStreamerInfoBatch(
      results.map(n => n.actorDid).filter((did): did is string => did !== null)
    );

    return results.map(n => {
      const streamId = this.extractStreamIdFromUri(n.targetUri);
      const streamer = n.actorDid ? streamerMap.get(n.actorDid) : undefined;

      return {
        id: n.id,
        type: this.mapNotificationType(n.reason),
        recipientDid: n.userDid,
        streamId: streamId || '',
        streamerDid: n.actorDid || '',
        streamerHandle: streamer?.handle,
        streamerDisplayName: streamer?.displayName,
        streamerAvatar: streamer?.avatar,
        streamTitle: n.reasonSubject || '',
        streamCategory: undefined,
        thumbnailUrl: undefined,
        message: n.reasonSubject || '',
        createdAt: n.createdAt,
        read: n.isRead,
      };
    });
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(notificationIds: string[], userDid: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          inArray(notifications.id, notificationIds),
          eq(notifications.userDid, userDid)
        )
      );
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userDid: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userDid, userDid),
          eq(notifications.isRead, false),
          inArray(notifications.reason, ['live_stream', 'stream_reminder', 'guest_invitation'])
        )
      );

    return result?.count || 0;
  }

  // ============================================
  // Private helper methods
  // ============================================

  private extractStreamIdFromUri(uri: string | null): string | null {
    if (!uri) return null;
    // URI format: at://did/collection/rkey
    const parts = uri.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart ?? null;
  }

  private async getStreamerInfoBatch(
    dids: string[]
  ): Promise<Map<string, { handle: string; displayName?: string; avatar?: string }>> {
    const map = new Map<string, { handle: string; displayName?: string; avatar?: string }>();
    if (dids.length === 0) return map;

    const uniqueDids = [...new Set(dids)];
    const results = await db
      .select({
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(users)
      .where(inArray(users.did, uniqueDids));

    for (const user of results) {
      map.set(user.did, {
        handle: user.handle,
        displayName: user.displayName ?? undefined,
        avatar: user.avatar ?? undefined,
      });
    }

    return map;
  }

  private async getFollowers(streamerDid: string): Promise<string[]> {
    // Check cache first
    const cacheKey = CACHE_KEYS.streamerFollowers(streamerDid);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    // Query followers from database
    const followerResults = await db
      .select({ followerDid: follows.followerDid })
      .from(follows)
      .where(eq(follows.followeeDid, streamerDid));

    const followers = followerResults.map(f => f.followerDid);

    // Cache for 5 minutes
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(followers));
    } catch {
      // Cache write failed
    }

    return followers;
  }

  private async filterRecentlyNotified(
    followers: string[],
    streamerDid: string
  ): Promise<string[]> {
    const eligible: string[] = [];

    for (const followerDid of followers) {
      const cacheKey = CACHE_KEYS.recentNotification(followerDid, streamerDid);
      try {
        const recent = await redis.get(cacheKey);
        if (!recent) {
          eligible.push(followerDid);
        }
      } catch {
        // Assume eligible if cache check fails
        eligible.push(followerDid);
      }
    }

    return eligible;
  }

  private async markRecentlyNotified(
    followers: string[],
    streamerDid: string
  ): Promise<void> {
    const now = Date.now().toString();

    for (const followerDid of followers) {
      const cacheKey = CACHE_KEYS.recentNotification(followerDid, streamerDid);
      try {
        // Don't notify the same user about the same streamer for 1 hour
        await redis.setex(cacheKey, 3600, now);
      } catch {
        // Cache write failed, continue
      }
    }
  }

  private mapNotificationType(reason: string | null): LiveNotificationType {
    switch (reason) {
      case 'live_stream':
        return 'streamer_live';
      case 'stream_reminder':
        return 'stream_starting_soon';
      case 'guest_invitation':
        return 'guest_invited';
      default:
        return 'streamer_live';
    }
  }
}

// Singleton instance
let liveNotificationService: LiveNotificationService | null = null;

export function getLiveNotificationService(): LiveNotificationService {
  if (!liveNotificationService) {
    liveNotificationService = new LiveNotificationService();
  }
  return liveNotificationService;
}
