import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  index,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Users table - cached user profiles from PDS
export const users = pgTable(
  'users',
  {
    did: text('did').primaryKey(),
    handle: text('handle').notNull(),
    displayName: text('display_name'),
    avatar: text('avatar'),
    bio: text('bio'),
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
