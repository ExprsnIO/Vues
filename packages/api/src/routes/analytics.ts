import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm';

const analyticsRouter = new Hono();

// Get time range query helper
function getTimeRange(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case '24h':
      start.setHours(start.getHours() - 24);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }

  return { start, end };
}

// Get creator dashboard overview
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.getOverview',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const period = c.req.query('period') || '30d';
    const { start, end } = getTimeRange(period);

    // Get total stats
    const [videoStats] = await db
      .select({
        totalVideos: count(),
        totalViews: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${schema.videos.likeCount}), 0)`,
        totalComments: sql<number>`COALESCE(SUM(${schema.videos.commentCount}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${schema.videos.shareCount}), 0)`,
      })
      .from(schema.videos)
      .where(eq(schema.videos.authorDid, userDid));

    // Get follower count
    const [followerStats] = await db
      .select({
        totalFollowers: count(),
      })
      .from(schema.follows)
      .where(eq(schema.follows.subjectDid, userDid));

    // Get new followers in period
    const [newFollowers] = await db
      .select({
        count: count(),
      })
      .from(schema.follows)
      .where(
        and(
          eq(schema.follows.subjectDid, userDid),
          gte(schema.follows.createdAt, start)
        )
      );

    // Get average engagement rate
    const totalEngagement =
      (videoStats?.totalLikes || 0) +
      (videoStats?.totalComments || 0) +
      (videoStats?.totalShares || 0);
    const engagementRate =
      videoStats?.totalViews && videoStats.totalViews > 0
        ? ((totalEngagement / videoStats.totalViews) * 100).toFixed(2)
        : '0.00';

    return c.json({
      period,
      overview: {
        totalVideos: Number(videoStats?.totalVideos || 0),
        totalViews: Number(videoStats?.totalViews || 0),
        totalLikes: Number(videoStats?.totalLikes || 0),
        totalComments: Number(videoStats?.totalComments || 0),
        totalShares: Number(videoStats?.totalShares || 0),
        totalFollowers: Number(followerStats?.totalFollowers || 0),
        newFollowers: Number(newFollowers?.count || 0),
        engagementRate: parseFloat(engagementRate),
      },
    });
  }
);

// Get video performance analytics
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.getVideoPerformance',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const period = c.req.query('period') || '30d';
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const sortBy = c.req.query('sortBy') || 'views'; // views, likes, comments, engagement
    const { start } = getTimeRange(period);

    // Get user's videos with stats
    const videos = await db
      .select({
        uri: schema.videos.uri,
        caption: schema.videos.caption,
        thumbnailUrl: schema.videos.thumbnailUrl,
        viewCount: schema.videos.viewCount,
        likeCount: schema.videos.likeCount,
        commentCount: schema.videos.commentCount,
        shareCount: schema.videos.shareCount,
        createdAt: schema.videos.createdAt,
      })
      .from(schema.videos)
      .where(eq(schema.videos.authorDid, userDid))
      .orderBy(
        sortBy === 'likes'
          ? desc(schema.videos.likeCount)
          : sortBy === 'comments'
            ? desc(schema.videos.commentCount)
            : sortBy === 'engagement'
              ? desc(
                  sql`${schema.videos.likeCount} + ${schema.videos.commentCount} + ${schema.videos.shareCount}`
                )
              : desc(schema.videos.viewCount)
      )
      .limit(limit);

    // Calculate engagement metrics for each video
    const videosWithEngagement = videos.map((video) => {
      const totalEngagement =
        video.likeCount + video.commentCount + video.shareCount;
      const engagementRate =
        video.viewCount > 0
          ? ((totalEngagement / video.viewCount) * 100).toFixed(2)
          : '0.00';

      return {
        ...video,
        engagementRate: parseFloat(engagementRate),
      };
    });

    return c.json({
      period,
      videos: videosWithEngagement,
    });
  }
);

// Get audience demographics
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.getAudienceDemographics',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;

    // Get follower count by join date (growth over time)
    const followerGrowth = await db
      .select({
        date: sql<string>`DATE(${schema.follows.createdAt})`.as('date'),
        count: count(),
      })
      .from(schema.follows)
      .where(eq(schema.follows.subjectDid, userDid))
      .groupBy(sql`DATE(${schema.follows.createdAt})`)
      .orderBy(desc(sql`DATE(${schema.follows.createdAt})`))
      .limit(30);

    // Get top viewers (most engaged followers)
    const topViewers = await db
      .select({
        viewerDid: schema.videoViews.viewerDid,
        viewCount: count(),
      })
      .from(schema.videoViews)
      .innerJoin(schema.videos, eq(schema.videoViews.videoUri, schema.videos.uri))
      .where(eq(schema.videos.authorDid, userDid))
      .groupBy(schema.videoViews.viewerDid)
      .orderBy(desc(count()))
      .limit(10);

    // Get viewer profile info
    const viewerProfiles = await Promise.all(
      topViewers.map(async (viewer) => {
        const [profile] = await db
          .select({
            did: schema.users.did,
            handle: schema.users.handle,
            displayName: schema.users.displayName,
            avatar: schema.users.avatar,
          })
          .from(schema.users)
          .where(eq(schema.users.did, viewer.viewerDid))
          .limit(1);

        return {
          ...profile,
          viewCount: Number(viewer.viewCount),
        };
      })
    );

    return c.json({
      followerGrowth: followerGrowth.map((row) => ({
        date: row.date,
        count: Number(row.count),
      })),
      topViewers: viewerProfiles.filter((p) => p.did),
    });
  }
);

// Get content performance over time
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.getContentTrends',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const period = c.req.query('period') || '30d';
    const { start } = getTimeRange(period);

    // Get daily video stats
    const dailyStats = await db
      .select({
        date: sql<string>`DATE(${schema.videos.createdAt})`.as('date'),
        videos: count(),
        totalViews: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${schema.videos.likeCount}), 0)`,
      })
      .from(schema.videos)
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.videos.createdAt, start)
        )
      )
      .groupBy(sql`DATE(${schema.videos.createdAt})`)
      .orderBy(sql`DATE(${schema.videos.createdAt})`);

    // Get best performing content categories (by hashtags)
    const topHashtags = await db
      .select({
        tag: schema.videoHashtags.tag,
        videoCount: count(),
        totalViews: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
      })
      .from(schema.videoHashtags)
      .innerJoin(schema.videos, eq(schema.videoHashtags.videoUri, schema.videos.uri))
      .where(eq(schema.videos.authorDid, userDid))
      .groupBy(schema.videoHashtags.tag)
      .orderBy(desc(sql`COALESCE(SUM(${schema.videos.viewCount}), 0)`))
      .limit(10);

    return c.json({
      period,
      dailyStats: dailyStats.map((row) => ({
        date: row.date,
        videos: Number(row.videos),
        views: Number(row.totalViews),
        likes: Number(row.totalLikes),
      })),
      topHashtags: topHashtags.map((row) => ({
        tag: row.tag,
        videoCount: Number(row.videoCount),
        totalViews: Number(row.totalViews),
      })),
    });
  }
);

