import {
  pgTable,
  text,
  timestamp,
  integer,
  serial,
  real,
  jsonb,
  index,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Users table - cached user profiles from PDS
// Social links type
export interface UserSocialLinks {
  website?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  discord?: string;
}

export const users = pgTable(
  'users',
  {
    did: text('did').primaryKey(),
    handle: text('handle').notNull(),
    displayName: text('display_name'),
    avatar: text('avatar'),
    bio: text('bio'),
    website: text('website'),
    location: text('location'),
    socialLinks: jsonb('social_links').$type<UserSocialLinks>(),
    followerCount: integer('follower_count').default(0).notNull(),
    followingCount: integer('following_count').default(0).notNull(),
    videoCount: integer('video_count').default(0).notNull(),
    verified: boolean('verified').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    handleIdx: uniqueIndex('users_handle_idx').on(table.handle),
    updatedAtIdx: index('users_updated_at_idx').on(table.updatedAt),
  })
);

// Videos table - indexed video posts
export const videos = pgTable(
  'videos',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    caption: text('caption'),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    soundUri: text('sound_uri'),
    cdnUrl: text('cdn_url'),
    hlsPlaylist: text('hls_playlist'),
    thumbnailUrl: text('thumbnail_url'),
    duration: integer('duration'),
    aspectRatio: jsonb('aspect_ratio').$type<{ width: number; height: number }>(),
    visibility: text('visibility').default('public').notNull(),
    allowDuet: boolean('allow_duet').default(true).notNull(),
    allowStitch: boolean('allow_stitch').default(true).notNull(),
    allowComments: boolean('allow_comments').default(true).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    shareCount: integer('share_count').default(0).notNull(),
    repostCount: integer('repost_count').default(0).notNull(),
    bookmarkCount: integer('bookmark_count').default(0).notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => ({
    authorIdx: index('videos_author_idx').on(table.authorDid),
    createdIdx: index('videos_created_idx').on(table.createdAt),
    soundIdx: index('videos_sound_idx').on(table.soundUri),
    visibilityIdx: index('videos_visibility_idx').on(table.visibility),
  })
);

// Likes table
export const likes = pgTable(
  'likes',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('likes_video_idx').on(table.videoUri),
    authorIdx: index('likes_author_idx').on(table.authorDid),
    uniqueLike: uniqueIndex('likes_unique_idx').on(table.videoUri, table.authorDid),
  })
);

// Comments table
export const comments = pgTable(
  'comments',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    parentUri: text('parent_uri'),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    loveCount: integer('love_count').default(0).notNull(),
    dislikeCount: integer('dislike_count').default(0).notNull(),
    replyCount: integer('reply_count').default(0).notNull(),
    hotScore: real('hot_score').default(0).notNull(),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('comments_video_idx').on(table.videoUri),
    parentIdx: index('comments_parent_idx').on(table.parentUri),
    authorIdx: index('comments_author_idx').on(table.authorDid),
    createdIdx: index('comments_created_idx').on(table.createdAt),
    hotScoreIdx: index('comments_hot_score_idx').on(table.hotScore),
  })
);

// Comment reactions (like/love/dislike)
export const commentReactions = pgTable(
  'comment_reactions',
  {
    id: text('id').primaryKey(),
    commentUri: text('comment_uri')
      .notNull()
      .references(() => comments.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    reactionType: text('reaction_type').notNull(), // 'like' | 'love' | 'dislike'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    commentIdx: index('comment_reactions_comment_idx').on(table.commentUri),
    authorIdx: index('comment_reactions_author_idx').on(table.authorDid),
    uniqueReaction: uniqueIndex('comment_reactions_unique_idx').on(
      table.commentUri,
      table.authorDid
    ),
  })
);

// Follows table
export const follows = pgTable(
  'follows',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    followerDid: text('follower_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    followeeDid: text('followee_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    followerIdx: index('follows_follower_idx').on(table.followerDid),
    followeeIdx: index('follows_followee_idx').on(table.followeeDid),
    uniqueFollow: uniqueIndex('follows_unique_idx').on(table.followerDid, table.followeeDid),
  })
);

// Sounds table
export const sounds = pgTable(
  'sounds',
  {
    id: text('id').primaryKey(),
    originalVideoUri: text('original_video_uri'),
    title: text('title').notNull(),
    artist: text('artist'),
    duration: integer('duration'),
    audioUrl: text('audio_url'),
    coverUrl: text('cover_url'),
    useCount: integer('use_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    useCountIdx: index('sounds_use_count_idx').on(table.useCount),
    titleIdx: index('sounds_title_idx').on(table.title),
  })
);

// User interactions for feed algorithm
export const userInteractions = pgTable(
  'user_interactions',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did').notNull(),
    videoUri: text('video_uri').notNull(),
    interactionType: text('interaction_type').notNull(), // view, like, comment, share, watch_complete
    watchDuration: integer('watch_duration'), // seconds watched
    completionRate: real('completion_rate'), // 0.0 to 1.0
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('interactions_user_idx').on(table.userDid),
    videoIdx: index('interactions_video_idx').on(table.videoUri),
    typeIdx: index('interactions_type_idx').on(table.interactionType),
    createdIdx: index('interactions_created_idx').on(table.createdAt),
  })
);

// Trending videos - updated by cron job
export const trendingVideos = pgTable(
  'trending_videos',
  {
    videoUri: text('video_uri')
      .primaryKey()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    velocity: real('velocity').default(0).notNull(),
    rank: integer('rank').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    scoreIdx: index('trending_score_idx').on(table.score),
    rankIdx: index('trending_rank_idx').on(table.rank),
  })
);

// Video embeddings for ML recommendations
export const videoEmbeddings = pgTable(
  'video_embeddings',
  {
    videoUri: text('video_uri')
      .primaryKey()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    embedding: jsonb('embedding').$type<number[]>().notNull(),
    model: text('model').notNull(), // e.g., 'text-embedding-3-small'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

// Upload jobs for tracking video processing
export const uploadJobs = pgTable(
  'upload_jobs',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did').notNull(),
    status: text('status').notNull(), // pending, uploading, processing, completed, failed
    progress: integer('progress').default(0).notNull(),
    inputKey: text('input_key'),
    cdnUrl: text('cdn_url'),
    hlsPlaylist: text('hls_playlist'),
    thumbnailUrl: text('thumbnail_url'),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('upload_jobs_user_idx').on(table.userDid),
    statusIdx: index('upload_jobs_status_idx').on(table.status),
  })
);

// User settings - synced across devices
export const userSettings = pgTable('user_settings', {
  userDid: text('user_did')
    .primaryKey()
    .references(() => users.did, { onDelete: 'cascade' }),
  themeId: text('theme_id').default('slate').notNull(),
  colorMode: text('color_mode').default('dark').notNull(), // 'light' | 'dark' | 'system'
  accessibility: jsonb('accessibility').$type<{
    reducedMotion: boolean;
    highContrast: boolean;
    largeText: boolean;
    screenReaderOptimized: boolean;
  }>(),
  playback: jsonb('playback').$type<{
    autoplay: boolean;
    defaultQuality: 'auto' | '1080p' | '720p' | '480p' | '360p';
    defaultMuted: boolean;
    loopVideos: boolean;
    dataSaver: boolean;
  }>(),
  notifications: jsonb('notifications').$type<{
    likes: boolean;
    comments: boolean;
    follows: boolean;
    mentions: boolean;
    directMessages: boolean;
    emailDigest: 'never' | 'daily' | 'weekly';
  }>(),
  privacy: jsonb('privacy').$type<{
    privateAccount: boolean;
    showActivityStatus: boolean;
    allowDuets: boolean;
    allowStitches: boolean;
    allowComments: 'everyone' | 'following' | 'none';
    allowMessages: 'everyone' | 'following' | 'none';
  }>(),
  content: jsonb('content').$type<{
    language: string;
    contentWarnings: boolean;
    sensitiveContent: boolean;
  }>(),
  layout: jsonb('layout').$type<{
    commentsPosition: 'side' | 'bottom';
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// PDS (Personal Data Server) Tables
// ============================================

// Actor repositories - PDS hosted accounts
export const actorRepos = pgTable(
  'actor_repos',
  {
    did: text('did').primaryKey(),
    handle: text('handle').notNull(),
    email: text('email'),
    passwordHash: text('password_hash'),
    signingKeyPublic: text('signing_key_public').notNull(),
    signingKeyPrivate: text('signing_key_private').notNull(),
    rootCid: text('root_cid'),
    rev: text('rev'),
    status: text('status').default('active').notNull(), // active, suspended, deleted
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    handleIdx: uniqueIndex('actor_repos_handle_idx').on(table.handle),
    emailIdx: index('actor_repos_email_idx').on(table.email),
    statusIdx: index('actor_repos_status_idx').on(table.status),
  })
);

// Repository commits
export const repoCommits = pgTable(
  'repo_commits',
  {
    cid: text('cid').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    rev: text('rev').notNull(),
    data: text('data').notNull(), // CBOR base64
    prev: text('prev'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('repo_commits_did_idx').on(table.did),
    revIdx: index('repo_commits_rev_idx').on(table.rev),
  })
);

// Repository records (denormalized for query performance)
export const repoRecords = pgTable(
  'repo_records',
  {
    uri: text('uri').primaryKey(), // at://did/collection/rkey
    cid: text('cid').notNull(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    collection: text('collection').notNull(),
    rkey: text('rkey').notNull(),
    record: jsonb('record').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    didCollectionIdx: index('repo_records_did_collection_idx').on(table.did, table.collection),
    collectionIdx: index('repo_records_collection_idx').on(table.collection),
    rkeyIdx: index('repo_records_rkey_idx').on(table.rkey),
  })
);

// Blobs stored in PDS
export const blobs = pgTable(
  'blobs',
  {
    cid: text('cid').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    storagePath: text('storage_path').notNull(),
    tempPath: text('temp_path'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('blobs_did_idx').on(table.did),
    mimeTypeIdx: index('blobs_mime_type_idx').on(table.mimeType),
  })
);

// MST blocks (Merkle Search Tree nodes)
export const repoBlocks = pgTable(
  'repo_blocks',
  {
    cid: text('cid').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    content: text('content').notNull(), // CBOR base64
    referencedBy: text('referenced_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('repo_blocks_did_idx').on(table.did),
  })
);

// PDS sessions
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    accessJwt: text('access_jwt').notNull(),
    refreshJwt: text('refresh_jwt').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('sessions_did_idx').on(table.did),
    accessJwtIdx: uniqueIndex('sessions_access_jwt_idx').on(table.accessJwt),
    refreshJwtIdx: uniqueIndex('sessions_refresh_jwt_idx').on(table.refreshJwt),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  })
);

// ============================================
// Admin Tables
// ============================================

