import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, desc, gte, sql, notInArray, inArray, or, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import {
  UserPreferenceModel,
  type UserPreferences,
} from '../preferences/UserPreferenceModel.js';
import type { VideoView, AuthorView } from '@exprsn/shared';

/**
 * Feed item with personalization score
 */
export interface FeedItem {
  video: VideoView;
  personalScore: number;
  trendingScore: number;
  combinedScore: number;
}

/**
 * FYP generation result
 */
export interface FYPResult {
  items: FeedItem[];
  cursor?: string;
  hasMore: boolean;
}

/**
 * Configuration for ForYou algorithm
 */
export interface ForYouConfig {
  db: PostgresJsDatabase<typeof schema>;
  preferenceModel: UserPreferenceModel;
  // Weight for trending vs personal score (0-1, higher = more trending)
  trendingWeight?: number;
  // Maximum videos from same author in a batch
  maxPerAuthor?: number;
  // Diversity settings
  diversityConfig?: {
    // Minimum unique tags per batch
    minUniqueTags?: number;
    // Mix in some random videos for discovery
    discoveryRatio?: number;
  };
}

const DEFAULT_CONFIG = {
  trendingWeight: 0.3,
  maxPerAuthor: 2,
  diversityConfig: {
    minUniqueTags: 5,
    discoveryRatio: 0.1,
  },
};

/**
 * For You Algorithm
 *
 * Generates personalized video feed by combining:
 * - User preference affinities (tags, authors, sounds)
 * - Trending scores
 * - Diversity constraints
 * - Negative feedback filtering
 */
export class ForYouAlgorithm {
  private db: PostgresJsDatabase<typeof schema>;
  private preferenceModel: UserPreferenceModel;
  private trendingWeight: number;
  private maxPerAuthor: number;
  private diversityConfig: typeof DEFAULT_CONFIG.diversityConfig;

  constructor(config: ForYouConfig) {
    this.db = config.db;
    this.preferenceModel = config.preferenceModel;
    this.trendingWeight = config.trendingWeight ?? DEFAULT_CONFIG.trendingWeight;
    this.maxPerAuthor = config.maxPerAuthor ?? DEFAULT_CONFIG.maxPerAuthor;
    this.diversityConfig = { ...DEFAULT_CONFIG.diversityConfig, ...config.diversityConfig };
  }

