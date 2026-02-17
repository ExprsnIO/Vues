const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export interface VideoView {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    verified?: boolean;
  };
  video: {
    thumbnail?: string;
    aspectRatio: { width: number; height: number };
    duration: number;
    cdnUrl?: string;
    hlsPlaylist?: string;
  };
  caption?: string;
  tags?: string[];
  // Legacy flat fields for backwards compatibility
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
  indexedAt: string;
  viewerLike?: string;
  viewer?: {
    liked?: boolean;
    likeUri?: string;
  };
}

export interface FeedResponse {
  feed: VideoView[];
  cursor?: string;
}

export type ReactionType = 'like' | 'love' | 'dislike';
export type CommentSortType = 'top' | 'recent' | 'hot';

export interface CommentView {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text: string;
  parentUri?: string;
  likeCount: number;
  loveCount: number;
  dislikeCount: number;
  replyCount: number;
  hotScore: number;
  createdAt: string;
  viewer?: {
    reaction?: ReactionType;
  };
  replies?: CommentView[];
}

export interface CommentsResponse {
  comments: CommentView[];
  cursor?: string;
}

class ApiClient {
  private baseUrl: string;
  private sessionToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setSession(token: string | null) {
    this.sessionToken = token;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.sessionToken) {
      (headers as Record<string, string>)['Authorization'] =
        `Bearer ${this.sessionToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
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

  async getComments(
    uri: string,
    options: { cursor?: string; limit?: number; sort?: CommentSortType } = {}
  ): Promise<CommentsResponse> {
    const { cursor, limit = 50, sort = 'top' } = options;
    const params = new URLSearchParams({ uri, limit: String(limit), sort });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getComments?${params}`);
  }

  async getCommentReplies(
    parentUri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<CommentsResponse> {
    const { cursor, limit = 20 } = options;
    const params = new URLSearchParams({ parentUri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getCommentReplies?${params}`);
  }

  async createComment(
    videoUri: string,
    text: string,
    parentUri?: string
  ): Promise<{ uri: string; cid: string }> {
    return this.fetch('/xrpc/io.exprsn.video.createComment', {
      method: 'POST',
      body: JSON.stringify({ videoUri, text, parentUri }),
    });
  }

  async deleteComment(uri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.deleteComment', {
      method: 'POST',
      body: JSON.stringify({ uri }),
    });
  }

  async reactToComment(
    commentUri: string,
    reactionType: ReactionType
  ): Promise<{ success: boolean; reactionType: ReactionType }> {
    return this.fetch('/xrpc/io.exprsn.video.reactToComment', {
      method: 'POST',
      body: JSON.stringify({ commentUri, reactionType }),
    });
  }

  async unreactToComment(commentUri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.unreactToComment', {
      method: 'POST',
      body: JSON.stringify({ commentUri }),
    });
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

  async comment(videoUri: string, text: string): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.comment', {
      method: 'POST',
      body: JSON.stringify({ videoUri, text }),
    });
  }

  async trackView(videoUri: string): Promise<void> {
    return this.fetch('/xrpc/io.exprsn.video.trackView', {
      method: 'POST',
      body: JSON.stringify({ videoUri }),
    });
  }

  async search(
    query: string,
    type: 'videos' | 'users' | 'sounds' = 'videos',
    cursor?: string
  ): Promise<{ results: unknown[]; cursor?: string }> {
    const params = new URLSearchParams({ q: query, type });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.search?${params}`);
  }

  async getUploadUrl(contentType: string): Promise<{
    uploadId: string;
    uploadUrl: string;
    expiresAt: string;
  }> {
    return this.fetch('/xrpc/io.exprsn.video.uploadVideo', {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    });
  }

  async completeUpload(uploadId: string): Promise<{ status: string }> {
    return this.fetch('/xrpc/io.exprsn.video.completeUpload', {
      method: 'POST',
      body: JSON.stringify({ uploadId }),
    });
  }

  async getUploadStatus(
    uploadId: string
  ): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    cdnUrl?: string;
    hlsPlaylist?: string;
    thumbnail?: string;
    error?: string;
  }> {
    const params = new URLSearchParams({ uploadId });
    return this.fetch(`/xrpc/io.exprsn.video.getUploadStatus?${params}`);
  }

  async createPost(data: {
    uploadId: string;
    caption?: string;
    tags?: string[];
    soundUri?: string;
    visibility?: 'public' | 'followers';
    aspectRatio: { width: number; height: number };
    duration: number;
  }): Promise<{ uri: string; cid: string }> {
    return this.fetch('/xrpc/io.exprsn.video.createPost', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Settings API
  async getSettings(): Promise<{ settings: import('@exprsn/shared').UserSettings }> {
    return this.fetch('/xrpc/io.exprsn.settings.getSettings');
  }

  async updateSettings(
    update: import('@exprsn/shared').UserSettingsUpdate
  ): Promise<{ settings: import('@exprsn/shared').UserSettings }> {
    return this.fetch('/xrpc/io.exprsn.settings.updateSettings', {
      method: 'POST',
      body: JSON.stringify(update),
    });
  }

  async resetSettings(): Promise<{ settings: import('@exprsn/shared').UserSettings }> {
    return this.fetch('/xrpc/io.exprsn.settings.resetSettings', {
      method: 'POST',
    });
  }

  // Profile & Graph API
  async getProfile(handleOrDid: string): Promise<ProfileResponse> {
    const param = handleOrDid.startsWith('did:') ? 'did' : 'handle';
    const params = new URLSearchParams({ [param]: handleOrDid });
    return this.fetch(`/xrpc/io.exprsn.actor.getProfile?${params}`);
  }

  async getProfileVideos(
    handleOrDid: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ videos: VideoView[]; cursor?: string }> {
    const param = handleOrDid.startsWith('did:') ? 'did' : 'handle';
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ [param]: handleOrDid, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.actor.getVideos?${params}`);
  }

  async follow(did: string): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.graph.follow', {
      method: 'POST',
      body: JSON.stringify({ did }),
    });
  }

  async unfollow(options: { uri?: string; did?: string }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.graph.unfollow', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async getFollowers(
    handleOrDid: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<FollowersResponse> {
    const param = handleOrDid.startsWith('did:') ? 'did' : 'handle';
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ [param]: handleOrDid, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.graph.getFollowers?${params}`);
  }

  async getFollowing(
    handleOrDid: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<FollowingResponse> {
    const param = handleOrDid.startsWith('did:') ? 'did' : 'handle';
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ [param]: handleOrDid, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.graph.getFollowing?${params}`);
  }
}

// Profile types
export interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  followerCount: number;
  followingCount: number;
  videoCount: number;
  verified: boolean;
  createdAt: string;
  viewer?: {
    following: boolean;
    followUri?: string;
  };
}

export interface ProfileResponse {
  profile: ProfileView;
  videos: VideoView[];
}

export interface UserListItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  verified?: boolean;
  viewer?: {
    following: boolean;
    followUri?: string;
  };
}

export interface FollowersResponse {
  followers: UserListItem[];
  cursor?: string;
}

export interface FollowingResponse {
  following: UserListItem[];
  cursor?: string;
}

export const api = new ApiClient(API_BASE);
