'use client';

import { Collapsible } from './shared/Collapsible';
import { ConfigSlider } from './shared/ConfigSlider';
import { ConfigToggle } from './shared/ConfigToggle';
import { ConfigSelect } from './shared/ConfigSelect';

interface CacheTiersTabProps {
  config: any;
  updateConfig: (updates: any) => void;
  disabled?: boolean;
}

export function CacheTiersTab({ config, updateConfig, disabled }: CacheTiersTabProps) {
  const updateTier = (tier: string, field: string, value: number) => {
    updateConfig({
      cache: {
        tiers: {
          [tier]: { [field]: value },
        },
      },
    });
  };

  const tiers = [
    { key: 'hot', label: 'Hot Tier', description: 'Active users, highest priority', color: 'border-l-error' },
    { key: 'warm', label: 'Warm Tier', description: 'Medium activity users', color: 'border-l-warning' },
    { key: 'cold', label: 'Cold Tier', description: 'Fallback, longest TTL', color: 'border-l-accent' },
  ];

  return (
    <div className="space-y-6">
      {/* Tier configs */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Cache Tiers</h3>
        {tiers.map((tier) => (
          <Collapsible key={tier.key} title={tier.label} defaultOpen={tier.key === 'hot'} className={`border-l-2 ${tier.color}`}>
            <p className="text-xs text-text-muted mb-3">{tier.description}</p>
            <div className="space-y-4">
              <ConfigSlider
                label="TTL"
                value={config.cache.tiers[tier.key].ttlMs}
                min={10000}
                max={tier.key === 'cold' ? 86400000 : tier.key === 'warm' ? 3600000 : 600000}
                step={10000}
                onChange={(v) => updateTier(tier.key, 'ttlMs', v)}
                disabled={disabled}
                formatValue={(v) => v >= 60000 ? `${(v / 60000).toFixed(0)}m` : `${(v / 1000).toFixed(0)}s`}
              />
              <ConfigSlider
                label="Max Keys"
                value={config.cache.tiers[tier.key].maxKeys}
                min={1000}
                max={tier.key === 'cold' ? 10000000 : tier.key === 'warm' ? 1000000 : 200000}
                step={1000}
                onChange={(v) => updateTier(tier.key, 'maxKeys', v)}
                disabled={disabled}
                formatValue={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`}
              />
            </div>
          </Collapsible>
        ))}
      </div>

      {/* Cache policies */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Cache Policies</h3>
        <ConfigSelect
          label="Eviction Policy"
          description="Algorithm for removing items when cache is full"
          value={config.cache.evictionPolicy}
          options={[
            { value: 'lru', label: 'LRU (Least Recently Used)' },
            { value: 'lfu', label: 'LFU (Least Frequently Used)' },
            { value: 'ttl', label: 'TTL (Time-based)' },
          ]}
          onChange={(v) => updateConfig({ cache: { evictionPolicy: v } })}
          disabled={disabled}
        />
        <ConfigToggle
          label="Auto-promotion"
          description="Automatically promote items to hot tier on cache hit in lower tiers"
          checked={config.cache.autoPromotion}
          onChange={(v) => updateConfig({ cache: { autoPromotion: v } })}
          disabled={disabled}
        />
        <ConfigToggle
          label="Compression"
          description="Compress cached values above threshold size"
          checked={config.cache.compression.enabled}
          onChange={(v) => updateConfig({ cache: { compression: { enabled: v } } })}
          disabled={disabled}
        />
        {config.cache.compression.enabled && (
          <ConfigSlider
            label="Compression Threshold"
            description="Minimum size in bytes before compressing"
            value={config.cache.compression.threshold}
            min={256}
            max={65536}
            step={256}
            unit=" bytes"
            onChange={(v) => updateConfig({ cache: { compression: { threshold: v } } })}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
