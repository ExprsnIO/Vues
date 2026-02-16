import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Users table - cached user profiles from PDS
export const users = sqliteTable(
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
    verified: integer('verified', { mode: 'boolean' }).default(false).notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
    indexedAt: text('indexed_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    handleIdx: uniqueIndex('users_handle_idx').on(table.handle),
    updatedAtIdx: index('users_updated_at_idx').on(table.updatedAt),
  })
);

// Videos table - indexed video posts
export const videos = sqliteTable(
  'videos',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    authorDid: text('author_did')
      .notNull()
      .references(() => users.did, { onDelete: 'cascade' }),
    caption: text('caption'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().default([]).notNull(),
    soundUri: text('sound_uri'),
    cdnUrl: text('cdn_url'),
    hlsPlaylist: text('hls_playlist'),
    thumbnailUrl: text('thumbnail_url'),
    duration: integer('duration'),
    aspectRatio: text('aspect_ratio', { mode: 'json' }).$type<{ width: number; height: number }>(),
    visibility: text('visibility').default('public').notNull(),
    allowDuet: integer('allow_duet', { mode: 'boolean' }).default(true).notNull(),
    allowStitch: integer('allow_stitch', { mode: 'boolean' }).default(true).notNull(),
    allowComments: integer('allow_comments', { mode: 'boolean' }).default(true).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    shareCount: integer('share_count').default(0).notNull(),
    indexedAt: text('indexed_at').default('CURRENT_TIMESTAMP').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    authorIdx: index('videos_author_idx').on(table.authorDid),
    createdIdx: index('videos_created_idx').on(table.createdAt),
    soundIdx: index('videos_sound_idx').on(table.soundUri),
    visibilityIdx: index('videos_visibility_idx').on(table.visibility),
  })
);

// Likes table
export const likes = sqliteTable(
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
    createdAt: text('created_at').notNull(),
    indexedAt: text('indexed_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    videoIdx: index('likes_video_idx').on(table.videoUri),
    authorIdx: index('likes_author_idx').on(table.authorDid),
    uniqueLike: uniqueIndex('likes_unique_idx').on(table.videoUri, table.authorDid),
  })
);

// Comments table
export const comments = sqliteTable(
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
    replyCount: integer('reply_count').default(0).notNull(),
    createdAt: text('created_at').notNull(),
    indexedAt: text('indexed_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    videoIdx: index('comments_video_idx').on(table.videoUri),
    parentIdx: index('comments_parent_idx').on(table.parentUri),
    authorIdx: index('comments_author_idx').on(table.authorDid),
    createdIdx: index('comments_created_idx').on(table.createdAt),
  })
);

// Follows table
export const follows = sqliteTable(
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
    createdAt: text('created_at').notNull(),
    indexedAt: text('indexed_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    followerIdx: index('follows_follower_idx').on(table.followerDid),
    followeeIdx: index('follows_followee_idx').on(table.followeeDid),
    uniqueFollow: uniqueIndex('follows_unique_idx').on(table.followerDid, table.followeeDid),
  })
);

// Sounds table
export const sounds = sqliteTable(
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    useCountIdx: index('sounds_use_count_idx').on(table.useCount),
    titleIdx: index('sounds_title_idx').on(table.title),
  })
);

// User interactions for feed algorithm
export const userInteractions = sqliteTable(
  'user_interactions',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did').notNull(),
    videoUri: text('video_uri').notNull(),
    interactionType: text('interaction_type').notNull(),
    watchDuration: integer('watch_duration'),
    completionRate: real('completion_rate'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    userIdx: index('interactions_user_idx').on(table.userDid),
    videoIdx: index('interactions_video_idx').on(table.videoUri),
    typeIdx: index('interactions_type_idx').on(table.interactionType),
    createdIdx: index('interactions_created_idx').on(table.createdAt),
  })
);

// Trending videos - updated by cron job
export const trendingVideos = sqliteTable(
  'trending_videos',
  {
    videoUri: text('video_uri')
      .primaryKey()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    velocity: real('velocity').default(0).notNull(),
    rank: integer('rank').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    scoreIdx: index('trending_score_idx').on(table.score),
    rankIdx: index('trending_rank_idx').on(table.rank),
  })
);

// Video embeddings for ML recommendations
export const videoEmbeddings = sqliteTable(
  'video_embeddings',
  {
    videoUri: text('video_uri')
      .primaryKey()
      .references(() => videos.uri, { onDelete: 'cascade' }),
    embedding: text('embedding', { mode: 'json' }).$type<number[]>().notNull(),
    model: text('model').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  }
);

