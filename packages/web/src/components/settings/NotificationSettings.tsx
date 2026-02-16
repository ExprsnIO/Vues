'use client';

import { useCallback } from 'react';
import type { NotificationSettings as NotificationSettingsType, UserSettingsUpdate } from '@exprsn/shared';
import { SettingsRow, ToggleSwitch, Select } from './SettingsSection';

interface NotificationSettingsProps {
  notifications: NotificationSettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

const EMAIL_DIGEST_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function NotificationSettings({ notifications, onUpdate, isUpdating }: NotificationSettingsProps) {
  const handleChange = useCallback(
    <K extends keyof NotificationSettingsType>(key: K, value: NotificationSettingsType[K]) => {
      onUpdate({ notifications: { [key]: value } });
    },
    [onUpdate]
  );

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Likes"
        description="When someone likes your content"
      >
        <ToggleSwitch
          checked={notifications.likes}
          onChange={(v) => handleChange('likes', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Comments"
        description="When someone comments on your content"
      >
        <ToggleSwitch
          checked={notifications.comments}
          onChange={(v) => handleChange('comments', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Follows"
        description="When someone follows you"
      >
        <ToggleSwitch
          checked={notifications.follows}
          onChange={(v) => handleChange('follows', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Mentions"
        description="When someone mentions you"
      >
        <ToggleSwitch
          checked={notifications.mentions}
          onChange={(v) => handleChange('mentions', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Direct messages"
        description="When you receive a direct message"
      >
        <ToggleSwitch
          checked={notifications.directMessages}
          onChange={(v) => handleChange('directMessages', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Email digest"
        description="Receive activity summaries via email"
      >
        <Select
          value={notifications.emailDigest}
          onChange={(v) => handleChange('emailDigest', v as NotificationSettingsType['emailDigest'])}
          options={EMAIL_DIGEST_OPTIONS}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
