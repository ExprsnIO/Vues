import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db, videos, users, stitches, duets, shares, sounds, comments } from '../db/index.js';
import { eq, desc, and, sql, like, ilike } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const videoExtendedRouter = new Hono();

// =============================================================================
// Stitch Endpoints
// =============================================================================

/**
 * Create a stitch (video using clip from another video)
 * POST /xrpc/io.exprsn.video.stitch
 */
videoExtendedRouter.post('/io.exprsn.video.stitch', authMiddleware, async (c) => {
  const { videoUri, originalVideoUri, startTime, endTime } = await c.req.json();
  const userDid = c.get('did');

  if (!videoUri || !originalVideoUri) {
    throw new HTTPException(400, { message: 'Video URI and original video URI are required' });
  }

  if (endTime === undefined || endTime <= 0) {
    throw new HTTPException(400, { message: 'End time is required and must be positive' });
  }

  // Verify both videos exist
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, videoUri),
  });

  const originalVideo = await db.query.videos.findFirst({
    where: eq(videos.uri, originalVideoUri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  if (!originalVideo) {
    throw new HTTPException(404, { message: 'Original video not found' });
  }

  // Check if original video allows stitching
  if (!originalVideo.allowStitch) {
    throw new HTTPException(403, { message: 'Original video does not allow stitching' });
  }

  const stitchId = nanoid();
  const stitchUri = `at://${userDid}/io.exprsn.video.stitch/${stitchId}`;

  await db.insert(stitches).values({
    uri: stitchUri,
    cid: nanoid(),
    videoUri,
    originalVideoUri,
    authorDid: userDid,
    startTime: startTime || 0,
    endTime,
    createdAt: new Date(),
  });

  return c.json({ uri: stitchUri });
});

/**
 * Get stitches of a video
 * GET /xrpc/io.exprsn.video.getStitches
 */
videoExtendedRouter.get('/io.exprsn.video.getStitches', optionalAuthMiddleware, async (c) => {
  const uri = c.req.query('uri');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  if (!uri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  let query = db
    .select({
      stitch: stitches,
      video: videos,
      author: users,
    })
    .from(stitches)
    .innerJoin(videos, eq(stitches.videoUri, videos.uri))
    .innerJoin(users, eq(videos.authorDid, users.did))
    .where(eq(stitches.originalVideoUri, uri))
    .orderBy(desc(stitches.createdAt))
    .limit(limit);

  if (cursor) {
    const cursorDate = new Date(cursor);
    query = query.where(sql`${stitches.createdAt} < ${cursorDate}`) as typeof query;
  }

  const results = await query;

  const nextCursor =
    results.length === limit
      ? results[results.length - 1].stitch.createdAt.toISOString()
      : undefined;

  return c.json({
    stitches: results.map((r) => ({
      uri: r.stitch.uri,
      video: {
        uri: r.video.uri,
        cid: r.video.cid,
        caption: r.video.caption,
        cdnUrl: r.video.cdnUrl,
        thumbnailUrl: r.video.thumbnailUrl,
        viewCount: r.video.viewCount,
        likeCount: r.video.likeCount,
        createdAt: r.video.createdAt.toISOString(),
      },
      author: {
        did: r.author.did,
        handle: r.author.handle,
        displayName: r.author.displayName,
        avatar: r.author.avatar,
      },
      startTime: r.stitch.startTime,
      endTime: r.stitch.endTime,
      createdAt: r.stitch.createdAt.toISOString(),
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Duet Endpoints
// =============================================================================

/**
 * Create a duet (side-by-side video response)
 * POST /xrpc/io.exprsn.video.duet
 */
videoExtendedRouter.post('/io.exprsn.video.duet', authMiddleware, async (c) => {
  const { videoUri, originalVideoUri, layout } = await c.req.json();
  const userDid = c.get('did');

  if (!videoUri || !originalVideoUri) {
    throw new HTTPException(400, { message: 'Video URI and original video URI are required' });
  }

  // Verify both videos exist
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, videoUri),
  });

  const originalVideo = await db.query.videos.findFirst({
    where: eq(videos.uri, originalVideoUri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  if (!originalVideo) {
    throw new HTTPException(404, { message: 'Original video not found' });
  }

  // Check if original video allows duets
  if (!originalVideo.allowDuet) {
    throw new HTTPException(403, { message: 'Original video does not allow duets' });
  }

  const duetId = nanoid();
  const duetUri = `at://${userDid}/io.exprsn.video.duet/${duetId}`;

  await db.insert(duets).values({
    uri: duetUri,
    cid: nanoid(),
    videoUri,
    originalVideoUri,
    authorDid: userDid,
    layout: layout || 'side-by-side',
    createdAt: new Date(),
  });

  return c.json({ uri: duetUri });
});

/**
 * Get duets of a video
 * GET /xrpc/io.exprsn.video.getDuets
 */
videoExtendedRouter.get('/io.exprsn.video.getDuets', optionalAuthMiddleware, async (c) => {
  const uri = c.req.query('uri');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  if (!uri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  let query = db
    .select({
      duet: duets,
      video: videos,
      author: users,
    })
    .from(duets)
    .innerJoin(videos, eq(duets.videoUri, videos.uri))
    .innerJoin(users, eq(videos.authorDid, users.did))
    .where(eq(duets.originalVideoUri, uri))
    .orderBy(desc(duets.createdAt))
    .limit(limit);

  if (cursor) {
    const cursorDate = new Date(cursor);
    query = query.where(sql`${duets.createdAt} < ${cursorDate}`) as typeof query;
  }

  const results = await query;

  const nextCursor =
    results.length === limit ? results[results.length - 1].duet.createdAt.toISOString() : undefined;

  return c.json({
    duets: results.map((r) => ({
      uri: r.duet.uri,
      video: {
        uri: r.video.uri,
        cid: r.video.cid,
        caption: r.video.caption,
        cdnUrl: r.video.cdnUrl,
        thumbnailUrl: r.video.thumbnailUrl,
        viewCount: r.video.viewCount,
        likeCount: r.video.likeCount,
        createdAt: r.video.createdAt.toISOString(),
      },
      author: {
        did: r.author.did,
        handle: r.author.handle,
        displayName: r.author.displayName,
        avatar: r.author.avatar,
      },
      layout: r.duet.layout,
      createdAt: r.duet.createdAt.toISOString(),
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Sound Endpoints
// =============================================================================

/**
 * Get videos using a specific sound
 * GET /xrpc/io.exprsn.video.getVideosBySound
 */
videoExtendedRouter.get('/io.exprsn.video.getVideosBySound', optionalAuthMiddleware, async (c) => {
  const soundId = c.req.query('soundId');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  if (!soundId) {
    throw new HTTPException(400, { message: 'Sound ID is required' });
  }

  // Get sound info
  const sound = await db.query.sounds.findFirst({
    where: eq(sounds.id, soundId),
  });

  if (!sound) {
    throw new HTTPException(404, { message: 'Sound not found' });
  }

  let query = db
    .select({
      video: videos,
      author: users,
    })
    .from(videos)
    .innerJoin(users, eq(videos.authorDid, users.did))
    .where(eq(videos.soundUri, soundId))
    .orderBy(desc(videos.viewCount))
    .limit(limit);

  if (cursor) {
    const cursorInt = parseInt(cursor, 10);
    query = query.where(sql`${videos.viewCount} < ${cursorInt}`) as typeof query;
  }

  const results = await query;

  const nextCursor =
    results.length === limit ? results[results.length - 1].video.viewCount.toString() : undefined;

  return c.json({
    sound: {
      id: sound.id,
      title: sound.title,
      artist: sound.artist,
      duration: sound.duration,
      audioUrl: sound.audioUrl,
      coverUrl: sound.coverUrl,
      useCount: sound.useCount,
    },
    videos: results.map((r) => ({
      uri: r.video.uri,
      cid: r.video.cid,
      caption: r.video.caption,
      cdnUrl: r.video.cdnUrl,
      thumbnailUrl: r.video.thumbnailUrl,
      duration: r.video.duration,
      viewCount: r.video.viewCount,
      likeCount: r.video.likeCount,
      commentCount: r.video.commentCount,
      shareCount: r.video.shareCount,
      createdAt: r.video.createdAt.toISOString(),
      author: {
        did: r.author.did,
        handle: r.author.handle,
        displayName: r.author.displayName,
        avatar: r.author.avatar,
        verified: r.author.verified,
      },
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Tag/Hashtag Endpoints
// =============================================================================

/**
 * Get videos with a specific tag/hashtag
 * GET /xrpc/io.exprsn.video.getVideosByTag
 */
videoExtendedRouter.get('/io.exprsn.video.getVideosByTag', optionalAuthMiddleware, async (c) => {
  const tag = c.req.query('tag');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  if (!tag) {
    throw new HTTPException(400, { message: 'Tag is required' });
  }

  // Normalize tag (remove # if present, lowercase)
  const normalizedTag = tag.toLowerCase().replace(/^#/, '');

  let query = db
    .select({
      video: videos,
      author: users,
    })
    .from(videos)
    .innerJoin(users, eq(videos.authorDid, users.did))
    .where(sql`${videos.tags} @> ${JSON.stringify([normalizedTag])}::jsonb`)
    .orderBy(desc(videos.viewCount))
    .limit(limit);

  if (cursor) {
    const cursorInt = parseInt(cursor, 10);
    query = query.where(sql`${videos.viewCount} < ${cursorInt}`) as typeof query;
  }

  const results = await query;

  // Calculate total video count for this tag
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(videos)
    .where(sql`${videos.tags} @> ${JSON.stringify([normalizedTag])}::jsonb`);

  const totalVideos = countResult[0]?.count || 0;

  const nextCursor =
    results.length === limit ? results[results.length - 1].video.viewCount.toString() : undefined;

  return c.json({
    tag: {
      name: normalizedTag,
      videoCount: Number(totalVideos),
    },
    videos: results.map((r) => ({
      uri: r.video.uri,
      cid: r.video.cid,
      caption: r.video.caption,
      cdnUrl: r.video.cdnUrl,
      thumbnailUrl: r.video.thumbnailUrl,
      duration: r.video.duration,
      viewCount: r.video.viewCount,
      likeCount: r.video.likeCount,
      commentCount: r.video.commentCount,
      shareCount: r.video.shareCount,
      tags: r.video.tags,
      createdAt: r.video.createdAt.toISOString(),
      author: {
        did: r.author.did,
        handle: r.author.handle,
        displayName: r.author.displayName,
        avatar: r.author.avatar,
        verified: r.author.verified,
      },
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// Share Endpoints
// =============================================================================

/**
 * Track a video share
 * POST /xrpc/io.exprsn.video.share
 */
videoExtendedRouter.post('/io.exprsn.video.share', authMiddleware, async (c) => {
  const { videoUri, platform } = await c.req.json();
  const userDid = c.get('did');

  if (!videoUri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  // Verify video exists
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, videoUri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  const shareId = nanoid();
  const shareUri = `at://${userDid}/io.exprsn.video.share/${shareId}`;

  await db.insert(shares).values({
    uri: shareUri,
    cid: nanoid(),
    videoUri,
    authorDid: userDid,
    platform: platform || null,
    createdAt: new Date(),
  });

  // Increment share count
  await db
    .update(videos)
    .set({ shareCount: sql`${videos.shareCount} + 1` })
    .where(eq(videos.uri, videoUri));

  return c.json({ uri: shareUri });
});

// =============================================================================
// Delete Comment Endpoint
// =============================================================================

/**
 * Delete a comment
 * POST /xrpc/io.exprsn.video.deleteComment
 */
videoExtendedRouter.post('/io.exprsn.video.deleteComment', authMiddleware, async (c) => {
  const { uri } = await c.req.json();
  const userDid = c.get('did');

  if (!uri) {
    throw new HTTPException(400, { message: 'Comment URI is required' });
  }

  const comment = await db.query.comments.findFirst({
    where: eq(comments.uri, uri),
  });

  if (!comment) {
    throw new HTTPException(404, { message: 'Comment not found' });
  }

  // Can only delete own comments (or if video owner - but keeping simple for now)
  if (comment.authorDid !== userDid) {
    throw new HTTPException(403, { message: 'Not authorized to delete this comment' });
  }

  // Delete the comment
  await db.delete(comments).where(eq(comments.uri, uri));

  // Decrement comment count on video
  await db
    .update(videos)
    .set({ commentCount: sql`GREATEST(${videos.commentCount} - 1, 0)` })
    .where(eq(videos.uri, comment.videoUri));

  // If this was a reply, decrement reply count on parent
  if (comment.parentUri) {
    await db
      .update(comments)
      .set({ replyCount: sql`GREATEST(${comments.replyCount} - 1, 0)` })
      .where(eq(comments.uri, comment.parentUri));
  }

  return c.json({ success: true });
});
