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
import { eq, desc, and, or, sql, lt, gte, inArray, notInArray, count, countDistinct, sum, isNull } from 'drizzle-orm';
import { createUserPreferenceModel } from '../services/preferences/index.js';
import { queueTimelinePrefetch } from '../services/prefetch/producer.js';
import { getCachedTimeline } from '../services/prefetch/cache-reader.js';
import { trackUserActivity } from '../services/prefetch/activity-bridge.js';
import { createForYouAlgorithm } from '../services/feed/index.js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema.js';

// Initialize preference model and FYP algorithm
const preferenceModel = createUserPreferenceModel(db as PostgresJsDatabase<typeof schema>);
const forYouAlgorithm = createForYouAlgorithm(db as PostgresJsDatabase<typeof schema>, preferenceModel);

export const feedRouter = new Hono();

// Helper to build video views in batch (optimized to prevent N+1 queries)
type VideoRecord = typeof schema.videos.$inferSelect;

async function buildVideoViewsBatch(
  videoRecords: VideoRecord[],
  viewerDid?: string
) {
  if (videoRecords.length === 0) return [];

  const videoUris = videoRecords.map((v: VideoRecord) => v.uri);
  const authorDids = [...new Set(videoRecords.map((v: VideoRecord) => v.authorDid))];

  // Batch fetch all authors in a single query
  const authorsResult = await db.query.users.findMany({
    where: inArray(users.did, authorDids),
    columns: {
      did: true,
      handle: true,
      displayName: true,
      avatar: true,
      verified: true,
    },
  });
  const authorMap = new Map(authorsResult.map((a) => [a.did, a]));

  // Batch fetch viewer engagement if authenticated
  let likesMap = new Map<string, typeof likes.$inferSelect>();
  let repostsMap = new Map<string, typeof reposts.$inferSelect>();
  let bookmarksMap = new Map<string, typeof bookmarks.$inferSelect>();

  if (viewerDid) {
    const [likesResult, repostsResult, bookmarksResult] = await Promise.all([
      db.query.likes.findMany({
        where: and(
          eq(likes.authorDid, viewerDid),
          inArray(likes.videoUri, videoUris)
        ),
      }),
      db.query.reposts.findMany({
        where: and(
          eq(reposts.authorDid, viewerDid),
          inArray(reposts.videoUri, videoUris)
        ),
      }),
      db.query.bookmarks.findMany({
        where: and(
          eq(bookmarks.authorDid, viewerDid),
          inArray(bookmarks.videoUri, videoUris)
        ),
      }),
    ]);

    likesMap = new Map(likesResult.map((l) => [l.videoUri, l]));
    repostsMap = new Map(repostsResult.map((r) => [r.videoUri, r]));
    bookmarksMap = new Map(bookmarksResult.map((b) => [b.videoUri, b]));
  }

  // Build video views from pre-fetched data
  return videoRecords.map((video: VideoRecord) => {
    const author = authorMap.get(video.authorDid);
    const likeRecord = likesMap.get(video.uri);
    const repostRecord = repostsMap.get(video.uri);
    const bookmarkRecord = bookmarksMap.get(video.uri);

    const viewer = viewerDid
      ? {
          liked: !!likeRecord,
          likeUri: likeRecord?.uri,
          reposted: !!repostRecord,
          repostUri: repostRecord?.uri,
          bookmarked: !!bookmarkRecord,
          bookmarkUri: bookmarkRecord?.uri,
        }
      : undefined;

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
      signature: video.contentSignature ? {
        signed: true,
        verified: video.signatureVerified ?? false,
        timestamp: video.contentSignatureTimestamp,
      } : undefined,
    };
  });
}

// =============================================================================
// Moderation Filters Helper
// =============================================================================

/**
 * Get moderation filter conditions for public video queries
 * Only shows approved/auto_approved videos that are not deleted
 */
function getModerationFilters() {
  return [
    or(
      eq(videos.moderationStatus, 'approved'),
      eq(videos.moderationStatus, 'auto_approved')
    ),
    isNull(videos.deletedAt),
  ];
}

// =============================================================================
// Feed Endpoints
// =============================================================================

/**
 * Get timeline (videos from followed users)
 * GET /xrpc/io.exprsn.feed.getTimeline
 *
 * Cache-first: checks prefetch cache before hitting DB.
 * On cache miss, queries DB and queues a prefetch job for next time.
 */
