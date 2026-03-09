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
    // Emoji reaction counts
    fireCount: integer('fire_count').default(0).notNull(),
    loveCount: integer('love_count').default(0).notNull(),
    laughCount: integer('laugh_count').default(0).notNull(),
    wowCount: integer('wow_count').default(0).notNull(),
    sadCount: integer('sad_count').default(0).notNull(),
    angryCount: integer('angry_count').default(0).notNull(),
    // Organization publishing - when video is published on behalf of an org
    publishedAsOrgId: text('published_as_org_id'),
    // Moderation and deletion
    moderationStatus: text('moderation_status').default('approved').notNull(), // 'pending_review' | 'approved' | 'rejected' | 'auto_approved'
    deletedAt: timestamp('deleted_at'),
    deletedBy: text('deleted_by'),
    deletionType: text('deletion_type'), // 'user_soft' | 'domain_mod' | 'global_admin' | 'system_hard'
    deletionReason: text('deletion_reason'),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => ({
    authorIdx: index('videos_author_idx').on(table.authorDid),
    createdIdx: index('videos_created_idx').on(table.createdAt),
    soundIdx: index('videos_sound_idx').on(table.soundUri),
    visibilityIdx: index('videos_visibility_idx').on(table.visibility),
    publishedAsOrgIdx: index('videos_published_as_org_idx').on(table.publishedAsOrgId),
    moderationStatusIdx: index('videos_moderation_status_idx').on(table.moderationStatus),
    deletedAtIdx: index('videos_deleted_at_idx').on(table.deletedAt),
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

// Video emoji reactions (fire, love, laugh, wow, sad, angry)
export const videoReactions = pgTable(
  'video_reactions',
  {
    id: text('id').primaryKey(),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    reactionType: text('reaction_type').notNull(), // 'fire' | 'love' | 'laugh' | 'wow' | 'sad' | 'angry'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('video_reactions_video_idx').on(table.videoUri),
    authorIdx: index('video_reactions_author_idx').on(table.authorDid),
    uniqueReaction: uniqueIndex('video_reactions_unique_idx').on(
      table.videoUri,
      table.authorDid,
      table.reactionType
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
    // Enhanced engagement signals for FYP personalization
    skipRate: real('skip_rate'), // 0.0 to 1.0 - how quickly user swiped past
    rewatchCount: integer('rewatch_count').default(0), // number of times video was rewatched
    loopCount: integer('loop_count').default(0), // number of complete loops watched
    interactionQuality: real('interaction_quality'), // computed engagement quality score
    sessionPosition: integer('session_position'), // position in viewing session (1st, 2nd, 3rd video)
    engagementActions: jsonb('engagement_actions').$type<string[]>(), // paused, unmuted, fullscreen, shared, etc.
    milestone: text('milestone'), // '25%', '50%', '75%', '100%' - watch progress milestone
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('interactions_user_idx').on(table.userDid),
    videoIdx: index('interactions_video_idx').on(table.videoUri),
    typeIdx: index('interactions_type_idx').on(table.interactionType),
    createdIdx: index('interactions_created_idx').on(table.createdAt),
    qualityIdx: index('interactions_quality_idx').on(table.interactionQuality),
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
    // Retry support
    retryCount: integer('retry_count').default(0).notNull(),
    maxRetries: integer('max_retries').default(5).notNull(),
    lastRetryAt: timestamp('last_retry_at'),
    retryHistory: jsonb('retry_history').$type<Array<{ attemptedAt: string; error: string }>>().default([]),
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
  editor: jsonb('editor').$type<{
    defaultPresetId: string | null;
    favoritePresetIds: string[];
    recentPresetIds: string[];
    customPresets: Array<{
      id: string;
      name: string;
      description?: string;
      effects: Array<{
        type: string;
        params: Record<string, number | string | boolean>;
      }>;
      createdAt: string;
    }>;
    showPresetDescriptions: boolean;
    autoApplyDefault: boolean;
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
    // DID method and certificate integration
    didMethod: text('did_method').default('plc'), // 'plc' | 'web' | 'exprn'
    certificateId: text('certificate_id').references(() => caEntityCertificates.id, { onDelete: 'set null' }),
    // Service account flag
    isService: boolean('is_service').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    handleIdx: uniqueIndex('actor_repos_handle_idx').on(table.handle),
    emailIdx: index('actor_repos_email_idx').on(table.email),
    statusIdx: index('actor_repos_status_idx').on(table.status),
    didMethodIdx: index('actor_repos_did_method_idx').on(table.didMethod),
    isServiceIdx: index('actor_repos_is_service_idx').on(table.isService),
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

// Setup state - tracks first-run setup wizard progress
export const setupState = pgTable('setup_state', {
  id: text('id').primaryKey().default('singleton'),
  status: text('status').notNull().default('pending'), // pending | in_progress | completed
  currentStep: integer('current_step').default(0),
  completedSteps: jsonb('completed_steps').$type<string[]>().default([]),
  setupToken: text('setup_token'), // One-time token for remote setup access
  tokenExpiresAt: timestamp('token_expires_at'),
  completedAt: timestamp('completed_at'),
  completedBy: text('completed_by'), // DID of admin who completed setup
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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
export type VideoReaction = typeof videoReactions.$inferSelect;
export type NewVideoReaction = typeof videoReactions.$inferInsert;
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
export type SetupState = typeof setupState.$inferSelect;
export type NewSetupState = typeof setupState.$inferInsert;
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
    handle: text('handle').unique(), // URL-safe handle for profile pages
    displayName: text('display_name'), // Public display name
    type: text('type').notNull(), // 'team' | 'company' | 'brand' | 'network' | 'channel' | 'enterprise' | 'nonprofit' | 'business'
    description: text('description'),
    bio: text('bio'), // Short bio for profile
    website: text('website'),
    avatar: text('avatar'),
    bannerImage: text('banner_image'), // Profile banner
    location: text('location'),
    category: text('category'), // 'Music' | 'Gaming' | 'Education' | etc.
    status: text('status').default('active').notNull(), // 'active' | 'suspended' | 'pending'
    socialLinks: jsonb('social_links').$type<{
      twitter?: string;
      instagram?: string;
      youtube?: string;
      tiktok?: string;
      discord?: string;
    }>(),
    isPublic: boolean('is_public').default(true).notNull(), // Whether profile is publicly visible
    verified: boolean('verified').default(false).notNull(),
    memberCount: integer('member_count').default(1).notNull(),
    followerCount: integer('follower_count').default(0).notNull(),
    videoCount: integer('video_count').default(0).notNull(),
    // Content moderation settings
    requireContentApproval: boolean('require_content_approval').default(false).notNull(),
    // Rate limit settings (null = use system defaults)
    rateLimitPerMinute: integer('rate_limit_per_minute'),
    burstLimit: integer('burst_limit'),
    dailyRequestLimit: integer('daily_request_limit'),
    // API access settings
    apiAccessEnabled: boolean('api_access_enabled').default(true).notNull(),
    allowedScopes: jsonb('allowed_scopes').$type<string[]>(),
    webhooksEnabled: boolean('webhooks_enabled').default(false).notNull(),
    // Custom fields for type-specific data
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
    // Infrastructure & Identity settings
    hostingType: text('hosting_type').$type<'cloud' | 'self-hosted' | 'hybrid'>().default('cloud'),
    plcProvider: text('plc_provider').$type<'exprsn' | 'bluesky' | 'self-hosted'>().default('exprsn'),
    selfHostedPlcUrl: text('self_hosted_plc_url'),
    customDomain: text('custom_domain'),
    handleSuffix: text('handle_suffix'),
    // Federation settings
    federationEnabled: boolean('federation_enabled').default(true).notNull(),
    federationConfig: jsonb('federation_config').$type<{
      inboundEnabled?: boolean;
      outboundEnabled?: boolean;
      allowedDomains?: string[];
      blockedDomains?: string[];
      syncPosts?: boolean;
      syncLikes?: boolean;
      syncFollows?: boolean;
    }>(),
    // Moderation settings
    moderationConfig: jsonb('moderation_config').$type<{
      autoModerationEnabled?: boolean;
      aiModerationEnabled?: boolean;
      requireReviewNewUsers?: boolean;
      newUserReviewDays?: number;
      shadowBanEnabled?: boolean;
      appealEnabled?: boolean;
      contentPolicies?: string[];
    }>(),
    // Verification workflow
    verificationStatus: text('verification_status').default('none').notNull(), // 'none' | 'pending' | 'verified' | 'rejected'
    verificationSubmittedAt: timestamp('verification_submitted_at'),
    verificationCompletedAt: timestamp('verification_completed_at'),
    verificationNotes: text('verification_notes'),
    verificationDocuments: jsonb('verification_documents').$type<Record<string, { url: string; type: string; uploadedAt: string }>>(),
    // Organization hierarchy
    parentOrganizationId: text('parent_organization_id'),
    domainId: text('domain_id'),
    hierarchyPath: text('hierarchy_path'), // Materialized path: /root-id/parent-id/current-id/
    hierarchyLevel: integer('hierarchy_level').default(0).notNull(),
    suspendedAt: timestamp('suspended_at'),
    suspendedBy: text('suspended_by').references(() => users.did, { onDelete: 'set null' }),
    suspendedReason: text('suspended_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('organizations_owner_idx').on(table.ownerDid),
    typeIdx: index('organizations_type_idx').on(table.type),
    nameIdx: index('organizations_name_idx').on(table.name),
    statusIdx: index('organizations_status_idx').on(table.status),
    handleIdx: uniqueIndex('organizations_handle_idx').on(table.handle),
    publicIdx: index('organizations_public_idx').on(table.isPublic),
    verificationStatusIdx: index('organizations_verification_status_idx').on(table.verificationStatus),
    parentOrgIdx: index('organizations_parent_org_idx').on(table.parentOrganizationId),
    domainOrgIdx: index('organizations_domain_org_idx').on(table.domainId),
    hierarchyPathIdx: index('organizations_hierarchy_path_idx').on(table.hierarchyPath),
  })
);

// Organization roles - role definitions per organization
export const organizationRoles = pgTable(
  'organization_roles',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // 'owner' | 'admin' | 'editor' | 'viewer' | 'member' | custom
    displayName: text('display_name').notNull(),
    isSystem: boolean('is_system').default(false).notNull(), // true for built-in roles
    permissions: jsonb('permissions').$type<string[]>().default([]),
    priority: integer('priority').default(0).notNull(), // Higher = more important for display
    color: text('color'), // Badge color (hex)
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_roles_org_idx').on(table.organizationId),
    uniqueRole: uniqueIndex('org_roles_unique_idx').on(table.organizationId, table.name),
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
    role: text('role').notNull(), // Legacy: 'owner' | 'admin' | 'member'
    roleId: text('role_id').references(() => organizationRoles.id, { onDelete: 'set null' }), // New role system
    title: text('title'), // Custom title like "Lead Editor", "Community Manager"
    canPublishOnBehalf: boolean('can_publish_on_behalf').default(false).notNull(), // Can post as organization
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
    roleIdIdx: index('org_members_role_id_idx').on(table.roleId),
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
    type: text('type').default('tag').notNull(), // 'tag' | 'group' | 'team'
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

// Organization follows - for public organization profiles
export const organizationFollows = pgTable(
  'organization_follows',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    followerDid: text('follower_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_follows_org_idx').on(table.organizationId),
    followerIdx: index('org_follows_follower_idx').on(table.followerDid),
    uniqueFollow: uniqueIndex('org_follows_unique_idx').on(table.organizationId, table.followerDid),
  })
);

// Organization invites - pending membership invitations
export const organizationInvites = pgTable(
  'organization_invites',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email'), // Invite by email (either email or invitedDid required)
    invitedDid: text('invited_did').references(() => users.did, { onDelete: 'cascade' }), // Invite by DID
    roleId: text('role_id').references(() => organizationRoles.id, { onDelete: 'set null' }),
    roleName: text('role_name'), // Fallback if role deleted
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.did),
    token: text('token').notNull(), // Unique invite token
    message: text('message'), // Optional invite message
    status: text('status').default('pending').notNull(), // 'pending' | 'accepted' | 'expired' | 'revoked'
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_invites_org_idx').on(table.organizationId),
    emailIdx: index('org_invites_email_idx').on(table.email),
    invitedDidIdx: index('org_invites_invited_did_idx').on(table.invitedDid),
    tokenIdx: uniqueIndex('org_invites_token_idx').on(table.token),
    statusIdx: index('org_invites_status_idx').on(table.status),
  })
);

// Organization billing - subscription and payment info
export const organizationBilling = pgTable(
  'organization_billing',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .unique()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionTier: text('subscription_tier').default('free').notNull(), // 'free' | 'starter' | 'pro' | 'enterprise'
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    billingEmail: text('billing_email'),
    billingName: text('billing_name'),
    billingAddress: jsonb('billing_address').$type<{
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    }>(),
    paymentMethodLast4: text('payment_method_last4'),
    paymentMethodBrand: text('payment_method_brand'), // 'visa' | 'mastercard' | etc
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    status: text('status').default('active').notNull(), // 'active' | 'past_due' | 'canceled' | 'trialing'
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    trialEndsAt: timestamp('trial_ends_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    stripeCustomerIdx: index('org_billing_stripe_customer_idx').on(table.stripeCustomerId),
    tierIdx: index('org_billing_tier_idx').on(table.subscriptionTier),
    statusIdx: index('org_billing_status_idx').on(table.status),
  })
);

// Organization content queue - content moderation before publishing
export const organizationContentQueue = pgTable(
  'organization_content_queue',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    submittedBy: text('submitted_by')
      .notNull()
      .references(() => users.did),
    submittedCaption: text('submitted_caption'), // Original caption from submission
    status: text('status').default('pending').notNull(), // 'pending' | 'approved' | 'rejected' | 'revision_requested'
    reviewedBy: text('reviewed_by').references(() => users.did),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'), // Notes from reviewer
    revisionNotes: text('revision_notes'), // Notes for submitter if revision requested
    priority: integer('priority').default(0).notNull(), // Higher = review first
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_content_queue_org_idx').on(table.organizationId),
    statusIdx: index('org_content_queue_status_idx').on(table.status),
    submittedByIdx: index('org_content_queue_submitted_by_idx').on(table.submittedBy),
    priorityIdx: index('org_content_queue_priority_idx').on(table.priority),
    createdIdx: index('org_content_queue_created_idx').on(table.createdAt),
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
// Creator Subscription System
// ============================================

// Subscription tier benefits type
export interface SubscriptionBenefits {
  earlyAccess?: boolean;
  exclusiveContent?: boolean;
  behindTheScenes?: boolean;
  directMessaging?: boolean;
  customEmojis?: boolean;
  badgeColor?: string;
  monthlyCredits?: number;
}

// Creator subscription tiers - tiers defined by creators
export const creatorSubscriptionTiers = pgTable(
  'creator_subscription_tiers',
  {
    id: text('id').primaryKey(),
    creatorDid: text('creator_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    name: text('name').notNull(), // "Bronze", "Silver", "Gold"
    description: text('description'),
    price: integer('price').notNull(), // cents/month
    benefits: jsonb('benefits').$type<SubscriptionBenefits>(),
    maxSubscribers: integer('max_subscribers'), // null = unlimited
    currentSubscribers: integer('current_subscribers').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('creator_sub_tiers_creator_idx').on(table.creatorDid),
    activeIdx: index('creator_sub_tiers_active_idx').on(table.isActive),
  })
);

// Creator subscriptions - user subscriptions to creators
export const creatorSubscriptions = pgTable(
  'creator_subscriptions',
  {
    id: text('id').primaryKey(),
    subscriberDid: text('subscriber_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    creatorDid: text('creator_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    tierId: text('tier_id')
      .notNull()
      .references(() => creatorSubscriptionTiers.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // 'active' | 'cancelled' | 'expired' | 'past_due'
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelledAt: timestamp('cancelled_at'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    subscriberIdx: index('creator_subs_subscriber_idx').on(table.subscriberDid),
    creatorIdx: index('creator_subs_creator_idx').on(table.creatorDid),
    tierIdx: index('creator_subs_tier_idx').on(table.tierId),
    statusIdx: index('creator_subs_status_idx').on(table.status),
    stripeIdx: index('creator_subs_stripe_idx').on(table.stripeSubscriptionId),
    uniqueSub: uniqueIndex('creator_subs_unique_idx').on(table.subscriberDid, table.creatorDid),
  })
);

// ============================================
// Creator Fund
// ============================================

// Creator fund payouts - monthly revenue sharing
export const creatorFundPayouts = pgTable(
  'creator_fund_payouts',
  {
    id: text('id').primaryKey(),
    creatorDid: text('creator_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    period: text('period').notNull(), // "2024-01" format
    viewCount: integer('view_count').notNull(),
    engagementScore: real('engagement_score').notNull(),
    poolShare: real('pool_share').notNull(), // percentage of total pool
    amount: integer('amount').notNull(), // cents
    status: text('status').default('pending').notNull(), // 'pending' | 'processing' | 'paid' | 'failed'
    paidAt: timestamp('paid_at'),
    transactionId: text('transaction_id'), // Reference to payment transaction
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('creator_fund_creator_idx').on(table.creatorDid),
    periodIdx: index('creator_fund_period_idx').on(table.period),
    statusIdx: index('creator_fund_status_idx').on(table.status),
    uniquePayout: uniqueIndex('creator_fund_unique_idx').on(table.creatorDid, table.period),
  })
);

// Creator fund eligibility tracking
export const creatorFundEligibility = pgTable(
  'creator_fund_eligibility',
  {
    userDid: text('user_did')
      .primaryKey()
      .references(() => users.did, { onDelete: 'cascade' }),
    isEligible: boolean('is_eligible').default(false).notNull(),
    enrolledAt: timestamp('enrolled_at'),
    minFollowers: integer('min_followers').default(1000).notNull(), // Requirement
    minViews: integer('min_views').default(10000).notNull(), // Monthly view requirement
    currentFollowers: integer('current_followers').default(0).notNull(),
    currentMonthlyViews: integer('current_monthly_views').default(0).notNull(),
    lastCheckedAt: timestamp('last_checked_at'),
    rejectionReason: text('rejection_reason'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    eligibleIdx: index('creator_fund_elig_idx').on(table.isEligible),
  })
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

// ============================================
// did:exprsn Certificate Integration
// ============================================

// Links did:exprsn DIDs to their X.509 certificates
export const exprsnDidCertificates = pgTable(
  'exprsn_did_certificates',
  {
    id: text('id').primaryKey(),
    did: text('did').notNull().unique(), // The did:exprsn identifier
    certificateId: text('certificate_id')
      .notNull()
      .references(() => caEntityCertificates.id, { onDelete: 'cascade' }),
    issuerIntermediateId: text('issuer_intermediate_id')
      .references(() => caIntermediateCertificates.id, { onDelete: 'set null' }),
    organizationId: text('organization_id')
      .references(() => organizations.id, { onDelete: 'set null' }),
    certificateType: text('certificate_type').notNull(), // 'platform' | 'organization'
    publicKeyMultibase: text('public_key_multibase').notNull(), // Multibase-encoded public key for DID doc
    status: text('status').default('active').notNull(), // 'active' | 'revoked' | 'expired'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
    revokedBy: text('revoked_by'),
    revocationReason: text('revocation_reason'),
  },
  (table) => ({
    didIdx: uniqueIndex('exprsn_did_certs_did_idx').on(table.did),
    certIdx: index('exprsn_did_certs_cert_idx').on(table.certificateId),
    orgIdx: index('exprsn_did_certs_org_idx').on(table.organizationId),
    statusIdx: index('exprsn_did_certs_status_idx').on(table.status),
  })
);

// Links organizations to their intermediate CA for issuing member certificates
export const organizationIntermediateCAs = pgTable(
  'organization_intermediate_cas',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    intermediateCertId: text('intermediate_cert_id')
      .notNull()
      .references(() => caIntermediateCertificates.id, { onDelete: 'cascade' }),
    commonName: text('common_name').notNull(), // e.g., "Acme Corp CA"
    maxPathLength: integer('max_path_length').default(0).notNull(),
    status: text('status').default('active').notNull(), // 'active' | 'revoked' | 'expired'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
    revokedBy: text('revoked_by'),
  },
  (table) => ({
    orgIdx: uniqueIndex('org_intermediate_ca_org_idx').on(table.organizationId),
    certIdx: index('org_intermediate_ca_cert_idx').on(table.intermediateCertId),
    statusIdx: index('org_intermediate_ca_status_idx').on(table.status),
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

// did:exprsn Certificate type exports
export type ExprsnDidCertificate = typeof exprsnDidCertificates.$inferSelect;
export type NewExprsnDidCertificate = typeof exprsnDidCertificates.$inferInsert;
export type OrganizationIntermediateCA = typeof organizationIntermediateCAs.$inferSelect;
export type NewOrganizationIntermediateCA = typeof organizationIntermediateCAs.$inferInsert;

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

// =============================================================================
// STUDIO EDITOR - Production Video Editing
// =============================================================================

// Editor tracks - timeline tracks for organizing clips
export const editorTracks = pgTable(
  'editor_tracks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'video' | 'audio' | 'text' | 'overlay'
    order: integer('order').notNull().default(0), // Track stacking order
    locked: boolean('locked').default(false),
    muted: boolean('muted').default(false),
    solo: boolean('solo').default(false),
    visible: boolean('visible').default(true),
    height: integer('height').default(60), // Track height in pixels
    color: text('color'), // Track color for UI
    volume: real('volume').default(1.0), // For audio tracks (0-2)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('editor_tracks_project_idx').on(table.projectId),
    orderIdx: index('editor_tracks_order_idx').on(table.projectId, table.order),
  })
);

// Editor clips - individual clips on tracks
export const editorClips = pgTable(
  'editor_clips',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => editorTracks.id, { onDelete: 'cascade' }),
    assetId: text('asset_id'), // Reference to source asset
    type: text('type').notNull(), // 'video' | 'audio' | 'image' | 'text' | 'shape' | 'solid'
    name: text('name').notNull(),
    // Timeline position (in frames)
    startFrame: integer('start_frame').notNull().default(0),
    endFrame: integer('end_frame').notNull().default(150),
    // Source trimming (in frames, for video/audio)
    sourceStart: integer('source_start').default(0),
    sourceEnd: integer('source_end'),
    // Speed & time
    speed: real('speed').default(1.0), // 0.1 to 10.0
    reverse: boolean('reverse').default(false),
    loop: boolean('loop').default(false),
    loopCount: integer('loop_count'), // null = infinite
    // Transform
    transform: jsonb('transform').$type<{
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      anchorX: number;
      anchorY: number;
      opacity: number;
    }>(),
    // Audio properties
    volume: real('volume').default(1.0),
    fadeIn: integer('fade_in').default(0), // Frames
    fadeOut: integer('fade_out').default(0), // Frames
    // Text properties (for text clips)
    textContent: text('text_content'),
    textStyle: jsonb('text_style').$type<{
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      color: string;
      backgroundColor?: string;
      align: 'left' | 'center' | 'right';
      verticalAlign: 'top' | 'middle' | 'bottom';
      lineHeight: number;
      letterSpacing: number;
      stroke?: { color: string; width: number };
      shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
    }>(),
    // Shape properties (for shape clips)
    shapeType: text('shape_type'), // 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'arrow'
    shapeStyle: jsonb('shape_style').$type<{
      fill: string;
      stroke: string;
      strokeWidth: number;
      cornerRadius?: number;
      sides?: number;
      innerRadius?: number;
    }>(),
    // Solid color properties
    solidColor: text('solid_color'),
    // Effects applied to this clip
    effects: jsonb('effects').$type<Array<{
      id: string;
      type: string;
      enabled: boolean;
      params: Record<string, number | string | boolean>;
    }>>(),
    // Keyframes for animation
    keyframes: jsonb('keyframes').$type<Record<string, Array<{
      frame: number;
      value: number | string | { x: number; y: number };
      easing: string;
    }>>>(),
    // Blend mode
    blendMode: text('blend_mode').default('normal'),
    locked: boolean('locked').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('editor_clips_project_idx').on(table.projectId),
    trackIdx: index('editor_clips_track_idx').on(table.trackId),
    timelineIdx: index('editor_clips_timeline_idx').on(table.trackId, table.startFrame),
  })
);

// Editor transitions - transitions between clips
export const editorTransitions = pgTable(
  'editor_transitions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => editorTracks.id, { onDelete: 'cascade' }),
    clipAId: text('clip_a_id')
      .notNull()
      .references(() => editorClips.id, { onDelete: 'cascade' }),
    clipBId: text('clip_b_id')
      .notNull()
      .references(() => editorClips.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'blur' | etc.
    duration: integer('duration').notNull().default(30), // Frames
    easing: text('easing').default('ease-in-out'),
    params: jsonb('params').$type<{
      direction?: 'left' | 'right' | 'up' | 'down';
      softness?: number;
      color?: string;
      angle?: number;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('editor_transitions_project_idx').on(table.projectId),
    trackIdx: index('editor_transitions_track_idx').on(table.trackId),
  })
);

// Editor effect presets - reusable effect configurations
export const editorEffectPresets = pgTable(
  'editor_effect_presets',
  {
    id: text('id').primaryKey(),
    ownerDid: text('owner_did').references(() => users.did, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(), // 'color' | 'blur' | 'distort' | 'stylize' | 'transition' | 'text'
    type: text('type').notNull(), // Specific effect type
    isBuiltIn: boolean('is_built_in').default(false),
    isPublic: boolean('is_public').default(false),
    params: jsonb('params').$type<Record<string, number | string | boolean>>().notNull(),
    thumbnail: text('thumbnail'), // Preview image URL
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('editor_effect_presets_owner_idx').on(table.ownerDid),
    categoryIdx: index('editor_effect_presets_category_idx').on(table.category),
    publicIdx: index('editor_effect_presets_public_idx').on(table.isPublic),
  })
);

// Editor assets - media library for projects
export const editorAssets = pgTable(
  'editor_assets',
  {
    id: text('id').primaryKey(),
    ownerDid: text('owner_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => editorProjects.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'video' | 'audio' | 'image' | 'font' | 'lut'
    mimeType: text('mime_type'),
    // Storage
    storageKey: text('storage_key').notNull(),
    cdnUrl: text('cdn_url'),
    thumbnailUrl: text('thumbnail_url'),
    // Media properties
    width: integer('width'),
    height: integer('height'),
    duration: real('duration'), // Seconds
    frameRate: real('frame_rate'),
    fileSize: integer('file_size'),
    // Audio analysis
    waveformData: jsonb('waveform_data').$type<number[]>(),
    bpm: real('bpm'),
    // Metadata
    tags: jsonb('tags').$type<string[]>().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    // Processing status
    processingStatus: text('processing_status').default('pending'), // 'pending' | 'processing' | 'ready' | 'failed'
    proxyUrl: text('proxy_url'), // Low-res proxy for editing
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('editor_assets_owner_idx').on(table.ownerDid),
    projectIdx: index('editor_assets_project_idx').on(table.projectId),
    typeIdx: index('editor_assets_type_idx').on(table.type),
    statusIdx: index('editor_assets_status_idx').on(table.processingStatus),
  })
);

// Editor templates - project templates for quick starts
export const editorTemplates = pgTable(
  'editor_templates',
  {
    id: text('id').primaryKey(),
    ownerDid: text('owner_did').references(() => users.did, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // 'intro' | 'outro' | 'social' | 'presentation' | 'music' | 'promo'
    aspectRatio: text('aspect_ratio').notNull(), // '16:9' | '9:16' | '1:1' | '4:5'
    duration: integer('duration').notNull(), // Frames
    // Template data (serialized project)
    templateData: jsonb('template_data').$type<{
      settings: { fps: number; width: number; height: number };
      tracks: Array<{ name: string; type: string; order: number }>;
      clips: Array<Record<string, unknown>>;
      effects: Array<Record<string, unknown>>;
    }>().notNull(),
    // Preview
    thumbnailUrl: text('thumbnail_url'),
    previewVideoUrl: text('preview_video_url'),
    // Metadata
    isBuiltIn: boolean('is_built_in').default(false),
    isPublic: boolean('is_public').default(false),
    usageCount: integer('usage_count').default(0),
    tags: jsonb('tags').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('editor_templates_owner_idx').on(table.ownerDid),
    categoryIdx: index('editor_templates_category_idx').on(table.category),
    publicIdx: index('editor_templates_public_idx').on(table.isPublic),
    usageIdx: index('editor_templates_usage_idx').on(table.usageCount),
  })
);

// Editor project history - undo/redo stack
export const editorProjectHistory = pgTable(
  'editor_project_history',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    action: text('action').notNull(), // 'create_clip' | 'delete_clip' | 'move_clip' | 'trim_clip' | etc.
    description: text('description'),
    // Stores the delta/patch to undo this action
    undoData: jsonb('undo_data').$type<Record<string, unknown>>().notNull(),
    redoData: jsonb('redo_data').$type<Record<string, unknown>>().notNull(),
    // For grouping related actions
    batchId: text('batch_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('editor_history_project_idx').on(table.projectId),
    userIdx: index('editor_history_user_idx').on(table.userDid),
    batchIdx: index('editor_history_batch_idx').on(table.batchId),
    createdIdx: index('editor_history_created_idx').on(table.createdAt),
  })
);

// Editor comments - collaboration comments on projects
export const editorComments = pgTable(
  'editor_comments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    parentId: text('parent_id'), // For threaded replies (self-reference)
    // Position - either frame-based or canvas-based
    frame: integer('frame'), // Frame number for timeline comments
    canvasX: real('canvas_x'), // X position for canvas pin comments
    canvasY: real('canvas_y'), // Y position for canvas pin comments
    elementId: text('element_id'), // Optional reference to specific element
    // Content
    content: text('content').notNull(),
    // Status
    resolved: boolean('resolved').default(false),
    resolvedAt: timestamp('resolved_at'),
    resolvedByDid: text('resolved_by_did').references(() => users.did, { onDelete: 'set null' }),
    // Metadata
    mentionedDids: jsonb('mentioned_dids').$type<string[]>().default([]),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('editor_comments_project_idx').on(table.projectId),
    userIdx: index('editor_comments_user_idx').on(table.userDid),
    parentIdx: index('editor_comments_parent_idx').on(table.parentId),
    frameIdx: index('editor_comments_frame_idx').on(table.projectId, table.frame),
    resolvedIdx: index('editor_comments_resolved_idx').on(table.resolved),
    createdIdx: index('editor_comments_created_idx').on(table.createdAt),
  })
);

