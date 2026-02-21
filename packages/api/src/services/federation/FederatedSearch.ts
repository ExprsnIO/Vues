import { ServiceAuth } from './ServiceAuth.js';
import { ServiceRegistry, ServiceInfo } from '../registry/ServiceRegistry.js';

/**
 * Search query parameters
 */
export interface SearchQuery {
  q: string;
  collection?: string;
  limit?: number;
  cursor?: string;
  sort?: 'relevance' | 'recent' | 'popular';
  filters?: {
    author?: string;
    since?: string;
    until?: string;
    tags?: string[];
  };
}

/**
 * Search result from a single server
 */
export interface SearchResult {
  uri: string;
  cid: string;
  collection: string;
  record: unknown;
  author: {
    did: string;
    handle?: string;
    displayName?: string;
    avatar?: string;
  };
  indexedAt: string;
  score?: number;
  highlights?: {
    field: string;
    snippets: string[];
  }[];
}

/**
 * Federated search result aggregating multiple servers
 */
export interface FederatedSearchResult {
  results: SearchResult[];
  totalCount: number;
  cursor?: string;
  sources: {
    endpoint: string;
    count: number;
    latencyMs: number;
    error?: string;
  }[];
  queryTimeMs: number;
}

/**
 * Trending result
 */
export interface TrendingResult {
  uri: string;
  collection: string;
  record: unknown;
  author: {
    did: string;
    handle?: string;
  };
  score: number;
  velocity: number;
  source: string;
}

/**
 * Federated search configuration
 */
export interface FederatedSearchConfig {
  serviceRegistry: ServiceRegistry;
  serviceAuth?: ServiceAuth;
  certificateId?: string;
  privateKey?: string;
  timeoutMs?: number;
  maxResultsPerServer?: number;
}

/**
 * Federated search across multiple appview servers
 */
export class FederatedSearch {
  private serviceRegistry: ServiceRegistry;
  private serviceAuth: ServiceAuth | null;
  private certificateId: string | null;
  private privateKey: string | null;
  private timeoutMs: number;
  private maxResultsPerServer: number;

  constructor(config: FederatedSearchConfig) {
    this.serviceRegistry = config.serviceRegistry;
    this.serviceAuth = config.serviceAuth || null;
    this.certificateId = config.certificateId || null;
    this.privateKey = config.privateKey || null;
    this.timeoutMs = config.timeoutMs || 5000;
    this.maxResultsPerServer = config.maxResultsPerServer || 50;
  }