// Admin users with role-based permissions
export const adminUsers = pgTable(
  'admin_users',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'super_admin' | 'admin' | 'moderator' | 'support'
    permissions: jsonb('permissions').$type<string[]>().default([]),
    invitedBy: text('invited_by'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userDidIdx: uniqueIndex('admin_users_user_did_idx').on(table.userDid),
    roleIdx: index('admin_users_role_idx').on(table.role),
  })
);

// Content reports
export const contentReports = pgTable(
  'content_reports',
  {
    id: text('id').primaryKey(),
    reporterDid: text('reporter_did')
      .notNull()
      .references(() => users.did),
    contentType: text('content_type').notNull(), // 'video' | 'comment' | 'user' | 'sound'
    contentUri: text('content_uri').notNull(),
    reason: text('reason').notNull(), // 'spam' | 'harassment' | 'violence' | 'nudity' | 'copyright' | 'other'
    description: text('description'),
    status: text('status').default('pending').notNull(), // 'pending' | 'reviewed' | 'actioned' | 'dismissed'
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    actionTaken: text('action_taken'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    reporterIdx: index('content_reports_reporter_idx').on(table.reporterDid),
    contentTypeIdx: index('content_reports_content_type_idx').on(table.contentType),
    statusIdx: index('content_reports_status_idx').on(table.status),
    createdIdx: index('content_reports_created_idx').on(table.createdAt),
  })
);

// Moderation actions
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id')
      .notNull()
      .references(() => adminUsers.id),
    contentType: text('content_type').notNull(),
    contentUri: text('content_uri').notNull(),
    actionType: text('action_type').notNull(), // 'remove' | 'warn' | 'restrict' | 'restore'
    reason: text('reason').notNull(),
    notes: text('notes'),
    reportId: text('report_id').references(() => contentReports.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    adminIdx: index('moderation_actions_admin_idx').on(table.adminId),
    contentTypeIdx: index('moderation_actions_content_type_idx').on(table.contentType),
    createdIdx: index('moderation_actions_created_idx').on(table.createdAt),
  })
);

// User sanctions
export const userSanctions = pgTable(
  'user_sanctions',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did),
    adminId: text('admin_id')
      .notNull()
      .references(() => adminUsers.id),
    sanctionType: text('sanction_type').notNull(), // 'warning' | 'mute' | 'suspend' | 'ban'
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at'),
    appealStatus: text('appeal_status'), // 'pending' | 'approved' | 'denied'
    appealNote: text('appeal_note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userDidIdx: index('user_sanctions_user_did_idx').on(table.userDid),
    adminIdx: index('user_sanctions_admin_idx').on(table.adminId),
    typeIdx: index('user_sanctions_type_idx').on(table.sanctionType),
    expiresIdx: index('user_sanctions_expires_idx').on(table.expiresAt),
  })
);

// Featured content
export const featuredContent = pgTable(
  'featured_content',
  {
    id: text('id').primaryKey(),
    contentType: text('content_type').notNull(), // 'video' | 'user' | 'sound' | 'tag'
    contentUri: text('content_uri').notNull(),
    position: integer('position').default(0).notNull(),
    section: text('section').notNull(), // 'hero' | 'trending' | 'discover' | 'creators'
    startAt: timestamp('start_at'),
    endAt: timestamp('end_at'),
    addedBy: text('added_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    sectionIdx: index('featured_content_section_idx').on(table.section),
    positionIdx: index('featured_content_position_idx').on(table.position),
  })
);

// System config
export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Admin audit log
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id')
      .notNull()
      .references(() => adminUsers.id),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: jsonb('details'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    adminIdx: index('admin_audit_log_admin_idx').on(table.adminId),
    actionIdx: index('admin_audit_log_action_idx').on(table.action),
    createdIdx: index('admin_audit_log_created_idx').on(table.createdAt),
  })
);

// Analytics snapshots
export const analyticsSnapshots = pgTable(
  'analytics_snapshots',
  {
    id: text('id').primaryKey(),
    period: text('period').notNull(), // 'hourly' | 'daily' | 'weekly' | 'monthly'
    metrics: jsonb('metrics')
      .$type<{
        activeUsers: number;
        newUsers: number;
        totalVideos: number;
        newVideos: number;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        avgWatchTime: number;
        topVideos: string[];
        topCreators: string[];
      }>()
      .notNull(),
    startAt: timestamp('start_at').notNull(),
    endAt: timestamp('end_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    periodIdx: index('analytics_snapshots_period_idx').on(table.period),
    startAtIdx: index('analytics_snapshots_start_at_idx').on(table.startAt),
  })
);

// ============================================
// Social Features Tables
// ============================================

// Reposts - sharing videos to your profile
export const reposts = pgTable(
  'reposts',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    caption: text('caption'),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('reposts_video_idx').on(table.videoUri),
    authorIdx: index('reposts_author_idx').on(table.authorDid),
    uniqueRepost: uniqueIndex('reposts_unique_idx').on(table.videoUri, table.authorDid),
    createdIdx: index('reposts_created_idx').on(table.createdAt),
  })
);

// Bookmarks - saved videos for later
export const bookmarks = pgTable(
  'bookmarks',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    folder: text('folder'),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('bookmarks_video_idx').on(table.videoUri),
    authorIdx: index('bookmarks_author_idx').on(table.authorDid),
    folderIdx: index('bookmarks_folder_idx').on(table.authorDid, table.folder),
    uniqueBookmark: uniqueIndex('bookmarks_unique_idx').on(table.videoUri, table.authorDid),
    createdIdx: index('bookmarks_created_idx').on(table.createdAt),
  })
);

// Blocks - prevent users from interacting
export const blocks = pgTable(
  'blocks',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    blockerDid: text('blocker_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    blockedDid: text('blocked_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    blockerIdx: index('blocks_blocker_idx').on(table.blockerDid),
    blockedIdx: index('blocks_blocked_idx').on(table.blockedDid),
    uniqueBlock: uniqueIndex('blocks_unique_idx').on(table.blockerDid, table.blockedDid),
  })
);

// Mutes - hide content without blocking
export const mutes = pgTable(
  'mutes',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    muterDid: text('muter_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    mutedDid: text('muted_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    muterIdx: index('mutes_muter_idx').on(table.muterDid),
    mutedIdx: index('mutes_muted_idx').on(table.mutedDid),
    uniqueMute: uniqueIndex('mutes_unique_idx').on(table.muterDid, table.mutedDid),
  })
);

// ============================================
// Chat/DM Tables
// ============================================

// Conversations - DM threads between users
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    participant1Did: text('participant1_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    participant2Did: text('participant2_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at'),
    lastMessageText: text('last_message_text'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    participant1Idx: index('conversations_participant1_idx').on(table.participant1Did),
    participant2Idx: index('conversations_participant2_idx').on(table.participant2Did),
    uniqueConversation: uniqueIndex('conversations_unique_idx').on(
      table.participant1Did,
      table.participant2Did
    ),
    lastMessageIdx: index('conversations_last_message_idx').on(table.lastMessageAt),
  })
);

// Messages - individual DMs
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderDid: text('sender_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    replyToId: text('reply_to_id'),
    embedType: text('embed_type'), // 'video' | 'image' | null
    embedUri: text('embed_uri'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index('messages_conversation_idx').on(table.conversationId),
    senderIdx: index('messages_sender_idx').on(table.senderDid),
    createdIdx: index('messages_created_idx').on(table.createdAt),
    readIdx: index('messages_read_idx').on(table.readAt),
  })
);

// Conversation participants state (for muting, read status per user)
export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    participantDid: text('participant_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at'),
    muted: boolean('muted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index('conversation_participants_conversation_idx').on(table.conversationId),
    participantIdx: index('conversation_participants_participant_idx').on(table.participantDid),
    uniqueParticipant: uniqueIndex('conversation_participants_unique_idx').on(
      table.conversationId,
      table.participantDid
    ),
  })
);

// Message reactions
export const messageReactions = pgTable(
  'message_reactions',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(), // Unicode emoji or custom emoji ID
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    messageIdx: index('message_reactions_message_idx').on(table.messageId),
    userIdx: index('message_reactions_user_idx').on(table.userDid),
    uniqueReaction: uniqueIndex('message_reactions_unique_idx').on(
      table.messageId,
      table.userDid,
      table.emoji
    ),
  })
);

// Message attachments (images, files, etc.)
export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'image' | 'video' | 'audio' | 'file'
    url: text('url').notNull(),
    mimeType: text('mime_type'),
    fileName: text('file_name'),
    fileSize: integer('file_size'),
    width: integer('width'),
    height: integer('height'),
    duration: real('duration'), // For audio/video
    thumbnailUrl: text('thumbnail_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    messageIdx: index('message_attachments_message_idx').on(table.messageId),
  })
);

// User presence tracking (online/offline status)
export const userPresence = pgTable(
  'user_presence',
  {
    userDid: text('user_did')
      .primaryKey()
      .references(() => users.did, { onDelete: 'cascade' }),
    status: text('status').notNull().default('offline'), // 'online' | 'away' | 'offline'
    lastSeen: timestamp('last_seen').defaultNow().notNull(),
    currentConversationId: text('current_conversation_id'),
  }
);

// ============================================
// Graph/Lists Tables
// ============================================

// User lists - custom curated lists
export const lists = pgTable(
  'lists',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    avatar: text('avatar'),
    purpose: text('purpose').default('curatelist').notNull(), // 'curatelist' | 'modlist'
    memberCount: integer('member_count').default(0).notNull(),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    authorIdx: index('lists_author_idx').on(table.authorDid),
    purposeIdx: index('lists_purpose_idx').on(table.purpose),
    createdIdx: index('lists_created_idx').on(table.createdAt),
  })
);

// List items - users in a list
export const listItems = pgTable(
  'list_items',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    listUri: text('list_uri')
      .notNull()
      .references(() => lists.uri, { onDelete: 'cascade' }),
    subjectDid: text('subject_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    listIdx: index('list_items_list_idx').on(table.listUri),
    subjectIdx: index('list_items_subject_idx').on(table.subjectDid),
    uniqueItem: uniqueIndex('list_items_unique_idx').on(table.listUri, table.subjectDid),
    createdIdx: index('list_items_created_idx').on(table.createdAt),
  })
);

// ============================================
// Video Interaction Tables
// ============================================

// Stitches - video responses that use a clip from another video
export const stitches = pgTable(
  'stitches',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    originalVideoUri: text('original_video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    startTime: integer('start_time').default(0).notNull(), // milliseconds
    endTime: integer('end_time').notNull(), // milliseconds
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('stitches_video_idx').on(table.videoUri),
    originalIdx: index('stitches_original_idx').on(table.originalVideoUri),
    authorIdx: index('stitches_author_idx').on(table.authorDid),
    createdIdx: index('stitches_created_idx').on(table.createdAt),
  })
);

