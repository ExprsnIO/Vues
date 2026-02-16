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
    replyCount: integer('reply_count').default(0).notNull(),
    createdAt: timestamp('created_at').notNull(),
    indexedAt: timestamp('indexed_at').defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index('comments_video_idx').on(table.videoUri),
    parentIdx: index('comments_parent_idx').on(table.parentUri),
    authorIdx: index('comments_author_idx').on(table.authorDid),
    createdIdx: index('comments_created_idx').on(table.createdAt),
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
