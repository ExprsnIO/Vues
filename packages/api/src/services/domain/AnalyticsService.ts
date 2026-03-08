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
   * Get domain overview metrics
   */
  async getOverview(domainId: string): Promise<DomainOverview> {
    // Get user counts
    const [userStats] = await this.db
      .select({
        total: count(),
        active: sql<number>`COUNT(CASE WHEN ${schema.users.lastSeenAt} > NOW() - INTERVAL '7 days' THEN 1 END)`,
      })
      .from(schema.users)
      .where(eq(schema.users.domainId, domainId));

    // Get video counts
    const [videoStats] = await this.db
      .select({
        total: count(),
        views: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
        likes: sql<number>`COALESCE(SUM(${schema.videos.likeCount}), 0)`,
        comments: sql<number>`COALESCE(SUM(${schema.videos.commentCount}), 0)`,
      })
      .from(schema.videos)
      .where(eq(schema.videos.domainId, domainId));

    // Get storage usage
    const [storageStats] = await this.db
      .select({
        storage: sql<number>`COALESCE(SUM(${schema.uploadJobs.totalSize}), 0)`,
      })
      .from(schema.uploadJobs)
      .innerJoin(schema.videos, eq(schema.uploadJobs.videoUri, schema.videos.uri))
      .where(eq(schema.videos.domainId, domainId));

    return {
      totalUsers: Number(userStats?.total) || 0,
      activeUsers: Number(userStats?.active) || 0,
      totalVideos: Number(videoStats?.total) || 0,
      totalViews: Number(videoStats?.views) || 0,
      totalLikes: Number(videoStats?.likes) || 0,
      totalComments: Number(videoStats?.comments) || 0,
      storageUsedBytes: Number(storageStats?.storage) || 0,
      bandwidthUsedBytes: 0, // Would need CDN integration
    };
  }

  /**
   * Get user metrics
   */
  async getUserMetrics(domainId: string, period: AnalyticsPeriod): Promise<UserMetrics> {
    const periodStart = this.getPeriodStart(period);
    const previousPeriodStart = new Date(
      periodStart.getTime() - (Date.now() - periodStart.getTime())
    );

    // New users in period
    const [newUsersResult] = await this.db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.domainId, domainId),
          gte(schema.users.createdAt, periodStart)
        )
      );

    // Active users in period
    const [activeUsersResult] = await this.db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.domainId, domainId),
          gte(schema.users.lastSeenAt, periodStart)
        )
      );

    // Users from previous period who didn't return (churn)
    const [previousActiveResult] = await this.db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.domainId, domainId),
          gte(schema.users.lastSeenAt, previousPeriodStart),
          lte(schema.users.lastSeenAt, periodStart)
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
   */
  async getContentMetrics(domainId: string, period: AnalyticsPeriod): Promise<ContentMetrics> {
    const periodStart = this.getPeriodStart(period);

    // Videos uploaded in period
    const [uploadedResult] = await this.db
      .select({ count: count() })
      .from(schema.videos)
      .where(
        and(
          eq(schema.videos.domainId, domainId),
          gte(schema.videos.createdAt, periodStart)
        )
      );

    // Total views in period (simplified - would need view events)
    const [viewsResult] = await this.db
      .select({
        views: sql<number>`COALESCE(SUM(${schema.videos.viewCount}), 0)`,
      })
      .from(schema.videos)
      .where(
        and(
          eq(schema.videos.domainId, domainId),
          gte(schema.videos.createdAt, periodStart)
        )
      );

    // Top videos
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
          eq(schema.videos.domainId, domainId),
          eq(schema.videos.visibility, 'public')
        )
      )
      .orderBy(desc(schema.videos.viewCount))
      .limit(10);

    // Top creators
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
      .where(eq(schema.users.domainId, domainId))
      .groupBy(schema.users.did, schema.users.handle, schema.users.avatar)
      .orderBy(desc(sql`SUM(${schema.videos.viewCount})`))
      .limit(10);

    return {
      videosUploaded: Number(uploadedResult?.count) || 0,
      videoViews: Number(viewsResult?.views) || 0,
      avgWatchTime: 0, // Would need watch events
      completionRate: 0, // Would need completion events
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
   */
  async getEngagementMetrics(
    domainId: string,
    period: AnalyticsPeriod
  ): Promise<EngagementMetrics> {
    const periodStart = this.getPeriodStart(period);

    // Get engagement counts
    const [likesResult] = await this.db
      .select({ count: count() })
      .from(schema.likes)
      .innerJoin(schema.videos, eq(schema.likes.subjectUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.domainId, domainId),
          gte(schema.likes.createdAt, periodStart)
        )
      );

    const [commentsResult] = await this.db
      .select({ count: count() })
      .from(schema.comments)
      .innerJoin(schema.videos, eq(schema.comments.videoUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videos.domainId, domainId),
          gte(schema.comments.createdAt, periodStart)
        )
      );

    const [followsResult] = await this.db
      .select({ count: count() })
      .from(schema.follows)
      .innerJoin(schema.users, eq(schema.follows.followeeDid, schema.users.did))
      .where(
        and(
          eq(schema.users.domainId, domainId),
          gte(schema.follows.createdAt, periodStart)
        )
      );

    // Video count for averages
    const [videoCountResult] = await this.db
      .select({ count: count() })
      .from(schema.videos)
      .where(
        and(
          eq(schema.videos.domainId, domainId),
          gte(schema.videos.createdAt, periodStart)
        )
      );

    const likes = Number(likesResult?.count) || 0;
    const comments = Number(commentsResult?.count) || 0;
    const follows = Number(followsResult?.count) || 0;
    const videoCount = Number(videoCountResult?.count) || 1;

    const totalEngagements = likes + comments;
    const engagementRate = videoCount > 0 ? (totalEngagements / videoCount) * 100 : 0;

    return {
      likes,
      comments,
      shares: 0, // Would need share tracking
      bookmarks: 0, // Would need bookmark tracking
      follows,
      engagementRate: Math.round(engagementRate * 10) / 10,
      avgLikesPerVideo: Math.round((likes / videoCount) * 10) / 10,
      avgCommentsPerVideo: Math.round((comments / videoCount) * 10) / 10,
    };
  }

  /**
   * Get growth time series
   */
  async getGrowthMetrics(
    domainId: string,
    period: AnalyticsPeriod
  ): Promise<GrowthMetrics> {
    const periodStart = this.getPeriodStart(period);

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

    // User growth
    const userGrowth = await this.db.execute(sql`
      SELECT
        date_trunc(${interval}, ${schema.users.createdAt}) as timestamp,
        COUNT(*) as value
      FROM ${schema.users}
      WHERE ${schema.users.domainId} = ${domainId}
        AND ${schema.users.createdAt} >= ${periodStart}
      GROUP BY timestamp
      ORDER BY timestamp
    `);

    // Video growth
    const videoGrowth = await this.db.execute(sql`
      SELECT
        date_trunc(${interval}, ${schema.videos.createdAt}) as timestamp,
        COUNT(*) as value
      FROM ${schema.videos}
      WHERE ${schema.videos.domainId} = ${domainId}
        AND ${schema.videos.createdAt} >= ${periodStart}
      GROUP BY timestamp
      ORDER BY timestamp
    `);

    return {
      userGrowth: (userGrowth.rows as Array<{ timestamp: Date; value: number }>).map((r) => ({
        timestamp: new Date(r.timestamp),
        value: Number(r.value),
      })),
      videoGrowth: (videoGrowth.rows as Array<{ timestamp: Date; value: number }>).map((r) => ({
        timestamp: new Date(r.timestamp),
        value: Number(r.value),
      })),
      viewGrowth: [], // Would need view events
      engagementGrowth: [], // Would need engagement events
    };
  }

  /**
   * Get moderation metrics
   */
  async getModerationMetrics(
    domainId: string,
    period: AnalyticsPeriod
  ): Promise<ModerationMetrics> {
    const periodStart = this.getPeriodStart(period);

    // Report counts
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(schema.moderationReports)
      .where(
        and(
          eq(schema.moderationReports.domainId, domainId),
          gte(schema.moderationReports.createdAt, periodStart)
        )
      );

    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(schema.moderationReports)
      .where(
        and(
          eq(schema.moderationReports.domainId, domainId),
          eq(schema.moderationReports.status, 'pending'),
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
          eq(schema.moderationReports.domainId, domainId),
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
