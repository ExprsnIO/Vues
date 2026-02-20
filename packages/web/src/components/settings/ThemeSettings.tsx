'use client';

import { useCallback } from 'react';
import type { ThemeId, ColorMode, UserSettingsUpdate } from '@exprsn/shared';
import { SettingsRow, Select } from './SettingsSection';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

interface ThemeSettingsProps {
  themeId: ThemeId;
  colorMode: ColorMode;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

const THEMES: { id: ThemeId; name: string; colors: string[] }[] = [
  { id: 'slate', name: 'Slate', colors: ['#64748b', '#475569', '#334155'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0ea5e9', '#0284c7', '#0369a1'] },
  { id: 'forest', name: 'Forest', colors: ['#22c55e', '#16a34a', '#15803d'] },
  { id: 'sunset', name: 'Sunset', colors: ['#f97316', '#ea580c', '#c2410c'] },
  { id: 'lavender', name: 'Lavender', colors: ['#a855f7', '#9333ea', '#7e22ce'] },
];

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export function ThemeSettings({ themeId, colorMode, onUpdate, isUpdating }: ThemeSettingsProps) {
  // Use Zustand store to immediately update the UI
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setColorMode = useSettingsStore((state) => state.setColorMode);

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
    (newMode: string) => {
      // Update Zustand store immediately (also syncs to server)
      setColorMode(newMode as ColorMode);
      // Also call the parent callback to update React Query cache
      onUpdate({ colorMode: newMode as ColorMode });
    },
    [setColorMode, onUpdate]
  );

  return (
    <div className="space-y-4">
      {/* Theme Selection */}
      <div>
        <p className="text-sm font-medium text-text-primary mb-3">Theme</p>
        <div className="flex flex-wrap gap-3">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              disabled={isUpdating}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                themeId === theme.id
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50',
                isUpdating && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex gap-1">
                {theme.colors.map((color, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-text-primary">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color Mode */}
      <SettingsRow
        label="Color Mode"
        description="Choose light, dark, or match your system"
      >
        <Select
          value={colorMode}
          onChange={handleColorModeChange}
          options={COLOR_MODES}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