// Editor comment reactions - reactions to comments
export const editorCommentReactions = pgTable(
  'editor_comment_reactions',
  {
    id: text('id').primaryKey(),
    commentId: text('comment_id')
      .notNull()
      .references(() => editorComments.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(), // Unicode emoji
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    commentIdx: index('editor_comment_reactions_comment_idx').on(table.commentId),
    userIdx: index('editor_comment_reactions_user_idx').on(table.userDid),
    uniqueReaction: uniqueIndex('editor_comment_reactions_unique_idx').on(
      table.commentId,
      table.userDid,
      table.emoji
    ),
  })
);

// Render jobs - video export from editor projects
export const renderJobs = pgTable(
  'render_jobs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => editorProjects.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // 'pending' | 'queued' | 'rendering' | 'encoding' | 'uploading' | 'completed' | 'failed' | 'paused'
    progress: integer('progress').default(0), // 0-100
    currentStep: text('current_step'), // Description of current render step
    // Priority system
    priority: text('priority').notNull().default('normal'), // 'low' | 'normal' | 'high' | 'urgent'
    priorityScore: integer('priority_score').default(50), // 0-100 for fine-grained sorting
    // Batch and dependencies
    batchId: text('batch_id'), // Group jobs in batches
    dependsOnJobId: text('depends_on_job_id'), // Job dependency (self-reference)
    // Worker assignment
    workerId: text('worker_id'), // Which worker is processing
    workerStartedAt: timestamp('worker_started_at'),
    // Resource estimation
    estimatedDurationSeconds: integer('estimated_duration_seconds'),
    estimatedMemoryMb: integer('estimated_memory_mb'),
    actualDurationSeconds: integer('actual_duration_seconds'),
    actualMemoryMb: integer('actual_memory_mb'),
    // Render settings
    format: text('format').notNull().default('mp4'), // 'mp4' | 'webm' | 'mov'
    quality: text('quality').notNull().default('high'), // 'draft' | 'medium' | 'high' | 'ultra'
    resolution: jsonb('resolution').$type<{ width: number; height: number }>(),
    fps: integer('fps').default(30),
    // Output
    outputKey: text('output_key'), // S3 key for rendered file
    outputUrl: text('output_url'), // CDN URL
    outputSize: integer('output_size'), // File size in bytes
    duration: integer('duration'), // Duration in seconds
    // Metadata
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details').$type<Record<string, unknown>>(),
    renderStartedAt: timestamp('render_started_at'),
    renderCompletedAt: timestamp('render_completed_at'),
    // Pause/resume support
    pausedAt: timestamp('paused_at'),
    pausedByAdminId: text('paused_by_admin_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('render_jobs_project_idx').on(table.projectId),
    userIdx: index('render_jobs_user_idx').on(table.userDid),
    statusIdx: index('render_jobs_status_idx').on(table.status),
    priorityIdx: index('render_jobs_priority_idx').on(table.priority, table.priorityScore),
    batchIdx: index('render_jobs_batch_idx').on(table.batchId),
    dependsOnIdx: index('render_jobs_depends_on_idx').on(table.dependsOnJobId),
    workerIdx: index('render_jobs_worker_idx').on(table.workerId),
    createdIdx: index('render_jobs_created_idx').on(table.createdAt),
  })
);

