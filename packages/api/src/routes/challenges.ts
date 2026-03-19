/**
 * Video Challenges API Routes
 * Public endpoints for discovering and viewing challenges
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  challenges,
  challengeEntries,
  challengeParticipation,
  videos,
  users,
  sounds,
  adminUsers,
} from '../db/schema.js';
import { eq, desc, and, or, gte, lte, sql, ilike, inArray, count, countDistinct, sum } from 'drizzle-orm';
import { optionalAuthMiddleware, authMiddleware, adminAuthMiddleware } from '../auth/middleware.js';
import { nanoid } from 'nanoid';

const challengesRouter = new Hono();

// =============================================================================
// Public Challenge Endpoints
// =============================================================================

/**
 * Get challenge by ID or hashtag
 * GET /xrpc/io.exprsn.challenge.getChallenge
 */
challengesRouter.get('/io.exprsn.challenge.getChallenge', optionalAuthMiddleware, async (c) => {
  const id = c.req.query('id');
  const hashtag = c.req.query('hashtag');

  if (!id && !hashtag) {
    return c.json({ error: 'id or hashtag is required' }, 400);
  }

  const challenge = await db.query.challenges.findFirst({
    where: id
      ? eq(challenges.id, id)
      : eq(sql`LOWER(${challenges.tag})`, hashtag!.toLowerCase().replace(/^#/, '')),
  });

  if (!challenge) {
    return c.json({ error: 'Challenge not found' }, 404);
  }

  // Get featured sound if exists
  let featuredSound = null;
  if (challenge.featuredSoundId) {
    featuredSound = await db.query.sounds.findFirst({
      where: eq(sounds.id, challenge.featuredSoundId),
    });
  }

  // Get top 3 entries for preview
  const topEntries = await db
    .select({
      id: challengeEntries.id,
      videoUri: challengeEntries.videoUri,
      rank: challengeEntries.rank,
      engagementScore: challengeEntries.engagementScore,
      isWinner: challengeEntries.isWinner,
      isFeatured: challengeEntries.isFeatured,
      video: {
        thumbnailUrl: videos.thumbnailUrl,
        viewCount: videos.viewCount,
        likeCount: videos.likeCount,
      },
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        verified: users.verified,
      },
    })
    .from(challengeEntries)
    .innerJoin(videos, eq(challengeEntries.videoUri, videos.uri))
    .innerJoin(users, eq(challengeEntries.userDid, users.did))
    .where(eq(challengeEntries.challengeId, challenge.id))
    .orderBy(challengeEntries.rank)
    .limit(3);

  // Get user participation if authenticated
  const userDid = c.get('userDid');
  let userParticipation = null;
  if (userDid) {
    userParticipation = await db.query.challengeParticipation.findFirst({
      where: and(
        eq(challengeParticipation.challengeId, challenge.id),
        eq(challengeParticipation.userDid, userDid)
      ),
    });
  }

  return c.json({
    challenge: {
      id: challenge.id,
      name: challenge.name,
      description: challenge.description,
      hashtag: challenge.tag,
      rules: challenge.rules,
      coverImageUrl: challenge.coverImageUrl,
      bannerImageUrl: challenge.bannerImageUrl,
      prizes: challenge.prizes,
      status: challenge.status,
      entryCount: challenge.entryCount,
      participantCount: challenge.participantCount,
      totalViews: challenge.totalViews,
      totalEngagement: challenge.totalEngagement,
      startAt: challenge.startAt,
      endAt: challenge.endAt,
      votingEndAt: challenge.votingEndAt,
      createdAt: challenge.createdAt,
    },
    featuredSound: featuredSound ? {
      id: featuredSound.id,
      title: featuredSound.title,
      artist: featuredSound.artist,
      audioUrl: featuredSound.audioUrl,
      coverUrl: featuredSound.coverUrl,
    } : null,
    topEntries,
    userParticipation: userParticipation ? {
      entryCount: userParticipation.entryCount,
      bestRank: userParticipation.bestRank,
      isWinner: userParticipation.isWinner,
      joinedAt: userParticipation.joinedAt,
    } : null,
  });
});

/**
 * Get challenge statistics
 * GET /xrpc/io.exprsn.challenge.getStats
 */
challengesRouter.get('/io.exprsn.challenge.getStats', optionalAuthMiddleware, async (c) => {
  const challengeId = c.req.query('challengeId');

  if (!challengeId) {
    return c.json({ error: 'challengeId is required' }, 400);
  }

  // Verify challenge exists
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });

  if (!challenge) {
    return c.json({ error: 'Challenge not found' }, 404);
  }

  // Get aggregate statistics
  const statsResult = await db
    .select({
      totalEntries: count(),
      uniqueCreators: countDistinct(videos.authorDid),
      totalViews: sum(videos.viewCount),
      totalLikes: sum(videos.likeCount),
      totalComments: sum(videos.commentCount),
      totalShares: sum(videos.shareCount),
    })
    .from(challengeEntries)
    .innerJoin(videos, eq(challengeEntries.videoUri, videos.uri))
    .where(eq(challengeEntries.challengeId, challengeId));

  const stats = statsResult[0];

  // Get top creators by entry count
  const topCreators = await db
    .select({
      authorDid: videos.authorDid,
      entryCount: count(),
      totalViews: sum(videos.viewCount),
    })
    .from(challengeEntries)
    .innerJoin(videos, eq(challengeEntries.videoUri, videos.uri))
    .where(eq(challengeEntries.challengeId, challengeId))
    .groupBy(videos.authorDid)
    .orderBy(desc(count()))
    .limit(10);

  // Get user info for top creators
  const creatorDids = topCreators.map((c) => c.authorDid);
  const creatorUsers = creatorDids.length > 0
    ? await db.query.users.findMany({
        where: inArray(users.did, creatorDids),
      })
    : [];
  const userMap = new Map(creatorUsers.map((u) => [u.did, u]));

  return c.json({
    stats: {
      totalEntries: Number(stats?.totalEntries || 0),
      uniqueCreators: Number(stats?.uniqueCreators || 0),
      totalViews: Number(stats?.totalViews || 0),
      totalLikes: Number(stats?.totalLikes || 0),
      totalComments: Number(stats?.totalComments || 0),
      totalShares: Number(stats?.totalShares || 0),
      totalEngagement: Number(stats?.totalLikes || 0) + Number(stats?.totalComments || 0) + Number(stats?.totalShares || 0),
    },
    topCreators: topCreators.map((c) => {
      const user = userMap.get(c.authorDid);
      return {
        did: c.authorDid,
        handle: user?.handle || 'unknown',
        displayName: user?.displayName,
        avatar: user?.avatar,
        entryCount: Number(c.entryCount),
        totalViews: Number(c.totalViews || 0),
      };
    }),
  });
});

