import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import {
  db,
  videos,
  users,
  reposts,
  bookmarks,
  blocks,
  mutes,
  contentReports,
  notificationSubscriptions,
} from '../db/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const socialRouter = new Hono();

// =============================================================================
// Repost Endpoints
// =============================================================================

/**
 * Create a repost
 * POST /xrpc/io.exprsn.video.repost
 */
socialRouter.post('/io.exprsn.video.repost', authMiddleware, async (c) => {
  const { uri, cid, caption } = await c.req.json();
  const userDid = c.get('did');

  if (!uri || !cid) {
    throw new HTTPException(400, { message: 'Video URI and CID are required' });
  }

  // Verify video exists
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, uri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  // Check if already reposted
  const existing = await db.query.reposts.findFirst({
    where: and(eq(reposts.videoUri, uri), eq(reposts.authorDid, userDid)),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Already reposted' });
  }

  const repostId = nanoid();
  const repostUri = `at://${userDid}/io.exprsn.video.repost/${repostId}`;

  await db.insert(reposts).values({
    uri: repostUri,
    cid: nanoid(),
    videoUri: uri,
    authorDid: userDid,
    caption: caption || null,
    createdAt: new Date(),
  });

  // Increment repost count
  await db
    .update(videos)
    .set({ repostCount: sql`${videos.repostCount} + 1` })
    .where(eq(videos.uri, uri));

  return c.json({ uri: repostUri });
});

/**
 * Delete a repost
 * POST /xrpc/io.exprsn.video.unrepost
 */
socialRouter.post('/io.exprsn.video.unrepost', authMiddleware, async (c) => {
  const { uri } = await c.req.json();
  const userDid = c.get('did');

  if (!uri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  const existing = await db.query.reposts.findFirst({
    where: and(eq(reposts.videoUri, uri), eq(reposts.authorDid, userDid)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Repost not found' });
  }

  await db.delete(reposts).where(eq(reposts.uri, existing.uri));

  // Decrement repost count
  await db
    .update(videos)
    .set({ repostCount: sql`GREATEST(${videos.repostCount} - 1, 0)` })
    .where(eq(videos.uri, uri));

  return c.json({ success: true });
});

/**
 * Get user's reposts
 * GET /xrpc/io.exprsn.video.getReposts
 */
socialRouter.get('/io.exprsn.video.getReposts', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  const conditions = [eq(reposts.authorDid, did)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(sql`${reposts.createdAt} < ${cursorDate}`);
  }

  const results = await db
    .select({
      repost: reposts,
      video: videos,
    })
    .from(reposts)
    .innerJoin(videos, eq(reposts.videoUri, videos.uri))
    .where(and(...conditions))
    .orderBy(desc(reposts.createdAt))
    .limit(limit);

  const lastResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastResult
      ? lastResult.repost.createdAt.toISOString()
      : undefined;

  return c.json({
    reposts: results.map((r) => ({
      uri: r.repost.uri,
      videoUri: r.repost.videoUri,
      caption: r.repost.caption,
      createdAt: r.repost.createdAt.toISOString(),
      video: r.video,
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Bookmark Endpoints
// =============================================================================

/**
 * Bookmark a video
 * POST /xrpc/io.exprsn.video.bookmark
 */
socialRouter.post('/io.exprsn.video.bookmark', authMiddleware, async (c) => {
  const { uri, cid, folder } = await c.req.json();
  const userDid = c.get('did');

  if (!uri || !cid) {
    throw new HTTPException(400, { message: 'Video URI and CID are required' });
  }

  // Verify video exists
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, uri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  // Check if already bookmarked
  const existing = await db.query.bookmarks.findFirst({
    where: and(eq(bookmarks.videoUri, uri), eq(bookmarks.authorDid, userDid)),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Already bookmarked' });
  }

  const bookmarkId = nanoid();
  const bookmarkUri = `at://${userDid}/io.exprsn.video.bookmark/${bookmarkId}`;

  await db.insert(bookmarks).values({
    uri: bookmarkUri,
    cid: nanoid(),
    videoUri: uri,
    authorDid: userDid,
    folder: folder || null,
    createdAt: new Date(),
  });

  // Increment bookmark count
  await db
    .update(videos)
    .set({ bookmarkCount: sql`${videos.bookmarkCount} + 1` })
    .where(eq(videos.uri, uri));

  return c.json({ uri: bookmarkUri });
});

/**
 * Remove a bookmark
 * POST /xrpc/io.exprsn.video.unbookmark
 */
socialRouter.post('/io.exprsn.video.unbookmark', authMiddleware, async (c) => {
  const { uri } = await c.req.json();
  const userDid = c.get('did');

  if (!uri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  const existing = await db.query.bookmarks.findFirst({
    where: and(eq(bookmarks.videoUri, uri), eq(bookmarks.authorDid, userDid)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Bookmark not found' });
  }

  await db.delete(bookmarks).where(eq(bookmarks.uri, existing.uri));

  // Decrement bookmark count
  await db
    .update(videos)
    .set({ bookmarkCount: sql`GREATEST(${videos.bookmarkCount} - 1, 0)` })
    .where(eq(videos.uri, uri));

  return c.json({ success: true });
});

/**
 * Get user's bookmarks
 * GET /xrpc/io.exprsn.video.getBookmarks
 */
socialRouter.get('/io.exprsn.video.getBookmarks', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const folder = c.req.query('folder');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  const conditions = [eq(bookmarks.authorDid, userDid)];
  if (folder) {
    conditions.push(eq(bookmarks.folder, folder));
  }
  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(sql`${bookmarks.createdAt} < ${cursorDate}`);
  }

  const results = await db
    .select({
      bookmark: bookmarks,
      video: videos,
    })
    .from(bookmarks)
    .innerJoin(videos, eq(bookmarks.videoUri, videos.uri))
    .where(and(...conditions))
    .orderBy(desc(bookmarks.createdAt))
    .limit(limit);

  const lastResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastResult
      ? lastResult.bookmark.createdAt.toISOString()
      : undefined;

  return c.json({
    bookmarks: results.map((r) => ({
      uri: r.bookmark.uri,
      videoUri: r.bookmark.videoUri,
      folder: r.bookmark.folder,
      createdAt: r.bookmark.createdAt.toISOString(),
      video: r.video,
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Block Endpoints
// =============================================================================

/**
 * Block a user
 * POST /xrpc/io.exprsn.graph.block
 */
socialRouter.post('/io.exprsn.graph.block', authMiddleware, async (c) => {
  const { did } = await c.req.json();
  const userDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  if (did === userDid) {
    throw new HTTPException(400, { message: 'Cannot block yourself' });
  }

  // Check if already blocked
  const existing = await db.query.blocks.findFirst({
    where: and(eq(blocks.blockerDid, userDid), eq(blocks.blockedDid, did)),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Already blocked' });
  }

  const blockId = nanoid();
  const blockUri = `at://${userDid}/io.exprsn.graph.block/${blockId}`;

  await db.insert(blocks).values({
    uri: blockUri,
    cid: nanoid(),
    blockerDid: userDid,
    blockedDid: did,
    createdAt: new Date(),
  });

  return c.json({ uri: blockUri });
});

/**
 * Unblock a user
 * POST /xrpc/io.exprsn.graph.unblock
 */
socialRouter.post('/io.exprsn.graph.unblock', authMiddleware, async (c) => {
  const { did } = await c.req.json();
  const userDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  const existing = await db.query.blocks.findFirst({
    where: and(eq(blocks.blockerDid, userDid), eq(blocks.blockedDid, did)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Block not found' });
  }

  await db.delete(blocks).where(eq(blocks.uri, existing.uri));

  return c.json({ success: true });
});

/**
 * Get blocked users
 * GET /xrpc/io.exprsn.graph.getBlocks
 */
socialRouter.get('/io.exprsn.graph.getBlocks', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  const conditions = [eq(blocks.blockerDid, userDid)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(sql`${blocks.createdAt} < ${cursorDate}`);
  }

  const results = await db
    .select({
      block: blocks,
      user: users,
    })
    .from(blocks)
    .innerJoin(users, eq(blocks.blockedDid, users.did))
    .where(and(...conditions))
    .orderBy(desc(blocks.createdAt))
    .limit(limit);

  const lastResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastResult
      ? lastResult.block.createdAt.toISOString()
      : undefined;

  return c.json({
    blocks: results.map((r) => ({
      uri: r.block.uri,
      did: r.user.did,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatar: r.user.avatar,
      createdAt: r.block.createdAt.toISOString(),
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Mute Endpoints
// =============================================================================

/**
 * Mute a user
 * POST /xrpc/io.exprsn.graph.mute
 */
socialRouter.post('/io.exprsn.graph.mute', authMiddleware, async (c) => {
  const { did } = await c.req.json();
  const userDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  if (did === userDid) {
    throw new HTTPException(400, { message: 'Cannot mute yourself' });
  }

  // Check if already muted
  const existing = await db.query.mutes.findFirst({
    where: and(eq(mutes.muterDid, userDid), eq(mutes.mutedDid, did)),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Already muted' });
  }

  const muteId = nanoid();
  const muteUri = `at://${userDid}/io.exprsn.graph.mute/${muteId}`;

  await db.insert(mutes).values({
    uri: muteUri,
    cid: nanoid(),
    muterDid: userDid,
    mutedDid: did,
    createdAt: new Date(),
  });

  return c.json({ uri: muteUri });
});

/**
 * Unmute a user
 * POST /xrpc/io.exprsn.graph.unmute
 */
socialRouter.post('/io.exprsn.graph.unmute', authMiddleware, async (c) => {
  const { did } = await c.req.json();
  const userDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  const existing = await db.query.mutes.findFirst({
    where: and(eq(mutes.muterDid, userDid), eq(mutes.mutedDid, did)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Mute not found' });
  }

  await db.delete(mutes).where(eq(mutes.uri, existing.uri));

  return c.json({ success: true });
});

/**
 * Get muted users
 * GET /xrpc/io.exprsn.graph.getMutes
 */
socialRouter.get('/io.exprsn.graph.getMutes', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  const conditions = [eq(mutes.muterDid, userDid)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(sql`${mutes.createdAt} < ${cursorDate}`);
  }

  const results = await db
    .select({
      mute: mutes,
      user: users,
    })
    .from(mutes)
    .innerJoin(users, eq(mutes.mutedDid, users.did))
    .where(and(...conditions))
    .orderBy(desc(mutes.createdAt))
    .limit(limit);

  const lastResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastResult
      ? lastResult.mute.createdAt.toISOString()
      : undefined;

  return c.json({
    mutes: results.map((r) => ({
      uri: r.mute.uri,
      did: r.user.did,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatar: r.user.avatar,
      createdAt: r.mute.createdAt.toISOString(),
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Report Endpoints
// =============================================================================

/**
 * Report content
 * POST /xrpc/io.exprsn.video.report
 */
socialRouter.post('/io.exprsn.video.report', authMiddleware, async (c) => {
  const { uri, cid, reason, description, contentType } = await c.req.json();
  const userDid = c.get('did');

  if (!uri || !reason) {
    throw new HTTPException(400, { message: 'Content URI and reason are required' });
  }

  const validReasons = [
    'spam',
    'harassment',
    'hate_speech',
    'violence',
    'nudity',
    'misinformation',
    'copyright',
    'self_harm',
    'other',
  ];

  if (!validReasons.includes(reason)) {
    throw new HTTPException(400, { message: 'Invalid report reason' });
  }

  const reportId = nanoid();

  await db.insert(contentReports).values({
    id: reportId,
    reporterDid: userDid,
    contentType: contentType || 'video',
    contentUri: uri,
    reason,
    description: description || null,
    status: 'pending',
  });

  return c.json({ reportId, success: true });
});

// =============================================================================
// Notification Subscription Endpoints
// =============================================================================

/**
 * Get notification preferences
 * GET /xrpc/io.exprsn.notification.getSubscription
 */
socialRouter.get('/io.exprsn.notification.getSubscription', authMiddleware, async (c) => {
  const userDid = c.get('did');

  const subscription = await db.query.notificationSubscriptions.findFirst({
    where: eq(notificationSubscriptions.userDid, userDid),
  });

  if (!subscription) {
    // Return defaults
    return c.json({
      subscription: {
        likes: true,
        comments: true,
        follows: true,
        mentions: true,
        reposts: true,
        messages: true,
        fromFollowingOnly: false,
        pushEnabled: true,
        emailEnabled: false,
      },
    });
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
 * Update notification preferences
 * POST /xrpc/io.exprsn.notification.updateSubscription
 */
socialRouter.post('/io.exprsn.notification.updateSubscription', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const updates = await c.req.json();

  const existing = await db.query.notificationSubscriptions.findFirst({
    where: eq(notificationSubscriptions.userDid, userDid),
  });

  if (existing) {
    await db
      .update(notificationSubscriptions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(notificationSubscriptions.userDid, userDid));
  } else {
    await db.insert(notificationSubscriptions).values({
      userDid,
      likes: updates.likes ?? true,
      comments: updates.comments ?? true,
      follows: updates.follows ?? true,
      mentions: updates.mentions ?? true,
      reposts: updates.reposts ?? true,
      messages: updates.messages ?? true,
      fromFollowingOnly: updates.fromFollowingOnly ?? false,
      pushEnabled: updates.pushEnabled ?? true,
      emailEnabled: updates.emailEnabled ?? false,
    });
  }

  return c.json({ success: true });
});

// =============================================================================
// Helper: Check if user is blocked
// =============================================================================

export async function isBlocked(userDid: string, targetDid: string): Promise<boolean> {
  const block = await db.query.blocks.findFirst({
    where: and(eq(blocks.blockerDid, targetDid), eq(blocks.blockedDid, userDid)),
  });
  return !!block;
}

export async function isMuted(userDid: string, targetDid: string): Promise<boolean> {
  const mute = await db.query.mutes.findFirst({
    where: and(eq(mutes.muterDid, userDid), eq(mutes.mutedDid, targetDid)),
  });
  return !!mute;
}
