/**
 * Search Routes - Full-text search across videos, users, and sounds
 *
 * Implements:
 * - GET /xrpc/io.exprsn.search.search - Unified search
 * - GET /xrpc/io.exprsn.search.videos - Search videos
 * - GET /xrpc/io.exprsn.search.users - Search users
 * - GET /xrpc/io.exprsn.search.sounds - Search sounds
 * - GET /xrpc/io.exprsn.search.typeahead - Autocomplete suggestions
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { optionalAuthMiddleware } from '../auth/middleware.js';
import { db, users, videos, sounds } from '../db/index.js';
import { eq, desc, and, or, sql, ilike, inArray, isNull, ne } from 'drizzle-orm';

export const searchRouter = new Hono();

// Minimum query length
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 50;
const DEFAULT_LIMIT = 25;

/**
 * Sanitize search query
 */
function sanitizeQuery(q: string): string {
  return q
    .trim()
    .replace(/[<>'"`;]/g, '') // Remove potential XSS characters
    .slice(0, 100); // Limit length
}

/**
 * Build video response
 */
function buildVideoResult(video: typeof videos.$inferSelect, author: typeof users.$inferSelect | null) {
  return {
    uri: video.uri,
    cid: video.cid,
    caption: video.caption,
    tags: video.tags,
    thumbnailUrl: video.thumbnailUrl,
    hlsPlaylist: video.hlsPlaylist,
    cdnUrl: video.cdnUrl,
    duration: video.duration,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    createdAt: video.createdAt.toISOString(),
    author: author ? {
      did: author.did,
      handle: author.handle,
      displayName: author.displayName,
      avatar: author.avatar,
    } : null,
  };
}

/**
 * Unified search across all content types
 * GET /xrpc/io.exprsn.search.search
 */
searchRouter.get('/io.exprsn.search.search', optionalAuthMiddleware, async (c) => {
  const q = c.req.query('q');
  const type = c.req.query('type') || 'all'; // 'all' | 'videos' | 'users' | 'sounds'
  const limit = Math.min(parseInt(c.req.query('limit') || String(DEFAULT_LIMIT)), MAX_RESULTS);
  const sort = c.req.query('sort') || 'relevance'; // 'relevance' | 'recent' | 'popular'

  if (!q || q.length < MIN_QUERY_LENGTH) {
    throw new HTTPException(400, {
      message: `Query must be at least ${MIN_QUERY_LENGTH} characters`,
    });
  }

  const query = sanitizeQuery(q);
  const searchPattern = `%${query}%`;

  const results: {
    videos?: any[];
    users?: any[];
    sounds?: any[];
  } = {};

  // Search videos
  if (type === 'all' || type === 'videos') {
    const orderBy = sort === 'recent'
      ? [desc(videos.createdAt)]
      : sort === 'popular'
        ? [desc(videos.viewCount), desc(videos.likeCount)]
        : [desc(videos.viewCount)]; // relevance approximated by view count

    const videoResults = await db
      .select({
        video: videos,
        author: users,
      })
      .from(videos)
      .leftJoin(users, eq(users.did, videos.authorDid))
      .where(
        and(
          or(
            ilike(videos.caption, searchPattern),
            sql`${videos.tags}::text ILIKE ${searchPattern}`
          ),
          eq(videos.visibility, 'public'),
          isNull(videos.deletedAt),
          eq(videos.moderationStatus, 'approved')
        )
      )
      .orderBy(...orderBy)
      .limit(limit);

    results.videos = videoResults.map(({ video, author }) =>
      buildVideoResult(video, author)
    );
  }

  // Search users
  if (type === 'all' || type === 'users') {
    const userResults = await db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.handle, searchPattern),
          ilike(users.displayName, searchPattern),
          ilike(users.bio, searchPattern)
        )
      )
      .orderBy(desc(users.followerCount))
      .limit(limit);

    results.users = userResults.map((user) => ({
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      verified: user.verified,
    }));
  }

  // Search sounds
  if (type === 'all' || type === 'sounds') {
    const soundResults = await db
      .select({
        sound: sounds,
        author: users,
      })
      .from(sounds)
      .leftJoin(users, eq(users.did, sounds.authorDid))
      .where(
        and(
          or(
            ilike(sounds.name, searchPattern),
            ilike(sounds.artistName, searchPattern)
          ),
          eq(sounds.isPublic, true)
        )
      )
      .orderBy(desc(sounds.usageCount))
      .limit(limit);

    results.sounds = soundResults.map(({ sound, author }) => ({
      uri: sound.uri,
      name: sound.name,
      artistName: sound.artistName,
      coverArt: sound.coverArt,
      duration: sound.duration,
      usageCount: sound.usageCount,
      audioUrl: sound.audioUrl,
      author: author ? {
        did: author.did,
        handle: author.handle,
        displayName: author.displayName,
        avatar: author.avatar,
      } : null,
    }));
  }

  return c.json({
    query,
    type,
    ...results,
  });
});

