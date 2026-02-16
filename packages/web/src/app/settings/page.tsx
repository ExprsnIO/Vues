'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { PlaybackSettings } from '@/components/settings/PlaybackSettings';
import { PrivacySettings } from '@/components/settings/PrivacySettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { AccessibilitySettings } from '@/components/settings/AccessibilitySettings';
import { ContentSettings } from '@/components/settings/ContentSettings';
import type { UserSettings, UserSettingsUpdate } from '@exprsn/shared';

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: (update: UserSettingsUpdate) => api.updateSettings(update),
    onSuccess: (result) => {
      queryClient.setQueryData(['settings'], result);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetSettings(),
    onSuccess: (result) => {
      queryClient.setQueryData(['settings'], result);
    },
  });

  const handleUpdate = (update: UserSettingsUpdate) => {
    updateMutation.mutate(update);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Settings</h1>
        <p className="text-text-muted mb-6">
          Please log in to access your settings.
        </p>
        <a
          href="/login"
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg font-medium transition-colors"
        >
          Log in
        </a>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Settings</h1>
        <p className="text-text-muted mb-6">
          Failed to load settings. Please try again.
        </p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['settings'] })}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const settings = data?.settings;

  if (!settings) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <button
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          className="text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          {resetMutation.isPending ? 'Resetting...' : 'Reset to defaults'}
        </button>
      </div>

      <div className="space-y-6">
        <SettingsSection
          title="Appearance"
          description="Customize how Exprsn looks"
        >
          <ThemeSettings
            themeId={settings.themeId}
            colorMode={settings.colorMode}
            onUpdate={handleUpdate}
            isUpdating={updateMutation.isPending}
          />
        </SettingsSection>

        <SettingsSection
          title="Playback"
          description="Control video playback behavior"
        >
          <PlaybackSettings
            playback={settings.playback}
            onUpdate={handleUpdate}
            isUpdating={updateMutation.isPending}
          />
        </SettingsSection>

        <SettingsSection
          title="Privacy"
          description="Control who can interact with you"
        >
          <PrivacySettings
            privacy={settings.privacy}
            onUpdate={handleUpdate}
            isUpdating={updateMutation.isPending}
          />
        </SettingsSection>

        <SettingsSection
          title="Notifications"
          description="Choose what notifications you receive"
        >
          <NotificationSettings
            notifications={settings.notifications}
            onUpdate={handleUpdate}
            isUpdating={updateMutation.isPending}
          />
        </SettingsSection>

        <SettingsSection
          title="Accessibility"
          description="Make Exprsn easier to use"
        >
          <AccessibilitySettings
            accessibility={settings.accessibility}
            onUpdate={handleUpdate}
            isUpdating={updateMutation.isPending}
          />
        </SettingsSection>

        <SettingsSection
          title="Content"
          description="Content preferences and filters"
        >
          <ContentSettings
            content={settings.content}
            onUpdate={handleUpdate}
            isUpdating={updateMutation.isPending}
          />
        </SettingsSection>
      </div>

      {/* Last updated */}
      <p className="text-center text-text-muted text-sm mt-8">
        Last updated: {new Date(settings.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
