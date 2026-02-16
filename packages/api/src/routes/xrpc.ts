import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db, videos, users, likes, comments, sounds, follows, trendingVideos } from '../db/index.js';
import { cacheService, CacheKeys, CACHE_TTL } from '../cache/redis.js';
import { eq, desc, inArray, and, sql, lt } from 'drizzle-orm';
import type { VideoView, AuthorView, FeedResult } from '@exprsn/shared';

export const xrpcRouter = new Hono();

// =============================================================================
// Query Endpoints (GET)
// =============================================================================

/**
 * Get video feed
 * GET /xrpc/io.exprsn.video.getFeed
 */
xrpcRouter.get('/io.exprsn.video.getFeed', optionalAuthMiddleware, async (c) => {
  const feed = c.req.query('feed') || 'trending';
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');
  const userDid = c.get('did');

  let result: FeedResult;

  switch (feed) {
    case 'following':
      if (!userDid) {
        throw new HTTPException(401, { message: 'Authentication required for following feed' });
      }
      result = await getFollowingFeed(userDid, cursor, limit);
      break;
    case 'trending':
      result = await getTrendingFeed(cursor, limit);
      break;
    case 'foryou':
      result = await getForYouFeed(userDid, cursor, limit);
      break;
    default:
      if (feed.startsWith('sound:')) {
        result = await getSoundFeed(feed.slice(6), cursor, limit);
      } else if (feed.startsWith('tag:')) {
        result = await getHashtagFeed(feed.slice(4), cursor, limit);
      } else {
        throw new HTTPException(400, { message: `Unknown feed type: ${feed}` });
      }
  }

  // Hydrate posts with full details
  const hydratedFeed = await hydrateVideos(
    result.feed.map((f) => f.post),
    userDid
  );

  return c.json({
    feed: hydratedFeed,
    cursor: result.cursor,
  });
});

/**
 * Get single video
 * GET /xrpc/io.exprsn.video.getVideo
 */
xrpcRouter.get('/io.exprsn.video.getVideo', optionalAuthMiddleware, async (c) => {
  const uri = c.req.query('uri');
  const userDid = c.get('did');

  if (!uri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, uri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  const [hydrated] = await hydrateVideos([uri], userDid);

  return c.json({ video: hydrated });
});

/**
 * Get video comments
 * GET /xrpc/io.exprsn.video.getComments
 */
xrpcRouter.get('/io.exprsn.video.getComments', optionalAuthMiddleware, async (c) => {
  const uri = c.req.query('uri');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');
  const sort = c.req.query('sort') || 'top';

  if (!uri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  let query = db
    .select()
    .from(comments)
    .where(and(eq(comments.videoUri, uri), sql`${comments.parentUri} IS NULL`))
    .limit(limit);

  if (sort === 'top') {
    query = query.orderBy(desc(comments.likeCount), desc(comments.createdAt));
  } else {
    query = query.orderBy(desc(comments.createdAt));
  }

  if (cursor) {
    const cursorDate = new Date(parseInt(cursor, 10));
    query = query.where(lt(comments.createdAt, cursorDate));
  }

  const results = await query;

  // Get authors for comments
  const authorDids = [...new Set(results.map((c) => c.authorDid))];
  const authors = await db.select().from(users).where(inArray(users.did, authorDids));
  const authorMap = new Map(authors.map((a) => [a.did, a]));

  const commentViews = results.map((comment) => {
    const author = authorMap.get(comment.authorDid);
    return {
      uri: comment.uri,
      cid: comment.cid,
      author: author
        ? {
            did: author.did,
            handle: author.handle,
            displayName: author.displayName,
            avatar: author.avatar,
          }
        : { did: comment.authorDid, handle: 'unknown' },
      text: comment.text,
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      createdAt: comment.createdAt.toISOString(),
    };
  });

  return c.json({
    comments: commentViews,
    cursor:
      results.length === limit ? results[results.length - 1]!.createdAt.getTime().toString() : undefined,
  });
});

/**
 * Get sounds
 * GET /xrpc/io.exprsn.video.getSounds
 */
xrpcRouter.get('/io.exprsn.video.getSounds', async (c) => {
  const query = c.req.query('query');
  const trending = c.req.query('trending') === 'true';
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);

  let results;

  if (trending) {
    results = await db.select().from(sounds).orderBy(desc(sounds.useCount)).limit(limit);
  } else if (query) {
    results = await db
      .select()
      .from(sounds)
      .where(sql`${sounds.title} ILIKE ${`%${query}%`}`)
      .orderBy(desc(sounds.useCount))
      .limit(limit);
  } else {
    results = await db.select().from(sounds).orderBy(desc(sounds.createdAt)).limit(limit);
  }

  return c.json({
    sounds: results.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      duration: s.duration,
      audioUrl: s.audioUrl,
      coverUrl: s.coverUrl,
      useCount: s.useCount,
      originalVideoUri: s.originalVideoUri,
    })),
  });
});