// Render batches - group multiple render jobs
export const renderBatches = pgTable(
  'render_batches',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    name: text('name'),
    totalJobs: integer('total_jobs').default(0),
    completedJobs: integer('completed_jobs').default(0),
    failedJobs: integer('failed_jobs').default(0),
    status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    userIdx: index('render_batches_user_idx').on(table.userDid),
    statusIdx: index('render_batches_status_idx').on(table.status),
  })
);

// User render quotas - rate limiting per user
export const userRenderQuotas = pgTable('user_render_quotas', {
  userDid: text('user_did')
    .primaryKey()
    .references(() => users.did, { onDelete: 'cascade' }),
  dailyLimit: integer('daily_limit').default(10),
  dailyUsed: integer('daily_used').default(0),
  dailyResetAt: timestamp('daily_reset_at'),
  weeklyLimit: integer('weekly_limit').default(50),
  weeklyUsed: integer('weekly_used').default(0),
  weeklyResetAt: timestamp('weekly_reset_at'),
  concurrentLimit: integer('concurrent_limit').default(2),
  maxQuality: text('max_quality').default('ultra'), // 'draft' | 'medium' | 'high' | 'ultra'
  priorityBoost: integer('priority_boost').default(0), // Added to priority score
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Render workers - track active render workers
export const renderWorkers = pgTable(
  'render_workers',
  {
    id: text('id').primaryKey(),
    hostname: text('hostname').notNull(),
    status: text('status').notNull().default('active'), // 'active' | 'draining' | 'offline'
    concurrency: integer('concurrency').default(2),
    activeJobs: integer('active_jobs').default(0),
    totalProcessed: integer('total_processed').default(0),
    failedJobs: integer('failed_jobs').default(0),
    avgProcessingTime: real('avg_processing_time'), // seconds
    gpuEnabled: boolean('gpu_enabled').default(false),
    gpuModel: text('gpu_model'),
    lastHeartbeat: timestamp('last_heartbeat'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => ({
    statusIdx: index('render_workers_status_idx').on(table.status),
    heartbeatIdx: index('render_workers_heartbeat_idx').on(table.lastHeartbeat),
  })
);

// Scheduled video publishing
export const scheduledPublishing = pgTable(
  'scheduled_publishing',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    // Source - either render job or direct upload
    renderJobId: text('render_job_id').references(() => renderJobs.id, { onDelete: 'set null' }),
    uploadJobId: text('upload_job_id'), // Reference to upload_jobs if direct upload
    // Video metadata
    caption: text('caption'),
    tags: jsonb('tags').$type<string[]>().default([]),
    thumbnailUrl: text('thumbnail_url'),
    customThumbnailKey: text('custom_thumbnail_key'), // User-uploaded thumbnail
    // Visibility and permissions
    visibility: text('visibility').notNull().default('public'), // 'public' | 'followers' | 'private' | 'unlisted'
    allowComments: boolean('allow_comments').default(true),
    allowDuet: boolean('allow_duet').default(true),
    allowStitch: boolean('allow_stitch').default(true),
    // Sound
    soundUri: text('sound_uri'),
    soundTitle: text('sound_title'),
    // Scheduling
    scheduledFor: timestamp('scheduled_for'), // null = publish immediately
    timezone: text('timezone').default('UTC'),
    // Status
    status: text('status').notNull().default('draft'), // 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
    publishedVideoUri: text('published_video_uri'), // URI of the published video
    errorMessage: text('error_message'),
    // Timestamps
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('scheduled_publishing_user_idx').on(table.userDid),
    statusIdx: index('scheduled_publishing_status_idx').on(table.status),
    scheduledIdx: index('scheduled_publishing_scheduled_idx').on(table.scheduledFor),
    renderJobIdx: index('scheduled_publishing_render_job_idx').on(table.renderJobId),
  })
);

// Editor Collaboration type exports
export type EditorProject = typeof editorProjects.$inferSelect;
export type NewEditorProject = typeof editorProjects.$inferInsert;
export type EditorCollaborator = typeof editorCollaborators.$inferSelect;
export type NewEditorCollaborator = typeof editorCollaborators.$inferInsert;
export type EditorDocumentSnapshot = typeof editorDocumentSnapshots.$inferSelect;
export type NewEditorDocumentSnapshot = typeof editorDocumentSnapshots.$inferInsert;
export type RenderJob = typeof renderJobs.$inferSelect;
export type NewRenderJob = typeof renderJobs.$inferInsert;
export type RenderBatch = typeof renderBatches.$inferSelect;
export type NewRenderBatch = typeof renderBatches.$inferInsert;
export type UserRenderQuota = typeof userRenderQuotas.$inferSelect;
export type NewUserRenderQuota = typeof userRenderQuotas.$inferInsert;
export type RenderWorker = typeof renderWorkers.$inferSelect;
export type NewRenderWorker = typeof renderWorkers.$inferInsert;
export type ScheduledPublishing = typeof scheduledPublishing.$inferSelect;
export type NewScheduledPublishing = typeof scheduledPublishing.$inferInsert;

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
    name: text('name'),
    description: text('description'),
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
    // Certificate integration for did:exprsn
    certificateId: text('certificate_id').references(() => caEntityCertificates.id, { onDelete: 'set null' }),
    certificateFingerprint: text('certificate_fingerprint'), // SHA-256 fingerprint for quick lookup
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    handleIdx: uniqueIndex('plc_identities_handle_idx').on(table.handle),
    pdsIdx: index('plc_identities_pds_idx').on(table.pdsEndpoint),
    statusIdx: index('plc_identities_status_idx').on(table.status),
    certFingerprintIdx: index('plc_identities_cert_fingerprint_idx').on(table.certificateFingerprint),
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
  sanctionId: text('sanction_id').references(() => userSanctions.id), // Link to user_sanctions for user-initiated appeals
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
  sanctionIdIdx: index('moderation_appeals_sanction_id_idx').on(table.sanctionId),
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

// ==========================================
// Render Pipeline Phase 2 - Notifications, Presets, Clusters
// ==========================================

// Notification settings - per user notification preferences
export const notificationSettings = pgTable('notification_settings', {
  userDid: text('user_did')
    .primaryKey()
    .references(() => users.did, { onDelete: 'cascade' }),
  email: text('email'), // Email address for notifications
  emailEnabled: boolean('email_enabled').default(true),
  webhookUrl: text('webhook_url'),
  webhookSecret: text('webhook_secret'),
  notifyOnComplete: boolean('notify_on_complete').default(true),
  notifyOnFailed: boolean('notify_on_failed').default(true),
  // Push notification preferences
  pushEnabled: boolean('push_enabled').default(true),
  pushOnFollow: boolean('push_on_follow').default(true),
  pushOnLike: boolean('push_on_like').default(true),
  pushOnComment: boolean('push_on_comment').default(true),
  pushOnMention: boolean('push_on_mention').default(true),
  pushOnMessage: boolean('push_on_message').default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Push tokens - store device tokens for push notifications
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform').notNull().$type<'ios' | 'android' | 'web'>(),
    deviceId: text('device_id'),
    deviceName: text('device_name'),
    appVersion: text('app_version'),
    isActive: boolean('is_active').default(true).notNull(),
    lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    invalidatedAt: timestamp('invalidated_at'),
  },
  (table) => ({
    userIdx: index('push_tokens_user_idx').on(table.userDid),
    tokenIdx: index('push_tokens_token_idx').on(table.token),
    platformIdx: index('push_tokens_platform_idx').on(table.platform),
  })
);

export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;

// Notification log - track sent notifications
export const notificationLog = pgTable(
  'notification_log',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'email' | 'webhook'
    event: text('event').notNull(), // 'render.complete' | 'render.failed'
    status: text('status').notNull(), // 'sent' | 'failed'
    recipientEmail: text('recipient_email'),
    webhookUrl: text('webhook_url'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    responseCode: integer('response_code'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('notification_log_user_idx').on(table.userDid),
    typeIdx: index('notification_log_type_idx').on(table.type),
    eventIdx: index('notification_log_event_idx').on(table.event),
    createdIdx: index('notification_log_created_idx').on(table.createdAt),
  })
);

// Render presets - system and user-defined render settings
export const renderPresets = pgTable(
  'render_presets',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did').references(() => users.did, { onDelete: 'cascade' }), // null = system preset
    name: text('name').notNull(),
    description: text('description'),
    settings: jsonb('settings')
      .notNull()
      .$type<{
        resolution: string;
        quality: string;
        format: string;
        fps: number;
        codec?: string;
        bitrate?: number;
      }>(),
    isDefault: boolean('is_default').default(false),
    isSystem: boolean('is_system').default(false),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('render_presets_user_idx').on(table.userDid),
    systemIdx: index('render_presets_system_idx').on(table.isSystem),
    defaultIdx: index('render_presets_default_idx').on(table.isDefault),
  })
);

// Render clusters - manage multiple render worker clusters
export const renderClusters = pgTable(
  'render_clusters',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'docker' | 'kubernetes'
    endpoint: text('endpoint'), // API server URL for k8s
    config: jsonb('config').$type<{
      kubeconfig?: string;
      namespace?: string;
      dockerHost?: string;
      labels?: Record<string, string>;
    }>(),
    status: text('status').notNull().default('active'), // 'active' | 'draining' | 'offline' | 'error'
    region: text('region'),
    maxWorkers: integer('max_workers'),
    currentWorkers: integer('current_workers').default(0),
    workerCount: integer('worker_count').default(0), // Total workers assigned to this cluster
    gpuEnabled: boolean('gpu_enabled').default(false),
    gpuCount: integer('gpu_count').default(0),
    priorityRouting: jsonb('priority_routing').$type<{
      urgent?: boolean;
      high?: boolean;
      normal?: boolean;
      low?: boolean;
    }>(),
    lastHealthCheck: timestamp('last_health_check'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('render_clusters_status_idx').on(table.status),
    typeIdx: index('render_clusters_type_idx').on(table.type),
    regionIdx: index('render_clusters_region_idx').on(table.region),
  })
);

