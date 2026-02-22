import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db/index.js';
import {
  videos,
  likes,
  comments,
  reposts,
  follows,
  users,
  liveStreams,
  streamViewers,
  creatorEarnings,
  bookmarks,
  shares,
} from '../db/schema.js';
import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import { authMiddleware } from '../auth/middleware.js';

type AuthContext = {
  Variables: {
    did: string;
  };
};

export const analyticsRoutes = new Hono<AuthContext>();

// ============================================
// Dashboard Overview
// ============================================

// Get creator dashboard overview
analyticsRoutes.get('/io.exprsn.analytics.overview', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const period = c.req.query('period') || '30d'; // 7d, 30d, 90d, all
  const startDate = getPeriodStartDate(period);

  // Get user profile
  const userResult = await db
    .select({
      followerCount: users.followerCount,
      followingCount: users.followingCount,
      videoCount: users.videoCount,
    })
    .from(users)
    .where(eq(users.did, userDid))
    .limit(1);

  const profile = userResult[0];
  if (!profile) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Get total views for the period
  const viewsResult = await db
    .select({
      totalViews: sql<number>`COALESCE(SUM(${videos.viewCount}), 0)`,
    })
    .from(videos)
    .where(
      and(
        eq(videos.authorDid, userDid),
        startDate ? gte(videos.createdAt, startDate) : undefined
      )
    );

  // Get total likes for the period
  const likesResult = await db
    .select({
      count: count(),
    })
    .from(likes)
    .innerJoin(videos, eq(videos.id, likes.videoId))
    .where(
      and(
        eq(videos.authorDid, userDid),
        startDate ? gte(likes.createdAt, startDate) : undefined
      )
    );

  // Get total comments for the period
  const commentsResult = await db
    .select({
      count: count(),
    })
    .from(comments)
    .innerJoin(videos, eq(videos.id, comments.videoId))
    .where(
      and(
        eq(videos.authorDid, userDid),
        startDate ? gte(comments.createdAt, startDate) : undefined
      )
    );

  // Get new followers for the period
  const followersResult = await db
    .select({
      count: count(),
    })
    .from(follows)
    .where(
      and(
        eq(follows.followeeDid, userDid),
        startDate ? gte(follows.createdAt, startDate) : undefined
      )
    );

  // Get reposts for the period
  const repostsResult = await db
    .select({
      count: count(),
    })
    .from(reposts)
    .innerJoin(videos, eq(videos.id, reposts.videoId))
    .where(
      and(
        eq(videos.authorDid, userDid),
        startDate ? gte(reposts.createdAt, startDate) : undefined
      )
    );

  // Get shares for the period
  const sharesResult = await db
    .select({
      count: count(),
    })
    .from(shares)
    .innerJoin(videos, eq(videos.id, shares.videoId))
    .where(
      and(
        eq(videos.authorDid, userDid),
        startDate ? gte(shares.createdAt, startDate) : undefined
      )
    );

  // Get earnings info
  const earningsResult = await db
    .select()
    .from(creatorEarnings)
    .where(eq(creatorEarnings.userDid, userDid))
    .limit(1);

  return c.json({
    period,
    profile: {
      totalFollowers: profile.followerCount,
      totalFollowing: profile.followingCount,
      totalVideos: profile.videoCount,
    },
    metrics: {
      views: viewsResult[0]?.totalViews || 0,
      likes: likesResult[0]?.count || 0,
      comments: commentsResult[0]?.count || 0,
      newFollowers: followersResult[0]?.count || 0,
      reposts: repostsResult[0]?.count || 0,
      shares: sharesResult[0]?.count || 0,
    },
    earnings: earningsResult[0] ? {
      totalEarnings: earningsResult[0].totalEarnings / 100, // Convert cents to dollars
      availableBalance: earningsResult[0].availableBalance / 100,
      pendingBalance: earningsResult[0].pendingBalance / 100,
      currency: earningsResult[0].currency,
      lastPayoutAt: earningsResult[0].lastPayoutAt?.toISOString(),
    } : null,
  });
});

// ============================================
// Video Analytics
// ============================================