/**
 * Get active challenges
 * GET /xrpc/io.exprsn.challenge.getActive
 */
challengesRouter.get('/io.exprsn.challenge.getActive', optionalAuthMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor) : 0;

  const activeChallenges = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.status, 'active'),
        eq(challenges.visibility, 'public')
      )
    )
    .orderBy(desc(challenges.entryCount))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = activeChallenges.length > limit;
  const results = hasMore ? activeChallenges.slice(0, limit) : activeChallenges;

  return c.json({
    challenges: results.map((ch) => ({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      hashtag: ch.tag,
      coverImageUrl: ch.coverImageUrl,
      status: ch.status,
      entryCount: ch.entryCount,
      participantCount: ch.participantCount,
      startAt: ch.startAt,
      endAt: ch.endAt,
    })),
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

/**
 * Get upcoming challenges
 * GET /xrpc/io.exprsn.challenge.getUpcoming
 */
challengesRouter.get('/io.exprsn.challenge.getUpcoming', optionalAuthMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

  const upcomingChallenges = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.status, 'upcoming'),
        eq(challenges.visibility, 'public')
      )
    )
    .orderBy(challenges.startAt)
    .limit(limit);

  return c.json({
    challenges: upcomingChallenges.map((ch) => ({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      hashtag: ch.tag,
      coverImageUrl: ch.coverImageUrl,
      status: ch.status,
      startAt: ch.startAt,
      endAt: ch.endAt,
    })),
  });
});

/**
 * Get ended challenges
 * GET /xrpc/io.exprsn.challenge.getEnded
 */
