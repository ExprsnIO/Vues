import { getSession } from './auth';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface VideoView {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  caption?: string;
  tags?: string[];
  cdnUrl?: string;
  hlsPlaylist?: string;
  thumbnailUrl?: string;
  duration?: number;
  aspectRatio?: { width: number; height: number };
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  viewer?: {
    liked?: boolean;
    likeUri?: string;
  };
}

export interface FeedResponse {
  feed: VideoView[];
  cursor?: string;
}

class ApiClient {
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const session = await getSession();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (session?.accessToken) {
      (headers as Record<string, string>)['Authorization'] =
        `Bearer ${session.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  async getFeed(
    feed: string = 'trending',
    cursor?: string,
    limit: number = 20
  ): Promise<FeedResponse> {
    const params = new URLSearchParams({ feed, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getFeed?${params}`);
  }

  async getVideo(uri: string): Promise<{ video: VideoView }> {
    const params = new URLSearchParams({ uri });
    return this.fetch(`/xrpc/io.exprsn.video.getVideo?${params}`);
  }

  async like(uri: string, cid: string): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.like', {
      method: 'POST',
      body: JSON.stringify({ uri, cid }),
    });
  }

  async unlike(likeUri: string): Promise<void> {
    return this.fetch('/xrpc/io.exprsn.video.unlike', {
      method: 'POST',
      body: JSON.stringify({ uri: likeUri }),
    });
  }

  async trackView(uri: string): Promise<void> {
    return this.fetch('/xrpc/io.exprsn.video.trackView', {
      method: 'POST',
      body: JSON.stringify({ uri }),
    });
  }

  async search(
    query: string,
    type: 'videos' | 'users' | 'sounds' = 'videos'
  ): Promise<{ results: unknown[] }> {
    const params = new URLSearchParams({ q: query, type });
    return this.fetch(`/xrpc/io.exprsn.video.search?${params}`);
  }
}

export const api = new ApiClient();
