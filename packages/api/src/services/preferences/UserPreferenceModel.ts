import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import type {
  TagAffinity,
  AuthorAffinity,
  SoundAffinity,
  NegativeSignals,
  DurationPreference,
} from '../../db/schema.js';

/**
 * User preferences computed from engagement data
 */
export interface UserPreferences {
  userDid: string;
  tagAffinities: TagAffinity[];
  authorAffinities: AuthorAffinity[];
  soundAffinities: SoundAffinity[];
  negativeSignals: NegativeSignals;
  avgWatchCompletion: number;
  preferredDuration: DurationPreference | null;
  peakActivityHours: number[] | null;
  likeThreshold: number;
  commentThreshold: number;
  totalInteractions: number;
  totalWatchTime: number;
  computedAt: Date;
}

/**
 * Configuration for preference computation
 */
export interface PreferenceModelConfig {
  db: PostgresJsDatabase<typeof schema>;
  // Time window for computing preferences (in days)
  lookbackDays?: number;
  // Half-life for decay (in days)
  decayHalfLifeDays?: number;
  // Maximum number of affinities to store per category
  maxAffinities?: number;
  // Weights for different signal types
  weights?: {
    watchCompletion: number;
    like: number;
    comment: number;
    share: number;
    rewatch: number;
  };
}

const DEFAULT_CONFIG = {
  lookbackDays: 7,
  decayHalfLifeDays: 3,
  maxAffinities: 100,
  weights: {
    watchCompletion: 0.4,
    like: 0.3,
    comment: 0.2,
    share: 0.1,
    rewatch: 0.15,
  },
};

/**
 * User Preference Model Service
 *
 * Computes and manages user preferences for FYP personalization
 * based on engagement signals (watch time, likes, follows, etc.)
 */
export class UserPreferenceModel {
  private db: PostgresJsDatabase<typeof schema>;
  private lookbackDays: number;
  private decayHalfLifeDays: number;
  private maxAffinities: number;
  private weights: typeof DEFAULT_CONFIG.weights;

  constructor(config: PreferenceModelConfig) {
    this.db = config.db;
    this.lookbackDays = config.lookbackDays ?? DEFAULT_CONFIG.lookbackDays;
    this.decayHalfLifeDays = config.decayHalfLifeDays ?? DEFAULT_CONFIG.decayHalfLifeDays;
    this.maxAffinities = config.maxAffinities ?? DEFAULT_CONFIG.maxAffinities;
    this.weights = { ...DEFAULT_CONFIG.weights, ...config.weights };
  }

  /**
   * Get cached user preferences from database
   */
  async getCachedPreferences(userDid: string): Promise<UserPreferences | null> {
    const cached = await this.db.query.userFeedPreferences.findFirst({
      where: eq(schema.userFeedPreferences.userDid, userDid),
    });

    if (!cached) return null;

    return {
      userDid: cached.userDid,
      tagAffinities: cached.tagAffinities || [],
      authorAffinities: cached.authorAffinities || [],
      soundAffinities: cached.soundAffinities || [],
      negativeSignals: cached.negativeSignals || {
        hiddenAuthors: [],
        hiddenTags: [],
        notInterestedVideos: [],
        seeLessAuthors: [],
        seeLessTags: [],
      },
      avgWatchCompletion: cached.avgWatchCompletion || 0.5,
      preferredDuration: cached.preferredDuration || null,
      peakActivityHours: cached.peakActivityHours || null,
      likeThreshold: cached.likeThreshold || 0.7,
      commentThreshold: cached.commentThreshold || 0.8,
      totalInteractions: cached.totalInteractions || 0,
      totalWatchTime: cached.totalWatchTime || 0,
      computedAt: cached.computedAt,
    };
  }

