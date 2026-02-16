'use client';

import { useCallback } from 'react';
import type { AccessibilitySettings as AccessibilitySettingsType, UserSettingsUpdate } from '@exprsn/shared';
import { SettingsRow, ToggleSwitch } from './SettingsSection';

interface AccessibilitySettingsProps {
  accessibility: AccessibilitySettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

export function AccessibilitySettings({ accessibility, onUpdate, isUpdating }: AccessibilitySettingsProps) {
  const handleChange = useCallback(
    <K extends keyof AccessibilitySettingsType>(key: K, value: AccessibilitySettingsType[K]) => {
      onUpdate({ accessibility: { [key]: value } });
    },
    [onUpdate]
  );

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Reduced motion"
        description="Minimize animations and transitions"
      >
        <ToggleSwitch
          checked={accessibility.reducedMotion}
          onChange={(v) => handleChange('reducedMotion', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="High contrast"
        description="Increase contrast for better visibility"
      >
        <ToggleSwitch
          checked={accessibility.highContrast}
          onChange={(v) => handleChange('highContrast', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Large text"
        description="Increase text size throughout the app"
      >
        <ToggleSwitch
          checked={accessibility.largeText}
          onChange={(v) => handleChange('largeText', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Screen reader optimized"
        description="Optimize experience for screen readers"
      >
        <ToggleSwitch
          checked={accessibility.screenReaderOptimized}
          onChange={(v) => handleChange('screenReaderOptimized', v)}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