// Render Pipeline Phase 2 type exports
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type NewNotificationSettings = typeof notificationSettings.$inferInsert;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type NewNotificationLogEntry = typeof notificationLog.$inferInsert;
export type RenderPreset = typeof renderPresets.$inferSelect;
export type NewRenderPreset = typeof renderPresets.$inferInsert;
export type RenderCluster = typeof renderClusters.$inferSelect;
export type NewRenderCluster = typeof renderClusters.$inferInsert;

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

// ==========================================
// Watch Party - Synchronized Video Watching
// ==========================================

// Watch Parties - synchronized video watching sessions
export const watchParties = pgTable(
  'watch_parties',
  {
    id: text('id').primaryKey(),
    hostDid: text('host_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    inviteCode: text('invite_code').notNull(),
    status: text('status').default('active').notNull(), // 'waiting' | 'active' | 'ended'
    maxParticipants: integer('max_participants').default(10).notNull(),
    participantCount: integer('participant_count').default(1).notNull(),
    currentVideoUri: text('current_video_uri').references(() => videos.uri),
    currentPosition: integer('current_position').default(0).notNull(), // milliseconds
    isPlaying: boolean('is_playing').default(false).notNull(),
    visibility: text('visibility').default('private').notNull(), // 'private' | 'friends' | 'public'
    chatEnabled: boolean('chat_enabled').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
  },
  (table) => ({
    hostIdx: index('watch_parties_host_idx').on(table.hostDid),
    inviteCodeIdx: uniqueIndex('watch_parties_invite_code_idx').on(table.inviteCode),
    statusIdx: index('watch_parties_status_idx').on(table.status),
    createdIdx: index('watch_parties_created_idx').on(table.createdAt),
  })
);

// Watch Party Participants
export const watchPartyParticipants = pgTable(
  'watch_party_participants',
  {
    id: text('id').primaryKey(),
    partyId: text('party_id')
      .notNull()
      .references(() => watchParties.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    role: text('role').default('viewer').notNull(), // 'host' | 'cohost' | 'viewer'
    isPresent: boolean('is_present').default(true).notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    leftAt: timestamp('left_at'),
  },
  (table) => ({
    partyIdx: index('watch_party_participants_party_idx').on(table.partyId),
    userIdx: index('watch_party_participants_user_idx').on(table.userDid),
    uniqueParticipant: uniqueIndex('watch_party_participants_unique_idx').on(
      table.partyId,
      table.userDid
    ),
  })
);

// Watch Party Queue - videos queued for watching
export const watchPartyQueue = pgTable(
  'watch_party_queue',
  {
    id: text('id').primaryKey(),
    partyId: text('party_id')
      .notNull()
      .references(() => watchParties.id, { onDelete: 'cascade' }),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    addedBy: text('added_by')
      .notNull()
      .references(() => users.did),
    position: integer('position').notNull(),
    playedAt: timestamp('played_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    partyIdx: index('watch_party_queue_party_idx').on(table.partyId),
    positionIdx: index('watch_party_queue_position_idx').on(table.partyId, table.position),
  })
);

// Watch Party Chat Messages
export const watchPartyMessages = pgTable(
  'watch_party_messages',
  {
    id: text('id').primaryKey(),
    partyId: text('party_id')
      .notNull()
      .references(() => watchParties.id, { onDelete: 'cascade' }),
    senderDid: text('sender_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    messageType: text('message_type').default('text').notNull(), // 'text' | 'reaction' | 'system'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    partyIdx: index('watch_party_messages_party_idx').on(table.partyId),
    createdIdx: index('watch_party_messages_created_idx').on(table.createdAt),
    partyCreatedIdx: index('watch_party_messages_party_created_idx').on(
      table.partyId,
      table.createdAt
    ),
  })
);

// Watch Party type exports
export type WatchParty = typeof watchParties.$inferSelect;
export type NewWatchParty = typeof watchParties.$inferInsert;
export type WatchPartyParticipant = typeof watchPartyParticipants.$inferSelect;
export type NewWatchPartyParticipant = typeof watchPartyParticipants.$inferInsert;
export type WatchPartyQueueItem = typeof watchPartyQueue.$inferSelect;
export type NewWatchPartyQueueItem = typeof watchPartyQueue.$inferInsert;
export type WatchPartyMessage = typeof watchPartyMessages.$inferSelect;
export type NewWatchPartyMessage = typeof watchPartyMessages.$inferInsert;

// ==========================================
// Sound Trends - Trending Audio Tracking
// ==========================================

// Trending Sounds - calculated periodically like trendingVideos
export const trendingSounds = pgTable(
  'trending_sounds',
  {
    soundId: text('sound_id')
      .primaryKey()
      .references(() => sounds.id, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    velocity: real('velocity').default(0).notNull(), // rate of use increase
    rank: integer('rank').notNull(),
    recentUseCount: integer('recent_use_count').default(0).notNull(), // uses in last 24h
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    scoreIdx: index('trending_sounds_score_idx').on(table.score),
    rankIdx: index('trending_sounds_rank_idx').on(table.rank),
    velocityIdx: index('trending_sounds_velocity_idx').on(table.velocity),
  })
);

// Sound usage tracking - for velocity calculation
export const soundUsageHistory = pgTable(
  'sound_usage_history',
  {
    id: text('id').primaryKey(),
    soundId: text('sound_id')
      .notNull()
      .references(() => sounds.id, { onDelete: 'cascade' }),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    soundIdx: index('sound_usage_history_sound_idx').on(table.soundId),
    createdIdx: index('sound_usage_history_created_idx').on(table.createdAt),
    soundCreatedIdx: index('sound_usage_history_sound_created_idx').on(
      table.soundId,
      table.createdAt
    ),
  })
);

// Sound Trends type exports
export type TrendingSound = typeof trendingSounds.$inferSelect;
export type NewTrendingSound = typeof trendingSounds.$inferInsert;
export type SoundUsageHistory = typeof soundUsageHistory.$inferSelect;
export type NewSoundUsageHistory = typeof soundUsageHistory.$inferInsert;

// ==========================================
// Video Challenges - Hashtag-based Challenges
// ==========================================

// Challenge prize structure type
export interface ChallengePrizes {
  first?: string;
  second?: string;
  third?: string;
  participation?: string;
}

// Video Challenges - admin-created hashtag challenges
export const challenges = pgTable(
  'challenges',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    hashtag: text('hashtag').notNull(), // e.g., "DanceChallenge2024"
    rules: text('rules'), // Challenge rules/guidelines
    coverImageUrl: text('cover_image_url'),
    bannerImageUrl: text('banner_image_url'),
    prizes: jsonb('prizes').$type<ChallengePrizes>(),
    status: text('status').default('upcoming').notNull(), // 'draft' | 'upcoming' | 'active' | 'voting' | 'ended'
    visibility: text('visibility').default('public').notNull(), // 'public' | 'unlisted'
    entryCount: integer('entry_count').default(0).notNull(),
    participantCount: integer('participant_count').default(0).notNull(),
    totalViews: integer('total_views').default(0).notNull(),
    totalEngagement: integer('total_engagement').default(0).notNull(), // likes + comments + shares
    startAt: timestamp('start_at').notNull(),
    endAt: timestamp('end_at').notNull(),
    votingEndAt: timestamp('voting_end_at'), // Optional voting period after challenge ends
    createdBy: text('created_by')
      .notNull()
      .references(() => adminUsers.id),
    featuredSoundId: text('featured_sound_id').references(() => sounds.id), // Optional challenge sound
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    hashtagIdx: uniqueIndex('challenges_hashtag_idx').on(table.hashtag),
    statusIdx: index('challenges_status_idx').on(table.status),
    startAtIdx: index('challenges_start_at_idx').on(table.startAt),
    endAtIdx: index('challenges_end_at_idx').on(table.endAt),
    createdIdx: index('challenges_created_idx').on(table.createdAt),
  })
);

// Challenge Entries - videos submitted to challenges
export const challengeEntries = pgTable(
  'challenge_entries',
  {
    id: text('id').primaryKey(),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    videoUri: text('video_uri')
      .notNull()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    // Cached engagement metrics for leaderboard
    viewCount: integer('view_count').default(0).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    shareCount: integer('share_count').default(0).notNull(),
    engagementScore: real('engagement_score').default(0).notNull(), // Weighted score
    rank: integer('rank'),
    isFeatured: boolean('is_featured').default(false).notNull(), // Admin-featured
    isWinner: boolean('is_winner').default(false).notNull(),
    winnerPosition: integer('winner_position'), // 1, 2, 3 for winners
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    challengeIdx: index('challenge_entries_challenge_idx').on(table.challengeId),
    videoIdx: uniqueIndex('challenge_entries_video_idx').on(table.videoUri), // One entry per video
    userIdx: index('challenge_entries_user_idx').on(table.userDid),
    scoreIdx: index('challenge_entries_score_idx').on(table.challengeId, table.engagementScore),
    rankIdx: index('challenge_entries_rank_idx').on(table.challengeId, table.rank),
    featuredIdx: index('challenge_entries_featured_idx').on(table.challengeId, table.isFeatured),
    winnerIdx: index('challenge_entries_winner_idx').on(table.challengeId, table.isWinner),
  })
);

// Challenge Participation - tracks user participation for profiles
export const challengeParticipation = pgTable(
  'challenge_participation',
  {
    id: text('id').primaryKey(),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    entryCount: integer('entry_count').default(1).notNull(),
    bestRank: integer('best_rank'),
    isWinner: boolean('is_winner').default(false).notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => ({
    challengeIdx: index('challenge_participation_challenge_idx').on(table.challengeId),
    userIdx: index('challenge_participation_user_idx').on(table.userDid),
    uniqueParticipation: uniqueIndex('challenge_participation_unique_idx').on(
      table.challengeId,
      table.userDid
    ),
    winnerIdx: index('challenge_participation_winner_idx').on(table.userDid, table.isWinner),
  })
);

// Video Challenges type exports
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type ChallengeEntry = typeof challengeEntries.$inferSelect;
export type NewChallengeEntry = typeof challengeEntries.$inferInsert;
export type ChallengeParticipation = typeof challengeParticipation.$inferSelect;
export type NewChallengeParticipation = typeof challengeParticipation.$inferInsert;

// ============================================
// FYP Personalization - User Content Feedback
// ============================================

// User content feedback for "not interested" and preference signals
export const userContentFeedback = pgTable(
  'user_content_feedback',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did').notNull(),
    targetType: text('target_type').notNull(), // 'video' | 'author' | 'tag' | 'sound'
    targetId: text('target_id').notNull(),
    feedbackType: text('feedback_type').notNull(), // 'not_interested' | 'see_less' | 'see_more' | 'hide_author' | 'report'
    reason: text('reason'), // 'repetitive' | 'not_relevant' | 'offensive' | 'spam' | 'other'
    weight: real('weight').default(1.0).notNull(), // Feedback strength/impact
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'), // Optional expiration for temporary feedback
  },
  (table) => ({
    userIdx: index('user_content_feedback_user_idx').on(table.userDid),
    targetIdx: index('user_content_feedback_target_idx').on(table.targetType, table.targetId),
    feedbackIdx: index('user_content_feedback_type_idx').on(table.feedbackType),
    userTargetIdx: uniqueIndex('user_content_feedback_unique_idx').on(
      table.userDid,
      table.targetType,
      table.targetId,
      table.feedbackType
    ),
    createdIdx: index('user_content_feedback_created_idx').on(table.createdAt),
  })
);

// ============================================
// FYP Personalization - User Feed Preferences
// ============================================

// Affinity scores for tags, authors, sounds
export interface TagAffinity {
  tag: string;
  score: number; // -1 to 1
  interactions: number;
  lastUpdated: string;
}

export interface AuthorAffinity {
  did: string;
  score: number; // -1 to 1
  interactions: number;
  isFollowing: boolean;
  lastUpdated: string;
}

export interface SoundAffinity {
  soundId: string;
  score: number; // -1 to 1
  interactions: number;
  lastUpdated: string;
}

export interface NegativeSignals {
  hiddenAuthors: string[];
  hiddenTags: string[];
  notInterestedVideos: string[];
  seeLessAuthors: string[];
  seeLessTags: string[];
}

export interface DurationPreference {
  min: number; // seconds
  max: number; // seconds
  preferred: number; // seconds
}

// User feed preferences - cached computed preferences for fast FYP generation
export const userFeedPreferences = pgTable(
  'user_feed_preferences',
  {
    userDid: text('user_did').primaryKey(),
    // Affinity scores (computed from interactions)
    tagAffinities: jsonb('tag_affinities').$type<TagAffinity[]>().default([]),
    authorAffinities: jsonb('author_affinities').$type<AuthorAffinity[]>().default([]),
    soundAffinities: jsonb('sound_affinities').$type<SoundAffinity[]>().default([]),
    // Negative signals (from explicit feedback)
    negativeSignals: jsonb('negative_signals').$type<NegativeSignals>().default({
      hiddenAuthors: [],
      hiddenTags: [],
      notInterestedVideos: [],
      seeLessAuthors: [],
      seeLessTags: [],
    }),
    // Engagement patterns
    avgWatchCompletion: real('avg_watch_completion').default(0.5),
    preferredDuration: jsonb('preferred_duration').$type<DurationPreference>(),
    peakActivityHours: jsonb('peak_activity_hours').$type<number[]>(), // Hours 0-23 when user is most active
    // Thresholds (learned from user behavior)
    likeThreshold: real('like_threshold').default(0.7), // Completion rate above which user typically likes
    commentThreshold: real('comment_threshold').default(0.8), // Completion rate above which user typically comments
    // Stats
    totalInteractions: integer('total_interactions').default(0),
    totalWatchTime: integer('total_watch_time').default(0), // seconds
    // Timestamps
    computedAt: timestamp('computed_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    computedAtIdx: index('user_feed_preferences_computed_idx').on(table.computedAt),
  })
);

// FYP Personalization type exports
export type UserContentFeedback = typeof userContentFeedback.$inferSelect;
export type NewUserContentFeedback = typeof userContentFeedback.$inferInsert;
export type UserFeedPreferences = typeof userFeedPreferences.$inferSelect;
export type NewUserFeedPreferences = typeof userFeedPreferences.$inferInsert;

// ============================================
// Organization Type Configuration System
// ============================================

// Handle validation rules type
export interface HandleValidationRules {
  minLength: number;
  maxLength: number;
  allowedChars: string;
  reservedPrefixes?: string[];
}

// Content policies type
export interface OrgContentPolicies {
  requireApproval: boolean;
  approvalWorkflow?: string;
  autoModerationLevel?: 'none' | 'low' | 'medium' | 'high';
  allowedContentTypes?: string[];
  maxVideoDuration?: number;
}

// Custom field schema type
export interface OrgCustomFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'date';
  required: boolean;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string };
}

