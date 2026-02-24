import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  UserSettings,
  UserSettingsUpdate,
  ThemeId,
  ColorMode,
  AccessibilitySettings,
  PlaybackSettings,
  NotificationSettings,
  PrivacySettings,
  ContentSettings,
  LayoutSettings,
  EditorSettings,
  CustomEffectPreset,
} from '@exprsn/shared';
import { api } from '../lib/api';

const DEFAULT_SETTINGS: UserSettings = {
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

interface SettingsState {
  settings: UserSettings;
  resolvedColorMode: 'light' | 'dark';
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;

  // Actions
  setTheme: (themeId: ThemeId) => void;
  setColorMode: (colorMode: ColorMode) => void;
  updateAccessibility: (settings: Partial<AccessibilitySettings>) => void;
  updatePlayback: (settings: Partial<PlaybackSettings>) => void;
  updateNotifications: (settings: Partial<NotificationSettings>) => void;
  updatePrivacy: (settings: Partial<PrivacySettings>) => void;
  updateContent: (settings: Partial<ContentSettings>) => void;
  updateEditor: (settings: Partial<EditorSettings>) => void;
  addCustomPreset: (preset: Omit<CustomEffectPreset, 'id' | 'createdAt'>) => void;
  removeCustomPreset: (presetId: string) => void;
  toggleFavoritePreset: (presetId: string) => void;
  addRecentPreset: (presetId: string) => void;
  resetSettings: () => void;

  // Sync with server
  loadFromServer: () => Promise<void>;
  syncToServer: (updates: UserSettingsUpdate) => Promise<void>;

  // System color scheme detection
  setSystemColorMode: (mode: 'light' | 'dark') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      resolvedColorMode: 'dark',
      isLoading: false,
      isSyncing: false,
      lastSyncedAt: null,

      setTheme: (themeId: ThemeId) => {
        set((state) => ({
          settings: {
            ...state.settings,
            themeId,
            updatedAt: new Date().toISOString(),
          },
        }));
        get().syncToServer({ themeId });
      },

      setColorMode: (colorMode: ColorMode) => {
        const resolvedMode = colorMode === 'system'
          ? get().resolvedColorMode
          : colorMode;

        set((state) => ({
          settings: {
            ...state.settings,
            colorMode,
            updatedAt: new Date().toISOString(),
          },
          resolvedColorMode: resolvedMode,
        }));
        get().syncToServer({ colorMode });
      },

      updateAccessibility: (accessibility: Partial<AccessibilitySettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            accessibility: { ...state.settings.accessibility, ...accessibility },
            updatedAt: new Date().toISOString(),
          },
        }));
        get().syncToServer({ accessibility });
      },

      updatePlayback: (playback: Partial<PlaybackSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            playback: { ...state.settings.playback, ...playback },
            updatedAt: new Date().toISOString(),
          },
        }));
        get().syncToServer({ playback });
      },

      updateNotifications: (notifications: Partial<NotificationSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: { ...state.settings.notifications, ...notifications },
            updatedAt: new Date().toISOString(),
          },
        }));
        get().syncToServer({ notifications });
      },

      updatePrivacy: (privacy: Partial<PrivacySettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            privacy: { ...state.settings.privacy, ...privacy },
            updatedAt: new Date().toISOString(),
          },
        }));
        get().syncToServer({ privacy });
      },

      updateContent: (content: Partial<ContentSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            content: { ...state.settings.content, ...content },
            updatedAt: new Date().toISOString(),
          },
        }));
        get().syncToServer({ content });
      },

      updateEditor: (editor: Partial<EditorSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            editor: { ...state.settings.editor, ...editor },
            updatedAt: new Date().toISOString(),
          },
        }));
        get().syncToServer({ editor });
      },

      addCustomPreset: (preset: Omit<CustomEffectPreset, 'id' | 'createdAt'>) => {
        const newPreset: CustomEffectPreset = {
          ...preset,
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          createdAt: new Date().toISOString(),
        };
        set((state) => {
          const customPresets = [...state.settings.editor.customPresets, newPreset];
          return {
            settings: {
              ...state.settings,
              editor: { ...state.settings.editor, customPresets },
              updatedAt: new Date().toISOString(),
            },
          };
        });
        get().syncToServer({ editor: get().settings.editor });
      },

      removeCustomPreset: (presetId: string) => {
        set((state) => {
          const customPresets = state.settings.editor.customPresets.filter(p => p.id !== presetId);
          const favoritePresetIds = state.settings.editor.favoritePresetIds.filter(id => id !== presetId);
          const recentPresetIds = state.settings.editor.recentPresetIds.filter(id => id !== presetId);
          const defaultPresetId = state.settings.editor.defaultPresetId === presetId ? null : state.settings.editor.defaultPresetId;
          return {
            settings: {
              ...state.settings,
              editor: { ...state.settings.editor, customPresets, favoritePresetIds, recentPresetIds, defaultPresetId },
              updatedAt: new Date().toISOString(),
            },
          };
        });
        get().syncToServer({ editor: get().settings.editor });
      },

      toggleFavoritePreset: (presetId: string) => {
        set((state) => {
          const favoritePresetIds = state.settings.editor.favoritePresetIds.includes(presetId)
            ? state.settings.editor.favoritePresetIds.filter(id => id !== presetId)
            : [...state.settings.editor.favoritePresetIds, presetId];
          return {
            settings: {
              ...state.settings,
              editor: { ...state.settings.editor, favoritePresetIds },
              updatedAt: new Date().toISOString(),
            },
          };
        });
        get().syncToServer({ editor: get().settings.editor });
      },

      addRecentPreset: (presetId: string) => {
        set((state) => {
          const recentPresetIds = [
            presetId,
            ...state.settings.editor.recentPresetIds.filter(id => id !== presetId),
          ].slice(0, 10); // Keep max 10 recent
          return {
            settings: {
              ...state.settings,
              editor: { ...state.settings.editor, recentPresetIds },
              updatedAt: new Date().toISOString(),
            },
          };
        });
        get().syncToServer({ editor: get().settings.editor });
      },

      resetSettings: () => {
        set({
          settings: { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() },
        });
        // Call reset endpoint
        api.resetSettings().catch(console.error);
      },

      loadFromServer: async () => {
        set({ isLoading: true });
        try {
          const data = await api.getSettings();
          const serverSettings = data.settings;
          const isAuthenticated = data.isAuthenticated;

          // Only merge server settings if user is authenticated
          // This prevents unauthenticated defaults from overwriting local settings
          if (!isAuthenticated) {
            console.debug('Settings sync skipped: not authenticated');
            return;
          }

          // Merge server settings with local, taking newer
          const state = get();
          const serverTime = new Date(serverSettings.updatedAt).getTime();
          const localTime = new Date(state.settings.updatedAt).getTime();

          if (serverTime >= localTime) {
            set({
              settings: serverSettings,
              lastSyncedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          // Silently fail if not authenticated or server unavailable
          console.debug('Settings sync skipped:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      syncToServer: async (updates: UserSettingsUpdate) => {
        const state = get();
        if (state.isSyncing) return;

        set({ isSyncing: true });
        try {
          await api.updateSettings(updates);
          set({ lastSyncedAt: new Date().toISOString() });
        } catch (error) {
          // Silently fail if not authenticated
          console.debug('Settings sync failed:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      setSystemColorMode: (mode: 'light' | 'dark') => {
        const state = get();
        if (state.settings.colorMode === 'system') {
          set({ resolvedColorMode: mode });
        }
      },
    }),
    {
      name: 'exprsn-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        resolvedColorMode: state.resolvedColorMode,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);

// Helper hooks for common use cases
export const useTheme = () => {
  const settings = useSettingsStore((state) => state.settings);
  const resolvedColorMode = useSettingsStore((state) => state.resolvedColorMode);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setColorMode = useSettingsStore((state) => state.setColorMode);

  return {
    themeId: settings.themeId,
    colorMode: settings.colorMode,
    resolvedColorMode,
    setTheme,
    setColorMode,
  };
};

export const useAccessibility = () => {
  const settings = useSettingsStore((state) => state.settings);
  const updateAccessibility = useSettingsStore((state) => state.updateAccessibility);

  return {
    ...settings.accessibility,
    update: updateAccessibility,
  };
};

export const usePlayback = () => {
  const settings = useSettingsStore((state) => state.settings);
  const updatePlayback = useSettingsStore((state) => state.updatePlayback);

  return {
    ...settings.playback,
    update: updatePlayback,
  };
};

export const useEditor = () => {
  const settings = useSettingsStore((state) => state.settings);
  const updateEditor = useSettingsStore((state) => state.updateEditor);
  const addCustomPreset = useSettingsStore((state) => state.addCustomPreset);
  const removeCustomPreset = useSettingsStore((state) => state.removeCustomPreset);
  const toggleFavoritePreset = useSettingsStore((state) => state.toggleFavoritePreset);
  const addRecentPreset = useSettingsStore((state) => state.addRecentPreset);

  return {
    ...settings.editor,
    update: updateEditor,
    addCustomPreset,
    removeCustomPreset,
    toggleFavoritePreset,
    addRecentPreset,
  };
};
