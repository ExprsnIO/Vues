/**
 * Sound Trends API Routes
 * Endpoints for discovering and exploring trending sounds
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import { sounds, trendingSounds, soundUsageHistory, videos, users } from '../db/schema.js';
import { eq, desc, like, and, gte, sql, ilike, or } from 'drizzle-orm';
import { optionalAuthMiddleware } from '../auth/middleware.js';

const soundsRouter = new Hono();

/**
 * Get trending sounds
 * GET /xrpc/io.exprsn.sound.getTrending
 */
soundsRouter.get('/io.exprsn.sound.getTrending', optionalAuthMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor) : 0;

  // Get trending sounds with their stats
  const trending = await db
    .select({
      soundId: trendingSounds.soundId,
      score: trendingSounds.score,
      velocity: trendingSounds.velocity,
      rank: trendingSounds.rank,
      recentUseCount: trendingSounds.recentUseCount,
      // Sound details
      sound: {
        id: sounds.id,
        title: sounds.title,
        artist: sounds.artist,
        duration: sounds.duration,
        audioUrl: sounds.audioUrl,
        coverUrl: sounds.coverUrl,
        useCount: sounds.useCount,
        originalVideoUri: sounds.originalVideoUri,
        createdAt: sounds.createdAt,
      },
    })
    .from(trendingSounds)
    .innerJoin(sounds, eq(trendingSounds.soundId, sounds.id))
    .orderBy(trendingSounds.rank)
    .limit(limit + 1)
    .offset(offset);

  const hasMore = trending.length > limit;
  const results = hasMore ? trending.slice(0, limit) : trending;

  // Get sample videos for each sound
  const soundsWithSamples = await Promise.all(
    results.map(async (item) => {
      const sampleVideos = await db
        .select({
          uri: videos.uri,
          thumbnailUrl: videos.thumbnailUrl,
        })
        .from(videos)
        .where(eq(videos.soundUri, item.soundId))
        .orderBy(desc(videos.likeCount))
        .limit(3);

      // Determine trending direction based on velocity
      let trendingDirection: 'up' | 'stable' | 'down' = 'stable';
      if (item.velocity > 0.5) trendingDirection = 'up';
      else if (item.velocity < -0.5) trendingDirection = 'down';

      return {
        id: item.sound.id,
        title: item.sound.title,
        artist: item.sound.artist,
        duration: item.sound.duration,
        audioUrl: item.sound.audioUrl,
        coverUrl: item.sound.coverUrl,
        useCount: item.sound.useCount,
        recentUseCount: item.recentUseCount,
        velocity: item.velocity,
        rank: item.rank,
        score: item.score,
        trendingDirection,
        sampleVideos,
      };
    })
  );

  return c.json({
    sounds: soundsWithSamples,
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

/**
 * Get sound details
 * GET /xrpc/io.exprsn.sound.getSound
 */
soundsRouter.get('/io.exprsn.sound.getSound', optionalAuthMiddleware, async (c) => {
  const soundId = c.req.query('soundId');

  if (!soundId) {
    return c.json({ error: 'soundId is required' }, 400);
  }

  const sound = await db.query.sounds.findFirst({
    where: eq(sounds.id, soundId),
  });

  if (!sound) {
    return c.json({ error: 'Sound not found' }, 404);
  }

  // Get trending stats if available
  const trendingStats = await db.query.trendingSounds.findFirst({
    where: eq(trendingSounds.soundId, soundId),
  });

  // Count recent uses (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentUsesResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(soundUsageHistory)
    .where(
      and(
        eq(soundUsageHistory.soundId, soundId),
        gte(soundUsageHistory.createdAt, oneDayAgo)
      )
    );
  const recentUseCount = recentUsesResult[0]?.count || 0;

  // Get original video info if available
  let originalVideo = null;
  if (sound.originalVideoUri) {
    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, sound.originalVideoUri),
    });
    if (video) {
      const author = await db.query.users.findFirst({
        where: eq(users.did, video.authorDid),
      });
      originalVideo = {
        uri: video.uri,
        thumbnailUrl: video.thumbnailUrl,
        author: author ? {
          did: author.did,
          handle: author.handle,
          displayName: author.displayName,
          avatar: author.avatar,
        } : null,
      };
    }
  }

  // Get sample videos using this sound
  const sampleVideos = await db
    .select({
      uri: videos.uri,
      thumbnailUrl: videos.thumbnailUrl,
      viewCount: videos.viewCount,
      likeCount: videos.likeCount,
    })
    .from(videos)
    .where(eq(videos.soundUri, soundId))
    .orderBy(desc(videos.likeCount))
    .limit(6);

  return c.json({
    sound: {
      id: sound.id,
      title: sound.title,
      artist: sound.artist,
      duration: sound.duration,
      audioUrl: sound.audioUrl,
      coverUrl: sound.coverUrl,
      useCount: sound.useCount,
      recentUseCount,
      createdAt: sound.createdAt,
      trending: trendingStats ? {
        rank: trendingStats.rank,
        velocity: trendingStats.velocity,
        score: trendingStats.score,
      } : null,
    },
    originalVideo,
    sampleVideos,
  });
});

/**
 * Get videos using a sound
 * GET /xrpc/io.exprsn.sound.getVideosUsing
 */
