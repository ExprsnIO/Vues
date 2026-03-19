'use client';

import { useCallback } from 'react';
import type { NotificationSettings as NotificationSettingsType, UserSettingsUpdate } from '@exprsn/shared';
import { SettingsRow, ToggleSwitch, Select } from './SettingsSection';
import { useSettingsStore } from '@/stores/settings-store';
import { usePushNotifications } from '@/hooks/usePushNotifications';

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
  // Use Zustand store for immediate UI updates
  const storeNotifications = useSettingsStore((state) => state.settings.notifications);
  const updateNotifications = useSettingsStore((state) => state.updateNotifications);

  // Use store values for display (more reliable than props)
  const currentNotifications = storeNotifications || notifications;

  const { isSupported, permission, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  const handleChange = useCallback(
    <K extends keyof NotificationSettingsType>(key: K, value: NotificationSettingsType[K]) => {
      // Update Zustand store immediately
      updateNotifications({ [key]: value });
      // Also update React Query cache
      onUpdate({ notifications: { [key]: value } });
    },
    [updateNotifications, onUpdate]
  );

  const handlePushToggle = useCallback(async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [isSubscribed, subscribe, unsubscribe]);

  const renderPushControl = () => {
    if (!isSupported) {
      return (
        <span className="text-xs text-text-muted px-2 py-1 bg-surface-hover rounded-md">
          Not supported
        </span>
      );
    }
    if (permission === 'denied') {
      return (
        <span className="text-xs text-amber-500 px-2 py-1 bg-amber-500/10 rounded-md">
          Blocked in browser
        </span>
      );
    }
    return (
      <ToggleSwitch
        checked={isSubscribed}
        onChange={handlePushToggle}
        disabled={isUpdating}
      />
    );
  };

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Push notifications"
        description={
          permission === 'denied'
            ? 'Enable push notifications in your browser settings to use this feature'
            : 'Receive notifications even when the tab is closed'
        }
      >
        {renderPushControl()}
      </SettingsRow>

      <SettingsRow
        label="Likes"
        description="When someone likes your content"
      >
        <ToggleSwitch
          checked={currentNotifications.likes}
          onChange={(v) => handleChange('likes', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Comments"
        description="When someone comments on your content"
      >
        <ToggleSwitch
          checked={currentNotifications.comments}
          onChange={(v) => handleChange('comments', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Follows"
        description="When someone follows you"
      >
        <ToggleSwitch
          checked={currentNotifications.follows}
          onChange={(v) => handleChange('follows', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Mentions"
        description="When someone mentions you"
      >
        <ToggleSwitch
          checked={currentNotifications.mentions}
          onChange={(v) => handleChange('mentions', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Direct messages"
        description="When you receive a direct message"
      >
        <ToggleSwitch
          checked={currentNotifications.directMessages}
          onChange={(v) => handleChange('directMessages', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Email digest"
        description="Receive activity summaries via email"
      >
        <Select
          value={currentNotifications.emailDigest}
          onChange={(v) => handleChange('emailDigest', v as NotificationSettingsType['emailDigest'])}
          options={EMAIL_DIGEST_OPTIONS}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
