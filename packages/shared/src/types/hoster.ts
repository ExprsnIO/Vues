import type { ThemeId, ColorMode } from './settings.js';

// Platform branding configuration
export interface HosterBranding {
  platformName: string;
  logoUrl?: string;
  logoAlt?: string;
  faviconUrl?: string;
  accentColor?: string;
  accentColorLight?: string;
  accentColorDark?: string;
}

// Feature flags for enabling/disabling platform features
export interface HosterFeatureFlags {
  enableUpload: boolean;
  enableDuets: boolean;
  enableStitches: boolean;
  enableComments: boolean;
  enableDirectMessages: boolean;
  enableNotifications: boolean;
  enableSearch: boolean;
  enableDiscovery: boolean;
  enableAnalytics: boolean;
  enableAds: boolean;
  maxVideoDuration: number;
  maxVideoSize: number;
  allowedVideoFormats: string[];
}

// Content moderation settings
export interface HosterModeration {
  requireApproval: boolean;
  autoModerate: boolean;
  blockedWords: string[];
  minAccountAge: number;
  maxDailyUploads: number;
}

// Complete hoster configuration
export interface HosterConfig {
  branding: HosterBranding;
  features: HosterFeatureFlags;
  moderation: HosterModeration;
  defaultTheme: ThemeId;
  defaultColorMode: ColorMode;
  allowedThemes: ThemeId[];
  supportEmail?: string;
  termsUrl?: string;
  privacyUrl?: string;
}

// Default hoster configuration
export const DEFAULT_HOSTER_CONFIG: HosterConfig = {
  branding: {
    platformName: 'Exprsn',
    accentColor: '#f83b85',
  },
  features: {
    enableUpload: true,
    enableDuets: true,
    enableStitches: true,
    enableComments: true,
    enableDirectMessages: true,
    enableNotifications: true,
    enableSearch: true,
    enableDiscovery: true,
    enableAnalytics: false,
    enableAds: false,
    maxVideoDuration: 180,
    maxVideoSize: 500 * 1024 * 1024,
    allowedVideoFormats: ['video/mp4', 'video/webm', 'video/quicktime'],
  },
  moderation: {
    requireApproval: false,
    autoModerate: true,
    blockedWords: [],
    minAccountAge: 0,
    maxDailyUploads: 50,
  },
  defaultTheme: 'slate',
  defaultColorMode: 'dark',
  allowedThemes: ['ocean', 'forest', 'sunset', 'lavender', 'slate'],
};
