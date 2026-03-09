import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { uploadRateLimiter, recordUpload, getUploadQuota, sanitizeText, sanitizeInput, isSuspiciousInput, logSuspiciousActivity } from '../auth/security-middleware.js';
import { db, videos, users, likes, comments, commentReactions, sounds, follows, trendingVideos, userInteractions, blocks, mutes, userContentFeedback, uploadJobs } from '../db/index.js';
import { createUserPreferenceModel } from '../services/preferences/index.js';
import { createForYouAlgorithm } from '../services/feed/index.js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema.js';

// Initialize preference model and FYP algorithm for personalized feeds
const preferenceModel = createUserPreferenceModel(db as PostgresJsDatabase<typeof schema>);
const forYouAlgorithm = createForYouAlgorithm(db as PostgresJsDatabase<typeof schema>, preferenceModel);
import { cacheService, CacheKeys, CACHE_TTL } from '../cache/redis.js';
import { eq, desc, inArray, and, sql, lt, asc, or, ilike } from 'drizzle-orm';
import type { VideoView, AuthorView, FeedResult, CommentView, ReactionType, CommentSortType } from '@exprsn/shared';
import { nanoid } from 'nanoid';

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
      result = await getTrendingFeed(userDid, cursor, limit);
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
  const sort = (c.req.query('sort') || 'top') as CommentSortType;
  const viewerDid = c.get('did');

  if (!uri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  // Get blocked/muted users if viewer is authenticated
  let excludedDids = new Set<string>();
  if (viewerDid) {
    const { blocked, muted } = await getBlockedAndMutedDids(viewerDid);
    excludedDids = new Set([...blocked, ...muted]);
  }

  // Build query with conditional orderBy based on sort type
  let orderByClause;
  switch (sort) {
    case 'hot':
      orderByClause = [desc(comments.hotScore), desc(comments.createdAt)];
      break;
    case 'recent':
      orderByClause = [desc(comments.createdAt)];
      break;
    case 'top':
    default:
      orderByClause = [desc(comments.likeCount), desc(comments.loveCount), desc(comments.createdAt)];
  }

  const whereConditions = cursor
    ? and(eq(comments.videoUri, uri), sql`${comments.parentUri} IS NULL`, lt(comments.createdAt, new Date(parseInt(cursor, 10))))
    : and(eq(comments.videoUri, uri), sql`${comments.parentUri} IS NULL`);

  // Fetch extra to compensate for filtering
  const fetchLimit = excludedDids.size > 0 ? limit + excludedDids.size * 2 : limit;

  let results = await db
    .select()
    .from(comments)
    .where(whereConditions)
    .orderBy(...orderByClause)
    .limit(fetchLimit);

  // Filter out comments from blocked/muted users
  if (excludedDids.size > 0) {
    results = results.filter((c) => !excludedDids.has(c.authorDid)).slice(0, limit);
  }

  // Get authors for comments
  const authorDids = [...new Set(results.map((c) => c.authorDid))];
  const authors = authorDids.length > 0
    ? await db.select().from(users).where(inArray(users.did, authorDids))
    : [];
  const authorMap = new Map(authors.map((a) => [a.did, a]));

  // Get viewer's reactions if authenticated
  let viewerReactions = new Map<string, ReactionType>();
  if (viewerDid && results.length > 0) {
    const commentUris = results.map((c) => c.uri);
    const reactions = await db
      .select()
      .from(commentReactions)
      .where(and(inArray(commentReactions.commentUri, commentUris), eq(commentReactions.authorDid, viewerDid)));
    viewerReactions = new Map(reactions.map((r) => [r.commentUri, r.reactionType as ReactionType]));
  }

  // Get first 3 replies for each comment
  const commentUris = results.map((c) => c.uri);
  let allReplies = commentUris.length > 0
    ? await db
        .select()
        .from(comments)
        .where(inArray(comments.parentUri, commentUris))
        .orderBy(desc(comments.likeCount), desc(comments.createdAt))
    : [];

  // Filter out replies from blocked/muted users
  if (excludedDids.size > 0) {
    allReplies = allReplies.filter((r) => !excludedDids.has(r.authorDid));
  }

  // Group replies by parent
  const repliesByParent = new Map<string, typeof allReplies>();
  for (const reply of allReplies) {
    if (!reply.parentUri) continue;
    const existing = repliesByParent.get(reply.parentUri) || [];
    if (existing.length < 3) {
      existing.push(reply);
      repliesByParent.set(reply.parentUri, existing);
    }
  }

  // Get authors for replies
  const replyAuthorDids = [...new Set(allReplies.map((r) => r.authorDid))];
  const replyAuthors = replyAuthorDids.length > 0
    ? await db.select().from(users).where(inArray(users.did, replyAuthorDids))
    : [];
  for (const author of replyAuthors) {
    authorMap.set(author.did, author);
  }

  const commentViews: CommentView[] = results.map((comment) => {
    const author = authorMap.get(comment.authorDid);
    const replies = repliesByParent.get(comment.uri) || [];

    return {
      uri: comment.uri,
      cid: comment.cid,
      author: author
        ? {
            did: author.did,
            handle: author.handle,
            displayName: author.displayName ?? undefined,
            avatar: author.avatar ?? undefined,
          }
        : { did: comment.authorDid, handle: 'unknown' },
      text: comment.text,
      likeCount: comment.likeCount,
      loveCount: comment.loveCount,
      dislikeCount: comment.dislikeCount,
      replyCount: comment.replyCount,
      hotScore: comment.hotScore,
      createdAt: comment.createdAt.toISOString(),
      viewer: viewerDid ? { reaction: viewerReactions.get(comment.uri) } : undefined,
      replies: replies.map((reply) => {
        const replyAuthor = authorMap.get(reply.authorDid);
        return {
          uri: reply.uri,
          cid: reply.cid,
          author: replyAuthor
            ? {
                did: replyAuthor.did,
                handle: replyAuthor.handle,
                displayName: replyAuthor.displayName ?? undefined,
                avatar: replyAuthor.avatar ?? undefined,
              }
            : { did: reply.authorDid, handle: 'unknown' },
          text: reply.text,
          parentUri: reply.parentUri ?? undefined,
          likeCount: reply.likeCount,
          loveCount: reply.loveCount,
          dislikeCount: reply.dislikeCount,
          replyCount: reply.replyCount,
          hotScore: reply.hotScore,
          createdAt: reply.createdAt.toISOString(),
          viewer: viewerDid ? { reaction: viewerReactions.get(reply.uri) } : undefined,
        };
      }),
    };
  });

  return c.json({
    comments: commentViews,
    cursor:
      results.length === limit ? results[results.length - 1]!.createdAt.getTime().toString() : undefined,
  });
});

