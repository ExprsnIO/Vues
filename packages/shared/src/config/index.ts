import { z } from 'zod';
import type { HosterConfig, ThemeId, ColorMode } from '../types/index.js';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database (optional - will fallback to localhost PostgreSQL or SQLite)
  DATABASE_URL: z.string().url().optional(),

  // Redis (optional - will fallback to in-memory cache)
  REDIS_URL: z.string().url().optional(),

  // OpenSearch
  OPENSEARCH_URL: z.string().url(),

  // DigitalOcean Spaces
  DO_SPACES_REGION: z.string(),
  DO_SPACES_BUCKET: z.string(),
  DO_SPACES_KEY: z.string(),
  DO_SPACES_SECRET: z.string(),
  DO_SPACES_CDN: z.string().optional(),

  // OAuth
  OAUTH_CLIENT_ID: z.string(),
  OAUTH_PRIVATE_KEY: z.string(),

  // ML APIs
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // App
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Hoster branding
  PLATFORM_NAME: z.string().default('Exprsn'),
  PLATFORM_LOGO_URL: z.string().url().optional(),
  PLATFORM_LOGO_ALT: z.string().optional(),
  PLATFORM_FAVICON_URL: z.string().url().optional(),
  PLATFORM_ACCENT_COLOR: z.string().default('#f83b85'),
  PLATFORM_ACCENT_COLOR_LIGHT: z.string().optional(),
  PLATFORM_ACCENT_COLOR_DARK: z.string().optional(),

  // Theme defaults
  DEFAULT_THEME: z.enum(['ocean', 'forest', 'sunset', 'lavender', 'slate']).default('slate'),
  DEFAULT_COLOR_MODE: z.enum(['light', 'dark', 'system']).default('dark'),
  ALLOWED_THEMES: z.string().default('ocean,forest,sunset,lavender,slate'),

  // Feature flags
  FEATURE_UPLOAD_ENABLED: z.coerce.boolean().default(true),
  FEATURE_DUETS_ENABLED: z.coerce.boolean().default(true),
  FEATURE_STITCHES_ENABLED: z.coerce.boolean().default(true),
  FEATURE_COMMENTS_ENABLED: z.coerce.boolean().default(true),
  FEATURE_DIRECT_MESSAGES_ENABLED: z.coerce.boolean().default(true),
  FEATURE_NOTIFICATIONS_ENABLED: z.coerce.boolean().default(true),
  FEATURE_SEARCH_ENABLED: z.coerce.boolean().default(true),
  FEATURE_DISCOVERY_ENABLED: z.coerce.boolean().default(true),
  FEATURE_ANALYTICS_ENABLED: z.coerce.boolean().default(false),
  FEATURE_ADS_ENABLED: z.coerce.boolean().default(false),
  MAX_VIDEO_DURATION: z.coerce.number().default(180),
  MAX_VIDEO_SIZE: z.coerce.number().default(500 * 1024 * 1024),
  ALLOWED_VIDEO_FORMATS: z.string().default('video/mp4,video/webm,video/quicktime'),

  // Moderation
  MODERATION_REQUIRE_APPROVAL: z.coerce.boolean().default(false),
  MODERATION_AUTO_MODERATE: z.coerce.boolean().default(true),
  MODERATION_BLOCKED_WORDS: z.string().default(''),
  MODERATION_MIN_ACCOUNT_AGE: z.coerce.number().default(0),
  MODERATION_MAX_DAILY_UPLOADS: z.coerce.number().default(50),

  // Legal/support
  SUPPORT_EMAIL: z.string().email().optional(),
  TERMS_URL: z.string().url().optional(),
  PRIVACY_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

export const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe';

export const COLLECTIONS = {
  VIDEO_POST: 'io.exprsn.video.post',
  VIDEO_LIKE: 'io.exprsn.video.like',
  VIDEO_COMMENT: 'io.exprsn.video.comment',
  VIDEO_FOLLOW: 'io.exprsn.video.follow',
  VIDEO_SOUND: 'io.exprsn.video.sound',
  VIDEO_DUET: 'io.exprsn.video.duet',
} as const;

export const CACHE_TTL = {
  USER: 300, // 5 minutes
  VIDEO: 60, // 1 minute
  FEED: 30, // 30 seconds
  SESSION: 14 * 24 * 60 * 60, // 2 weeks
} as const;

// Parse hoster configuration from environment variables
export function getHosterConfig(): HosterConfig {
  const env = loadEnv();

  return {
    branding: {
      platformName: env.PLATFORM_NAME,
      logoUrl: env.PLATFORM_LOGO_URL,
      logoAlt: env.PLATFORM_LOGO_ALT,
      faviconUrl: env.PLATFORM_FAVICON_URL,
      accentColor: env.PLATFORM_ACCENT_COLOR,
      accentColorLight: env.PLATFORM_ACCENT_COLOR_LIGHT,
      accentColorDark: env.PLATFORM_ACCENT_COLOR_DARK,
    },
    features: {
      enableUpload: env.FEATURE_UPLOAD_ENABLED,
      enableDuets: env.FEATURE_DUETS_ENABLED,
      enableStitches: env.FEATURE_STITCHES_ENABLED,
      enableComments: env.FEATURE_COMMENTS_ENABLED,
      enableDirectMessages: env.FEATURE_DIRECT_MESSAGES_ENABLED,
      enableNotifications: env.FEATURE_NOTIFICATIONS_ENABLED,
      enableSearch: env.FEATURE_SEARCH_ENABLED,
      enableDiscovery: env.FEATURE_DISCOVERY_ENABLED,
      enableAnalytics: env.FEATURE_ANALYTICS_ENABLED,
      enableAds: env.FEATURE_ADS_ENABLED,
      maxVideoDuration: env.MAX_VIDEO_DURATION,
      maxVideoSize: env.MAX_VIDEO_SIZE,
      allowedVideoFormats: env.ALLOWED_VIDEO_FORMATS.split(','),
    },
    moderation: {
      requireApproval: env.MODERATION_REQUIRE_APPROVAL,
      autoModerate: env.MODERATION_AUTO_MODERATE,
      blockedWords: env.MODERATION_BLOCKED_WORDS
        ? env.MODERATION_BLOCKED_WORDS.split(',')
        : [],
      minAccountAge: env.MODERATION_MIN_ACCOUNT_AGE,
      maxDailyUploads: env.MODERATION_MAX_DAILY_UPLOADS,
    },
    defaultTheme: env.DEFAULT_THEME as ThemeId,
    defaultColorMode: env.DEFAULT_COLOR_MODE as ColorMode,
    allowedThemes: env.ALLOWED_THEMES.split(',') as ThemeId[],
    supportEmail: env.SUPPORT_EMAIL,
    termsUrl: env.TERMS_URL,
    privacyUrl: env.PRIVACY_URL,
  };
}
