import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import {
  db,
  users,
  videos,
  follows,
  likes,
  reposts,
  bookmarks,
  trendingVideos,
} from '../db/index.js';
import { eq, desc, and, or, sql, lt, inArray } from 'drizzle-orm';

export const feedRouter = new Hono();

// Helper to build video view
async function buildVideoView(video: typeof videos.$inferSelect, viewerDid?: string) {
  const author = await db.query.users.findFirst({
    where: eq(users.did, video.authorDid),
  });

  let viewer = undefined;
  if (viewerDid) {
    const [likeRecord, repostRecord, bookmarkRecord] = await Promise.all([
      db.query.likes.findFirst({
        where: and(eq(likes.videoUri, video.uri), eq(likes.authorDid, viewerDid)),
      }),
      db.query.reposts.findFirst({
        where: and(eq(reposts.videoUri, video.uri), eq(reposts.authorDid, viewerDid)),
      }),
      db.query.bookmarks.findFirst({
        where: and(eq(bookmarks.videoUri, video.uri), eq(bookmarks.authorDid, viewerDid)),
      }),
    ]);

    viewer = {
      liked: !!likeRecord,
      likeUri: likeRecord?.uri,
      reposted: !!repostRecord,
      repostUri: repostRecord?.uri,
      bookmarked: !!bookmarkRecord,
      bookmarkUri: bookmarkRecord?.uri,
    };
  }

  return {
    uri: video.uri,
    cid: video.cid,
    author: {
      did: author?.did || video.authorDid,
      handle: author?.handle || 'unknown',
      displayName: author?.displayName,
      avatar: author?.avatar,
      verified: author?.verified,
    },
    video: {
      thumbnail: video.thumbnailUrl,
      aspectRatio: video.aspectRatio,
      duration: video.duration,
      cdnUrl: video.cdnUrl,
      hlsPlaylist: video.hlsPlaylist,
    },
    caption: video.caption,
    tags: video.tags,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    shareCount: video.shareCount,
    repostCount: video.repostCount,
    bookmarkCount: video.bookmarkCount,
    createdAt: video.createdAt.toISOString(),
    indexedAt: video.indexedAt.toISOString(),
    viewer,
  };
}

// =============================================================================
// Feed Endpoints
// =============================================================================

/**
 * Get timeline (videos from followed users)
 * GET /xrpc/io.exprsn.feed.getTimeline
 */
feedRouter.get('/io.exprsn.feed.getTimeline', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  // Get followed user DIDs
  const followedUsers = await db
    .select({ did: follows.followeeDid })
    .from(follows)
    .where(eq(follows.followerDid, userDid));

  const followedDids = followedUsers.map((f) => f.did);

  if (followedDids.length === 0) {
    return c.json({ feed: [], cursor: undefined });
  }

  // Get videos from followed users
  let query = db
    .select()
    .from(videos)
    .where(inArray(videos.authorDid, followedDids))
    .orderBy(desc(videos.createdAt))
    .limit(limit);

  if (cursor) {
    const cursorDate = new Date(cursor);
    query = query.where(lt(videos.createdAt, cursorDate)) as typeof query;
  }

  const results = await query;

  // Build feed with video views
  const feed = await Promise.all(
    results.map(async (video) => ({
      post: await buildVideoView(video, userDid),
    }))
  );

  const nextCursor =
    results.length === limit
      ? results[results.length - 1].createdAt.toISOString()
      : undefined;

  return c.json({
    feed,
    cursor: nextCursor,
  });
});

/**
 * Get videos liked by a user
 * GET /xrpc/io.exprsn.feed.getActorLikes
 */
