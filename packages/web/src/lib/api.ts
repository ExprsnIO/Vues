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
export type VideoReactionType = 'fire' | 'love' | 'laugh' | 'wow' | 'sad' | 'angry';
export type CommentSortType = 'top' | 'recent' | 'hot';

export interface VideoReactionsResponse {
  videoUri: string;
  counts: Record<VideoReactionType, number>;
  totalReactions: number;
  userReactions: VideoReactionType[];
}

// Effects types
export interface EffectParam {
  name: string;
  label: string;
  type: 'number' | 'color' | 'select' | 'boolean' | 'range';
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string | number; label: string }>;
}

export interface EffectDefinition {
  type: string;
  name: string;
  description: string;
  category: string;
  params: EffectParam[];
}

export interface EffectInstance {
  type: string;
  params: Record<string, number | string | boolean>;
}

export interface EffectPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  effects: EffectInstance[];
  thumbnail?: string;
  isCustom?: boolean;
}

export interface EffectCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface EffectsListResponse {
  categories: EffectCategory[];
  effectsByCategory: Record<string, EffectDefinition[]>;
  totalEffects: number;
}

export interface EffectPresetsResponse {
  presets: EffectPreset[];
  userPresets: EffectPreset[];
  categories: string[];
}

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

  // Video Reactions
  async react(videoUri: string, reactionType: VideoReactionType): Promise<{ id: string; videoUri: string; reactionType: string; createdAt: string }> {
    return this.fetch('/xrpc/io.exprsn.video.react', {
      method: 'POST',
      body: JSON.stringify({ videoUri, reactionType }),
    });
  }

  async unreact(videoUri: string, reactionType: VideoReactionType): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.unreact', {
      method: 'POST',
      body: JSON.stringify({ videoUri, reactionType }),
    });
  }

  async getReactions(videoUri: string): Promise<VideoReactionsResponse> {
    const params = new URLSearchParams({ videoUri });
    return this.fetch(`/xrpc/io.exprsn.video.getReactions?${params}`);
  }

  async getReactionTypes(): Promise<{ reactionTypes: Array<{ type: string; emoji: string; label: string }> }> {
    return this.fetch('/xrpc/io.exprsn.video.getReactionTypes');
  }

  // Video Effects
  async getEffectsList(): Promise<EffectsListResponse> {
    return this.fetch('/xrpc/io.exprsn.studio.effects.list');
  }

  async getEffectPresets(): Promise<EffectPresetsResponse> {
    return this.fetch('/xrpc/io.exprsn.studio.effects.presets');
  }

  async saveEffectPreset(data: { name: string; description?: string; effects: EffectInstance[] }): Promise<EffectPreset> {
    return this.fetch('/xrpc/io.exprsn.studio.effects.savePreset', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteEffectPreset(presetId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.studio.effects.deletePreset', {
      method: 'POST',
      body: JSON.stringify({ presetId }),
    });
  }

  async previewEffects(effects: EffectInstance[]): Promise<{ filterString: string; effectCount: number }> {
    return this.fetch('/xrpc/io.exprsn.studio.effects.preview', {
      method: 'POST',
      body: JSON.stringify({ effects }),
    });
  }

  async comment(videoUri: string, text: string): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.comment', {
      method: 'POST',
      body: JSON.stringify({ videoUri, text }),
    });
  }

  /**
   * Track video view with enhanced engagement signals for FYP personalization
   */
  async trackView(
    videoUri: string,
    options?: {
      watchDuration?: number;
      completed?: boolean;
      loopCount?: number;
      sessionPosition?: number;
      engagementActions?: string[];
      milestone?: '25%' | '50%' | '75%' | '100%';
      videoDuration?: number;
    }
  ): Promise<void> {
    return this.fetch('/xrpc/io.exprsn.video.trackView', {
      method: 'POST',
      body: JSON.stringify({ videoUri, ...options }),
    });
  }

  /**
   * Submit "not interested" feedback for a video, author, tag, or sound
   */
  async notInterested(options: {
    videoUri?: string;
    authorDid?: string;
    tag?: string;
    soundId?: string;
    feedbackType?: 'not_interested' | 'see_less' | 'hide_author' | 'report';
    reason?: 'repetitive' | 'not_relevant' | 'offensive' | 'spam' | 'other';
    hideAuthor?: boolean;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.notInterested', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * Remove feedback for a video, author, tag, or sound
   */
  async removeFeedback(options: {
    targetType: 'video' | 'author' | 'tag' | 'sound';
    targetId: string;
    feedbackType?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.removeFeedback', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * Send a tip to a creator
   */
  async tip(options: {
    recipientDid: string;
    amount: number; // cents
    message?: string;
    videoUri?: string;
  }): Promise<{ success: boolean; transactionId: string }> {
    return this.fetch('/xrpc/io.exprsn.payments.tip', {
      method: 'POST',
      body: JSON.stringify(options),
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
  async getSettings(): Promise<{ settings: import('@exprsn/shared').UserSettings; isAuthenticated: boolean }> {
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

  // Password management
  async setUserPassword(data: {
    did: string;
    password: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.users.setPassword', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resetUserPassword(data: {
    did: string;
  }): Promise<{ success: boolean; temporaryPassword: string; message: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.users.resetPassword', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async forceUserLogout(data: {
    did: string;
  }): Promise<{ success: boolean; sessionsInvalidated: number; message: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.users.forceLogout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUserAccountInfo(did: string): Promise<{
    account: {
      did: string;
      handle: string;
      email: string | null;
      status: string;
      hasPassword: boolean;
      activeSessions: number;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    const params = new URLSearchParams({ did });
    return this.fetch(`/xrpc/io.exprsn.admin.users.getAccountInfo?${params}`);
  }

  // Bulk User Actions
  async bulkSanctionUsers(data: {
    userDids: string[];
    sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
    reason: string;
    expiresAt?: string;
  }): Promise<BulkActionResult> {
    return this.fetch('/xrpc/io.exprsn.admin.users.bulkSanction', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkResetPasswords(data: {
    userDids: string[];
  }): Promise<BulkPasswordResetResult> {
    return this.fetch('/xrpc/io.exprsn.admin.users.bulkResetPassword', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkDeleteUsers(data: {
    userDids: string[];
    reason: string;
    hardDelete?: boolean;
  }): Promise<BulkActionResult> {
    return this.fetch('/xrpc/io.exprsn.admin.users.bulkDelete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkForceLogout(data: {
    userDids: string[];
  }): Promise<BulkForceLogoutResult> {
    return this.fetch('/xrpc/io.exprsn.admin.users.bulkForceLogout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkActionPreview(data: {
    userDids: string[];
    action: 'sanction' | 'resetPassword' | 'delete' | 'forceLogout';
    sanctionType?: 'warning' | 'mute' | 'suspend' | 'ban';
  }): Promise<BulkActionPreview> {
    return this.fetch('/xrpc/io.exprsn.admin.users.bulkActionPreview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Organization Admin
  async getAdminOrganizations(options: {
    q?: string;
    type?: string;
    verified?: string;
    apiAccess?: string;
    sort?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<AdminOrganizationsResponse> {
    const params = new URLSearchParams();
    if (options.q) params.set('q', options.q);
    if (options.type) params.set('type', options.type);
    if (options.verified) params.set('verified', options.verified);
    if (options.apiAccess) params.set('apiAccess', options.apiAccess);
    if (options.sort) params.set('sort', options.sort);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.orgs.list?${params}`);
  }

  async getAdminOrganization(id: string): Promise<AdminOrganizationDetail> {
    const params = new URLSearchParams({ id });
    return this.fetch(`/xrpc/io.exprsn.admin.orgs.get?${params}`);
  }

  async updateAdminOrganization(data: {
    id: string;
    verified?: boolean;
    apiAccessEnabled?: boolean;
    rateLimitPerMinute?: number | null;
    burstLimit?: number | null;
    dailyRequestLimit?: number | null;
    allowedScopes?: string[] | null;
    webhooksEnabled?: boolean;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.orgs.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkVerifyOrganizations(data: {
    orgIds: string[];
    verified: boolean;
  }): Promise<BulkOrgActionResult> {
    return this.fetch('/xrpc/io.exprsn.admin.orgs.bulkVerify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkUpdateOrgApiAccess(data: {
    orgIds: string[];
    apiAccessEnabled: boolean;
  }): Promise<BulkOrgActionResult> {
    return this.fetch('/xrpc/io.exprsn.admin.orgs.bulkUpdateApiAccess', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkUpdateOrgMembers(data: {
    orgId: string;
    members: Array<{
      did: string;
      action: 'add' | 'remove' | 'suspend' | 'activate';
      role?: 'admin' | 'member';
    }>;
  }): Promise<BulkOrgMemberResult> {
    return this.fetch('/xrpc/io.exprsn.admin.orgs.bulkUpdateMembers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAdminOrganization(data: {
    id: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.orgs.delete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkDeleteOrganizations(data: {
    orgIds: string[];
    reason: string;
  }): Promise<BulkOrgActionResult> {
    return this.fetch('/xrpc/io.exprsn.admin.orgs.bulkDelete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // =============================================================================
  // Admin Export API
  // =============================================================================

  private async fetchBlob(path: string): Promise<Blob> {
    const headers: HeadersInit = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    if (this.devAdminMode) {
      headers['X-Dev-Admin'] = 'true';
    }

    const response = await fetch(`${this.baseUrl}${path}`, { headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Export failed: ${response.status}`);
    }

    return response.blob();
  }

  async exportUsers(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    status?: string;
    role?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.status) params.set('status', options.status);
    if (options.role) params.set('role', options.role);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.users?${params}`);
  }

  async exportReports(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    status?: string;
    contentType?: string;
    reason?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.status) params.set('status', options.status);
    if (options.contentType) params.set('contentType', options.contentType);
    if (options.reason) params.set('reason', options.reason);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.reports?${params}`);
  }

  async exportAuditLogs(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    action?: string;
    actorDid?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.action) params.set('action', options.action);
    if (options.actorDid) params.set('actorDid', options.actorDid);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.auditLogs?${params}`);
  }

  async exportAnalytics(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    metric?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.metric) params.set('metric', options.metric);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.analytics?${params}`);
  }

  async exportPayments(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.status) params.set('status', options.status);
    if (options.type) params.set('type', options.type);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.payments?${params}`);
  }

  async exportRenderJobs(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.status) params.set('status', options.status);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.renderJobs?${params}`);
  }

  async exportOrganizations(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    type?: string;
    verified?: boolean;
    apiAccess?: boolean;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.type) params.set('type', options.type);
    if (options.verified !== undefined) params.set('verified', String(options.verified));
    if (options.apiAccess !== undefined) params.set('apiAccess', String(options.apiAccess));
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.organizations?${params}`);
  }

  async exportSanctions(options: {
    format: 'csv' | 'xlsx' | 'sqlite';
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    const params = new URLSearchParams({ format: options.format });
    if (options.type) params.set('type', options.type);
    if (options.status) params.set('status', options.status);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    return this.fetchBlob(`/xrpc/io.exprsn.admin.export.sanctions?${params}`);
  }

  // Studio Project Management
  async listStudioProjects(options: {
    limit?: number;
    cursor?: string;
  } = {}): Promise<{
    projects: Array<{
      id: string;
      ownerDid: string;
      title: string;
      settings: {
        width: number;
        height: number;
        frameRate: number;
        duration: number;
        aspectRatio?: string;
        backgroundColor?: string;
      };
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.studio.listProjects?${params}`);
  }

  async createStudioProject(data: {
    title: string;
    settings?: {
      width?: number;
      height?: number;
      frameRate?: number;
      duration?: number;
      aspectRatio?: string;
      backgroundColor?: string;
    };
  }): Promise<{ projectId: string }> {
    return this.fetch('/xrpc/io.exprsn.studio.createProject', {
      method: 'POST',
      body: JSON.stringify({ name: data.title, settings: data.settings }),
    });
  }

  async deleteStudioProject(projectId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.studio.deleteProject', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  async duplicateStudioProject(projectId: string, newName?: string): Promise<{ projectId: string }> {
    return this.fetch('/xrpc/io.exprsn.studio.duplicateProject', {
      method: 'POST',
      body: JSON.stringify({ projectId, newName }),
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

  // Admin content moderation
  async getAdminContent(options: {
    type?: 'video' | 'comment';
    status?: 'active' | 'removed' | 'flagged';
    q?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<{
    content: Array<{
      uri: string;
      type: 'video' | 'comment';
      author: { did: string; handle: string; displayName?: string; avatar?: string };
      text?: string;
      thumbnail?: string;
      viewCount?: number;
      likeCount?: number;
      reportCount: number;
      status: 'active' | 'removed' | 'flagged';
      createdAt: string;
      removedAt?: string;
      removedReason?: string;
    }>;
    cursor?: string;
  }> {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.status) params.set('status', options.status);
    if (options.q) params.set('q', options.q);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.content.list?${params}`);
  }

  async removeAdminContent(data: {
    uri: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.content.remove', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async restoreAdminContent(data: {
    uri: string;
    reason?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.content.restore', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Moderation queue
  async getModerationQueue(options: {
    status?: 'pending' | 'in_review' | 'escalated';
    contentType?: 'video' | 'comment' | 'loop' | 'collab' | 'user';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    assignedTo?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<{
    items: ModerationQueueItem[];
    cursor?: string;
    stats: {
      pending: number;
      inReview: number;
      escalated: number;
      resolvedToday: number;
    };
  }> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.contentType) params.set('contentType', options.contentType);
    if (options.priority) params.set('priority', options.priority);
    if (options.assignedTo) params.set('assignedTo', options.assignedTo);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.moderation.queue?${params}`);
  }

  async claimModerationItem(itemId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.claim', {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    });
  }

  async resolveModerationItem(data: {
    itemId: string;
    action: 'approve' | 'remove' | 'warn' | 'escalate';
    reason: string;
    sanctionType?: 'warning' | 'mute' | 'suspend' | 'ban';
    sanctionDuration?: number;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.resolve', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getModerationStats(): Promise<{
    overview: {
      pendingReports: number;
      resolvedToday: number;
      resolvedThisWeek: number;
      avgResolutionTime: number;
    };
    byContentType: Record<string, number>;
    byReason: Record<string, number>;
    byModerator: Array<{
      moderator: { did: string; handle: string; avatar?: string };
      resolved: number;
      avgTime: number;
    }>;
    recentActions: Array<{
      id: string;
      action: string;
      contentType: string;
      moderator: { handle: string };
      createdAt: string;
    }>;
  }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.stats');
  }

  async bulkModerationAction(data: {
    itemIds: string[];
    action: 'approve' | 'remove' | 'escalate';
    reason: string;
  }): Promise<{ success: boolean; processed: number; failed: number }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Banned words management
  async getBannedWords(options: {
    cursor?: string;
    limit?: number;
  } = {}): Promise<{ words: BannedWord[]; cursor?: string }> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.moderation.bannedWords?${params}`);
  }

  async addBannedWord(data: {
    word: string;
    severity: 'low' | 'medium' | 'high';
    action: 'flag' | 'block' | 'shadow';
    reason?: string;
  }): Promise<{ success: boolean; word: BannedWord }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.addBannedWord', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBannedWord(data: {
    id: string;
    severity?: 'low' | 'medium' | 'high';
    action?: 'flag' | 'block' | 'shadow';
    enabled?: boolean;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.updateBannedWord', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeBannedWord(id: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.removeBannedWord', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  // Banned tags management
  async getBannedTags(options: {
    cursor?: string;
    limit?: number;
  } = {}): Promise<{ tags: BannedTag[]; cursor?: string }> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.moderation.bannedTags?${params}`);
  }

  async addBannedTag(data: {
    tag: string;
    severity: 'low' | 'medium' | 'high';
    action: 'flag' | 'block' | 'shadow';
    reason?: string;
  }): Promise<{ success: boolean; tag: BannedTag }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.addBannedTag', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBannedTag(data: {
    id: string;
    severity?: 'low' | 'medium' | 'high';
    action?: 'flag' | 'block' | 'shadow';
    enabled?: boolean;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.updateBannedTag', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeBannedTag(id: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.moderation.removeBannedTag', {
      method: 'POST',
      body: JSON.stringify({ id }),
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

  // System diagnostics
  async getSystemDiagnostics(): Promise<SystemDiagnostics> {
    return this.fetch('/xrpc/io.exprsn.admin.system.diagnostics');
  }

  // Admin activity feed
  async getAdminActivityFeed(options: {
    limit?: number;
    offset?: number;
    adminDid?: string;
    action?: string;
  } = {}): Promise<AdminActivityFeed> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.adminDid) params.set('adminDid', options.adminDid);
    if (options.action) params.set('action', options.action);
    return this.fetch(`/xrpc/io.exprsn.admin.activity.feed?${params}`);
  }

  // Quick stats (lightweight polling endpoint)
  async getQuickStats(): Promise<QuickStats> {
    return this.fetch('/xrpc/io.exprsn.admin.quickStats');
  }

  // Bulk verify users
  async bulkVerifyUsers(data: {
    userDids: string[];
    verified: boolean;
    reason?: string;
  }): Promise<BulkActionResult> {
    return this.fetch('/xrpc/io.exprsn.admin.users.bulkVerify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Search users with fuzzy matching
  async searchAdminUsers(query: string, limit?: number): Promise<{ users: AdminUserSearchResult[] }> {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set('limit', String(limit));
    return this.fetch(`/xrpc/io.exprsn.admin.users.search?${params}`);
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
  // Render Admin API
  // =============================================================================

  async getRenderQueueStats(): Promise<{
    pending: number;
    rendering: number;
    completed: number;
    failed: number;
    paused: number;
    totalToday: number;
    avgWaitTime: number;
    avgRenderTime: number;
    priorityBreakdown: {
      urgent: number;
      high: number;
      normal: number;
      low: number;
    };
  }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.getQueueStats');
  }

  async listRenderJobs(options: {
    status?: string;
    priority?: string;
    userDid?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<RenderJobView[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.priority) params.set('priority', options.priority);
    if (options.userDid) params.set('userDid', options.userDid);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    const result = await this.fetch(`/xrpc/io.exprsn.admin.render.listJobs?${params}`) as { jobs: RenderJobView[] };
    return result.jobs;
  }

  async getRenderJob(jobId: string): Promise<RenderJobView> {
    const params = new URLSearchParams({ jobId });
    return this.fetch(`/xrpc/io.exprsn.admin.render.getJob?${params}`);
  }

  async pauseRenderJob(jobId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.pauseJob', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  async resumeRenderJob(jobId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.resumeJob', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  async cancelRenderJob(jobId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.cancelJob', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  async retryRenderJob(jobId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.retryJob', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  async updateRenderJobPriority(jobId: string, priority: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.updatePriority', {
      method: 'POST',
      body: JSON.stringify({ jobId, priority }),
    });
  }

  async listRenderWorkers(): Promise<RenderWorkerView[]> {
    const result = await this.fetch('/xrpc/io.exprsn.admin.render.listWorkers') as { workers: RenderWorkerView[] };
    return result.workers;
  }

  async drainRenderWorker(workerId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.drainWorker', {
      method: 'POST',
      body: JSON.stringify({ workerId }),
    });
  }

  async listRenderBatches(options: {
    status?: string;
    userDid?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<RenderBatchView[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.userDid) params.set('userDid', options.userDid);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    const result = await this.fetch(`/xrpc/io.exprsn.admin.render.listBatches?${params}`) as { batches: RenderBatchView[] };
    return result.batches;
  }

  async getUserRenderQuota(userDid: string): Promise<UserRenderQuotaView> {
    const params = new URLSearchParams({ userDid });
    return this.fetch(`/xrpc/io.exprsn.admin.render.getUserQuota?${params}`);
  }

  async updateUserRenderQuota(userDid: string, quota: {
    dailyLimit?: number;
    weeklyLimit?: number;
    concurrentLimit?: number;
    maxQuality?: string;
    priorityBoost?: number;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.render.updateUserQuota', {
      method: 'POST',
      body: JSON.stringify({ userDid, ...quota }),
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

  // =============================================================================
  // Actor/Profile API
  // =============================================================================

  async getActorProfile(
    identifier: string
  ): Promise<{ profile: ActorProfileView }> {
    const param = identifier.startsWith('did:') ? 'did' : 'handle';
    const params = new URLSearchParams({ [param]: identifier });
    return this.fetch(`/xrpc/io.exprsn.actor.getProfile?${params}`);
  }

  async updateActorProfile(data: {
    displayName?: string;
    bio?: string;
    location?: string;
    website?: string;
    socialLinks?: {
      twitter?: string;
      instagram?: string;
      youtube?: string;
      tiktok?: string;
      discord?: string;
    };
  }): Promise<{ success: boolean; profile: ActorProfileView }> {
    return this.fetch('/xrpc/io.exprsn.actor.updateProfile', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAvatarUploadUrl(contentType: string): Promise<{
    uploadUrl: string;
    key: string;
    avatarUrl: string;
    expiresAt: string;
  }> {
    return this.fetch('/xrpc/io.exprsn.actor.getAvatarUploadUrl', {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    });
  }

  async completeAvatarUpload(avatarUrl: string): Promise<{
    success: boolean;
    avatarUrl: string;
  }> {
    return this.fetch('/xrpc/io.exprsn.actor.completeAvatarUpload', {
      method: 'POST',
      body: JSON.stringify({ avatarUrl }),
    });
  }

  async getSuggestions(
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ actors: ActorProfileView[]; cursor?: string }> {
    const { cursor, limit = 25 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.actor.getSuggestions?${params}`);
  }

  async searchActors(
    query: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ actors: ActorProfileView[]; cursor?: string }> {
    const { cursor, limit = 25 } = options;
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.actor.searchActors?${params}`);
  }

  async getActorVideos(
    identifier: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ videos: VideoView[]; cursor?: string }> {
    const param = identifier.startsWith('did:') ? 'did' : 'handle';
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ [param]: identifier, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.actor.getVideos?${params}`);
  }

  // =============================================================================
  // Notification API
  // =============================================================================

  async listNotifications(
    options: { cursor?: string; limit?: number; filter?: string } = {}
  ): Promise<{ notifications: NotificationView[]; cursor?: string; seenAt?: string }> {
    const { cursor, limit = 50, filter } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    if (filter) params.set('filter', filter);
    return this.fetch(`/xrpc/io.exprsn.notification.listNotifications?${params}`);
  }

  async updateNotificationSeen(seenAt: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.notification.updateSeen', {
      method: 'POST',
      body: JSON.stringify({ seenAt }),
    });
  }

  async getUnreadNotificationCount(): Promise<{ count: number }> {
    return this.fetch('/xrpc/io.exprsn.notification.getUnreadCount');
  }

  // =============================================================================
  // Feed API
  // =============================================================================

  async getTimeline(
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.feed.getTimeline?${params}`);
  }

  async getActorLikes(
    identifier: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ feed: VideoView[]; cursor?: string }> {
    const param = identifier.startsWith('did:') ? 'did' : 'handle';
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ [param]: identifier, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.feed.getActorLikes?${params}`);
  }

  async getSuggestedFeed(
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ feed: VideoView[]; cursor?: string }> {
    const { cursor, limit = 20 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.feed.getSuggestedFeed?${params}`);
  }

  async getActorFeed(
    identifier: string,
    options: { cursor?: string; limit?: number; filter?: string } = {}
  ): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    const param = identifier.startsWith('did:') ? 'did' : 'handle';
    const { cursor, limit = 50, filter = 'posts_and_reposts' } = options;
    const params = new URLSearchParams({
      [param]: identifier,
      limit: String(limit),
      filter,
    });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.feed.getActorFeed?${params}`);
  }

  // =============================================================================
  // Video Management API
  // =============================================================================

  async deleteVideo(uri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.video.deleteVideo', {
      method: 'POST',
      body: JSON.stringify({ uri }),
    });
  }

  async updateVideo(data: {
    uri: string;
    caption?: string;
    tags?: string[];
    visibility?: 'public' | 'followers';
    allowDuet?: boolean;
    allowStitch?: boolean;
    allowComments?: boolean;
  }): Promise<{ success: boolean; video?: VideoView }> {
    return this.fetch('/xrpc/io.exprsn.video.updateVideo', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getVideoLikes(
    uri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ likes: LikeView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ uri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getLikes?${params}`);
  }

  async getVideoReposts(
    uri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ reposts: RepostUserView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ uri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getReposts?${params}`);
  }

  // =============================================================================
  // Lists API
  // =============================================================================

  async createList(data: {
    name: string;
    description?: string;
    avatar?: string;
    purpose?: 'curatelist' | 'modlist';
  }): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.graph.createList', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateList(data: {
    uri: string;
    name?: string;
    description?: string;
    avatar?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.graph.updateList', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteList(uri: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.graph.deleteList', {
      method: 'POST',
      body: JSON.stringify({ uri }),
    });
  }

  async getLists(
    did: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ lists: ListView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ did, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.graph.getLists?${params}`);
  }

  async getList(
    uri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ list: ListView; items: ListItemView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ uri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.graph.getList?${params}`);
  }

  async addListItem(listUri: string, subjectDid: string): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.graph.addListItem', {
      method: 'POST',
      body: JSON.stringify({ listUri, subjectDid }),
    });
  }

  async removeListItem(listUri: string, subjectDid: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.graph.removeListItem', {
      method: 'POST',
      body: JSON.stringify({ listUri, subjectDid }),
    });
  }

  async getListMemberships(subjectDid: string): Promise<{ lists: ListView[] }> {
    return this.fetch(`/xrpc/io.exprsn.graph.getListMemberships?did=${subjectDid}`);
  }

  // =============================================================================
  // Stitch & Duet API
  // =============================================================================

  async createStitch(data: {
    videoUri: string;
    originalVideoUri: string;
    startTime?: number;
    endTime: number;
  }): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.stitch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getStitches(
    uri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ stitches: StitchView[]; cursor?: string }> {
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ uri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getStitches?${params}`);
  }

  async createDuet(data: {
    videoUri: string;
    originalVideoUri: string;
    layout?: 'side-by-side' | 'react' | 'green-screen';
  }): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.duet', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // =============================================================================
  // Collab & Loop API (Rebranded Duets & Stitches)
  // =============================================================================

  async createCollab(data: {
    videoUri: string;
    originalVideoUri: string;
    layout?: 'side-by-side' | 'react' | 'green-screen';
  }): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.collab', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCollabs(
    videoUri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ collabs: CollabView[]; cursor?: string }> {
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ uri: videoUri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getCollabs?${params}`);
  }

  async createLoop(data: {
    videoUri: string;
    originalVideoUri: string;
    startTime: number;
    endTime: number;
  }): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.loop', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getLoops(
    videoUri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ loops: LoopView[]; cursor?: string }> {
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ uri: videoUri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getLoops?${params}`);
  }

  // Legacy duet/stitch aliases
  async getDuets(
    uri: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ duets: DuetView[]; cursor?: string }> {
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ uri, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getDuets?${params}`);
  }

  // =============================================================================
  // Sound & Tag API
  // =============================================================================

  async getSounds(
    options: { query?: string; trending?: boolean; limit?: number } = {}
  ): Promise<{ sounds: SoundView[] }> {
    const { query, trending, limit = 20 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (query) params.set('query', query);
    if (trending) params.set('trending', 'true');
    return this.fetch(`/xrpc/io.exprsn.video.getSounds?${params}`);
  }

  async getVideosBySound(
    soundId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ sound: SoundView; videos: VideoView[]; cursor?: string }> {
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ soundId, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getVideosBySound?${params}`);
  }

  async getVideosByTag(
    tag: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ tag: TagView; videos: VideoView[]; cursor?: string }> {
    const { cursor, limit = 30 } = options;
    const params = new URLSearchParams({ tag, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.video.getVideosByTag?${params}`);
  }

  async getTrendingTags(limit = 20): Promise<{ tags: TagView[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    return this.fetch(`/xrpc/io.exprsn.video.getTrendingTags?${params}`);
  }

  // =============================================================================
  // Share Tracking API
  // =============================================================================

  async trackShare(
    videoUri: string,
    platform?: string
  ): Promise<{ uri: string }> {
    return this.fetch('/xrpc/io.exprsn.video.share', {
      method: 'POST',
      body: JSON.stringify({ videoUri, platform }),
    });
  }

  // =============================================================================
  // Chat Delete API
  // =============================================================================

  async deleteMessage(
    conversationId: string,
    messageId: string
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.chat.deleteMessage', {
      method: 'POST',
      body: JSON.stringify({ conversationId, messageId }),
    });
  }

  async deleteConversation(conversationId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.chat.deleteConversation', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
  }

  // Add reaction to a message
  async addReaction(
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean; reactions: MessageReaction[] }> {
    return this.fetch('/xrpc/io.exprsn.chat.addReaction', {
      method: 'POST',
      body: JSON.stringify({ messageId, emoji }),
    });
  }

  // Remove reaction from a message
  async removeReaction(
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean; reactions: MessageReaction[] }> {
    return this.fetch('/xrpc/io.exprsn.chat.removeReaction', {
      method: 'POST',
      body: JSON.stringify({ messageId, emoji }),
    });
  }

  // Get reactions for messages
  async getMessageReactions(messageIds: string[]): Promise<{
    reactions: Record<string, MessageReaction[]>;
  }> {
    const params = new URLSearchParams({ messageIds: messageIds.join(',') });
    return this.fetch(`/xrpc/io.exprsn.chat.getReactions?${params}`);
  }

  // Get user presence
  async getPresence(userDids: string[]): Promise<{
    presence: Array<{ userDid: string; status: 'online' | 'away' | 'offline'; lastSeen: string | null }>;
  }> {
    const params = new URLSearchParams({ userDids: userDids.join(',') });
    return this.fetch(`/xrpc/io.exprsn.chat.getPresence?${params}`);
  }

  // =============================================================================
  // Actor Preferences API
  // =============================================================================

  async getPreferences(): Promise<{ preferences: PreferenceItem[] }> {
    return this.fetch('/xrpc/io.exprsn.actor.getPreferences');
  }

  async putPreferences(preferences: PreferenceItem[]): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.actor.putPreferences', {
      method: 'POST',
      body: JSON.stringify({ preferences }),
    });
  }

  // =============================================================================
  // Organization API
  // =============================================================================

  async createOrganization(data: {
    name: string;
    type: 'team' | 'enterprise' | 'nonprofit' | 'business';
    website?: string;
  }): Promise<{ organization: OrganizationView }> {
    return this.fetch('/xrpc/io.exprsn.org.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getOrganization(orgId: string): Promise<{ organization: OrganizationView }> {
    const params = new URLSearchParams({ id: orgId });
    return this.fetch(`/xrpc/io.exprsn.org.get?${params}`);
  }

  async updateOrganization(
    orgId: string,
    data: { name?: string; website?: string }
  ): Promise<{ organization: OrganizationView }> {
    return this.fetch('/xrpc/io.exprsn.org.update', {
      method: 'POST',
      body: JSON.stringify({ id: orgId, ...data }),
    });
  }

  async getMyOrganizations(): Promise<{ organizations: OrganizationView[] }> {
    return this.fetch('/xrpc/io.exprsn.org.list');
  }

  async getOrganizationMembers(
    orgId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ members: OrganizationMemberView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ id: orgId, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.org.members.list?${params}`);
  }

  async inviteOrganizationMember(
    orgId: string,
    data: { email?: string; did?: string; role?: 'admin' | 'member' }
  ): Promise<{ member: OrganizationMemberView }> {
    return this.fetch('/xrpc/io.exprsn.org.members.invite', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, ...data }),
    });
  }

  async updateMemberRole(
    orgId: string,
    memberId: string,
    role: 'admin' | 'member'
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.members.updateRole', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberId, role }),
    });
  }

  async removeMember(orgId: string, memberId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.members.remove', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberId }),
    });
  }

  // Bulk Import
  async uploadBulkImport(
    orgId: string,
    file: File
  ): Promise<{ job: BulkImportJobView }> {
    const formData = new FormData();
    formData.append('organizationId', orgId);
    formData.append('file', file);

    const headers: HeadersInit = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    if (this.devAdminMode) {
      headers['X-Dev-Admin'] = 'true';
    }

    const response = await fetch(`${this.baseUrl}/xrpc/io.exprsn.org.import.upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  async getBulkImportStatus(jobId: string): Promise<{ job: BulkImportJobView }> {
    const params = new URLSearchParams({ jobId });
    return this.fetch(`/xrpc/io.exprsn.org.import.status?${params}`);
  }

  async listBulkImportJobs(
    orgId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ jobs: BulkImportJobView[]; cursor?: string }> {
    const { cursor, limit = 20 } = options;
    const params = new URLSearchParams({ organizationId: orgId, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.org.import.list?${params}`);
  }

  async downloadImportTemplate(format: 'csv' | 'xlsx'): Promise<Blob> {
    const params = new URLSearchParams({ format });
    const headers: HeadersInit = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const response = await fetch(
      `${this.baseUrl}/xrpc/io.exprsn.org.import.template?${params}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`Failed to download template: ${response.status}`);
    }

    return response.blob();
  }

  async cancelBulkImport(jobId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.import.cancel', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  // Member Management (enhanced)
  async updateOrganizationMember(
    orgId: string,
    memberId: string,
    data: { displayName?: string; bio?: string; avatar?: string }
  ): Promise<{ member: OrganizationMemberView }> {
    return this.fetch('/xrpc/io.exprsn.org.members.update', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberId, ...data }),
    });
  }

  async resetMemberPassword(
    orgId: string,
    memberId: string,
    newPassword?: string
  ): Promise<{ password: string }> {
    return this.fetch('/xrpc/io.exprsn.org.members.resetPassword', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberId, newPassword }),
    });
  }

  async suspendOrganizationMember(
    orgId: string,
    memberId: string,
    action: 'suspend' | 'activate',
    reason?: string
  ): Promise<{ success: boolean; status: string }> {
    return this.fetch('/xrpc/io.exprsn.org.members.suspend', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberId, action, reason }),
    });
  }

  async reorderOrganizationMembers(
    orgId: string,
    memberOrders: Array<{ memberId: string; displayOrder: number }>
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.members.reorder', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberOrders }),
    });
  }

  async exportOrganizationMembers(
    orgId: string,
    format: 'csv' | 'xlsx'
  ): Promise<Blob> {
    const params = new URLSearchParams({ organizationId: orgId, format });
    const headers: HeadersInit = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const response = await fetch(
      `${this.baseUrl}/xrpc/io.exprsn.org.members.export?${params}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`Failed to export members: ${response.status}`);
    }

    return response.blob();
  }

  // Tag Management
  async getOrganizationTags(orgId: string): Promise<{ tags: OrganizationTagView[] }> {
    const params = new URLSearchParams({ organizationId: orgId });
    return this.fetch(`/xrpc/io.exprsn.org.tags.list?${params}`);
  }

  async createOrganizationTag(
    orgId: string,
    data: { name: string; color: string; description?: string }
  ): Promise<{ tag: OrganizationTagView }> {
    return this.fetch('/xrpc/io.exprsn.org.tags.create', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, ...data }),
    });
  }

  async updateOrganizationTag(
    orgId: string,
    tagId: string,
    data: { name?: string; color?: string; description?: string }
  ): Promise<{ tag: OrganizationTagView }> {
    return this.fetch('/xrpc/io.exprsn.org.tags.update', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, tagId, ...data }),
    });
  }

  async deleteOrganizationTag(orgId: string, tagId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.tags.delete', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, tagId }),
    });
  }

  async assignMemberTag(
    orgId: string,
    memberId: string,
    tagId: string
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.members.assignTag', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberId, tagId }),
    });
  }

  async removeMemberTag(
    orgId: string,
    memberId: string,
    tagId: string
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.members.removeTag', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, memberId, tagId }),
    });
  }

  // User's Organizations (with membership info)
  async getUserOrganizations(): Promise<{ organizations: OrganizationWithMembershipView[] }> {
    return this.fetch('/xrpc/io.exprsn.org.getUserOrganizations');
  }

  async leaveOrganization(orgId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.members.leave', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId }),
    });
  }

  // Public Organization Profiles
  async getOrgProfile(handle: string): Promise<{ organization: OrganizationPublicProfileView }> {
    const params = new URLSearchParams({ handle });
    return this.fetch(`/xrpc/io.exprsn.org.getProfile?${params}`);
  }

  async followOrg(organizationId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.follow', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
  }

  async unfollowOrg(organizationId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.unfollow', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
  }

  async getOrgVideos(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ videos: VideoView[]; cursor?: string }> {
    const { cursor, limit = 20 } = options;
    const params = new URLSearchParams({ organizationId, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.org.getVideos?${params}`);
  }

  // Role Management
  async getOrgRoles(organizationId: string): Promise<{ roles: OrganizationRoleView[] }> {
    const params = new URLSearchParams({ organizationId });
    return this.fetch(`/xrpc/io.exprsn.org.roles.list?${params}`);
  }

  async createOrgRole(data: {
    organizationId: string;
    name: string;
    displayName: string;
    description?: string;
    permissions: string[];
    color?: string;
  }): Promise<{ id: string; success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.roles.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOrgRole(
    roleId: string,
    data: {
      displayName?: string;
      description?: string;
      permissions?: string[];
      color?: string;
    }
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.roles.update', {
      method: 'POST',
      body: JSON.stringify({ roleId, ...data }),
    });
  }

  async deleteOrgRole(
    roleId: string,
    reassignToRoleId?: string
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.roles.delete', {
      method: 'POST',
      body: JSON.stringify({ roleId, reassignToRoleId }),
    });
  }

  // Invite Management
  async createOrgInvite(data: {
    organizationId: string;
    email?: string;
    did?: string;
    roleId?: string;
    roleName?: string;
    message?: string;
  }): Promise<{ id: string; token: string; expiresAt: string }> {
    return this.fetch('/xrpc/io.exprsn.org.invites.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getOrgInvites(organizationId: string): Promise<{ invites: OrganizationInviteView[] }> {
    const params = new URLSearchParams({ organizationId });
    return this.fetch(`/xrpc/io.exprsn.org.invites.list?${params}`);
  }

  async revokeOrgInvite(inviteId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.invites.revoke', {
      method: 'POST',
      body: JSON.stringify({ inviteId }),
    });
  }

  async acceptOrgInvite(token: string): Promise<{ success: boolean; organizationId: string }> {
    return this.fetch('/xrpc/io.exprsn.org.invites.accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // Content Moderation Queue
  async submitOrgContent(data: {
    organizationId: string;
    videoUri: string;
    caption?: string;
  }): Promise<{ queued?: boolean; published?: boolean; queueId?: string }> {
    return this.fetch('/xrpc/io.exprsn.org.content.submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getOrgContentQueue(
    organizationId: string,
    options: { status?: string; limit?: number } = {}
  ): Promise<{ items: ContentQueueItemView[] }> {
    const { status = 'pending', limit = 20 } = options;
    const params = new URLSearchParams({ organizationId, status, limit: String(limit) });
    return this.fetch(`/xrpc/io.exprsn.org.content.queue?${params}`);
  }

  async reviewOrgContent(data: {
    queueId: string;
    action: 'approve' | 'reject' | 'request_revision';
    notes?: string;
  }): Promise<{ success: boolean; status: string }> {
    return this.fetch('/xrpc/io.exprsn.org.content.review', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Organization Analytics
  async getOrgAnalytics(
    organizationId: string,
    period: '7d' | '30d' | '90d' = '7d'
  ): Promise<OrganizationAnalyticsView> {
    const params = new URLSearchParams({ organizationId, period });
    return this.fetch(`/xrpc/io.exprsn.org.analytics.overview?${params}`);
  }

  // Blocked Words Management
  async getOrganizationBlockedWords(
    orgId: string
  ): Promise<{ words: OrganizationBlockedWordView[] }> {
    const params = new URLSearchParams({ organizationId: orgId });
    return this.fetch(`/xrpc/io.exprsn.org.blockedWords.list?${params}`);
  }

  async addOrganizationBlockedWord(
    orgId: string,
    data: { word: string; severity?: 'low' | 'medium' | 'high' }
  ): Promise<{ word: OrganizationBlockedWordView }> {
    return this.fetch('/xrpc/io.exprsn.org.blockedWords.add', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, ...data }),
    });
  }

  async updateOrganizationBlockedWord(
    orgId: string,
    wordId: string,
    data: { severity?: 'low' | 'medium' | 'high'; enabled?: boolean }
  ): Promise<{ word: OrganizationBlockedWordView }> {
    return this.fetch('/xrpc/io.exprsn.org.blockedWords.update', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, wordId, ...data }),
    });
  }

  async removeOrganizationBlockedWord(
    orgId: string,
    wordId: string
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.blockedWords.remove', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, wordId }),
    });
  }

  async importOrganizationBlockedWords(
    orgId: string,
    words: string[],
    severity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<{ imported: number; duplicates: number }> {
    return this.fetch('/xrpc/io.exprsn.org.blockedWords.import', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, words, severity }),
    });
  }

  async exportOrganizationBlockedWords(
    orgId: string,
    format: 'txt' | 'json'
  ): Promise<Blob> {
    const params = new URLSearchParams({ organizationId: orgId, format });
    const headers: HeadersInit = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const response = await fetch(
      `${this.baseUrl}/xrpc/io.exprsn.org.blockedWords.export?${params}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`Failed to export blocked words: ${response.status}`);
    }

    return response.blob();
  }

  // Stats & Activity
  async getOrganizationStats(orgId: string): Promise<OrganizationStatsView> {
    const params = new URLSearchParams({ organizationId: orgId });
    return this.fetch(`/xrpc/io.exprsn.org.stats?${params}`);
  }

  async getOrganizationActivity(
    orgId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<{ activity: OrganizationActivityView[]; cursor?: string }> {
    const { cursor, limit = 50 } = options;
    const params = new URLSearchParams({ organizationId: orgId, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.org.activity?${params}`);
  }

  // Danger Zone
  async transferOrganizationOwnership(
    orgId: string,
    newOwnerDid: string
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.org.transferOwnership', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, newOwnerDid }),
    });
  }

  async deleteOrganization(data: {
    organizationId: string;
    confirmName: string;
    childAction?: 'orphan' | 'reparent' | 'cascade';
    newParentId?: string;
  }): Promise<{ success: boolean; orphanedCount?: number; reparentedCount?: number; deletedCount?: number }> {
    return this.fetch('/xrpc/io.exprsn.org.delete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Organization Hierarchy
  async getOrganizationChildren(
    orgId: string,
    options: { recursive?: boolean; cursor?: string; limit?: number } = {}
  ): Promise<{ organizations: OrganizationView[]; cursor?: string }> {
    const { recursive = false, cursor, limit = 50 } = options;
    const params = new URLSearchParams({
      organizationId: orgId,
      limit: String(limit),
      recursive: String(recursive),
    });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.org.getChildren?${params}`);
  }

  async getOrganizationAncestors(orgId: string): Promise<{ ancestors: OrganizationView[] }> {
    const params = new URLSearchParams({ organizationId: orgId });
    return this.fetch(`/xrpc/io.exprsn.org.getAncestors?${params}`);
  }

  async setOrganizationParent(
    orgId: string,
    parentId: string | null
  ): Promise<{ organization: OrganizationView }> {
    return this.fetch('/xrpc/io.exprsn.org.setParent', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, parentOrganizationId: parentId }),
    });
  }

  async setOrganizationDomain(
    orgId: string,
    domainId: string | null
  ): Promise<{ organization: OrganizationView }> {
    return this.fetch('/xrpc/io.exprsn.org.setDomain', {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, domainId }),
    });
  }

  // Admin Organization Management
  async adminCreateOrganization(data: {
    name: string;
    type: 'team' | 'enterprise' | 'nonprofit' | 'business';
    domainId?: string;
    parentOrganizationId?: string;
    ownerDid?: string;
    website?: string;
  }): Promise<{ organization: OrganizationView }> {
    return this.fetch('/xrpc/io.exprsn.admin.org.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminListOrganizations(options?: {
    domainId?: string;
    parentId?: string;
    type?: 'team' | 'enterprise' | 'nonprofit' | 'business';
    cursor?: string;
    limit?: number;
  }): Promise<{ organizations: OrganizationView[]; cursor?: string }> {
    const params = new URLSearchParams();
    if (options?.domainId) params.set('domainId', options.domainId);
    if (options?.parentId) params.set('parentId', options.parentId);
    if (options?.type) params.set('type', options.type);
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    return this.fetch(`/xrpc/io.exprsn.admin.org.list?${params}`);
  }

  async adminDeleteOrganization(data: {
    organizationId: string;
    childAction?: 'orphan' | 'reparent' | 'cascade';
    newParentId?: string;
  }): Promise<{ success: boolean; orphanedCount?: number; reparentedCount?: number; deletedCount?: number }> {
    return this.fetch('/xrpc/io.exprsn.admin.org.delete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // =============================================================================
  // Live Streaming API
  // =============================================================================

  async createStream(data: {
    title: string;
    description?: string;
    category?: string;
    tags?: string[];
    visibility?: 'public' | 'followers' | 'private';
    scheduledAt?: string;
  }): Promise<{ stream: LiveStreamView }> {
    return this.fetch('/xrpc/io.exprsn.live.createStream', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getStream(streamId: string): Promise<{ stream: LiveStreamView }> {
    const params = new URLSearchParams({ id: streamId });
    return this.fetch(`/xrpc/io.exprsn.live.getStream?${params}`);
  }

  async startStream(streamId: string): Promise<{ stream: LiveStreamView }> {
    return this.fetch('/xrpc/io.exprsn.live.startStream', {
      method: 'POST',
      body: JSON.stringify({ id: streamId }),
    });
  }

  async endStream(streamId: string): Promise<{ stream: LiveStreamView }> {
    return this.fetch('/xrpc/io.exprsn.live.endStream', {
      method: 'POST',
      body: JSON.stringify({ id: streamId }),
    });
  }

  async updateStream(
    streamId: string,
    data: { title?: string; description?: string; category?: string; tags?: string[] }
  ): Promise<{ stream: LiveStreamView }> {
    return this.fetch('/xrpc/io.exprsn.live.updateStream', {
      method: 'POST',
      body: JSON.stringify({ id: streamId, ...data }),
    });
  }

  async deleteStream(streamId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.live.deleteStream', {
      method: 'POST',
      body: JSON.stringify({ id: streamId }),
    });
  }

  async getLiveNow(
    options: { category?: string; cursor?: string; limit?: number } = {}
  ): Promise<{ streams: LiveStreamSummary[]; cursor?: string }> {
    const { category, cursor, limit = 20 } = options;
    const params = new URLSearchParams({ limit: String(limit) });
    if (category) params.set('category', category);
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.live.getLiveNow?${params}`);
  }

  async getScheduledStreams(
    limit = 20
  ): Promise<{ streams: LiveStreamSummary[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    return this.fetch(`/xrpc/io.exprsn.live.getScheduled?${params}`);
  }

  async getUserStreams(
    userDid: string,
    options: { status?: string; cursor?: string; limit?: number } = {}
  ): Promise<{ streams: LiveStreamSummary[]; cursor?: string }> {
    const { status, cursor, limit = 20 } = options;
    const params = new URLSearchParams({ did: userDid, limit: String(limit) });
    if (status) params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/xrpc/io.exprsn.live.getUserStreams?${params}`);
  }

  // Live Chat
  async getStreamChat(
    streamId: string,
    options: { before?: string; limit?: number } = {}
  ): Promise<{ messages: LiveChatMessage[] }> {
    const { before, limit = 50 } = options;
    const params = new URLSearchParams({ streamId, limit: String(limit) });
    if (before) params.set('before', before);
    return this.fetch(`/xrpc/io.exprsn.live.chat.messages?${params}`);
  }

  async sendStreamChat(streamId: string, message: string): Promise<{ message: LiveChatMessage }> {
    return this.fetch('/xrpc/io.exprsn.live.chat.send', {
      method: 'POST',
      body: JSON.stringify({ streamId, message }),
    });
  }

  async deleteStreamChat(streamId: string, messageId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.live.chat.delete', {
      method: 'POST',
      body: JSON.stringify({ streamId, messageId }),
    });
  }

  // Stream Moderation
  async addStreamModerator(streamId: string, userDid: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.live.moderators.add', {
      method: 'POST',
      body: JSON.stringify({ streamId, did: userDid }),
    });
  }

  async removeStreamModerator(streamId: string, userDid: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.live.moderators.remove', {
      method: 'POST',
      body: JSON.stringify({ streamId, did: userDid }),
    });
  }

  async banFromStream(
    streamId: string,
    userDid: string,
    reason?: string,
    duration?: number
  ): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.live.ban', {
      method: 'POST',
      body: JSON.stringify({ streamId, did: userDid, reason, duration }),
    });
  }

  async unbanFromStream(streamId: string, userDid: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.live.unban', {
      method: 'POST',
      body: JSON.stringify({ streamId, did: userDid }),
    });
  }

  // Viewer tracking
  async joinStream(streamId: string): Promise<{ viewerCount: number }> {
    return this.fetch('/xrpc/io.exprsn.live.viewer.join', {
      method: 'POST',
      body: JSON.stringify({ streamId }),
    });
  }

  async leaveStream(streamId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.live.viewer.leave', {
      method: 'POST',
      body: JSON.stringify({ streamId }),
    });
  }

  // =============================================
  // Cluster Admin API
  // =============================================

  async adminClusterList(): Promise<{
    clusters: Array<{
      id: string;
      name: string;
      type: 'docker' | 'kubernetes';
      endpoint: string | null;
      status: 'active' | 'draining' | 'offline' | 'error';
      region: string | null;
      maxWorkers: number | null;
      currentWorkers: number;
      gpuEnabled: boolean;
      gpuCount: number;
      lastHealthCheck: string | null;
      errorMessage: string | null;
      createdAt: string;
      workerStats?: { total: number; active: number; offline: number };
    }>;
  }> {
    return this.fetch('/xrpc/io.exprsn.admin.cluster.list');
  }

  async adminClusterGet(clusterId: string): Promise<{
    cluster: {
      id: string;
      name: string;
      type: 'docker' | 'kubernetes';
      endpoint: string | null;
      status: string;
      region: string | null;
      maxWorkers: number | null;
      currentWorkers: number;
      gpuEnabled: boolean;
      gpuCount: number;
      createdAt: string;
    };
    workers: Array<{
      id: string;
      hostname: string;
      status: string;
      activeJobs: number;
      totalProcessed: number;
      lastHeartbeat: string | null;
    }>;
  }> {
    return this.fetch(`/xrpc/io.exprsn.admin.cluster.get?clusterId=${clusterId}`);
  }

  async adminClusterCreate(data: {
    name: string;
    type: 'docker' | 'kubernetes';
    endpoint?: string;
    region?: string;
    maxWorkers?: number;
    gpuEnabled?: boolean;
  }): Promise<{ cluster: { id: string; name: string } }> {
    return this.fetch('/xrpc/io.exprsn.admin.cluster.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminClusterUpdate(data: {
    clusterId: string;
    name?: string;
    endpoint?: string;
    region?: string;
    maxWorkers?: number;
    gpuEnabled?: boolean;
    status?: 'active' | 'draining' | 'offline';
  }): Promise<{ cluster: { id: string; name: string; status: string } }> {
    return this.fetch('/xrpc/io.exprsn.admin.cluster.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminClusterDelete(clusterId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.cluster.delete', {
      method: 'POST',
      body: JSON.stringify({ clusterId }),
    });
  }

  async adminClusterScale(clusterId: string, replicas: number): Promise<{
    cluster: { id: string; maxWorkers: number };
    message: string;
  }> {
    return this.fetch('/xrpc/io.exprsn.admin.cluster.scale', {
      method: 'POST',
      body: JSON.stringify({ clusterId, replicas }),
    });
  }

  async adminClusterGetMetrics(clusterId: string): Promise<{
    clusterId: string;
    metrics: {
      workerCount: number;
      activeWorkers: number;
      offlineWorkers: number;
      totalJobsProcessed: number;
      totalJobsFailed: number;
      activeJobs: number;
      averageProcessingTimeSeconds: number;
      successRate: number;
    };
    timestamp: string;
  }> {
    return this.fetch(`/xrpc/io.exprsn.admin.cluster.getMetrics?clusterId=${clusterId}`);
  }

  async adminClusterDrain(clusterId: string): Promise<{
    cluster: { id: string; status: string };
    message: string;
  }> {
    return this.fetch('/xrpc/io.exprsn.admin.cluster.drain', {
      method: 'POST',
      body: JSON.stringify({ clusterId }),
    });
  }

  async adminClusterActivate(clusterId: string): Promise<{
    cluster: { id: string; status: string };
  }> {
    return this.fetch('/xrpc/io.exprsn.admin.cluster.activate', {
      method: 'POST',
      body: JSON.stringify({ clusterId }),
    });
  }

  // =============================================
  // Domain Management API
  // =============================================

  async adminDomainsList(options?: {
    q?: string;
    type?: 'hosted' | 'federated';
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    domains: Array<{
      id: string;
      name: string;
      domain: string;
      type: 'hosted' | 'federated';
      status: string;
      userCount: number;
      groupCount: number;
      certificateCount: number;
      verifiedAt?: string;
      createdAt: string;
    }>;
    stats: {
      total: number;
      active: number;
      pending: number;
      hosted: number;
      federated: number;
    };
    cursor?: string;
  }> {
    const params = new URLSearchParams();
    if (options?.q) params.set('q', options.q);
    if (options?.type) params.set('type', options.type);
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.domains.list?${params.toString()}`);
  }

  async adminDomainsGet(id: string): Promise<{
    domain: {
      id: string;
      name: string;
      domain: string;
      type: 'hosted' | 'federated';
      status: string;
      handleSuffix?: string;
      pdsEndpoint?: string;
      federationDid?: string;
      features?: Record<string, boolean>;
      rateLimits?: Record<string, number>;
      branding?: Record<string, string>;
      dnsVerificationToken?: string;
      dnsVerifiedAt?: string;
      ownerOrgId?: string;
      ownerUserDid?: string;
      userCount: number;
      groupCount: number;
      certificateCount: number;
      verifiedAt?: string;
      createdAt: string;
      updatedAt: string;
      plcConfig?: {
        enabled: boolean;
        mode: 'standalone' | 'external' | 'disabled';
        externalPlcUrl?: string;
        allowCustomHandles: boolean;
        requireInviteCode: boolean;
        defaultPdsEndpoint?: string;
        handleValidationRules?: {
          minLength: number;
          maxLength: number;
          allowedCharacters: string;
          reservedHandles: string[];
        };
        orgHandleSuffixes?: Record<string, string>;
      };
      identityCount?: number;
    };
    userStats: Record<string, number>;
    groupCount: number;
    intermediateCert?: {
      id: string;
      commonName: string;
      status: string;
      notBefore: string;
      notAfter: string;
    };
    entityCertCount: number;
    recentActivity: Array<{
      id: string;
      action: string;
      actorDid?: string;
      targetType?: string;
      targetId?: string;
      metadata?: Record<string, unknown>;
      createdAt: string;
    }>;
  }> {
    return this.fetch(`/xrpc/io.exprsn.admin.domains.get?id=${id}`);
  }

  async adminDomainsCreate(data: {
    name: string;
    domain: string;
    type: 'hosted' | 'federated';
    handleSuffix?: string;
    pdsEndpoint?: string;
    features?: Record<string, boolean>;
    rateLimits?: Record<string, number>;
    ownerOrgId?: string;
    ownerUserDid?: string;
  }): Promise<{
    domain: {
      id: string;
      name: string;
      domain: string;
      type: string;
      status: string;
      dnsVerificationToken: string;
    };
  }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminDomainsUpdate(data: {
    id: string;
    name?: string;
    status?: string;
    features?: Record<string, boolean>;
    rateLimits?: Record<string, number>;
    branding?: Record<string, string>;
    pdsEndpoint?: string;
    ownerOrgId?: string;
    ownerUserDid?: string;
    plcConfig?: {
      enabled?: boolean;
      mode?: 'standalone' | 'external' | 'disabled';
      externalPlcUrl?: string;
      allowCustomHandles?: boolean;
      requireInviteCode?: boolean;
      defaultPdsEndpoint?: string;
      handleValidationRules?: {
        minLength: number;
        maxLength: number;
        allowedCharacters: string;
        reservedHandles: string[];
      };
      orgHandleSuffixes?: Record<string, string>;
    };
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminDomainsDelete(id: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  async adminDomainsVerify(id: string): Promise<{ success: boolean; verified: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.verify', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  async adminDomainsUsersList(domainId: string, options?: {
    role?: string;
    limit?: number;
  }): Promise<{
    users: Array<{
      id: string;
      userDid: string;
      role: string;
      permissions: string[];
      handle?: string;
      isActive: boolean;
      createdAt: string;
      user?: {
        handle: string;
        displayName?: string;
        avatar?: string;
      };
    }>;
  }> {
    const params = new URLSearchParams({ domainId });
    if (options?.role) params.set('role', options.role);
    if (options?.limit) params.set('limit', options.limit.toString());
    return this.fetch(`/xrpc/io.exprsn.admin.domains.users.list?${params.toString()}`);
  }

  async adminDomainsUsersAdd(data: {
    domainId: string;
    userDid: string;
    role: 'admin' | 'moderator' | 'member';
    permissions?: string[];
  }): Promise<{ success: boolean; id: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.users.add', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminDomainsUsersRemove(domainId: string, userDid: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.users.remove', {
      method: 'POST',
      body: JSON.stringify({ domainId, userDid }),
    });
  }

  async adminDomainsUsersUpdateRole(data: {
    domainId: string;
    userDid: string;
    role: 'admin' | 'moderator' | 'member';
    permissions?: string[];
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.users.updateRole', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminDomainsGroupsList(domainId: string): Promise<{
    groups: Array<{
      id: string;
      name: string;
      description?: string;
      permissions: string[];
      memberCount: number;
      isDefault: boolean;
      createdAt: string;
    }>;
  }> {
    return this.fetch(`/xrpc/io.exprsn.admin.domains.groups.list?domainId=${domainId}`);
  }

  async adminDomainsGroupsCreate(data: {
    domainId: string;
    name: string;
    description?: string;
    permissions?: string[];
    isDefault?: boolean;
  }): Promise<{ success: boolean; id: string }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.groups.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminDomainsGroupsUpdate(data: {
    groupId: string;
    name?: string;
    description?: string;
    permissions?: string[];
    isDefault?: boolean;
  }): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.groups.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminDomainsGroupsDelete(groupId: string, domainId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.domains.groups.delete', {
      method: 'POST',
      body: JSON.stringify({ groupId, domainId }),
    });
  }

  // =============================================================================
  // Sound Trends API
  // =============================================================================

  async getTrendingSounds(options: {
    limit?: number;
    cursor?: string;
  } = {}): Promise<TrendingSoundsResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.sound.getTrending?${params}`);
  }

  async getSound(soundId: string): Promise<SoundDetailResponse> {
    const params = new URLSearchParams({ soundId });
    return this.fetch(`/xrpc/io.exprsn.sound.getSound?${params}`);
  }

  async getVideosUsingSound(
    soundId: string,
    options: { limit?: number; cursor?: string; sort?: 'popular' | 'recent' } = {}
  ): Promise<SoundVideosResponse> {
    const params = new URLSearchParams({ soundId });
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.sort) params.set('sort', options.sort);
    return this.fetch(`/xrpc/io.exprsn.sound.getVideosUsing?${params}`);
  }

  async searchSounds(
    query: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<SoundSearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.sound.search?${params}`);
  }

  async getSuggestedSounds(limit?: number): Promise<{ sounds: SuggestedSoundView[] }> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    return this.fetch(`/xrpc/io.exprsn.sound.getSuggested?${params}`);
  }

  // Challenge methods
  async getChallenge(params: { id?: string; hashtag?: string }): Promise<ChallengeDetailResponse> {
    const urlParams = new URLSearchParams();
    if (params.id) urlParams.set('id', params.id);
    if (params.hashtag) urlParams.set('hashtag', params.hashtag);
    return this.fetch(`/xrpc/io.exprsn.challenge.getChallenge?${urlParams}`);
  }

  async getActiveChallenges(options?: { limit?: number; cursor?: string }): Promise<ChallengesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.challenge.getActive?${params}`);
  }

  async getUpcomingChallenges(options?: { limit?: number; cursor?: string }): Promise<ChallengesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.challenge.getUpcoming?${params}`);
  }

  async getEndedChallenges(options?: { limit?: number; cursor?: string }): Promise<ChallengesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.challenge.getEnded?${params}`);
  }

  async getChallengeLeaderboard(
    challengeId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<ChallengeLeaderboardResponse> {
    const params = new URLSearchParams({ challengeId });
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.challenge.getLeaderboard?${params}`);
  }

  async getChallengeEntries(
    challengeId: string,
    options?: { sort?: 'recent' | 'top'; limit?: number; cursor?: string }
  ): Promise<ChallengeEntriesResponse> {
    const params = new URLSearchParams({ challengeId });
    if (options?.sort) params.set('sort', options.sort);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.challenge.getEntries?${params}`);
  }

  async getChallengeFeatured(challengeId: string): Promise<ChallengeFeaturedResponse> {
    return this.fetch(`/xrpc/io.exprsn.challenge.getFeatured?challengeId=${challengeId}`);
  }

  async getUserChallengeParticipation(
    userDid: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<UserChallengeParticipationResponse> {
    const params = new URLSearchParams({ userDid });
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.challenge.getUserParticipation?${params}`);
  }

  async searchChallenges(
    query: string,
    options?: { status?: string; limit?: number; cursor?: string }
  ): Promise<ChallengesResponse> {
    const params = new URLSearchParams({ q: query });
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.challenge.search?${params}`);
  }

  // Admin challenge methods
  async adminCreateChallenge(data: AdminCreateChallengeInput): Promise<{ challenge: ChallengeView }> {
    return this.fetch('/xrpc/io.exprsn.admin.challenge.create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminUpdateChallenge(data: AdminUpdateChallengeInput): Promise<{ challenge: ChallengeView }> {
    return this.fetch('/xrpc/io.exprsn.admin.challenge.update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminDeleteChallenge(id: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.admin.challenge.delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  async adminSetChallengeFeatured(
    challengeId: string,
    entryIds: string[],
    featured: boolean
  ): Promise<{ updated: number }> {
    return this.fetch('/xrpc/io.exprsn.admin.challenge.setFeatured', {
      method: 'POST',
      body: JSON.stringify({ challengeId, entryIds, featured }),
    });
  }

  async adminSetChallengeWinners(
    challengeId: string,
    entryIds: string[]
  ): Promise<{ updated: number }> {
    return this.fetch('/xrpc/io.exprsn.admin.challenge.setWinners', {
      method: 'POST',
      body: JSON.stringify({ challengeId, entryIds }),
    });
  }

  async adminGetChallengeStats(challengeId: string): Promise<ChallengeStatsResponse> {
    return this.fetch(`/xrpc/io.exprsn.admin.challenge.getStats?challengeId=${challengeId}`);
  }

  async adminListChallenges(options?: {
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<AdminChallengesResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.fetch(`/xrpc/io.exprsn.admin.challenge.list?${params}`);
  }

  // Watch Party methods
  async createWatchParty(options: CreateWatchPartyInput): Promise<{ party: WatchPartyView }> {
    return this.fetch('/xrpc/io.exprsn.party.create', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async getWatchParty(params: { id?: string; inviteCode?: string }): Promise<WatchPartyStateResponse> {
    const urlParams = new URLSearchParams();
    if (params.id) urlParams.set('id', params.id);
    if (params.inviteCode) urlParams.set('inviteCode', params.inviteCode);
    return this.fetch(`/xrpc/io.exprsn.party.get?${urlParams}`);
  }

  async joinWatchParty(inviteCode: string): Promise<WatchPartyStateResponse & { joined: boolean }> {
    return this.fetch('/xrpc/io.exprsn.party.join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async leaveWatchParty(partyId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.party.leave', {
      method: 'POST',
      body: JSON.stringify({ partyId }),
    });
  }

  async endWatchParty(partyId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.party.end', {
      method: 'POST',
      body: JSON.stringify({ partyId }),
    });
  }

  async addToWatchPartyQueue(partyId: string, videoUri: string): Promise<{ queueItem: WatchPartyQueueItem }> {
    return this.fetch('/xrpc/io.exprsn.party.addToQueue', {
      method: 'POST',
      body: JSON.stringify({ partyId, videoUri }),
    });
  }

  async removeFromWatchPartyQueue(partyId: string, queueItemId: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.party.removeFromQueue', {
      method: 'POST',
      body: JSON.stringify({ partyId, queueItemId }),
    });
  }

  async getWatchPartyQueue(partyId: string): Promise<{ queue: WatchPartyQueueItem[] }> {
    return this.fetch(`/xrpc/io.exprsn.party.getQueue?partyId=${partyId}`);
  }

  async getWatchPartyMessages(partyId: string, limit?: number): Promise<{ messages: WatchPartyMessage[] }> {
    const params = new URLSearchParams({ partyId });
    if (limit) params.set('limit', String(limit));
    return this.fetch(`/xrpc/io.exprsn.party.getMessages?${params}`);
  }

  async getWatchPartyParticipants(partyId: string): Promise<{ participants: WatchPartyParticipant[] }> {
    return this.fetch(`/xrpc/io.exprsn.party.getParticipants?partyId=${partyId}`);
  }

  async promoteToWatchPartyCohost(partyId: string, targetUserDid: string): Promise<{ success: boolean }> {
    return this.fetch('/xrpc/io.exprsn.party.promoteToCohost', {
      method: 'POST',
      body: JSON.stringify({ partyId, targetUserDid }),
    });
  }

  async getUserWatchParties(): Promise<{ parties: WatchPartyView[] }> {
    return this.fetch('/xrpc/io.exprsn.party.getUserParties');
  }
}

