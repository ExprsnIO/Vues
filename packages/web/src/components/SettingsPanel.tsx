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
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    enabled: !!user,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (update: UserSettingsUpdate) => api.updateSettings(update),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] });
      const previousSettings = queryClient.getQueryData<{ settings: UserSettings }>(['settings']);

      if (previousSettings) {
        const newSettings: UserSettings = {
          ...previousSettings.settings,
          themeId: update.themeId ?? previousSettings.settings.themeId,
          colorMode: update.colorMode ?? previousSettings.settings.colorMode,
          playback: update.playback
            ? { ...previousSettings.settings.playback, ...update.playback }
            : previousSettings.settings.playback,
          privacy: update.privacy
            ? { ...previousSettings.settings.privacy, ...update.privacy }
            : previousSettings.settings.privacy,
          notifications: update.notifications
            ? { ...previousSettings.settings.notifications, ...update.notifications }
            : previousSettings.settings.notifications,
          accessibility: update.accessibility
            ? { ...previousSettings.settings.accessibility, ...update.accessibility }
            : previousSettings.settings.accessibility,
          content: update.content
            ? { ...previousSettings.settings.content, ...update.content }
            : previousSettings.settings.content,
        };
        queryClient.setQueryData<{ settings: UserSettings }>(['settings'], { settings: newSettings });
      }

      return { previousSettings };
    },
    onError: (_err, _update, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(['settings'], context.previousSettings);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const handleSettingsUpdate = (update: UserSettingsUpdate) => {
    updateSettingsMutation.mutate(update);
  };

  const settings = settingsData?.settings;

  if (!user) return null;

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 h-screen w-80 bg-background border-r border-border flex flex-col z-50 overflow-y-auto',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0 lg:translate-x-60' : '-translate-x-full lg:-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background p-4 border-b border-border flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {isLoading || !settings ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <SettingsSection
                title="Appearance"
                description="Customize how Exprsn looks"
              >
                <ThemeSettings
                  themeId={settings.themeId}
                  colorMode={settings.colorMode}
                  onUpdate={handleSettingsUpdate}
                  isUpdating={updateSettingsMutation.isPending}
                />
              </SettingsSection>

              <SettingsSection
                title="Playback"
                description="Control video playback behavior"
              >
                <PlaybackSettings
                  playback={settings.playback}
                  onUpdate={handleSettingsUpdate}
                  isUpdating={updateSettingsMutation.isPending}
                />
              </SettingsSection>

              <SettingsSection
                title="Privacy"
                description="Control who can interact with you"
              >
                <PrivacySettings
                  privacy={settings.privacy}
                  onUpdate={handleSettingsUpdate}
                  isUpdating={updateSettingsMutation.isPending}
                />
              </SettingsSection>

              <SettingsSection
                title="Notifications"
                description="Choose what notifications you receive"
              >
                <NotificationSettings
                  notifications={settings.notifications}
                  onUpdate={handleSettingsUpdate}
                  isUpdating={updateSettingsMutation.isPending}
                />
              </SettingsSection>

              <SettingsSection
                title="Accessibility"
                description="Make Exprsn easier to use"
              >
                <AccessibilitySettings
                  accessibility={settings.accessibility}
                  onUpdate={handleSettingsUpdate}
                  isUpdating={updateSettingsMutation.isPending}
                />
              </SettingsSection>

              <SettingsSection
                title="Content"
                description="Content preferences and filters"
              >
                <ContentSettings
                  content={settings.content}
                  onUpdate={handleSettingsUpdate}
                  isUpdating={updateSettingsMutation.isPending}
                />
              </SettingsSection>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