// Default role configuration type
export interface OrgDefaultRole {
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  isDefault?: boolean;
  color: string;
  priority: number;
}

// Subscription overrides type
export interface OrgSubscriptionOverrides {
  free?: { memberLimit: number; features: string[] };
  starter?: { memberLimit: number; features: string[] };
  pro?: { memberLimit: number; features: string[] };
  enterprise?: { memberLimit: number; features: string[] };
}

// Organization type configurations - type-specific settings
export const organizationTypeConfigs = pgTable(
  'organization_type_configs',
  {
    id: text('id').primaryKey(), // Same as OrganizationType value
    displayName: text('display_name').notNull(),
    description: text('description'),
    icon: text('icon'), // Icon identifier for UI

    // PLC Settings
    handleSuffix: text('handle_suffix').notNull(), // e.g., 'label.exprsn', 'brand.exprsn'
    verificationRequired: boolean('verification_required').default(false).notNull(),
    verificationWorkflow: text('verification_workflow'), // 'standard' | 'enterprise' | 'creative'
    customDidServices: jsonb('custom_did_services').$type<Record<string, { type: string; endpoint: string }>>(),
    handleValidationRules: jsonb('handle_validation_rules').$type<HandleValidationRules>(),

    // Default Roles
    defaultRoles: jsonb('default_roles').$type<OrgDefaultRole[]>(),

    // Feature Flags
    enabledFeatures: jsonb('enabled_features').$type<string[]>().default([]),
    disabledFeatures: jsonb('disabled_features').$type<string[]>().default([]),

    // Subscription Limits
    subscriptionOverrides: jsonb('subscription_overrides').$type<OrgSubscriptionOverrides>(),

    // Content Policies
    contentPolicies: jsonb('content_policies').$type<OrgContentPolicies>(),

    // Custom Fields Schema
    customFieldsSchema: jsonb('custom_fields_schema').$type<OrgCustomFieldSchema[]>(),

    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    activeIdx: index('org_type_configs_active_idx').on(table.isActive),
  })
);

// Organization custom data - flexible storage for type-specific entities
export const organizationCustomData = pgTable(
  'organization_custom_data',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dataType: text('data_type').notNull(), // 'artist', 'catalog', 'campaign', 'department', etc.
    data: jsonb('data').notNull(),
    parentId: text('parent_id'), // For hierarchical data (departments under enterprise)
    status: text('status').default('active').notNull(), // 'active' | 'archived' | 'deleted'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('org_custom_data_org_idx').on(table.organizationId),
    typeIdx: index('org_custom_data_type_idx').on(table.dataType),
    parentIdx: index('org_custom_data_parent_idx').on(table.parentId),
    statusIdx: index('org_custom_data_status_idx').on(table.status),
    orgTypeIdx: index('org_custom_data_org_type_idx').on(table.organizationId, table.dataType),
  })
);

// Organization type config type exports
export type OrganizationTypeConfig = typeof organizationTypeConfigs.$inferSelect;
export type NewOrganizationTypeConfig = typeof organizationTypeConfigs.$inferInsert;
export type OrganizationCustomData = typeof organizationCustomData.$inferSelect;
export type NewOrganizationCustomData = typeof organizationCustomData.$inferInsert;

// ============================================
// Domain Management Tables
// ============================================

// Domain features configuration type
export interface DomainFeatures {
  videoHosting: boolean;
  liveStreaming: boolean;
  messaging: boolean;
  feedGeneration: boolean;
  customBranding: boolean;
  apiAccess: boolean;
  analytics: boolean;
}

// Domain rate limits type
export interface DomainRateLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  dailyUploadLimit: number;
  storageQuotaGb: number;
}

// Domain branding configuration type
export interface DomainBranding {
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  secondaryColor?: string;
  customCss?: string;
}

export interface DomainFederationConfig {
  enabled: boolean;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  syncPosts: boolean;
  syncLikes: boolean;
  syncFollows: boolean;
  syncProfiles: boolean;
  syncBlobs: boolean;
  discoveryEnabled: boolean;
  searchEnabled: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  preferredRelayEndpoints?: string[];
}

// DID method types - 'plc' is standard, 'exprn' is future custom method
export type DidMethod = 'plc' | 'web' | 'exprn';

// Domain PLC (Identity) configuration type
export interface DomainPlcConfig {
  enabled: boolean;
  mode: 'standalone' | 'external';
  // DID method to use for new identities
  didMethod: DidMethod;
  // Self-hosted PLC server configuration
  selfHostedPlc?: {
    enabled: boolean;
    url: string;
    rotationKey?: string; // PLC server's rotation key for signing operations
    adminKey?: string; // Admin key for management operations
  };
  // External PLC directory (if mode is 'external')
  externalPlcUrl?: string;
  allowCustomHandles: boolean;
  requireInviteCode: boolean;
  defaultPdsEndpoint?: string;
  // Handle suffix for this domain (e.g., 'exprsn' for @user.exprsn)
  handleSuffix?: string;
  handleValidationRules?: {
    minLength: number;
    maxLength: number;
    allowedCharacters: string;
    reservedHandles: string[];
  };
  orgHandleSuffixes?: Record<string, string>; // org type -> suffix mapping
}

// Domains - hosted and federated domain management
export const domains = pgTable(
  'domains',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    domain: text('domain').notNull().unique(),
    type: text('type').notNull(), // 'hosted' | 'federated'
    status: text('status').default('pending').notNull(), // 'pending' | 'verifying' | 'active' | 'suspended' | 'inactive'

    // CA Integration
    intermediateCertId: text('intermediate_cert_id')
      .references(() => caIntermediateCertificates.id),

    // Handle namespace
    handleSuffix: text('handle_suffix'), // e.g., ".example.com" for @user.example.com
    allowedHandlePatterns: jsonb('allowed_handle_patterns').$type<string[]>(),

    // Federation settings (for federated domains)
    pdsEndpoint: text('pds_endpoint'),
    federationDid: text('federation_did'),
    serviceRegistryId: text('service_registry_id')
      .references(() => serviceRegistry.id),

    // Features/Services enabled
    features: jsonb('features').$type<DomainFeatures>().default({
      videoHosting: true,
      liveStreaming: true,
      messaging: true,
      feedGeneration: true,
      customBranding: false,
      apiAccess: false,
      analytics: true,
    }),

    // Rate limits
    rateLimits: jsonb('rate_limits').$type<DomainRateLimits>().default({
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      dailyUploadLimit: 100,
      storageQuotaGb: 10,
    }),

    // Branding
    branding: jsonb('branding').$type<DomainBranding>(),

    // DNS Verification
    dnsVerificationToken: text('dns_verification_token'),
    dnsVerifiedAt: timestamp('dns_verified_at'),

    // Ownership
    ownerOrgId: text('owner_org_id')
      .references(() => organizations.id, { onDelete: 'set null' }),
    ownerUserDid: text('owner_user_did')
      .references(() => users.did, { onDelete: 'set null' }),

    // PLC (Identity) Configuration
    plcConfig: jsonb('plc_config').$type<DomainPlcConfig>().default({
      enabled: true,
      mode: 'standalone',
      didMethod: 'plc',
      allowCustomHandles: false,
      requireInviteCode: false,
    }),
    federationConfig: jsonb('federation_config').$type<DomainFederationConfig>().default({
      enabled: false,
      inboundEnabled: true,
      outboundEnabled: true,
      syncPosts: true,
      syncLikes: true,
      syncFollows: true,
      syncProfiles: true,
      syncBlobs: true,
      discoveryEnabled: true,
      searchEnabled: true,
      allowedDomains: [],
      blockedDomains: [],
    }),

    // Stats
    userCount: integer('user_count').default(0).notNull(),
    groupCount: integer('group_count').default(0).notNull(),
    certificateCount: integer('certificate_count').default(0).notNull(),
    identityCount: integer('identity_count').default(0).notNull(),

    verifiedAt: timestamp('verified_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: uniqueIndex('domains_domain_idx').on(table.domain),
    statusIdx: index('domains_status_idx').on(table.status),
    typeIdx: index('domains_type_idx').on(table.type),
    ownerOrgIdx: index('domains_owner_org_idx').on(table.ownerOrgId),
    ownerUserIdx: index('domains_owner_user_idx').on(table.ownerUserDid),
    handleSuffixIdx: index('domains_handle_suffix_idx').on(table.handleSuffix),
  })
);

// Domain Users - users assigned to specific domains
export const domainUsers = pgTable(
  'domain_users',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'admin' | 'moderator' | 'member'
    permissions: jsonb('permissions').$type<string[]>().default([]),
    handle: text('handle'), // Domain-specific handle override
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_users_domain_idx').on(table.domainId),
    userIdx: index('domain_users_user_idx').on(table.userDid),
    roleIdx: index('domain_users_role_idx').on(table.domainId, table.role),
    uniqueAssignment: uniqueIndex('domain_users_unique_idx').on(table.domainId, table.userDid),
  })
);

// Domain Groups - groups within domains
export const domainGroups = pgTable(
  'domain_groups',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    permissions: jsonb('permissions').$type<string[]>().default([]),
    memberCount: integer('member_count').default(0).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_groups_domain_idx').on(table.domainId),
    nameIdx: index('domain_groups_name_idx').on(table.domainId, table.name),
    defaultIdx: index('domain_groups_default_idx').on(table.domainId, table.isDefault),
  })
);

export const domainRoles = pgTable(
  'domain_roles',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').default(false).notNull(),
    priority: integer('priority').default(0).notNull(),
    permissions: jsonb('permissions').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_roles_domain_idx').on(table.domainId),
    uniqueRoleIdx: uniqueIndex('domain_roles_unique_idx').on(table.domainId, table.name),
    priorityIdx: index('domain_roles_priority_idx').on(table.domainId, table.priority),
  })
);

// Domain Group Members - users in domain groups
export const domainGroupMembers = pgTable(
  'domain_group_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => domainGroups.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    addedBy: text('added_by')
      .references(() => users.did, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    groupIdx: index('domain_group_members_group_idx').on(table.groupId),
    userIdx: index('domain_group_members_user_idx').on(table.userDid),
    uniqueMembership: uniqueIndex('domain_group_members_unique_idx').on(table.groupId, table.userDid),
  })
);

export const domainUserRoles = pgTable(
  'domain_user_roles',
  {
    id: text('id').primaryKey(),
    domainUserId: text('domain_user_id')
      .notNull()
      .references(() => domainUsers.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => domainRoles.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => users.did, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    domainUserIdx: index('domain_user_roles_domain_user_idx').on(table.domainUserId),
    roleIdx: index('domain_user_roles_role_idx').on(table.roleId),
    uniqueAssignmentIdx: uniqueIndex('domain_user_roles_unique_idx').on(table.domainUserId, table.roleId),
  })
);

export const domainGroupRoles = pgTable(
  'domain_group_roles',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => domainGroups.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => domainRoles.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => users.did, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    groupIdx: index('domain_group_roles_group_idx').on(table.groupId),
    roleIdx: index('domain_group_roles_role_idx').on(table.roleId),
    uniqueAssignmentIdx: uniqueIndex('domain_group_roles_unique_idx').on(table.groupId, table.roleId),
  })
);

// Domain Activity Log - tracks domain-related events
export const domainActivityLog = pgTable(
  'domain_activity_log',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    actorDid: text('actor_did')
      .references(() => users.did, { onDelete: 'set null' }),
    action: text('action').notNull(), // 'user_added', 'user_removed', 'settings_changed', 'certificate_issued', etc.
    targetType: text('target_type'), // 'user', 'group', 'certificate', 'settings'
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_activity_log_domain_idx').on(table.domainId),
    actorIdx: index('domain_activity_log_actor_idx').on(table.actorDid),
    actionIdx: index('domain_activity_log_action_idx').on(table.action),
    createdIdx: index('domain_activity_log_created_idx').on(table.createdAt),
    domainCreatedIdx: index('domain_activity_log_domain_created_idx').on(table.domainId, table.createdAt),
  })
);

// Domain Clusters - assign render clusters to domains
export const domainClusters = pgTable(
  'domain_clusters',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    clusterId: text('cluster_id')
      .notNull()
      .references(() => renderClusters.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').default(false).notNull(),
    priority: integer('priority').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_clusters_domain_idx').on(table.domainId),
    clusterIdx: index('domain_clusters_cluster_idx').on(table.clusterId),
    uniqueAssignment: uniqueIndex('domain_clusters_unique_idx').on(table.domainId, table.clusterId),
  })
);

// Domain Services - platform service configuration per domain
export const domainServices = pgTable(
  'domain_services',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    serviceType: text('service_type').notNull(), // 'pds' | 'relay' | 'appview' | 'labeler'
    enabled: boolean('enabled').default(false).notNull(),
    endpoint: text('endpoint'),
    config: jsonb('config').$type<{
      // PDS Config
      repoLimit?: number;
      blobLimit?: number;
      // Relay Config
      firehoseEnabled?: boolean;
      filterPatterns?: string[];
      // AppView Config
      indexingEnabled?: boolean;
      searchEnabled?: boolean;
      // Labeler Config
      autoLabel?: boolean;
      labelCategories?: string[];
      // Common
      customSettings?: Record<string, unknown>;
    }>(),
    status: text('status').default('inactive').notNull(), // 'inactive' | 'starting' | 'running' | 'error' | 'stopped'
    lastHealthCheck: timestamp('last_health_check'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_services_domain_idx').on(table.domainId),
    typeIdx: index('domain_services_type_idx').on(table.serviceType),
    statusIdx: index('domain_services_status_idx').on(table.status),
    uniqueService: uniqueIndex('domain_services_unique_idx').on(table.domainId, table.serviceType),
  })
);

// Domain Banned Words
export const domainBannedWords = pgTable(
  'domain_banned_words',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    word: text('word').notNull(),
    severity: text('severity').default('medium').notNull(), // 'low' | 'medium' | 'high'
    action: text('action').default('flag').notNull(), // 'flag' | 'hide' | 'remove'
    enabled: boolean('enabled').default(true).notNull(),
    createdBy: text('created_by').references(() => users.did, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_banned_words_domain_idx').on(table.domainId),
    severityIdx: index('domain_banned_words_severity_idx').on(table.severity),
    uniqueWord: uniqueIndex('domain_banned_words_unique_idx').on(table.domainId, table.word),
  })
);

// Domain Banned Tags
export const domainBannedTags = pgTable(
  'domain_banned_tags',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    severity: text('severity').default('medium').notNull(), // 'low' | 'medium' | 'high'
    action: text('action').default('flag').notNull(), // 'flag' | 'hide' | 'remove'
    enabled: boolean('enabled').default(true).notNull(),
    createdBy: text('created_by').references(() => users.did, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_banned_tags_domain_idx').on(table.domainId),
    severityIdx: index('domain_banned_tags_severity_idx').on(table.severity),
    uniqueTag: uniqueIndex('domain_banned_tags_unique_idx').on(table.domainId, table.tag),
  })
);