// Sound types
export interface TrendingSoundView {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  audioUrl?: string;
  coverUrl?: string;
  useCount: number;
  recentUseCount: number;
  velocity: number;
  rank: number;
  score: number;
  trendingDirection: 'up' | 'stable' | 'down';
  sampleVideos: Array<{ uri: string; thumbnailUrl?: string }>;
}

export interface TrendingSoundsResponse {
  sounds: TrendingSoundView[];
  cursor?: string;
}

export interface SoundView {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  audioUrl?: string;
  coverUrl?: string;
  useCount: number;
  recentUseCount: number;
  createdAt: string;
  trending?: {
    rank: number;
    velocity: number;
    score: number;
  } | null;
}

export interface SoundDetailResponse {
  sound: SoundView;
  originalVideo?: {
    uri: string;
    thumbnailUrl?: string;
    author?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    } | null;
  } | null;
  sampleVideos: Array<{
    uri: string;
    thumbnailUrl?: string;
    viewCount: number;
    likeCount: number;
  }>;
}

export interface SoundVideosResponse {
  sound: {
    id: string;
    title: string;
    artist?: string;
    useCount: number;
  };
  videos: Array<VideoView & { author: ProfileView | null }>;
  cursor?: string;
}

export interface SoundSearchResponse {
  sounds: Array<{
    id: string;
    title: string;
    artist?: string;
    duration?: number;
    audioUrl?: string;
    coverUrl?: string;
    useCount: number;
    createdAt: string;
  }>;
  cursor?: string;
}

