'use client';

import type { LayoutSettings as LayoutSettingsType, UserSettingsUpdate, CommentsPosition } from '@exprsn/shared';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

interface LayoutSettingsProps {
  layout: LayoutSettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

export function LayoutSettings({ layout, onUpdate, isUpdating }: LayoutSettingsProps) {
  // Use Zustand store for immediate UI updates
  const storeLayout = useSettingsStore((state) => state.settings.layout);
  const setSettings = useSettingsStore((state) => state.settings);

  // Use store values for display (more reliable than props)
  const currentLayout = storeLayout || layout;

  const handleCommentsPositionChange = (position: CommentsPosition) => {
    // Update local store immediately for UI responsiveness
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        layout: { ...state.settings.layout, commentsPosition: position },
        updatedAt: new Date().toISOString(),
      },
    }));
    // Sync to server
    onUpdate({ layout: { commentsPosition: position } });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Comments Position
        </label>
        <p className="text-xs text-text-muted mb-3">
          Choose where comments appear on video pages
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleCommentsPositionChange('side')}
            disabled={isUpdating}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
              currentLayout.commentsPosition === 'side'
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-text-muted'
            )}
          >
            <SideLayoutIcon className="w-12 h-8" />
            <span className="text-xs font-medium text-text-primary">Side</span>
          </button>
          <button
            onClick={() => handleCommentsPositionChange('bottom')}
            disabled={isUpdating}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
              currentLayout.commentsPosition === 'bottom'
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-text-muted'
            )}
          >
            <BottomLayoutIcon className="w-12 h-8" />
            <span className="text-xs font-medium text-text-primary">Bottom</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SideLayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" fill="none">
      {/* Video area */}
      <rect x="2" y="2" width="28" height="28" rx="2" className="fill-surface stroke-text-muted" strokeWidth="1.5" />
      {/* Comments panel on side */}
      <rect x="32" y="2" width="14" height="28" rx="2" className="fill-accent/30 stroke-accent" strokeWidth="1.5" />
      {/* Comment lines */}
      <line x1="34" y1="6" x2="44" y2="6" className="stroke-accent" strokeWidth="1" />
      <line x1="34" y1="10" x2="42" y2="10" className="stroke-accent" strokeWidth="1" />
      <line x1="34" y1="14" x2="44" y2="14" className="stroke-accent" strokeWidth="1" />
      <line x1="34" y1="18" x2="40" y2="18" className="stroke-accent" strokeWidth="1" />
    </svg>
  );
}

function BottomLayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" fill="none">
      {/* Video area */}
      <rect x="2" y="2" width="44" height="16" rx="2" className="fill-surface stroke-text-muted" strokeWidth="1.5" />
      {/* Comments panel on bottom */}
      <rect x="2" y="20" width="44" height="10" rx="2" className="fill-accent/30 stroke-accent" strokeWidth="1.5" />
      {/* Comment lines */}
      <line x1="6" y1="24" x2="20" y2="24" className="stroke-accent" strokeWidth="1" />
      <line x1="6" y1="27" x2="16" y2="27" className="stroke-accent" strokeWidth="1" />
      <line x1="26" y1="24" x2="42" y2="24" className="stroke-accent" strokeWidth="1" />
      <line x1="26" y1="27" x2="38" y2="27" className="stroke-accent" strokeWidth="1" />
    </svg>
  );
}