// Shares - tracking video shares
export const shares = pgTable(
  'shares',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    platform: text('platform'), // 'twitter' | 'facebook' | 'copy_link' | 'dm' | etc
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('shares_video_idx').on(table.videoUri),
    authorIdx: index('shares_author_idx').on(table.authorDid),
    platformIdx: index('shares_platform_idx').on(table.platform),
    createdIdx: index('shares_created_idx').on(table.createdAt),
  })
);

// Duets - side-by-side video responses (for completeness with stitches)
export const duets = pgTable(
  'duets',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    originalVideoUri: text('original_video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    layout: text('layout').default('side-by-side').notNull(), // 'side-by-side' | 'react' | 'green-screen'
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('duets_video_idx').on(table.videoUri),
    originalIdx: index('duets_original_idx').on(table.originalVideoUri),
    authorIdx: index('duets_author_idx').on(table.authorDid),
    createdIdx: index('duets_created_idx').on(table.createdAt),
  })
);

// ============================================
// User Preferences Tables
// ============================================

// User preferences - AT Protocol style preferences
export const userPreferences = pgTable(
  'user_preferences',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    prefType: text('pref_type').notNull(), // '$type' value like 'io.exprsn.actor.getPreferences#adultContentPref'
    prefData: jsonb('pref_data').notNull(), // The full preference object
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userDidIdx: index('user_preferences_user_did_idx').on(table.userDid),
    prefTypeIdx: index('user_preferences_pref_type_idx').on(table.prefType),
    uniquePref: uniqueIndex('user_preferences_unique_idx').on(table.userDid, table.prefType),
  })
);

// Notifications - activity notifications for users
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    actorDid: text('actor_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    reason: text('reason').notNull(), // 'like' | 'comment' | 'follow' | 'mention' | 'repost' | 'reply'
    reasonSubject: text('reason_subject'), // URI of the subject (video, comment, etc)
    targetUri: text('target_uri'), // URI of the target record
    targetCid: text('target_cid'),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    userDidIdx: index('notifications_user_did_idx').on(table.userDid),
    actorDidIdx: index('notifications_actor_did_idx').on(table.actorDid),
    reasonIdx: index('notifications_reason_idx').on(table.reason),
    isReadIdx: index('notifications_is_read_idx').on(table.isRead),
    createdIdx: index('notifications_created_idx').on(table.createdAt),
    userReadIdx: index('notifications_user_read_idx').on(table.userDid, table.isRead),
  })
);

// Notification seen timestamp - tracks when user last viewed notifications
export const notificationSeenAt = pgTable('notification_seen_at', {
  userDid: text('user_did')
    .primaryKey()
    .references(() => users.did, { onDelete: 'cascade' }),
  seenAt: timestamp('seen_at').defaultNow().notNull(),
});

// Notification subscriptions/preferences
export const notificationSubscriptions = pgTable(
  'notification_subscriptions',
  {
    userDid: text('user_did')
      .primaryKey()
      .references(() => users.did, { onDelete: 'cascade' }),
    likes: boolean('likes').default(true).notNull(),
    comments: boolean('comments').default(true).notNull(),
    follows: boolean('follows').default(true).notNull(),
    mentions: boolean('mentions').default(true).notNull(),
    reposts: boolean('reposts').default(true).notNull(),
    messages: boolean('messages').default(true).notNull(),
    fromFollowingOnly: boolean('from_following_only').default(false).notNull(),
    pushEnabled: boolean('push_enabled').default(true).notNull(),
    emailEnabled: boolean('email_enabled').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Like = typeof likes.$inferSelect;
export type NewLike = typeof likes.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentReaction = typeof commentReactions.$inferSelect;
export type NewCommentReaction = typeof commentReactions.$inferInsert;
export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;
export type Sound = typeof sounds.$inferSelect;
export type NewSound = typeof sounds.$inferInsert;
export type UserInteraction = typeof userInteractions.$inferSelect;
export type NewUserInteraction = typeof userInteractions.$inferInsert;
export type TrendingVideo = typeof trendingVideos.$inferSelect;
export type VideoEmbedding = typeof videoEmbeddings.$inferSelect;
export type UploadJob = typeof uploadJobs.$inferSelect;
export type NewUploadJob = typeof uploadJobs.$inferInsert;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettingsRow = typeof userSettings.$inferInsert;

// PDS type exports
export type ActorRepo = typeof actorRepos.$inferSelect;
export type NewActorRepo = typeof actorRepos.$inferInsert;
export type RepoCommit = typeof repoCommits.$inferSelect;
export type NewRepoCommit = typeof repoCommits.$inferInsert;
export type RepoRecord = typeof repoRecords.$inferSelect;
export type NewRepoRecord = typeof repoRecords.$inferInsert;
export type Blob = typeof blobs.$inferSelect;
export type NewBlob = typeof blobs.$inferInsert;
export type RepoBlock = typeof repoBlocks.$inferSelect;
export type NewRepoBlock = typeof repoBlocks.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Admin type exports
export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type NewModerationAction = typeof moderationActions.$inferInsert;
export type UserSanction = typeof userSanctions.$inferSelect;
export type NewUserSanction = typeof userSanctions.$inferInsert;
export type FeaturedContent = typeof featuredContent.$inferSelect;
export type NewFeaturedContent = typeof featuredContent.$inferInsert;
export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;
export type AdminAuditLogEntry = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLogEntry = typeof adminAuditLog.$inferInsert;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;

// Social features type exports
export type Repost = typeof reposts.$inferSelect;
export type NewRepost = typeof reposts.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type Mute = typeof mutes.$inferSelect;
export type NewMute = typeof mutes.$inferInsert;

// Chat type exports
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type NewConversationParticipant = typeof conversationParticipants.$inferInsert;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type NewMessageAttachment = typeof messageAttachments.$inferInsert;
export type UserPresence = typeof userPresence.$inferSelect;
export type NewUserPresence = typeof userPresence.$inferInsert;
export type NotificationSubscriptionRow = typeof notificationSubscriptions.$inferSelect;
export type NewNotificationSubscriptionRow = typeof notificationSubscriptions.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
export type NotificationSeenAtRow = typeof notificationSeenAt.$inferSelect;
export type NewNotificationSeenAtRow = typeof notificationSeenAt.$inferInsert;

// Graph/Lists type exports
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type ListItem = typeof listItems.$inferSelect;
export type NewListItem = typeof listItems.$inferInsert;

// Video interaction type exports
export type Stitch = typeof stitches.$inferSelect;
export type NewStitch = typeof stitches.$inferInsert;
export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
export type Duet = typeof duets.$inferSelect;
export type NewDuet = typeof duets.$inferInsert;

// User preferences type exports
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;

// ============================================
// Organization Tables
// ============================================

// Organizations - business/team/nonprofit entities
export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    ownerDid: text('owner_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'team' | 'enterprise' | 'nonprofit' | 'business'
    description: text('description'),
    website: text('website'),
    avatar: text('avatar'),
    verified: boolean('verified').default(false).notNull(),
    memberCount: integer('member_count').default(1).notNull(),
    // Rate limit settings (null = use system defaults)
    rateLimitPerMinute: integer('rate_limit_per_minute'),
    burstLimit: integer('burst_limit'),
    dailyRequestLimit: integer('daily_request_limit'),
    // API access settings
    apiAccessEnabled: boolean('api_access_enabled').default(true).notNull(),
    allowedScopes: jsonb('allowed_scopes').$type<string[]>(),
    webhooksEnabled: boolean('webhooks_enabled').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('organizations_owner_idx').on(table.ownerDid),
    typeIdx: index('organizations_type_idx').on(table.type),
    nameIdx: index('organizations_name_idx').on(table.name),
  })
);

// Organization members - users belonging to organizations
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'owner' | 'admin' | 'member'
    permissions: jsonb('permissions').$type<string[]>().default([]), // ['bulk_import', 'manage_members', 'edit_settings']
    invitedBy: text('invited_by'),
    displayOrder: integer('display_order').default(0).notNull(),
    status: text('status').default('active').notNull(), // 'active' | 'suspended'
    suspendedAt: timestamp('suspended_at'),
    suspendedBy: text('suspended_by'),
    suspendedReason: text('suspended_reason'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_members_org_idx').on(table.organizationId),
    userIdx: index('org_members_user_idx').on(table.userDid),
    roleIdx: index('org_members_role_idx').on(table.role),
    statusIdx: index('org_members_status_idx').on(table.status),
    displayOrderIdx: index('org_members_display_order_idx').on(table.organizationId, table.displayOrder),
    uniqueMember: uniqueIndex('org_members_unique_idx').on(table.organizationId, table.userDid),
  })
);

// Organization tags - labels/categories for members
export const organizationTags = pgTable(
  'organization_tags',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').default('#6366f1').notNull(), // Hex color
    description: text('description'),
    createdBy: text('created_by').references(() => users.did),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_tags_org_idx').on(table.organizationId),
    nameIdx: index('org_tags_name_idx').on(table.name),
    uniqueTag: uniqueIndex('org_tags_unique_idx').on(table.organizationId, table.name),
  })
);

// Organization member tags - assign tags to members
export const organizationMemberTags = pgTable(
  'organization_member_tags',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => organizationTags.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => users.did),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => ({
    memberIdx: index('org_member_tags_member_idx').on(table.memberId),
    tagIdx: index('org_member_tags_tag_idx').on(table.tagId),
    uniqueAssignment: uniqueIndex('org_member_tags_unique_idx').on(table.memberId, table.tagId),
  })
);

// Organization blocked words - content moderation
export const organizationBlockedWords = pgTable(
  'organization_blocked_words',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    word: text('word').notNull(),
    severity: text('severity').default('medium').notNull(), // 'low' | 'medium' | 'high'
    enabled: boolean('enabled').default(true).notNull(),
    createdBy: text('created_by').references(() => users.did),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_blocked_words_org_idx').on(table.organizationId),
    wordIdx: index('org_blocked_words_word_idx').on(table.word),
    uniqueWord: uniqueIndex('org_blocked_words_unique_idx').on(table.organizationId, table.word),
  })
);

// Organization activity log - audit trail
export const organizationActivity = pgTable(
  'organization_activity',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorDid: text('actor_did')
      .notNull()
      .references(() => users.did),
    action: text('action').notNull(), // 'member_joined' | 'member_left' | 'role_changed' | 'import_completed' | etc.
    targetType: text('target_type'), // 'member' | 'tag' | 'settings' | 'import'
    targetId: text('target_id'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_activity_org_idx').on(table.organizationId),
    actorIdx: index('org_activity_actor_idx').on(table.actorDid),
    actionIdx: index('org_activity_action_idx').on(table.action),
    createdIdx: index('org_activity_created_idx').on(table.createdAt),
  })
);

