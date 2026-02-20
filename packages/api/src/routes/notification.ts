import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import {
  db,
  users,
  notifications,
  notificationSeenAt,
  notificationSubscriptions,
} from '../db/index.js';
import { eq, desc, and, sql, lt, lte } from 'drizzle-orm';

export const notificationRouter = new Hono();

// =============================================================================
// Notification Endpoints
// =============================================================================

/**
 * List notifications for the authenticated user
 * GET /xrpc/io.exprsn.notification.listNotifications
 */
notificationRouter.get('/io.exprsn.notification.listNotifications', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');
  const filter = c.req.query('filter'); // all, likes, comments, follows, mentions, reposts

  // Build conditions array
  const conditions = [eq(notifications.userDid, userDid)];

  if (filter && filter !== 'all') {
    const reasonMap: Record<string, string> = {
      likes: 'like',
      comments: 'comment',
      follows: 'follow',
      mentions: 'mention',
      reposts: 'repost',
    };
    const reason = reasonMap[filter];
    if (reason) {
      conditions.push(eq(notifications.reason, reason));
    }
  }

  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(lt(notifications.createdAt, cursorDate));
  }

  const results = await db
    .select({
      notification: notifications,
    })
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  // Get actor info for all notifications
  const actorDids = [...new Set(results.map((r) => r.notification.actorDid))];
  const actors =
    actorDids.length > 0
      ? await db.query.users.findMany({
          where: sql`${users.did} IN ${actorDids}`,
        })
      : [];
  const actorMap = new Map(actors.map((a) => [a.did, a]));

  // Get seen timestamp
  const seenRecord = await db.query.notificationSeenAt.findFirst({
    where: eq(notificationSeenAt.userDid, userDid),
  });

  const notificationViews = results.map((r) => {
    const actor = actorMap.get(r.notification.actorDid);
    return {
      uri: r.notification.targetUri || `at://${userDid}/notification/${r.notification.id}`,
      cid: r.notification.targetCid || '',
      author: {
        did: actor?.did || r.notification.actorDid,
        handle: actor?.handle || 'unknown',
        displayName: actor?.displayName,
        avatar: actor?.avatar,
        verified: actor?.verified,
      },
      reason: r.notification.reason,
      reasonSubject: r.notification.reasonSubject,
      isRead: r.notification.isRead,
      indexedAt: r.notification.indexedAt.toISOString(),
    };
  });

  const lastResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastResult
      ? lastResult.notification.createdAt.toISOString()
      : undefined;

  return c.json({
    notifications: notificationViews,
    cursor: nextCursor,
    seenAt: seenRecord?.seenAt?.toISOString(),
  });
});

/**
 * Mark notifications as seen
 * POST /xrpc/io.exprsn.notification.updateSeen
 */
notificationRouter.post('/io.exprsn.notification.updateSeen', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { seenAt } = await c.req.json();

  if (!seenAt) {
    throw new HTTPException(400, { message: 'seenAt timestamp is required' });
  }

  const seenDate = new Date(seenAt);

  // Upsert the seen timestamp
  await db
    .insert(notificationSeenAt)
    .values({
      userDid,
      seenAt: seenDate,
    })
    .onConflictDoUpdate({
      target: notificationSeenAt.userDid,
      set: { seenAt: seenDate },
    });

  // Mark all notifications before seenAt as read
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.userDid, userDid),
        lte(notifications.createdAt, seenDate)
      )
    );

  return c.json({ success: true });
});

/**
 * Get unread notification count
 * GET /xrpc/io.exprsn.notification.getUnreadCount
 */
notificationRouter.get('/io.exprsn.notification.getUnreadCount', authMiddleware, async (c) => {
  const userDid = c.get('did');

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userDid, userDid),
        eq(notifications.isRead, false)
      )
    );

  return c.json({
    count: Number(result[0]?.count || 0),
  });
});

/**
 * Get notification subscription settings
 * GET /xrpc/io.exprsn.notification.getSubscription
 */
notificationRouter.get('/io.exprsn.notification.getSubscription', authMiddleware, async (c) => {
  const userDid = c.get('did');

  let subscription = await db.query.notificationSubscriptions.findFirst({
    where: eq(notificationSubscriptions.userDid, userDid),
  });

  // Return defaults if no record exists
  if (!subscription) {
    subscription = {
      userDid,
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      reposts: true,
      messages: true,
      fromFollowingOnly: false,
      pushEnabled: true,
      emailEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return c.json({
    subscription: {
      likes: subscription.likes,
      comments: subscription.comments,
      follows: subscription.follows,
      mentions: subscription.mentions,
      reposts: subscription.reposts,
      messages: subscription.messages,
      fromFollowingOnly: subscription.fromFollowingOnly,
      pushEnabled: subscription.pushEnabled,
      emailEnabled: subscription.emailEnabled,
    },
  });
});

/**
 * Update notification subscription settings
 * POST /xrpc/io.exprsn.notification.updateSubscription
 */
notificationRouter.post('/io.exprsn.notification.updateSubscription', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const update = await c.req.json();

  // Upsert subscription
  await db
    .insert(notificationSubscriptions)
    .values({
      userDid,
      likes: update.likes ?? true,
      comments: update.comments ?? true,
      follows: update.follows ?? true,
      mentions: update.mentions ?? true,
      reposts: update.reposts ?? true,
      messages: update.messages ?? true,
      fromFollowingOnly: update.fromFollowingOnly ?? false,
      pushEnabled: update.pushEnabled ?? true,
      emailEnabled: update.emailEnabled ?? false,
    })
    .onConflictDoUpdate({
      target: notificationSubscriptions.userDid,
      set: {
        ...(update.likes !== undefined && { likes: update.likes }),
        ...(update.comments !== undefined && { comments: update.comments }),
        ...(update.follows !== undefined && { follows: update.follows }),
        ...(update.mentions !== undefined && { mentions: update.mentions }),
        ...(update.reposts !== undefined && { reposts: update.reposts }),
        ...(update.messages !== undefined && { messages: update.messages }),
        ...(update.fromFollowingOnly !== undefined && { fromFollowingOnly: update.fromFollowingOnly }),
        ...(update.pushEnabled !== undefined && { pushEnabled: update.pushEnabled }),
        ...(update.emailEnabled !== undefined && { emailEnabled: update.emailEnabled }),
        updatedAt: new Date(),
      },
    });

  const subscription = await db.query.notificationSubscriptions.findFirst({
    where: eq(notificationSubscriptions.userDid, userDid),
  });

  return c.json({
    subscription: {
      likes: subscription!.likes,
      comments: subscription!.comments,
      follows: subscription!.follows,
      mentions: subscription!.mentions,
      reposts: subscription!.reposts,
      messages: subscription!.messages,
      fromFollowingOnly: subscription!.fromFollowingOnly,
      pushEnabled: subscription!.pushEnabled,
      emailEnabled: subscription!.emailEnabled,
    },
  });
});
