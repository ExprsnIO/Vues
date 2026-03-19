'use client';

import { ConfigToggle } from './shared/ConfigToggle';
import { ConfigSelect } from './shared/ConfigSelect';
import { ConfigSlider } from './shared/ConfigSlider';

interface EdgeCdnTabProps {
  config: any;
  updateConfig: (updates: any) => void;
  disabled?: boolean;
}

export function EdgeCdnTab({ config, updateConfig, disabled }: EdgeCdnTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Edge Configuration</h3>
        <ConfigToggle
          label="Enable Edge Caching"
          description="Replicate cached content to edge nodes for lower latency"
          checked={config.edge.enabled}
          onChange={(v) => updateConfig({ edge: { enabled: v } })}
          disabled={disabled}
        />
        {config.edge.enabled && (
          <>
            <ConfigSelect
              label="Replication Mode"
              description="How content is distributed to edge nodes"
              value={config.edge.replicationMode}
              options={[
                { value: 'push', label: 'Push — Origin pushes to edges' },
                { value: 'pull', label: 'Pull — Edges fetch on demand' },
                { value: 'hybrid', label: 'Hybrid — Push hot, pull warm/cold' },
              ]}
              onChange={(v) => updateConfig({ edge: { replicationMode: v } })}
              disabled={disabled}
            />
            <ConfigSelect
              label="Consistency Model"
              value={config.edge.consistency}
              options={[
                { value: 'eventual', label: 'Eventual Consistency' },
                { value: 'strong', label: 'Strong Consistency' },
              ]}
              onChange={(v) => updateConfig({ edge: { consistency: v } })}
              disabled={disabled}
            />
            <ConfigSlider
              label="Sync Interval"
              description="How often edges sync with origin"
              value={config.edge.syncIntervalMs}
              min={1000} max={3600000} step={1000}
              formatValue={(v) => v >= 60000 ? `${(v / 60000).toFixed(0)}m` : `${(v / 1000).toFixed(0)}s`}
              onChange={(v) => updateConfig({ edge: { syncIntervalMs: v } })}
              disabled={disabled}
            />
          </>
        )}
      </div>

      {/* Edge nodes (static in v1) */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Edge Nodes</h3>
        <div className="text-center py-8 text-text-muted">
          <p className="text-sm">No edge nodes configured</p>
          <p className="text-xs mt-1">Edge node management will be available in a future release</p>
        </div>
      </div>
    </div>
  );
}