/**
 * Search
 * GET /xrpc/io.exprsn.video.search
 */
xrpcRouter.get('/io.exprsn.video.search', optionalAuthMiddleware, async (c) => {
  const q = c.req.query('q');
  const type = c.req.query('type') || 'all';
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);

  if (!q || q.length < 1) {
    throw new HTTPException(400, { message: 'Search query is required' });
  }

  const results: {
    videos?: unknown[];
    users?: unknown[];
    sounds?: unknown[];
  } = {};

  if (type === 'all' || type === 'videos') {
    const videoResults = await db
      .select()
      .from(videos)
      .where(sql`${videos.caption} ILIKE ${`%${q}%`}`)
      .orderBy(desc(videos.likeCount))
      .limit(limit);

    const hydratedVideos = await hydrateVideos(
      videoResults.map((v) => v.uri),
      c.get('did')
    );
    results.videos = hydratedVideos;
  }

  if (type === 'all' || type === 'users') {
    const userResults = await db
      .select()
      .from(users)
      .where(
        sql`${users.handle} ILIKE ${`%${q}%`} OR ${users.displayName} ILIKE ${`%${q}%`}`
      )
      .orderBy(desc(users.followerCount))
      .limit(limit);

    results.users = userResults.map((u) => ({
      did: u.did,
      handle: u.handle,
      displayName: u.displayName,
      avatar: u.avatar,
      bio: u.bio,
      followerCount: u.followerCount,
      videoCount: u.videoCount,
      verified: u.verified,
    }));
  }

  if (type === 'all' || type === 'sounds') {
    const soundResults = await db
      .select()
      .from(sounds)
      .where(sql`${sounds.title} ILIKE ${`%${q}%`}`)
      .orderBy(desc(sounds.useCount))
      .limit(limit);

    results.sounds = soundResults.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      duration: s.duration,
      audioUrl: s.audioUrl,
      useCount: s.useCount,
    }));
  }

  return c.json(results);
});

// =============================================================================
// Procedure Endpoints (POST)
// =============================================================================

/**
 * Get upload URL
 * POST /xrpc/io.exprsn.video.uploadVideo
 */
xrpcRouter.post('/io.exprsn.video.uploadVideo', authMiddleware, async (c) => {
  const { contentType } = await c.req.json<{ contentType: string; size?: number }>();
  const userDid = c.get('did');

  if (!contentType || !contentType.startsWith('video/')) {
    throw new HTTPException(400, { message: 'Invalid content type' });
  }

  // Import upload service dynamically to avoid circular deps
  const { uploadService } = await import('../services/upload.js');
  const result = await uploadService.getUploadUrl(userDid, contentType);

  return c.json(result);
});

/**
 * Complete upload
 * POST /xrpc/io.exprsn.video.completeUpload
 */
xrpcRouter.post('/io.exprsn.video.completeUpload', authMiddleware, async (c) => {
  const { uploadId } = await c.req.json<{ uploadId: string }>();

  if (!uploadId) {
    throw new HTTPException(400, { message: 'Upload ID is required' });
  }

  const { uploadService } = await import('../services/upload.js');
  await uploadService.completeUpload(uploadId);

  return c.json({ status: 'processing' });
});

/**
 * Get upload status
 * GET /xrpc/io.exprsn.video.getUploadStatus
 */
xrpcRouter.get('/io.exprsn.video.getUploadStatus', authMiddleware, async (c) => {
  const uploadId = c.req.query('uploadId');

  if (!uploadId) {
    throw new HTTPException(400, { message: 'Upload ID is required' });
  }

  const { uploadService } = await import('../services/upload.js');
  const status = await uploadService.getUploadStatus(uploadId);

  if (!status) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }

  return c.json(status);
});

