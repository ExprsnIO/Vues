/**
 * Domain Analytics Service
 * Metrics and insights for domain administrators
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

/**
 * Time period for analytics
 */
export type AnalyticsPeriod = '24h' | '7d' | '30d' | '90d' | 'all';

/**
 * Overview metrics
 */
export interface DomainOverview {
  totalUsers: number;
  activeUsers: number;
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  storageUsedBytes: number;
  bandwidthUsedBytes: number;
}

/**
 * User metrics
 */
export interface UserMetrics {
  newUsers: number;
  activeUsers: number;
  churned: number;
  retention: number;
  avgSessionDuration: number;
  topCountries: Array<{ country: string; count: number }>;
}

/**
 * Content metrics
 */
export interface ContentMetrics {
  videosUploaded: number;
  videoViews: number;
  avgWatchTime: number;
  completionRate: number;
  topVideos: Array<{
    uri: string;
    caption?: string;
    views: number;
    likes: number;
    thumbnail?: string;
  }>;
  topCreators: Array<{
    did: string;
    handle: string;
    videos: number;
    views: number;
    avatar?: string;
  }>;
}

/**
 * Engagement metrics
 */
export interface EngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
  follows: number;
  engagementRate: number;
  avgLikesPerVideo: number;
  avgCommentsPerVideo: number;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

/**
 * Growth metrics
 */
export interface GrowthMetrics {
  userGrowth: TimeSeriesPoint[];
  videoGrowth: TimeSeriesPoint[];
  viewGrowth: TimeSeriesPoint[];
  engagementGrowth: TimeSeriesPoint[];
}

/**
 * Moderation metrics
 */
export interface ModerationMetrics {
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  avgResolutionTime: number;
  reportsByType: Array<{ type: string; count: number }>;
  actionsTaken: Array<{ action: string; count: number }>;
}

