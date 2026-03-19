/**
 * Hashtag Service
 * Handles #hashtag parsing, trending, and discovery
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { CronJob } from 'cron';
import { nanoid } from 'nanoid';

/**
 * Parsed hashtag from text
 */
export interface ParsedHashtag {
  tag: string;
  start: number;
  end: number;
}

/**
 * Trending direction: whether the hashtag is gaining or losing momentum
 */
export type TrendingDirection = 'up' | 'down' | 'stable';

/**
 * Trending hashtag
 */
export interface TrendingHashtag {
  tag: string;
  videoCount: number;
  viewCount: number;
  velocity: number;
  rank: number;
  direction: TrendingDirection;
}

/**
 * Hashtag details
 */
export interface HashtagDetails {
  tag: string;
  videoCount: number;
  viewCount: number;
  followerCount: number;
  createdAt?: Date;
  lastUsedAt?: Date;
}

/**
 * Hashtag Service configuration
 */
export interface HashtagServiceConfig {
  db: PostgresJsDatabase<typeof schema>;
  // Minimum videos to be considered trending
  minVideosForTrending?: number;
  // Time window for velocity calculation (hours)
  velocityWindowHours?: number;
}

const DEFAULT_CONFIG = {
  minVideosForTrending: 3,
  velocityWindowHours: 24,
};

/**
 * Hashtag Service
 *
 * Handles:
 * - Parsing #hashtags from text
 * - Tracking hashtag usage
 * - Computing trending hashtags
 * - Hashtag search and discovery
 */
export class HashtagService {
  private db: PostgresJsDatabase<typeof schema>;
  private minVideosForTrending: number;
  private velocityWindowHours: number;
  private trendingUpdateJob: CronJob | null = null;

  // Regex for parsing hashtags
  // Matches #tag (alphanumeric and underscores)
  private hashtagRegex = /#([a-zA-Z][a-zA-Z0-9_]*)/g;

  constructor(config: HashtagServiceConfig) {
    this.db = config.db;
    this.minVideosForTrending = config.minVideosForTrending ?? DEFAULT_CONFIG.minVideosForTrending;
    this.velocityWindowHours = config.velocityWindowHours ?? DEFAULT_CONFIG.velocityWindowHours;
  }

  /**
   * Start automatic trending updates
   */
  startTrendingUpdates(cronExpression: string = '*/15 * * * *'): void {
    if (this.trendingUpdateJob) {
      this.trendingUpdateJob.stop();
    }

    this.trendingUpdateJob = new CronJob(cronExpression, async () => {
      try {
        await this.updateTrendingHashtags();
      } catch (error) {
        console.error('[HashtagService] Failed to update trending:', error);
      }
    });

    this.trendingUpdateJob.start();
    console.log('[HashtagService] Trending updates started');
  }

  /**
   * Stop automatic trending updates
   */
  stopTrendingUpdates(): void {
    if (this.trendingUpdateJob) {
      this.trendingUpdateJob.stop();
      this.trendingUpdateJob = null;
    }
  }