// Bulk import jobs - tracking file imports for organizations
export const bulkImportJobs = pgTable(
  'bulk_import_jobs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.did),
    fileType: text('file_type').notNull(), // 'xlsx' | 'csv' | 'sqlite'
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size'),
    status: text('status').notNull(), // 'pending' | 'validating' | 'processing' | 'completed' | 'failed' | 'cancelled'
    totalRows: integer('total_rows'),
    processedRows: integer('processed_rows').default(0).notNull(),
    successCount: integer('success_count').default(0).notNull(),
    errorCount: integer('error_count').default(0).notNull(),
    errors: jsonb('errors').$type<{ row: number; field?: string; error: string }[]>(),
    fieldMapping: jsonb('field_mapping').$type<Record<string, string>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    orgIdx: index('bulk_import_jobs_org_idx').on(table.organizationId),
    createdByIdx: index('bulk_import_jobs_created_by_idx').on(table.createdBy),
    statusIdx: index('bulk_import_jobs_status_idx').on(table.status),
    createdIdx: index('bulk_import_jobs_created_idx').on(table.createdAt),
  })
);

// ============================================
// Live Streaming Tables
// ============================================

// Live streams - active and past live broadcasts
export const liveStreams = pgTable(
  'live_streams',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull(), // 'scheduled' | 'live' | 'ended'
    streamKey: text('stream_key').notNull(),
    ingestUrl: text('ingest_url'),
    playbackUrl: text('playback_url'),
    thumbnailUrl: text('thumbnail_url'),
    viewerCount: integer('viewer_count').default(0).notNull(),
    peakViewers: integer('peak_viewers').default(0).notNull(),
    totalViews: integer('total_views').default(0).notNull(),
    provider: text('provider').notNull(), // 'srs' | 'aws_ivs' | 'custom'
    providerStreamId: text('provider_stream_id'),
    providerChannelArn: text('provider_channel_arn'),
    category: text('category'),
    tags: jsonb('tags').$type<string[]>().default([]),
    visibility: text('visibility').default('public').notNull(), // 'public' | 'followers' | 'private'
    chatEnabled: boolean('chat_enabled').default(true).notNull(),
    recordingEnabled: boolean('recording_enabled').default(true).notNull(),
    recordingUrl: text('recording_url'),
    scheduledAt: timestamp('scheduled_at'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('live_streams_user_idx').on(table.userDid),
    statusIdx: index('live_streams_status_idx').on(table.status),
    providerIdx: index('live_streams_provider_idx').on(table.provider),
    categoryIdx: index('live_streams_category_idx').on(table.category),
    visibilityIdx: index('live_streams_visibility_idx').on(table.visibility),
    scheduledIdx: index('live_streams_scheduled_idx').on(table.scheduledAt),
    createdIdx: index('live_streams_created_idx').on(table.createdAt),
    streamKeyIdx: uniqueIndex('live_streams_stream_key_idx').on(table.streamKey),
  })
);

// Stream chat messages
export const streamChat = pgTable(
  'stream_chat',
  {
    id: text('id').primaryKey(),
    streamId: text('stream_id')
      .notNull()
      .references(() => liveStreams.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    messageType: text('message_type').default('text').notNull(), // 'text' | 'emote' | 'system' | 'donation'
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    streamIdx: index('stream_chat_stream_idx').on(table.streamId),
    userIdx: index('stream_chat_user_idx').on(table.userDid),
    createdIdx: index('stream_chat_created_idx').on(table.createdAt),
    streamCreatedIdx: index('stream_chat_stream_created_idx').on(table.streamId, table.createdAt),
  })
);

// Stream moderators - users who can moderate a stream's chat
export const streamModerators = pgTable(
  'stream_moderators',
  {
    id: text('id').primaryKey(),
    streamId: text('stream_id')
      .notNull()
      .references(() => liveStreams.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    addedBy: text('added_by')
      .notNull()
      .references(() => users.did),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    streamIdx: index('stream_moderators_stream_idx').on(table.streamId),
    userIdx: index('stream_moderators_user_idx').on(table.userDid),
    uniqueModerator: uniqueIndex('stream_moderators_unique_idx').on(table.streamId, table.userDid),
  })
);

// Stream banned users - users banned from a stream's chat
export const streamBannedUsers = pgTable(
  'stream_banned_users',
  {
    id: text('id').primaryKey(),
    streamId: text('stream_id')
      .notNull()
      .references(() => liveStreams.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    reason: text('reason'),
    bannedBy: text('banned_by')
      .notNull()
      .references(() => users.did),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    streamIdx: index('stream_banned_users_stream_idx').on(table.streamId),
    userIdx: index('stream_banned_users_user_idx').on(table.userDid),
    uniqueBan: uniqueIndex('stream_banned_users_unique_idx').on(table.streamId, table.userDid),
    expiresIdx: index('stream_banned_users_expires_idx').on(table.expiresAt),
  })
);

// Stream viewers - tracking who is watching
export const streamViewers = pgTable(
  'stream_viewers',
  {
    id: text('id').primaryKey(),
    streamId: text('stream_id')
      .notNull()
      .references(() => liveStreams.id, { onDelete: 'cascade' }),
    userDid: text('user_did').references(() => users.did, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(), // For anonymous viewers
    watchDuration: integer('watch_duration').default(0).notNull(), // seconds
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    leftAt: timestamp('left_at'),
  },
  (table) => ({
    streamIdx: index('stream_viewers_stream_idx').on(table.streamId),
    userIdx: index('stream_viewers_user_idx').on(table.userDid),
    sessionIdx: index('stream_viewers_session_idx').on(table.sessionId),
    joinedIdx: index('stream_viewers_joined_idx').on(table.joinedAt),
  })
);

// ============================================
// Co-Streaming / Guest Features
// ============================================

// Stream guest invitations - pending or expired invitations
export const streamGuestInvitations = pgTable(
  'stream_guest_invitations',
  {
    id: text('id').primaryKey(),
    streamId: text('stream_id')
      .notNull()
      .references(() => liveStreams.id, { onDelete: 'cascade' }),
    inviterDid: text('inviter_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    inviteeDid: text('invitee_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked'
    role: text('role').notNull().default('guest'), // 'guest' | 'co-host'
    message: text('message'), // Optional invite message
    expiresAt: timestamp('expires_at').notNull(),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    streamIdx: index('stream_guest_invitations_stream_idx').on(table.streamId),
    inviterIdx: index('stream_guest_invitations_inviter_idx').on(table.inviterDid),
    inviteeIdx: index('stream_guest_invitations_invitee_idx').on(table.inviteeDid),
    statusIdx: index('stream_guest_invitations_status_idx').on(table.status),
    expiresIdx: index('stream_guest_invitations_expires_idx').on(table.expiresAt),
    uniqueInvite: uniqueIndex('stream_guest_invitations_unique_idx').on(
      table.streamId,
      table.inviteeDid,
      table.status
    ),
  })
);

// Stream guests - active co-streamers/guests in a stream
export const streamGuests = pgTable(
  'stream_guests',
  {
    id: text('id').primaryKey(),
    streamId: text('stream_id')
      .notNull()
      .references(() => liveStreams.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    invitationId: text('invitation_id')
      .references(() => streamGuestInvitations.id, { onDelete: 'set null' }),
    role: text('role').notNull().default('guest'), // 'guest' | 'co-host'
    status: text('status').notNull().default('active'), // 'active' | 'disconnected' | 'removed'
    audioEnabled: boolean('audio_enabled').default(true).notNull(),
    videoEnabled: boolean('video_enabled').default(true).notNull(),
    screenShareEnabled: boolean('screen_share_enabled').default(false).notNull(),
    position: integer('position').default(0).notNull(), // Display order
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    leftAt: timestamp('left_at'),
    // WebRTC/SFU connection info
    connectionId: text('connection_id'),
    peerId: text('peer_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => ({
    streamIdx: index('stream_guests_stream_idx').on(table.streamId),
    userIdx: index('stream_guests_user_idx').on(table.userDid),
    statusIdx: index('stream_guests_status_idx').on(table.status),
    positionIdx: index('stream_guests_position_idx').on(table.streamId, table.position),
    uniqueGuest: uniqueIndex('stream_guests_unique_idx').on(table.streamId, table.userDid),
  })
);

// Stream guest sessions - track guest connection history
export const streamGuestSessions = pgTable(
  'stream_guest_sessions',
  {
    id: text('id').primaryKey(),
    guestId: text('guest_id')
      .notNull()
      .references(() => streamGuests.id, { onDelete: 'cascade' }),
    streamId: text('stream_id')
      .notNull()
      .references(() => liveStreams.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    connectionId: text('connection_id').notNull(),
    duration: integer('duration').default(0).notNull(), // seconds
    disconnectReason: text('disconnect_reason'), // 'left' | 'kicked' | 'stream_ended' | 'connection_lost'
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    leftAt: timestamp('left_at'),
  },
  (table) => ({
    guestIdx: index('stream_guest_sessions_guest_idx').on(table.guestId),
    streamIdx: index('stream_guest_sessions_stream_idx').on(table.streamId),
    userIdx: index('stream_guest_sessions_user_idx').on(table.userDid),
    joinedIdx: index('stream_guest_sessions_joined_idx').on(table.joinedAt),
  })
);

// ============================================
// Payment Processing Tables
// ============================================

// Payment configurations - per user or organization
export const paymentConfigs = pgTable(
  'payment_configs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    userDid: text('user_did').references(() => users.did, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'stripe' | 'paypal' | 'authorizenet'
    providerAccountId: text('provider_account_id'),
    credentials: jsonb('credentials').$type<Record<string, string>>(), // encrypted
    testMode: boolean('test_mode').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('payment_configs_org_idx').on(table.organizationId),
    userIdx: index('payment_configs_user_idx').on(table.userDid),
    providerIdx: index('payment_configs_provider_idx').on(table.provider),
    activeIdx: index('payment_configs_active_idx').on(table.isActive),
  })
);

// Payment customers - linked to provider
export const paymentCustomers = pgTable(
  'payment_customers',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    configId: text('config_id')
      .notNull()
      .references(() => paymentConfigs.id, { onDelete: 'cascade' }),
    providerCustomerId: text('provider_customer_id').notNull(),
    email: text('email'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('payment_customers_user_idx').on(table.userDid),
    configIdx: index('payment_customers_config_idx').on(table.configId),
    providerIdIdx: uniqueIndex('payment_customers_provider_id_idx').on(table.configId, table.providerCustomerId),
  })
);

// Payment transactions
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: text('id').primaryKey(),
    configId: text('config_id')
      .notNull()
      .references(() => paymentConfigs.id),
    customerId: text('customer_id').references(() => paymentCustomers.id),
    providerTransactionId: text('provider_transaction_id'),
    type: text('type').notNull(), // 'charge' | 'refund' | 'tip' | 'subscription' | 'payout'
    status: text('status').notNull(), // 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
    amount: integer('amount').notNull(), // cents
    currency: text('currency').default('usd').notNull(),
    fromDid: text('from_did').references(() => users.did),
    toDid: text('to_did').references(() => users.did),
    description: text('description'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    refundedAmount: integer('refunded_amount'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    configIdx: index('payment_transactions_config_idx').on(table.configId),
    customerIdx: index('payment_transactions_customer_idx').on(table.customerId),
    typeIdx: index('payment_transactions_type_idx').on(table.type),
    statusIdx: index('payment_transactions_status_idx').on(table.status),
    fromDidIdx: index('payment_transactions_from_did_idx').on(table.fromDid),
    toDidIdx: index('payment_transactions_to_did_idx').on(table.toDid),
    createdIdx: index('payment_transactions_created_idx').on(table.createdAt),
    idempotencyIdx: uniqueIndex('payment_transactions_idempotency_idx').on(table.idempotencyKey),
    providerIdIdx: index('payment_transactions_provider_id_idx').on(table.providerTransactionId),
  })
);