export interface SuggestedSoundView {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  audioUrl?: string;
  coverUrl?: string;
  useCount: number;
  sampleVideo?: { uri: string; thumbnailUrl?: string } | null;
}

// Challenge types
export interface ChallengeView {
  id: string;
  name: string;
  description?: string;
  hashtag: string;
  rules?: string;
  prizes?: string;
  coverImage?: string;
  status: 'draft' | 'upcoming' | 'active' | 'voting' | 'ended';
  entryCount: number;
  participantCount: number;
  totalViews: number;
  totalEngagement: number;
  startAt: string;
  endAt: string;
  votingEndAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface ChallengeEntryView {
  id: string;
  challengeId: string;
  videoUri: string;
  userDid: string;
  rank?: number;
  engagementScore: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isFeatured: boolean;
  isWinner: boolean;
  createdAt: string;
  video?: VideoView;
  author?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    verified?: boolean;
  };
}

export interface ChallengesResponse {
  challenges: ChallengeView[];
  cursor?: string;
}

export interface ChallengeDetailResponse {
  challenge: ChallengeView;
  topEntries: ChallengeEntryView[];
  featuredEntries: ChallengeEntryView[];
  userParticipation?: {
    entryCount: number;
    bestRank?: number;
  } | null;
}

export interface ChallengeLeaderboardResponse {
  challenge: { id: string; name: string; hashtag: string };
  entries: ChallengeEntryView[];
  cursor?: string;
}

