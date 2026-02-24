'use client';

import { useState } from 'react';

interface NonprofitSettingsProps {
  organizationId: string;
  enabledFeatures: string[];
  userPermissions: string[];
}

export function NonprofitSettings({
  organizationId,
  enabledFeatures,
  userPermissions,
}: NonprofitSettingsProps) {
  const [activeTab, setActiveTab] = useState<'donors' | 'grants' | 'volunteers'>('donors');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg w-fit">
        {(['donors', 'grants', 'volunteers'] as const).map((tab) => (
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

      {activeTab === 'donors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Donor Management</h3>
            <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
              Add Donor
            </button>
          </div>
          <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
            Donor management coming soon.
          </div>
        </div>
      )}

      {activeTab === 'grants' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Grant Tracking</h3>
            <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
              Add Grant
            </button>
          </div>
          <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
            Grant tracking coming soon.
          </div>
        </div>
      )}

      {activeTab === 'volunteers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Volunteer Coordination</h3>
            <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
              Add Volunteer
            </button>
          </div>
          <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
            Volunteer coordination coming soon.
          </div>
        </div>
      )}
    </div>
  );
}