/**
 * Get comment replies (nested comments)
 * GET /xrpc/io.exprsn.video.getCommentReplies
 */
xrpcRouter.get('/io.exprsn.video.getCommentReplies', optionalAuthMiddleware, async (c) => {
  const parentUri = c.req.query('parentUri');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);
  const cursor = c.req.query('cursor');
  const viewerDid = c.get('did');

  if (!parentUri) {
    throw new HTTPException(400, { message: 'Parent URI is required' });
  }

  const whereConditions = cursor
    ? and(eq(comments.parentUri, parentUri), lt(comments.createdAt, new Date(parseInt(cursor, 10))))
    : eq(comments.parentUri, parentUri);

  const results = await db
    .select()
    .from(comments)
    .where(whereConditions)
    .orderBy(desc(comments.likeCount), desc(comments.createdAt))
    .limit(limit);

  // Get authors
  const authorDids = [...new Set(results.map((c) => c.authorDid))];
  const authors = authorDids.length > 0
    ? await db.select().from(users).where(inArray(users.did, authorDids))
    : [];
  const authorMap = new Map(authors.map((a) => [a.did, a]));

  // Get viewer's reactions if authenticated
  let viewerReactions = new Map<string, ReactionType>();
  if (viewerDid && results.length > 0) {
    const commentUris = results.map((c) => c.uri);
    const reactions = await db
      .select()
      .from(commentReactions)
      .where(and(inArray(commentReactions.commentUri, commentUris), eq(commentReactions.authorDid, viewerDid)));
    viewerReactions = new Map(reactions.map((r) => [r.commentUri, r.reactionType as ReactionType]));
  }

  const commentViews: CommentView[] = results.map((comment) => {
    const author = authorMap.get(comment.authorDid);
    return {
      uri: comment.uri,
      cid: comment.cid,
      author: author
        ? {
            did: author.did,
            handle: author.handle,
            displayName: author.displayName ?? undefined,
            avatar: author.avatar ?? undefined,
          }
        : { did: comment.authorDid, handle: 'unknown' },
      text: comment.text,
      parentUri: comment.parentUri ?? undefined,
      likeCount: comment.likeCount,
      loveCount: comment.loveCount,
      dislikeCount: comment.dislikeCount,
      replyCount: comment.replyCount,
      hotScore: comment.hotScore,
      createdAt: comment.createdAt.toISOString(),
      viewer: viewerDid ? { reaction: viewerReactions.get(comment.uri) } : undefined,
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
 * Get a single sound by ID
 * GET /xrpc/io.exprsn.video.getSound
 */
xrpcRouter.get('/io.exprsn.video.getSound', async (c) => {
  const id = c.req.query('id');

  if (!id) {
    throw new HTTPException(400, { message: 'Sound ID is required' });
  }

  const sound = await db.query.sounds.findFirst({
    where: eq(sounds.id, id),
  });

  if (!sound) {
    throw new HTTPException(404, { message: 'Sound not found' });
  }

  return c.json({
    sound: {
      id: sound.id,
      title: sound.title,
      artist: sound.artist,
      duration: sound.duration,
      audioUrl: sound.audioUrl,
      coverUrl: sound.coverUrl,
      useCount: sound.useCount,
      originalVideoUri: sound.originalVideoUri,
    },
  });
});

/**
 * Get trending tags
 * GET /xrpc/io.exprsn.video.getTrendingTags
 */
xrpcRouter.get('/io.exprsn.video.getTrendingTags', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);

  // Aggregate tags from videos and count occurrences
  // This query unnests the tags array and counts occurrences
  const results = await db.execute(
    sql`
      SELECT tag, COUNT(*) as video_count
      FROM (
        SELECT unnest(tags::text[]) as tag
        FROM videos
        WHERE visibility = 'public'
      ) AS tag_list
      GROUP BY tag
      ORDER BY video_count DESC
      LIMIT ${limit}
    `
  );

  const tags = (results as unknown as { tag: string; video_count: string }[]).map((row) => ({
    name: row.tag,
    videoCount: parseInt(row.video_count, 10),
  }));

  return c.json({ tags });
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
 * Rate limited: per-user daily/hourly quotas
 */
xrpcRouter.post('/io.exprsn.video.uploadVideo', authMiddleware, uploadRateLimiter(), async (c) => {
  const { contentType, size } = await c.req.json<{ contentType: string; size?: number }>();
  const userDid = c.get('did');

  if (!contentType || !contentType.startsWith('video/')) {
    throw new HTTPException(400, { message: 'Invalid content type' });
  }

  // Check file size against user quota
  const quota = await getUploadQuota(userDid);
  const maxSizeBytes = quota.maxFileSizeMB * 1024 * 1024;
  if (size && size > maxSizeBytes) {
    throw new HTTPException(400, {
      message: `File too large. Maximum size: ${quota.maxFileSizeMB}MB`,
    });
  }

  // Import upload service dynamically to avoid circular deps
  const { uploadService } = await import('../services/upload.js');
  const result = await uploadService.getUploadUrl(userDid, contentType);

  // Record the upload against user's quota
  await recordUpload(userDid);

  return c.json({
    ...result,
    quota: {
      dailyRemaining: quota.dailyUploads - quota.dailyUsed - 1,
      hourlyRemaining: quota.hourlyUploads - quota.hourlyUsed - 1,
    },
  });
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
  const userDid = c.get('did');
  const data = await c.req.json();

  // Sanitize user-provided content
  const caption = data.caption ? sanitizeText(data.caption) : null;
  const tags = Array.isArray(data.tags)
    ? data.tags.map((t: string) => sanitizeInput(String(t).slice(0, 50)))
    : [];

  // Log suspicious input attempts
  if (data.caption && isSuspiciousInput(data.caption)) {
    const clientIP = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    logSuspiciousActivity(clientIP, '/io.exprsn.video.createPost', 'Suspicious caption', data.caption);
  }

  // Get upload job from database to check status and get URLs
  const uploadJob = await db.query.uploadJobs.findFirst({
    where: eq(uploadJobs.id, data.uploadId),
  });

  if (!uploadJob) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }

  if (uploadJob.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  if (uploadJob.status !== 'completed') {
    throw new HTTPException(400, {
      message: `Upload not ready. Status: ${uploadJob.status}`,
      status: uploadJob.status,
      progress: uploadJob.progress,
    });
  }

  if (!uploadJob.hlsPlaylist) {
    throw new HTTPException(500, { message: 'Video processing incomplete - no HLS playlist' });
  }

  // Create video URI
  const videoUri = `at://${userDid}/io.exprsn.video.post/${nanoid()}`;
  const videoCid = nanoid();
  const now = new Date();

  // Insert video record into database
  await db.insert(videos).values({
    uri: videoUri,
    cid: videoCid,
    authorDid: userDid,
    caption,
    tags,
    soundUri: data.soundUri || null,
    cdnUrl: uploadJob.cdnUrl,
    hlsPlaylist: uploadJob.hlsPlaylist,
    thumbnailUrl: uploadJob.thumbnailUrl,
    duration: data.duration || null,
    aspectRatio: data.aspectRatio || { width: 9, height: 16 },
    visibility: data.visibility || 'public',
    allowDuet: data.allowDuet ?? true,
    allowStitch: data.allowStitch ?? true,
    allowComments: data.allowComments ?? true,
    publishedAsOrgId: data.publishedAsOrgId || null,
    moderationStatus: 'auto_approved',
    createdAt: now,
    indexedAt: now,
  });

  // Increment user's video count
  await db
    .update(users)
    .set({ videoCount: sql`${users.videoCount} + 1` })
    .where(eq(users.did, userDid));

  // Invalidate feed cache
  await cacheService.delete(CacheKeys.trendingFeed());
  await cacheService.delete(CacheKeys.followingFeed(userDid));

  return c.json({
    uri: videoUri,
    cid: videoCid,
    hlsPlaylist: uploadJob.hlsPlaylist,
    thumbnailUrl: uploadJob.thumbnailUrl,
    cdnUrl: uploadJob.cdnUrl,
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

  // @ts-expect-error - Agent integration not yet implemented
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

  // @ts-expect-error - Agent integration not yet implemented
  const agent = session.agent;
  await agent.api.com.atproto.repo.deleteRecord({
    repo: session.did,
    collection: 'io.exprsn.video.like',
    rkey: rkey!,
  });

  return c.json({ success: true });
});

/**
 * Track video view with enhanced engagement signals for FYP personalization
 * POST /xrpc/io.exprsn.video.trackView
 */
xrpcRouter.post('/io.exprsn.video.trackView', optionalAuthMiddleware, async (c) => {
  interface TrackViewBody {
    videoUri?: string;
    watchDuration?: number;
    completed?: boolean;
    // Enhanced engagement signals
    loopCount?: number; // Number of complete loops watched
    sessionPosition?: number; // Position in viewing session (1st, 2nd, 3rd video)
    engagementActions?: string[]; // paused, unmuted, fullscreen, shared, etc.
    milestone?: '25%' | '50%' | '75%' | '100%'; // Watch progress milestone
    videoDuration?: number; // Total video duration for accurate completion calculation
  }

  let body: TrackViewBody = {};

  try {
    body = await c.req.json();
  } catch {
    // Invalid or empty JSON body - just return success silently
    return c.json({ success: true });
  }

  const {
    videoUri,
    watchDuration,
    completed,
    loopCount,
    sessionPosition,
    engagementActions,
    milestone,
    videoDuration,
  } = body;

  if (!videoUri) {
    // No video URI provided - return success silently to avoid client errors
    return c.json({ success: true });
  }

  // Increment view count
  await db
    .update(videos)
    .set({
      viewCount: sql`${videos.viewCount} + 1`,
    })
    .where(eq(videos.uri, videoUri));

  // Optionally track in user_interactions if authenticated
  const userDid = c.get('did');
  if (userDid) {
    // Calculate completion rate more accurately
    let completionRate: number;
    if (completed) {
      completionRate = 1.0;
    } else if (videoDuration && videoDuration > 0) {
      completionRate = Math.min(1.0, (watchDuration || 0) / videoDuration);
    } else {
      completionRate = Math.min(0.99, (watchDuration || 0) / 100);
    }

    // Calculate interaction quality score based on engagement signals
    let interactionQuality = completionRate * 0.4; // Base: completion rate
    if (loopCount && loopCount > 0) {
      interactionQuality += Math.min(0.3, loopCount * 0.1); // Bonus for rewatches
    }
    if (engagementActions && engagementActions.length > 0) {
      // Bonus for engagement actions
      const actionWeights: Record<string, number> = {
        paused: 0.05,
        unmuted: 0.1,
        fullscreen: 0.1,
        shared: 0.15,
        liked: 0.1,
        commented: 0.15,
        saved: 0.1,
      };
      const actionScore = engagementActions.reduce(
        (sum, action) => sum + (actionWeights[action] || 0.02),
        0
      );
      interactionQuality += Math.min(0.3, actionScore);
    }
    interactionQuality = Math.min(1.0, interactionQuality);

    await db
      .insert(userInteractions)
      .values({
        id: crypto.randomUUID(),
        userDid,
        videoUri,
        interactionType: milestone ? `view_${milestone}` : 'view',
        watchDuration: watchDuration || 0,
        completionRate,
        loopCount: loopCount || 0,
        rewatchCount: loopCount && loopCount > 1 ? loopCount - 1 : 0,
        interactionQuality,
        sessionPosition: sessionPosition || null,
        engagementActions: engagementActions || null,
        milestone: milestone || null,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  return c.json({ success: true });
});

/**
 * Track authenticated video conversion events without incrementing views
 * POST /xrpc/io.exprsn.video.trackEvent
 */
xrpcRouter.post('/io.exprsn.video.trackEvent', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    videoUri?: string;
    eventType?: string;
    engagementActions?: string[];
  }>();

  if (!body.videoUri || !body.eventType) {
    throw new HTTPException(400, { message: 'Video URI and event type are required' });
  }

  await db
    .insert(userInteractions)
    .values({
      id: crypto.randomUUID(),
      userDid,
      videoUri: body.videoUri,
      interactionType: body.eventType,
      interactionQuality: 0.6,
      engagementActions: body.engagementActions || null,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return c.json({ success: true });
});

/**
 * Submit "not interested" feedback for FYP personalization
 * POST /xrpc/io.exprsn.video.notInterested
 */
xrpcRouter.post('/io.exprsn.video.notInterested', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    videoUri?: string;
    authorDid?: string;
    tag?: string;
    soundId?: string;
    feedbackType?: 'not_interested' | 'see_less' | 'hide_author' | 'report';
    reason?: 'repetitive' | 'not_relevant' | 'offensive' | 'spam' | 'other';
    hideAuthor?: boolean;
  }>();

  const {
    videoUri,
    authorDid,
    tag,
    soundId,
    feedbackType = 'not_interested',
    reason,
    hideAuthor,
  } = body;

  // Determine target type and ID
  let targetType: string;
  let targetId: string;

  if (videoUri) {
    targetType = 'video';
    targetId = videoUri;
  } else if (authorDid) {
    targetType = 'author';
    targetId = authorDid;
  } else if (tag) {
    targetType = 'tag';
    targetId = tag;
  } else if (soundId) {
    targetType = 'sound';
    targetId = soundId;
  } else {
    throw new HTTPException(400, {
      message: 'Must provide videoUri, authorDid, tag, or soundId',
    });
  }

  // Insert feedback
  await db
    .insert(userContentFeedback)
    .values({
      id: crypto.randomUUID(),
      userDid,
      targetType,
      targetId,
      feedbackType,
      reason: reason || null,
      weight: feedbackType === 'hide_author' ? 2.0 : 1.0,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        userContentFeedback.userDid,
        userContentFeedback.targetType,
        userContentFeedback.targetId,
        userContentFeedback.feedbackType,
      ],
      set: {
        reason: reason || null,
        weight: feedbackType === 'hide_author' ? 2.0 : 1.0,
        createdAt: new Date(),
      },
    });

  // If hideAuthor is true and we have a video, also hide the author
  if (hideAuthor && videoUri) {
    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, videoUri),
      columns: { authorDid: true },
    });

    if (video?.authorDid) {
      await db
        .insert(userContentFeedback)
        .values({
          id: crypto.randomUUID(),
          userDid,
          targetType: 'author',
          targetId: video.authorDid,
          feedbackType: 'hide_author',
          reason: reason || null,
          weight: 2.0,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  return c.json({ success: true });
});

/**
 * Remove "not interested" feedback
 * POST /xrpc/io.exprsn.video.removeFeedback
 */
xrpcRouter.post('/io.exprsn.video.removeFeedback', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { targetType, targetId, feedbackType } = await c.req.json<{
    targetType: 'video' | 'author' | 'tag' | 'sound';
    targetId: string;
    feedbackType?: string;
  }>();

  if (!targetType || !targetId) {
    throw new HTTPException(400, { message: 'targetType and targetId are required' });
  }

  const conditions = [
    eq(userContentFeedback.userDid, userDid),
    eq(userContentFeedback.targetType, targetType),
    eq(userContentFeedback.targetId, targetId),
  ];

  if (feedbackType) {
    conditions.push(eq(userContentFeedback.feedbackType, feedbackType));
  }

  await db.delete(userContentFeedback).where(and(...conditions));

  return c.json({ success: true });
});

/**
 * Create a comment
 * POST /xrpc/io.exprsn.video.createComment
 */
xrpcRouter.post('/io.exprsn.video.createComment', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    videoUri: string;
    text: string;
    parentUri?: string;
  }>();

  if (!body.videoUri || !body.text) {
    throw new HTTPException(400, { message: 'Video URI and text are required' });
  }

  // Sanitize user input
  const text = sanitizeText(body.text);
  const videoUri = sanitizeInput(body.videoUri);
  const parentUri = body.parentUri ? sanitizeInput(body.parentUri) : undefined;

  // Log suspicious input attempts
  if (isSuspiciousInput(body.text)) {
    const clientIP = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    logSuspiciousActivity(clientIP, '/io.exprsn.video.createComment', 'Suspicious comment text', body.text);
  }

  if (text.length > 500) {
    throw new HTTPException(400, { message: 'Comment text must be 500 characters or less' });
  }

  if (text.length === 0) {
    throw new HTTPException(400, { message: 'Comment cannot be empty' });
  }

  // Verify video exists
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, videoUri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  // If replying, verify parent comment exists
  if (parentUri) {
    const parentComment = await db.query.comments.findFirst({
      where: eq(comments.uri, parentUri),
    });
    if (!parentComment) {
      throw new HTTPException(404, { message: 'Parent comment not found' });
    }
  }

  const commentUri = `at://${userDid}/io.exprsn.video.comment/${nanoid()}`;
  const commentCid = nanoid(); // Simplified CID for now
  const now = new Date();

  await db.insert(comments).values({
    uri: commentUri,
    cid: commentCid,
    videoUri,
    parentUri: parentUri ?? null,
    authorDid: userDid,
    text,
    likeCount: 0,
    loveCount: 0,
    dislikeCount: 0,
    replyCount: 0,
    hotScore: 0,
    createdAt: now,
    indexedAt: now,
  });

  // Update counts
  await db
    .update(videos)
    .set({ commentCount: sql`${videos.commentCount} + 1` })
    .where(eq(videos.uri, videoUri));

  if (parentUri) {
    await db
      .update(comments)
      .set({ replyCount: sql`${comments.replyCount} + 1` })
      .where(eq(comments.uri, parentUri));
  }

  return c.json({ uri: commentUri, cid: commentCid });
});

/**
 * Delete a comment
 * POST /xrpc/io.exprsn.video.deleteComment
 */
xrpcRouter.post('/io.exprsn.video.deleteComment', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { uri } = await c.req.json<{ uri: string }>();

  if (!uri) {
    throw new HTTPException(400, { message: 'Comment URI is required' });
  }

  const comment = await db.query.comments.findFirst({
    where: eq(comments.uri, uri),
  });

  if (!comment) {
    throw new HTTPException(404, { message: 'Comment not found' });
  }

  if (comment.authorDid !== userDid) {
    throw new HTTPException(403, { message: 'You can only delete your own comments' });
  }

  // Delete the comment and all replies
  await db.delete(comments).where(eq(comments.parentUri, uri));
  await db.delete(comments).where(eq(comments.uri, uri));

  // Update video comment count
  await db
    .update(videos)
    .set({ commentCount: sql`${videos.commentCount} - 1 - ${comment.replyCount}` })
    .where(eq(videos.uri, comment.videoUri));

  // Update parent reply count if this was a reply
  if (comment.parentUri) {
    await db
      .update(comments)
      .set({ replyCount: sql`${comments.replyCount} - 1` })
      .where(eq(comments.uri, comment.parentUri));
  }

  return c.json({ success: true });
});

/**
 * React to a comment (like/love/dislike)
 * POST /xrpc/io.exprsn.video.reactToComment
 */
xrpcRouter.post('/io.exprsn.video.reactToComment', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { commentUri, reactionType } = await c.req.json<{
    commentUri: string;
    reactionType: ReactionType;
  }>();

  if (!commentUri || !reactionType) {
    throw new HTTPException(400, { message: 'Comment URI and reaction type are required' });
  }

  if (!['like', 'love', 'dislike'].includes(reactionType)) {
    throw new HTTPException(400, { message: 'Invalid reaction type' });
  }

  const comment = await db.query.comments.findFirst({
    where: eq(comments.uri, commentUri),
  });

  if (!comment) {
    throw new HTTPException(404, { message: 'Comment not found' });
  }

  // Check for existing reaction
  const existingReaction = await db.query.commentReactions.findFirst({
    where: and(
      eq(commentReactions.commentUri, commentUri),
      eq(commentReactions.authorDid, userDid)
    ),
  });

  if (existingReaction) {
    // If same reaction, do nothing
    if (existingReaction.reactionType === reactionType) {
      return c.json({ success: true, reactionType });
    }

    // Update reaction type and adjust counts
    const oldType = existingReaction.reactionType as ReactionType;
    await db
      .update(commentReactions)
      .set({ reactionType, createdAt: new Date() })
      .where(eq(commentReactions.id, existingReaction.id));

    // Decrement old count, increment new count
    const updates: Record<string, unknown> = {};
    if (oldType === 'like') updates.likeCount = sql`${comments.likeCount} - 1`;
    if (oldType === 'love') updates.loveCount = sql`${comments.loveCount} - 1`;
    if (oldType === 'dislike') updates.dislikeCount = sql`${comments.dislikeCount} - 1`;
    if (reactionType === 'like') updates.likeCount = sql`${comments.likeCount} + 1`;
    if (reactionType === 'love') updates.loveCount = sql`${comments.loveCount} + 1`;
    if (reactionType === 'dislike') updates.dislikeCount = sql`${comments.dislikeCount} + 1`;

    await db.update(comments).set(updates).where(eq(comments.uri, commentUri));
  } else {
    // Create new reaction
    await db.insert(commentReactions).values({
      id: nanoid(),
      commentUri,
      authorDid: userDid,
      reactionType,
      createdAt: new Date(),
    });

    // Increment count
    const countField =
      reactionType === 'like'
        ? { likeCount: sql`${comments.likeCount} + 1` }
        : reactionType === 'love'
          ? { loveCount: sql`${comments.loveCount} + 1` }
          : { dislikeCount: sql`${comments.dislikeCount} + 1` };

    await db.update(comments).set(countField).where(eq(comments.uri, commentUri));
  }

  // Recalculate hot score
  await updateCommentHotScore(commentUri);

  return c.json({ success: true, reactionType });
});

/**
 * Remove reaction from a comment
 * POST /xrpc/io.exprsn.video.unreactToComment
 */
xrpcRouter.post('/io.exprsn.video.unreactToComment', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { commentUri } = await c.req.json<{ commentUri: string }>();

  if (!commentUri) {
    throw new HTTPException(400, { message: 'Comment URI is required' });
  }

  const existingReaction = await db.query.commentReactions.findFirst({
    where: and(
      eq(commentReactions.commentUri, commentUri),
      eq(commentReactions.authorDid, userDid)
    ),
  });

  if (!existingReaction) {
    return c.json({ success: true });
  }

  // Delete reaction
  await db.delete(commentReactions).where(eq(commentReactions.id, existingReaction.id));

  // Decrement count
  const reactionType = existingReaction.reactionType as ReactionType;
  const countField =
    reactionType === 'like'
      ? { likeCount: sql`${comments.likeCount} - 1` }
      : reactionType === 'love'
        ? { loveCount: sql`${comments.loveCount} - 1` }
        : { dislikeCount: sql`${comments.dislikeCount} - 1` };

  await db.update(comments).set(countField).where(eq(comments.uri, commentUri));

  // Recalculate hot score
  await updateCommentHotScore(commentUri);

  return c.json({ success: true });
});

// =============================================================================
// Profile & Graph Endpoints
// =============================================================================

/**
 * Get user profile
 * GET /xrpc/io.exprsn.actor.getProfile
 */
xrpcRouter.get('/io.exprsn.actor.getProfile', optionalAuthMiddleware, async (c) => {
  const handle = c.req.query('handle');
  const did = c.req.query('did');
  const viewerDid = c.get('did');

  if (!handle && !did) {
    throw new HTTPException(400, { message: 'Handle or DID is required' });
  }

  const user = await db.query.users.findFirst({
    where: handle ? eq(users.handle, handle) : eq(users.did, did!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Get viewer's relationships (follow, block, mute)
  let viewerFollowing = false;
  let followUri: string | undefined;
  let viewerBlocking = false;
  let blockUri: string | undefined;
  let viewerMuting = false;
  let muteUri: string | undefined;
  let blockedByViewer = false;

  if (viewerDid && viewerDid !== user.did) {
    const [follow, block, mute, blockedBy] = await Promise.all([
      db.query.follows.findFirst({
        where: and(eq(follows.followerDid, viewerDid), eq(follows.followeeDid, user.did)),
      }),
      db.query.blocks.findFirst({
        where: and(eq(blocks.blockerDid, viewerDid), eq(blocks.blockedDid, user.did)),
      }),
      db.query.mutes.findFirst({
        where: and(eq(mutes.muterDid, viewerDid), eq(mutes.mutedDid, user.did)),
      }),
      // Check if this user has blocked the viewer
      db.query.blocks.findFirst({
        where: and(eq(blocks.blockerDid, user.did), eq(blocks.blockedDid, viewerDid)),
      }),
    ]);
    if (follow) {
      viewerFollowing = true;
      followUri = follow.uri;
    }
    if (block) {
      viewerBlocking = true;
      blockUri = block.uri;
    }
    if (mute) {
      viewerMuting = true;
      muteUri = mute.uri;
    }
    if (blockedBy) {
      blockedByViewer = true;
    }
  }

  // Get user's videos
  const userVideos = await db
    .select()
    .from(videos)
    .where(and(eq(videos.authorDid, user.did), eq(videos.visibility, 'public')))
    .orderBy(desc(videos.createdAt))
    .limit(30);

  const hydratedVideos = await hydrateVideos(
    userVideos.map((v) => v.uri),
    viewerDid
  );

  return c.json({
    profile: {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      videoCount: user.videoCount,
      verified: user.verified,
      createdAt: user.createdAt.toISOString(),
      viewer: viewerDid
        ? {
            following: viewerFollowing,
            followUri,
            blocking: viewerBlocking,
            blockUri,
            muting: viewerMuting,
            muteUri,
            blockedBy: blockedByViewer,
          }
        : undefined,
    },
    videos: hydratedVideos,
  });
});

/**
 * Get user's videos (paginated)
 * GET /xrpc/io.exprsn.actor.getVideos
 */
xrpcRouter.get('/io.exprsn.actor.getVideos', optionalAuthMiddleware, async (c) => {
  const handle = c.req.query('handle');
  const did = c.req.query('did');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const viewerDid = c.get('did');

  if (!handle && !did) {
    throw new HTTPException(400, { message: 'Handle or DID is required' });
  }

  const user = await db.query.users.findFirst({
    where: handle ? eq(users.handle, handle) : eq(users.did, did!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const whereConditions = cursor
    ? and(
        eq(videos.authorDid, user.did),
        eq(videos.visibility, 'public'),
        lt(videos.createdAt, new Date(parseInt(cursor, 10)))
      )
    : and(eq(videos.authorDid, user.did), eq(videos.visibility, 'public'));

  const userVideos = await db
    .select()
    .from(videos)
    .where(whereConditions)
    .orderBy(desc(videos.createdAt))
    .limit(limit);

  const hydratedVideos = await hydrateVideos(
    userVideos.map((v) => v.uri),
    viewerDid
  );

  return c.json({
    videos: hydratedVideos,
    cursor:
      userVideos.length > 0
        ? userVideos[userVideos.length - 1]!.createdAt.getTime().toString()
        : undefined,
  });
});

/**
 * Follow a user
 * POST /xrpc/io.exprsn.graph.follow
 */
xrpcRouter.post('/io.exprsn.graph.follow', authMiddleware, async (c) => {
  const followerDid = c.get('did');
  const { did: followeeDid } = await c.req.json<{ did: string }>();

  if (!followeeDid) {
    throw new HTTPException(400, { message: 'Target DID is required' });
  }

  if (followerDid === followeeDid) {
    throw new HTTPException(400, { message: 'Cannot follow yourself' });
  }

  // Verify followee exists
  const followee = await db.query.users.findFirst({
    where: eq(users.did, followeeDid),
  });

  if (!followee) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Check if already following
  const existingFollow = await db.query.follows.findFirst({
    where: and(eq(follows.followerDid, followerDid), eq(follows.followeeDid, followeeDid)),
  });

  if (existingFollow) {
    return c.json({ uri: existingFollow.uri });
  }

  const followUri = `at://${followerDid}/io.exprsn.graph.follow/${nanoid()}`;
  const followCid = nanoid();
  const now = new Date();

  await db.insert(follows).values({
    uri: followUri,
    cid: followCid,
    followerDid,
    followeeDid,
    createdAt: now,
    indexedAt: now,
  });

  // Update counts
  await db
    .update(users)
    .set({ followingCount: sql`${users.followingCount} + 1` })
    .where(eq(users.did, followerDid));
  await db
    .update(users)
    .set({ followerCount: sql`${users.followerCount} + 1` })
    .where(eq(users.did, followeeDid));

  return c.json({ uri: followUri });
});

/**
 * Unfollow a user
 * POST /xrpc/io.exprsn.graph.unfollow
 */
xrpcRouter.post('/io.exprsn.graph.unfollow', authMiddleware, async (c) => {
  const followerDid = c.get('did');
  const { uri, did: followeeDid } = await c.req.json<{ uri?: string; did?: string }>();

  if (!uri && !followeeDid) {
    throw new HTTPException(400, { message: 'Follow URI or target DID is required' });
  }

  let follow;
  if (uri) {
    follow = await db.query.follows.findFirst({
      where: and(eq(follows.uri, uri), eq(follows.followerDid, followerDid)),
    });
  } else {
    follow = await db.query.follows.findFirst({
      where: and(eq(follows.followerDid, followerDid), eq(follows.followeeDid, followeeDid!)),
    });
  }

  if (!follow) {
    return c.json({ success: true });
  }

  await db.delete(follows).where(eq(follows.uri, follow.uri));

  // Update counts
  await db
    .update(users)
    .set({ followingCount: sql`${users.followingCount} - 1` })
    .where(eq(users.did, followerDid));
  await db
    .update(users)
    .set({ followerCount: sql`${users.followerCount} - 1` })
    .where(eq(users.did, follow.followeeDid));

  return c.json({ success: true });
});

/**
 * Get followers of a user
 * GET /xrpc/io.exprsn.graph.getFollowers
 */
xrpcRouter.get('/io.exprsn.graph.getFollowers', optionalAuthMiddleware, async (c) => {
  const handle = c.req.query('handle');
  const did = c.req.query('did');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const viewerDid = c.get('did');

  if (!handle && !did) {
    throw new HTTPException(400, { message: 'Handle or DID is required' });
  }

  const user = await db.query.users.findFirst({
    where: handle ? eq(users.handle, handle) : eq(users.did, did!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const whereConditions = cursor
    ? and(eq(follows.followeeDid, user.did), lt(follows.createdAt, new Date(parseInt(cursor, 10))))
    : eq(follows.followeeDid, user.did);

  const followerRecords = await db
    .select()
    .from(follows)
    .where(whereConditions)
    .orderBy(desc(follows.createdAt))
    .limit(limit);

  const followerDids = followerRecords.map((f) => f.followerDid);
  const followerUsers =
    followerDids.length > 0 ? await db.select().from(users).where(inArray(users.did, followerDids)) : [];
  const userMap = new Map(followerUsers.map((u) => [u.did, u]));

  // Get viewer's follow relationships
  let viewerFollows = new Map<string, string>();
  if (viewerDid && followerDids.length > 0) {
    const viewerFollowRecords = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerDid, viewerDid), inArray(follows.followeeDid, followerDids)));
    viewerFollows = new Map(viewerFollowRecords.map((f) => [f.followeeDid, f.uri]));
  }

  const followers = followerRecords.map((f) => {
    const user = userMap.get(f.followerDid);
    return {
      did: f.followerDid,
      handle: user?.handle || 'unknown',
      displayName: user?.displayName,
      avatar: user?.avatar,
      verified: user?.verified,
      viewer: viewerDid
        ? {
            following: viewerFollows.has(f.followerDid),
            followUri: viewerFollows.get(f.followerDid),
          }
        : undefined,
    };
  });

  return c.json({
    followers,
    cursor:
      followerRecords.length > 0
        ? followerRecords[followerRecords.length - 1]!.createdAt.getTime().toString()
        : undefined,
  });
});

/**
 * Get users that a user is following
 * GET /xrpc/io.exprsn.graph.getFollowing
 */
xrpcRouter.get('/io.exprsn.graph.getFollowing', optionalAuthMiddleware, async (c) => {
  const handle = c.req.query('handle');
  const did = c.req.query('did');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const viewerDid = c.get('did');

  if (!handle && !did) {
    throw new HTTPException(400, { message: 'Handle or DID is required' });
  }

  const user = await db.query.users.findFirst({
    where: handle ? eq(users.handle, handle) : eq(users.did, did!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const whereConditions = cursor
    ? and(eq(follows.followerDid, user.did), lt(follows.createdAt, new Date(parseInt(cursor, 10))))
    : eq(follows.followerDid, user.did);

  const followingRecords = await db
    .select()
    .from(follows)
    .where(whereConditions)
    .orderBy(desc(follows.createdAt))
    .limit(limit);

  const followingDids = followingRecords.map((f) => f.followeeDid);
  const followingUsers =
    followingDids.length > 0
      ? await db.select().from(users).where(inArray(users.did, followingDids))
      : [];
  const userMap = new Map(followingUsers.map((u) => [u.did, u]));

  // Get viewer's follow relationships
  let viewerFollows = new Map<string, string>();
  if (viewerDid && followingDids.length > 0) {
    const viewerFollowRecords = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerDid, viewerDid), inArray(follows.followeeDid, followingDids)));
    viewerFollows = new Map(viewerFollowRecords.map((f) => [f.followeeDid, f.uri]));
  }

  const following = followingRecords.map((f) => {
    const user = userMap.get(f.followeeDid);
    return {
      did: f.followeeDid,
      handle: user?.handle || 'unknown',
      displayName: user?.displayName,
      avatar: user?.avatar,
      verified: user?.verified,
      viewer: viewerDid
        ? {
            following: viewerFollows.has(f.followeeDid),
            followUri: viewerFollows.get(f.followeeDid),
          }
        : undefined,
    };
  });

  return c.json({
    following,
    cursor:
      followingRecords.length > 0
        ? followingRecords[followingRecords.length - 1]!.createdAt.getTime().toString()
        : undefined,
  });
});

/**
 * Helper: Update comment hot score
 * Uses Wilson score lower bound + time decay
 */
async function updateCommentHotScore(commentUri: string): Promise<void> {
  const comment = await db.query.comments.findFirst({
    where: eq(comments.uri, commentUri),
  });

  if (!comment) return;

  const positive = comment.likeCount + comment.loveCount * 2; // Love counts double
  const negative = comment.dislikeCount;
  const total = positive + negative;

  if (total === 0) {
    await db.update(comments).set({ hotScore: 0 }).where(eq(comments.uri, commentUri));
    return;
  }

  // Wilson score lower bound
  const z = 1.96; // 95% confidence
  const phat = positive / total;
  const wilson =
    (phat + (z * z) / (2 * total) - z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total)) /
    (1 + (z * z) / total);

  // Time decay (half-life of 24 hours)
  const ageHours = (Date.now() - comment.createdAt.getTime()) / (1000 * 60 * 60);
  const timeDecay = Math.pow(0.5, ageHours / 24);

  // Final score
  const hotScore = wilson * Math.log(total + 1) * timeDecay;

  await db.update(comments).set({ hotScore }).where(eq(comments.uri, commentUri));
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get DIDs that the user has blocked or muted
 */
async function getBlockedAndMutedDids(userDid: string): Promise<{ blocked: string[]; muted: string[] }> {
  const [blockedResults, mutedResults] = await Promise.all([
    db.select({ did: blocks.blockedDid }).from(blocks).where(eq(blocks.blockerDid, userDid)),
    db.select({ did: mutes.mutedDid }).from(mutes).where(eq(mutes.muterDid, userDid)),
  ]);

  return {
    blocked: blockedResults.map((r) => r.did),
    muted: mutedResults.map((r) => r.did),
  };
}

/**
 * Get DIDs that have blocked the user (reverse blocks)
 */
async function getBlockedByDids(userDid: string): Promise<string[]> {
  const results = await db
    .select({ did: blocks.blockerDid })
    .from(blocks)
    .where(eq(blocks.blockedDid, userDid));
  return results.map((r) => r.did);
}

async function getFollowingFeed(
  userDid: string,
  cursor?: string,
  limit = 30
): Promise<FeedResult> {
  // Get list of followed DIDs and blocked/muted DIDs in parallel
  const [followingResult, { blocked }] = await Promise.all([
    db.select({ did: follows.followeeDid }).from(follows).where(eq(follows.followerDid, userDid)),
    getBlockedAndMutedDids(userDid),
  ]);

  // Filter out blocked users from following list
  const blockedSet = new Set(blocked);
  const followingDids = followingResult.map((f) => f.did).filter((did) => !blockedSet.has(did));

  if (followingDids.length === 0) {
    return { feed: [] };
  }

  // Build where condition with optional cursor
  const whereConditions = cursor
    ? and(inArray(videos.authorDid, followingDids), eq(videos.visibility, 'public'), lt(videos.createdAt, new Date(parseInt(cursor, 10))))
    : and(inArray(videos.authorDid, followingDids), eq(videos.visibility, 'public'));

  const results = await db
    .select()
    .from(videos)
    .where(whereConditions)
    .orderBy(desc(videos.createdAt))
    .limit(limit);

  return {
    feed: results.map((v) => ({ post: v.uri })),
    cursor:
      results.length > 0 ? results[results.length - 1]!.createdAt.getTime().toString() : undefined,
  };
}

async function getTrendingFeed(userDid?: string, cursor?: string, limit = 30): Promise<FeedResult> {
  const offset = cursor ? parseInt(cursor, 10) : 0;

  // Get blocked users if authenticated
  let blockedDids: string[] = [];
  if (userDid) {
    const { blocked } = await getBlockedAndMutedDids(userDid);
    blockedDids = blocked;
  }

  // Build query with optional block filter
  const whereCondition = blockedDids.length > 0
    ? sql`${videos.authorDid} NOT IN (${sql.join(blockedDids.map(d => sql`${d}`), sql`, `)})`
    : undefined;

  const query = whereCondition
    ? db.select().from(trendingVideos).innerJoin(videos, eq(trendingVideos.videoUri, videos.uri)).where(whereCondition)
    : db.select().from(trendingVideos).innerJoin(videos, eq(trendingVideos.videoUri, videos.uri));

  const results = await query
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
  try {
    if (userDid) {
      // Authenticated user: use personalized ForYou algorithm
      const result = await forYouAlgorithm.generateFeed(userDid, { limit, cursor });
      return {
        feed: result.items.map((item) => ({ post: item.video.uri })),
        cursor: result.cursor,
      };
    } else {
      // Anonymous user: fall back to trending
      const result = await forYouAlgorithm.generateAnonymousFeed({ limit, cursor });
      return {
        feed: result.items.map((item) => ({ post: item.uri })),
        cursor: result.cursor,
      };
    }
  } catch (error) {
    console.error('Error in getForYouFeed:', error);

    // Fallback to simple trending query
    let excludedDids: string[] = [];
    if (userDid) {
      const { blocked, muted } = await getBlockedAndMutedDids(userDid);
      excludedDids = [...blocked, ...muted];
    }

    const offset = cursor ? parseInt(cursor, 10) : 0;

    const whereCondition = excludedDids.length > 0
      ? sql`${videos.authorDid} NOT IN (${sql.join(excludedDids.map(d => sql`${d}`), sql`, `)})`
      : undefined;

    const query = whereCondition
      ? db.select().from(trendingVideos).innerJoin(videos, eq(trendingVideos.videoUri, videos.uri)).where(whereCondition)
      : db.select().from(trendingVideos).innerJoin(videos, eq(trendingVideos.videoUri, videos.uri));

    const results = await query
      .orderBy(desc(trendingVideos.score))
      .limit(limit)
      .offset(offset);

    return {
      feed: results.map((r) => ({ post: r.videos.uri })),
      cursor: results.length === limit ? (offset + limit).toString() : undefined,
    };
  }
}

async function getSoundFeed(
  soundId: string,
  cursor?: string,
  limit = 30
): Promise<FeedResult> {
  // Build where condition with optional cursor for keyset pagination
  let whereCondition = eq(videos.soundUri, soundId);
  if (cursor) {
    const [likesStr, tsStr] = cursor.split(':');
    const cursorLikes = parseInt(likesStr!, 10);
    const cursorTs = new Date(parseInt(tsStr!, 10));
    whereCondition = and(
      eq(videos.soundUri, soundId),
      sql`(${videos.likeCount} < ${cursorLikes}) OR (${videos.likeCount} = ${cursorLikes} AND ${videos.createdAt} < ${cursorTs})`
    )!;
  }

  const results = await db
    .select()
    .from(videos)
    .where(whereCondition)
    .orderBy(desc(videos.likeCount), desc(videos.createdAt))
    .limit(limit);

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
    .where(sql`${videos.tags} @> ${JSON.stringify([normalizedTag])}::jsonb`)
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
