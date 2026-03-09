'use client';

import { useCallback } from 'react';
import type { ThemeId, ColorMode, UserSettingsUpdate } from '@exprsn/shared';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

interface ThemeSettingsProps {
  themeId: ThemeId;
  colorMode: ColorMode;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

const THEMES: { id: ThemeId; name: string; description: string; colors: { primary: string; accent: string; bg: string } }[] = [
  {
    id: 'slate',
    name: 'Slate',
    description: 'Clean, professional gray tones',
    colors: { primary: '#64748b', accent: '#f83b85', bg: '#0f0f0f' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Calming blue depths',
    colors: { primary: '#0ea5e9', accent: '#38bdf8', bg: '#0a1628' },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green tranquility',
    colors: { primary: '#22c55e', accent: '#4ade80', bg: '#0a1f0a' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange glow',
    colors: { primary: '#f97316', accent: '#fb923c', bg: '#1a0f0a' },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Creative purple vibes',
    colors: { primary: '#a855f7', accent: '#a78bfa', bg: '#13071e' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep indigo for night owls',
    colors: { primary: '#6366f1', accent: '#818cf8', bg: '#080812' },
  },
  {
    id: 'rose',
    name: 'Rose',
    description: 'Soft pink romantic warmth',
    colors: { primary: '#f43f5e', accent: '#fb7185', bg: '#18080f' },
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Bold crimson energy',
    colors: { primary: '#ef4444', accent: '#f87171', bg: '#1a0808' },
  },
  {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh teal clarity',
    colors: { primary: '#14b8a6', accent: '#2dd4bf', bg: '#051a1a' },
  },
  {
    id: 'copper',
    name: 'Copper',
    description: 'Warm bronze sophistication',
    colors: { primary: '#c2410c', accent: '#ea580c', bg: '#1a120a' },
  },
];

const COLOR_MODES: { value: ColorMode; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: ComputerIcon },
];

export function ThemeSettings({ themeId, colorMode, onUpdate, isUpdating }: ThemeSettingsProps) {
  // Use Zustand store to immediately update the UI
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setColorMode = useSettingsStore((state) => state.setColorMode);
  const storeThemeId = useSettingsStore((state) => state.settings.themeId);
  const storeColorMode = useSettingsStore((state) => state.settings.colorMode);

  // Use store values for display (more reliable)
  const currentTheme = storeThemeId || themeId;
  const currentColorMode = storeColorMode || colorMode;

  const handleThemeChange = useCallback(
    (newThemeId: ThemeId) => {
      // Update Zustand store immediately (also syncs to server)
      setTheme(newThemeId);
      // Also call the parent callback to update React Query cache
      onUpdate({ themeId: newThemeId });
    },
    [setTheme, onUpdate]
  );

  const handleColorModeChange = useCallback(
    (newMode: ColorMode) => {
      // Update Zustand store immediately (also syncs to server)
      setColorMode(newMode);
      // Also call the parent callback to update React Query cache
      onUpdate({ colorMode: newMode });
    },
    [setColorMode, onUpdate]
  );

  return (
    <div className="space-y-6">
      {/* Color Mode Selection */}
      <div>
        <p className="text-sm font-medium text-text-primary mb-3">Color Mode</p>
        <div className="flex rounded-lg bg-background p-1 border border-border">
          {COLOR_MODES.map((mode) => {
            const Icon = mode.icon;
            const isSelected = currentColorMode === mode.value;
            return (
              <button
                key={mode.value}
                onClick={() => handleColorModeChange(mode.value)}
                disabled={isUpdating}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all',
                  isSelected
                    ? 'bg-accent text-text-inverse shadow-sm'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-hover',
                  isUpdating && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme Selection */}
      <div>
        <p className="text-sm font-medium text-text-primary mb-3">Theme</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => handleThemeChange(theme.id)}
                disabled={isUpdating}
                className={cn(
                  'relative flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left',
                  isSelected
                    ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                    : 'border-border hover:border-accent/50 hover:bg-surface-hover',
                  isUpdating && 'opacity-50 cursor-not-allowed'
                )}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <CheckIcon className="w-3 h-3 text-text-inverse" />
                    </div>
                  </div>
                )}

                {/* Theme preview */}
                <div
                  className="w-full h-16 rounded-lg mb-3 relative overflow-hidden"
                  style={{ backgroundColor: theme.colors.bg }}
                >
                  <div
                    className="absolute bottom-0 left-0 w-1/2 h-3"
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                  <div
                    className="absolute bottom-0 right-0 w-1/4 h-6 rounded-tl-lg"
                    style={{ backgroundColor: theme.colors.accent }}
                  />
                  <div className="absolute top-2 left-2 flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                  </div>
                </div>

                {/* Theme info */}
                <span className="font-medium text-text-primary">{theme.name}</span>
                <span className="text-xs text-text-muted mt-1">{theme.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Icons
function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}

function ComputerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