export interface ChallengeEntriesResponse {
  challenge: { id: string; name: string; hashtag: string };
  entries: ChallengeEntryView[];
  cursor?: string;
}

export interface ChallengeFeaturedResponse {
  challenge: { id: string; name: string; hashtag: string };
  featured: ChallengeEntryView[];
  winners: ChallengeEntryView[];
}

export interface UserChallengeParticipationResponse {
  participation: Array<{
    challenge: ChallengeView;
    entryCount: number;
    bestRank?: number;
    entries: ChallengeEntryView[];
  }>;
  cursor?: string;
}

export interface AdminCreateChallengeInput {
  name: string;
  description?: string;
  hashtag: string;
  rules?: string;
  prizes?: string;
  coverImage?: string;
  startAt: string;
  endAt: string;
  votingEndAt?: string;
}

export interface AdminUpdateChallengeInput {
  id: string;
  name?: string;
  description?: string;
  rules?: string;
  prizes?: string;
  coverImage?: string;
  status?: string;
  startAt?: string;
  endAt?: string;
  votingEndAt?: string;
}

export interface ChallengeStatsResponse {
  challenge: ChallengeView;
  stats: {
    totalEntries: number;
    totalParticipants: number;
    entriesLast24h: number;
    participantsLast24h: number;
    avgEngagementScore: number;
    topEngagementScore: number;
  };
  topParticipants: Array<{
    userDid: string;
    handle?: string;
    displayName?: string;
    avatar?: string;
    entryCount: number;
    bestRank?: number;
    totalEngagement: number;
  }>;
}

