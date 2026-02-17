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
  private devAdminMode: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setSession(token: string | null) {
    this.sessionToken = token;
  }

  setDevAdminMode(enabled: boolean) {
    this.devAdminMode = enabled;
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

    // Dev admin bypass header
    if (this.devAdminMode) {
      (headers as Record<string, string>)['X-Dev-Admin'] = 'true';
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

  // Admin API
  async getAdminSession(): Promise<AdminSession> {
    return this.fetch('/xrpc/io.exprsn.admin.getSession');
  }

  async getAdminDashboard(): Promise<AdminDashboard> {
    return this.fetch('/xrpc/io.exprsn.admin.analytics.dashboard');
  }

  async getAdminUsers(options: {
    q?: string;
    verified?: string;
    sort?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<AdminUsersResponse> {
    const params = new URLSearchParams();
    if (options.q) params.set('q', options.q);
    if (options.verified) params.set('verified', options.verified);
    if (options.sort) params.set('sort', options.sort);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.users.list?${params}`);
  }

  async getAdminUser(did: string): Promise<AdminUserDetail> {
    const params = new URLSearchParams({ did });
    return this.fetch(`/xrpc/io.exprsn.admin.users.get?${params}`);
  }

  async updateAdminUser(data: {
    did: string;
    verified?: boolean;
    displayName?: string;
    bio?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.users.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async sanctionUser(data: {
    userDid: string;
    sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
    reason: string;
    expiresAt?: string;
  }): Promise<{ success: boolean; sanctionId: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.users.sanction', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAdminReports(options: {
    status?: string;
    contentType?: string;
    reason?: string;
    limit?: number;
  } = {}): Promise<AdminReportsResponse> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.contentType) params.set('contentType', options.contentType);
    if (options.reason) params.set('reason', options.reason);
    if (options.limit) params.set('limit', String(options.limit));
    return this.fetch(`/xrpc/io.exprsn.admin.reports.list?${params}`);
  }

  async actionAdminReport(data: {
    reportId: string;
    action: string;
    reason: string;
  }): Promise<{ success: boolean; actionId: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.reports.action', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async dismissAdminReport(data: { reportId: string; reason?: string }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.reports.dismiss', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin team management
  async getAdminTeam(): Promise<{ admins: AdminTeamMember[] }> {
    return this.fetch('/xrpc/io.exprsn.admin.admins.list');
  }

  async addAdmin(data: {
    userDid: string;
    role: 'admin' | 'moderator' | 'support';
  }): Promise<{ success: boolean; adminId: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.admins.add', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAdmin(data: {
    adminId: string;
    role?: 'admin' | 'moderator' | 'support';
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.admins.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeAdmin(adminId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.admins.remove', {
      method: 'POST',
      body: JSON.stringify({ adminId }),
    });
  }

  // Audit log
  async getAuditLog(options: {
    adminId?: string;
    adminDid?: string;
    action?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: AuditLogEntry[] }> {
    const params = new URLSearchParams();
    if (options.adminId) params.set('adminId', options.adminId);
    if (options.adminDid) params.set('adminDid', options.adminDid);
    if (options.action) params.set('action', options.action);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    return this.fetch(`/xrpc/io.exprsn.admin.audit.list?${params}`);
  }

  // System config
  async getSystemConfig(): Promise<{ configs: SystemConfigItem[] }> {
    return this.fetch('/xrpc/io.exprsn.admin.config.list');
  }

  async updateSystemConfig(data: {
    key: string;
    value: unknown;
    description?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.config.set', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Featured content
  async getFeaturedContent(): Promise<{ featured: FeaturedContentItem[] }> {
    return this.fetch('/xrpc/io.exprsn.admin.featured.list');
  }

  async addFeaturedContent(data: {
    contentUri: string;
    featureType: 'hero' | 'trending' | 'recommended' | 'spotlight';
    expiresAt?: string;
  }): Promise<{ success: boolean; featuredId: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.featured.add', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFeaturedContent(data: {
    contentUri: string;
    position?: number;
    featureType?: 'hero' | 'trending' | 'recommended' | 'spotlight';
    expiresAt?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.featured.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeFeaturedContent(contentUri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.featured.remove', {
      method: 'POST',
      body: JSON.stringify({ contentUri }),
    });
  }

  // =============================================================================
  // Social API - Reposts
  // =============================================================================

  async repost(
    videoUri: string,
    videoCid: string,
    caption?: string
  ): Promise<{ uri: string; cid: string }> {
    return this.fetch('/xrpc/io.exprsn.video.repost', {
      method: 'POST',
      body: JSON.stringify({ videoUri, videoCid, caption }),
    });
  }

  async unrepost(repostUri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.unrepost', {
      method: 'POST',
      body: JSON.stringify({ uri: repostUri }),
    });
  }

  async getReposts(
    videoUri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ reposts: RepostView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ uri: videoUri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getReposts?${params}`);
  }

  // =============================================================================
  // Social API - Bookmarks
  // =============================================================================

  async bookmark(
    videoUri: string,
    videoCid: string,
    folder?: string
  ): Promise<{ uri: string; cid: string }> {
    return this.fetch('/xrpc/io.exprsn.video.bookmark', {
      method: 'POST',
      body: JSON.stringify({ videoUri, videoCid, folder }),
    });
  }

  async unbookmark(bookmarkUri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.unbookmark', {
      method: 'POST',
      body: JSON.stringify({ uri: bookmarkUri }),
    });
  }

  async getBookmarks(
    options: { folder?: string; cursor?: string; limit?: number } = {}
  ): Promise<{ bookmarks: BookmarkView[]; cursor?: string }> {
    const { folder, cursor, limit = 50 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (folder) params.set('folder', folder);
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getBookmarks?${params}`);
  }

  // =============================================================================
  // Social API - Blocks
  // =============================================================================

  async block(did: string): Promise<{ uri: string; cid: string }> {
    return this.fetch('/xrpc/io.exprsn.graph.block', {
      method: 'POST',
      body: JSON.stringify({ did }),
    });
  }

  async unblock(blockUri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.graph.unblock', {
      method: 'POST',
      body: JSON.stringify({ uri: blockUri }),
    });
  }

  async getBlocks(
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ blocks: BlockedUser[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.graph.getBlocks?${params}`);
  }

  // =============================================================================
  // Social API - Mutes
  // =============================================================================

  async mute(did: string): Promise<{ uri: string; cid: string }> {
    return this.fetch('/xrpc/io.exprsn.graph.mute', {
      method: 'POST',
      body: JSON.stringify({ did }),
    });
  }

  async unmute(muteUri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.graph.unmute', {
      method: 'POST',
      body: JSON.stringify({ uri: muteUri }),
    });
  }

  async getMutes(
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ mutes: MutedUser[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.graph.getMutes?${params}`);
  }

  // =============================================================================
  // Social API - Reports
  // =============================================================================

  async report(data: {
    subjectUri: string;
    subjectCid: string;
    reason:
      | 'spam'
      | 'harassment'
      | 'hate_speech'
      | 'violence'
      | 'nudity'
      | 'misinformation'
      | 'copyright'
      | 'self_harm'
      | 'other';
    description?: string;
  }): Promise<{ success: boolean; reportId: string }> {
    return this.fetch('/xrpc/io.exprsn.video.report', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // =============================================================================
  // Notification Subscription API
  // =============================================================================

  async getNotificationSubscription(): Promise<{
    subscription: NotificationSubscription;
  }> {
    return this.fetch('/xrpc/io.exprsn.notification.getSubscription');
  }

  async updateNotificationSubscription(
    update: Partial<NotificationSubscription>
  ): Promise<{ subscription: NotificationSubscription }> {
    return this.fetch('/xrpc/io.exprsn.notification.updateSubscription', {
      method: 'POST',
      body: JSON.stringify(update),
    });
  }

  // =============================================================================
  // Chat/DM API
  // =============================================================================

  async getOrCreateConversation(did: string): Promise<{
    conversation: ConversationView;
  }> {
    return this.fetch('/xrpc/io.exprsn.chat.getOrCreateConversation', {
      method: 'POST',
      body: JSON.stringify({ did }),
    });
  }

  async getConversations(
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ conversations: ConversationView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.chat.getConversations?${params}`);
  }

  async sendMessage(data: {
    conversationId: string;
    text: string;
    replyToId?: string;
    embedType?: string;
    embedUri?: string;
  }): Promise<{ message: MessageView }> {
    return this.fetch('/xrpc/io.exprsn.chat.sendMessage', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMessages(
    conversationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ messages: MessageView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({
      conversationId,
      limit: String(limit),
    });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.chat.getMessages?${params}`);
  }

  async markConversationRead(conversationId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.chat.markRead', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
  }

  async muteConversation(
    conversationId: string,
    muted: boolean
  ): Promise<{ success: boolean; muted: boolean }> {
    return this.fetch('/xrpc/io.exprsn.chat.muteConversation', {
      method: 'POST',
      body: JSON.stringify({ conversationId, muted }),
    });
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

// Admin types
export interface AdminSession {
  admin: {
    id: string;
    role: string;
    permissions: string[];
    lastLoginAt?: string;
  };
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  } | null;
}

export interface AdminDashboard {
  stats: {
    totalUsers: number;
    totalVideos: number;
    pendingReports: number;
  };
  recentActivity: {
    users: Array<{
      did: string;
      handle: string;
      createdAt: string;
    }>;
    videos: Array<{
      uri: string;
      caption?: string;
      authorDid: string;
      createdAt: string;
    }>;
  };
}

export interface AdminUserItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followerCount: number;
  videoCount: number;
  verified: boolean;
  status: string;
  createdAt: string;
}

export interface AdminUsersResponse {
  users: AdminUserItem[];
  cursor?: string;
}

export interface AdminUserDetail {
  user: {
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
  };
  sanctions: Array<{
    id: string;
    sanctionType: string;
    reason: string;
    expiresAt?: string;
    createdAt: string;
  }>;
  recentVideos: Array<{
    uri: string;
    caption?: string;
    thumbnailUrl?: string;
    viewCount: number;
    createdAt: string;
  }>;
  reportCount: number;
}

export interface AdminReport {
  id: string;
  reporterDid: string;
  contentType: string;
  contentUri: string;
  reason: string;
  description?: string;
  status: string;
  createdAt: string;
  reporter?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface AdminReportsResponse {
  reports: AdminReport[];
}

export interface AdminTeamMember {
  id: string;
  userDid: string;
  role: string;
  permissions: string[];
  createdAt: string;
  user?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  admin?: {
    id: string;
    userDid: string;
    role: string;
  };
}

export interface SystemConfigItem {
  id: string;
  key: string;
  value: unknown;
  description?: string;
  updatedAt: string;
  updatedBy?: {
    handle: string;
    avatar?: string;
  };
}

export interface FeaturedContentItem {
  id: string;
  contentUri: string;
  featureType: 'hero' | 'trending' | 'recommended' | 'spotlight';
  position: number;
  expiresAt?: string;
  createdAt: string;
  video?: {
    uri: string;
    caption?: string;
    thumbnailUrl?: string;
    viewCount: number;
    likeCount: number;
    author?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
}

// Social types
export interface RepostView {
  uri: string;
  cid: string;
  video: VideoView;
  caption?: string;
  createdAt: string;
}

export interface BookmarkView {
  uri: string;
  cid: string;
  video: VideoView;
  folder?: string;
  createdAt: string;
}

export interface BlockedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  blockedAt: string;
}

export interface MutedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  mutedAt: string;
}

export interface NotificationSubscription {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  reposts: boolean;
  messages: boolean;
  fromFollowingOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
}

// Chat types
export interface ConversationMember {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface ConversationView {
  id: string;
  members: ConversationMember[];
  lastMessage?: {
    text: string;
    createdAt: string;
  };
  unreadCount: number;
  muted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageView {
  id: string;
  sender: ConversationMember;
  text: string;
  replyToId?: string;
  embedType?: string;
  embedUri?: string;
  read: boolean;
  createdAt: string;
}

export const api = new ApiClient(API_BASE);