/**
 * Create video post
 * POST /xrpc/io.exprsn.video.createPost
 */
xrpcRouter.post('/io.exprsn.video.createPost', authMiddleware, async (c) => {
  const session = c.get('session');
  const data = await c.req.json();

  // Validate upload is complete
  const uploadStatus = await cacheService.get(CacheKeys.upload(data.uploadId));
  if (!uploadStatus || (uploadStatus as { status: string }).status !== 'completed') {
    throw new HTTPException(400, { message: 'Upload not ready' });
  }

  const { cdnUrl, hlsPlaylist, thumbnail } = uploadStatus as {
    cdnUrl: string;
    hlsPlaylist: string;
    thumbnail: string;
  };

  // Create record in user's PDS via the session agent
  const record = {
    $type: 'io.exprsn.video.post',
    video: {
      blob: data.blob,
      thumbnail: data.thumbnail,
      aspectRatio: data.aspectRatio,
      duration: data.duration,
      cdnUrl,
      hlsPlaylist,
    },
    caption: data.caption,
    tags: data.tags,
    sound: data.sound,
    visibility: data.visibility || 'public',
    allowDuet: data.allowDuet ?? true,
    allowStitch: data.allowStitch ?? true,
    allowComments: data.allowComments ?? true,
    createdAt: new Date().toISOString(),
  };

  const agent = session.agent;
  const result = await agent.api.com.atproto.repo.createRecord({
    repo: session.did,
    collection: 'io.exprsn.video.post',
    record,
  });

  return c.json({
    uri: result.data.uri,
    cid: result.data.cid,
  });
});

/**
 * Like a video
 * POST /xrpc/io.exprsn.video.like
 */
xrpcRouter.post('/io.exprsn.video.like', authMiddleware, async (c) => {
  const session = c.get('session');
  const { uri, cid } = await c.req.json<{ uri: string; cid: string }>();

  if (!uri || !cid) {
    throw new HTTPException(400, { message: 'URI and CID are required' });
  }

  const agent = session.agent;
  const result = await agent.api.com.atproto.repo.createRecord({
    repo: session.did,
    collection: 'io.exprsn.video.like',
    record: {
      $type: 'io.exprsn.video.like',
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    },
  });

  // Increment cached like count
  await cacheService.incrementCounter(CacheKeys.likeCount(uri));

  return c.json({ uri: result.data.uri });
});

/**
 * Unlike a video
 * POST /xrpc/io.exprsn.video.unlike
 */
xrpcRouter.post('/io.exprsn.video.unlike', authMiddleware, async (c) => {
  const session = c.get('session');
  const { likeUri } = await c.req.json<{ likeUri: string }>();

  if (!likeUri) {
    throw new HTTPException(400, { message: 'Like URI is required' });
  }

  // Parse the URI to get rkey
  const parts = likeUri.split('/');
  const rkey = parts[parts.length - 1];

  const agent = session.agent;
  await agent.api.com.atproto.repo.deleteRecord({
    repo: session.did,
    collection: 'io.exprsn.video.like',
    rkey: rkey!,
  });

  return c.json({ success: true });
});

// =============================================================================
// Helper Functions
// =============================================================================

async function getFollowingFeed(
  userDid: string,
  cursor?: string,
  limit = 30
): Promise<FeedResult> {
  // Get list of followed DIDs
  const followingResult = await db
    .select({ did: follows.followeeDid })
    .from(follows)
    .where(eq(follows.followerDid, userDid));

  const followingDids = followingResult.map((f) => f.did);

  if (followingDids.length === 0) {
    return { feed: [] };
  }

  let query = db
    .select()
    .from(videos)
    .where(and(inArray(videos.authorDid, followingDids), eq(videos.visibility, 'public')))
    .orderBy(desc(videos.createdAt))
    .limit(limit);

  if (cursor) {
    const cursorDate = new Date(parseInt(cursor, 10));
    query = query.where(lt(videos.createdAt, cursorDate));
  }

  const results = await query;

  return {
    feed: results.map((v) => ({ post: v.uri })),
    cursor:
      results.length > 0 ? results[results.length - 1]!.createdAt.getTime().toString() : undefined,
  };
}