  /**
   * Parse hashtags from text
   */
  parseHashtags(text: string): ParsedHashtag[] {
    const hashtags: ParsedHashtag[] = [];
    let match;

    // Reset regex lastIndex
    this.hashtagRegex.lastIndex = 0;

    while ((match = this.hashtagRegex.exec(text)) !== null) {
      const tag = match[1]!.toLowerCase();
      hashtags.push({
        tag,
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // Deduplicate
    const seen = new Set<string>();
    return hashtags.filter((h) => {
      if (seen.has(h.tag)) return false;
      seen.add(h.tag);
      return true;
    });
  }

  /**
   * Process hashtags in a video and update tracking
   */
  async processHashtags(
    tags: string[],
    videoUri: string,
    authorDid: string
  ): Promise<void> {
    if (tags.length === 0) return;

    const normalizedTags = tags.map((t) => t.toLowerCase().replace(/^#/, ''));

    for (const tag of normalizedTags) {
      // Upsert hashtag record
      await this.db
        .insert(schema.hashtags)
        .values({
          tag,
          videoCount: 1,
          viewCount: 0,
          lastUsedAt: new Date(),
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.hashtags.tag,
          set: {
            videoCount: sql`${schema.hashtags.videoCount} + 1`,
            lastUsedAt: new Date(),
          },
        });

      // Track video-hashtag association
      await this.db
        .insert(schema.videoHashtags)
        .values({
          id: nanoid(),
          videoUri,
          tag,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  /**
   * Remove hashtag associations for a video (on delete)
   */
  async removeVideoHashtags(videoUri: string): Promise<void> {
    // Get tags for this video
    const associations = await this.db
      .select({ tag: schema.videoHashtags.tag })
      .from(schema.videoHashtags)
      .where(eq(schema.videoHashtags.videoUri, videoUri));

    // Delete associations
    await this.db
      .delete(schema.videoHashtags)
      .where(eq(schema.videoHashtags.videoUri, videoUri));

    // Decrement counts
    for (const { tag } of associations) {
      await this.db
        .update(schema.hashtags)
        .set({
          videoCount: sql`GREATEST(${schema.hashtags.videoCount} - 1, 0)`,
        })
        .where(eq(schema.hashtags.tag, tag));
    }
  }

  /**
   * Get hashtag details
   */
  async getHashtagDetails(tag: string): Promise<HashtagDetails | null> {
    const normalizedTag = tag.toLowerCase().replace(/^#/, '');

    const hashtag = await this.db.query.hashtags.findFirst({
      where: eq(schema.hashtags.tag, normalizedTag),
    });

    if (!hashtag) {
      return null;
    }

    return {
      tag: hashtag.tag,
      videoCount: hashtag.videoCount,
      viewCount: hashtag.viewCount,
      followerCount: hashtag.followerCount,
      createdAt: hashtag.createdAt,
      lastUsedAt: hashtag.lastUsedAt || undefined,
    };
  }

  /**
   * Search hashtags by prefix
   */
  async searchHashtags(
    query: string,
    options: { limit?: number } = {}
  ): Promise<HashtagDetails[]> {
    const { limit = 10 } = options;

    const cleanQuery = query.toLowerCase().replace(/^#/, '');

    const hashtags = await this.db
      .select()
      .from(schema.hashtags)
      .where(sql`${schema.hashtags.tag} LIKE ${`${cleanQuery}%`}`)
      .orderBy(desc(schema.hashtags.videoCount))
      .limit(limit);

    return hashtags.map((h) => ({
      tag: h.tag,
      videoCount: h.videoCount,
      viewCount: h.viewCount,
      followerCount: h.followerCount,
      createdAt: h.createdAt,
      lastUsedAt: h.lastUsedAt || undefined,
    }));
  }

  /**
   * Get trending hashtags
   */
  async getTrendingHashtags(limit: number = 20): Promise<TrendingHashtag[]> {
    const trending = await this.db
      .select()
      .from(schema.trendingHashtags)
      .orderBy(schema.trendingHashtags.rank)
      .limit(limit);

    return trending.map((t) => ({
      tag: t.tag,
      videoCount: t.videoCount,
      viewCount: t.viewCount,
      velocity: t.velocity,
      rank: t.rank,
      direction: (t.direction as TrendingDirection) ?? 'stable',
    }));
  }

  /**
   * Compute direction by comparing current velocity to previous period velocity
   */
  private computeDirection(
    currentVelocity: number,
    previousVelocity: number | null | undefined
  ): TrendingDirection {
    if (previousVelocity == null) return 'stable';
    const delta = currentVelocity - previousVelocity;
    // Use a 10% relative threshold to avoid noise on low-velocity tags
    const threshold = Math.max(previousVelocity * 0.1, 0.01);
    if (delta > threshold) return 'up';
    if (delta < -threshold) return 'down';
    return 'stable';
  }

  /**
   * Update trending hashtags
   */
  async updateTrendingHashtags(): Promise<void> {
    console.log('[HashtagService] Updating trending hashtags...');

    const now = new Date();
    const velocityWindow = new Date(now.getTime() - this.velocityWindowHours * 60 * 60 * 1000);
    // Previous period window: one full velocity window before the current window
    const previousWindowStart = new Date(velocityWindow.getTime() - this.velocityWindowHours * 60 * 60 * 1000);

    // Snapshot previous velocities before clearing the table
    const previousTrending = await this.db
      .select({ tag: schema.trendingHashtags.tag, velocity: schema.trendingHashtags.velocity })
      .from(schema.trendingHashtags);
    const previousVelocityMap = new Map(previousTrending.map((t) => [t.tag, t.velocity]));

    // Get hashtags with recent activity
    const hashtagsWithActivity = await this.db
      .select({
        tag: schema.hashtags.tag,
        videoCount: schema.hashtags.videoCount,
        viewCount: schema.hashtags.viewCount,
        recentVideos: sql<number>`(
          SELECT COUNT(*) FROM ${schema.videoHashtags} vh
          JOIN ${schema.videos} v ON vh.video_uri = v.uri
          WHERE vh.tag = ${schema.hashtags.tag}
          AND v.created_at >= ${velocityWindow}
        )`,
        previousPeriodVideos: sql<number>`(
          SELECT COUNT(*) FROM ${schema.videoHashtags} vh
          JOIN ${schema.videos} v ON vh.video_uri = v.uri
          WHERE vh.tag = ${schema.hashtags.tag}
          AND v.created_at >= ${previousWindowStart}
          AND v.created_at < ${velocityWindow}
        )`,
      })
      .from(schema.hashtags)
      .where(gte(schema.hashtags.videoCount, this.minVideosForTrending));

    // Calculate velocity, direction, and score
    const scored = hashtagsWithActivity.map((h) => {
      const recentVideos = Number(h.recentVideos) || 0;
      const previousVideos = Number(h.previousPeriodVideos) || 0;
      const velocity = recentVideos / this.velocityWindowHours;
      // Use previous-period video count to derive a comparable previous velocity.
      // Fall back to the last stored velocity if available (avoids cold-start issues).
      const derivedPreviousVelocity = previousVideos > 0
        ? previousVideos / this.velocityWindowHours
        : (previousVelocityMap.get(h.tag) ?? null);

      const direction = this.computeDirection(velocity, derivedPreviousVelocity);

      // Score combines total popularity with recent velocity
      const score = h.videoCount * 0.3 + h.viewCount * 0.3 + velocity * 100 * 0.4;

      return {
        tag: h.tag,
        videoCount: h.videoCount,
        viewCount: h.viewCount,
        velocity,
        previousVelocity: derivedPreviousVelocity,
        direction,
        score,
      };
    });

    // Sort by score and assign ranks
    scored.sort((a, b) => b.score - a.score);

    // Clear and update trending table
    await this.db.delete(schema.trendingHashtags);

    const topHashtags = scored.slice(0, 100);
    if (topHashtags.length > 0) {
      await this.db.insert(schema.trendingHashtags).values(
        topHashtags.map((h, index) => ({
          tag: h.tag,
          videoCount: h.videoCount,
          viewCount: h.viewCount,
          velocity: h.velocity,
          previousVelocity: h.previousVelocity,
          direction: h.direction,
          rank: index + 1,
          calculatedAt: now,
        }))
      );
    }

    console.log(`[HashtagService] Updated ${topHashtags.length} trending hashtags`);
  }

  /**
   * Get videos for a hashtag
   */
  async getHashtagVideos(
    tag: string,
    options: {
      limit?: number;
      cursor?: string;
      sortBy?: 'recent' | 'popular';
    } = {}
  ): Promise<{
    videos: Array<{
      uri: string;
      cid: string;
      authorDid: string;
      caption?: string;
      thumbnailUrl?: string;
      viewCount: number;
      likeCount: number;
      createdAt: Date;
    }>;
    cursor?: string;
  }> {
    const { limit = 20, sortBy = 'recent' } = options;
    const normalizedTag = tag.toLowerCase().replace(/^#/, '');

    // Get video URIs for this hashtag
    let query = this.db
      .select({
        uri: schema.videos.uri,
        cid: schema.videos.cid,
        authorDid: schema.videos.authorDid,
        caption: schema.videos.caption,
        thumbnailUrl: schema.videos.thumbnailUrl,
        viewCount: schema.videos.viewCount,
        likeCount: schema.videos.likeCount,
        createdAt: schema.videos.createdAt,
      })
      .from(schema.videoHashtags)
      .innerJoin(schema.videos, eq(schema.videoHashtags.videoUri, schema.videos.uri))
      .where(
        and(
          eq(schema.videoHashtags.tag, normalizedTag),
          eq(schema.videos.visibility, 'public')
        )
      );

    // Apply sorting
    if (sortBy === 'popular') {
      query = query.orderBy(desc(schema.videos.viewCount)) as typeof query;
    } else {
      query = query.orderBy(desc(schema.videos.createdAt)) as typeof query;
    }

    const videos = await query.limit(limit + 1);

    const hasMore = videos.length > limit;
    const items = hasMore ? videos.slice(0, limit) : videos;

    // Increment view count for the hashtag
    await this.db
      .update(schema.hashtags)
      .set({
        viewCount: sql`${schema.hashtags.viewCount} + 1`,
      })
      .where(eq(schema.hashtags.tag, normalizedTag));

    return {
      videos: items.map((v) => ({
        uri: v.uri,
        cid: v.cid,
        authorDid: v.authorDid,
        caption: v.caption || undefined,
        thumbnailUrl: v.thumbnailUrl || undefined,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        createdAt: v.createdAt,
      })),
      cursor: hasMore && items.length > 0
        ? items[items.length - 1]!.createdAt.toISOString()
        : undefined,
    };
  }

  /**
   * Get related hashtags (often used together)
   */
  async getRelatedHashtags(
    tag: string,
    limit: number = 10
  ): Promise<Array<{ tag: string; cooccurrenceCount: number }>> {
    const normalizedTag = tag.toLowerCase().replace(/^#/, '');

    // Find hashtags that appear in the same videos
    const related = await this.db
      .select({
        tag: schema.videoHashtags.tag,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.videoHashtags)
      .where(
        and(
          sql`${schema.videoHashtags.videoUri} IN (
            SELECT video_uri FROM ${schema.videoHashtags}
            WHERE tag = ${normalizedTag}
          )`,
          sql`${schema.videoHashtags.tag} != ${normalizedTag}`
        )
      )
      .groupBy(schema.videoHashtags.tag)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);

    return related.map((r) => ({
      tag: r.tag,
      cooccurrenceCount: Number(r.count),
    }));
  }

  /**
   * Extract facets for AT Protocol rich text
   */
  extractHashtagFacets(
    text: string,
    parsedHashtags: ParsedHashtag[]
  ): Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; tag: string }>;
  }> {
    const encoder = new TextEncoder();

    return parsedHashtags.map((hashtag) => {
      const beforeHashtag = text.substring(0, hashtag.start);
      const hashtagText = text.substring(hashtag.start, hashtag.end);

      const byteStart = encoder.encode(beforeHashtag).length;
      const byteEnd = byteStart + encoder.encode(hashtagText).length;

      return {
        index: { byteStart, byteEnd },
        features: [
          {
            $type: 'app.bsky.richtext.facet#tag',
            tag: hashtag.tag,
          },
        ],
      };
    });
  }
}

/**
 * Create HashtagService instance
 */
export function createHashtagService(
  db: PostgresJsDatabase<typeof schema>
): HashtagService {
  return new HashtagService({ db });
}