// Get engagement breakdown
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.getEngagementBreakdown',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const period = c.req.query('period') || '30d';
    const { start } = getTimeRange(period);

    // Get likes breakdown
    const likesInPeriod = await db
      .select({
        date: sql<string>`DATE(${schema.likes.createdAt})`.as('date'),
        count: count(),
      })
      .from(schema.likes)
      .innerJoin(schema.videos, eq(schema.likes.subjectUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.likes.createdAt, start)
        )
      )
      .groupBy(sql`DATE(${schema.likes.createdAt})`)
      .orderBy(sql`DATE(${schema.likes.createdAt})`);

    // Get comments breakdown
    const commentsInPeriod = await db
      .select({
        date: sql<string>`DATE(${schema.comments.createdAt})`.as('date'),
        count: count(),
      })
      .from(schema.comments)
      .innerJoin(schema.videos, eq(schema.comments.videoUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.comments.createdAt, start)
        )
      )
      .groupBy(sql`DATE(${schema.comments.createdAt})`)
      .orderBy(sql`DATE(${schema.comments.createdAt})`);

    // Get total engagement metrics
    const [totals] = await db
      .select({
        totalLikes: sql<number>`COUNT(DISTINCT ${schema.likes.uri})`,
        totalComments: sql<number>`COUNT(DISTINCT ${schema.comments.uri})`,
      })
      .from(schema.videos)
      .leftJoin(schema.likes, eq(schema.likes.subjectUri, schema.videos.uri))
      .leftJoin(schema.comments, eq(schema.comments.videoUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.videos.createdAt, start)
        )
      );

    return c.json({
      period,
      likes: {
        total: Number(totals?.totalLikes || 0),
        daily: likesInPeriod.map((row) => ({
          date: row.date,
          count: Number(row.count),
        })),
      },
      comments: {
        total: Number(totals?.totalComments || 0),
        daily: commentsInPeriod.map((row) => ({
          date: row.date,
          count: Number(row.count),
        })),
      },
    });
  }
);