export class AnalyticsService {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Get period start date
   */
  private getPeriodStart(period: AnalyticsPeriod): Date {
    const now = new Date();
    switch (period) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'all':
        return new Date(0);
    }
  }

  /**
   * Get domain user DIDs for filtering
   */
  private async getDomainUserDids(domainId: string): Promise<string[]> {
    const domainUsers = await this.db
      .select({ userDid: schema.domainUsers.userDid })
      .from(schema.domainUsers)
      .where(eq(schema.domainUsers.domainId, domainId));
    return domainUsers.map(u => u.userDid);
  }

  /**
   * Get domain overview metrics
   * Filters by domain users when domainId is provided
   */
  async getOverview(domainId: string): Promise<DomainOverview> {
    // Get domain user DIDs for filtering
    const domainUserDids = await this.getDomainUserDids(domainId);

    // If no domain users, return zeros
    if (domainUserDids.length === 0) {
      return {
        totalUsers: 0,
        activeUsers: 0,
        totalVideos: 0,
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        storageUsedBytes: 0,
        bandwidthUsedBytes: 0,
      };
    }

    // Get user counts filtered by domain
    const [userStats] = await this.db
      .select({
        total: count(),
        active: sql<number>`COUNT(CASE WHEN ${schema.users.updatedAt} > NOW() - INTERVAL '7 days' THEN 1 END)`,
      })
      .from(schema.users)
      .where(sql`${schema.users.did} = ANY(${domainUserDids})`);

    // Get video counts filtered by domain users
    const [videoStats] = await this.db
      .select({
        total: count(),
        views: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
        likes: sql<number>`COALESCE(SUM(${schema.videos.likeCount}), 0)`,
        comments: sql<number>`COALESCE(SUM(${schema.videos.commentCount}), 0)`,
      })
      .from(schema.videos)
      .where(sql`${schema.videos.authorDid} = ANY(${domainUserDids})`);

    // Note: Video file sizes are not tracked in the videos table
    // Storage usage would require integration with S3/CDN provider
    // For now, estimate based on video count and average video size
    const estimatedAvgVideoSizeBytes = 10 * 1024 * 1024; // 10MB average
    const estimatedStorageBytes = (Number(videoStats?.total) || 0) * estimatedAvgVideoSizeBytes;

    return {
      totalUsers: Number(userStats?.total) || 0,
      activeUsers: Number(userStats?.active) || 0,
      totalVideos: Number(videoStats?.total) || 0,
      totalViews: Number(videoStats?.views) || 0,
      totalLikes: Number(videoStats?.likes) || 0,
      totalComments: Number(videoStats?.comments) || 0,
      storageUsedBytes: estimatedStorageBytes,
      bandwidthUsedBytes: 0, // Would need CDN integration
    };
  }

  /**
   * Get user metrics
   * Filters by domain users when domainId is provided
   */
  async getUserMetrics(domainId: string, period: AnalyticsPeriod): Promise<UserMetrics> {
    const periodStart = this.getPeriodStart(period);
    const previousPeriodStart = new Date(
      periodStart.getTime() - (Date.now() - periodStart.getTime())
    );

    // Get domain user DIDs for filtering
    const domainUserDids = await this.getDomainUserDids(domainId);

    if (domainUserDids.length === 0) {
      return {
        newUsers: 0,
        activeUsers: 0,
        churned: 0,
        retention: 100,
        avgSessionDuration: 0,
        topCountries: [],
      };
    }

    // New users in period (domain users created in period)
    const [newUsersResult] = await this.db
      .select({ count: count() })
      .from(schema.domainUsers)
      .where(
        and(
          eq(schema.domainUsers.domainId, domainId),
          gte(schema.domainUsers.createdAt, periodStart)
        )
      );

    // Active users in period - using updatedAt as proxy for lastSeenAt
    const [activeUsersResult] = await this.db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          sql`${schema.users.did} = ANY(${domainUserDids})`,
          gte(schema.users.updatedAt, periodStart)
        )
      );

    // Users from previous period who didn't return (churn)
    const [previousActiveResult] = await this.db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          sql`${schema.users.did} = ANY(${domainUserDids})`,
          gte(schema.users.updatedAt, previousPeriodStart),
          lte(schema.users.updatedAt, periodStart)
        )
      );

    const previousActive = Number(previousActiveResult?.count) || 1;
    const churned = Math.max(0, previousActive - (Number(activeUsersResult?.count) || 0));
    const retention = previousActive > 0 ? ((previousActive - churned) / previousActive) * 100 : 100;

    return {
      newUsers: Number(newUsersResult?.count) || 0,
      activeUsers: Number(activeUsersResult?.count) || 0,
      churned,
      retention: Math.round(retention * 10) / 10,
      avgSessionDuration: 0, // Would need session tracking
      topCountries: [], // Would need geo data
    };
  }

  /**
   * Get content metrics
   * Filters by domain users when domainId is provided
   */
  async getContentMetrics(domainId: string, period: AnalyticsPeriod): Promise<ContentMetrics> {
    const periodStart = this.getPeriodStart(period);
    const domainUserDids = await this.getDomainUserDids(domainId);

    if (domainUserDids.length === 0) {
      return {
        videosUploaded: 0,
        videoViews: 0,
        avgWatchTime: 0,
        completionRate: 0,
        topVideos: [],
        topCreators: [],
      };
    }

    // Videos uploaded in period by domain users
    const [uploadedResult] = await this.db
      .select({ count: count() })
      .from(schema.videos)
      .where(
        and(
          sql`${schema.videos.authorDid} = ANY(${domainUserDids})`,
          gte(schema.videos.createdAt, periodStart)
        )
      );

    // Total views in period by domain users
    const [viewsResult] = await this.db
      .select({
        views: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
      })
      .from(schema.videos)
      .where(
        and(
          sql`${schema.videos.authorDid} = ANY(${domainUserDids})`,
          gte(schema.videos.createdAt, periodStart)
        )
      );

    // Top videos from domain users
    const topVideos = await this.db
      .select({
        uri: schema.videos.uri,
        caption: schema.videos.caption,
        views: schema.videos.viewCount,
        likes: schema.videos.likeCount,
        thumbnail: schema.videos.thumbnailUrl,
      })
      .from(schema.videos)
      .where(
        and(
          sql`${schema.videos.authorDid} = ANY(${domainUserDids})`,
          eq(schema.videos.visibility, 'public')
        )
      )
      .orderBy(desc(schema.videos.viewCount))
      .limit(10);

    // Top creators from domain
    const topCreators = await this.db
      .select({
        did: schema.users.did,
        handle: schema.users.handle,
        avatar: schema.users.avatar,
        videos: count(schema.videos.uri),
        views: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
      })
      .from(schema.users)
      .leftJoin(schema.videos, eq(schema.users.did, schema.videos.authorDid))
      .where(sql`${schema.users.did} = ANY(${domainUserDids})`)
      .groupBy(schema.users.did, schema.users.handle, schema.users.avatar)
      .orderBy(desc(sql`SUM(${schema.videos.viewCount})`))
      .limit(10);

    // Get average watch time from video_views table
    // Join with videos to filter by domain authors
    const [watchTimeResult] = await this.db
      .select({
        avgWatchTime: sql<number>`COALESCE(AVG(${schema.videoViews.watchDuration}), 0)`,
        completionRate: sql<number>`COALESCE(AVG(CASE WHEN ${schema.videoViews.completedView} THEN 1.0 ELSE 0.0 END), 0)`,
      })
      .from(schema.videoViews)
      .innerJoin(schema.videos, eq(schema.videoViews.videoUri, schema.videos.uri))
      .where(
        and(
          sql`${schema.videos.authorDid} = ANY(${domainUserDids})`,
          gte(schema.videoViews.watchedAt, periodStart)
        )
      );

    // Calculate completion rate from userInteractions as fallback
    const [interactionResult] = await this.db
      .select({
        avgCompletion: sql<number>`COALESCE(AVG(${schema.userInteractions.completionRate}), 0)`,
      })
      .from(schema.userInteractions)
      .innerJoin(schema.videos, eq(schema.userInteractions.videoUri, schema.videos.uri))
      .where(
        and(
          sql`${schema.videos.authorDid} = ANY(${domainUserDids})`,
          gte(schema.userInteractions.createdAt, periodStart),
          sql`${schema.userInteractions.interactionType} = 'view'`
        )
      );

    const avgWatchTime = Number(watchTimeResult?.avgWatchTime) || 0;
    const completionRate =
      Number(watchTimeResult?.completionRate) ||
      Number(interactionResult?.avgCompletion) ||
      0;

    return {
      videosUploaded: Number(uploadedResult?.count) || 0,
      videoViews: Number(viewsResult?.views) || 0,
      avgWatchTime: Math.round(avgWatchTime),
      completionRate: Math.round(completionRate * 100) / 100, // As decimal 0-1
      topVideos: topVideos.map((v) => ({
        uri: v.uri,
        caption: v.caption || undefined,
        views: v.views,
        likes: v.likes,
        thumbnail: v.thumbnail || undefined,
      })),
      topCreators: topCreators.map((c) => ({
        did: c.did,
        handle: c.handle,
        videos: Number(c.videos),
        views: Number(c.views),
        avatar: c.avatar || undefined,
      })),
    };
  }

  /**
   * Get engagement metrics
   * Filters by domain users when domainId is provided
   */
  async getEngagementMetrics(
    domainId: string,
    period: AnalyticsPeriod
  ): Promise<EngagementMetrics> {
    const periodStart = this.getPeriodStart(period);
    const domainUserDids = await this.getDomainUserDids(domainId);

    if (domainUserDids.length === 0) {
      return {
        likes: 0,
        comments: 0,
        shares: 0,
        bookmarks: 0,
        follows: 0,
        engagementRate: 0,
        avgLikesPerVideo: 0,
        avgCommentsPerVideo: 0,
      };
    }

    // Get engagement counts from domain users
    const [likesResult] = await this.db
      .select({ count: count() })
      .from(schema.likes)
      .where(
        and(
          sql`${schema.likes.authorDid} = ANY(${domainUserDids})`,
          gte(schema.likes.createdAt, periodStart)
        )
      );

    const [commentsResult] = await this.db
      .select({ count: count() })
      .from(schema.comments)
      .where(
        and(
          sql`${schema.comments.authorDid} = ANY(${domainUserDids})`,
          gte(schema.comments.createdAt, periodStart)
        )
      );

    const [followsResult] = await this.db
      .select({ count: count() })
      .from(schema.follows)
      .where(
        and(
          sql`${schema.follows.followerDid} = ANY(${domainUserDids})`,
          gte(schema.follows.createdAt, periodStart)
        )
      );

    // Shares (reposts) from domain users
    const [sharesResult] = await this.db
      .select({ count: count() })
      .from(schema.reposts)
      .where(
        and(
          sql`${schema.reposts.authorDid} = ANY(${domainUserDids})`,
          gte(schema.reposts.createdAt, periodStart)
        )
      );

    // Bookmarks from domain users
    const [bookmarksResult] = await this.db
      .select({ count: count() })
      .from(schema.bookmarks)
      .where(
        and(
          sql`${schema.bookmarks.authorDid} = ANY(${domainUserDids})`,
          gte(schema.bookmarks.createdAt, periodStart)
        )
      );

    // Video count for averages from domain users
    const [videoCountResult] = await this.db
      .select({ count: count() })
      .from(schema.videos)
      .where(
        and(
          sql`${schema.videos.authorDid} = ANY(${domainUserDids})`,
          gte(schema.videos.createdAt, periodStart)
        )
      );

    const likes = Number(likesResult?.count) || 0;
    const comments = Number(commentsResult?.count) || 0;
    const shares = Number(sharesResult?.count) || 0;
    const bookmarksCount = Number(bookmarksResult?.count) || 0;
    const follows = Number(followsResult?.count) || 0;
    const videoCount = Number(videoCountResult?.count) || 1;

    const totalEngagements = likes + comments + shares + bookmarksCount;
    const engagementRate = videoCount > 0 ? (totalEngagements / videoCount) * 100 : 0;

    return {
      likes,
      comments,
      shares,
      bookmarks: bookmarksCount,
      follows,
      engagementRate: Math.round(engagementRate * 10) / 10,
      avgLikesPerVideo: Math.round((likes / videoCount) * 10) / 10,
      avgCommentsPerVideo: Math.round((comments / videoCount) * 10) / 10,
    };
  }

  /**
   * Get growth time series
   * Filters by domain users when domainId is provided
   */
  async getGrowthMetrics(
    domainId: string,
    period: AnalyticsPeriod
  ): Promise<GrowthMetrics> {
    const periodStart = this.getPeriodStart(period);
    const domainUserDids = await this.getDomainUserDids(domainId);

    if (domainUserDids.length === 0) {
      return {
        userGrowth: [],
        videoGrowth: [],
        viewGrowth: [],
        engagementGrowth: [],
      };
    }

    // Determine grouping interval
    let interval: string;
    switch (period) {
      case '24h':
        interval = '1 hour';
        break;
      case '7d':
        interval = '1 day';
        break;
      case '30d':
        interval = '1 day';
        break;
      case '90d':
        interval = '1 week';
        break;
      default:
        interval = '1 month';
    }

    // Domain user growth (new domain memberships)
    const userGrowth = await this.db.execute<{ timestamp: Date; value: number }>(sql`
      SELECT
        date_trunc(${interval}, ${schema.domainUsers.createdAt}) as timestamp,
        COUNT(*) as value
      FROM ${schema.domainUsers}
      WHERE ${schema.domainUsers.domainId} = ${domainId}
        AND ${schema.domainUsers.createdAt} >= ${periodStart}
      GROUP BY timestamp
      ORDER BY timestamp
    `);

    // Video growth by domain users
    const videoGrowth = await this.db.execute<{ timestamp: Date; value: number }>(sql`
      SELECT
        date_trunc(${interval}, ${schema.videos.createdAt}) as timestamp,
        COUNT(*) as value
      FROM ${schema.videos}
      WHERE ${schema.videos.authorDid} = ANY(${domainUserDids})
        AND ${schema.videos.createdAt} >= ${periodStart}
      GROUP BY timestamp
      ORDER BY timestamp
    `);

    // View growth - video views of domain users' content
    const viewGrowth = await this.db.execute<{ timestamp: Date; value: number }>(sql`
      SELECT
        date_trunc(${interval}, vv.watched_at) as timestamp,
        COUNT(*) as value
      FROM video_views vv
      INNER JOIN videos v ON vv.video_uri = v.uri
      WHERE v.author_did = ANY(${domainUserDids})
        AND vv.watched_at >= ${periodStart}
      GROUP BY timestamp
      ORDER BY timestamp
    `);

    // Engagement growth - likes and comments on domain users' content
    const engagementGrowth = await this.db.execute<{ timestamp: Date; value: number }>(sql`
      SELECT
        date_trunc(${interval}, created_at) as timestamp,
        SUM(engagement_count) as value
      FROM (
        SELECT created_at, 1 as engagement_count
        FROM likes
        WHERE author_did = ANY(${domainUserDids})
          AND created_at >= ${periodStart}
        UNION ALL
        SELECT created_at, 1 as engagement_count
        FROM comments
        WHERE author_did = ANY(${domainUserDids})
          AND created_at >= ${periodStart}
        UNION ALL
        SELECT created_at, 1 as engagement_count
        FROM reposts
        WHERE author_did = ANY(${domainUserDids})
          AND created_at >= ${periodStart}
      ) engagements
      GROUP BY timestamp
      ORDER BY timestamp
    `);

    return {
      userGrowth: (Array.isArray(userGrowth) ? userGrowth : []).map((r) => ({
        timestamp: new Date(r.timestamp),
        value: Number(r.value),
      })),
      videoGrowth: (Array.isArray(videoGrowth) ? videoGrowth : []).map((r) => ({
        timestamp: new Date(r.timestamp),
        value: Number(r.value),
      })),
      viewGrowth: (Array.isArray(viewGrowth) ? viewGrowth : []).map((r) => ({
        timestamp: new Date(r.timestamp),
        value: Number(r.value),
      })),
      engagementGrowth: (Array.isArray(engagementGrowth) ? engagementGrowth : []).map((r) => ({
        timestamp: new Date(r.timestamp),
        value: Number(r.value),
      })),
    };
  }

  /**
   * Get moderation metrics
   * Filters by domain when domainId is provided
   */
  async getModerationMetrics(
    domainId: string,
    period: AnalyticsPeriod
  ): Promise<ModerationMetrics> {
    const periodStart = this.getPeriodStart(period);
    const domainUserDids = await this.getDomainUserDids(domainId);

    if (domainUserDids.length === 0) {
      return {
        totalReports: 0,
        pendingReports: 0,
        resolvedReports: 0,
        avgResolutionTime: 0,
        reportsByType: [],
        actionsTaken: [],
      };
    }

    // Report counts - reports about domain users' content
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(schema.moderationReports)
      .where(
        and(
          sql`${schema.moderationReports.reportedBy} = ANY(${domainUserDids})`,
          gte(schema.moderationReports.createdAt, periodStart)
        )
      );

    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(schema.moderationReports)
      .where(
        and(
          sql`${schema.moderationReports.reportedBy} = ANY(${domainUserDids})`,
          eq(schema.moderationReports.status, 'open'),
          gte(schema.moderationReports.createdAt, periodStart)
        )
      );

    // Reports by type
    const reportsByType = await this.db
      .select({
        type: schema.moderationReports.reason,
        count: count(),
      })
      .from(schema.moderationReports)
      .where(
        and(
          sql`${schema.moderationReports.reportedBy} = ANY(${domainUserDids})`,
          gte(schema.moderationReports.createdAt, periodStart)
        )
      )
      .groupBy(schema.moderationReports.reason)
      .orderBy(desc(count()));

    const total = Number(totalResult?.count) || 0;
    const pending = Number(pendingResult?.count) || 0;

    return {
      totalReports: total,
      pendingReports: pending,
      resolvedReports: total - pending,
      avgResolutionTime: 0, // Would need resolution timestamps
      reportsByType: reportsByType.map((r) => ({
        type: r.type,
        count: Number(r.count),
      })),
      actionsTaken: [], // Would need action tracking
    };
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    domainId: string,
    period: AnalyticsPeriod,
    format: 'json' | 'csv'
  ): Promise<{ data: string; contentType: string; filename: string }> {
    const overview = await this.getOverview(domainId);
    const userMetrics = await this.getUserMetrics(domainId, period);
    const contentMetrics = await this.getContentMetrics(domainId, period);
    const engagementMetrics = await this.getEngagementMetrics(domainId, period);

    const data = {
      exportedAt: new Date().toISOString(),
      period,
      overview,
      users: userMetrics,
      content: contentMetrics,
      engagement: engagementMetrics,
    };

    if (format === 'json') {
      return {
        data: JSON.stringify(data, null, 2),
        contentType: 'application/json',
        filename: `analytics-${period}-${Date.now()}.json`,
      };
    }

    // CSV format - flatten the data
    const csvRows = [
      ['Metric', 'Value'],
      ['Total Users', String(overview.totalUsers)],
      ['Active Users', String(overview.activeUsers)],
      ['Total Videos', String(overview.totalVideos)],
      ['Total Views', String(overview.totalViews)],
      ['Total Likes', String(overview.totalLikes)],
      ['Total Comments', String(overview.totalComments)],
      ['New Users (Period)', String(userMetrics.newUsers)],
      ['Retention Rate', `${userMetrics.retention}%`],
      ['Videos Uploaded (Period)', String(contentMetrics.videosUploaded)],
      ['Engagement Rate', `${engagementMetrics.engagementRate}%`],
    ];

    const csvData = csvRows.map((row) => row.join(',')).join('\n');

    return {
      data: csvData,
      contentType: 'text/csv',
      filename: `analytics-${period}-${Date.now()}.csv`,
    };
  }
}

/**
 * Create AnalyticsService instance
 */
export function createAnalyticsService(
  db: PostgresJsDatabase<typeof schema>
): AnalyticsService {
  return new AnalyticsService(db);
}
