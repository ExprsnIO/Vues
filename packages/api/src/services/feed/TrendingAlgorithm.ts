/**
 * Trending Algorithm Service
 * Calculates trending scores for videos based on engagement velocity and recency
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, desc, gte, sql, and } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { CronJob } from 'cron';

/**
 * Trending video entry
 */
export interface TrendingVideo {
  videoUri: string;
  score: number;
  rank: number;
  velocity: number;
  engagementRate: number;
  hoursSincePost: number;
}

/**
 * Trending algorithm configuration
 */
export interface TrendingConfig {
  db: PostgresJsDatabase<typeof schema>;
  // Time windows for velocity calculation
  velocityWindowHours?: number;
  // Score decay factor (how fast old videos lose ranking)
  decayFactor?: number;
  // Minimum views to be considered for trending
  minViews?: number;
  // Maximum age of videos to consider (hours)
  maxAgeHours?: number;
  // Weight factors for different engagement types
  weights?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    watchTime: number;
  };
}

const DEFAULT_CONFIG = {
  velocityWindowHours: 6,
  decayFactor: 0.95,
  minViews: 100,
  maxAgeHours: 72,
  weights: {
    views: 1,
    likes: 3,
    comments: 5,
    shares: 8,
    watchTime: 2,
  },
};

/**
 * Trending Algorithm
 *
 * Scores videos based on:
 * 1. Engagement velocity (rate of new interactions)
 * 2. Engagement quality (weighted by type)
 * 3. Time decay (newer content scores higher)
 * 4. Viral detection (sudden spikes in engagement)
 */
export class TrendingAlgorithm {
  private db: PostgresJsDatabase<typeof schema>;
  private velocityWindowHours: number;
  private decayFactor: number;
  private minViews: number;
  private maxAgeHours: number;
  private weights: typeof DEFAULT_CONFIG.weights;
  private cronJob: CronJob | null = null;

  constructor(config: TrendingConfig) {
    this.db = config.db;
    this.velocityWindowHours = config.velocityWindowHours ?? DEFAULT_CONFIG.velocityWindowHours;
    this.decayFactor = config.decayFactor ?? DEFAULT_CONFIG.decayFactor;
    this.minViews = config.minViews ?? DEFAULT_CONFIG.minViews;
    this.maxAgeHours = config.maxAgeHours ?? DEFAULT_CONFIG.maxAgeHours;
    this.weights = { ...DEFAULT_CONFIG.weights, ...config.weights };
  }

  /**
   * Start automatic trending score updates
   */
  startAutoUpdate(cronExpression: string = '*/10 * * * *'): void {
    if (this.cronJob) {
      this.cronJob.stop();
    }

    this.cronJob = new CronJob(cronExpression, async () => {
      try {
        await this.updateTrendingScores();
      } catch (error) {
        console.error('[TrendingAlgorithm] Auto-update failed:', error);
      }
    });

    this.cronJob.start();
    console.log('[TrendingAlgorithm] Auto-update started with cron:', cronExpression);
  }

