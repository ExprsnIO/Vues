'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { PlaybackSettings } from '@/components/settings/PlaybackSettings';
import { PrivacySettings } from '@/components/settings/PrivacySettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { AccessibilitySettings } from '@/components/settings/AccessibilitySettings';
import { ContentSettings } from '@/components/settings/ContentSettings';
import { LayoutSettings } from '@/components/settings/LayoutSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { TokensSettings } from '@/components/settings/TokensSettings';
import { EditorSettings } from '@/components/settings/EditorSettings';
import { BlockedMutedSettings } from '@/components/settings/BlockedMutedSettings';
import { OrganizationsSettings } from '@/components/settings/OrganizationsSettings';
import type { UserSettings, UserSettingsUpdate } from '@exprsn/shared';
import { DEFAULT_SETTINGS } from '@exprsn/shared';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/Sidebar';

type SettingsTab =
  | 'appearance'
  | 'playback'
  | 'privacy'
  | 'notifications'
  | 'accessibility'
  | 'content'
  | 'editor'
  | 'organizations'
  | 'security'
  | 'tokens'
  | 'blocked'
  | 'account';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'playback', label: 'Playback', icon: PlayIcon },
  { id: 'privacy', label: 'Privacy', icon: ShieldIcon },
  { id: 'notifications', label: 'Notifications', icon: BellIcon },
  { id: 'accessibility', label: 'Accessibility', icon: AccessibilityIcon },
  { id: 'content', label: 'Content', icon: FilterIcon },
  { id: 'editor', label: 'Editor Presets', icon: WandIcon },
  { id: 'organizations', label: 'Organizations', icon: OrgIcon },
  { id: 'security', label: 'Security', icon: LockIcon },
  { id: 'tokens', label: 'Access Tokens', icon: KeyIcon },
  { id: 'blocked', label: 'Blocked & Muted', icon: BanIcon },
  { id: 'account', label: 'Account', icon: UserIcon },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          layout: update.layout
            ? { ...previousSettings.settings.layout, ...update.layout }
            : previousSettings.settings.layout,
          editor: update.editor
            ? { ...previousSettings.settings.editor, ...update.editor }
            : previousSettings.settings.editor,
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

  // Merge with defaults to ensure all fields exist
  const settings: UserSettings | undefined = settingsData?.settings
    ? {
        ...DEFAULT_SETTINGS,
        ...settingsData.settings,
        accessibility: { ...DEFAULT_SETTINGS.accessibility, ...settingsData.settings.accessibility },
        playback: { ...DEFAULT_SETTINGS.playback, ...settingsData.settings.playback },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...settingsData.settings.notifications },
        privacy: { ...DEFAULT_SETTINGS.privacy, ...settingsData.settings.privacy },
        content: { ...DEFAULT_SETTINGS.content, ...settingsData.settings.content },
        layout: { ...DEFAULT_SETTINGS.layout, ...settingsData.settings.layout },
        editor: { ...DEFAULT_SETTINGS.editor, ...settingsData.settings.editor },
      }
    : undefined;

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    router.replace('/login');
    return null;
  }

  const renderTabContent = () => {
    if (isLoading || !settings) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    switch (activeTab) {
      case 'appearance':
        return (
          <>
            <SettingsSection title="Theme" description="Customize how Exprsn looks">
              <ThemeSettings
                themeId={settings.themeId}
                colorMode={settings.colorMode}
                onUpdate={handleSettingsUpdate}
                isUpdating={updateSettingsMutation.isPending}
              />
            </SettingsSection>
            <SettingsSection title="Layout" description="Customize page layouts">
              <LayoutSettings
                layout={settings.layout}
                onUpdate={handleSettingsUpdate}
                isUpdating={updateSettingsMutation.isPending}
              />
            </SettingsSection>
          </>
        );
      case 'playback':
        return (
          <SettingsSection title="Playback" description="Control video playback behavior">
            <PlaybackSettings
              playback={settings.playback}
              onUpdate={handleSettingsUpdate}
              isUpdating={updateSettingsMutation.isPending}
            />
          </SettingsSection>
        );
      case 'privacy':
        return (
          <SettingsSection title="Privacy" description="Control who can interact with you">
            <PrivacySettings
              privacy={settings.privacy}
              onUpdate={handleSettingsUpdate}
              isUpdating={updateSettingsMutation.isPending}
            />
          </SettingsSection>
        );
      case 'notifications':
        return (
          <SettingsSection title="Notifications" description="Choose what notifications you receive">
            <NotificationSettings
              notifications={settings.notifications}
              onUpdate={handleSettingsUpdate}
              isUpdating={updateSettingsMutation.isPending}
            />
          </SettingsSection>
        );
      case 'accessibility':
        return (
          <SettingsSection title="Accessibility" description="Make Exprsn easier to use">
            <AccessibilitySettings
              accessibility={settings.accessibility}
              onUpdate={handleSettingsUpdate}
              isUpdating={updateSettingsMutation.isPending}
            />
          </SettingsSection>
        );
      case 'content':
        return (
          <SettingsSection title="Content" description="Content preferences and filters">
            <ContentSettings
              content={settings.content}
              onUpdate={handleSettingsUpdate}
              isUpdating={updateSettingsMutation.isPending}
            />
          </SettingsSection>
        );
      case 'editor':
        return (
          <SettingsSection title="Editor Presets" description="Manage your video effect presets">
            <EditorSettings
              editor={settings.editor}
              onUpdate={handleSettingsUpdate}
              isUpdating={updateSettingsMutation.isPending}
            />
          </SettingsSection>
        );
      case 'organizations':
        return <OrganizationsSettings onNavigateToOrg={(orgId) => console.log('Navigate to org:', orgId)} />;
      case 'security':
        return (
          <SettingsSection title="Security" description="Sessions and login activity">
            <SecuritySettings />
          </SettingsSection>
        );
      case 'tokens':
        return (
          <SettingsSection title="Access Tokens" description="Manage API keys and personal access tokens">
            <TokensSettings />
          </SettingsSection>
        );
      case 'blocked':
        return (
          <SettingsSection title="Blocked & Muted" description="Manage blocked and muted accounts">
            <BlockedMutedSettings />
          </SettingsSection>
        );
      case 'account':
        return (
          <SettingsSection title="Account" description="Data export and account management">
            <AccountSettings />
          </SettingsSection>
        );
      default:
        return null;
    }
  };

  const currentTab = SETTINGS_TABS.find(t => t.id === activeTab);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/"
              className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
              <p className="text-sm text-text-muted">Manage your account and preferences</p>
            </div>
          </div>

          {/* Mobile tab selector */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-surface rounded-lg"
            >
              <div className="flex items-center gap-3">
                {currentTab && <currentTab.icon className="w-5 h-5 text-accent" />}
                <span className="font-medium text-text-primary">{currentTab?.label}</span>
              </div>
              <ChevronDownIcon className={cn("w-5 h-5 text-text-muted transition-transform", mobileMenuOpen && "rotate-180")} />
            </button>

            {mobileMenuOpen && (
              <div className="mt-2 bg-surface rounded-lg border border-border overflow-hidden">
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                        activeTab === tab.id
                          ? "bg-accent/10 text-accent"
                          : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop layout with sidebar */}
          <div className="flex gap-6">
            {/* Settings sidebar - hidden on mobile */}
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <nav className="sticky top-6 bg-surface rounded-xl p-2 space-y-1">
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors",
                        activeTab === tab.id
                          ? "bg-accent text-text-inverse"
                          : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Main content area */}
            <div className="flex-1 min-w-0 space-y-4">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function AccessibilityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
    </svg>
  );
}

function WandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function BanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function OrgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}
