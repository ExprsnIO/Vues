'use client';

import { ConfigToggle } from './shared/ConfigToggle';
import { ConfigSlider } from './shared/ConfigSlider';

interface FederationTabProps {
  config: any;
  updateConfig: (updates: any) => void;
  disabled?: boolean;
}

export function FederationTab({ config, updateConfig, disabled }: FederationTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Federation Prefetch</h3>
        <ConfigToggle
          label="Federation-Aware Prefetch"
          description="Prefetch content from federated instances"
          checked={config.federation.prefetchEnabled}
          onChange={(v) => updateConfig({ federation: { prefetchEnabled: v } })}
          disabled={disabled}
        />
        <ConfigToggle
          label="Relay Subscriptions"
          description="Subscribe to relay firehose for proactive prefetching"
          checked={config.federation.relaySubscriptions}
          onChange={(v) => updateConfig({ federation: { relaySubscriptions: v } })}
          disabled={disabled}
        />
        <ConfigToggle
          label="Blob Sync"
          description="Pre-fetch media blobs from remote PDS instances"
          checked={config.federation.blobSync}
          onChange={(v) => updateConfig({ federation: { blobSync: v } })}
          disabled={disabled}
        />
        <ConfigSlider
          label="Remote PDS Cache TTL"
          description="How long to cache content from remote PDS instances"
          value={config.federation.remotePDSCacheTTL}
          min={60} max={86400} step={60}
          formatValue={(v) => v >= 3600 ? `${(v / 3600).toFixed(1)}h` : `${(v / 60).toFixed(0)}m`}
          onChange={(v) => updateConfig({ federation: { remotePDSCacheTTL: v } })}
          disabled={disabled}
        />
      </div>

      {/* Pipeline diagram */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Federation Pipeline</h3>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {[
            { label: 'Remote PDS', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
            { label: 'Relay', color: 'bg-accent/20 text-accent border-accent/30' },
            { label: 'Queue', color: 'bg-warning-muted text-warning border-warning/30' },
            { label: 'Cache', color: 'bg-success-muted text-success border-success/30' },
            { label: 'Edge', color: 'bg-error-muted text-error border-error/30' },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <span className={`px-3 py-1.5 text-xs rounded-lg border ${step.color}`}>
                {step.label}
              </span>
              {i < arr.length - 1 && (
                <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
