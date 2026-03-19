/**
 * Live Stream Health Service
 * Provides real-time stream health monitoring, viewer engagement analytics,
 * and quality recommendations for streamers
 */

import { db } from '../../db/index.js';
import {
  liveStreams,
  streamViewers,
  streamChat,
  streamModerators,
} from '../../db/schema.js';
import { eq, and, sql, gte, desc, count } from 'drizzle-orm';
import { redis } from '../../cache/redis.js';
import { getStreamingProvider } from './index.js';

// Health thresholds for quality indicators
const HEALTH_THRESHOLDS = {
  bitrate: {
    excellent: 6000, // kbps
    good: 4500,
    fair: 3000,
    poor: 1500,
  },
  frameRate: {
    excellent: 60,
    good: 30,
    fair: 24,
    poor: 15,
  },
  // Recommended minimum resolutions
  resolution: {
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 },
    '480p': { width: 854, height: 480 },
    '360p': { width: 640, height: 360 },
  },
};

// Cache keys
const CACHE_KEYS = {
  streamHealth: (streamId: string) => `stream:health:${streamId}`,
  viewerHistory: (streamId: string) => `stream:viewers:history:${streamId}`,
  chatMetrics: (streamId: string) => `stream:chat:metrics:${streamId}`,
};

export type HealthStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'unknown';

export interface StreamHealthMetrics {
  streamId: string;
  isLive: boolean;
  uptime: number; // seconds

  // Technical metrics
  bitrate?: number; // kbps
  frameRate?: number;
  resolution?: {
    width: number;
    height: number;
    label: string;
  };
  audioChannels?: number;
  audioSampleRate?: number;
  keyframeInterval?: number;

  // Health indicators
  overallHealth: HealthStatus;
  bitrateHealth: HealthStatus;
  frameRateHealth: HealthStatus;

  // Warnings and recommendations
  warnings: string[];
  recommendations: string[];

  // Last updated
  updatedAt: Date;
}

export interface ViewerEngagementMetrics {
  streamId: string;

  // Viewer counts
  currentViewers: number;
  peakViewers: number;
  totalUniqueViewers: number;

  // Viewer history (for charts)
  viewerHistory: Array<{
    timestamp: Date;
    count: number;
  }>;

  // Retention
  averageWatchDuration: number; // seconds
  retentionRate: number; // percentage still watching vs joined

  // Chat engagement
  chatMetrics: {
    totalMessages: number;
    messagesPerMinute: number;
    uniqueChatters: number;
    topChatters: Array<{
      userDid: string;
      handle?: string;
      messageCount: number;
    }>;
  };

  // Engagement score (0-100)
  engagementScore: number;
}

export interface StreamDashboard {
  health: StreamHealthMetrics;
  engagement: ViewerEngagementMetrics;
  stream: {
    id: string;
    title: string;
    category?: string;
    startedAt?: Date;
    status: string;
  };
}

export class LiveStreamHealthService {
  /**
   * Get comprehensive stream health metrics
   */
  async getStreamHealth(streamId: string): Promise<StreamHealthMetrics> {
    // Check cache first
    const cacheKey = CACHE_KEYS.streamHealth(streamId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Only use cache if less than 5 seconds old
        if (Date.now() - new Date(parsed.updatedAt).getTime() < 5000) {
          return parsed;
        }
      }
    } catch {
      // Cache miss, continue
    }

