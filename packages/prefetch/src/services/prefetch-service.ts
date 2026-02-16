import { TieredCache } from '../cache/tiered-cache.js';
import { PrefetchQueue, PrefetchJob, VideoPrefetchJob } from '../queues/prefetch-queue.js';

/**
 * Timeline data structure
 */
export interface TimelineData {
  posts: Array<{
    uri: string;
    cid: string;
    authorDid: string;
  }>;
  cursor?: string;
  fetchedAt: number;
}

/**
 * Prefetch service configuration
 */
export interface PrefetchServiceConfig {
  timelineServiceUrl: string;
  authToken?: string;
  defaultLimit: number;
}

/**
 * Prefetch result
 */
export interface PrefetchResult {
  success: boolean;
  cached: boolean;
  tier?: string;
  postsCount?: number;
  duration: number;
  error?: string;
}

/**
 * Prefetch service
 *
 * Handles fetching and caching of timelines and video segments
 */
export class PrefetchService {
  constructor(
    private cache: TieredCache,
    private config: PrefetchServiceConfig
  ) {}

  /**
   * Get cache key for a user's timeline
   */
  private getTimelineCacheKey(userId: string): string {
    return `timeline:${userId}`;
  }

  /**
   * Get cache key for video segments
   */
  private getVideoSegmentCacheKey(videoUri: string, segmentIndex: number): string {
    return `video:segment:${videoUri}:${segmentIndex}`;
  }

  /**
   * Prefetch a user's timeline
   */
  async prefetchTimeline(
    userId: string,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<PrefetchResult> {
    const startTime = Date.now();
    const cacheKey = this.getTimelineCacheKey(userId);

    // Check if already cached
    const cached = await this.cache.exists(cacheKey);
    if (cached.exists) {
      return {
        success: true,
        cached: true,
        tier: cached.tier,
        duration: Date.now() - startTime,
      };
    }

    try {
      // Fetch from timeline service
      const timeline = await this.fetchTimelineFromService(userId);

      // Determine cache tier based on priority
      const tier = priority === 'high' ? 'hot' : priority === 'medium' ? 'warm' : 'cold';

      // Cache the timeline
      await this.cache.set(cacheKey, timeline, tier);

      return {
        success: true,
        cached: false,
        tier,
        postsCount: timeline.posts.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a user's timeline from cache
   */
  async getTimeline(userId: string): Promise<TimelineData | null> {
    const cacheKey = this.getTimelineCacheKey(userId);
    const result = await this.cache.get<TimelineData>(cacheKey);
    return result?.data ?? null;
  }

  /**
   * Invalidate a user's timeline cache
   */
  async invalidateTimeline(userId: string): Promise<void> {
    const cacheKey = this.getTimelineCacheKey(userId);
    await this.cache.invalidate(cacheKey);
  }

  /**
   * Warm cache for multiple users
   */
  async warmCache(userIds: string[]): Promise<{
    success: number;
    failed: number;
  }> {
    let success = 0;
    let failed = 0;

    for (const userId of userIds) {
      const result = await this.prefetchTimeline(userId, 'low');
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Prefetch video segments
   */
  async prefetchVideoSegments(job: VideoPrefetchJob): Promise<{
    success: number;
    failed: number;
  }> {
    let success = 0;
    let failed = 0;

    // Parse HLS playlist to get segment URLs
    const segments = await this.parseHlsPlaylist(job.hlsPlaylist);

    for (const segmentIndex of job.segmentsToFetch) {
      if (segmentIndex >= segments.length) continue;

      const cacheKey = this.getVideoSegmentCacheKey(job.videoUri, segmentIndex);

      // Check if already cached
      const cached = await this.cache.exists(cacheKey);
      if (cached.exists) {
        success++;
        continue;
      }

      try {
        // Fetch segment
        const segmentUrl = segments[segmentIndex];
        const segmentData = await this.fetchSegment(segmentUrl);

        // Cache in hot tier (ArrayBuffer uses byteLength, not length)
        await this.cache.set(cacheKey, { url: segmentUrl, size: segmentData.byteLength }, 'hot');
        success++;
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Fetch timeline from external service
   */
  private async fetchTimelineFromService(userId: string): Promise<TimelineData> {
    const url = `${this.config.timelineServiceUrl}/api/timeline?userId=${userId}&limit=${this.config.defaultLimit}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Timeline service error: ${response.status}`);
    }

    const data = await response.json() as { posts?: unknown[]; feed?: unknown[]; cursor?: string };

    return {
      posts: (data.posts || data.feed || []) as TimelineData['posts'],
      cursor: data.cursor,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Parse HLS playlist to get segment URLs
   */
  private async parseHlsPlaylist(playlistUrl: string): Promise<string[]> {
    const response = await fetch(playlistUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch playlist: ${response.status}`);
    }

    const content = await response.text();
    const lines = content.split('\n');
    const segments: string[] = [];

    // Parse .ts segment URLs from m3u8
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // Convert relative URLs to absolute
        if (trimmed.startsWith('http')) {
          segments.push(trimmed);
        } else {
          const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
          segments.push(baseUrl + trimmed);
        }
      }
    }

    return segments;
  }

  /**
   * Fetch a video segment
   */
  private async fetchSegment(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch segment: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    cache: boolean;
    timelineService: boolean;
  }> {
    let cacheHealthy = false;
    let serviceHealthy = false;

    // Check cache
    try {
      await this.cache.set('health:check', { ts: Date.now() }, 'hot');
      const result = await this.cache.get('health:check');
      cacheHealthy = result !== null;
    } catch {
      cacheHealthy = false;
    }

    // Check timeline service
    try {
      const response = await fetch(`${this.config.timelineServiceUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      serviceHealthy = response.ok;
    } catch {
      serviceHealthy = false;
    }

    return {
      healthy: cacheHealthy && serviceHealthy,
      cache: cacheHealthy,
      timelineService: serviceHealthy,
    };
  }
}

/**
 * Create a prefetch service
 */
export function createPrefetchService(
  cache: TieredCache,
  config: PrefetchServiceConfig
): PrefetchService {
  return new PrefetchService(cache, config);
}