soundsRouter.get('/io.exprsn.sound.getVideosUsing', optionalAuthMiddleware, async (c) => {
  const soundId = c.req.query('soundId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const cursor = c.req.query('cursor');
  const sort = c.req.query('sort') || 'popular'; // 'popular' | 'recent'

  if (!soundId) {
    return c.json({ error: 'soundId is required' }, 400);
  }

  // Verify sound exists
  const sound = await db.query.sounds.findFirst({
    where: eq(sounds.id, soundId),
  });

  if (!sound) {
    return c.json({ error: 'Sound not found' }, 404);
  }

  // Build conditions
  const conditions = [
    eq(videos.soundUri, soundId),
    eq(videos.visibility, 'public'),
  ];

  // Apply cursor condition
  if (cursor) {
    const parts = cursor.split(':');
    const sortValue = parts[0];
    const cursorUri = parts[1];
    if (sortValue && cursorUri) {
      if (sort === 'popular') {
        conditions.push(
          or(
            sql`${videos.likeCount} < ${parseInt(sortValue)}`,
            and(
              eq(videos.likeCount, parseInt(sortValue)),
              sql`${videos.uri} > ${cursorUri}`
            )
          )!
        );
      } else {
        conditions.push(
          or(
            sql`${videos.createdAt} < ${new Date(sortValue)}`,
            and(
              eq(videos.createdAt, new Date(sortValue)),
              sql`${videos.uri} > ${cursorUri}`
            )
          )!
        );
      }
    }
  }

  // Build and execute query
  const orderByClause = sort === 'popular'
    ? [desc(videos.likeCount), videos.uri]
    : [desc(videos.createdAt), videos.uri];

  const videoResults = await db
    .select({
      uri: videos.uri,
      cid: videos.cid,
      authorDid: videos.authorDid,
      caption: videos.caption,
      thumbnailUrl: videos.thumbnailUrl,
      cdnUrl: videos.cdnUrl,
      hlsPlaylist: videos.hlsPlaylist,
      duration: videos.duration,
      viewCount: videos.viewCount,
      likeCount: videos.likeCount,
      commentCount: videos.commentCount,
      shareCount: videos.shareCount,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .where(and(...conditions))
    .orderBy(...orderByClause)
    .limit(limit + 1);

  const hasMore = videoResults.length > limit;
  const results = hasMore ? videoResults.slice(0, limit) : videoResults;

  // Get author info for each video
  const videosWithAuthors = await Promise.all(
    results.map(async (video) => {
      const author = await db.query.users.findFirst({
        where: eq(users.did, video.authorDid),
      });

      return {
        ...video,
        author: author ? {
          did: author.did,
          handle: author.handle,
          displayName: author.displayName,
          avatar: author.avatar,
          verified: author.verified,
        } : null,
      };
    })
  );

  // Generate cursor
  let nextCursor: string | undefined;
  if (hasMore && results.length > 0) {
    const lastVideo = results[results.length - 1];
    if (lastVideo) {
      if (sort === 'popular') {
        nextCursor = `${lastVideo.likeCount}:${lastVideo.uri}`;
      } else {
        nextCursor = `${lastVideo.createdAt.toISOString()}:${lastVideo.uri}`;
      }
    }
  }

  return c.json({
    sound: {
      id: sound.id,
      title: sound.title,
      artist: sound.artist,
      useCount: sound.useCount,
    },
    videos: videosWithAuthors,
    cursor: nextCursor,
  });
});

/**
 * Search sounds
 * GET /xrpc/io.exprsn.sound.search
 */
soundsRouter.get('/io.exprsn.sound.search', optionalAuthMiddleware, async (c) => {
  const query = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor) : 0;

  if (!query || query.length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }

  const searchPattern = `%${query}%`;

  const results = await db
    .select({
      id: sounds.id,
      title: sounds.title,
      artist: sounds.artist,
      duration: sounds.duration,
      audioUrl: sounds.audioUrl,
      coverUrl: sounds.coverUrl,
      useCount: sounds.useCount,
      createdAt: sounds.createdAt,
    })
    .from(sounds)
    .where(
      or(
        ilike(sounds.title, searchPattern),
        ilike(sounds.artist, searchPattern)
      )
    )
    .orderBy(desc(sounds.useCount), desc(sounds.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = results.length > limit;
  const soundResults = hasMore ? results.slice(0, limit) : results;

  return c.json({
    sounds: soundResults,
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

/**
 * Get suggested sounds (personalized or popular)
 * GET /xrpc/io.exprsn.sound.getSuggested
 */
soundsRouter.get('/io.exprsn.sound.getSuggested', optionalAuthMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);

  // For now, return popular sounds
  // In the future, this could be personalized based on user preferences
  const popularSounds = await db
    .select({
      id: sounds.id,
      title: sounds.title,
      artist: sounds.artist,
      duration: sounds.duration,
      audioUrl: sounds.audioUrl,
      coverUrl: sounds.coverUrl,
      useCount: sounds.useCount,
    })
    .from(sounds)
    .orderBy(desc(sounds.useCount))
    .limit(limit);

  // Get sample video for each sound
  const soundsWithSample = await Promise.all(
    popularSounds.map(async (sound) => {
      const sampleVideo = await db
        .select({
          uri: videos.uri,
          thumbnailUrl: videos.thumbnailUrl,
        })
        .from(videos)
        .where(eq(videos.soundUri, sound.id))
        .orderBy(desc(videos.likeCount))
        .limit(1);

      return {
        ...sound,
        sampleVideo: sampleVideo[0] || null,
      };
    })
  );

  return c.json({
    sounds: soundsWithSample,
  });
});

export default soundsRouter;