/**
 * Search videos only
 * GET /xrpc/io.exprsn.search.videos
 */
searchRouter.get('/io.exprsn.search.videos', optionalAuthMiddleware, async (c) => {
  const q = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || String(DEFAULT_LIMIT)), MAX_RESULTS);
  const cursor = c.req.query('cursor');
  const sort = c.req.query('sort') || 'relevance';
  const author = c.req.query('author');
  const tags = c.req.query('tags')?.split(',').filter(Boolean);

  if (!q || q.length < MIN_QUERY_LENGTH) {
    throw new HTTPException(400, {
      message: `Query must be at least ${MIN_QUERY_LENGTH} characters`,
    });
  }

  const query = sanitizeQuery(q);
  const searchPattern = `%${query}%`;

  const conditions = [
    or(
      ilike(videos.caption, searchPattern),
      sql`${videos.tags}::text ILIKE ${searchPattern}`
    ),
    eq(videos.visibility, 'public'),
    isNull(videos.deletedAt),
    eq(videos.moderationStatus, 'approved'),
  ];

  // Filter by author
  if (author) {
    conditions.push(eq(videos.authorDid, author));
  }

  // Filter by tags
  if (tags && tags.length > 0) {
    // Videos must have at least one of the specified tags
    conditions.push(
      sql`${videos.tags} ?| ARRAY[${sql.raw(tags.map(t => `'${t}'`).join(','))}]`
    );
  }

  // Handle cursor pagination
  if (cursor) {
    try {
      const { createdAt, uri } = JSON.parse(Buffer.from(cursor, 'base64').toString());
      conditions.push(
        or(
          sql`${videos.createdAt} < ${new Date(createdAt)}`,
          and(
            eq(videos.createdAt, new Date(createdAt)),
            sql`${videos.uri} < ${uri}`
          )
        )!
      );
    } catch {
      throw new HTTPException(400, { message: 'Invalid cursor' });
    }
  }

  const orderBy = sort === 'recent'
    ? [desc(videos.createdAt), desc(videos.uri)]
    : sort === 'popular'
      ? [desc(videos.viewCount), desc(videos.likeCount), desc(videos.createdAt)]
      : [desc(videos.viewCount), desc(videos.createdAt)];

  const videoResults = await db
    .select({
      video: videos,
      author: users,
    })
    .from(videos)
    .leftJoin(users, eq(users.did, videos.authorDid))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit + 1);

  const hasMore = videoResults.length > limit;
  const results = videoResults.slice(0, limit);

  let nextCursor: string | undefined;
  if (hasMore && results.length > 0) {
    const last = results[results.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify({
      createdAt: last.video.createdAt.toISOString(),
      uri: last.video.uri,
    })).toString('base64');
  }

  return c.json({
    query,
    videos: results.map(({ video, author }) => buildVideoResult(video, author)),
    cursor: nextCursor,
  });
});

/**
 * Search users only
 * GET /xrpc/io.exprsn.search.users
 */