async function getTrendingFeed(cursor?: string, limit = 30): Promise<FeedResult> {
  const offset = cursor ? parseInt(cursor, 10) : 0;

  const results = await db
    .select()
    .from(trendingVideos)
    .innerJoin(videos, eq(trendingVideos.videoUri, videos.uri))
    .orderBy(desc(trendingVideos.score))
    .limit(limit)
    .offset(offset);

  return {
    feed: results.map((r) => ({ post: r.videos.uri })),
    cursor: results.length === limit ? (offset + limit).toString() : undefined,
  };
}

async function getForYouFeed(
  userDid: string | undefined,
  cursor?: string,
  limit = 30
): Promise<FeedResult> {
  // For now, return trending - ML-powered feed will be added later
  return getTrendingFeed(cursor, limit);
}

async function getSoundFeed(
  soundId: string,
  cursor?: string,
  limit = 30
): Promise<FeedResult> {
  let query = db
    .select()
    .from(videos)
    .where(eq(videos.soundUri, soundId))
    .orderBy(desc(videos.likeCount), desc(videos.createdAt))
    .limit(limit);

  if (cursor) {
    const [likesStr, tsStr] = cursor.split(':');
    const cursorLikes = parseInt(likesStr!, 10);
    const cursorTs = new Date(parseInt(tsStr!, 10));
    query = query.where(
      sql`(${videos.likeCount} < ${cursorLikes}) OR (${videos.likeCount} = ${cursorLikes} AND ${videos.createdAt} < ${cursorTs})`
    );
  }

  const results = await query;

  return {
    feed: results.map((v) => ({ post: v.uri })),
    cursor:
      results.length > 0
        ? `${results[results.length - 1]!.likeCount}:${results[results.length - 1]!.createdAt.getTime()}`
        : undefined,
  };
}

async function getHashtagFeed(
  tag: string,
  cursor?: string,
  limit = 30
): Promise<FeedResult> {
  const normalizedTag = tag.toLowerCase().replace(/^#/, '');
  const offset = cursor ? parseInt(cursor, 10) : 0;

  const results = await db
    .select()
    .from(videos)
    .where(sql`${normalizedTag} = ANY(${videos.tags})`)
    .orderBy(desc(videos.likeCount), desc(videos.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    feed: results.map((v) => ({ post: v.uri })),
    cursor: results.length === limit ? (offset + limit).toString() : undefined,
  };
}

async function hydrateVideos(
  uris: string[],
  viewerDid?: string
): Promise<(VideoView & { author: AuthorView })[]> {
  if (uris.length === 0) return [];

  // Get videos
  const videoResults = await db.select().from(videos).where(inArray(videos.uri, uris));

  // Get authors
  const authorDids = [...new Set(videoResults.map((v) => v.authorDid))];
  const authorResults = await db.select().from(users).where(inArray(users.did, authorDids));
  const authorMap = new Map(authorResults.map((a) => [a.did, a]));

  // Get viewer's likes if authenticated
  let viewerLikes = new Map<string, string>();
  if (viewerDid) {
    const likeResults = await db
      .select()
      .from(likes)
      .where(and(inArray(likes.videoUri, uris), eq(likes.authorDid, viewerDid)));
    viewerLikes = new Map(likeResults.map((l) => [l.videoUri, l.uri]));
  }

  // Build hydrated response maintaining order
  const videoMap = new Map(videoResults.map((v) => [v.uri, v]));

  return uris
    .map((uri) => {
      const video = videoMap.get(uri);
      if (!video) return null;

      const author = authorMap.get(video.authorDid);

      return {
        uri: video.uri,
        cid: video.cid,
        author: author
          ? {
              did: author.did,
              handle: author.handle,
              displayName: author.displayName ?? undefined,
              avatar: author.avatar ?? undefined,
              verified: author.verified,
            }
          : { did: video.authorDid, handle: 'unknown' },
        video: {
          thumbnail: video.thumbnailUrl ?? undefined,
          aspectRatio: video.aspectRatio ?? { width: 9, height: 16 },
          duration: video.duration ?? 0,
          cdnUrl: video.cdnUrl ?? undefined,
          hlsPlaylist: video.hlsPlaylist ?? undefined,
        },
        caption: video.caption ?? undefined,
        tags: video.tags,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        shareCount: video.shareCount,
        viewCount: video.viewCount,
        viewerLike: viewerLikes.get(uri),
        indexedAt: video.indexedAt.toISOString(),
        createdAt: video.createdAt.toISOString(),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
}