  /**
   * Stop automatic updates
   */
  stopAutoUpdate(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[TrendingAlgorithm] Auto-update stopped');
    }
  }

  /**
   * Calculate and update trending scores for all eligible videos
   */
  async updateTrendingScores(): Promise<void> {
    const startTime = Date.now();
    console.log('[TrendingAlgorithm] Starting trending score calculation...');

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - this.maxAgeHours * 60 * 60 * 1000);
    const velocityWindowStart = new Date(now.getTime() - this.velocityWindowHours * 60 * 60 * 1000);

    // Get eligible videos
    const candidates = await this.db
      .select({
        uri: schema.videos.uri,
        cid: schema.videos.cid,
        authorDid: schema.videos.authorDid,
        viewCount: schema.videos.viewCount,
        likeCount: schema.videos.likeCount,
        commentCount: schema.videos.commentCount,
        shareCount: schema.videos.shareCount,
        createdAt: schema.videos.createdAt,
      })
      .from(schema.videos)
      .where(
        and(
          eq(schema.videos.visibility, 'public'),
          gte(schema.videos.createdAt, cutoffTime),
          gte(schema.videos.viewCount, this.minViews)
        )
      );

    if (candidates.length === 0) {
      console.log('[TrendingAlgorithm] No eligible videos found');
      return;
    }

    // Get recent engagement counts for velocity calculation
    const recentLikes = await this.getRecentEngagementCounts(
      schema.likes,
      'videoUri',
      candidates.map(c => c.uri),
      velocityWindowStart
    );

    const recentComments = await this.getRecentEngagementCounts(
      schema.comments,
      'videoUri',
      candidates.map(c => c.uri),
      velocityWindowStart
    );

    // Calculate scores
    const scored: TrendingVideo[] = candidates.map((video) => {
      const hoursSincePost = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60);

      // Base engagement score
      const baseScore =
        video.viewCount * this.weights.views +
        video.likeCount * this.weights.likes +
        video.commentCount * this.weights.comments +
        video.shareCount * this.weights.shares;

      // Velocity score (recent engagement rate)
      const recentLikeCount = recentLikes.get(video.uri) || 0;
      const recentCommentCount = recentComments.get(video.uri) || 0;
      const velocity = (recentLikeCount * this.weights.likes + recentCommentCount * this.weights.comments) /
        this.velocityWindowHours;

      // Time decay - videos lose score as they age
      const timeDecay = Math.pow(this.decayFactor, hoursSincePost / 24);

      // Engagement rate (engagement per view)
      const engagementRate = video.viewCount > 0
        ? (video.likeCount + video.commentCount * 2 + video.shareCount * 3) / video.viewCount
        : 0;

      // Viral boost: if velocity is unusually high relative to total engagement
      const viralBoost = velocity > 0 && baseScore > 0
        ? Math.min(2, 1 + (velocity * this.velocityWindowHours) / baseScore)
        : 1;

      // Identity boost for did:exprsn authors
      const identityBoost = video.authorDid.startsWith('did:exprsn:') ? 1.15 : 1.0;

      // Final score
      const score = (baseScore * timeDecay + velocity * 100) * viralBoost * (1 + engagementRate) * identityBoost;

      return {
        videoUri: video.uri,
        score,
        rank: 0, // Will be set after sorting
        velocity,
        engagementRate,
        hoursSincePost,
      };
    });

    // Sort by score and assign ranks
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((video, index) => {
      video.rank = index + 1;
    });

    // Update database - clear old and insert new
    await this.db.delete(schema.trendingVideos);

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < scored.length; i += batchSize) {
      const batch = scored.slice(i, i + batchSize);
      await this.db.insert(schema.trendingVideos).values(
        batch.map((v) => ({
          videoUri: v.videoUri,
          score: v.score,
          rank: v.rank,
          velocity: v.velocity,
          engagementRate: v.engagementRate,
          calculatedAt: now,
        }))
      );
    }

    const duration = Date.now() - startTime;
    console.log(
      `[TrendingAlgorithm] Updated ${scored.length} trending scores in ${duration}ms`
    );
  }

  /**
   * Get recent engagement counts for videos
   */
  private async getRecentEngagementCounts(
    table: typeof schema.likes | typeof schema.comments,
    videoUriField: string,
    videoUris: string[],
    since: Date
  ): Promise<Map<string, number>> {
    if (videoUris.length === 0) {
      return new Map();
    }

    // Query recent engagements
    const results = await this.db
      .select({
        videoUri: table[videoUriField as keyof typeof table] as unknown as typeof schema.likes.videoUri,
        count: sql<number>`count(*)`,
      })
      .from(table)
      .where(gte(table.createdAt, since))
      .groupBy(table[videoUriField as keyof typeof table] as unknown as typeof schema.likes.videoUri);

    const counts = new Map<string, number>();
    for (const row of results) {
      counts.set(row.videoUri, Number(row.count));
    }

    return counts;
  }

  /**
   * Get current trending videos
   */
  async getTrendingVideos(limit: number = 50, offset: number = 0): Promise<TrendingVideo[]> {
    const results = await this.db
      .select()
      .from(schema.trendingVideos)
      .orderBy(schema.trendingVideos.rank)
      .limit(limit)
      .offset(offset);

    return results.map((r) => ({
      videoUri: r.videoUri,
      score: r.score,
      rank: r.rank,
      velocity: r.velocity || 0,
      engagementRate: 0, // Calculated separately, not stored in trendingVideos table
      hoursSincePost: 0, // Would need to join with videos table
    }));
  }

  /**
   * Get trending videos by tag
   */
  async getTrendingByTag(tag: string, limit: number = 20): Promise<TrendingVideo[]> {
    const results = await this.db
      .select({
        videoUri: schema.trendingVideos.videoUri,
        score: schema.trendingVideos.score,
        rank: schema.trendingVideos.rank,
        velocity: schema.trendingVideos.velocity,
      })
      .from(schema.trendingVideos)
      .innerJoin(schema.videos, eq(schema.trendingVideos.videoUri, schema.videos.uri))
      .where(sql`${tag} = ANY(${schema.videos.tags})`)
      .orderBy(schema.trendingVideos.rank)
      .limit(limit);

    return results.map((r) => ({
      videoUri: r.videoUri,
      score: r.score,
      rank: r.rank,
      velocity: r.velocity || 0,
      engagementRate: 0, // Calculated separately, not stored in trendingVideos table
      hoursSincePost: 0,
    }));
  }

  /**
   * Detect viral surge for a video
   */
  async detectViralSurge(videoUri: string): Promise<{
    isViral: boolean;
    surgeMultiplier: number;
    recentVelocity: number;
    averageVelocity: number;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    // Get recent hour engagement
    const recentLikes = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.likes)
      .where(and(
        eq(schema.likes.videoUri, videoUri),
        gte(schema.likes.createdAt, oneHourAgo)
      ));

    // Get 6-hour average
    const sixHourLikes = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.likes)
      .where(and(
        eq(schema.likes.videoUri, videoUri),
        gte(schema.likes.createdAt, sixHoursAgo)
      ));

    const recentCount = Number(recentLikes[0]?.count || 0);
    const sixHourCount = Number(sixHourLikes[0]?.count || 0);

    const recentVelocity = recentCount; // per hour
    const averageVelocity = sixHourCount / 6; // per hour

    // Consider viral if recent velocity is 3x+ the average
    const surgeMultiplier = averageVelocity > 0 ? recentVelocity / averageVelocity : recentVelocity;
    const isViral = surgeMultiplier >= 3 && recentVelocity >= 10;

    return {
      isViral,
      surgeMultiplier,
      recentVelocity,
      averageVelocity,
    };
  }
}

/**
 * Create TrendingAlgorithm instance
 */
export function createTrendingAlgorithm(
  db: PostgresJsDatabase<typeof schema>,
  config?: Partial<TrendingConfig>
): TrendingAlgorithm {
  return new TrendingAlgorithm({ db, ...config });
}