feedRouter.get('/io.exprsn.feed.getActorLikes', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const handle = c.req.query('handle');
  const viewerDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  if (!did && !handle) {
    throw new HTTPException(400, { message: 'Either did or handle is required' });
  }

  // Find the user
  const user = await db.query.users.findFirst({
    where: did ? eq(users.did, did) : eq(users.handle, handle!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Get likes with video data
  let query = db
    .select({
      like: likes,
      video: videos,
    })
    .from(likes)
    .innerJoin(videos, eq(likes.videoUri, videos.uri))
    .where(eq(likes.authorDid, user.did))
    .orderBy(desc(likes.createdAt))
    .limit(limit);

  if (cursor) {
    const cursorDate = new Date(cursor);
    query = query.where(lt(likes.createdAt, cursorDate)) as typeof query;
  }

  const results = await query;

  const feed = await Promise.all(
    results.map(async (r) => await buildVideoView(r.video, viewerDid))
  );

  const nextCursor =
    results.length === limit
      ? results[results.length - 1].like.createdAt.toISOString()
      : undefined;

  return c.json({
    feed,
    cursor: nextCursor,
  });
});

/**
 * Get suggested/for-you feed
 * GET /xrpc/io.exprsn.feed.getSuggestedFeed
 */
feedRouter.get('/io.exprsn.feed.getSuggestedFeed', optionalAuthMiddleware, async (c) => {
  const viewerDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const cursor = c.req.query('cursor');

  // Get trending videos combined with recent popular videos
  let query = db
    .select({
      video: videos,
      trendingScore: trendingVideos.score,
    })
    .from(videos)
    .leftJoin(trendingVideos, eq(videos.uri, trendingVideos.videoUri))
    .where(eq(videos.visibility, 'public'))
    .orderBy(
      desc(sql`COALESCE(${trendingVideos.score}, 0) + ${videos.viewCount} * 0.001`)
    )
    .limit(limit);

  if (cursor) {
    const cursorScore = parseFloat(cursor);
    query = query.where(
      sql`COALESCE(${trendingVideos.score}, 0) + ${videos.viewCount} * 0.001 < ${cursorScore}`
    ) as typeof query;
  }

  const results = await query;

  const feed = await Promise.all(
    results.map(async (r) => await buildVideoView(r.video, viewerDid))
  );

  const nextCursor =
    results.length === limit
      ? (
          (results[results.length - 1].trendingScore || 0) +
          results[results.length - 1].video.viewCount * 0.001
        ).toString()
      : undefined;

  return c.json({
    feed,
    cursor: nextCursor,
  });
});

/**
 * Get actor's feed (posts and/or reposts)
 * GET /xrpc/io.exprsn.feed.getActorFeed
 */
feedRouter.get('/io.exprsn.feed.getActorFeed', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const handle = c.req.query('handle');
  const viewerDid = c.get('did');
  const filter = c.req.query('filter') || 'posts_and_reposts';
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  if (!did && !handle) {
    throw new HTTPException(400, { message: 'Either did or handle is required' });
  }

  // Find the user
  const user = await db.query.users.findFirst({
    where: did ? eq(users.did, did) : eq(users.handle, handle!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  type FeedItem = {
    video: typeof videos.$inferSelect;
    isRepost: boolean;
    repostBy?: { did: string; handle: string; displayName?: string | null; avatar?: string | null };
    timestamp: Date;
  };

  const feedItems: FeedItem[] = [];

  // Get posts if filter includes posts
  if (filter === 'posts' || filter === 'posts_and_reposts') {
    let postsQuery = db
      .select()
      .from(videos)
      .where(eq(videos.authorDid, user.did))
      .orderBy(desc(videos.createdAt))
      .limit(limit);

    if (cursor) {
      const cursorDate = new Date(cursor);
      postsQuery = postsQuery.where(lt(videos.createdAt, cursorDate)) as typeof postsQuery;
    }

    const posts = await postsQuery;
    feedItems.push(
      ...posts.map((v) => ({
        video: v,
        isRepost: false,
        timestamp: v.createdAt,
      }))
    );
  }

  // Get reposts if filter includes reposts
  if (filter === 'reposts' || filter === 'posts_and_reposts') {
    let repostsQuery = db
      .select({
        repost: reposts,
        video: videos,
      })
      .from(reposts)
      .innerJoin(videos, eq(reposts.videoUri, videos.uri))
      .where(eq(reposts.authorDid, user.did))
      .orderBy(desc(reposts.createdAt))
      .limit(limit);

    if (cursor) {
      const cursorDate = new Date(cursor);
      repostsQuery = repostsQuery.where(lt(reposts.createdAt, cursorDate)) as typeof repostsQuery;
    }

    const repostResults = await repostsQuery;
    feedItems.push(
      ...repostResults.map((r) => ({
        video: r.video,
        isRepost: true,
        repostBy: {
          did: user.did,
          handle: user.handle,
          displayName: user.displayName,
          avatar: user.avatar,
        },
        timestamp: r.repost.createdAt,
      }))
    );
  }

  // Sort combined results by timestamp
  feedItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply limit
  const limitedItems = feedItems.slice(0, limit);

  // Build feed
  const feed = await Promise.all(
    limitedItems.map(async (item) => {
      const post = await buildVideoView(item.video, viewerDid);
      return {
        post,
        reason: item.isRepost
          ? {
              $type: 'io.exprsn.feed.getTimeline#reasonRepost',
              by: item.repostBy,
              indexedAt: item.timestamp.toISOString(),
            }
          : undefined,
      };
    })
  );

  const nextCursor =
    limitedItems.length === limit
      ? limitedItems[limitedItems.length - 1].timestamp.toISOString()
      : undefined;

  return c.json({
    feed,
    cursor: nextCursor,
  });
});
