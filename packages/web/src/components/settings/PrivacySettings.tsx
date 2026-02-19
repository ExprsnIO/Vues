'use client';

import { useCallback } from 'react';
import type { PrivacySettings as PrivacySettingsType, UserSettingsUpdate } from '@exprsn/shared';
import { SettingsRow, ToggleSwitch, Select } from './SettingsSection';

interface PrivacySettingsProps {
  privacy: PrivacySettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

const PERMISSION_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'following', label: 'Following only' },
  { value: 'none', label: 'No one' },
];

export function PrivacySettings({ privacy, onUpdate, isUpdating }: PrivacySettingsProps) {
  const handleChange = useCallback(
    <K extends keyof PrivacySettingsType>(key: K, value: PrivacySettingsType[K]) => {
      onUpdate({ privacy: { [key]: value } });
    },
    [onUpdate]
  );

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Private account"
        description="Only approved followers can see your content"
      >
        <ToggleSwitch
          checked={privacy.privateAccount}
          onChange={(v) => handleChange('privateAccount', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Show activity status"
        description="Let others see when you're active"
      >
        <ToggleSwitch
          checked={privacy.showActivityStatus}
          onChange={(v) => handleChange('showActivityStatus', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Allow collabs"
        description="Let others create side-by-side videos with yours"
      >
        <ToggleSwitch
          checked={privacy.allowDuets}
          onChange={(v) => handleChange('allowDuets', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Allow loops"
        description="Let others use clips from your videos"
      >
        <ToggleSwitch
          checked={privacy.allowStitches}
          onChange={(v) => handleChange('allowStitches', v)}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Who can comment"
        description="Control who can comment on your videos"
      >
        <Select
          value={privacy.allowComments}
          onChange={(v) => handleChange('allowComments', v as PrivacySettingsType['allowComments'])}
          options={PERMISSION_OPTIONS}
          disabled={isUpdating}
        />
      </SettingsRow>

      <SettingsRow
        label="Who can message"
        description="Control who can send you direct messages"
      >
        <Select
          value={privacy.allowMessages}
          onChange={(v) => handleChange('allowMessages', v as PrivacySettingsType['allowMessages'])}
          options={PERMISSION_OPTIONS}
          disabled={isUpdating}
        />
      </SettingsRow>
    </div>
  );
}