// Get real-time stats (last 24 hours)
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.getRealtime',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const { start } = getTimeRange('24h');

    // Get hourly view counts for last 24 hours
    const hourlyViews = await db
      .select({
        hour: sql<string>`DATE_TRUNC('hour', ${schema.videoViews.watchedAt})`.as('hour'),
        count: count(),
      })
      .from(schema.videoViews)
      .innerJoin(schema.videos, eq(schema.videoViews.videoUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.videoViews.watchedAt, start)
        )
      )
      .groupBy(sql`DATE_TRUNC('hour', ${schema.videoViews.watchedAt})`)
      .orderBy(sql`DATE_TRUNC('hour', ${schema.videoViews.watchedAt})`);

    // Get active viewers (unique viewers in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [activeViewers] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.videoViews.viewerDid})`,
      })
      .from(schema.videoViews)
      .innerJoin(schema.videos, eq(schema.videoViews.videoUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.videoViews.watchedAt, oneHourAgo)
        )
      );

    // Get recent likes
    const recentLikes = await db
      .select({
        videoUri: schema.likes.subjectUri,
        likerDid: schema.likes.authorDid,
        createdAt: schema.likes.createdAt,
      })
      .from(schema.likes)
      .innerJoin(schema.videos, eq(schema.likes.subjectUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.likes.createdAt, start)
        )
      )
      .orderBy(desc(schema.likes.createdAt))
      .limit(10);

    // Get recent comments
    const recentComments = await db
      .select({
        videoUri: schema.comments.videoUri,
        commenterDid: schema.comments.authorDid,
        text: schema.comments.text,
        createdAt: schema.comments.createdAt,
      })
      .from(schema.comments)
      .innerJoin(schema.videos, eq(schema.comments.videoUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.comments.createdAt, start)
        )
      )
      .orderBy(desc(schema.comments.createdAt))
      .limit(10);

    return c.json({
      activeViewers: Number(activeViewers?.count || 0),
      hourlyViews: hourlyViews.map((row) => ({
        hour: row.hour,
        count: Number(row.count),
      })),
      recentLikes,
      recentComments,
    });
  }
);

