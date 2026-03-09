'use client';

import { useCallback } from 'react';
import type { AccessibilitySettings as AccessibilitySettingsType, UserSettingsUpdate } from '@exprsn/shared';
import { Select, SettingsRow, ToggleSwitch } from './SettingsSection';
import { useSettingsStore } from '@/stores/settings-store';

interface AccessibilitySettingsProps {
  accessibility: AccessibilitySettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

const FONT_OPTIONS = [
  { value: 'inter', label: 'Exprsn Sans (Inter)' },
  { value: 'open-dyslexic', label: 'OpenDyslexic' },
] as const;

export function AccessibilitySettings({ accessibility, onUpdate, isUpdating }: AccessibilitySettingsProps) {
  // Use Zustand store for immediate UI updates
  const storeAccessibility = useSettingsStore((state) => state.settings.accessibility);
  const updateAccessibility = useSettingsStore((state) => state.updateAccessibility);

  // Use store values for display (more reliable than props)
  const currentAccessibility = storeAccessibility || accessibility;

  const handleChange = useCallback(
    <K extends keyof AccessibilitySettingsType>(key: K, value: AccessibilitySettingsType[K]) => {
      // Update Zustand store immediately
      updateAccessibility({ [key]: value });
      // Also update React Query cache
      onUpdate({ accessibility: { [key]: value } });
    },
    [updateAccessibility, onUpdate]
  );

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Reduced motion"
        description="Minimize animations and transitions"
      >
        <ToggleSwitch
          checked={currentAccessibility.reducedMotion}
          onChange={(v) => handleChange('reducedMotion', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="High contrast"
        description="Increase contrast for better visibility"
      >
        <ToggleSwitch
          checked={currentAccessibility.highContrast}
          onChange={(v) => handleChange('highContrast', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Large text"
        description="Increase text size throughout the app"
      >
        <ToggleSwitch
          checked={currentAccessibility.largeText}
          onChange={(v) => handleChange('largeText', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Screen reader optimized"
        description="Optimize experience for screen readers"
      >
        <ToggleSwitch
          checked={currentAccessibility.screenReaderOptimized}
          onChange={(v) => handleChange('screenReaderOptimized', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Reading font"
        description="Choose the font used across the app interface"
      >
        <Select
          value={currentAccessibility.fontPreference}
          onChange={(value) => handleChange('fontPreference', value as AccessibilitySettingsType['fontPreference'])}
          options={[...FONT_OPTIONS]}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