feedRouter.get('/io.exprsn.feed.getTimeline', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  // Track activity for prefetch strategy (fire-and-forget)
  trackUserActivity(userDid);

  // ── Cache-first: check prefetch cache on initial page (no cursor) ──
  if (!cursor) {
    try {
      const cached = await getCachedTimeline(userDid);
      if (cached && cached.data.posts.length > 0) {
        // Cache hit — resolve posts from DB by URI for fresh viewer state
        const cachedUris = cached.data.posts.slice(0, limit).map(p => p.uri);

        const cachedVideos = await db
          .select()
          .from(videos)
          .where(and(
            inArray(videos.uri, cachedUris),
            ...getModerationFilters(),
          ))
          .orderBy(desc(videos.createdAt))
          .limit(limit);

        if (cachedVideos.length > 0) {
          const videoViews = await buildVideoViewsBatch(cachedVideos, userDid);
          const feed = videoViews.map((post) => ({ post }));

          const lastCachedResult = cachedVideos[cachedVideos.length - 1];
          const nextCursor = cachedVideos.length === limit && lastCachedResult
            ? lastCachedResult.createdAt.toISOString()
            : undefined;

          // Queue background refresh (low priority, non-blocking)
          queueTimelinePrefetch(userDid, 'low').catch(() => {});

          return c.json({
            feed,
            cursor: nextCursor,
            _cache: { hit: true, tier: cached.tier },
          });
        }
      }
    } catch {
      // Cache read failed — fall through to DB
    }
  }

  // ── Cache miss or paginated request: query DB directly ──

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
  const timelineConditions = [
    inArray(videos.authorDid, followedDids),
    ...getModerationFilters(),
  ];
  if (cursor) {
    const cursorDate = new Date(cursor);
    timelineConditions.push(lt(videos.createdAt, cursorDate));
  }

  const results = await db
    .select()
    .from(videos)
    .where(and(...timelineConditions))
    .orderBy(desc(videos.createdAt))
    .limit(limit);

  // Build feed with video views (batch optimized)
  const videoViews = await buildVideoViewsBatch(results, userDid);
  const feed = videoViews.map((post) => ({ post }));

  const lastResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastResult
      ? lastResult.createdAt.toISOString()
      : undefined;

  // Queue prefetch to warm cache for next request (fire-and-forget)
  queueTimelinePrefetch(userDid, cursor ? 'low' : 'medium').catch(() => {});

  return c.json({
    feed,
    cursor: nextCursor,
    _cache: { hit: false },
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
  const likesConditions = [
    eq(likes.authorDid, user.did),
    ...getModerationFilters(), // Only show approved, non-deleted videos
  ];
  if (cursor) {
    const cursorDate = new Date(cursor);
    likesConditions.push(lt(likes.createdAt, cursorDate));
  }

  const results = await db
    .select({
      like: likes,
      video: videos,
    })
    .from(likes)
    .innerJoin(videos, eq(likes.videoUri, videos.uri))
    .where(and(...likesConditions))
    .orderBy(desc(likes.createdAt))
    .limit(limit);

  // Extract videos from results and batch process
  const videosToProcess = results.map((r) => r.video);
  const feed = await buildVideoViewsBatch(videosToProcess, viewerDid);

  const lastLikeResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastLikeResult
      ? lastLikeResult.like.createdAt.toISOString()
      : undefined;

  return c.json({
    feed,
    cursor: nextCursor,
  });
});

/**
 * Get suggested/for-you feed with personalization
 * GET /xrpc/io.exprsn.feed.getSuggestedFeed
 *
 * For authenticated users: Returns personalized feed based on engagement history
 * For anonymous users: Returns trending feed
 */
feedRouter.get('/io.exprsn.feed.getSuggestedFeed', optionalAuthMiddleware, async (c) => {
  const viewerDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  try {
    if (viewerDid) {
      // Authenticated user: use personalized ForYou algorithm
      const result = await forYouAlgorithm.generateFeed(viewerDid, { limit, cursor });

      return c.json({
        feed: result.items.map((item) => item.video),
        cursor: result.cursor,
        // Include personalization metadata for debugging/analytics
        _meta: {
          personalized: true,
          itemCount: result.items.length,
        },
      });
    } else {
      // Anonymous user: fall back to trending
      const result = await forYouAlgorithm.generateAnonymousFeed({ limit, cursor });

      return c.json({
        feed: result.items,
        cursor: result.cursor,
        _meta: {
          personalized: false,
          itemCount: result.items.length,
        },
      });
    }
  } catch (error) {
    console.error('Error generating suggested feed:', error);

    // Fallback to simple trending query on error
    const suggestedConditions = [
      eq(videos.visibility, 'public'),
      ...getModerationFilters(), // Only show approved, non-deleted videos
    ];
    if (cursor) {
      const cursorScore = parseFloat(cursor);
      suggestedConditions.push(
        sql`COALESCE(${trendingVideos.score}, 0) + ${videos.viewCount} * 0.001 < ${cursorScore}`
      );
    }

    const results = await db
      .select({
        video: videos,
        trendingScore: trendingVideos.score,
      })
      .from(videos)
      .leftJoin(trendingVideos, eq(videos.uri, trendingVideos.videoUri))
      .where(and(...suggestedConditions))
      .orderBy(
        desc(sql`COALESCE(${trendingVideos.score}, 0) + ${videos.viewCount} * 0.001`)
      )
      .limit(limit);

    // Extract videos and batch process
    const videosToProcess = results.map((r) => r.video);
    const feed = await buildVideoViewsBatch(videosToProcess, viewerDid);

    const lastSuggestedResult = results[results.length - 1];
    const nextCursor =
      results.length === limit && lastSuggestedResult
        ? (
            (lastSuggestedResult.trendingScore || 0) +
            lastSuggestedResult.video.viewCount * 0.001
          ).toString()
        : undefined;

    return c.json({
      feed,
      cursor: nextCursor,
      _meta: {
        personalized: false,
        fallback: true,
      },
    });
  }
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
    const postsConditions = [
      eq(videos.authorDid, user.did),
      ...getModerationFilters(), // Only show approved, non-deleted videos
    ];
    if (cursor) {
      const cursorDate = new Date(cursor);
      postsConditions.push(lt(videos.createdAt, cursorDate));
    }

    const posts = await db
      .select()
      .from(videos)
      .where(and(...postsConditions))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
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
    const repostsConditions = [
      eq(reposts.authorDid, user.did),
      ...getModerationFilters(), // Only show approved, non-deleted videos
    ];
    if (cursor) {
      const cursorDate = new Date(cursor);
      repostsConditions.push(lt(reposts.createdAt, cursorDate));
    }

    const repostResults = await db
      .select({
        repost: reposts,
        video: videos,
      })
      .from(reposts)
      .innerJoin(videos, eq(reposts.videoUri, videos.uri))
      .where(and(...repostsConditions))
      .orderBy(desc(reposts.createdAt))
      .limit(limit);
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

  // Build feed (batch optimized)
  const videosToProcess = limitedItems.map((item) => item.video);
  const videoViews = await buildVideoViewsBatch(videosToProcess, viewerDid);
  const feed = limitedItems.map((item, index) => ({
    post: videoViews[index],
    reason: item.isRepost
      ? {
          $type: 'io.exprsn.feed.getTimeline#reasonRepost',
          by: item.repostBy,
          indexedAt: item.timestamp.toISOString(),
        }
      : undefined,
  }));

  const lastFeedItem = limitedItems[limitedItems.length - 1];
  const nextCursor =
    limitedItems.length === limit && lastFeedItem
      ? lastFeedItem.timestamp.toISOString()
      : undefined;

  return c.json({
    feed,
    cursor: nextCursor,
  });
});

/**
 * Get following blend feed - mix of following content with discovery
 * GET /xrpc/io.exprsn.feed.getFollowingBlend
 *
 * 70% from followed creators (last 48h, chronological)
 * 30% from FYP algorithm for discovery
 */
feedRouter.get('/io.exprsn.feed.getFollowingBlend', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  // Parse cursor (format: "following:ISO|discovery:offset")
  let followingCursor: Date | undefined;
  let discoveryCursor: string | undefined;

  if (cursor) {
    const parts = cursor.split('|');
    for (const part of parts) {
      if (part.startsWith('following:')) {
        followingCursor = new Date(part.substring(10));
      } else if (part.startsWith('discovery:')) {
        discoveryCursor = part.substring(10);
      }
    }
  }

  // Get followed DIDs
  const followedUsers = await db
    .select({ did: follows.followeeDid })
    .from(follows)
    .where(eq(follows.followerDid, userDid));

  const followedDids = followedUsers.map((f) => f.did);

  // 70% following content
  const followingLimit = Math.ceil(limit * 0.7);
  let followingVideos: (typeof videos.$inferSelect)[] = [];

  if (followedDids.length > 0) {
    const followingConditions = [
      inArray(videos.authorDid, followedDids),
      eq(videos.visibility, 'public'),
      gte(videos.createdAt, sql`NOW() - INTERVAL '48 hours'`),
    ];
    if (followingCursor) {
      followingConditions.push(lt(videos.createdAt, followingCursor));
    }

    followingVideos = await db
      .select()
      .from(videos)
      .where(and(...followingConditions))
      .orderBy(desc(videos.createdAt))
      .limit(followingLimit);
  }

  // 30% discovery via FYP algorithm
  const discoveryLimit = limit - followingVideos.length;
  const fypResult = await forYouAlgorithm.generateFeed(userDid, {
    limit: discoveryLimit * 2, // Get extra to filter duplicates
    cursor: discoveryCursor,
  });

  // Filter out videos already in following feed
  const followingUris = new Set(followingVideos.map((v) => v.uri));
  const discoveryItems = fypResult.items.filter((i) => !followingUris.has(i.video.uri));

  // Build following video views (batch optimized)
  const followingViews = await buildVideoViewsBatch(followingVideos, userDid);
  const followingFeed = followingViews.map((view) => ({
    ...view,
    _source: 'following' as const,
  }));

  // Build discovery video views with same shape as following
  const discoveryFeed = discoveryItems.slice(0, discoveryLimit).map((item) => ({
    ...item.video,
    _source: 'discovery' as const,
  }));

  // Interleave: every 4th video is discovery
  type FeedItem = { _source: 'following' | 'discovery'; [key: string]: unknown };
  const blendedFeed: FeedItem[] = [];
  let followingIdx = 0;
  let discoveryIdx = 0;

  for (let i = 0; i < limit; i++) {
    if ((i + 1) % 4 === 0 && discoveryIdx < discoveryFeed.length) {
      const item = discoveryFeed[discoveryIdx++];
      if (item) blendedFeed.push(item);
    } else if (followingIdx < followingFeed.length) {
      const item = followingFeed[followingIdx++];
      if (item) blendedFeed.push(item);
    } else if (discoveryIdx < discoveryFeed.length) {
      const item = discoveryFeed[discoveryIdx++];
      if (item) blendedFeed.push(item);
    }
  }

  // Build cursor
  const lastFollowing = followingVideos[followingVideos.length - 1];
  const cursorParts: string[] = [];
  if (lastFollowing) {
    cursorParts.push(`following:${lastFollowing.createdAt.toISOString()}`);
  }
  if (fypResult.cursor) {
    cursorParts.push(`discovery:${fypResult.cursor}`);
  }

  return c.json({
    feed: blendedFeed,
    cursor: cursorParts.length > 0 ? cursorParts.join('|') : undefined,
    _meta: {
      followingCount: followingFeed.length,
      discoveryCount: discoveryFeed.length,
    },
  });
});