// Payment methods - stored for customers
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    configId: text('config_id')
      .notNull()
      .references(() => paymentConfigs.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').references(() => paymentCustomers.id, { onDelete: 'set null' }),
    providerPaymentMethodId: text('provider_payment_method_id').notNull(),
    type: text('type').notNull(), // 'card' | 'bank_account' | 'paypal'
    last4: text('last4'),
    brand: text('brand'),
    expiryMonth: integer('expiry_month'),
    expiryYear: integer('expiry_year'),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userDidIdx: index('payment_methods_user_did_idx').on(table.userDid),
    configIdx: index('payment_methods_config_idx').on(table.configId),
    customerIdx: index('payment_methods_customer_idx').on(table.customerId),
    defaultIdx: index('payment_methods_default_idx').on(table.userDid, table.isDefault),
  })
);

// Creator earnings - aggregated earnings for creators
export const creatorEarnings = pgTable(
  'creator_earnings',
  {
    userDid: text('user_did')
      .primaryKey()
      .references(() => users.did, { onDelete: 'cascade' }),
    totalEarnings: integer('total_earnings').default(0).notNull(), // cents
    availableBalance: integer('available_balance').default(0).notNull(),
    pendingBalance: integer('pending_balance').default(0).notNull(),
    currency: text('currency').default('usd').notNull(),
    lastPayoutAt: timestamp('last_payout_at'),
    lastPayoutAmount: integer('last_payout_amount'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }
);

// ============================================
// Certificate Authority Tables
// ============================================

// CA Root certificates
export const caRootCertificates = pgTable(
  'ca_root_certificates',
  {
    id: text('id').primaryKey(),
    commonName: text('common_name').notNull(),
    subject: jsonb('subject').$type<{
      commonName: string;
      organization?: string;
      organizationalUnit?: string;
      locality?: string;
      state?: string;
      country?: string;
    }>().notNull(),
    certificate: text('certificate').notNull(), // PEM encoded
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key').notNull(), // Encrypted PEM
    serialNumber: text('serial_number').notNull(),
    fingerprint: text('fingerprint').notNull(), // SHA-256
    algorithm: jsonb('algorithm').$type<{
      name: string;
      modulusLength: number;
      hashAlgorithm: string;
    }>().notNull(),
    notBefore: timestamp('not_before').notNull(),
    notAfter: timestamp('not_after').notNull(),
    status: text('status').default('active').notNull(), // 'active' | 'revoked' | 'expired'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    serialIdx: uniqueIndex('ca_root_serial_idx').on(table.serialNumber),
    fingerprintIdx: index('ca_root_fingerprint_idx').on(table.fingerprint),
    statusIdx: index('ca_root_status_idx').on(table.status),
  })
);

// CA Intermediate certificates
export const caIntermediateCertificates = pgTable(
  'ca_intermediate_certificates',
  {
    id: text('id').primaryKey(),
    rootId: text('root_id')
      .notNull()
      .references(() => caRootCertificates.id, { onDelete: 'cascade' }),
    commonName: text('common_name').notNull(),
    subject: jsonb('subject').$type<{
      commonName: string;
      organization?: string;
      organizationalUnit?: string;
    }>().notNull(),
    certificate: text('certificate').notNull(),
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key').notNull(),
    serialNumber: text('serial_number').notNull(),
    fingerprint: text('fingerprint').notNull(),
    pathLength: integer('path_length').default(0).notNull(),
    algorithm: jsonb('algorithm').$type<{
      name: string;
      modulusLength: number;
      hashAlgorithm: string;
    }>().notNull(),
    notBefore: timestamp('not_before').notNull(),
    notAfter: timestamp('not_after').notNull(),
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    rootIdx: index('ca_intermediate_root_idx').on(table.rootId),
    serialIdx: uniqueIndex('ca_intermediate_serial_idx').on(table.serialNumber),
    statusIdx: index('ca_intermediate_status_idx').on(table.status),
  })
);

// CA Entity certificates (client, server, code signing)
export const caEntityCertificates = pgTable(
  'ca_entity_certificates',
  {
    id: text('id').primaryKey(),
    issuerId: text('issuer_id').notNull(),
    issuerType: text('issuer_type').notNull(), // 'root' | 'intermediate'
    subjectDid: text('subject_did').references(() => users.did),
    serviceId: text('service_id'),
    certType: text('cert_type').notNull(), // 'client' | 'server' | 'code_signing'
    commonName: text('common_name').notNull(),
    subject: jsonb('subject').$type<{
      commonName: string;
      organization?: string;
    }>().notNull(),
    subjectAltNames: jsonb('subject_alt_names').$type<{
      dnsNames?: string[];
      ipAddresses?: string[];
      emails?: string[];
      uris?: string[];
    }>(),
    certificate: text('certificate').notNull(),
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key').notNull(),
    serialNumber: text('serial_number').notNull(),
    fingerprint: text('fingerprint').notNull(),
    algorithm: jsonb('algorithm').$type<{
      name: string;
      modulusLength: number;
      hashAlgorithm: string;
    }>().notNull(),
    notBefore: timestamp('not_before').notNull(),
    notAfter: timestamp('not_after').notNull(),
    status: text('status').default('active').notNull(),
    revokedAt: timestamp('revoked_at'),
    revocationReason: text('revocation_reason'),
    renewedBy: text('renewed_by'), // ID of the certificate that replaced this one
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    issuerIdx: index('ca_entity_issuer_idx').on(table.issuerId),
    subjectDidIdx: index('ca_entity_subject_did_idx').on(table.subjectDid),
    serviceIdIdx: index('ca_entity_service_id_idx').on(table.serviceId),
    certTypeIdx: index('ca_entity_cert_type_idx').on(table.certType),
    serialIdx: uniqueIndex('ca_entity_serial_idx').on(table.serialNumber),
    statusIdx: index('ca_entity_status_idx').on(table.status),
  })
);

// Certificate Revocation Lists
export const caCertificateRevocationLists = pgTable(
  'ca_certificate_revocation_lists',
  {
    id: text('id').primaryKey(),
    issuerId: text('issuer_id').notNull(),
    issuerType: text('issuer_type').notNull(), // 'root' | 'intermediate'
    crl: text('crl').notNull(), // PEM encoded
    thisUpdate: timestamp('this_update').notNull(),
    nextUpdate: timestamp('next_update').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    issuerIdx: index('ca_crl_issuer_idx').on(table.issuerId),
    nextUpdateIdx: index('ca_crl_next_update_idx').on(table.nextUpdate),
  })
);

// Organization type exports
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type BulkImportJob = typeof bulkImportJobs.$inferSelect;
export type NewBulkImportJob = typeof bulkImportJobs.$inferInsert;
export type OrganizationTag = typeof organizationTags.$inferSelect;
export type NewOrganizationTag = typeof organizationTags.$inferInsert;
export type OrganizationMemberTag = typeof organizationMemberTags.$inferSelect;
export type NewOrganizationMemberTag = typeof organizationMemberTags.$inferInsert;
export type OrganizationBlockedWord = typeof organizationBlockedWords.$inferSelect;
export type NewOrganizationBlockedWord = typeof organizationBlockedWords.$inferInsert;
export type OrganizationActivityEntry = typeof organizationActivity.$inferSelect;
export type NewOrganizationActivityEntry = typeof organizationActivity.$inferInsert;

// Live streaming type exports
export type LiveStream = typeof liveStreams.$inferSelect;
export type NewLiveStream = typeof liveStreams.$inferInsert;
export type StreamChatMessage = typeof streamChat.$inferSelect;
export type NewStreamChatMessage = typeof streamChat.$inferInsert;
export type StreamModerator = typeof streamModerators.$inferSelect;
export type NewStreamModerator = typeof streamModerators.$inferInsert;
export type StreamBannedUser = typeof streamBannedUsers.$inferSelect;
export type NewStreamBannedUser = typeof streamBannedUsers.$inferInsert;
export type StreamViewer = typeof streamViewers.$inferSelect;
export type NewStreamViewer = typeof streamViewers.$inferInsert;
export type StreamGuestInvitation = typeof streamGuestInvitations.$inferSelect;
export type NewStreamGuestInvitation = typeof streamGuestInvitations.$inferInsert;
export type StreamGuest = typeof streamGuests.$inferSelect;
export type NewStreamGuest = typeof streamGuests.$inferInsert;
export type StreamGuestSession = typeof streamGuestSessions.$inferSelect;
export type NewStreamGuestSession = typeof streamGuestSessions.$inferInsert;

// Payment type exports
export type PaymentConfig = typeof paymentConfigs.$inferSelect;
export type NewPaymentConfig = typeof paymentConfigs.$inferInsert;
export type PaymentCustomer = typeof paymentCustomers.$inferSelect;
export type NewPaymentCustomer = typeof paymentCustomers.$inferInsert;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type NewPaymentTransaction = typeof paymentTransactions.$inferInsert;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
export type CreatorEarningsRow = typeof creatorEarnings.$inferSelect;
export type NewCreatorEarningsRow = typeof creatorEarnings.$inferInsert;

// Certificate Authority type exports
export type CARootCertificate = typeof caRootCertificates.$inferSelect;
export type NewCARootCertificate = typeof caRootCertificates.$inferInsert;
export type CAIntermediateCertificate = typeof caIntermediateCertificates.$inferSelect;
export type NewCAIntermediateCertificate = typeof caIntermediateCertificates.$inferInsert;
export type CAEntityCertificate = typeof caEntityCertificates.$inferSelect;
export type NewCAEntityCertificate = typeof caEntityCertificates.$inferInsert;
export type CACRL = typeof caCertificateRevocationLists.$inferSelect;
export type NewCACRL = typeof caCertificateRevocationLists.$inferInsert;

// ============================================
// Editor Collaboration Tables
// ============================================

// Editor projects - collaborative editing projects
export const editorProjects = pgTable(
  'editor_projects',
  {
    id: text('id').primaryKey(),
    ownerDid: text('owner_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    settings: jsonb('settings').$type<{
      fps: number;
      width: number;
      height: number;
      duration: number;
      backgroundColor?: string;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('editor_projects_owner_idx').on(table.ownerDid),
    createdIdx: index('editor_projects_created_idx').on(table.createdAt),
  })
);