searchRouter.get('/io.exprsn.search.users', optionalAuthMiddleware, async (c) => {
  const q = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || String(DEFAULT_LIMIT)), MAX_RESULTS);
  const cursor = c.req.query('cursor');

  if (!q || q.length < MIN_QUERY_LENGTH) {
    throw new HTTPException(400, {
      message: `Query must be at least ${MIN_QUERY_LENGTH} characters`,
    });
  }

  const query = sanitizeQuery(q);
  const searchPattern = `%${query}%`;

  const conditions = [
    or(
      ilike(users.handle, searchPattern),
      ilike(users.displayName, searchPattern)
    ),
  ];

  // Handle cursor pagination
  if (cursor) {
    try {
      const { followerCount, did } = JSON.parse(Buffer.from(cursor, 'base64').toString());
      conditions.push(
        or(
          sql`${users.followerCount} < ${followerCount}`,
          and(
            eq(users.followerCount, followerCount),
            sql`${users.did} < ${did}`
          )
        )!
      );
    } catch {
      throw new HTTPException(400, { message: 'Invalid cursor' });
    }
  }

  const userResults = await db
    .select()
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.followerCount), desc(users.did))
    .limit(limit + 1);

  const hasMore = userResults.length > limit;
  const results = userResults.slice(0, limit);

  let nextCursor: string | undefined;
  if (hasMore && results.length > 0) {
    const last = results[results.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify({
      followerCount: last.followerCount,
      did: last.did,
    })).toString('base64');
  }

  return c.json({
    query,
    users: results.map((user) => ({
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      verified: user.verified,
    })),
    cursor: nextCursor,
  });
});

/**
 * Search sounds only
 * GET /xrpc/io.exprsn.search.sounds
 */
searchRouter.get('/io.exprsn.search.sounds', optionalAuthMiddleware, async (c) => {
  const q = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || String(DEFAULT_LIMIT)), MAX_RESULTS);
  const cursor = c.req.query('cursor');

  if (!q || q.length < MIN_QUERY_LENGTH) {
    throw new HTTPException(400, {
      message: `Query must be at least ${MIN_QUERY_LENGTH} characters`,
    });
  }

  const query = sanitizeQuery(q);
  const searchPattern = `%${query}%`;

  const conditions = [
    or(
      ilike(sounds.name, searchPattern),
      ilike(sounds.artistName, searchPattern)
    ),
    eq(sounds.isPublic, true),
  ];

  // Handle cursor pagination
  if (cursor) {
    try {
      const { usageCount, uri } = JSON.parse(Buffer.from(cursor, 'base64').toString());
      conditions.push(
        or(
          sql`${sounds.usageCount} < ${usageCount}`,
          and(
            eq(sounds.usageCount, usageCount),
            sql`${sounds.uri} < ${uri}`
          )
        )!
      );
    } catch {
      throw new HTTPException(400, { message: 'Invalid cursor' });
    }
  }

  const soundResults = await db
    .select({
      sound: sounds,
      author: users,
    })
    .from(sounds)
    .leftJoin(users, eq(users.did, sounds.authorDid))
    .where(and(...conditions))
    .orderBy(desc(sounds.usageCount), desc(sounds.uri))
    .limit(limit + 1);

  const hasMore = soundResults.length > limit;
  const results = soundResults.slice(0, limit);

  let nextCursor: string | undefined;
  if (hasMore && results.length > 0) {
    const last = results[results.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify({
      usageCount: last.sound.usageCount,
      uri: last.sound.uri,
    })).toString('base64');
  }

  return c.json({
    query,
    sounds: results.map(({ sound, author }) => ({
      uri: sound.uri,
      name: sound.name,
      artistName: sound.artistName,
      coverArt: sound.coverArt,
      duration: sound.duration,
      usageCount: sound.usageCount,
      audioUrl: sound.audioUrl,
      author: author ? {
        did: author.did,
        handle: author.handle,
        displayName: author.displayName,
        avatar: author.avatar,
      } : null,
    })),
    cursor: nextCursor,
  });
});

/**
 * Typeahead/autocomplete suggestions
 * GET /xrpc/io.exprsn.search.typeahead
 */