// Upload jobs for tracking video processing
export const uploadJobs = sqliteTable(
  'upload_jobs',
  {
    id: text('id').primaryKey(),
    userDid: text('user_did').notNull(),
    status: text('status').notNull(),
    progress: integer('progress').default(0).notNull(),
    inputKey: text('input_key'),
    cdnUrl: text('cdn_url'),
    hlsPlaylist: text('hls_playlist'),
    thumbnailUrl: text('thumbnail_url'),
    error: text('error'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    userIdx: index('upload_jobs_user_idx').on(table.userDid),
    statusIdx: index('upload_jobs_status_idx').on(table.status),
  })
);

// User settings - synced across devices
export const userSettings = sqliteTable('user_settings', {
  userDid: text('user_did')
    .primaryKey()
    .references(() => users.did, { onDelete: 'cascade' }),
  themeId: text('theme_id').default('slate').notNull(),
  colorMode: text('color_mode').default('dark').notNull(), // 'light' | 'dark' | 'system'
  accessibility: text('accessibility', { mode: 'json' }).$type<{
    reducedMotion: boolean;
    highContrast: boolean;
    largeText: boolean;
    screenReaderOptimized: boolean;
  }>(),
  playback: text('playback', { mode: 'json' }).$type<{
    autoplay: boolean;
    defaultQuality: 'auto' | '1080p' | '720p' | '480p' | '360p';
    defaultMuted: boolean;
    loopVideos: boolean;
    dataSaver: boolean;
  }>(),
  notifications: text('notifications', { mode: 'json' }).$type<{
    likes: boolean;
    comments: boolean;
    follows: boolean;
    mentions: boolean;
    directMessages: boolean;
    emailDigest: 'never' | 'daily' | 'weekly';
  }>(),
  privacy: text('privacy', { mode: 'json' }).$type<{
    privateAccount: boolean;
    showActivityStatus: boolean;
    allowDuets: boolean;
    allowStitches: boolean;
    allowComments: 'everyone' | 'following' | 'none';
    allowMessages: 'everyone' | 'following' | 'none';
  }>(),
  content: text('content', { mode: 'json' }).$type<{
    language: string;
    contentWarnings: boolean;
    sensitiveContent: boolean;
  }>(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

// ============================================
// PDS (Personal Data Server) Tables
// ============================================

// Actor repositories - PDS hosted accounts
export const actorRepos = sqliteTable(
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
    status: text('status').default('active').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    handleIdx: uniqueIndex('actor_repos_handle_idx').on(table.handle),
    emailIdx: index('actor_repos_email_idx').on(table.email),
    statusIdx: index('actor_repos_status_idx').on(table.status),
  })
);

// Repository commits
export const repoCommits = sqliteTable(
  'repo_commits',
  {
    cid: text('cid').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    rev: text('rev').notNull(),
    data: text('data').notNull(),
    prev: text('prev'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    didIdx: index('repo_commits_did_idx').on(table.did),
    revIdx: index('repo_commits_rev_idx').on(table.rev),
  })
);

// Repository records
export const repoRecords = sqliteTable(
  'repo_records',
  {
    uri: text('uri').primaryKey(),
    cid: text('cid').notNull(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    collection: text('collection').notNull(),
    rkey: text('rkey').notNull(),
    record: text('record', { mode: 'json' }).notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    indexedAt: text('indexed_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    didCollectionIdx: index('repo_records_did_collection_idx').on(table.did, table.collection),
    collectionIdx: index('repo_records_collection_idx').on(table.collection),
    rkeyIdx: index('repo_records_rkey_idx').on(table.rkey),
  })
);

// Blobs stored in PDS
export const blobs = sqliteTable(
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    didIdx: index('blobs_did_idx').on(table.did),
    mimeTypeIdx: index('blobs_mime_type_idx').on(table.mimeType),
  })
);

// MST blocks
export const repoBlocks = sqliteTable(
  'repo_blocks',
  {
    cid: text('cid').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    referencedBy: text('referenced_by'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    didIdx: index('repo_blocks_did_idx').on(table.did),
  })
);

// PDS sessions
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    did: text('did')
      .notNull()
      .references(() => actorRepos.did, { onDelete: 'cascade' }),
    accessJwt: text('access_jwt').notNull(),
    refreshJwt: text('refresh_jwt').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    didIdx: index('sessions_did_idx').on(table.did),
    accessJwtIdx: uniqueIndex('sessions_access_jwt_idx').on(table.accessJwt),
    refreshJwtIdx: uniqueIndex('sessions_refresh_jwt_idx').on(table.refreshJwt),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  })
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