// Editor collaborators - users with access to projects
export const editorCollaborators = pgTable(
  'editor_collaborators',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    accessLevel: text('access_level').notNull(), // 'owner' | 'editor' | 'viewer'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('editor_collaborators_project_idx').on(table.projectId),
    userIdx: index('editor_collaborators_user_idx').on(table.userDid),
    uniqueCollaborator: uniqueIndex('editor_collaborators_unique_idx').on(
      table.projectId,
      table.userDid
    ),
  })
);

// Editor document snapshots - Yjs document versions
export const editorDocumentSnapshots = pgTable(
  'editor_document_snapshots',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    snapshot: text('snapshot').notNull(), // Yjs encoded state as base64
    version: integer('version').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('editor_snapshots_project_idx').on(table.projectId),
    versionIdx: index('editor_snapshots_version_idx').on(table.projectId, table.version),
  })
);

// Editor Collaboration type exports
export type EditorProject = typeof editorProjects.$inferSelect;
export type NewEditorProject = typeof editorProjects.$inferInsert;
export type EditorCollaborator = typeof editorCollaborators.$inferSelect;
export type NewEditorCollaborator = typeof editorCollaborators.$inferInsert;
export type EditorDocumentSnapshot = typeof editorDocumentSnapshots.$inferSelect;
export type NewEditorDocumentSnapshot = typeof editorDocumentSnapshots.$inferInsert;

// ============================================
// Relay/Federation Tables
// ============================================

// Relay events - persisted firehose events
export const relayEvents = pgTable(
  'relay_events',
  {
    seq: integer('seq').primaryKey(),
    did: text('did').notNull(),
    commit: jsonb('commit').$type<{
      rev: string;
      operation: 'create' | 'update' | 'delete';
      collection: string;
      rkey: string;
      record?: unknown;
      cid?: string;
      prev?: string;
    }>().notNull(),
    time: timestamp('time').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('relay_events_did_idx').on(table.did),
    timeIdx: index('relay_events_time_idx').on(table.time),
    collectionIdx: index('relay_events_collection_idx').on(table.did),
  })
);

// Relay subscribers - external services subscribing to firehose
export const relaySubscribers = pgTable(
  'relay_subscribers',
  {
    id: text('id').primaryKey(),
    endpoint: text('endpoint').notNull(),
    cursor: integer('cursor'),
    wantedCollections: jsonb('wanted_collections').$type<string[]>(),
    status: text('status').default('active').notNull(), // 'active' | 'inactive' | 'disconnected'
    lastHeartbeat: timestamp('last_heartbeat'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('relay_subscribers_status_idx').on(table.status),
    endpointIdx: index('relay_subscribers_endpoint_idx').on(table.endpoint),
  })
);

// DID cache - cached DID documents
export const didCache = pgTable(
  'did_cache',
  {
    did: text('did').primaryKey(),
    document: jsonb('document').notNull(),
    handle: text('handle'),
    pdsEndpoint: text('pds_endpoint'),
    signingKey: text('signing_key'),
    resolvedAt: timestamp('resolved_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    staleAt: timestamp('stale_at'),
  },
  (table) => ({
    handleIdx: index('did_cache_handle_idx').on(table.handle),
    pdsEndpointIdx: index('did_cache_pds_endpoint_idx').on(table.pdsEndpoint),
    expiresAtIdx: index('did_cache_expires_at_idx').on(table.expiresAt),
  })
);

// Service registry - known federation services
export const serviceRegistry = pgTable(
  'service_registry',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(), // 'pds' | 'relay' | 'appview' | 'labeler'
    endpoint: text('endpoint').notNull(),
    did: text('did'),
    certificateId: text('certificate_id'),
    region: text('region'),
    capabilities: jsonb('capabilities').$type<string[]>(),
    status: text('status').default('active').notNull(), // 'active' | 'inactive' | 'unhealthy'
    lastHealthCheck: timestamp('last_health_check'),
    healthCheckFailures: integer('health_check_failures').default(0).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index('service_registry_type_idx').on(table.type),
    statusIdx: index('service_registry_status_idx').on(table.status),
    endpointIdx: uniqueIndex('service_registry_endpoint_idx').on(table.endpoint),
    didIdx: index('service_registry_did_idx').on(table.did),
    regionIdx: index('service_registry_region_idx').on(table.region),
  })
);

// Federation sync state - tracking sync with remote servers
export const federationSyncState = pgTable(
  'federation_sync_state',
  {
    id: text('id').primaryKey(),
    remoteEndpoint: text('remote_endpoint').notNull(),
    remoteDid: text('remote_did'),
    lastSyncedSeq: integer('last_synced_seq'),
    lastSyncedAt: timestamp('last_synced_at'),
    syncDirection: text('sync_direction').notNull(), // 'pull' | 'push' | 'both'
    status: text('status').default('active').notNull(), // 'active' | 'paused' | 'error'
    errorMessage: text('error_message'),
    errorCount: integer('error_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    remoteEndpointIdx: uniqueIndex('federation_sync_state_endpoint_idx').on(table.remoteEndpoint),
    statusIdx: index('federation_sync_state_status_idx').on(table.status),
  })
);

// ============================================
// PLC Directory Tables
// ============================================

// PLC Operations - the append-only operations log (core of PLC)
export const plcOperations = pgTable(
  'plc_operations',
  {
    id: serial('id').primaryKey(),
    did: text('did').notNull(),
    cid: text('cid').notNull(), // CID of the operation
    operation: jsonb('operation').notNull(), // The signed operation
    nullified: boolean('nullified').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('plc_operations_did_idx').on(table.did),
    cidIdx: uniqueIndex('plc_operations_cid_idx').on(table.cid),
    createdAtIdx: index('plc_operations_created_at_idx').on(table.createdAt),
  })
);

// PLC Identities - current resolved state of each DID
export const plcIdentities = pgTable(
  'plc_identities',
  {
    did: text('did').primaryKey(),
    handle: text('handle'),
    pdsEndpoint: text('pds_endpoint'),
    signingKey: text('signing_key'), // Current signing key (multibase)
    rotationKeys: jsonb('rotation_keys').$type<string[]>().notNull(), // Array of rotation keys
    alsoKnownAs: jsonb('also_known_as').$type<string[]>(), // AT-URI aliases
    services: jsonb('services').$type<Record<string, { type: string; endpoint: string }>>(),
    lastOperationCid: text('last_operation_cid'),
    status: text('status').default('active').notNull(), // 'active' | 'tombstoned' | 'deactivated'
    tombstonedAt: timestamp('tombstoned_at'),
    tombstonedBy: text('tombstoned_by'), // Admin/user who performed the tombstone
    tombstoneReason: text('tombstone_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    handleIdx: uniqueIndex('plc_identities_handle_idx').on(table.handle),
    pdsIdx: index('plc_identities_pds_idx').on(table.pdsEndpoint),
    statusIdx: index('plc_identities_status_idx').on(table.status),
  })
);

// PLC Handle Reservations - reserved handles for organizations
export const plcHandleReservations = pgTable(
  'plc_handle_reservations',
  {
    id: serial('id').primaryKey(),
    handle: text('handle').notNull().unique(),
    handleType: text('handle_type').notNull(), // 'user' | 'org'
    organizationId: text('organization_id'), // Links to organizations table for org handles
    reservedBy: text('reserved_by'), // DID that reserved this
    reservedAt: timestamp('reserved_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'), // null = permanent
    status: text('status').default('active').notNull(), // 'active' | 'expired' | 'released'
  },
  (table) => ({
    handleIdx: uniqueIndex('plc_handle_reservations_handle_idx').on(table.handle),
    orgIdx: index('plc_handle_reservations_org_idx').on(table.organizationId),
  })
);

// PLC Audit Log - track all operations for compliance
export const plcAuditLog = pgTable(
  'plc_audit_log',
  {
    id: serial('id').primaryKey(),
    did: text('did').notNull(),
    action: text('action').notNull(), // 'create' | 'update' | 'rotate_key' | 'update_handle' | 'tombstone'
    operationCid: text('operation_cid'),
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('plc_audit_log_did_idx').on(table.did),
    actionIdx: index('plc_audit_log_action_idx').on(table.action),
    createdAtIdx: index('plc_audit_log_created_at_idx').on(table.createdAt),
  })
);

// Relay/Federation type exports
export type RelayEvent = typeof relayEvents.$inferSelect;
export type NewRelayEvent = typeof relayEvents.$inferInsert;
export type RelaySubscriber = typeof relaySubscribers.$inferSelect;
export type NewRelaySubscriber = typeof relaySubscribers.$inferInsert;
export type DidCacheEntry = typeof didCache.$inferSelect;
export type NewDidCacheEntry = typeof didCache.$inferInsert;
export type ServiceRegistryEntry = typeof serviceRegistry.$inferSelect;
export type NewServiceRegistryEntry = typeof serviceRegistry.$inferInsert;
export type FederationSyncStateEntry = typeof federationSyncState.$inferSelect;
export type NewFederationSyncStateEntry = typeof federationSyncState.$inferInsert;

// ============================================
// Announcements
// ============================================

export const announcements = pgTable('announcements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull().default('info'), // info, warning, success, maintenance
  status: text('status').notNull().default('draft'), // draft, active, scheduled, expired
  targetAudience: text('target_audience').notNull().default('all'), // all, verified, creators, new_users
  dismissible: boolean('dismissible').notNull().default(true),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  viewCount: integer('view_count').notNull().default(0),
  dismissCount: integer('dismiss_count').notNull().default(0),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// Payout Requests (Admin)
// ============================================

export const payoutRequests = pgTable('payout_requests', {
  id: text('id').primaryKey(),
  userDid: text('user_did').notNull(),
  amount: integer('amount').notNull(), // in cents
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('pending'), // pending, processing, completed, rejected
  payoutMethod: text('payout_method'), // bank_transfer, paypal
  payoutDetails: jsonb('payout_details').$type<Record<string, unknown>>(),
  processedBy: text('processed_by'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userDidIdx: index('payout_requests_user_did_idx').on(table.userDid),
  statusIdx: index('payout_requests_status_idx').on(table.status),
}));

// ============================================
// Content Moderation System
// ============================================

// Moderation Items - content submitted for moderation
export const moderationItems = pgTable('moderation_items', {
  id: text('id').primaryKey(),
  contentType: text('content_type').notNull(), // 'text' | 'image' | 'video' | 'audio' | 'post' | 'comment' | 'message' | 'profile'
  contentId: text('content_id').notNull(),
  sourceService: text('source_service').notNull(), // 'timeline' | 'spark' | 'gallery' | 'live' | 'filevault'
  userId: text('user_id').notNull(),
  contentText: text('content_text'),
  contentUrl: text('content_url'),
  contentMetadata: jsonb('content_metadata').$type<Record<string, unknown>>().default({}),
  // Risk scores (0-100)
  riskScore: integer('risk_score').notNull().default(0),
  riskLevel: text('risk_level').notNull().default('safe'), // 'safe' | 'low' | 'medium' | 'high' | 'critical'
  toxicityScore: integer('toxicity_score').default(0),
  nsfwScore: integer('nsfw_score').default(0),
  spamScore: integer('spam_score').default(0),
  violenceScore: integer('violence_score').default(0),
  hateSpeechScore: integer('hate_speech_score').default(0),
  // AI analysis
  aiProvider: text('ai_provider'), // 'claude' | 'openai' | 'deepseek' | 'local'
  aiModel: text('ai_model'),
  aiResponse: jsonb('ai_response').$type<Record<string, unknown>>(),
  // Status
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected' | 'flagged' | 'reviewing' | 'appealed' | 'escalated'
  action: text('action'), // 'auto_approve' | 'approve' | 'reject' | 'hide' | 'remove' | 'warn' | 'flag' | 'escalate' | 'require_review'
  requiresReview: boolean('requires_review').default(false),
  // Review
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  reviewNotes: text('review_notes'),
  // Timestamps
  submittedAt: timestamp('submitted_at').notNull(),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('moderation_items_user_id_idx').on(table.userId),
  statusIdx: index('moderation_items_status_idx').on(table.status),
  riskLevelIdx: index('moderation_items_risk_level_idx').on(table.riskLevel),
  sourceServiceIdx: index('moderation_items_source_service_idx').on(table.sourceService),
  submittedAtIdx: index('moderation_items_submitted_at_idx').on(table.submittedAt),
  contentUniqueIdx: uniqueIndex('moderation_items_content_unique_idx').on(table.sourceService, table.contentType, table.contentId),
}));