    // Get stream info
    const [stream] = await db
      .select()
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream) {
      return this.buildEmptyHealthMetrics(streamId);
    }

    const isLive = stream.status === 'live';
    const uptime = stream.startedAt
      ? Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000)
      : 0;

    // Get provider metrics if available
    let providerMetrics: Record<string, unknown> = {};
    if (isLive) {
      try {
        const provider = await getStreamingProvider();
        if ('getStreamMetrics' in provider && typeof provider.getStreamMetrics === 'function') {
          providerMetrics = await provider.getStreamMetrics(streamId) || {};
        }
      } catch {
        // Provider metrics unavailable
      }
    }

    // Build health metrics
    const bitrate = providerMetrics.ingestBitrate as number | undefined;
    const frameRate = providerMetrics.ingestFramerate as number | undefined;
    const videoWidth = providerMetrics.videoWidth as number | undefined;
    const videoHeight = providerMetrics.videoHeight as number | undefined;

    const bitrateHealth = this.calculateBitrateHealth(bitrate);
    const frameRateHealth = this.calculateFrameRateHealth(frameRate);
    const overallHealth = this.calculateOverallHealth(bitrateHealth, frameRateHealth);

    const warnings = this.generateWarnings(bitrate, frameRate, videoWidth, videoHeight);
    const recommendations = this.generateRecommendations(bitrate, frameRate, videoWidth, videoHeight);

    const metrics: StreamHealthMetrics = {
      streamId,
      isLive,
      uptime,
      bitrate,
      frameRate,
      resolution: videoWidth && videoHeight ? {
        width: videoWidth,
        height: videoHeight,
        label: this.getResolutionLabel(videoWidth, videoHeight),
      } : undefined,
      audioChannels: providerMetrics.audioChannels as number | undefined,
      audioSampleRate: providerMetrics.audioSampleRate as number | undefined,
      keyframeInterval: providerMetrics.keyframeInterval as number | undefined,
      overallHealth,
      bitrateHealth,
      frameRateHealth,
      warnings,
      recommendations,
      updatedAt: new Date(),
    };

    // Cache for 5 seconds
    try {
      await redis.setex(cacheKey, 5, JSON.stringify(metrics));
    } catch {
      // Cache write failed, continue
    }

    return metrics;
  }

  /**
   * Get viewer engagement metrics
   */
  async getViewerEngagement(streamId: string): Promise<ViewerEngagementMetrics> {
    // Get stream info
    const [stream] = await db
      .select()
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream) {
      return this.buildEmptyEngagementMetrics(streamId);
    }

    // Get viewer counts from stream
    const currentViewers = stream.viewerCount || 0;
    const peakViewers = stream.peakViewers || 0;

    // Get unique viewers
    const [viewerStats] = await db
      .select({
        uniqueViewers: sql<number>`COUNT(DISTINCT COALESCE(${streamViewers.userDid}, ${streamViewers.sessionId}))::int`,
        avgDuration: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(${streamViewers.leftAt}, NOW()) - ${streamViewers.joinedAt}))), 0)::int`,
      })
      .from(streamViewers)
      .where(eq(streamViewers.streamId, streamId));

    // Get viewer history (last 60 minutes, 1-minute intervals)
    const viewerHistory = await this.getViewerHistory(streamId);

    // Get chat metrics
    const chatMetrics = await this.getChatMetrics(streamId);

    // Calculate retention rate
    const [activeViewers] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(streamViewers)
      .where(
        and(
          eq(streamViewers.streamId, streamId),
          sql`${streamViewers.leftAt} IS NULL`
        )
      );

    const totalJoined = viewerStats?.uniqueViewers || 0;
    const stillWatching = activeViewers?.count || currentViewers;
    const retentionRate = totalJoined > 0 ? Math.round((stillWatching / totalJoined) * 100) : 100;

    // Calculate engagement score
    const engagementScore = this.calculateEngagementScore(
      currentViewers,
      chatMetrics.messagesPerMinute,
      chatMetrics.uniqueChatters,
      retentionRate
    );

    return {
      streamId,
      currentViewers,
      peakViewers,
      totalUniqueViewers: viewerStats?.uniqueViewers || 0,
      viewerHistory,
      averageWatchDuration: viewerStats?.avgDuration || 0,
      retentionRate,
      chatMetrics,
      engagementScore,
    };
  }

  /**
   * Get full stream dashboard (health + engagement)
   */
  async getStreamDashboard(streamId: string): Promise<StreamDashboard> {
    const [stream] = await db
      .select({
        id: liveStreams.id,
        title: liveStreams.title,
        category: liveStreams.category,
        startedAt: liveStreams.startedAt,
        status: liveStreams.status,
      })
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream) {
      throw new Error('Stream not found');
    }

    const [health, engagement] = await Promise.all([
      this.getStreamHealth(streamId),
      this.getViewerEngagement(streamId),
    ]);

    return {
      health,
      engagement,
      stream: {
        id: stream.id,
        title: stream.title,
        category: stream.category || undefined,
        startedAt: stream.startedAt || undefined,
        status: stream.status,
      },
    };
  }

  /**
   * Record viewer count snapshot (call periodically)
   */
  async recordViewerSnapshot(streamId: string, viewerCount: number): Promise<void> {
    const cacheKey = CACHE_KEYS.viewerHistory(streamId);
    const timestamp = new Date().toISOString();

    try {
      // Store as sorted set with timestamp as score
      const score = Date.now();
      const member = JSON.stringify({ timestamp, count: viewerCount });

      // Use Redis ZADD to add to sorted set
      const multi = (redis as any).multi?.();
      if (multi) {
        multi.zadd(cacheKey, score, member);
        // Keep only last 60 minutes of data
        multi.zremrangebyscore(cacheKey, 0, Date.now() - 60 * 60 * 1000);
        multi.expire(cacheKey, 3600); // Expire after 1 hour
        await multi.exec();
      } else {
        // Fallback for in-memory cache
        const existing = await redis.get(cacheKey);
        const history = existing ? JSON.parse(existing) : [];
        history.push({ timestamp, count: viewerCount });
        // Keep last 60 entries
        const trimmed = history.slice(-60);
        await redis.setex(cacheKey, 3600, JSON.stringify(trimmed));
      }
    } catch {
      // Snapshot recording failed, continue
    }
  }

  // ============================================
  // Private helper methods
  // ============================================

  private calculateBitrateHealth(bitrate?: number): HealthStatus {
    if (bitrate === undefined) return 'unknown';
    if (bitrate >= HEALTH_THRESHOLDS.bitrate.excellent) return 'excellent';
    if (bitrate >= HEALTH_THRESHOLDS.bitrate.good) return 'good';
    if (bitrate >= HEALTH_THRESHOLDS.bitrate.fair) return 'fair';
    if (bitrate >= HEALTH_THRESHOLDS.bitrate.poor) return 'poor';
    return 'critical';
  }

  private calculateFrameRateHealth(frameRate?: number): HealthStatus {
    if (frameRate === undefined) return 'unknown';
    if (frameRate >= HEALTH_THRESHOLDS.frameRate.excellent) return 'excellent';
    if (frameRate >= HEALTH_THRESHOLDS.frameRate.good) return 'good';
    if (frameRate >= HEALTH_THRESHOLDS.frameRate.fair) return 'fair';
    if (frameRate >= HEALTH_THRESHOLDS.frameRate.poor) return 'poor';
    return 'critical';
  }

  private calculateOverallHealth(bitrateHealth: HealthStatus, frameRateHealth: HealthStatus): HealthStatus {
    const statusOrder: HealthStatus[] = ['critical', 'poor', 'fair', 'good', 'excellent', 'unknown'];
    const bitrateIndex = statusOrder.indexOf(bitrateHealth);
    const frameRateIndex = statusOrder.indexOf(frameRateHealth);

    // Return the worse of the two (lower index = worse)
    const worstIndex = Math.min(bitrateIndex, frameRateIndex);
    return statusOrder[worstIndex] || 'unknown';
  }

  private generateWarnings(
    bitrate?: number,
    frameRate?: number,
    width?: number,
    height?: number
  ): string[] {
    const warnings: string[] = [];

    if (bitrate !== undefined && bitrate < HEALTH_THRESHOLDS.bitrate.poor) {
      warnings.push(`Low bitrate detected (${bitrate} kbps). Viewers may experience buffering.`);
    }

    if (frameRate !== undefined && frameRate < HEALTH_THRESHOLDS.frameRate.poor) {
      warnings.push(`Low frame rate detected (${frameRate} fps). Video may appear choppy.`);
    }

    if (width && height && height < 480) {
      warnings.push(`Low resolution detected (${width}x${height}). Consider streaming at 720p or higher.`);
    }

    return warnings;
  }

  private generateRecommendations(
    bitrate?: number,
    frameRate?: number,
    width?: number,
    height?: number
  ): string[] {
    const recommendations: string[] = [];

    if (bitrate !== undefined && bitrate < HEALTH_THRESHOLDS.bitrate.good) {
      const target = HEALTH_THRESHOLDS.bitrate.good;
      recommendations.push(`Increase bitrate to at least ${target} kbps for better quality.`);
    }

    if (frameRate !== undefined && frameRate < 30) {
      recommendations.push('Consider streaming at 30 fps for smoother video.');
    }

    if (width && height) {
      if (height < 720) {
        recommendations.push('Stream at 720p (1280x720) for optimal viewer experience.');
      } else if (height >= 1080 && bitrate && bitrate < 6000) {
        recommendations.push('For 1080p streaming, use at least 6000 kbps bitrate.');
      }
    }

    if (recommendations.length === 0 && bitrate && frameRate) {
      recommendations.push('Stream quality looks good! Keep it up.');
    }

    return recommendations;
  }

  private getResolutionLabel(width: number, height: number): string {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return `${width}x${height}`;
  }

  private async getViewerHistory(streamId: string): Promise<Array<{ timestamp: Date; count: number }>> {
    const cacheKey = CACHE_KEYS.viewerHistory(streamId);

    try {
      // Try to get from Redis sorted set
      const data = await redis.get(cacheKey);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.map((item: { timestamp: string; count: number }) => ({
            timestamp: new Date(item.timestamp),
            count: item.count,
          }));
        }
      }
    } catch {
      // Cache miss
    }

    // Return empty history if no cached data
    return [];
  }

  private async getChatMetrics(streamId: string): Promise<ViewerEngagementMetrics['chatMetrics']> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Get total messages and unique chatters
    const [chatStats] = await db
      .select({
        totalMessages: sql<number>`COUNT(*)::int`,
        uniqueChatters: sql<number>`COUNT(DISTINCT ${streamChat.userDid})::int`,
      })
      .from(streamChat)
      .where(eq(streamChat.streamId, streamId));

    // Get recent messages for rate calculation
    const [recentStats] = await db
      .select({
        recentCount: sql<number>`COUNT(*)::int`,
      })
      .from(streamChat)
      .where(
        and(
          eq(streamChat.streamId, streamId),
          gte(streamChat.createdAt, fiveMinutesAgo)
        )
      );

    // Get top chatters
    const topChatters = await db
      .select({
        userDid: streamChat.userDid,
        messageCount: sql<number>`COUNT(*)::int`,
      })
      .from(streamChat)
      .where(eq(streamChat.streamId, streamId))
      .groupBy(streamChat.userDid)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5);

    const messagesPerMinute = (recentStats?.recentCount || 0) / 5;

    return {
      totalMessages: chatStats?.totalMessages || 0,
      messagesPerMinute: Math.round(messagesPerMinute * 10) / 10,
      uniqueChatters: chatStats?.uniqueChatters || 0,
      topChatters: topChatters.map(c => ({
        userDid: c.userDid,
        messageCount: c.messageCount,
      })),
    };
  }

  private calculateEngagementScore(
    viewers: number,
    messagesPerMinute: number,
    uniqueChatters: number,
    retentionRate: number
  ): number {
    // Engagement score formula:
    // - Chat activity: 40% weight
    // - Chatter ratio (chatters/viewers): 30% weight
    // - Retention rate: 30% weight

    let score = 0;

    // Chat activity score (0-40 points)
    // 5+ messages/min = full score
    const chatActivityScore = Math.min(messagesPerMinute / 5, 1) * 40;
    score += chatActivityScore;

    // Chatter ratio score (0-30 points)
    // 20%+ chatters = full score
    const chatterRatio = viewers > 0 ? uniqueChatters / viewers : 0;
    const chatterScore = Math.min(chatterRatio / 0.2, 1) * 30;
    score += chatterScore;

    // Retention score (0-30 points)
    const retentionScore = (retentionRate / 100) * 30;
    score += retentionScore;

    return Math.round(score);
  }

  private buildEmptyHealthMetrics(streamId: string): StreamHealthMetrics {
    return {
      streamId,
      isLive: false,
      uptime: 0,
      overallHealth: 'unknown',
      bitrateHealth: 'unknown',
      frameRateHealth: 'unknown',
      warnings: [],
      recommendations: [],
      updatedAt: new Date(),
    };
  }

  private buildEmptyEngagementMetrics(streamId: string): ViewerEngagementMetrics {
    return {
      streamId,
      currentViewers: 0,
      peakViewers: 0,
      totalUniqueViewers: 0,
      viewerHistory: [],
      averageWatchDuration: 0,
      retentionRate: 0,
      chatMetrics: {
        totalMessages: 0,
        messagesPerMinute: 0,
        uniqueChatters: 0,
        topChatters: [],
      },
      engagementScore: 0,
    };
  }
}

// Singleton instance
let liveStreamHealthService: LiveStreamHealthService | null = null;

export function getLiveStreamHealthService(): LiveStreamHealthService {
  if (!liveStreamHealthService) {
    liveStreamHealthService = new LiveStreamHealthService();
  }
  return liveStreamHealthService;
}
