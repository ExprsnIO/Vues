'use client';

import { useCallback } from 'react';
import type { PlaybackSettings as PlaybackSettingsType, UserSettingsUpdate } from '@exprsn/shared';
import { SettingsRow, ToggleSwitch, Select } from './SettingsSection';
import { useSettingsStore } from '@/stores/settings-store';

interface PlaybackSettingsProps {
  playback: PlaybackSettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

const QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
];

export function PlaybackSettings({ playback, onUpdate, isUpdating }: PlaybackSettingsProps) {
  // Use Zustand store for immediate UI updates
  const storePlayback = useSettingsStore((state) => state.settings.playback);
  const updatePlayback = useSettingsStore((state) => state.updatePlayback);

  // Use store values for display (more reliable than props)
  const currentPlayback = storePlayback || playback;

  const handleChange = useCallback(
    <K extends keyof PlaybackSettingsType>(key: K, value: PlaybackSettingsType[K]) => {
      // Update Zustand store immediately
      updatePlayback({ [key]: value });
      // Also update React Query cache
      onUpdate({ playback: { [key]: value } });
    },
    [updatePlayback, onUpdate]
  );

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Autoplay videos"
        description="Automatically play videos when scrolling"
      >
        <ToggleSwitch
          checked={currentPlayback.autoplay}
          onChange={(v) => handleChange('autoplay', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Loop videos"
        description="Replay videos when they end"
      >
        <ToggleSwitch
          checked={currentPlayback.loopVideos}
          onChange={(v) => handleChange('loopVideos', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Default muted"
        description="Start videos muted"
      >
        <ToggleSwitch
          checked={currentPlayback.defaultMuted}
          onChange={(v) => handleChange('defaultMuted', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Data saver"
        description="Reduce data usage on mobile networks"
      >
        <ToggleSwitch
          checked={currentPlayback.dataSaver}
          onChange={(v) => handleChange('dataSaver', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Default quality"
        description="Video quality when not using data saver"
      >
        <Select
          value={currentPlayback.defaultQuality}
          onChange={(v) => handleChange('defaultQuality', v as PlaybackSettingsType['defaultQuality'])}
          options={QUALITY_OPTIONS}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
