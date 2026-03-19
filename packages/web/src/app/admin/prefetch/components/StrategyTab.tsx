'use client';

import { ConfigSlider } from './shared/ConfigSlider';
import { ConfigToggle } from './shared/ConfigToggle';

interface StrategyTabProps {
  config: any;
  updateConfig: (updates: any) => void;
  disabled?: boolean;
}

export function StrategyTab({ config, updateConfig, disabled }: StrategyTabProps) {
  const strategies = [
    { value: 'activity', label: 'Activity-Based', description: 'Prefetch based on user activity patterns and recency' },
    { value: 'predictive', label: 'Predictive', description: 'ML-driven predictions of what users will view next' },
    { value: 'hybrid', label: 'Hybrid', description: 'Combines activity signals with predictive models' },
  ];

  return (
    <div className="space-y-6">
      {/* Strategy selector */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-secondary">Strategy Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {strategies.map((s) => (
            <button
              key={s.value}
              onClick={() => updateConfig({ strategy: { type: s.value } })}
              disabled={disabled}
              className={`text-left p-4 rounded-lg border transition-colors disabled:opacity-50 ${
                config.strategy.type === s.value
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-surface hover:border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full border-2 ${
                  config.strategy.type === s.value ? 'border-accent bg-accent' : 'border-text-muted'
                }`} />
                <span className="text-sm font-medium text-text-secondary">{s.label}</span>
              </div>
              <p className="text-xs text-text-muted mt-1 ml-5">{s.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Activity config */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Activity Tracking</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigSlider
            label="Check Interval"
            value={config.strategy.activity.checkIntervalMs}
            min={5000} max={600000} step={5000}
            formatValue={(v) => v >= 60000 ? `${(v / 60000).toFixed(0)}m` : `${(v / 1000).toFixed(0)}s`}
            onChange={(v) => updateConfig({ strategy: { activity: { checkIntervalMs: v } } })}
            disabled={disabled}
          />
          <ConfigSlider
            label="Inactivity Timeout"
            value={config.strategy.activity.inactivityTimeoutMs}
            min={30000} max={3600000} step={30000}
            formatValue={(v) => v >= 60000 ? `${(v / 60000).toFixed(0)}m` : `${(v / 1000).toFixed(0)}s`}
            onChange={(v) => updateConfig({ strategy: { activity: { inactivityTimeoutMs: v } } })}
            disabled={disabled}
          />
        </div>
        <ConfigSlider
          label="Fetch Limit"
          description="Max items to prefetch per user"
          value={config.strategy.activity.fetchLimit}
          min={1} max={200}
          onChange={(v) => updateConfig({ strategy: { activity: { fetchLimit: v } } })}
          disabled={disabled}
        />
      </div>

      {/* Priority buckets */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Priority Buckets</h3>
        <p className="text-xs text-text-muted">Distribute active users across priority levels</p>
        <div className="grid grid-cols-3 gap-4">
          {(['high', 'medium', 'low'] as const).map((bucket) => (
            <div key={bucket} className="space-y-1">
              <label className="text-xs font-medium text-text-muted capitalize">{bucket}</label>
              <input
                type="number"
                value={config.strategy.priorityBuckets[bucket]}
                onChange={(e) => updateConfig({ strategy: { priorityBuckets: { [bucket]: parseInt(e.target.value) || 0 } } })}
                disabled={disabled}
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Adaptive */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <ConfigToggle
          label="Adaptive Intelligence"
          description="Automatically adjust prefetch parameters based on real-time performance"
          checked={config.strategy.adaptiveEnabled}
          onChange={(v) => updateConfig({ strategy: { adaptiveEnabled: v } })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
