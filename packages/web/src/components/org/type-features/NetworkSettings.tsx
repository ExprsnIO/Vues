'use client';

import { useState } from 'react';

interface NetworkSettingsProps {
  organizationId: string;
  enabledFeatures: string[];
  userPermissions: string[];
}

export function NetworkSettings({
  organizationId,
  enabledFeatures,
  userPermissions,
}: NetworkSettingsProps) {
  const [activeTab, setActiveTab] = useState<'channels' | 'talent' | 'analytics'>('channels');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg w-fit">
        {(['channels', 'talent', 'analytics'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'channels' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Network Channels</h3>
            <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
              Add Channel
            </button>
          </div>
          <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
            Channel management coming soon.
          </div>
        </div>
      )}

      {activeTab === 'talent' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Talent Roster</h3>
            <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
              Add Talent
            </button>
          </div>
          <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
            Talent coordination coming soon.
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Network Analytics</h3>
          <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
            Network analytics coming soon.
          </div>
        </div>
      )}
    </div>
  );
}