searchRouter.get('/io.exprsn.search.typeahead', optionalAuthMiddleware, async (c) => {
  const q = c.req.query('q');
  const type = c.req.query('type') || 'all'; // 'all' | 'users' | 'tags' | 'sounds'
  const limit = Math.min(parseInt(c.req.query('limit') || '8'), 15);

  if (!q || q.length < 1) {
    return c.json({ suggestions: [] });
  }

  const query = sanitizeQuery(q);
  const searchPattern = `${query}%`; // Prefix match for typeahead

  const suggestions: Array<{
    type: 'user' | 'tag' | 'sound';
    value: string;
    label: string;
    avatar?: string;
    meta?: string;
  }> = [];

  // Search users (by handle prefix)
  if (type === 'all' || type === 'users') {
    const userResults = await db
      .select({
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        followerCount: users.followerCount,
      })
      .from(users)
      .where(
        or(
          ilike(users.handle, searchPattern),
          ilike(users.displayName, `%${query}%`)
        )
      )
      .orderBy(desc(users.followerCount))
      .limit(limit);

    suggestions.push(
      ...userResults.map((user) => ({
        type: 'user' as const,
        value: user.handle,
        label: user.displayName || user.handle,
        avatar: user.avatar || undefined,
        meta: `${user.followerCount?.toLocaleString() || 0} followers`,
      }))
    );
  }

  // Search tags (from video tags)
  if (type === 'all' || type === 'tags') {
    // Get distinct tags that match the query
    const tagResults = await db
      .select({
        tag: sql<string>`DISTINCT unnest(${videos.tags})`.as('tag'),
      })
      .from(videos)
      .where(
        and(
          sql`EXISTS (SELECT 1 FROM unnest(${videos.tags}) t WHERE t ILIKE ${searchPattern})`,
          eq(videos.visibility, 'public'),
          isNull(videos.deletedAt)
        )
      )
      .limit(limit);

    // Filter to only matching tags
    const matchingTags = tagResults
      .filter((r) => r.tag?.toLowerCase().startsWith(query.toLowerCase()))
      .slice(0, limit);

    suggestions.push(
      ...matchingTags.map((r) => ({
        type: 'tag' as const,
        value: r.tag,
        label: `#${r.tag}`,
      }))
    );
  }

  // Search sounds
  if (type === 'all' || type === 'sounds') {
    const soundResults = await db
      .select({
        name: sounds.name,
        artistName: sounds.artistName,
        coverArt: sounds.coverArt,
        usageCount: sounds.usageCount,
      })
      .from(sounds)
      .where(
        and(
          or(
            ilike(sounds.name, searchPattern),
            ilike(sounds.artistName, searchPattern)
          ),
          eq(sounds.isPublic, true)
        )
      )
      .orderBy(desc(sounds.usageCount))
      .limit(limit);

    suggestions.push(
      ...soundResults.map((sound) => ({
        type: 'sound' as const,
        value: sound.name,
        label: sound.name,
        avatar: sound.coverArt || undefined,
        meta: sound.artistName || undefined,
      }))
    );
  }

  // Sort by relevance (exact prefix matches first)
  suggestions.sort((a, b) => {
    const aExact = a.value.toLowerCase().startsWith(query.toLowerCase());
    const bExact = b.value.toLowerCase().startsWith(query.toLowerCase());
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  });

  return c.json({
    query,
    suggestions: suggestions.slice(0, limit),
  });
});

/**
 * Get trending searches
 * GET /xrpc/io.exprsn.search.trending
 */
searchRouter.get('/io.exprsn.search.trending', optionalAuthMiddleware, async (c) => {
  // For now, return popular tags from recent videos
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 20);

  // Get most used tags from videos in the last 7 days
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 7);

  const tagCounts = await db
    .select({
      tag: sql<string>`unnest(${videos.tags})`.as('tag'),
      count: sql<number>`count(*)`.as('count'),
    })
    .from(videos)
    .where(
      and(
        sql`${videos.createdAt} > ${recentDate}`,
        eq(videos.visibility, 'public'),
        isNull(videos.deletedAt),
        eq(videos.moderationStatus, 'approved')
      )
    )
    .groupBy(sql`unnest(${videos.tags})`)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return c.json({
    trending: tagCounts.map((t) => ({
      tag: t.tag,
      label: `#${t.tag}`,
      count: t.count,
    })),
  });
});

export default searchRouter;