// Domain Moderation Queue
export const domainModerationQueue = pgTable(
  'domain_moderation_queue',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(), // 'video' | 'comment' | 'loop' | 'user'
    contentUri: text('content_uri').notNull(),
    authorDid: text('author_did').references(() => users.did, { onDelete: 'set null' }),
    reason: text('reason'),
    autoFlagged: boolean('auto_flagged').default(false).notNull(),
    flagSource: text('flag_source'), // 'user_report' | 'ai_detection' | 'keyword_match'
    priority: text('priority').default('medium').notNull(), // 'low' | 'medium' | 'high' | 'critical'
    status: text('status').default('pending').notNull(), // 'pending' | 'in_review' | 'escalated' | 'resolved'
    assignedTo: text('assigned_to').references(() => users.did, { onDelete: 'set null' }),
    resolvedBy: text('resolved_by').references(() => users.did, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at'),
    resolution: text('resolution'), // 'approved' | 'removed' | 'warning' | 'ban'
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_mod_queue_domain_idx').on(table.domainId),
    statusIdx: index('domain_mod_queue_status_idx').on(table.status),
    priorityIdx: index('domain_mod_queue_priority_idx').on(table.priority),
    authorIdx: index('domain_mod_queue_author_idx').on(table.authorDid),
    assignedIdx: index('domain_mod_queue_assigned_idx').on(table.assignedTo),
    createdIdx: index('domain_mod_queue_created_idx').on(table.createdAt),
  })
);

// Domain Handle Reservations
export const domainHandleReservations = pgTable(
  'domain_handle_reservations',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    handle: text('handle').notNull(),
    handleType: text('handle_type').default('user').notNull(), // 'user' | 'org'
    reason: text('reason'),
    reservedBy: text('reserved_by').references(() => users.did, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at'),
    claimedBy: text('claimed_by').references(() => users.did, { onDelete: 'set null' }),
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_handle_res_domain_idx').on(table.domainId),
    handleIdx: index('domain_handle_res_handle_idx').on(table.handle),
    expiresIdx: index('domain_handle_res_expires_idx').on(table.expiresAt),
    uniqueHandle: uniqueIndex('domain_handle_res_unique_idx').on(table.domainId, table.handle),
  })
);

// Domain Identities (PLC)
export const domainIdentities = pgTable(
  'domain_identities',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    did: text('did').notNull().unique(),
    handle: text('handle').notNull(),
    pdsEndpoint: text('pds_endpoint'),
    signingKey: text('signing_key'),
    rotationKeys: jsonb('rotation_keys').$type<string[]>(),
    status: text('status').default('active').notNull(), // 'active' | 'deactivated' | 'tombstoned'
    userDid: text('user_did').references(() => users.did, { onDelete: 'set null' }),
    createdBy: text('created_by').references(() => users.did, { onDelete: 'set null' }),
    tombstonedAt: timestamp('tombstoned_at'),
    tombstoneReason: text('tombstone_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_identities_domain_idx').on(table.domainId),
    handleIdx: index('domain_identities_handle_idx').on(table.handle),
    statusIdx: index('domain_identities_status_idx').on(table.status),
    userIdx: index('domain_identities_user_idx').on(table.userDid),
    uniqueHandle: uniqueIndex('domain_identities_domain_handle_idx').on(table.domainId, table.handle),
  })
);

// Domain Management type exports
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type DomainUser = typeof domainUsers.$inferSelect;
export type NewDomainUser = typeof domainUsers.$inferInsert;
export type DomainGroup = typeof domainGroups.$inferSelect;
export type NewDomainGroup = typeof domainGroups.$inferInsert;
export type DomainRole = typeof domainRoles.$inferSelect;
export type NewDomainRole = typeof domainRoles.$inferInsert;
export type DomainGroupMember = typeof domainGroupMembers.$inferSelect;
export type NewDomainGroupMember = typeof domainGroupMembers.$inferInsert;
export type DomainUserRole = typeof domainUserRoles.$inferSelect;
export type NewDomainUserRole = typeof domainUserRoles.$inferInsert;
export type DomainGroupRole = typeof domainGroupRoles.$inferSelect;
export type NewDomainGroupRole = typeof domainGroupRoles.$inferInsert;
export type DomainActivityLogEntry = typeof domainActivityLog.$inferSelect;
export type NewDomainActivityLogEntry = typeof domainActivityLog.$inferInsert;
export type DomainCluster = typeof domainClusters.$inferSelect;
export type NewDomainCluster = typeof domainClusters.$inferInsert;
export type DomainService = typeof domainServices.$inferSelect;
export type NewDomainService = typeof domainServices.$inferInsert;
export type DomainBannedWord = typeof domainBannedWords.$inferSelect;
export type NewDomainBannedWord = typeof domainBannedWords.$inferInsert;
export type DomainBannedTag = typeof domainBannedTags.$inferSelect;
export type NewDomainBannedTag = typeof domainBannedTags.$inferInsert;
export type DomainModerationQueueItem = typeof domainModerationQueue.$inferSelect;
export type NewDomainModerationQueueItem = typeof domainModerationQueue.$inferInsert;
export type DomainHandleReservation = typeof domainHandleReservations.$inferSelect;
export type NewDomainHandleReservation = typeof domainHandleReservations.$inferInsert;
export type DomainIdentity = typeof domainIdentities.$inferSelect;
export type NewDomainIdentity = typeof domainIdentities.$inferInsert;

// ============================================
// SSO Infrastructure Tables
// OAuth2/OIDC Provider, SAML Provider, Social Login, Domain SSO
// ============================================

// OAuth2 Client Applications (for Exprsn as OIDC Provider)
export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecretHash: text('client_secret_hash'), // NULL for public clients
    clientName: text('client_name').notNull(),
    clientUri: text('client_uri'),
    logoUri: text('logo_uri'),

    // Client type
    clientType: text('client_type').notNull().default('confidential'), // 'confidential' | 'public'
    applicationType: text('application_type').default('web'), // 'web' | 'native' | 'spa'

    // OAuth settings
    redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
    postLogoutRedirectUris: jsonb('post_logout_redirect_uris').$type<string[]>().default([]),
    grantTypes: jsonb('grant_types').$type<string[]>().notNull().default(['authorization_code']),
    responseTypes: jsonb('response_types').$type<string[]>().notNull().default(['code']),

    // Token settings
    tokenEndpointAuthMethod: text('token_endpoint_auth_method').default('client_secret_basic'),
    accessTokenTtlSeconds: integer('access_token_ttl_seconds').default(3600),
    refreshTokenTtlSeconds: integer('refresh_token_ttl_seconds').default(2592000),
    idTokenTtlSeconds: integer('id_token_ttl_seconds').default(3600),

    // Scopes and permissions
    allowedScopes: jsonb('allowed_scopes').$type<string[]>().notNull().default(['openid', 'profile', 'email']),
    requireConsent: boolean('require_consent').default(true),
    requirePkce: boolean('require_pkce').default(true),

    // Client JWKS (for private_key_jwt auth)
    jwksUri: text('jwks_uri'),
    jwks: jsonb('jwks'),

    // Domain/Organization scoping
    domainId: text('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),

    // Ownership
    ownerDid: text('owner_did').references(() => users.did, { onDelete: 'set null' }),
    contacts: jsonb('contacts').$type<string[]>(),
    tosUri: text('tos_uri'),
    policyUri: text('policy_uri'),

    // Status
    status: text('status').default('active'), // 'active' | 'suspended' | 'pending_approval'
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    clientIdIdx: index('oauth_clients_client_id_idx').on(table.clientId),
    domainIdx: index('oauth_clients_domain_idx').on(table.domainId),
    ownerIdx: index('oauth_clients_owner_idx').on(table.ownerDid),
    statusIdx: index('oauth_clients_status_idx').on(table.status),
  })
);

// OAuth Authorization Codes
export const oauthAuthorizationCodes = pgTable(
  'oauth_authorization_codes',
  {
    code: text('code').primaryKey(),
    clientId: text('client_id').notNull(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),

    // Code details
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope').notNull(),
    codeChallenge: text('code_challenge'),
    codeChallengeMethod: text('code_challenge_method'), // 'S256' | 'plain'
    nonce: text('nonce'),
    state: text('state'),

    // Expiration
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    clientIdx: index('oauth_auth_codes_client_idx').on(table.clientId),
    userIdx: index('oauth_auth_codes_user_idx').on(table.userDid),
    expiresIdx: index('oauth_auth_codes_expires_idx').on(table.expiresAt),
  })
);

// OAuth Access/Refresh Tokens
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),

    // Token hashes
    accessTokenHash: text('access_token_hash').notNull().unique(),
    refreshTokenHash: text('refresh_token_hash').unique(),
    scope: text('scope').notNull(),

    // Session tracking
    sessionId: text('session_id'),

    // Expiration
    accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),

    // Revocation
    revokedAt: timestamp('revoked_at'),
    revokedBy: text('revoked_by'),
    revocationReason: text('revocation_reason'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    clientIdx: index('oauth_tokens_client_idx').on(table.clientId),
    userIdx: index('oauth_tokens_user_idx').on(table.userDid),
    accessExpiresIdx: index('oauth_tokens_access_expires_idx').on(table.accessTokenExpiresAt),
    refreshExpiresIdx: index('oauth_tokens_refresh_expires_idx').on(table.refreshTokenExpiresAt),
  })
);

// User OAuth Consents
export const oauthConsents = pgTable(
  'oauth_consents',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),

    // Granted scopes
    scopes: jsonb('scopes').$type<string[]>().notNull(),

    // Consent timestamps
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => ({
    userIdx: index('oauth_consents_user_idx').on(table.userDid),
    clientIdx: index('oauth_consents_client_idx').on(table.clientId),
    uniqueConsent: uniqueIndex('oauth_consents_unique_idx').on(table.userDid, table.clientId),
  })
);

// OIDC Signing Keys
export const oidcSigningKeys = pgTable(
  'oidc_signing_keys',
  {
    id: text('id').primaryKey(),
    kid: text('kid').notNull().unique(), // Key ID for JWKS
    algorithm: text('algorithm').default('RS256'),

    // Keys
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key').notNull(), // Encrypted at rest

    // Key rotation lifecycle
    status: text('status').default('active'), // 'active' | 'rotating' | 'retired'
    promotedAt: timestamp('promoted_at'),
    retiresAt: timestamp('retires_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('oidc_signing_keys_status_idx').on(table.status),
    kidIdx: index('oidc_signing_keys_kid_idx').on(table.kid),
  })
);

// SAML Service Providers (for Exprsn as SAML IdP)
export const samlServiceProviders = pgTable(
  'saml_service_providers',
  {
    id: text('id').primaryKey(),
    entityId: text('entity_id').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),

    // SP Endpoints
    assertionConsumerServiceUrl: text('assertion_consumer_service_url').notNull(),
    assertionConsumerServiceBinding: text('assertion_consumer_service_binding').default('HTTP-POST'),
    singleLogoutServiceUrl: text('single_logout_service_url'),
    singleLogoutServiceBinding: text('single_logout_service_binding').default('HTTP-POST'),

    // NameID configuration
    nameIdFormat: text('name_id_format').default('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),

    // SP Certificate
    spCertificate: text('sp_certificate'),

    // Attribute mapping
    attributeMapping: jsonb('attribute_mapping').$type<Record<string, string>>(),
    extraAttributes: jsonb('extra_attributes').$type<Array<{ name: string; value: string }>>().default([]),

    // Domain/Organization scoping
    domainId: text('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),

    // Signing settings
    signAssertions: boolean('sign_assertions').default(true),
    signResponse: boolean('sign_response').default(true),
    encryptAssertions: boolean('encrypt_assertions').default(false),
    signingCertId: text('signing_cert_id').references(() => caEntityCertificates.id),
    encryptionCertId: text('encryption_cert_id').references(() => caEntityCertificates.id),

    // Status
    status: text('status').default('active'),
    ownerDid: text('owner_did').references(() => users.did, { onDelete: 'set null' }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    entityIdIdx: index('saml_sps_entity_id_idx').on(table.entityId),
    domainIdx: index('saml_sps_domain_idx').on(table.domainId),
    statusIdx: index('saml_sps_status_idx').on(table.status),
  })
);

// SAML Sessions (for SLO support)
export const samlSessions = pgTable(
  'saml_sessions',
  {
    id: text('id').primaryKey(),
    sessionIndex: text('session_index').notNull().unique(),
    spId: text('sp_id')
      .notNull()
      .references(() => samlServiceProviders.id, { onDelete: 'cascade' }),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),

    // NameID used in assertion
    nameId: text('name_id').notNull(),
    nameIdFormat: text('name_id_format').notNull(),

    // Session lifetime
    expiresAt: timestamp('expires_at').notNull(),
    loggedOutAt: timestamp('logged_out_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    spIdx: index('saml_sessions_sp_idx').on(table.spId),
    userIdx: index('saml_sessions_user_idx').on(table.userDid),
    sessionIndexIdx: index('saml_sessions_session_index_idx').on(table.sessionIndex),
    expiresIdx: index('saml_sessions_expires_idx').on(table.expiresAt),
  })
);

// External Identity Providers (for Social Login / Enterprise SSO)
export const externalIdentityProviders = pgTable(
  'external_identity_providers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'oidc' | 'oauth2' | 'saml'
    providerKey: text('provider_key').notNull().unique(), // 'google' | 'microsoft' | 'github' | etc.

    // Display configuration
    displayName: text('display_name').notNull(),
    iconUrl: text('icon_url'),
    buttonColor: text('button_color'),

    // OAuth2/OIDC Configuration
    clientId: text('client_id'),
    clientSecret: text('client_secret'), // Encrypted
    authorizationEndpoint: text('authorization_endpoint'),
    tokenEndpoint: text('token_endpoint'),
    userinfoEndpoint: text('userinfo_endpoint'),
    jwksUri: text('jwks_uri'),
    issuer: text('issuer'),

    // SAML Configuration
    ssoUrl: text('sso_url'),
    sloUrl: text('slo_url'),
    idpCertificate: text('idp_certificate'),
    idpEntityId: text('idp_entity_id'),

    // Request configuration
    scopes: jsonb('scopes').$type<string[]>().default(['openid', 'profile', 'email']),

    // Claim/Attribute mapping
    claimMapping: jsonb('claim_mapping').$type<Record<string, string>>().default({
      sub: 'external_id',
      email: 'email',
      name: 'display_name',
      picture: 'avatar',
    }),

    // Domain scoping (NULL = global)
    domainId: text('domain_id').references(() => domains.id, { onDelete: 'cascade' }),

    // User provisioning
    autoProvisionUsers: boolean('auto_provision_users').default(true),
    defaultRole: text('default_role').default('member'),
    requiredEmailDomain: text('required_email_domain'),
    jitConfig: jsonb('jit_config'),

    // Status
    status: text('status').default('active'),
    priority: integer('priority').default(0),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    providerKeyIdx: index('ext_idp_provider_key_idx').on(table.providerKey),
    domainIdx: index('ext_idp_domain_idx').on(table.domainId),
    typeIdx: index('ext_idp_type_idx').on(table.type),
    statusIdx: index('ext_idp_status_idx').on(table.status),
  })
);