/**
 * Get explore feed - trending content with diverse tags, no personalization
 * GET /xrpc/io.exprsn.feed.getExplore
 */
feedRouter.get('/io.exprsn.feed.getExplore', optionalAuthMiddleware, async (c) => {
  const viewerDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor, 10) : 0;

  // Get trending videos with diverse tags
  const results = await db
    .select({
      video: videos,
      trendingScore: trendingVideos.score,
    })
    .from(trendingVideos)
    .innerJoin(videos, eq(trendingVideos.videoUri, videos.uri))
    .where(eq(videos.visibility, 'public'))
    .orderBy(desc(trendingVideos.score))
    .limit(limit * 2) // Get extra for diversity
    .offset(offset);

  // Apply diversity: ensure varied tags
  const selectedVideos: typeof results = [];
  const usedTags = new Set<string>();
  const authorCounts = new Map<string, number>();

  for (const item of results) {
    if (selectedVideos.length >= limit) break;

    // Limit 2 per author
    const authorCount = authorCounts.get(item.video.authorDid) || 0;
    if (authorCount >= 2) continue;

    // Prefer videos with new tags
    const videoTags = (item.video.tags as string[]) || [];
    const hasNewTag = videoTags.some((t) => !usedTags.has(t)) || videoTags.length === 0;

    if (hasNewTag || selectedVideos.length < limit / 2) {
      selectedVideos.push(item);
      authorCounts.set(item.video.authorDid, authorCount + 1);
      videoTags.forEach((t) => usedTags.add(t));
    }
  }

  // Extract videos and batch process
  const videosToProcess = selectedVideos.map((r) => r.video);
  const feed = await buildVideoViewsBatch(videosToProcess, viewerDid);

  return c.json({
    feed,
    cursor: selectedVideos.length >= limit ? String(offset + limit) : undefined,
    _meta: {
      uniqueTags: usedTags.size,
    },
  });
});