  /**
   * Generate personalized For You feed
   */
  async generateFeed(
    userDid: string,
    options: {
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<FYPResult> {
    const { limit = 30, cursor } = options;

    // Get user preferences (cached or computed)
    const prefs = await this.preferenceModel.getPreferences(userDid);

    // Parse cursor (offset-based for simplicity)
    const offset = cursor ? parseInt(cursor, 10) : 0;

    // Get candidate videos
    const candidates = await this.getCandidates(userDid, prefs, limit * 3, offset);

    // Score and rank candidates
    const scored = this.scoreAndRank(candidates, prefs);

    // Apply diversity constraints
    const diversified = this.applyDiversity(scored, limit);

    // Hydrate videos with full data
    const items = await this.hydrateItems(diversified, userDid);

    return {
      items,
      cursor: items.length >= limit ? String(offset + limit) : undefined,
      hasMore: items.length >= limit,
    };
  }

  /**
   * Get candidate videos from database
   */
  private async getCandidates(
    userDid: string,
    prefs: UserPreferences,
    limit: number,
    offset: number
  ): Promise<CandidateVideo[]> {
    const { negativeSignals } = prefs;

    // Build exclusion list
    const excludedAuthors = [
      ...negativeSignals.hiddenAuthors,
      // Don't completely exclude "see less" authors, just penalize in scoring
    ];
    const excludedVideos = negativeSignals.notInterestedVideos;

    // Get blocked and muted users
    const blockedMuted = await this.db
      .select({ targetDid: schema.blocks.blockedDid })
      .from(schema.blocks)
      .where(eq(schema.blocks.blockerDid, userDid))
      .union(
        this.db
          .select({ targetDid: schema.mutes.mutedDid })
          .from(schema.mutes)
          .where(eq(schema.mutes.muterDid, userDid))
      );

    const blockedDids = blockedMuted.map((b) => b.targetDid);
    const allExcludedAuthors = [...new Set([...excludedAuthors, ...blockedDids])];

    // Query trending videos with filters
    const query = this.db
      .select({
        uri: schema.videos.uri,
        cid: schema.videos.cid,
        authorDid: schema.videos.authorDid,
        caption: schema.videos.caption,
        tags: schema.videos.tags,
        soundUri: schema.videos.soundUri,
        cdnUrl: schema.videos.cdnUrl,
        hlsPlaylist: schema.videos.hlsPlaylist,
        thumbnailUrl: schema.videos.thumbnailUrl,
        duration: schema.videos.duration,
        aspectRatio: schema.videos.aspectRatio,
        viewCount: schema.videos.viewCount,
        likeCount: schema.videos.likeCount,
        commentCount: schema.videos.commentCount,
        shareCount: schema.videos.shareCount,
        createdAt: schema.videos.createdAt,
        trendingScore: schema.trendingVideos.score,
        trendingRank: schema.trendingVideos.rank,
      })
      .from(schema.videos)
      .leftJoin(schema.trendingVideos, eq(schema.videos.uri, schema.trendingVideos.videoUri))
      .where(
        and(
          eq(schema.videos.visibility, 'public'),
          // Exclude hidden authors
          allExcludedAuthors.length > 0
            ? notInArray(schema.videos.authorDid, allExcludedAuthors)
            : undefined,
          // Exclude not-interested videos
          excludedVideos.length > 0 ? notInArray(schema.videos.uri, excludedVideos) : undefined,
          // Include trending OR recent videos
          or(
            sql`${schema.trendingVideos.videoUri} IS NOT NULL`,
            gte(schema.videos.createdAt, sql`NOW() - INTERVAL '48 hours'`)
          )
        )
      )
      .orderBy(
        desc(sql`COALESCE(${schema.trendingVideos.score}, 0)`),
        desc(schema.videos.createdAt)
      )
      .limit(limit)
      .offset(offset);

    const results = await query;

    return results.map((r) => ({
      uri: r.uri,
      cid: r.cid,
      authorDid: r.authorDid,
      caption: r.caption,
      tags: (r.tags as string[]) || [],
      soundUri: r.soundUri,
      cdnUrl: r.cdnUrl,
      hlsPlaylist: r.hlsPlaylist,
      thumbnailUrl: r.thumbnailUrl,
      duration: r.duration,
      aspectRatio: r.aspectRatio,
      viewCount: r.viewCount,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      shareCount: r.shareCount,
      createdAt: r.createdAt,
      trendingScore: r.trendingScore || 0,
      trendingRank: r.trendingRank || 999999,
    }));
  }

  /**
   * Score candidates based on user preferences
   */
  private scoreAndRank(
    candidates: CandidateVideo[],
    prefs: UserPreferences
  ): ScoredVideo[] {
    const maxTrendingScore = Math.max(...candidates.map((c) => c.trendingScore), 1);

    return candidates
      .map((candidate) => {
        // Calculate personal score
        const personalScore = this.preferenceModel.calculatePersonalScore(prefs, {
          uri: candidate.uri,
          authorDid: candidate.authorDid,
          tags: candidate.tags,
          soundUri: candidate.soundUri,
          duration: candidate.duration,
          createdAt: candidate.createdAt,
        });

        // Normalize trending score to 0-1
        const normalizedTrending = candidate.trendingScore / maxTrendingScore;

        // Combined score: weighted average
        const baseCombinedScore =
          normalizedTrending * this.trendingWeight +
          personalScore * (1 - this.trendingWeight);

        // Identity boost for did:exprsn authors
        const identityBoost = candidate.authorDid.startsWith('did:exprsn:') ? 1.15 : 1.0;
        const combinedScore = baseCombinedScore * identityBoost;

        return {
          ...candidate,
          personalScore,
          trendingScore: normalizedTrending,
          combinedScore,
        };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * Apply diversity constraints to ensure varied content
   */
  private applyDiversity(scored: ScoredVideo[], limit: number): ScoredVideo[] {
    const result: ScoredVideo[] = [];
    const authorCounts = new Map<string, number>();
    const usedTags = new Set<string>();

    // First pass: select top videos with diversity constraints
    for (const video of scored) {
      if (result.length >= limit) break;

      // Check author limit
      const authorCount = authorCounts.get(video.authorDid) || 0;
      if (authorCount >= this.maxPerAuthor) continue;

      // Add video
      result.push(video);
      authorCounts.set(video.authorDid, authorCount + 1);
      video.tags.forEach((tag) => usedTags.add(tag));
    }

    // Check diversity: if not enough unique tags, swap some videos
    if (usedTags.size < (this.diversityConfig.minUniqueTags || 5)) {
      // Find videos with new tags from remaining candidates
      const remaining = scored.filter((v) => !result.includes(v));
      const newTagVideos = remaining.filter(
        (v) => v.tags.some((t) => !usedTags.has(t))
      );

      // Replace some lower-scored videos with diverse options
      const replacementCount = Math.min(
        Math.floor(limit * (this.diversityConfig.discoveryRatio || 0.1)),
        newTagVideos.length
      );

      if (replacementCount > 0 && result.length > replacementCount) {
        // Remove lowest scored videos
        result.splice(-replacementCount, replacementCount);
        // Add diverse videos
        result.push(...newTagVideos.slice(0, replacementCount));
      }
    }

    return result;
  }

  /**
   * Hydrate videos with full author data and viewer state
   */
  private async hydrateItems(
    videos: ScoredVideo[],
    viewerDid: string
  ): Promise<FeedItem[]> {
    if (videos.length === 0) return [];

    const videoUris = videos.map((v) => v.uri);
    const authorDids = [...new Set(videos.map((v) => v.authorDid))];

    // Get authors
    const authors = await this.db.query.users.findMany({
      where: inArray(schema.users.did, authorDids),
    });
    const authorMap = new Map(authors.map((a) => [a.did, a]));

    // Get viewer likes
    const likes = await this.db.query.likes.findMany({
      where: and(
        eq(schema.likes.authorDid, viewerDid),
        inArray(schema.likes.videoUri, videoUris)
      ),
    });
    const likedUris = new Set(likes.map((l) => l.videoUri));

    // Get viewer follows
    const follows = await this.db.query.follows.findMany({
      where: and(
        eq(schema.follows.followerDid, viewerDid),
        inArray(schema.follows.followeeDid, authorDids)
      ),
    });
    const followedDids = new Set(follows.map((f) => f.followeeDid));

    return videos.map((video) => {
      const author = authorMap.get(video.authorDid);
      const authorView: AuthorView = author
        ? {
            did: author.did,
            handle: author.handle,
            displayName: author.displayName || undefined,
            avatar: author.avatar || undefined,
            verified: author.verified,
          }
        : {
            did: video.authorDid,
            handle: 'unknown',
          };

      const videoView: VideoView = {
        uri: video.uri,
        cid: video.cid,
        author: authorView,
        video: {
          cdnUrl: video.cdnUrl || undefined,
          hlsPlaylist: video.hlsPlaylist || undefined,
          thumbnail: video.thumbnailUrl || undefined,
          duration: video.duration ?? 0,
          aspectRatio: video.aspectRatio ?? { width: 9, height: 16 },
        },
        caption: video.caption || undefined,
        tags: video.tags,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        shareCount: video.shareCount,
        createdAt: video.createdAt.toISOString(),
        indexedAt: video.createdAt.toISOString(),
        viewerLike: likedUris.has(video.uri) ? `at://${viewerDid}/like/${video.uri}` : undefined,
      };

      return {
        video: videoView,
        personalScore: video.personalScore,
        trendingScore: video.trendingScore,
        combinedScore: video.combinedScore,
      };
    });
  }

  /**
   * Generate feed for anonymous users (just trending)
   */
  async generateAnonymousFeed(options: { limit?: number; cursor?: string } = {}): Promise<{
    items: VideoView[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const { limit = 30, cursor } = options;
    const offset = cursor ? parseInt(cursor, 10) : 0;

    const results = await this.db
      .select({
        uri: schema.videos.uri,
        cid: schema.videos.cid,
        authorDid: schema.videos.authorDid,
        caption: schema.videos.caption,
        tags: schema.videos.tags,
        cdnUrl: schema.videos.cdnUrl,
        hlsPlaylist: schema.videos.hlsPlaylist,
        thumbnailUrl: schema.videos.thumbnailUrl,
        duration: schema.videos.duration,
        aspectRatio: schema.videos.aspectRatio,
        viewCount: schema.videos.viewCount,
        likeCount: schema.videos.likeCount,
        commentCount: schema.videos.commentCount,
        shareCount: schema.videos.shareCount,
        createdAt: schema.videos.createdAt,
      })
      .from(schema.trendingVideos)
      .innerJoin(schema.videos, eq(schema.trendingVideos.videoUri, schema.videos.uri))
      .where(eq(schema.videos.visibility, 'public'))
      .orderBy(desc(schema.trendingVideos.score))
      .limit(limit)
      .offset(offset);

    // Get authors
    const authorDids = [...new Set(results.map((r) => r.authorDid))];
    const authors = await this.db.query.users.findMany({
      where: inArray(schema.users.did, authorDids),
    });
    const authorMap = new Map(authors.map((a) => [a.did, a]));

    const items: VideoView[] = results.map((video) => {
      const author = authorMap.get(video.authorDid);
      return {
        uri: video.uri,
        cid: video.cid,
        author: author
          ? {
              did: author.did,
              handle: author.handle,
              displayName: author.displayName || undefined,
              avatar: author.avatar || undefined,
              verified: author.verified,
            }
          : {
              did: video.authorDid,
              handle: 'unknown',
            },
        video: {
          cdnUrl: video.cdnUrl || undefined,
          hlsPlaylist: video.hlsPlaylist || undefined,
          thumbnail: video.thumbnailUrl || undefined,
          duration: video.duration ?? 0,
          aspectRatio: video.aspectRatio ?? { width: 9, height: 16 },
        },
        caption: video.caption || undefined,
        tags: (video.tags as string[]) || [],
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        shareCount: video.shareCount,
        createdAt: video.createdAt.toISOString(),
        indexedAt: video.createdAt.toISOString(),
      };
    });

    return {
      items,
      cursor: items.length >= limit ? String(offset + limit) : undefined,
      hasMore: items.length >= limit,
    };
  }
}

/**
 * Internal types
 */
interface CandidateVideo {
  uri: string;
  cid: string;
  authorDid: string;
  caption: string | null;
  tags: string[];
  soundUri: string | null;
  cdnUrl: string | null;
  hlsPlaylist: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  aspectRatio: { width: number; height: number } | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: Date;
  trendingScore: number;
  trendingRank: number;
}

interface ScoredVideo extends CandidateVideo {
  personalScore: number;
  trendingScore: number;
  combinedScore: number;
}

/**
 * Create ForYouAlgorithm instance
 */
export function createForYouAlgorithm(
  db: PostgresJsDatabase<typeof schema>,
  preferenceModel: UserPreferenceModel
): ForYouAlgorithm {
  return new ForYouAlgorithm({ db, preferenceModel });
}