  /**
   * Search across all federated appviews
   */
  async search(query: SearchQuery): Promise<FederatedSearchResult> {
    const startTime = Date.now();

    // Get active appview endpoints
    const appviews = await this.serviceRegistry.getHealthyServices('appview');

    // Query all appviews in parallel
    const serverResults = await Promise.allSettled(
      appviews.map((appview) => this.searchServer(appview, query))
    );

    // Aggregate results
    const allResults: SearchResult[] = [];
    const sources: FederatedSearchResult['sources'] = [];
    const seenUris = new Set<string>();

    for (let i = 0; i < serverResults.length; i++) {
      const appview = appviews[i];
      const result = serverResults[i];
      if (!appview || !result) continue;

      if (result.status === 'fulfilled') {
        sources.push({
          endpoint: appview.endpoint,
          count: result.value.results.length,
          latencyMs: result.value.latencyMs,
        });

        // Deduplicate by URI
        for (const item of result.value.results) {
          if (!seenUris.has(item.uri)) {
            seenUris.add(item.uri);
            allResults.push(item);
          }
        }
      } else {
        sources.push({
          endpoint: appview.endpoint,
          count: 0,
          latencyMs: this.timeoutMs,
          error: result.reason?.message || 'Unknown error',
        });
      }
    }

    // Sort results
    this.sortResults(allResults, query.sort || 'relevance');

    // Apply limit
    const limit = query.limit || 25;
    const limitedResults = allResults.slice(0, limit);

    // Generate cursor if more results available
    const cursor = allResults.length > limit
      ? Buffer.from(JSON.stringify({
          offset: limit,
          timestamp: Date.now(),
        })).toString('base64')
      : undefined;

    return {
      results: limitedResults,
      totalCount: allResults.length,
      cursor,
      sources,
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get trending content across federation
   */
  async getTrending(options: {
    collection?: string;
    limit?: number;
    timeRange?: '1h' | '6h' | '24h' | '7d';
  } = {}): Promise<TrendingResult[]> {
    const { collection, limit = 50, timeRange = '24h' } = options;

    // Get active appview endpoints
    const appviews = await this.serviceRegistry.getHealthyServices('appview');

    // Query all appviews in parallel
    const serverResults = await Promise.allSettled(
      appviews.map((appview) => this.getTrendingFromServer(appview, { collection, limit, timeRange }))
    );

    // Aggregate and deduplicate results
    const allResults: TrendingResult[] = [];
    const seenUris = new Set<string>();
    const uriScores = new Map<string, number>();

    for (let i = 0; i < serverResults.length; i++) {
      const result = serverResults[i];
      if (!result) continue;

      if (result.status === 'fulfilled') {
        for (const item of result.value) {
          if (seenUris.has(item.uri)) {
            // Boost score for items appearing in multiple servers
            const existingIdx = allResults.findIndex((r) => r.uri === item.uri);
            const existing = allResults[existingIdx];
            if (existingIdx >= 0 && existing) {
              existing.score += item.score * 0.5;
            }
          } else {
            seenUris.add(item.uri);
            allResults.push(item);
          }
        }
      }
    }

    // Sort by score
    allResults.sort((a, b) => b.score - a.score);

    // Apply limit
    return allResults.slice(0, limit);
  }

  /**
   * Discover users across federation
   */
  async discoverUsers(options: {
    query?: string;
    limit?: number;
    suggestions?: boolean;
  } = {}): Promise<{
    users: Array<{
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
      bio?: string;
      followerCount?: number;
      source: string;
    }>;
    queryTimeMs: number;
  }> {
    const startTime = Date.now();
    const { query, limit = 25, suggestions = false } = options;

    const appviews = await this.serviceRegistry.getHealthyServices('appview');

    const endpoint = suggestions
      ? '/xrpc/io.exprsn.actor.getSuggestions'
      : '/xrpc/io.exprsn.actor.searchActors';

    const serverResults = await Promise.allSettled(
      appviews.map(async (appview) => {
        const url = new URL(appview.endpoint + endpoint);
        if (query) url.searchParams.set('q', query);
        url.searchParams.set('limit', limit.toString());

        const response = await this.fetchWithTimeout(url.toString(), appview);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
          actors: Array<{
            did: string;
            handle: string;
            displayName?: string;
            avatar?: string;
            description?: string;
            followersCount?: number;
          }>;
        };

        return data.actors.map((a) => ({
          did: a.did,
          handle: a.handle,
          displayName: a.displayName,
          avatar: a.avatar,
          bio: a.description,
          followerCount: a.followersCount,
          source: appview.endpoint,
        }));
      })
    );

    // Deduplicate by DID
    const seenDids = new Set<string>();
    const users: Array<{
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
      bio?: string;
      followerCount?: number;
      source: string;
    }> = [];

    for (const result of serverResults) {
      if (result.status === 'fulfilled') {
        for (const user of result.value) {
          if (!seenDids.has(user.did)) {
            seenDids.add(user.did);
            users.push(user);
          }
        }
      }
    }

    return {
      users: users.slice(0, limit),
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Search a single server
   */
  private async searchServer(
    appview: ServiceInfo,
    query: SearchQuery
  ): Promise<{ results: SearchResult[]; latencyMs: number }> {
    const startTime = Date.now();

    const url = new URL(`${appview.endpoint}/xrpc/io.exprsn.feed.searchVideos`);
    url.searchParams.set('q', query.q);
    if (query.collection) url.searchParams.set('collection', query.collection);
    url.searchParams.set('limit', (query.limit || this.maxResultsPerServer).toString());
    if (query.cursor) url.searchParams.set('cursor', query.cursor);
    if (query.sort) url.searchParams.set('sort', query.sort);
    if (query.filters?.author) url.searchParams.set('author', query.filters.author);
    if (query.filters?.since) url.searchParams.set('since', query.filters.since);
    if (query.filters?.until) url.searchParams.set('until', query.filters.until);
    if (query.filters?.tags) url.searchParams.set('tags', query.filters.tags.join(','));

    const response = await this.fetchWithTimeout(url.toString(), appview);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      videos: Array<{
        uri: string;
        cid: string;
        record: unknown;
        author: {
          did: string;
          handle?: string;
          displayName?: string;
          avatar?: string;
        };
        indexedAt: string;
      }>;
    };

    return {
      results: data.videos.map((v) => ({
        uri: v.uri,
        cid: v.cid,
        collection: 'io.exprsn.feed.video',
        record: v.record,
        author: v.author,
        indexedAt: v.indexedAt,
      })),
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Get trending from a single server
   */
  private async getTrendingFromServer(
    appview: ServiceInfo,
    options: { collection?: string; limit: number; timeRange: string }
  ): Promise<TrendingResult[]> {
    const url = new URL(`${appview.endpoint}/xrpc/io.exprsn.feed.getTrending`);
    url.searchParams.set('limit', options.limit.toString());
    url.searchParams.set('timeRange', options.timeRange);
    if (options.collection) url.searchParams.set('collection', options.collection);

    const response = await this.fetchWithTimeout(url.toString(), appview);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      feed: Array<{
        post: {
          uri: string;
          record: unknown;
          author: { did: string; handle?: string };
        };
        score?: number;
        velocity?: number;
      }>;
    };

    return data.feed.map((item) => ({
      uri: item.post.uri,
      collection: 'io.exprsn.feed.video',
      record: item.post.record,
      author: item.post.author,
      score: item.score || 0,
      velocity: item.velocity || 0,
      source: appview.endpoint,
    }));
  }

  /**
   * Sort results based on sort type
   */
  private sortResults(results: SearchResult[], sort: 'relevance' | 'recent' | 'popular'): void {
    switch (sort) {
      case 'recent':
        results.sort((a, b) =>
          new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime()
        );
        break;
      case 'popular':
        results.sort((a, b) => (b.score || 0) - (a.score || 0));
        break;
      case 'relevance':
      default:
        // Keep original order (relevance from search)
        break;
    }
  }

  /**
   * Fetch with timeout and optional auth
   */
  private async fetchWithTimeout(url: string, appview: ServiceInfo): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // Add auth headers if configured
    if (this.serviceAuth && this.certificateId && this.privateKey) {
      try {
        const urlObj = new URL(url);
        const authHeaders = await this.serviceAuth.createAuthHeaders(
          this.certificateId,
          this.privateKey,
          'GET',
          urlObj.pathname + urlObj.search
        );
        Object.assign(headers, authHeaders);
      } catch {
        // Continue without auth
      }
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default FederatedSearch;