// Review Queue - items needing manual review
export const moderationReviewQueue = pgTable('moderation_review_queue', {
  id: text('id').primaryKey(),
  moderationItemId: text('moderation_item_id').notNull().references(() => moderationItems.id, { onDelete: 'cascade' }),
  priority: integer('priority').default(0),
  escalated: boolean('escalated').default(false),
  escalatedReason: text('escalated_reason'),
  assignedTo: text('assigned_to'),
  assignedAt: timestamp('assigned_at'),
  status: text('status').notNull().default('pending'), // 'pending' | 'in_progress' | 'approved' | 'rejected'
  queuedAt: timestamp('queued_at').notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('moderation_review_queue_status_idx').on(table.status),
  priorityIdx: index('moderation_review_queue_priority_idx').on(table.priority, table.queuedAt),
  assignedToIdx: index('moderation_review_queue_assigned_to_idx').on(table.assignedTo),
  escalatedIdx: index('moderation_review_queue_escalated_idx').on(table.escalated),
}));

// Moderation Actions Log - log of all AI moderation actions taken
export const modActionsLog = pgTable('mod_actions_log', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  contentType: text('content_type').notNull(),
  contentId: text('content_id').notNull(),
  sourceService: text('source_service').notNull(),
  performedBy: text('performed_by'),
  isAutomated: boolean('is_automated').default(false),
  reason: text('reason'),
  moderationItemId: text('moderation_item_id').references(() => moderationItems.id),
  reportId: text('report_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  performedAt: timestamp('performed_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  moderationItemIdIdx: index('mod_actions_log_moderation_item_id_idx').on(table.moderationItemId),
  performedAtIdx: index('mod_actions_log_performed_at_idx').on(table.performedAt),
}));

// Moderation Rules - custom auto-moderation rules
export const moderationRules = pgTable('moderation_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  appliesTo: jsonb('applies_to').$type<string[]>().default([]), // content types
  sourceServices: jsonb('source_services').$type<string[]>().default([]),
  conditions: jsonb('conditions').$type<Record<string, unknown>>().default({}),
  thresholdScore: integer('threshold_score'),
  action: text('action').notNull(),
  enabled: boolean('enabled').default(true),
  priority: integer('priority').default(0),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  enabledIdx: index('moderation_rules_enabled_idx').on(table.enabled),
  priorityIdx: index('moderation_rules_priority_idx').on(table.priority),
}));

// User Reports - user-submitted content reports
export const moderationReports = pgTable('moderation_reports', {
  id: text('id').primaryKey(),
  contentType: text('content_type').notNull(),
  contentId: text('content_id').notNull(),
  sourceService: text('source_service').notNull(),
  reportedBy: text('reported_by').notNull(),
  reason: text('reason').notNull(), // 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'nsfw' | 'misinformation' | 'copyright' | 'impersonation' | 'other'
  details: text('details'),
  status: text('status').notNull().default('open'), // 'open' | 'investigating' | 'resolved' | 'dismissed' | 'escalated'
  assignedTo: text('assigned_to'),
  assignedAt: timestamp('assigned_at'),
  resolvedBy: text('resolved_by'),
  resolvedAt: timestamp('resolved_at'),
  resolutionNotes: text('resolution_notes'),
  actionTaken: text('action_taken'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('moderation_reports_status_idx').on(table.status),
  reportedByIdx: index('moderation_reports_reported_by_idx').on(table.reportedBy),
  contentIdx: index('moderation_reports_content_idx').on(table.sourceService, table.contentType, table.contentId),
}));

// User Actions - sanctions applied to users
export const moderationUserActions = pgTable('moderation_user_actions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  actionType: text('action_type').notNull(), // 'warn' | 'mute' | 'restrict' | 'suspend' | 'ban'
  reason: text('reason').notNull(),
  durationSeconds: integer('duration_seconds'), // null = permanent
  expiresAt: timestamp('expires_at'),
  performedBy: text('performed_by').notNull(),
  relatedContentId: text('related_content_id'),
  relatedReportId: text('related_report_id'),
  active: boolean('active').default(true),
  performedAt: timestamp('performed_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('moderation_user_actions_user_id_idx').on(table.userId),
  actionTypeIdx: index('moderation_user_actions_action_type_idx').on(table.actionType),
  activeIdx: index('moderation_user_actions_active_idx').on(table.active),
  expiresAtIdx: index('moderation_user_actions_expires_at_idx').on(table.expiresAt),
}));

// Appeals - user appeals of moderation decisions
export const moderationAppeals = pgTable('moderation_appeals', {
  id: text('id').primaryKey(),
  moderationItemId: text('moderation_item_id').references(() => moderationItems.id),
  userActionId: text('user_action_id').references(() => moderationUserActions.id),
  userId: text('user_id').notNull(),
  reason: text('reason').notNull(),
  additionalInfo: text('additional_info'),
  status: text('status').notNull().default('pending'), // 'pending' | 'reviewing' | 'approved' | 'denied'
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  reviewNotes: text('review_notes'),
  decision: text('decision'),
  submittedAt: timestamp('submitted_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('moderation_appeals_user_id_idx').on(table.userId),
  statusIdx: index('moderation_appeals_status_idx').on(table.status),
  submittedAtIdx: index('moderation_appeals_submitted_at_idx').on(table.submittedAt),
}));

// AI Agents - configured AI moderation agents
export const moderationAiAgents = pgTable('moderation_ai_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  type: text('type').notNull(), // 'text_moderation' | 'image_moderation' | 'spam_detection' | 'hate_speech_detection' | etc.
  status: text('status').notNull().default('active'), // 'active' | 'inactive' | 'testing' | 'error'
  provider: text('provider').notNull(), // 'claude' | 'openai' | 'deepseek' | 'local'
  model: text('model'),
  promptTemplate: text('prompt_template'),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  thresholdScores: jsonb('threshold_scores').$type<Record<string, number>>().default({}),
  appliesTo: jsonb('applies_to').$type<string[]>().default([]),
  priority: integer('priority').default(0),
  enabled: boolean('enabled').default(true),
  autoAction: boolean('auto_action').default(false),
  // Performance metrics
  totalExecutions: integer('total_executions').default(0),
  successfulExecutions: integer('successful_executions').default(0),
  failedExecutions: integer('failed_executions').default(0),
  avgExecutionTimeMs: integer('avg_execution_time_ms').default(0),
  lastExecutionAt: timestamp('last_execution_at'),
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  enabledIdx: index('moderation_ai_agents_enabled_idx').on(table.enabled),
  providerIdx: index('moderation_ai_agents_provider_idx').on(table.provider),
  statusIdx: index('moderation_ai_agents_status_idx').on(table.status),
}));

// Agent Executions - log of AI agent runs
export const moderationAgentExecutions = pgTable('moderation_agent_executions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => moderationAiAgents.id),
  moderationItemId: text('moderation_item_id').references(() => moderationItems.id),
  success: boolean('success').notNull(),
  executionTimeMs: integer('execution_time_ms').notNull(),
  inputData: jsonb('input_data').$type<Record<string, unknown>>(),
  outputData: jsonb('output_data').$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  agentIdIdx: index('moderation_agent_executions_agent_id_idx').on(table.agentId),
  createdAtIdx: index('moderation_agent_executions_created_at_idx').on(table.createdAt),
}));

// Banned Words - words/phrases to auto-flag
export const moderationBannedWords = pgTable('moderation_banned_words', {
  id: text('id').primaryKey(),
  word: text('word').notNull(),
  category: text('category').notNull(), // 'profanity' | 'slur' | 'spam' | 'custom'
  severity: text('severity').notNull().default('medium'), // 'low' | 'medium' | 'high' | 'critical'
  action: text('action').notNull().default('flag'), // 'flag' | 'hide' | 'reject'
  enabled: boolean('enabled').default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  wordIdx: uniqueIndex('moderation_banned_words_word_idx').on(table.word),
  categoryIdx: index('moderation_banned_words_category_idx').on(table.category),
  enabledIdx: index('moderation_banned_words_enabled_idx').on(table.enabled),
}));

// Banned Tags - hashtags to auto-flag
export const moderationBannedTags = pgTable('moderation_banned_tags', {
  id: text('id').primaryKey(),
  tag: text('tag').notNull(),
  reason: text('reason'),
  action: text('action').notNull().default('flag'), // 'flag' | 'hide' | 'reject'
  enabled: boolean('enabled').default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tagIdx: uniqueIndex('moderation_banned_tags_tag_idx').on(table.tag),
  enabledIdx: index('moderation_banned_tags_enabled_idx').on(table.enabled),
}));

// PLC type exports
export type PlcOperation = typeof plcOperations.$inferSelect;
export type NewPlcOperation = typeof plcOperations.$inferInsert;
export type PlcIdentity = typeof plcIdentities.$inferSelect;
export type NewPlcIdentity = typeof plcIdentities.$inferInsert;
export type PlcHandleReservation = typeof plcHandleReservations.$inferSelect;
export type NewPlcHandleReservation = typeof plcHandleReservations.$inferInsert;
export type PlcAuditLogEntry = typeof plcAuditLog.$inferSelect;
export type NewPlcAuditLogEntry = typeof plcAuditLog.$inferInsert;

// Announcement type exports
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;