  /**
   * Compute user preferences from engagement data
   */
  async computePreferences(userDid: string): Promise<UserPreferences> {
    const now = new Date();
    const lookbackDate = new Date(now.getTime() - this.lookbackDays * 24 * 60 * 60 * 1000);

    // Fetch recent interactions
    const interactions = await this.db.query.userInteractions.findMany({
      where: and(
        eq(schema.userInteractions.userDid, userDid),
        gte(schema.userInteractions.createdAt, lookbackDate)
      ),
      orderBy: desc(schema.userInteractions.createdAt),
      limit: 1000,
    });

    // Fetch likes
    const likes = await this.db.query.likes.findMany({
      where: and(
        eq(schema.likes.authorDid, userDid),
        gte(schema.likes.createdAt, lookbackDate)
      ),
      limit: 500,
    });

    // Fetch follows
    const follows = await this.db.query.follows.findMany({
      where: eq(schema.follows.followerDid, userDid),
    });

    // Fetch negative feedback
    const feedback = await this.db.query.userContentFeedback.findMany({
      where: eq(schema.userContentFeedback.userDid, userDid),
    });

    // Get video metadata for interactions
    const videoUris = [...new Set(interactions.map((i) => i.videoUri))];
    const likedVideoUris = likes.map((l) => l.videoUri);
    const allVideoUris = [...new Set([...videoUris, ...likedVideoUris])];

    const videoData =
      allVideoUris.length > 0
        ? await this.db.query.videos.findMany({
            where: inArray(schema.videos.uri, allVideoUris),
            columns: {
              uri: true,
              authorDid: true,
              tags: true,
              soundUri: true,
              duration: true,
            },
          })
        : [];

    const videoMap = new Map(videoData.map((v) => [v.uri, v]));
    const followedDids = new Set(follows.map((f) => f.followeeDid));

    // Compute tag affinities
    const tagScores = new Map<string, { score: number; interactions: number }>();
    // Compute author affinities
    const authorScores = new Map<string, { score: number; interactions: number }>();
    // Compute sound affinities
    const soundScores = new Map<string, { score: number; interactions: number }>();

    // Engagement patterns
    let totalCompletion = 0;
    let totalWatchTime = 0;
    let completionCount = 0;
    const durations: number[] = [];
    const activityHours: number[] = [];

    // Track completion rates for likes/comments
    const likeCompletions: number[] = [];
    const commentCompletions: number[] = [];

    // Process interactions
    for (const interaction of interactions) {
      const video = videoMap.get(interaction.videoUri);
      if (!video) continue;

      const ageHours = (now.getTime() - interaction.createdAt.getTime()) / (1000 * 60 * 60);
      const decayFactor = Math.pow(0.5, ageHours / (this.decayHalfLifeDays * 24));

      // Calculate signal strength based on interaction type and quality
      let signalStrength = (interaction.interactionQuality || 0.5) * decayFactor;

      // Boost for high completion
      if (interaction.completionRate && interaction.completionRate > 0.75) {
        signalStrength *= 1.2;
      }

      // Boost for rewatches
      if (interaction.rewatchCount && interaction.rewatchCount > 0) {
        signalStrength *= 1 + interaction.rewatchCount * this.weights.rewatch;
      }

      // Process tags
      const tags = (video.tags as string[]) || [];
      for (const tag of tags) {
        const current = tagScores.get(tag) || { score: 0, interactions: 0 };
        tagScores.set(tag, {
          score: current.score + signalStrength,
          interactions: current.interactions + 1,
        });
      }

      // Process author
      if (video.authorDid) {
        const current = authorScores.get(video.authorDid) || { score: 0, interactions: 0 };
        authorScores.set(video.authorDid, {
          score: current.score + signalStrength,
          interactions: current.interactions + 1,
        });
      }

      // Process sound
      if (video.soundUri) {
        const current = soundScores.get(video.soundUri) || { score: 0, interactions: 0 };
        soundScores.set(video.soundUri, {
          score: current.score + signalStrength,
          interactions: current.interactions + 1,
        });
      }

      // Track engagement patterns
      if (interaction.completionRate !== null) {
        totalCompletion += interaction.completionRate;
        completionCount++;
      }
      if (interaction.watchDuration) {
        totalWatchTime += interaction.watchDuration;
      }
      if (video.duration) {
        durations.push(video.duration);
      }
      activityHours.push(interaction.createdAt.getHours());

      // Track completion for likes/comments
      if (interaction.interactionType === 'like' && interaction.completionRate) {
        likeCompletions.push(interaction.completionRate);
      }
      if (
        interaction.interactionType?.startsWith('comment') &&
        interaction.completionRate
      ) {
        commentCompletions.push(interaction.completionRate);
      }
    }

    // Boost scores for liked videos
    for (const like of likes) {
      const video = videoMap.get(like.videoUri);
      if (!video) continue;

      const ageHours = (now.getTime() - like.createdAt.getTime()) / (1000 * 60 * 60);
      const decayFactor = Math.pow(0.5, ageHours / (this.decayHalfLifeDays * 24));
      const likeBoost = this.weights.like * decayFactor;

      // Boost tags
      const tags = (video.tags as string[]) || [];
      for (const tag of tags) {
        const current = tagScores.get(tag) || { score: 0, interactions: 0 };
        tagScores.set(tag, {
          score: current.score + likeBoost,
          interactions: current.interactions + 1,
        });
      }

      // Boost author
      if (video.authorDid) {
        const current = authorScores.get(video.authorDid) || { score: 0, interactions: 0 };
        authorScores.set(video.authorDid, {
          score: current.score + likeBoost * 1.5, // Extra boost for liked author
          interactions: current.interactions + 1,
        });
      }
    }

    // Process negative feedback
    const negativeSignals: NegativeSignals = {
      hiddenAuthors: [],
      hiddenTags: [],
      notInterestedVideos: [],
      seeLessAuthors: [],
      seeLessTags: [],
    };

    for (const fb of feedback) {
      switch (fb.feedbackType) {
        case 'hide_author':
          if (fb.targetType === 'author') {
            negativeSignals.hiddenAuthors.push(fb.targetId);
          }
          break;
        case 'not_interested':
          if (fb.targetType === 'video') {
            negativeSignals.notInterestedVideos.push(fb.targetId);
          } else if (fb.targetType === 'tag') {
            negativeSignals.hiddenTags.push(fb.targetId);
          }
          break;
        case 'see_less':
          if (fb.targetType === 'author') {
            negativeSignals.seeLessAuthors.push(fb.targetId);
            // Also reduce author score
            const current = authorScores.get(fb.targetId);
            if (current) {
              authorScores.set(fb.targetId, {
                ...current,
                score: current.score * 0.5,
              });
            }
          } else if (fb.targetType === 'tag') {
            negativeSignals.seeLessTags.push(fb.targetId);
            // Also reduce tag score
            const current = tagScores.get(fb.targetId);
            if (current) {
              tagScores.set(fb.targetId, {
                ...current,
                score: current.score * 0.5,
              });
            }
          }
          break;
      }
    }

    // Normalize and sort affinities
    const maxTagScore = Math.max(...Array.from(tagScores.values()).map((v) => v.score), 1);
    const maxAuthorScore = Math.max(...Array.from(authorScores.values()).map((v) => v.score), 1);
    const maxSoundScore = Math.max(...Array.from(soundScores.values()).map((v) => v.score), 1);

    const tagAffinities: TagAffinity[] = Array.from(tagScores.entries())
      .map(([tag, data]) => ({
        tag,
        score: data.score / maxTagScore,
        interactions: data.interactions,
        lastUpdated: now.toISOString(),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxAffinities);

    const authorAffinities: AuthorAffinity[] = Array.from(authorScores.entries())
      .map(([did, data]) => ({
        did,
        score: data.score / maxAuthorScore,
        interactions: data.interactions,
        isFollowing: followedDids.has(did),
        lastUpdated: now.toISOString(),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxAffinities);

    const soundAffinities: SoundAffinity[] = Array.from(soundScores.entries())
      .map(([soundId, data]) => ({
        soundId,
        score: data.score / maxSoundScore,
        interactions: data.interactions,
        lastUpdated: now.toISOString(),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxAffinities);

    // Calculate derived metrics
    const avgWatchCompletion = completionCount > 0 ? totalCompletion / completionCount : 0.5;

    // Calculate preferred duration
    let preferredDuration: DurationPreference | null = null;
    if (durations.length > 10) {
      durations.sort((a, b) => a - b);
      preferredDuration = {
        min: durations[Math.floor(durations.length * 0.1)] ?? 0,
        max: durations[Math.floor(durations.length * 0.9)] ?? 0,
        preferred: durations[Math.floor(durations.length * 0.5)] ?? 0,
      };
    }

    // Calculate peak activity hours (top 5)
    const hourCounts = new Map<number, number>();
    for (const hour of activityHours) {
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
    const peakActivityHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour]) => hour);

    // Calculate thresholds
    const likeThreshold =
      likeCompletions.length > 5
        ? likeCompletions.reduce((a, b) => a + b, 0) / likeCompletions.length
        : 0.7;
    const commentThreshold =
      commentCompletions.length > 5
        ? commentCompletions.reduce((a, b) => a + b, 0) / commentCompletions.length
        : 0.8;

    const preferences: UserPreferences = {
      userDid,
      tagAffinities,
      authorAffinities,
      soundAffinities,
      negativeSignals,
      avgWatchCompletion,
      preferredDuration,
      peakActivityHours: peakActivityHours.length > 0 ? peakActivityHours : null,
      likeThreshold,
      commentThreshold,
      totalInteractions: interactions.length,
      totalWatchTime,
      computedAt: now,
    };

    // Save to database
    await this.savePreferences(preferences);

    return preferences;
  }

  /**
   * Save computed preferences to database
   */
  private async savePreferences(preferences: UserPreferences): Promise<void> {
    await this.db
      .insert(schema.userFeedPreferences)
      .values({
        userDid: preferences.userDid,
        tagAffinities: preferences.tagAffinities,
        authorAffinities: preferences.authorAffinities,
        soundAffinities: preferences.soundAffinities,
        negativeSignals: preferences.negativeSignals,
        avgWatchCompletion: preferences.avgWatchCompletion,
        preferredDuration: preferences.preferredDuration,
        peakActivityHours: preferences.peakActivityHours,
        likeThreshold: preferences.likeThreshold,
        commentThreshold: preferences.commentThreshold,
        totalInteractions: preferences.totalInteractions,
        totalWatchTime: preferences.totalWatchTime,
        computedAt: preferences.computedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.userFeedPreferences.userDid,
        set: {
          tagAffinities: preferences.tagAffinities,
          authorAffinities: preferences.authorAffinities,
          soundAffinities: preferences.soundAffinities,
          negativeSignals: preferences.negativeSignals,
          avgWatchCompletion: preferences.avgWatchCompletion,
          preferredDuration: preferences.preferredDuration,
          peakActivityHours: preferences.peakActivityHours,
          likeThreshold: preferences.likeThreshold,
          commentThreshold: preferences.commentThreshold,
          totalInteractions: preferences.totalInteractions,
          totalWatchTime: preferences.totalWatchTime,
          computedAt: preferences.computedAt,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get or compute preferences for a user
   * Returns cached preferences if fresh enough, otherwise recomputes
   */
  async getPreferences(userDid: string, maxAge: number = 15 * 60 * 1000): Promise<UserPreferences> {
    const cached = await this.getCachedPreferences(userDid);

    if (cached) {
      const age = Date.now() - cached.computedAt.getTime();
      if (age < maxAge) {
        return cached;
      }
    }

    return this.computePreferences(userDid);
  }

  /**
   * Get top tag affinities for a user
   */
  async getTagAffinities(userDid: string, limit: number = 20): Promise<TagAffinity[]> {
    const prefs = await this.getPreferences(userDid);
    return prefs.tagAffinities.slice(0, limit);
  }

  /**
   * Get top author affinities for a user
   */
  async getAuthorAffinities(userDid: string, limit: number = 20): Promise<AuthorAffinity[]> {
    const prefs = await this.getPreferences(userDid);
    return prefs.authorAffinities.slice(0, limit);
  }

  /**
   * Apply explicit feedback to preferences
   */
  async applyFeedback(
    userDid: string,
    feedback: {
      type: 'not_interested' | 'see_less' | 'see_more' | 'hide_author';
      targetType: 'video' | 'author' | 'tag' | 'sound';
      targetId: string;
    }
  ): Promise<void> {
    const prefs = await this.getCachedPreferences(userDid);
    if (!prefs) return;

    const negativeSignals = { ...prefs.negativeSignals };

    switch (feedback.type) {
      case 'hide_author':
        if (feedback.targetType === 'author' && !negativeSignals.hiddenAuthors.includes(feedback.targetId)) {
          negativeSignals.hiddenAuthors.push(feedback.targetId);
        }
        break;
      case 'not_interested':
        if (feedback.targetType === 'video' && !negativeSignals.notInterestedVideos.includes(feedback.targetId)) {
          negativeSignals.notInterestedVideos.push(feedback.targetId);
        } else if (feedback.targetType === 'tag' && !negativeSignals.hiddenTags.includes(feedback.targetId)) {
          negativeSignals.hiddenTags.push(feedback.targetId);
        }
        break;
      case 'see_less':
        if (feedback.targetType === 'author' && !negativeSignals.seeLessAuthors.includes(feedback.targetId)) {
          negativeSignals.seeLessAuthors.push(feedback.targetId);
        } else if (feedback.targetType === 'tag' && !negativeSignals.seeLessTags.includes(feedback.targetId)) {
          negativeSignals.seeLessTags.push(feedback.targetId);
        }
        break;
    }

    // Update preferences with new negative signals
    await this.db
      .update(schema.userFeedPreferences)
      .set({
        negativeSignals,
        updatedAt: new Date(),
      })
      .where(eq(schema.userFeedPreferences.userDid, userDid));
  }

  /**
   * Check if content should be filtered based on user feedback
   */
  isContentFiltered(
    prefs: UserPreferences,
    video: { uri: string; authorDid: string; tags: string[]; soundUri?: string | null }
  ): { filtered: boolean; reason?: string } {
    const { negativeSignals } = prefs;

    // Check hidden authors
    if (negativeSignals.hiddenAuthors.includes(video.authorDid)) {
      return { filtered: true, reason: 'hidden_author' };
    }

    // Check not interested videos
    if (negativeSignals.notInterestedVideos.includes(video.uri)) {
      return { filtered: true, reason: 'not_interested' };
    }

    // Check hidden tags
    for (const tag of video.tags) {
      if (negativeSignals.hiddenTags.includes(tag)) {
        return { filtered: true, reason: 'hidden_tag' };
      }
    }

    return { filtered: false };
  }

  /**
   * Calculate personalization score for a video
   * Returns a score from 0 to 1 indicating how well the video matches user preferences
   */
  calculatePersonalScore(
    prefs: UserPreferences,
    video: {
      uri: string;
      authorDid: string;
      tags: string[];
      soundUri?: string | null;
      duration?: number | null;
      createdAt: Date;
    }
  ): number {
    let score = 0;
    let factorCount = 0;

    // Tag affinity (weight: 0.3)
    const tagAffinityMap = new Map(prefs.tagAffinities.map((t) => [t.tag, t.score]));
    let tagScore = 0;
    for (const tag of video.tags) {
      const affinity = tagAffinityMap.get(tag);
      if (affinity !== undefined) {
        tagScore += affinity;
      }
    }
    if (video.tags.length > 0) {
      score += (tagScore / video.tags.length) * 0.3;
      factorCount++;
    }

    // Author affinity (weight: 0.25)
    const authorAffinity = prefs.authorAffinities.find((a) => a.did === video.authorDid);
    if (authorAffinity) {
      score += authorAffinity.score * 0.25;
      // Extra bonus if following
      if (authorAffinity.isFollowing) {
        score += 0.1;
      }
      factorCount++;
    }

    // Sound affinity (weight: 0.15)
    if (video.soundUri) {
      const soundAffinity = prefs.soundAffinities.find((s) => s.soundId === video.soundUri);
      if (soundAffinity) {
        score += soundAffinity.score * 0.15;
        factorCount++;
      }
    }

    // Duration preference match (weight: 0.1)
    if (video.duration && prefs.preferredDuration) {
      const { min, max, preferred } = prefs.preferredDuration;
      if (video.duration >= min && video.duration <= max) {
        // Within preferred range
        const distanceFromPreferred = Math.abs(video.duration - preferred) / (max - min);
        score += (1 - distanceFromPreferred) * 0.1;
        factorCount++;
      }
    }

    // Recency boost (weight: 0.2)
    const ageHours = (Date.now() - video.createdAt.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - ageHours / (48 * 7)); // Decay over a week
    score += recencyScore * 0.2;
    factorCount++;

    // Penalize "see less" content
    const { negativeSignals } = prefs;
    if (negativeSignals.seeLessAuthors.includes(video.authorDid)) {
      score *= 0.5;
    }
    for (const tag of video.tags) {
      if (negativeSignals.seeLessTags.includes(tag)) {
        score *= 0.7;
        break;
      }
    }

    return Math.min(1, Math.max(0, score));
  }
}

/**
 * Create a singleton instance of UserPreferenceModel
 */
export function createUserPreferenceModel(db: PostgresJsDatabase<typeof schema>): UserPreferenceModel {
  return new UserPreferenceModel({ db });
}