export interface AdminChallengesResponse {
  challenges: ChallengeView[];
  cursor?: string;
}

// Watch Party types
export interface WatchPartyView {
  id: string;
  hostDid: string;
  name: string;
  inviteCode: string;
  status: 'active' | 'ended';
  maxParticipants: number;
  currentVideoUri: string | null;
  currentPosition: number;
  isPlaying: boolean;
  chatEnabled: boolean;
  createdAt: string;
}

export interface WatchPartyParticipant {
  id: string;
  partyId: string;
  userDid: string;
  role: 'host' | 'cohost' | 'viewer';
  isPresent: boolean;
  joinedAt: string;
  user?: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface WatchPartyQueueItem {
  id: string;
  partyId: string;
  videoUri: string;
  addedBy: string;
  position: number;
  addedAt: string;
  video?: {
    thumbnail?: string;
    duration?: number;
    caption?: string;
    author?: {
      handle: string;
      displayName?: string;
    };
  };
}

export interface WatchPartyMessage {
  id: string;
  partyId: string;
  senderDid: string;
  text: string;
  messageType: 'text' | 'emoji' | 'system' | 'reaction';
  createdAt: string;
  sender?: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface WatchPartyStateResponse {
  party: WatchPartyView;
  participants: WatchPartyParticipant[];
  queue: WatchPartyQueueItem[];
  recentMessages: WatchPartyMessage[];
}

export interface CreateWatchPartyInput {
  name: string;
  maxParticipants?: number;
  chatEnabled?: boolean;
  initialVideoUri?: string;
}

export interface WatchPartyPlaybackState {
  videoUri: string | null;
  position: number;
  isPlaying: boolean;
  updatedAt: number;
}

// Social links type
export interface SocialLinks {
  twitter?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  discord?: string;
}

// Profile types
export interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  socialLinks?: SocialLinks;
  followerCount: number;
  followingCount: number;
  videoCount: number;
  verified: boolean;
  createdAt: string;
  viewer?: {
    following: boolean;
    followUri?: string;
    followedBy?: boolean;
    blocking?: boolean;
    blockUri?: string;
    muting?: boolean;
    muteUri?: string;
    blockedBy?: boolean;
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
    activeUsers?: number;
    newUsersToday?: number;
    newVideosToday?: number;
    totalViews?: number;
    totalLikes?: number;
    newUsersWeek?: number;
    newVideosWeek?: number;
    totalComments?: number;
    actionedReports?: number;
    dismissedReports?: number;
    activeRenderJobs?: number;
    queuedRenderJobs?: number;
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
  topVideos?: Array<{
    uri: string;
    caption?: string;
    thumbnailUrl?: string;
    viewCount: number;
  }>;
  topCreators?: Array<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    verified?: boolean;
    followerCount: number;
  }>;
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

export interface ModerationQueueItem {
  id: string;
  contentUri: string;
  contentType: 'video' | 'comment' | 'loop' | 'collab' | 'user';
  status: 'pending' | 'in_review' | 'escalated' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
  reportCount: number;
  reasons: string[];
  content: {
    uri: string;
    text?: string;
    thumbnail?: string;
    author: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
  reports: Array<{
    id: string;
    reason: string;
    description?: string;
    reporter: {
      did: string;
      handle: string;
    };
    createdAt: string;
  }>;
  assignedTo?: {
    did: string;
    handle: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  resolvedAt?: string;
  resolution?: {
    action: string;
    reason: string;
    moderator: {
      did: string;
      handle: string;
    };
  };
}

export interface BannedWord {
  id: string;
  word: string;
  severity: 'low' | 'medium' | 'high';
  action: 'flag' | 'block' | 'shadow';
  reason?: string;
  enabled: boolean;
  matchCount: number;
  createdAt: string;
  createdBy: {
    did: string;
    handle: string;
  };
}

export interface BannedTag {
  id: string;
  tag: string;
  severity: 'low' | 'medium' | 'high';
  action: 'flag' | 'block' | 'shadow';
  reason?: string;
  enabled: boolean;
  matchCount: number;
  createdAt: string;
  createdBy: {
    did: string;
    handle: string;
  };
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

// Render Pipeline types
export interface RenderJobView {
  id: string;
  projectId: string;
  userDid: string;
  userHandle?: string;
  status: string;
  progress: number;
  priority: string;
  priorityScore: number;
  format: string;
  quality: string;
  width: number;
  height: number;
  fps: number;
  workerId?: string;
  batchId?: string;
  dependsOnJobId?: string;
  estimatedDurationSeconds?: number;
  actualDurationSeconds?: number;
  outputUrl?: string;
  fileSize?: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  pausedAt?: string;
}

export interface RenderWorkerView {
  id: string;
  hostname: string;
  status: string;
  concurrency: number;
  activeJobs: number;
  totalProcessed: number;
  failedJobs: number;
  avgProcessingTime?: number;
  gpuEnabled: boolean;
  gpuModel?: string;
  lastHeartbeat?: string;
  startedAt: string;
}

export interface RenderBatchView {
  id: string;
  userDid: string;
  userHandle?: string;
  name?: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: string;
  createdAt: string;
  completedAt?: string;
}

export interface UserRenderQuotaView {
  userDid: string;
  userHandle?: string;
  dailyLimit: number;
  dailyUsed: number;
  weeklyLimit: number;
  weeklyUsed: number;
  concurrentLimit: number;
  maxQuality: string;
  priorityBoost: number;
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

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  userReacted: boolean;
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
  reactions?: MessageReaction[];
}

// Actor/Profile types
export interface ActorProfileView {
  did: string;
  handle: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  followerCount?: number;
  followingCount?: number;
  videoCount?: number;
  likeCount?: number;
  verified?: boolean;
  createdAt?: string;
  viewer?: {
    following?: boolean;
    followedBy?: boolean;
    followUri?: string;
    muted?: boolean;
    blocked?: boolean;
    blockUri?: string;
  };
}

// Notification types
export interface NotificationView {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    verified?: boolean;
  };
  reason: 'like' | 'comment' | 'follow' | 'mention' | 'repost' | 'reply' | 'quote';
  reasonSubject?: string;
  record?: {
    uri?: string;
    text?: string;
    [key: string]: unknown;
  };
  isRead: boolean;
  indexedAt: string;
}

// Feed types
export interface FeedViewPost {
  post: VideoView;
  reason?: {
    $type: string;
    by?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
    indexedAt?: string;
  };
}

// Video interaction types
export interface LikeView {
  uri: string;
  author: ActorProfileView;
  indexedAt: string;
}

export interface RepostUserView {
  uri: string;
  author: ActorProfileView;
  caption?: string;
  indexedAt: string;
}

// List types
export interface ListView {
  uri: string;
  cid: string;
  name: string;
  description?: string;
  avatar?: string;
  purpose: 'curatelist' | 'modlist';
  memberCount: number;
  createdAt: string;
  creator?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface ListItemView {
  uri: string;
  subject: ActorProfileView;
  addedAt: string;
}

// Collab & Loop types (Rebranded Duets & Stitches)
export interface CollabView {
  uri: string;
  video: VideoView;
  author: ActorProfileView;
  layout: 'side-by-side' | 'react' | 'green-screen';
  createdAt: string;
}

export interface LoopView {
  uri: string;
  video: VideoView;
  author: ActorProfileView;
  startTime: number;
  endTime: number;
  createdAt: string;
}

// Legacy Stitch & Duet types (for backward compatibility)
export interface StitchView {
  uri: string;
  video: VideoView;
  author: ActorProfileView;
  startTime: number;
  endTime: number;
  createdAt: string;
}

export interface DuetView {
  uri: string;
  video: VideoView;
  author: ActorProfileView;
  layout: 'side-by-side' | 'react' | 'green-screen';
  createdAt: string;
}

// Sound & Tag types
export interface SoundView {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  audioUrl?: string;
  coverUrl?: string;
  useCount: number;
}

export interface TagView {
  name: string;
  videoCount: number;
}

// Preference types
export interface PreferenceItem {
  $type: string;
  [key: string]: unknown;
}

export interface AdultContentPref extends PreferenceItem {
  $type: 'io.exprsn.actor.getPreferences#adultContentPref';
  enabled: boolean;
}

export interface ContentLabelPref extends PreferenceItem {
  $type: 'io.exprsn.actor.getPreferences#contentLabelPref';
  label: string;
  visibility: 'show' | 'warn' | 'hide';
}

export interface FeedViewPref extends PreferenceItem {
  $type: 'io.exprsn.actor.getPreferences#feedViewPref';
  feed: string;
  hideReplies?: boolean;
  hideReposts?: boolean;
  hideQuotePosts?: boolean;
}

export interface ThreadViewPref extends PreferenceItem {
  $type: 'io.exprsn.actor.getPreferences#threadViewPref';
  sort?: 'oldest' | 'newest' | 'most-likes' | 'random';
  prioritizeFollowedUsers?: boolean;
}

export interface InterestsPref extends PreferenceItem {
  $type: 'io.exprsn.actor.getPreferences#interestsPref';
  tags: string[];
}

export interface MutedWordsPref extends PreferenceItem {
  $type: 'io.exprsn.actor.getPreferences#mutedWordsPref';
  items: MutedWord[];
}

export interface MutedWord {
  value: string;
  targets: ('content' | 'tag')[];
}

export interface HiddenPostsPref extends PreferenceItem {
  $type: 'io.exprsn.actor.getPreferences#hiddenPostsPref';
  items: string[];
}

// Organization types
export interface OrganizationView {
  id: string;
  name: string;
  type: 'team' | 'enterprise' | 'nonprofit' | 'business';
  website?: string;
  verified: boolean;
  owner: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  memberCount: number;
  createdAt: string;
  viewer?: {
    role: 'owner' | 'admin' | 'member';
    permissions: string[];
  };
  // Hierarchy fields
  parentOrganizationId?: string;
  domainId?: string;
  hierarchyPath?: string;
  hierarchyLevel?: number;
  childCount?: number;
}

export interface OrganizationMemberView {
  id: string;
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  role: 'owner' | 'admin' | 'member';
  permissions: string[];
  joinedAt: string;
}

export interface BulkImportJobView {
  id: string;
  organizationId: string;
  fileName: string;
  fileType: 'xlsx' | 'csv' | 'sqlite';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  errors?: Array<{ row: number; field?: string; error: string }>;
  createdAt: string;
  completedAt?: string;
  createdBy: {
    did: string;
    handle: string;
    displayName?: string;
  };
}

// Organization Tag types
export interface OrganizationTagView {
  id: string;
  name: string;
  color: string;
  description?: string;
  memberCount: number;
  createdAt: string;
}

// Organization Blocked Word types
export interface OrganizationBlockedWordView {
  id: string;
  word: string;
  severity: 'low' | 'medium' | 'high';
  enabled: boolean;
  createdAt: string;
}

// Organization with membership info
export interface OrganizationWithMembershipView {
  id: string;
  name: string;
  handle?: string;
  displayName?: string;
  type: string;
  avatar?: string;
  verified: boolean;
  membership: {
    id: string;
    role: OrganizationRoleView | { name: string; displayName: string; permissions: string[] };
    title?: string;
    canPublishOnBehalf: boolean;
    joinedAt: string;
  };
}

// Public organization profile
export interface OrganizationPublicProfileView {
  id: string;
  handle: string;
  displayName: string;
  name: string;
  type: string;
  avatar?: string;
  bannerImage?: string;
  bio?: string;
  website?: string;
  location?: string;
  category?: string;
  socialLinks?: {
    website?: string;
    twitter?: string;
    instagram?: string;
    youtube?: string;
    tiktok?: string;
    discord?: string;
  };
  verified: boolean;
  followerCount: number;
  videoCount: number;
  memberCount: number;
  isFollowing?: boolean;
  isMember?: boolean;
  createdAt: string;
}

// Organization role
export interface OrganizationRoleView {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  priority: number;
  color?: string;
  createdAt: string;
}

// Organization invite
export interface OrganizationInviteView {
  id: string;
  email?: string;
  invitedUser?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  roleName?: string;
  invitedBy: {
    did: string;
    handle: string;
    displayName?: string;
  };
  message?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

// Content queue item
export interface ContentQueueItemView {
  id: string;
  video: {
    uri: string;
    thumbnailUrl?: string;
    caption?: string;
    duration?: number;
  };
  submittedBy: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  submittedCaption?: string;
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  priority: number;
  createdAt: string;
}

// Organization analytics
export interface OrganizationAnalyticsView {
  period: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  followerCount: number;
  videoCount: number;
  topVideos: Array<{
    uri: string;
    thumbnailUrl?: string;
    caption?: string;
    views: number;
    likes: number;
  }>;
  viewsByDay: Array<{
    date: string;
    views: number;
  }>;
}

// Organization Stats types
export interface OrganizationStatsView {
  memberCount: number;
  activeMembers: number;
  suspendedMembers: number;
  membersByRole: Array<{ role: string; count: number }>;
  memberGrowth: Array<{ date: string; count: number }>;
  recentImports: Array<{ date: string; count: number; successCount: number }>;
}

// Organization Activity types
export interface OrganizationActivityView {
  id: string;
  action: string;
  actor: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

// Extended member view with tags and status
export interface OrganizationMemberDetailView extends OrganizationMemberView {
  status: 'active' | 'suspended';
  displayOrder: number;
  suspendedAt?: string;
  suspendedBy?: string;
  suspendedReason?: string;
  tags?: OrganizationTagView[];
}

// Live Streaming types
export interface LiveStreamView {
  id: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  status: 'scheduled' | 'live' | 'ended';
  visibility: 'public' | 'followers' | 'private';
  streamKey: string;
  ingestUrl: string;
  playbackUrl?: string;
  thumbnailUrl?: string;
  viewerCount: number;
  peakViewers: number;
  streamer: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  viewer?: {
    isModerator: boolean;
    isBanned: boolean;
  };
}

export interface LiveStreamSummary {
  id: string;
  title: string;
  category?: string;
  tags?: string[];
  viewerCount: number;
  thumbnailUrl?: string;
  startedAt?: string;
  scheduledAt?: string;
  streamer: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface LiveChatMessage {
  id: string;
  message: string;
  type: 'chat' | 'system' | 'emote';
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  isModerator: boolean;
  createdAt: string;
}

// Bulk Action Types
export interface BulkActionResult {
  success: boolean;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    deleteType?: 'hard' | 'soft';
  };
  results: Array<{
    did: string;
    success: boolean;
    sanctionId?: string;
    error?: string;
  }>;
}

export interface BulkPasswordResetResult {
  success: boolean;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    did: string;
    success: boolean;
    temporaryPassword?: string;
    error?: string;
  }>;
}

export interface BulkForceLogoutResult {
  success: boolean;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    totalSessionsInvalidated: number;
  };
  results: Array<{
    did: string;
    success: boolean;
    sessionsInvalidated: number;
    error?: string;
  }>;
}

export interface BulkActionPreview {
  preview: {
    action: 'sanction' | 'resetPassword' | 'delete' | 'forceLogout';
    sanctionType?: 'warning' | 'mute' | 'suspend' | 'ban';
    affectedCount: number;
    notFoundCount: number;
    users: Array<{
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
      followerCount?: number;
      videoCount?: number;
      verified?: boolean;
      currentSanction: string | null;
    }>;
    notFoundDids: string[];
  };
  warnings: string[];
  canProceed: boolean;
}

// Organization Admin Types
export interface AdminOrganization {
  id: string;
  name: string;
  type: string;
  description?: string;
  avatar?: string;
  verified: boolean;
  memberCount: number;
  apiAccessEnabled: boolean;
  owner: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  } | null;
  createdAt: string;
}

export interface AdminOrganizationsResponse {
  organizations: AdminOrganization[];
  cursor?: string;
}

export interface AdminOrganizationDetail {
  organization: {
    id: string;
    name: string;
    type: string;
    description?: string;
    website?: string;
    avatar?: string;
    verified: boolean;
    memberCount: number;
    rateLimitPerMinute?: number | null;
    burstLimit?: number | null;
    dailyRequestLimit?: number | null;
    apiAccessEnabled: boolean;
    allowedScopes?: string[] | null;
    webhooksEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
  owner: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  } | null;
  stats: {
    totalMembers: number;
    activeMembers: number;
    suspendedMembers: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    details?: Record<string, unknown>;
    actor: {
      did: string;
      handle: string;
    } | null;
    createdAt: string;
  }>;
}

export interface BulkOrgActionResult {
  success: boolean;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    action?: string;
  };
  results: Array<{
    id: string;
    success: boolean;
    error?: string;
  }>;
}

export interface BulkOrgMemberResult {
  success: boolean;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    did: string;
    action: string;
    success: boolean;
    error?: string;
  }>;
}

// System diagnostics types
export interface SystemDiagnostics {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  latency: number;
  services: {
    database: { status: 'healthy' | 'degraded' | 'down'; latency: number };
    redis: { status: 'healthy' | 'degraded' | 'down' | 'not_configured'; latency: number };
    api: { status: 'healthy'; uptime: number; latency?: number };
  };
  stats: {
    totalUsers: number;
    totalVideos: number;
    pendingReports: number;
    activeSessions: number;
  };
  environment: {
    nodeVersion: string;
    platform: string;
    memory: {
      used: number;
      total: number;
    };
  };
}

// Admin activity feed types
export interface AdminActivityItem {
  id: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  admin: {
    did: string;
    role: string;
    handle?: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface AdminActivityFeed {
  activities: Array<{
    date: string;
    items: AdminActivityItem[];
  }>;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Quick stats type
export interface QuickStats {
  pendingReports: number;
  newUsersToday: number;
  activeUsersNow: number;
  activeLiveStreams?: number;
  timestamp: string;
}

// Admin user search result
export interface AdminUserSearchResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  verified: boolean;
  createdAt: string;
}

export const api = new ApiClient(API_BASE);
