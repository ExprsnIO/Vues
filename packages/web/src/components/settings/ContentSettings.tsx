'use client';

import { useCallback } from 'react';
import type { ContentSettings as ContentSettingsType, UserSettingsUpdate } from '@exprsn/shared';
import { SettingsRow, ToggleSwitch, Select } from './SettingsSection';
import { useSettingsStore } from '@/stores/settings-store';

interface ContentSettingsProps {
  content: ContentSettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
];

export function ContentSettings({ content, onUpdate, isUpdating }: ContentSettingsProps) {
  // Use Zustand store for immediate UI updates
  const storeContent = useSettingsStore((state) => state.settings.content);
  const updateContent = useSettingsStore((state) => state.updateContent);

  // Use store values for display (more reliable than props)
  const currentContent = storeContent || content;

  const handleChange = useCallback(
    <K extends keyof ContentSettingsType>(key: K, value: ContentSettingsType[K]) => {
      // Update Zustand store immediately
      updateContent({ [key]: value });
      // Also update React Query cache
      onUpdate({ content: { [key]: value } });
    },
    [updateContent, onUpdate]
  );

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Preferred language"
        description="Language for content recommendations"
      >
        <Select
          value={currentContent.language}
          onChange={(v) => handleChange('language', v)}
          options={LANGUAGE_OPTIONS}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Content warnings"
        description="Show warnings for sensitive content"
      >
        <ToggleSwitch
          checked={currentContent.contentWarnings}
          onChange={(v) => handleChange('contentWarnings', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Sensitive content"
        description="Show content that may be sensitive"
      >
        <ToggleSwitch
          checked={currentContent.sensitiveContent}
          onChange={(v) => handleChange('sensitiveContent', v)}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