// Get revenue analytics (for monetized creators)
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.getRevenue',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const period = c.req.query('period') || '30d';
    const { start } = getTimeRange(period);

    // Get tips received
    const tips = await db
      .select({
        date: sql<string>`DATE(${schema.tips.createdAt})`.as('date'),
        totalAmount: sql<number>`COALESCE(SUM(${schema.tips.amount}), 0)`,
        tipCount: count(),
      })
      .from(schema.tips)
      .where(
        and(
          eq(schema.tips.recipientDid, userDid),
          gte(schema.tips.createdAt, start)
        )
      )
      .groupBy(sql`DATE(${schema.tips.createdAt})`)
      .orderBy(sql`DATE(${schema.tips.createdAt})`);

    // Get total revenue
    const [totalRevenue] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.tips.amount}), 0)`,
        tipCount: count(),
      })
      .from(schema.tips)
      .where(
        and(
          eq(schema.tips.recipientDid, userDid),
          gte(schema.tips.createdAt, start)
        )
      );

    // Get top tippers
    const topTippers = await db
      .select({
        tipperDid: schema.tips.senderDid,
        totalAmount: sql<number>`COALESCE(SUM(${schema.tips.amount}), 0)`,
        tipCount: count(),
      })
      .from(schema.tips)
      .where(
        and(
          eq(schema.tips.recipientDid, userDid),
          gte(schema.tips.createdAt, start)
        )
      )
      .groupBy(schema.tips.senderDid)
      .orderBy(desc(sql`COALESCE(SUM(${schema.tips.amount}), 0)`))
      .limit(10);

    return c.json({
      period,
      revenue: {
        total: Number(totalRevenue?.total || 0),
        tipCount: Number(totalRevenue?.tipCount || 0),
        daily: tips.map((row) => ({
          date: row.date,
          amount: Number(row.totalAmount),
          count: Number(row.tipCount),
        })),
      },
      topTippers: topTippers.map((row) => ({
        did: row.tipperDid,
        totalAmount: Number(row.totalAmount),
        tipCount: Number(row.tipCount),
      })),
    });
  }
);

// Export endpoint for downloading analytics data
analyticsRouter.get(
  '/xrpc/io.exprsn.analytics.export',
  authMiddleware,
  async (c) => {
    const userDid = c.get('did')!;
    const period = c.req.query('period') || '30d';
    const format = c.req.query('format') || 'json';
    const { start, end } = getTimeRange(period);

    // Get comprehensive analytics data
    const [overview] = await db
      .select({
        totalVideos: count(),
        totalViews: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${schema.videos.likeCount}), 0)`,
        totalComments: sql<number>`COALESCE(SUM(${schema.videos.commentCount}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${schema.videos.shareCount}), 0)`,
      })
      .from(schema.videos)
      .where(eq(schema.videos.authorDid, userDid));

    const videos = await db
      .select({
        uri: schema.videos.uri,
        caption: schema.videos.caption,
        viewCount: schema.videos.viewCount,
        likeCount: schema.videos.likeCount,
        commentCount: schema.videos.commentCount,
        shareCount: schema.videos.shareCount,
        createdAt: schema.videos.createdAt,
      })
      .from(schema.videos)
      .where(
        and(
          eq(schema.videos.authorDid, userDid),
          gte(schema.videos.createdAt, start)
        )
      )
      .orderBy(desc(schema.videos.createdAt));

    const data = {
      exportedAt: new Date().toISOString(),
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      overview: {
        totalVideos: Number(overview?.totalVideos || 0),
        totalViews: Number(overview?.totalViews || 0),
        totalLikes: Number(overview?.totalLikes || 0),
        totalComments: Number(overview?.totalComments || 0),
        totalShares: Number(overview?.totalShares || 0),
      },
      videos,
    };

    if (format === 'csv') {
      const headers = [
        'Video URI',
        'Caption',
        'Views',
        'Likes',
        'Comments',
        'Shares',
        'Created At',
      ];
      const rows = videos.map((v) => [
        v.uri,
        `"${(v.caption || '').replace(/"/g, '""')}"`,
        v.viewCount,
        v.likeCount,
        v.commentCount,
        v.shareCount,
        v.createdAt,
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${period}.csv"`,
        },
      });
    }

    return c.json(data);
  }
);

export { analyticsRouter };