/**
 * Get discover feed - heavy personalization, focused on new creators
 * GET /xrpc/io.exprsn.feed.getDiscover
 */
feedRouter.get('/io.exprsn.feed.getDiscover', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  // Get users the viewer already follows
  const followedUsers = await db
    .select({ did: follows.followeeDid })
    .from(follows)
    .where(eq(follows.followerDid, userDid));
  const followedDids = new Set(followedUsers.map((f) => f.did));

  // Get personalized feed focusing on new creators
  const result = await forYouAlgorithm.generateFeed(userDid, { limit: limit * 2, cursor });

  // Filter to only include creators the user doesn't follow
  const discoveryItems = result.items.filter(
    (item) => !followedDids.has(item.video.author.did)
  );

  return c.json({
    feed: discoveryItems.slice(0, limit).map((item) => item.video),
    cursor: result.cursor,
    _meta: {
      personalized: true,
      newCreatorsOnly: true,
    },
  });
});

/**
 * Get challenge discovery feed - active challenges with top entries
 * GET /xrpc/io.exprsn.feed.getChallenges
 */
feedRouter.get('/io.exprsn.feed.getChallenges', optionalAuthMiddleware, async (c) => {
  const viewerDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 20);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor, 10) : 0;

  // Get active challenges ordered by participant count
  const activeChallenges = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.status, 'active'),
        gte(schema.challenges.endAt, new Date())
      )
    )
    .orderBy(desc(schema.challenges.participantCount))
    .limit(limit)
    .offset(offset);

  // Batch fetch all challenge entries to avoid N+1
  const challengeIds = activeChallenges.map((c) => c.id);
  const allEntriesQuery = await db
    .select({
      entry: schema.challengeEntries,
      video: videos,
    })
    .from(schema.challengeEntries)
    .innerJoin(videos, eq(schema.challengeEntries.videoUri, videos.uri))
    .where(inArray(schema.challengeEntries.challengeId, challengeIds))
    .orderBy(desc(schema.challengeEntries.engagementScore));

  // Group entries by challenge and take top 3 per challenge
  const entriesByChallenge = new Map<string, typeof allEntriesQuery>();
  for (const entry of allEntriesQuery) {
    const challengeId = entry.entry.challengeId;
    if (!entriesByChallenge.has(challengeId)) {
      entriesByChallenge.set(challengeId, []);
    }
    const challengeEntries = entriesByChallenge.get(challengeId)!;
    if (challengeEntries.length < 3) {
      challengeEntries.push(entry);
    }
  }

  // Extract all videos and batch process them
  const allVideosForChallenges = allEntriesQuery.map((e) => e.video);
  const allVideoViews = await buildVideoViewsBatch(allVideosForChallenges, viewerDid);
  const videoViewMap = new Map(
    allVideosForChallenges.map((v, idx) => [v.uri, allVideoViews[idx]])
  );

  // Build challenge feeds from pre-fetched data
  const challengeFeeds = activeChallenges.map((challenge) => {
    const topEntries = entriesByChallenge.get(challenge.id) || [];
    const entries = topEntries.map((e) => ({
      entry: {
        id: e.entry.id,
        score: e.entry.engagementScore,
        rank: e.entry.rank,
      },
      video: videoViewMap.get(e.video.uri)!,
    }));

    return {
      challenge: {
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        hashtag: challenge.tag,
        bannerUrl: challenge.bannerImageUrl,
        participantCount: challenge.participantCount,
        startDate: challenge.startAt.toISOString(),
        endDate: challenge.endAt.toISOString(),
        prizes: challenge.prizes,
      },
      entries,
    };
  });

  return c.json({
    challenges: challengeFeeds,
    cursor: activeChallenges.length >= limit ? String(offset + limit) : undefined,
  });
});