// Get analytics for all videos
analyticsRoutes.get('/io.exprsn.analytics.videos', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  const cursor = c.req.query('cursor');
  const sortBy = c.req.query('sortBy') || 'recent'; // recent, views, likes, comments

  let orderByColumn;
  switch (sortBy) {
    case 'views':
      orderByColumn = desc(videos.viewCount);
      break;
    case 'likes':
      orderByColumn = desc(videos.likeCount);
      break;
    case 'comments':
      orderByColumn = desc(videos.commentCount);
      break;
    default:
      orderByColumn = desc(videos.createdAt);
  }

  let query = db
    .select({
      id: videos.id,
      caption: videos.caption,
      thumbnailUrl: videos.thumbnailUrl,
      duration: videos.duration,
      viewCount: videos.viewCount,
      likeCount: videos.likeCount,
      commentCount: videos.commentCount,
      shareCount: videos.shareCount,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .where(eq(videos.authorDid, userDid))
    .orderBy(orderByColumn)
    .limit(limit + 1);

  if (cursor) {
    // Parse cursor based on sort type
    // @ts-expect-error - cursor parsing
    query = query.where(
      and(
        eq(videos.authorDid, userDid),
        sql`${videos.id} < ${cursor}`
      )
    ) as typeof query;
  }

  const results = await query;
  const hasMore = results.length > limit;
  const videoList = hasMore ? results.slice(0, -1) : results;

  return c.json({
    videos: videoList.map((video) => ({
      ...video,
      createdAt: video.createdAt.toISOString(),
      engagementRate: calculateEngagementRate(
        video.viewCount,
        video.likeCount,
        video.commentCount,
        video.shareCount
      ),
    })),
    cursor: hasMore ? videoList[videoList.length - 1]?.id : undefined,
  });
});

// Get detailed analytics for a single video
analyticsRoutes.get('/io.exprsn.analytics.video', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const videoId = c.req.query('videoId');
  if (!videoId) {
    throw new HTTPException(400, { message: 'Video ID required' });
  }

  // Get video
  const videoResult = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  const video = videoResult[0];
  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  if (video.authorDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your video' });
  }

  // Get likes over time (last 30 days by day)
  const likesOverTime = await db
    .select({
      date: sql<string>`DATE(${likes.createdAt})`,
      count: count(),
    })
    .from(likes)
    .where(
      and(
        eq(likes.videoId, videoId),
        gte(likes.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .groupBy(sql`DATE(${likes.createdAt})`)
    .orderBy(sql`DATE(${likes.createdAt})`);

  // Get comments over time
  const commentsOverTime = await db
    .select({
      date: sql<string>`DATE(${comments.createdAt})`,
      count: count(),
    })
    .from(comments)
    .where(
      and(
        eq(comments.videoId, videoId),
        gte(comments.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .groupBy(sql`DATE(${comments.createdAt})`)
    .orderBy(sql`DATE(${comments.createdAt})`);

  // Get bookmark count
  const bookmarkResult = await db
    .select({ count: count() })
    .from(bookmarks)
    .where(eq(bookmarks.videoId, videoId));

  // Get share count
  const shareResult = await db
    .select({ count: count() })
    .from(shares)
    .where(eq(shares.videoId, videoId));

  return c.json({
    video: {
      id: video.id,
      caption: video.caption,
      thumbnailUrl: video.thumbnailUrl,
      videoUrl: video.videoUrl,
      duration: video.duration,
      width: video.width,
      height: video.height,
      createdAt: video.createdAt.toISOString(),
    },
    metrics: {
      views: video.viewCount,
      likes: video.likeCount,
      comments: video.commentCount,
      shares: video.shareCount,
      bookmarks: bookmarkResult[0]?.count || 0,
      reposts: shareResult[0]?.count || 0,
      engagementRate: calculateEngagementRate(
        video.viewCount,
        video.likeCount,
        video.commentCount,
        video.shareCount
      ),
    },
    trends: {
      likes: likesOverTime,
      comments: commentsOverTime,
    },
  });
});

// ============================================
// Follower Analytics
// ============================================

// Get follower growth over time
analyticsRoutes.get('/io.exprsn.analytics.followers', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const period = c.req.query('period') || '30d';
  const startDate = getPeriodStartDate(period);

  // Get follower growth by day
  const followerGrowth = await db
    .select({
      date: sql<string>`DATE(${follows.createdAt})`,
      count: count(),
    })
    .from(follows)
    .where(
      and(
        eq(follows.followeeDid, userDid),
        startDate ? gte(follows.createdAt, startDate) : undefined
      )
    )
    .groupBy(sql`DATE(${follows.createdAt})`)
    .orderBy(sql`DATE(${follows.createdAt})`);

  // Get total follower count
  const totalResult = await db
    .select({ followerCount: users.followerCount })
    .from(users)
    .where(eq(users.did, userDid))
    .limit(1);

  // Get recent followers
  const recentFollowers = await db
    .select({
      did: users.did,
      handle: users.handle,
      displayName: users.displayName,
      avatar: users.avatar,
      followerCount: users.followerCount,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.did, follows.followerDid))
    .where(eq(follows.followeeDid, userDid))
    .orderBy(desc(follows.createdAt))
    .limit(10);

  return c.json({
    period,
    totalFollowers: totalResult[0]?.followerCount || 0,
    growth: followerGrowth,
    recentFollowers: recentFollowers.map((f) => ({
      ...f,
      followedAt: f.followedAt.toISOString(),
    })),
  });
});

// ============================================
// Live Stream Analytics
// ============================================

// Get live stream analytics summary
analyticsRoutes.get('/io.exprsn.analytics.streams', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const period = c.req.query('period') || '30d';
  const startDate = getPeriodStartDate(period);

  // Get stream stats
  const streamStats = await db
    .select({
      totalStreams: count(),
      totalViews: sql<number>`COALESCE(SUM(${liveStreams.totalViews}), 0)`,
      totalPeakViewers: sql<number>`COALESCE(SUM(${liveStreams.peakViewers}), 0)`,
      avgViewers: sql<number>`COALESCE(AVG(${liveStreams.peakViewers}), 0)`,
    })
    .from(liveStreams)
    .where(
      and(
        eq(liveStreams.userDid, userDid),
        eq(liveStreams.status, 'ended'),
        startDate ? gte(liveStreams.createdAt, startDate) : undefined
      )
    );

  // Get recent streams
  const recentStreams = await db
    .select({
      id: liveStreams.id,
      title: liveStreams.title,
      status: liveStreams.status,
      viewerCount: liveStreams.viewerCount,
      peakViewers: liveStreams.peakViewers,
      totalViews: liveStreams.totalViews,
      thumbnailUrl: liveStreams.thumbnailUrl,
      startedAt: liveStreams.startedAt,
      endedAt: liveStreams.endedAt,
    })
    .from(liveStreams)
    .where(eq(liveStreams.userDid, userDid))
    .orderBy(desc(liveStreams.createdAt))
    .limit(10);

  // Calculate average duration
  let totalDuration = 0;
  let streamCount = 0;
  for (const stream of recentStreams) {
    if (stream.startedAt && stream.endedAt) {
      totalDuration += stream.endedAt.getTime() - stream.startedAt.getTime();
      streamCount++;
    }
  }
  const avgDuration = streamCount > 0 ? totalDuration / streamCount / 1000 : 0; // in seconds

  return c.json({
    period,
    summary: {
      totalStreams: streamStats[0]?.totalStreams || 0,
      totalViews: streamStats[0]?.totalViews || 0,
      totalPeakViewers: streamStats[0]?.totalPeakViewers || 0,
      avgPeakViewers: Math.round(streamStats[0]?.avgViewers || 0),
      avgDurationSeconds: Math.round(avgDuration),
    },
    recentStreams: recentStreams.map((stream) => ({
      ...stream,
      startedAt: stream.startedAt?.toISOString(),
      endedAt: stream.endedAt?.toISOString(),
      durationSeconds: stream.startedAt && stream.endedAt
        ? Math.round((stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000)
        : null,
    })),
  });
});

// Get detailed analytics for a single stream
analyticsRoutes.get('/io.exprsn.analytics.stream', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const streamId = c.req.query('streamId');
  if (!streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  // Get stream
  const streamResult = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, streamId))
    .limit(1);

  const stream = streamResult[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  // Get viewer analytics
  const viewerStats = await db
    .select({
      uniqueViewers: sql<number>`COUNT(DISTINCT COALESCE(${streamViewers.userDid}, ${streamViewers.sessionId}))`,
      totalSessions: count(),
      avgWatchDuration: sql<number>`COALESCE(AVG(${streamViewers.watchDuration}), 0)`,
      authViewers: sql<number>`COUNT(DISTINCT ${streamViewers.userDid})`,
    })
    .from(streamViewers)
    .where(eq(streamViewers.streamId, streamId));

  // Get viewer join times distribution (for charts)
  const viewerJoinTimes = await db
    .select({
      minute: sql<string>`DATE_TRUNC('minute', ${streamViewers.joinedAt})`,
      count: count(),
    })
    .from(streamViewers)
    .where(eq(streamViewers.streamId, streamId))
    .groupBy(sql`DATE_TRUNC('minute', ${streamViewers.joinedAt})`)
    .orderBy(sql`DATE_TRUNC('minute', ${streamViewers.joinedAt})`);

  return c.json({
    stream: {
      id: stream.id,
      title: stream.title,
      status: stream.status,
      category: stream.category,
      tags: stream.tags,
      thumbnailUrl: stream.thumbnailUrl,
      peakViewers: stream.peakViewers,
      totalViews: stream.totalViews,
      startedAt: stream.startedAt?.toISOString(),
      endedAt: stream.endedAt?.toISOString(),
      durationSeconds: stream.startedAt && stream.endedAt
        ? Math.round((stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000)
        : null,
    },
    viewerMetrics: {
      uniqueViewers: viewerStats[0]?.uniqueViewers || 0,
      totalSessions: viewerStats[0]?.totalSessions || 0,
      authenticatedViewers: viewerStats[0]?.authViewers || 0,
      avgWatchDurationSeconds: Math.round(viewerStats[0]?.avgWatchDuration || 0),
    },
    viewerTimeline: viewerJoinTimes,
  });
});

// ============================================
// Earnings Analytics
// ============================================

// Get earnings breakdown
analyticsRoutes.get('/io.exprsn.analytics.earnings', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  // Get earnings record
  const earningsResult = await db
    .select()
    .from(creatorEarnings)
    .where(eq(creatorEarnings.userDid, userDid))
    .limit(1);

  const earnings = earningsResult[0];

  return c.json({
    earnings: earnings ? {
      totalEarnings: earnings.totalEarnings / 100,
      availableBalance: earnings.availableBalance / 100,
      pendingBalance: earnings.pendingBalance / 100,
      currency: earnings.currency,
      lastPayoutAt: earnings.lastPayoutAt?.toISOString(),
      lastPayoutAmount: earnings.lastPayoutAmount ? earnings.lastPayoutAmount / 100 : null,
    } : {
      totalEarnings: 0,
      availableBalance: 0,
      pendingBalance: 0,
      currency: 'usd',
      lastPayoutAt: null,
      lastPayoutAmount: null,
    },
  });
});

// ============================================
// Content Performance
// ============================================

// Get top performing content
analyticsRoutes.get('/io.exprsn.analytics.topContent', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const metric = c.req.query('metric') || 'views'; // views, likes, comments, shares, engagement
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 20);

  let orderBy;
  switch (metric) {
    case 'likes':
      orderBy = desc(videos.likeCount);
      break;
    case 'comments':
      orderBy = desc(videos.commentCount);
      break;
    case 'shares':
      orderBy = desc(videos.shareCount);
      break;
    case 'engagement':
      orderBy = desc(sql`(${videos.likeCount} + ${videos.commentCount} + ${videos.shareCount})::float / NULLIF(${videos.viewCount}, 0)`);
      break;
    default:
      orderBy = desc(videos.viewCount);
  }

  const topVideos = await db
    .select({
      id: videos.id,
      caption: videos.caption,
      thumbnailUrl: videos.thumbnailUrl,
      viewCount: videos.viewCount,
      likeCount: videos.likeCount,
      commentCount: videos.commentCount,
      shareCount: videos.shareCount,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .where(eq(videos.authorDid, userDid))
    .orderBy(orderBy)
    .limit(limit);

  return c.json({
    metric,
    videos: topVideos.map((video) => ({
      ...video,
      createdAt: video.createdAt.toISOString(),
      engagementRate: calculateEngagementRate(
        video.viewCount,
        video.likeCount,
        video.commentCount,
        video.shareCount
      ),
    })),
  });
});

// ============================================
// Audience Insights
// ============================================

// Get audience insights (followers analysis)
analyticsRoutes.get('/io.exprsn.analytics.audience', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  // Get top followers by their follower count (influencers following you)
  const topFollowers = await db
    .select({
      did: users.did,
      handle: users.handle,
      displayName: users.displayName,
      avatar: users.avatar,
      followerCount: users.followerCount,
    })
    .from(follows)
    .innerJoin(users, eq(users.did, follows.followerDid))
    .where(eq(follows.followeeDid, userDid))
    .orderBy(desc(users.followerCount))
    .limit(10);

  // Get follower count distribution
  const followerDistribution = await db
    .select({
      range: sql<string>`
        CASE
          WHEN ${users.followerCount} < 100 THEN '0-99'
          WHEN ${users.followerCount} < 1000 THEN '100-999'
          WHEN ${users.followerCount} < 10000 THEN '1K-10K'
          WHEN ${users.followerCount} < 100000 THEN '10K-100K'
          ELSE '100K+'
        END
      `,
      count: count(),
    })
    .from(follows)
    .innerJoin(users, eq(users.did, follows.followerDid))
    .where(eq(follows.followeeDid, userDid))
    .groupBy(sql`
      CASE
        WHEN ${users.followerCount} < 100 THEN '0-99'
        WHEN ${users.followerCount} < 1000 THEN '100-999'
        WHEN ${users.followerCount} < 10000 THEN '1K-10K'
        WHEN ${users.followerCount} < 100000 THEN '10K-100K'
        ELSE '100K+'
      END
    `);

  return c.json({
    topFollowers,
    followerDistribution,
  });
});

// ============================================
// Helper Functions
// ============================================

function getPeriodStartDate(period: string): Date | undefined {
  const now = new Date();
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'all':
      return undefined;
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function calculateEngagementRate(
  views: number,
  likes: number,
  comments: number,
  shares: number
): number {
  if (views === 0) return 0;
  const engagement = (likes + comments + shares) / views * 100;
  return Math.round(engagement * 100) / 100; // 2 decimal places
}

export default analyticsRoutes;