// Linked External Identities
export const externalIdentities = pgTable(
  'external_identities',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => externalIdentityProviders.id, { onDelete: 'cascade' }),

    // External account info
    externalId: text('external_id').notNull(),
    email: text('email'),
    displayName: text('display_name'),
    avatar: text('avatar'),
    profileUrl: text('profile_url'),

    // OAuth tokens (encrypted)
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),

    // Raw profile data
    rawProfile: jsonb('raw_profile'),

    // Linking timestamps
    linkedAt: timestamp('linked_at').defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at'),
    unlinkedAt: timestamp('unlinked_at'),
  },
  (table) => ({
    userIdx: index('ext_identities_user_idx').on(table.userDid),
    providerIdx: index('ext_identities_provider_idx').on(table.providerId),
    externalIdIdx: index('ext_identities_external_id_idx').on(table.externalId),
    uniqueIdentity: uniqueIndex('ext_identities_unique_idx').on(table.providerId, table.externalId),
  })
);

// OAuth State Storage (for CSRF protection)
export const oauthStates = pgTable(
  'oauth_states',
  {
    state: text('state').primaryKey(),
    providerId: text('provider_id')
      .notNull()
      .references(() => externalIdentityProviders.id, { onDelete: 'cascade' }),

    // PKCE
    codeVerifier: text('code_verifier'),

    // OIDC nonce
    nonce: text('nonce'),

    // Redirect after login
    redirectUri: text('redirect_uri'),

    // Optional: for account linking flow
    userDid: text('user_did').references(() => users.did, { onDelete: 'cascade' }),

    // Context
    domainId: text('domain_id').references(() => domains.id, { onDelete: 'cascade' }),

    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    providerIdx: index('oauth_states_provider_idx').on(table.providerId),
    expiresIdx: index('oauth_states_expires_idx').on(table.expiresAt),
  })
);

// SAML Assertions Received (audit)
export const samlAssertionsReceived = pgTable(
  'saml_assertions_received',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
      .notNull()
      .references(() => externalIdentityProviders.id, { onDelete: 'cascade' }),
    assertionId: text('assertion_id').notNull(),

    // Linked user
    userDid: text('user_did').references(() => users.did, { onDelete: 'set null' }),

    // Assertion data
    subjectNameId: text('subject_name_id').notNull(),
    attributes: jsonb('attributes'),
    conditions: jsonb('conditions'),

    // Validation result
    isValid: boolean('is_valid').notNull(),
    validationErrors: jsonb('validation_errors').$type<string[]>(),

    receivedAt: timestamp('received_at').defaultNow().notNull(),
  },
  (table) => ({
    providerIdx: index('saml_assertions_provider_idx').on(table.providerId),
    userIdx: index('saml_assertions_user_idx').on(table.userDid),
    receivedAtIdx: index('saml_assertions_received_at_idx').on(table.receivedAt),
  })
);

// Domain SSO Configuration
export const domainSsoConfig = pgTable(
  'domain_sso_config',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .unique()
      .references(() => domains.id, { onDelete: 'cascade' }),

    // SSO Mode
    ssoMode: text('sso_mode').default('optional'), // 'disabled' | 'optional' | 'required'

    // Primary IdP for required mode
    primaryIdpId: text('primary_idp_id').references(() => externalIdentityProviders.id, { onDelete: 'set null' }),

    // Allowed IdPs
    allowedIdpIds: jsonb('allowed_idp_ids').$type<string[]>().default([]),

    // User provisioning
    jitProvisioning: boolean('jit_provisioning').default(true),
    defaultOrganizationId: text('default_organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    defaultRole: text('default_role').default('member'),

    // Email domain enforcement
    emailDomainVerification: boolean('email_domain_verification').default(true),
    allowedEmailDomains: jsonb('allowed_email_domains').$type<string[]>().default([]),

    // Session settings
    forceReauthAfterHours: integer('force_reauth_after_hours').default(24),

    // Audit
    updatedBy: text('updated_by').references(() => users.did, { onDelete: 'set null' }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index('domain_sso_config_domain_idx').on(table.domainId),
    primaryIdpIdx: index('domain_sso_config_primary_idp_idx').on(table.primaryIdpId),
  })
);

// SSO Audit Log
export const ssoAuditLog = pgTable(
  'sso_audit_log',
  {
    id: text('id').primaryKey(),

    // Event type
    eventType: text('event_type').notNull(), // 'login' | 'logout' | 'link' | 'unlink' | 'consent_grant' | 'consent_revoke' | 'token_issue' | 'token_revoke'

    // Actor
    userDid: text('user_did').references(() => users.did, { onDelete: 'set null' }),
    clientId: text('client_id'),
    providerId: text('provider_id').references(() => externalIdentityProviders.id, { onDelete: 'set null' }),

    // Context
    domainId: text('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    // Event details
    details: jsonb('details'),

    // Result
    success: boolean('success').notNull(),
    errorMessage: text('error_message'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('sso_audit_user_idx').on(table.userDid),
    eventTypeIdx: index('sso_audit_event_type_idx').on(table.eventType),
    createdAtIdx: index('sso_audit_created_at_idx').on(table.createdAt),
    providerIdx: index('sso_audit_provider_idx').on(table.providerId),
    domainIdx: index('sso_audit_domain_idx').on(table.domainId),
  })
);

// SSO Infrastructure type exports
export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;
export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type NewOAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
export type OAuthConsent = typeof oauthConsents.$inferSelect;
export type NewOAuthConsent = typeof oauthConsents.$inferInsert;
export type OIDCSigningKey = typeof oidcSigningKeys.$inferSelect;
export type NewOIDCSigningKey = typeof oidcSigningKeys.$inferInsert;
export type SAMLServiceProvider = typeof samlServiceProviders.$inferSelect;
export type NewSAMLServiceProvider = typeof samlServiceProviders.$inferInsert;
export type SAMLSession = typeof samlSessions.$inferSelect;
export type NewSAMLSession = typeof samlSessions.$inferInsert;
export type ExternalIdentityProvider = typeof externalIdentityProviders.$inferSelect;
export type NewExternalIdentityProvider = typeof externalIdentityProviders.$inferInsert;
export type ExternalIdentity = typeof externalIdentities.$inferSelect;
export type NewExternalIdentity = typeof externalIdentities.$inferInsert;
export type OAuthState = typeof oauthStates.$inferSelect;
export type NewOAuthState = typeof oauthStates.$inferInsert;
export type SAMLAssertionReceived = typeof samlAssertionsReceived.$inferSelect;
export type NewSAMLAssertionReceived = typeof samlAssertionsReceived.$inferInsert;
export type DomainSSOConfig = typeof domainSsoConfig.$inferSelect;
export type NewDomainSSOConfig = typeof domainSsoConfig.$inferInsert;
export type SSOAuditLogEntry = typeof ssoAuditLog.$inferSelect;
export type NewSSOAuditLogEntry = typeof ssoAuditLog.$inferInsert;

// ==========================================
// Video Moderation & Deletion System
// ==========================================

// Video Deletion Log - Audit trail for all video deletions
export const videoDeletionLog = pgTable(
  'video_deletion_log',
  {
    id: text('id').primaryKey(),
    videoUri: text('video_uri').notNull(),
    videoCid: text('video_cid'),
    authorDid: text('author_did').notNull(),
    deletedBy: text('deleted_by').notNull(),
    deletionType: text('deletion_type').notNull(), // 'user_soft' | 'domain_mod' | 'global_admin' | 'system_hard'
    reason: text('reason'),
    // Preserved video metadata for audit
    caption: text('caption'),
    tags: jsonb('tags').$type<string[]>().default([]),
    cdnUrl: text('cdn_url'),
    thumbnailUrl: text('thumbnail_url'),
    viewCount: integer('view_count').default(0),
    likeCount: integer('like_count').default(0),
    // Restore capability
    canRestore: boolean('can_restore').default(true),
    restoredAt: timestamp('restored_at'),
    restoredBy: text('restored_by'),
    // Domain context (if deleted by domain moderator)
    domainId: text('domain_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    videoUriIdx: index('video_deletion_log_video_uri_idx').on(table.videoUri),
    authorDidIdx: index('video_deletion_log_author_did_idx').on(table.authorDid),
    deletedByIdx: index('video_deletion_log_deleted_by_idx').on(table.deletedBy),
    deletionTypeIdx: index('video_deletion_log_deletion_type_idx').on(table.deletionType),
    createdAtIdx: index('video_deletion_log_created_at_idx').on(table.createdAt),
  })
);

// Moderation Notifications - In-app notifications for moderators
export const moderationNotifications = pgTable(
  'moderation_notifications',
  {
    id: text('id').primaryKey(),
    recipientId: text('recipient_id').notNull(), // Admin user ID or 'all_moderators'
    type: text('type').notNull(), // 'new_content' | 'escalation' | 'high_risk' | 'appeal' | 'queue_full'
    priority: text('priority').default('normal').notNull(), // 'low' | 'normal' | 'high' | 'urgent'
    title: text('title').notNull(),
    message: text('message').notNull(),
    // Related content
    contentType: text('content_type'), // 'video' | 'comment' | 'profile'
    contentId: text('content_id'),
    contentUri: text('content_uri'),
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    // Status
    readAt: timestamp('read_at'),
    dismissedAt: timestamp('dismissed_at'),
    actionedAt: timestamp('actioned_at'),
    actionedBy: text('actioned_by'),
    actionTaken: text('action_taken'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    recipientIdx: index('moderation_notifications_recipient_idx').on(table.recipientId),
    typeIdx: index('moderation_notifications_type_idx').on(table.type),
    priorityIdx: index('moderation_notifications_priority_idx').on(table.priority),
    readIdx: index('moderation_notifications_read_idx').on(table.readAt),
    createdAtIdx: index('moderation_notifications_created_at_idx').on(table.createdAt),
  })
);

// Trusted Users - Users eligible for auto-approval
export const trustedUsers = pgTable(
  'trusted_users',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did').notNull().unique(),
    trustLevel: text('trust_level').default('basic').notNull(), // 'basic' | 'verified' | 'creator' | 'partner'
    // Trust grants
    autoApprove: boolean('auto_approve').default(true),
    skipAiReview: boolean('skip_ai_review').default(false),
    extendedUploadLimits: boolean('extended_upload_limits').default(false),
    // Grant info
    grantedBy: text('granted_by').notNull(),
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
    grantReason: text('grant_reason'),
    // Revocation
    revokedAt: timestamp('revoked_at'),
    revokedBy: text('revoked_by'),
    revokeReason: text('revoke_reason'),
    // Stats
    totalUploads: integer('total_uploads').default(0),
    approvedUploads: integer('approved_uploads').default(0),
    rejectedUploads: integer('rejected_uploads').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userDidIdx: index('trusted_users_user_did_idx').on(table.userDid),
    trustLevelIdx: index('trusted_users_trust_level_idx').on(table.trustLevel),
    autoApproveIdx: index('trusted_users_auto_approve_idx').on(table.autoApprove),
  })
);

// Video Moderation Queue - Videos pending review
export const videoModerationQueue = pgTable(
  'video_moderation_queue',
  {
    id: text('id').primaryKey(),
    videoUri: text('video_uri').notNull().unique(),
    authorDid: text('author_did').notNull(),
    // Submission info
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    // Risk assessment
    riskScore: integer('risk_score').default(0),
    riskLevel: text('risk_level').default('unknown'), // 'unknown' | 'safe' | 'low' | 'medium' | 'high' | 'critical'
    flags: jsonb('flags').$type<string[]>().default([]),
    aiAnalysis: jsonb('ai_analysis').$type<Record<string, unknown>>().default({}),
    // Review status
    status: text('status').default('pending').notNull(), // 'pending' | 'in_review' | 'approved' | 'rejected' | 'escalated'
    priority: integer('priority').default(0),
    // Assignment
    assignedTo: text('assigned_to'),
    assignedAt: timestamp('assigned_at'),
    // Review result
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'),
    rejectionReason: text('rejection_reason'),
    // Domain context
    domainId: text('domain_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    videoUriIdx: index('video_moderation_queue_video_uri_idx').on(table.videoUri),
    authorDidIdx: index('video_moderation_queue_author_did_idx').on(table.authorDid),
    statusIdx: index('video_moderation_queue_status_idx').on(table.status),
    priorityIdx: index('video_moderation_queue_priority_idx').on(table.priority, table.submittedAt),
    assignedToIdx: index('video_moderation_queue_assigned_to_idx').on(table.assignedTo),
    riskLevelIdx: index('video_moderation_queue_risk_level_idx').on(table.riskLevel),
  })
);

// Domain Moderators - Users with moderation privileges within a domain
export const domainModerators = pgTable(
  'domain_moderators',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id').notNull(),
    userDid: text('user_did').notNull(),
    // Permissions
    canApprove: boolean('can_approve').default(true),
    canReject: boolean('can_reject').default(true),
    canDelete: boolean('can_delete').default(false),
    canEscalate: boolean('can_escalate').default(true),
    canWarnUsers: boolean('can_warn_users').default(false),
    canSuspendUsers: boolean('can_suspend_users').default(false),
    // Assignment
    appointedBy: text('appointed_by').notNull(),
    appointedAt: timestamp('appointed_at').defaultNow().notNull(),
    // Status
    active: boolean('active').default(true),
    deactivatedAt: timestamp('deactivated_at'),
    deactivatedBy: text('deactivated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    domainIdIdx: index('domain_moderators_domain_id_idx').on(table.domainId),
    userDidIdx: index('domain_moderators_user_did_idx').on(table.userDid),
    activeIdx: index('domain_moderators_active_idx').on(table.active),
    domainUserUnique: uniqueIndex('domain_moderators_domain_user_idx').on(table.domainId, table.userDid),
  })
);