challengesRouter.get('/io.exprsn.challenge.getEnded', optionalAuthMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor) : 0;

  const endedChallenges = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.status, 'ended'),
        eq(challenges.visibility, 'public')
      )
    )
    .orderBy(desc(challenges.endAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = endedChallenges.length > limit;
  const results = hasMore ? endedChallenges.slice(0, limit) : endedChallenges;

  return c.json({
    challenges: results.map((ch) => ({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      hashtag: ch.tag,
      coverImageUrl: ch.coverImageUrl,
      status: ch.status,
      entryCount: ch.entryCount,
      participantCount: ch.participantCount,
      totalViews: ch.totalViews,
      endAt: ch.endAt,
    })),
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

/**
 * Get challenge leaderboard
 * GET /xrpc/io.exprsn.challenge.getLeaderboard
 */
challengesRouter.get('/io.exprsn.challenge.getLeaderboard', optionalAuthMiddleware, async (c) => {
  const challengeId = c.req.query('challengeId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor) : 0;

  if (!challengeId) {
    return c.json({ error: 'challengeId is required' }, 400);
  }

  // Verify challenge exists
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });

  if (!challenge) {
    return c.json({ error: 'Challenge not found' }, 404);
  }

  const entries = await db
    .select({
      id: challengeEntries.id,
      videoUri: challengeEntries.videoUri,
      rank: challengeEntries.rank,
      viewCount: challengeEntries.viewCount,
      likeCount: challengeEntries.likeCount,
      commentCount: challengeEntries.commentCount,
      shareCount: challengeEntries.shareCount,
      engagementScore: challengeEntries.engagementScore,
      isWinner: challengeEntries.isWinner,
      winnerPosition: challengeEntries.winnerPosition,
      isFeatured: challengeEntries.isFeatured,
      submittedAt: challengeEntries.submittedAt,
      video: {
        uri: videos.uri,
        thumbnailUrl: videos.thumbnailUrl,
        caption: videos.caption,
        duration: videos.duration,
      },
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        verified: users.verified,
      },
    })
    .from(challengeEntries)
    .innerJoin(videos, eq(challengeEntries.videoUri, videos.uri))
    .innerJoin(users, eq(challengeEntries.userDid, users.did))
    .where(eq(challengeEntries.challengeId, challengeId))
    .orderBy(challengeEntries.rank)
    .limit(limit + 1)
    .offset(offset);

  const hasMore = entries.length > limit;
  const results = hasMore ? entries.slice(0, limit) : entries;

  return c.json({
    challenge: {
      id: challenge.id,
      name: challenge.name,
      status: challenge.status,
      entryCount: challenge.entryCount,
    },
    entries: results,
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

/**
 * Get challenge entries (videos)
 * GET /xrpc/io.exprsn.challenge.getEntries
 */
challengesRouter.get('/io.exprsn.challenge.getEntries', optionalAuthMiddleware, async (c) => {
  const challengeId = c.req.query('challengeId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const cursor = c.req.query('cursor');
  const sort = c.req.query('sort') || 'rank'; // 'rank' | 'recent' | 'popular'

  if (!challengeId) {
    return c.json({ error: 'challengeId is required' }, 400);
  }

  let query = db
    .select({
      id: challengeEntries.id,
      videoUri: challengeEntries.videoUri,
      rank: challengeEntries.rank,
      engagementScore: challengeEntries.engagementScore,
      isWinner: challengeEntries.isWinner,
      isFeatured: challengeEntries.isFeatured,
      submittedAt: challengeEntries.submittedAt,
      video: {
        uri: videos.uri,
        thumbnailUrl: videos.thumbnailUrl,
        cdnUrl: videos.cdnUrl,
        hlsPlaylist: videos.hlsPlaylist,
        caption: videos.caption,
        duration: videos.duration,
        viewCount: videos.viewCount,
        likeCount: videos.likeCount,
      },
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        verified: users.verified,
      },
    })
    .from(challengeEntries)
    .innerJoin(videos, eq(challengeEntries.videoUri, videos.uri))
    .innerJoin(users, eq(challengeEntries.userDid, users.did))
    .where(eq(challengeEntries.challengeId, challengeId));

  // Apply sort
  if (sort === 'recent') {
    query = query.orderBy(desc(challengeEntries.submittedAt)) as typeof query;
  } else if (sort === 'popular') {
    query = query.orderBy(desc(videos.likeCount)) as typeof query;
  } else {
    query = query.orderBy(challengeEntries.rank) as typeof query;
  }

  // Apply cursor
  const offset = cursor ? parseInt(cursor) : 0;
  const entries = await query.limit(limit + 1).offset(offset);

  const hasMore = entries.length > limit;
  const results = hasMore ? entries.slice(0, limit) : entries;

  return c.json({
    entries: results,
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

/**
 * Get featured/winner entries
 * GET /xrpc/io.exprsn.challenge.getFeatured
 */
challengesRouter.get('/io.exprsn.challenge.getFeatured', optionalAuthMiddleware, async (c) => {
  const challengeId = c.req.query('challengeId');

  if (!challengeId) {
    return c.json({ error: 'challengeId is required' }, 400);
  }

  // Get winners
  const winners = await db
    .select({
      id: challengeEntries.id,
      videoUri: challengeEntries.videoUri,
      rank: challengeEntries.rank,
      winnerPosition: challengeEntries.winnerPosition,
      engagementScore: challengeEntries.engagementScore,
      video: {
        uri: videos.uri,
        thumbnailUrl: videos.thumbnailUrl,
        caption: videos.caption,
        viewCount: videos.viewCount,
        likeCount: videos.likeCount,
      },
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        verified: users.verified,
      },
    })
    .from(challengeEntries)
    .innerJoin(videos, eq(challengeEntries.videoUri, videos.uri))
    .innerJoin(users, eq(challengeEntries.userDid, users.did))
    .where(
      and(
        eq(challengeEntries.challengeId, challengeId),
        eq(challengeEntries.isWinner, true)
      )
    )
    .orderBy(challengeEntries.winnerPosition);

  // Get featured (non-winner)
  const featured = await db
    .select({
      id: challengeEntries.id,
      videoUri: challengeEntries.videoUri,
      rank: challengeEntries.rank,
      engagementScore: challengeEntries.engagementScore,
      video: {
        uri: videos.uri,
        thumbnailUrl: videos.thumbnailUrl,
        caption: videos.caption,
        viewCount: videos.viewCount,
        likeCount: videos.likeCount,
      },
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        verified: users.verified,
      },
    })
    .from(challengeEntries)
    .innerJoin(videos, eq(challengeEntries.videoUri, videos.uri))
    .innerJoin(users, eq(challengeEntries.userDid, users.did))
    .where(
      and(
        eq(challengeEntries.challengeId, challengeId),
        eq(challengeEntries.isFeatured, true),
        eq(challengeEntries.isWinner, false)
      )
    )
    .orderBy(challengeEntries.rank)
    .limit(10);

  return c.json({
    winners,
    featured,
  });
});

/**
 * Get user's challenge participation history
 * GET /xrpc/io.exprsn.challenge.getUserParticipation
 */
challengesRouter.get('/io.exprsn.challenge.getUserParticipation', optionalAuthMiddleware, async (c) => {
  const userDid = c.req.query('userDid') || c.get('userDid');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor) : 0;

  if (!userDid) {
    return c.json({ error: 'userDid is required or must be authenticated' }, 400);
  }

  const participations = await db
    .select({
      participation: {
        id: challengeParticipation.id,
        entryCount: challengeParticipation.entryCount,
        bestRank: challengeParticipation.bestRank,
        isWinner: challengeParticipation.isWinner,
        joinedAt: challengeParticipation.joinedAt,
      },
      challenge: {
        id: challenges.id,
        name: challenges.name,
        hashtag: challenges.tag,
        coverImageUrl: challenges.coverImageUrl,
        status: challenges.status,
        entryCount: challenges.entryCount,
        endAt: challenges.endAt,
      },
    })
    .from(challengeParticipation)
    .innerJoin(challenges, eq(challengeParticipation.challengeId, challenges.id))
    .where(eq(challengeParticipation.userDid, userDid))
    .orderBy(desc(challengeParticipation.joinedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = participations.length > limit;
  const results = hasMore ? participations.slice(0, limit) : participations;

  return c.json({
    participations: results,
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

/**
 * Search challenges
 * GET /xrpc/io.exprsn.challenge.search
 */
challengesRouter.get('/io.exprsn.challenge.search', optionalAuthMiddleware, async (c) => {
  const query = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

  if (!query || query.length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }

  const searchPattern = `%${query}%`;

  const results = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.visibility, 'public'),
        or(
          ilike(challenges.name, searchPattern),
          ilike(challenges.tag, searchPattern),
          ilike(challenges.description, searchPattern)
        )
      )
    )
    .orderBy(desc(challenges.entryCount))
    .limit(limit);

  return c.json({
    challenges: results.map((ch) => ({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      hashtag: ch.tag,
      coverImageUrl: ch.coverImageUrl,
      status: ch.status,
      entryCount: ch.entryCount,
      participantCount: ch.participantCount,
    })),
  });
});

// =============================================================================
// Admin Challenge Endpoints
// =============================================================================

/**
 * Create a challenge
 * POST /xrpc/io.exprsn.admin.challenge.create
 */
challengesRouter.post('/io.exprsn.admin.challenge.create', adminAuthMiddleware, async (c) => {
  const adminUser = c.get('adminUser');
  const body = await c.req.json();

  const {
    name,
    description,
    hashtag,
    rules,
    coverImageUrl,
    bannerImageUrl,
    prizes,
    startAt,
    endAt,
    votingEndAt,
    featuredSoundId,
    visibility = 'public',
  } = body;

  if (!name || !hashtag || !startAt || !endAt) {
    return c.json({ error: 'name, hashtag, startAt, and endAt are required' }, 400);
  }

  // Check hashtag uniqueness
  const existingChallenge = await db.query.challenges.findFirst({
    where: eq(sql`LOWER(${challenges.tag})`, hashtag.toLowerCase().replace(/^#/, '')),
  });

  if (existingChallenge) {
    return c.json({ error: 'A challenge with this hashtag already exists' }, 400);
  }

  const challengeId = nanoid();
  const now = new Date();
  const startDate = new Date(startAt);

  // Determine initial status
  let status = 'upcoming';
  if (startDate <= now) {
    status = 'active';
  }

  await db.insert(challenges).values({
    id: challengeId,
    name,
    description,
    tag: hashtag.replace(/^#/, ''),
    rules,
    coverImageUrl,
    bannerImageUrl,
    prizes,
    status,
    visibility,
    startAt: startDate,
    endAt: new Date(endAt),
    votingEndAt: votingEndAt ? new Date(votingEndAt) : null,
    featuredSoundId,
    createdBy: adminUser.id,
  });

  return c.json({
    challenge: {
      id: challengeId,
      name,
      hashtag: hashtag.replace(/^#/, ''),
      status,
      startAt,
      endAt,
    },
  });
});

/**
 * Update a challenge
 * POST /xrpc/io.exprsn.admin.challenge.update
 */
challengesRouter.post('/io.exprsn.admin.challenge.update', adminAuthMiddleware, async (c) => {
  const body = await c.req.json();
  const { challengeId, ...updates } = body;

  if (!challengeId) {
    return c.json({ error: 'challengeId is required' }, 400);
  }

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });

  if (!challenge) {
    return c.json({ error: 'Challenge not found' }, 404);
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.rules !== undefined) updateData.rules = updates.rules;
  if (updates.coverImageUrl !== undefined) updateData.coverImageUrl = updates.coverImageUrl;
  if (updates.bannerImageUrl !== undefined) updateData.bannerImageUrl = updates.bannerImageUrl;
  if (updates.prizes !== undefined) updateData.prizes = updates.prizes;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.visibility !== undefined) updateData.visibility = updates.visibility;
  if (updates.startAt !== undefined) updateData.startAt = new Date(updates.startAt);
  if (updates.endAt !== undefined) updateData.endAt = new Date(updates.endAt);
  if (updates.votingEndAt !== undefined) {
    updateData.votingEndAt = updates.votingEndAt ? new Date(updates.votingEndAt) : null;
  }
  if (updates.featuredSoundId !== undefined) updateData.featuredSoundId = updates.featuredSoundId;

  await db.update(challenges).set(updateData).where(eq(challenges.id, challengeId));

  return c.json({ success: true });
});

/**
 * Delete a challenge
 * POST /xrpc/io.exprsn.admin.challenge.delete
 */
challengesRouter.post('/io.exprsn.admin.challenge.delete', adminAuthMiddleware, async (c) => {
  const { challengeId } = await c.req.json();

  if (!challengeId) {
    return c.json({ error: 'challengeId is required' }, 400);
  }

  await db.delete(challenges).where(eq(challenges.id, challengeId));

  return c.json({ success: true });
});

/**
 * Set featured entries
 * POST /xrpc/io.exprsn.admin.challenge.setFeatured
 */
challengesRouter.post('/io.exprsn.admin.challenge.setFeatured', adminAuthMiddleware, async (c) => {
  const { challengeId, entryIds, featured } = await c.req.json();

  if (!challengeId || !entryIds || !Array.isArray(entryIds)) {
    return c.json({ error: 'challengeId and entryIds array are required' }, 400);
  }

  await db
    .update(challengeEntries)
    .set({
      isFeatured: featured !== false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(challengeEntries.challengeId, challengeId),
        inArray(challengeEntries.id, entryIds)
      )
    );

  return c.json({ success: true });
});

/**
 * Set challenge winners
 * POST /xrpc/io.exprsn.admin.challenge.setWinners
 */
challengesRouter.post('/io.exprsn.admin.challenge.setWinners', adminAuthMiddleware, async (c) => {
  const { challengeId, winners } = await c.req.json();

  if (!challengeId || !winners || !Array.isArray(winners)) {
    return c.json({ error: 'challengeId and winners array are required' }, 400);
  }

  // Clear existing winners
  await db
    .update(challengeEntries)
    .set({
      isWinner: false,
      winnerPosition: null,
      updatedAt: new Date(),
    })
    .where(eq(challengeEntries.challengeId, challengeId));

  // Set new winners
  for (const winner of winners) {
    const { entryId, position } = winner;
    await db
      .update(challengeEntries)
      .set({
        isWinner: true,
        winnerPosition: position,
        updatedAt: new Date(),
      })
      .where(eq(challengeEntries.id, entryId));

    // Update participation record
    const entry = await db.query.challengeEntries.findFirst({
      where: eq(challengeEntries.id, entryId),
    });

    if (entry) {
      await db
        .update(challengeParticipation)
        .set({ isWinner: true })
        .where(
          and(
            eq(challengeParticipation.challengeId, challengeId),
            eq(challengeParticipation.userDid, entry.userDid)
          )
        );
    }
  }

  return c.json({ success: true });
});

/**
 * Get challenge stats (admin)
 * GET /xrpc/io.exprsn.admin.challenge.getStats
 */
challengesRouter.get('/io.exprsn.admin.challenge.getStats', adminAuthMiddleware, async (c) => {
  const challengeId = c.req.query('challengeId');

  if (!challengeId) {
    return c.json({ error: 'challengeId is required' }, 400);
  }

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });

  if (!challenge) {
    return c.json({ error: 'Challenge not found' }, 404);
  }

  // Get daily entry counts
  const dailyEntries = await db.execute(sql`
    SELECT
      DATE(submitted_at) as date,
      COUNT(*) as entry_count,
      COUNT(DISTINCT user_did) as participant_count
    FROM challenge_entries
    WHERE challenge_id = ${challengeId}
    GROUP BY DATE(submitted_at)
    ORDER BY date DESC
    LIMIT 30
  `);

  // Get top participants
  const topParticipants = await db
    .select({
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
      entryCount: challengeParticipation.entryCount,
      bestRank: challengeParticipation.bestRank,
    })
    .from(challengeParticipation)
    .innerJoin(users, eq(challengeParticipation.userDid, users.did))
    .where(eq(challengeParticipation.challengeId, challengeId))
    .orderBy(challengeParticipation.bestRank)
    .limit(10);

  return c.json({
    challenge: {
      id: challenge.id,
      name: challenge.name,
      status: challenge.status,
      entryCount: challenge.entryCount,
      participantCount: challenge.participantCount,
      totalViews: challenge.totalViews,
      totalEngagement: challenge.totalEngagement,
    },
    dailyEntries: dailyEntries as unknown[],
    topParticipants,
  });
});

/**
 * List all challenges (admin)
 * GET /xrpc/io.exprsn.admin.challenge.list
 */
challengesRouter.get('/io.exprsn.admin.challenge.list', adminAuthMiddleware, async (c) => {
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const cursor = c.req.query('cursor');
  const offset = cursor ? parseInt(cursor) : 0;

  let query = db.select().from(challenges);

  if (status) {
    query = query.where(eq(challenges.status, status)) as typeof query;
  }

  const results = await query
    .orderBy(desc(challenges.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = results.length > limit;
  const challengeList = hasMore ? results.slice(0, limit) : results;

  return c.json({
    challenges: challengeList,
    cursor: hasMore ? String(offset + limit) : undefined,
  });
});

export default challengesRouter;
