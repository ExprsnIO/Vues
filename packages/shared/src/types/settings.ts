// Theme identifiers
export type ThemeId = 'ocean' | 'forest' | 'sunset' | 'lavender' | 'slate';
export type ColorMode = 'light' | 'dark' | 'system';

// Accessibility settings
export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  screenReaderOptimized: boolean;
}

// Playback settings
export interface PlaybackSettings {
  autoplay: boolean;
  defaultQuality: 'auto' | '1080p' | '720p' | '480p' | '360p';
  defaultMuted: boolean;
  loopVideos: boolean;
  dataSaver: boolean;
}

// Notification settings
export interface NotificationSettings {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  directMessages: boolean;
  emailDigest: 'never' | 'daily' | 'weekly';
}

// Privacy settings
export interface PrivacySettings {
  privateAccount: boolean;
  showActivityStatus: boolean;
  allowDuets: boolean;
  allowStitches: boolean;
  allowComments: 'everyone' | 'following' | 'none';
  allowMessages: 'everyone' | 'following' | 'none';
}

// Content settings
export interface ContentSettings {
  language: string;
  contentWarnings: boolean;
  sensitiveContent: boolean;
}

// Layout settings
export type CommentsPosition = 'side' | 'bottom';

export interface LayoutSettings {
  commentsPosition: CommentsPosition;
}

// Editor/Video effect settings
export interface CustomEffectPreset {
  id: string;
  name: string;
  description?: string;
  effects: Array<{
    type: string;
    params: Record<string, number | string | boolean>;
  }>;
  createdAt: string;
}

export interface EditorSettings {
  defaultPresetId: string | null; // Preset to apply by default when editing
  favoritePresetIds: string[]; // Bookmarked preset IDs (system or custom)
  recentPresetIds: string[]; // Recently used preset IDs (max 10)
  customPresets: CustomEffectPreset[]; // User-created presets stored in settings
  showPresetDescriptions: boolean; // Show/hide descriptions in preset list
  autoApplyDefault: boolean; // Auto-apply default preset when starting editor
}

// Complete user settings
export interface UserSettings {
  themeId: ThemeId;
  colorMode: ColorMode;
  accessibility: AccessibilitySettings;
  playback: PlaybackSettings;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  content: ContentSettings;
  layout: LayoutSettings;
  editor: EditorSettings;
  updatedAt: string;
}

// Partial settings for updates
export type UserSettingsUpdate = Partial<{
  themeId: ThemeId;
  colorMode: ColorMode;
  accessibility: Partial<AccessibilitySettings>;
  playback: Partial<PlaybackSettings>;
  notifications: Partial<NotificationSettings>;
  privacy: Partial<PrivacySettings>;
  content: Partial<ContentSettings>;
  layout: Partial<LayoutSettings>;
  editor: Partial<EditorSettings>;
}>;

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  themeId: 'slate',
  colorMode: 'dark',
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    largeText: false,
    screenReaderOptimized: false,
  },
  playback: {
    autoplay: true,
    defaultQuality: 'auto',
    defaultMuted: false,
    loopVideos: true,
    dataSaver: false,
  },
  notifications: {
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    directMessages: true,
    emailDigest: 'never',
  },
  privacy: {
    privateAccount: false,
    showActivityStatus: true,
    allowDuets: true,
    allowStitches: true,
    allowComments: 'everyone',
    allowMessages: 'everyone',
  },
  content: {
    language: 'en',
    contentWarnings: true,
    sensitiveContent: false,
  },
  layout: {
    commentsPosition: 'side',
  },
  editor: {
    defaultPresetId: null,
    favoritePresetIds: [],
    recentPresetIds: [],
    customPresets: [],
    showPresetDescriptions: true,
    autoApplyDefault: false,
  },
  updatedAt: new Date().toISOString(),
};