// Video Moderation & Deletion type exports
export type VideoDeletionLogEntry = typeof videoDeletionLog.$inferSelect;
export type NewVideoDeletionLogEntry = typeof videoDeletionLog.$inferInsert;
export type ModerationNotification = typeof moderationNotifications.$inferSelect;
export type NewModerationNotification = typeof moderationNotifications.$inferInsert;
export type TrustedUser = typeof trustedUsers.$inferSelect;
export type NewTrustedUser = typeof trustedUsers.$inferInsert;
export type VideoModerationQueueItem = typeof videoModerationQueue.$inferSelect;
export type NewVideoModerationQueueItem = typeof videoModerationQueue.$inferInsert;
export type DomainModerator = typeof domainModerators.$inferSelect;
export type NewDomainModerator = typeof domainModerators.$inferInsert;

// ============================================
// Phase 8-10: Advanced CA, Auth & Token Infrastructure
// ============================================

// Certificate Templates - predefined templates for different cert types
export const certificateTemplates = pgTable(
  'certificate_templates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    templateType: text('template_type').notNull(), // 'creator' | 'org_member' | 'service' | 'device'
    keySize: integer('key_size').default(2048).notNull(),
    signatureAlgorithm: text('signature_algorithm').default('sha256').notNull(),
    validityDays: integer('validity_days').default(365).notNull(),
    keyUsage: jsonb('key_usage').$type<string[]>().default(['digitalSignature', 'keyEncipherment']),
    extendedKeyUsage: jsonb('extended_key_usage').$type<string[]>().default(['clientAuth']),
    subjectAltNameTemplate: text('san_template'), // JSON template for SAN generation
    policyOids: jsonb('policy_oids').$type<string[]>(),
    isDefault: boolean('is_default').default(false),
    isSystem: boolean('is_system').default(false), // System templates can't be deleted
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('cert_templates_name_idx').on(table.name),
    typeIdx: index('cert_templates_type_idx').on(table.templateType),
    defaultIdx: index('cert_templates_default_idx').on(table.isDefault),
  })
);

// CA Audit Log - comprehensive audit trail for all CA operations
export const caAuditLog = pgTable(
  'ca_audit_log',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(), // 'certificate.issued' | 'certificate.revoked' | etc
    eventCategory: text('event_category').notNull(), // 'certificate' | 'ca' | 'auth' | 'token'
    certificateId: text('certificate_id'),
    certificateSerialNumber: text('certificate_serial_number'),
    subjectDid: text('subject_did'),
    performedBy: text('performed_by').notNull(), // DID of admin/user or 'system'
    performedByIp: text('performed_by_ip'),
    performedByUserAgent: text('performed_by_user_agent'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    severity: text('severity').default('info').notNull(), // 'info' | 'warning' | 'error' | 'critical'
    success: boolean('success').default(true).notNull(),
    errorMessage: text('error_message'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    eventTypeIdx: index('ca_audit_event_type_idx').on(table.eventType),
    categoryIdx: index('ca_audit_category_idx').on(table.eventCategory),
    subjectDidIdx: index('ca_audit_subject_did_idx').on(table.subjectDid),
    performedByIdx: index('ca_audit_performed_by_idx').on(table.performedBy),
    timestampIdx: index('ca_audit_timestamp_idx').on(table.timestamp),
    severityIdx: index('ca_audit_severity_idx').on(table.severity),
  })
);

// API Tokens - secure API tokens for programmatic access
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(), // SHA-256 of token
    tokenPrefix: text('token_prefix').notNull(), // First 8 chars for identification
    name: text('name').notNull(),
    description: text('description'),
    ownerDid: text('owner_did').notNull(),
    certificateId: text('certificate_id').references(() => caEntityCertificates.id, { onDelete: 'set null' }),
    tokenType: text('token_type').notNull(), // 'personal' | 'service' | 'organization'
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    allowedIps: jsonb('allowed_ips').$type<string[]>(), // IP allowlist (CIDR notation)
    allowedOrigins: jsonb('allowed_origins').$type<string[]>(), // CORS origins
    rateLimit: integer('rate_limit'), // Requests per minute
    expiresAt: timestamp('expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    lastUsedIp: text('last_used_ip'),
    usageCount: integer('usage_count').default(0).notNull(),
    status: text('status').default('active').notNull(), // 'active' | 'revoked' | 'expired'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
    revokedBy: text('revoked_by'),
    revokedReason: text('revoked_reason'),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('api_tokens_hash_idx').on(table.tokenHash),
    ownerDidIdx: index('api_tokens_owner_did_idx').on(table.ownerDid),
    tokenTypeIdx: index('api_tokens_type_idx').on(table.tokenType),
    statusIdx: index('api_tokens_status_idx').on(table.status),
    expiresAtIdx: index('api_tokens_expires_at_idx').on(table.expiresAt),
  })
);

// API Token Scopes - available scopes for API tokens
export const apiTokenScopes = pgTable(
  'api_token_scopes',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // 'read' | 'write' | 'admin' | 'service'
    permissions: jsonb('permissions').$type<string[]>().notNull(),
    requiresCertificate: boolean('requires_certificate').default(false),
    requiresOrganization: boolean('requires_organization').default(false),
    isDeprecated: boolean('is_deprecated').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    scopeIdx: uniqueIndex('api_token_scopes_scope_idx').on(table.scope),
    categoryIdx: index('api_token_scopes_category_idx').on(table.category),
  })
);

// Session Certificate Bindings - bind sessions to certificates for enhanced security
export const sessionCertificateBindings = pgTable(
  'session_certificate_bindings',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    certificateFingerprint: text('certificate_fingerprint').notNull(),
    did: text('did').notNull(),
    boundAt: timestamp('bound_at').defaultNow().notNull(),
    lastVerified: timestamp('last_verified'),
    status: text('status').default('active').notNull(), // 'active' | 'revoked'
  },
  (table) => ({
    sessionIdIdx: uniqueIndex('session_cert_session_id_idx').on(table.sessionId),
    fingerprintIdx: index('session_cert_fingerprint_idx').on(table.certificateFingerprint),
    didIdx: index('session_cert_did_idx').on(table.did),
    statusIdx: index('session_cert_status_idx').on(table.status),
  })
);

// Certificate Authentication Challenges - for challenge-response auth
export const certAuthChallenges = pgTable(
  'cert_auth_challenges',
  {
    id: text('id').primaryKey(),
    certificateFingerprint: text('certificate_fingerprint').notNull(),
    challenge: text('challenge').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    fingerprintIdx: index('cert_auth_challenges_fingerprint_idx').on(table.certificateFingerprint),
    expiresAtIdx: index('cert_auth_challenges_expires_at_idx').on(table.expiresAt),
  })
);

// CRL History - track CRL generations
export const caCRLHistory = pgTable(
  'ca_crl_history',
  {
    id: text('id').primaryKey(),
    crlPem: text('crl_pem').notNull(),
    certCount: integer('cert_count').notNull(),
    crlNumber: integer('crl_number'),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    generatedBy: text('generated_by'), // 'system' or admin DID
  },
  (table) => ({
    generatedAtIdx: index('ca_crl_history_generated_at_idx').on(table.generatedAt),
    expiresAtIdx: index('ca_crl_history_expires_at_idx').on(table.expiresAt),
  })
);

// Certificate Pins - certificate pinning for mobile apps
export const certificatePins = pgTable(
  'certificate_pins',
  {
    id: text('id').primaryKey(),
    pinType: text('pin_type').notNull(), // 'root' | 'intermediate' | 'leaf'
    fingerprint: text('fingerprint').notNull().unique(), // sha256 fingerprint
    certificateId: text('certificate_id'),
    validFrom: timestamp('valid_from').defaultNow().notNull(),
    validUntil: timestamp('valid_until').notNull(),
    isBackup: boolean('is_backup').default(false),
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    fingerprintIdx: uniqueIndex('cert_pins_fingerprint_idx').on(table.fingerprint),
    pinTypeIdx: index('cert_pins_type_idx').on(table.pinType),
    statusIdx: index('cert_pins_status_idx').on(table.status),
  })
);

// Pin Violation Reports - track certificate pinning violations
export const pinViolationReports = pgTable(
  'pin_violation_reports',
  {
    id: text('id').primaryKey(),
    expectedPins: jsonb('expected_pins').$type<string[]>().notNull(),
    receivedChain: jsonb('received_chain').$type<string[]>(),
    hostname: text('hostname').notNull(),
    userAgent: text('user_agent'),
    clientIp: text('client_ip'),
    reportedAt: timestamp('reported_at').defaultNow().notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
  },
  (table) => ({
    hostnameIdx: index('pin_violation_hostname_idx').on(table.hostname),
    reportedAtIdx: index('pin_violation_reported_at_idx').on(table.reportedAt),
  })
);

// Type exports for new tables
export type CertificateTemplate = typeof certificateTemplates.$inferSelect;
export type NewCertificateTemplate = typeof certificateTemplates.$inferInsert;
export type CAAuditLogEntry = typeof caAuditLog.$inferSelect;
export type NewCAAuditLogEntry = typeof caAuditLog.$inferInsert;
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
export type ApiTokenScope = typeof apiTokenScopes.$inferSelect;
export type NewApiTokenScope = typeof apiTokenScopes.$inferInsert;
export type SessionCertificateBinding = typeof sessionCertificateBindings.$inferSelect;
export type NewSessionCertificateBinding = typeof sessionCertificateBindings.$inferInsert;
export type CertAuthChallenge = typeof certAuthChallenges.$inferSelect;
export type NewCertAuthChallenge = typeof certAuthChallenges.$inferInsert;
export type CACRLHistoryEntry = typeof caCRLHistory.$inferSelect;
export type NewCACRLHistoryEntry = typeof caCRLHistory.$inferInsert;
export type CertificatePin = typeof certificatePins.$inferSelect;
export type NewCertificatePin = typeof certificatePins.$inferInsert;
export type PinViolationReport = typeof pinViolationReports.$inferSelect;
export type NewPinViolationReport = typeof pinViolationReports.$inferInsert;

// ============================================
// AT Protocol Repository System
// ============================================

// Repositories - AT Protocol user data repositories
export const repositories = pgTable(
  'repositories',
  {
    did: text('did').primaryKey(),
    head: text('head'), // CID of latest commit
    rev: integer('rev').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: uniqueIndex('repositories_did_idx').on(table.did),
    updatedAtIdx: index('repositories_updated_at_idx').on(table.updatedAt),
  })
);

// Repository records - individual records in AT Protocol collections
export const repoRecords = pgTable(
  'repo_records',
  {
    uri: text('uri').primaryKey(), // at://did/collection/rkey
    did: text('did')
      .notNull()
      .references(() => repositories.did, { onDelete: 'cascade' }),
    collection: text('collection').notNull(), // e.g., io.exprsn.video.post
    rkey: text('rkey').notNull(), // record key (TID or custom)
    cid: text('cid').notNull(), // content identifier
    value: jsonb('value').notNull(), // record content
    createdAt: timestamp('created_at').defaultNow().notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    didCollectionIdx: index('repo_records_did_collection_idx').on(table.did, table.collection),
    collectionIdx: index('repo_records_collection_idx').on(table.collection),
    cidIdx: index('repo_records_cid_idx').on(table.cid),
    rkeyIdx: index('repo_records_rkey_idx').on(table.did, table.collection, table.rkey),
    createdIdx: index('repo_records_created_idx').on(table.createdAt),
    uniqueRecordIdx: uniqueIndex('repo_records_unique_idx').on(table.did, table.collection, table.rkey),
  })
);

// Repository blobs - binary content stored with repositories
export const repoBlobs = pgTable(
  'repo_blobs',
  {
    cid: text('cid').primaryKey(), // content identifier
    did: text('did')
      .notNull()
      .references(() => repositories.did, { onDelete: 'cascade' }),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    url: text('url'), // CDN URL or local path
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('repo_blobs_did_idx').on(table.did),
    cidIdx: uniqueIndex('repo_blobs_cid_idx').on(table.cid),
  })
);

// Repository commits - history of repository changes
export const repoCommits = pgTable(
  'repo_commits',
  {
    cid: text('cid').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => repositories.did, { onDelete: 'cascade' }),
    prev: text('prev'), // previous commit CID
    data: text('data').notNull(), // MST root CID
    rev: integer('rev').notNull(),
    sig: text('sig'), // signature
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    didIdx: index('repo_commits_did_idx').on(table.did),
    revIdx: index('repo_commits_rev_idx').on(table.did, table.rev),
    createdIdx: index('repo_commits_created_idx').on(table.createdAt),
  })
);

// Sync subscriptions - track firehose subscriptions
export const syncSubscriptions = pgTable(
  'sync_subscriptions',
  {
    id: text('id').primaryKey(),
    service: text('service').notNull(), // remote service URL
    cursor: integer('cursor'), // last processed sequence number
    status: text('status').default('active').notNull(), // active | paused | error
    lastSync: timestamp('last_sync'),
    errorCount: integer('error_count').default(0).notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    serviceIdx: uniqueIndex('sync_subscriptions_service_idx').on(table.service),
    statusIdx: index('sync_subscriptions_status_idx').on(table.status),
  })
);

// Sync events - firehose events log
export const syncEvents = pgTable(
  'sync_events',
  {
    id: serial('id').primaryKey(),
    seq: integer('seq').notNull(), // sequence number
    did: text('did').notNull(),
    eventType: text('event_type').notNull(), // commit | identity | account
    commit: text('commit'), // commit CID
    ops: jsonb('ops').$type<Array<{
      action: 'create' | 'update' | 'delete';
      path: string;
      cid?: string;
    }>>(),
    blocks: jsonb('blocks').$type<Record<string, unknown>>(), // CAR blocks
    rebase: boolean('rebase').default(false).notNull(),
    tooBig: boolean('too_big').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    seqIdx: uniqueIndex('sync_events_seq_idx').on(table.seq),
    didIdx: index('sync_events_did_idx').on(table.did),
    eventTypeIdx: index('sync_events_type_idx').on(table.eventType),
    createdIdx: index('sync_events_created_idx').on(table.createdAt),
  })
);

// Type exports
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type RepoRecord = typeof repoRecords.$inferSelect;
export type NewRepoRecord = typeof repoRecords.$inferInsert;
export type RepoBlob = typeof repoBlobs.$inferSelect;
export type NewRepoBlob = typeof repoBlobs.$inferInsert;
export type RepoCommit = typeof repoCommits.$inferSelect;
export type NewRepoCommit = typeof repoCommits.$inferInsert;
export type SyncSubscription = typeof syncSubscriptions.$inferSelect;
export type NewSyncSubscription = typeof syncSubscriptions.$inferInsert;
export type SyncEvent = typeof syncEvents.$inferSelect;
export type NewSyncEvent = typeof syncEvents.$inferInsert;