// Payout Request type exports
export type PayoutRequest = typeof payoutRequests.$inferSelect;
export type NewPayoutRequest = typeof payoutRequests.$inferInsert;

// Moderation type exports
export type ModerationItem = typeof moderationItems.$inferSelect;
export type NewModerationItem = typeof moderationItems.$inferInsert;
export type ModerationReviewQueueItem = typeof moderationReviewQueue.$inferSelect;
export type NewModerationReviewQueueItem = typeof moderationReviewQueue.$inferInsert;
export type ModActionLog = typeof modActionsLog.$inferSelect;
export type NewModActionLog = typeof modActionsLog.$inferInsert;
export type ModerationRule = typeof moderationRules.$inferSelect;
export type NewModerationRule = typeof moderationRules.$inferInsert;
export type ModerationReport = typeof moderationReports.$inferSelect;
export type NewModerationReport = typeof moderationReports.$inferInsert;
export type ModerationUserAction = typeof moderationUserActions.$inferSelect;
export type NewModerationUserAction = typeof moderationUserActions.$inferInsert;
export type ModerationAppeal = typeof moderationAppeals.$inferSelect;
export type NewModerationAppeal = typeof moderationAppeals.$inferInsert;
export type ModerationAiAgent = typeof moderationAiAgents.$inferSelect;
export type NewModerationAiAgent = typeof moderationAiAgents.$inferInsert;
export type ModerationAgentExecution = typeof moderationAgentExecutions.$inferSelect;
export type NewModerationAgentExecution = typeof moderationAgentExecutions.$inferInsert;
export type ModerationBannedWord = typeof moderationBannedWords.$inferSelect;
export type NewModerationBannedWord = typeof moderationBannedWords.$inferInsert;
export type ModerationBannedTag = typeof moderationBannedTags.$inferSelect;
export type NewModerationBannedTag = typeof moderationBannedTags.$inferInsert;

// ============================================
// Admin Settings & Audit Tables
// ============================================

// Admin permission changes audit - tracks who changed what permissions
export const adminPermissionAudit = pgTable(
  'admin_permission_audit',
  {
    id: text('id').primaryKey(),
    targetAdminId: text('target_admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    performedBy: text('performed_by')
      .notNull()
      .references(() => adminUsers.id),
    action: text('action').notNull(), // 'grant' | 'revoke' | 'role_change'
    previousRole: text('previous_role'),
    newRole: text('new_role'),
    previousPermissions: jsonb('previous_permissions').$type<string[]>(),
    newPermissions: jsonb('new_permissions').$type<string[]>(),
    reason: text('reason'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    targetAdminIdx: index('admin_permission_audit_target_idx').on(table.targetAdminId),
    performedByIdx: index('admin_permission_audit_performed_by_idx').on(table.performedBy),
    actionIdx: index('admin_permission_audit_action_idx').on(table.action),
    createdAtIdx: index('admin_permission_audit_created_at_idx').on(table.createdAt),
  })
);

// Admin sessions - track active admin sessions
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    sessionToken: text('session_token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    deviceInfo: jsonb('device_info').$type<{
      browser?: string;
      os?: string;
      device?: string;
    }>(),
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    revokedReason: text('revoked_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    adminIdIdx: index('admin_sessions_admin_id_idx').on(table.adminId),
    sessionTokenIdx: uniqueIndex('admin_sessions_token_idx').on(table.sessionToken),
    expiresAtIdx: index('admin_sessions_expires_at_idx').on(table.expiresAt),
    lastActivityIdx: index('admin_sessions_last_activity_idx').on(table.lastActivityAt),
  })
);

// CA configuration settings
export const caConfig = pgTable('ca_config', {
  id: text('id').primaryKey().default('default'),
  // Certificate validity settings
  rootCertValidityDays: integer('root_cert_validity_days').default(7300).notNull(), // 20 years
  intermediateCertValidityDays: integer('intermediate_cert_validity_days').default(3650).notNull(), // 10 years
  entityCertValidityDays: integer('entity_cert_validity_days').default(365).notNull(), // 1 year
  // Algorithm settings
  defaultKeySize: integer('default_key_size').default(4096).notNull(),
  defaultHashAlgorithm: text('default_hash_algorithm').default('SHA-256').notNull(),
  // CRL settings
  crlAutoGenerate: boolean('crl_auto_generate').default(true).notNull(),
  crlGenerationIntervalHours: integer('crl_generation_interval_hours').default(24).notNull(),
  crlValidityHours: integer('crl_validity_hours').default(168).notNull(), // 7 days
  lastCrlGeneratedAt: timestamp('last_crl_generated_at'),
  // Certificate renewal settings
  renewalReminderDays: integer('renewal_reminder_days').default(30).notNull(),
  autoRenewalEnabled: boolean('auto_renewal_enabled').default(false).notNull(),
  // Rate limiting
  maxCertsPerUserPerDay: integer('max_certs_per_user_per_day').default(5).notNull(),
  maxServiceCertsPerDay: integer('max_service_certs_per_day').default(50).notNull(),
  // OCSP settings (future)
  ocspEnabled: boolean('ocsp_enabled').default(false).notNull(),
  ocspResponderUrl: text('ocsp_responder_url'),
  // Audit
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Moderation configuration settings
export const moderationConfig = pgTable('moderation_config', {
  id: text('id').primaryKey().default('default'),
  // Risk threshold settings
  autoApproveThreshold: integer('auto_approve_threshold').default(20).notNull(), // 0-100
  autoRejectThreshold: integer('auto_reject_threshold').default(80).notNull(),
  requireReviewThreshold: integer('require_review_threshold').default(50).notNull(),
  // Category weights for risk calculation
  toxicityWeight: integer('toxicity_weight').default(100).notNull(),
  nsfwWeight: integer('nsfw_weight').default(100).notNull(),
  spamWeight: integer('spam_weight').default(80).notNull(),
  violenceWeight: integer('violence_weight').default(100).notNull(),
  hateSpeechWeight: integer('hate_speech_weight').default(100).notNull(),
  // AI provider settings
  primaryAiProvider: text('primary_ai_provider').default('claude').notNull(),
  fallbackAiProvider: text('fallback_ai_provider'),
  aiTimeoutMs: integer('ai_timeout_ms').default(30000).notNull(),
  aiRetryAttempts: integer('ai_retry_attempts').default(2).notNull(),
  // Queue settings
  maxQueueSize: integer('max_queue_size').default(10000).notNull(),
  escalationThresholdHours: integer('escalation_threshold_hours').default(24).notNull(),
  autoAssignEnabled: boolean('auto_assign_enabled').default(false).notNull(),
  // Appeal settings
  appealWindowDays: integer('appeal_window_days').default(30).notNull(),
  maxAppealsPerUser: integer('max_appeals_per_user').default(3).notNull(),
  appealCooldownDays: integer('appeal_cooldown_days').default(7).notNull(),
  // User action defaults
  defaultWarnExpiryDays: integer('default_warn_expiry_days').default(90).notNull(),
  defaultSuspensionDays: integer('default_suspension_days').default(7).notNull(),
  // Notification settings
  notifyOnHighRisk: boolean('notify_on_high_risk').default(true).notNull(),
  notifyOnAppeal: boolean('notify_on_appeal').default(true).notNull(),
  notifyOnEscalation: boolean('notify_on_escalation').default(true).notNull(),
  // Audit
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Auth configuration settings
export const authConfig = pgTable('auth_config', {
  id: text('id').primaryKey().default('default'),
  // Session settings
  sessionDurationHours: integer('session_duration_hours').default(24).notNull(),
  adminSessionDurationHours: integer('admin_session_duration_hours').default(8).notNull(),
  maxConcurrentSessions: integer('max_concurrent_sessions').default(5).notNull(),
  maxConcurrentAdminSessions: integer('max_concurrent_admin_sessions').default(3).notNull(),
  // Token settings
  accessTokenExpiryMinutes: integer('access_token_expiry_minutes').default(60).notNull(),
  refreshTokenExpiryDays: integer('refresh_token_expiry_days').default(30).notNull(),
  // Token type settings
  localTokensEnabled: boolean('local_tokens_enabled').default(true).notNull(),
  oauthTokensEnabled: boolean('oauth_tokens_enabled').default(true).notNull(),
  apiKeysEnabled: boolean('api_keys_enabled').default(false).notNull(),
  serviceTokensEnabled: boolean('service_tokens_enabled').default(true).notNull(),
  // Security settings
  requireMfaForAdmins: boolean('require_mfa_for_admins').default(false).notNull(),
  allowedMfaMethods: jsonb('allowed_mfa_methods').$type<string[]>().default(['totp', 'webauthn']),
  passwordMinLength: integer('password_min_length').default(12).notNull(),
  passwordRequireUppercase: boolean('password_require_uppercase').default(true).notNull(),
  passwordRequireNumbers: boolean('password_require_numbers').default(true).notNull(),
  passwordRequireSymbols: boolean('password_require_symbols').default(false).notNull(),
  // Rate limiting - login
  maxLoginAttempts: integer('max_login_attempts').default(5).notNull(),
  lockoutDurationMinutes: integer('lockout_duration_minutes').default(15).notNull(),
  // Rate limiting - API (per minute)
  userRateLimitPerMinute: integer('user_rate_limit_per_minute').default(60).notNull(),
  adminRateLimitPerMinute: integer('admin_rate_limit_per_minute').default(120).notNull(),
  anonymousRateLimitPerMinute: integer('anonymous_rate_limit_per_minute').default(30).notNull(),
  // Rate limiting - burst
  userBurstLimit: integer('user_burst_limit').default(20).notNull(),
  adminBurstLimit: integer('admin_burst_limit').default(50).notNull(),
  // OAuth settings
  oauthEnabled: boolean('oauth_enabled').default(true).notNull(),
  allowedOauthProviders: jsonb('allowed_oauth_providers').$type<string[]>().default(['atproto']),
  allowedOauthScopes: jsonb('allowed_oauth_scopes').$type<string[]>().default(['atproto', 'openid', 'profile', 'read', 'write']),
  defaultOauthScopes: jsonb('default_oauth_scopes').$type<string[]>().default(['atproto']),
  // Audit
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Admin Settings type exports
export type AdminPermissionAuditEntry = typeof adminPermissionAudit.$inferSelect;
export type NewAdminPermissionAuditEntry = typeof adminPermissionAudit.$inferInsert;
export type AdminSession = typeof adminSessions.$inferSelect;
export type NewAdminSession = typeof adminSessions.$inferInsert;
export type CAConfig = typeof caConfig.$inferSelect;
export type NewCAConfig = typeof caConfig.$inferInsert;
export type ModerationConfig = typeof moderationConfig.$inferSelect;
export type NewModerationConfig = typeof moderationConfig.$inferInsert;
export type AuthConfig = typeof authConfig.$inferSelect;
export type NewAuthConfig = typeof authConfig.$inferInsert;

