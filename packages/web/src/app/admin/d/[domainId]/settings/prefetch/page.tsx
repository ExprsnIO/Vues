'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { api } from '@/lib/api';

interface DomainPrefetchConfig {
  overrides: {
    enabled?: boolean;
    cache?: {
      tiers?: {
        hot?: { ttlMs?: number; maxKeys?: number };
        warm?: { ttlMs?: number; maxKeys?: number };
        cold?: { ttlMs?: number; maxKeys?: number };
      };
      evictionPolicy?: string;
    };
    queue?: {
      rateLimit?: number;
      batchSize?: number;
    };
    strategy?: {
      type?: string;
      adaptiveEnabled?: boolean;
    };
    federation?: {
      prefetchEnabled?: boolean;
      remotePDSCacheTTL?: number;
    };
  };
  inheritedFrom: 'global';
}

export default function DomainPrefetchSettingsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  // Fetch global config
  const { data: globalData } = useQuery({
    queryKey: ['admin', 'prefetch', 'config'],
    queryFn: () => api.get<{ config: any }>('/xrpc/io.exprsn.admin.prefetch.config'),
  });

  // Fetch domain-specific overrides
  const { data: domainData, isLoading } = useQuery({
    queryKey: ['admin', 'prefetch', 'config', 'domain', domainId],
    queryFn: () => api.get<{ config: any; hasOverrides: boolean }>(
      `/xrpc/io.exprsn.admin.prefetch.config.domain?domainId=${domainId}`
    ),
    enabled: !!domainId,
  });

  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (domainData?.config) {
      setOverrides(domainData.config);
    }
  }, [domainData]);

  const saveMutation = useMutation({
    mutationFn: (config: any) =>
      api.post('/xrpc/io.exprsn.admin.prefetch.config.domain', { domainId, config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'config', 'domain', domainId] });
      setIsDirty(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      api.post('/xrpc/io.exprsn.admin.prefetch.config.domain.reset', { domainId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'config', 'domain', domainId] });
      setOverrides({});
      setIsDirty(false);
    },
  });

  const globalConfig = globalData?.config || {};
  const hasOverrides = domainData?.hasOverrides || Object.keys(overrides).length > 0;

  const updateOverride = (path: string, value: any) => {
    const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    setOverrides(prev => {
      const keys = path.split('.');
      if (keys.some(k => UNSAFE_KEYS.has(k))) return prev;
      const result = { ...prev };
      let current: any = result;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...(current[keys[i]] || {}) };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return result;
    });
    setIsDirty(true);
  };

  const removeOverride = (path: string) => {
    const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    setOverrides(prev => {
      const keys = path.split('.');
      if (keys.some(k => UNSAFE_KEYS.has(k))) return prev;
      const result = JSON.parse(JSON.stringify(prev));
      let current: any = result;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) return result;
        current = current[keys[i]];
      }
      delete current[keys[keys.length - 1]];
      return result;
    });
    setIsDirty(true);
  };

  const getEffectiveValue = (path: string) => {
    const keys = path.split('.');
    let override: any = overrides;
    let global: any = globalConfig;
    for (const key of keys) {
      override = override?.[key];
      global = global?.[key];
    }
    return { value: override ?? global, isOverridden: override !== undefined };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Prefetch Configuration</h1>
          <p className="text-sm text-text-muted mt-1">
            Domain-specific prefetch overrides. Unset values inherit from global config.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasOverrides && (
            <button
              onClick={() => resetMutation.mutate()}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
            >
              Reset to Global
            </button>
          )}
          {isDirty && (
            <button
              onClick={() => saveMutation.mutate(overrides)}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Overrides'}
            </button>
          )}
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded-lg p-3 text-sm border ${
        hasOverrides
          ? 'bg-accent/5 border-accent/20 text-accent'
          : 'bg-surface border-border text-text-muted'
      }`}>
        {hasOverrides
          ? 'This domain has custom prefetch overrides. Unset values inherit from the global configuration.'
          : 'This domain inherits all prefetch settings from the global configuration.'}
      </div>

      {/* Override sections */}
      <div className="space-y-4">
        {/* Enable/Disable */}
        <OverrideCard
          title="Engine Status"
          description="Override the global enable/disable switch for this domain"
        >
          <OverrideToggle
            label="Prefetch Enabled"
            path="enabled"
            globalValue={globalConfig.enabled}
            overrideValue={overrides.enabled}
            onOverride={(v) => updateOverride('enabled', v)}
            onReset={() => removeOverride('enabled')}
          />
        </OverrideCard>

        {/* Cache */}
        <OverrideCard title="Cache Tiers" description="Override TTL and capacity per tier">
          {(['hot', 'warm', 'cold'] as const).map(tier => (
            <div key={tier} className="space-y-2 pt-2 first:pt-0">
              <h4 className="text-xs font-medium text-text-muted uppercase">{tier} tier</h4>
              <OverrideSlider
                label="TTL"
                path={`cache.tiers.${tier}.ttlMs`}
                globalValue={globalConfig.cache?.tiers?.[tier]?.ttlMs || 300000}
                overrideValue={overrides.cache?.tiers?.[tier]?.ttlMs}
                min={10000} max={tier === 'cold' ? 86400000 : tier === 'warm' ? 3600000 : 600000}
                step={10000}
                formatValue={(v: number) => v >= 60000 ? `${(v / 60000).toFixed(0)}m` : `${(v / 1000).toFixed(0)}s`}
                onOverride={(v) => updateOverride(`cache.tiers.${tier}.ttlMs`, v)}
                onReset={() => removeOverride(`cache.tiers.${tier}.ttlMs`)}
              />
              <OverrideSlider
                label="Max Keys"
                path={`cache.tiers.${tier}.maxKeys`}
                globalValue={globalConfig.cache?.tiers?.[tier]?.maxKeys || 50000}
                overrideValue={overrides.cache?.tiers?.[tier]?.maxKeys}
                min={1000} max={10000000} step={1000}
                formatValue={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`}
                onOverride={(v) => updateOverride(`cache.tiers.${tier}.maxKeys`, v)}
                onReset={() => removeOverride(`cache.tiers.${tier}.maxKeys`)}
              />
            </div>
          ))}
        </OverrideCard>

        {/* Queue */}
        <OverrideCard title="Queue & Throughput" description="Override queue rate limits">
          <OverrideSlider
            label="Rate Limit"
            path="queue.rateLimit"
            globalValue={globalConfig.queue?.rateLimit || 1000}
            overrideValue={overrides.queue?.rateLimit}
            min={1} max={10000} step={10} unit="/s"
            onOverride={(v) => updateOverride('queue.rateLimit', v)}
            onReset={() => removeOverride('queue.rateLimit')}
          />
          <OverrideSlider
            label="Batch Size"
            path="queue.batchSize"
            globalValue={globalConfig.queue?.batchSize || 100}
            overrideValue={overrides.queue?.batchSize}
            min={1} max={1000} step={5}
            onOverride={(v) => updateOverride('queue.batchSize', v)}
            onReset={() => removeOverride('queue.batchSize')}
          />
        </OverrideCard>

        {/* Strategy */}
        <OverrideCard title="Strategy" description="Override prefetch strategy for this domain">
          <OverrideSelect
            label="Strategy Type"
            path="strategy.type"
            globalValue={globalConfig.strategy?.type || 'activity'}
            overrideValue={overrides.strategy?.type}
            options={[
              { value: 'activity', label: 'Activity-Based' },
              { value: 'predictive', label: 'Predictive' },
              { value: 'hybrid', label: 'Hybrid' },
            ]}
            onOverride={(v) => updateOverride('strategy.type', v)}
            onReset={() => removeOverride('strategy.type')}
          />
          <OverrideToggle
            label="Adaptive Intelligence"
            path="strategy.adaptiveEnabled"
            globalValue={globalConfig.strategy?.adaptiveEnabled || false}
            overrideValue={overrides.strategy?.adaptiveEnabled}
            onOverride={(v) => updateOverride('strategy.adaptiveEnabled', v)}
            onReset={() => removeOverride('strategy.adaptiveEnabled')}
          />
        </OverrideCard>

        {/* Federation */}
        <OverrideCard title="Federation" description="Override federation prefetch for this domain">
          <OverrideToggle
            label="Federation-Aware Prefetch"
            path="federation.prefetchEnabled"
            globalValue={globalConfig.federation?.prefetchEnabled || false}
            overrideValue={overrides.federation?.prefetchEnabled}
            onOverride={(v) => updateOverride('federation.prefetchEnabled', v)}
            onReset={() => removeOverride('federation.prefetchEnabled')}
          />
          <OverrideSlider
            label="Remote PDS Cache TTL"
            path="federation.remotePDSCacheTTL"
            globalValue={globalConfig.federation?.remotePDSCacheTTL || 3600}
            overrideValue={overrides.federation?.remotePDSCacheTTL}
            min={60} max={86400} step={60}
            formatValue={(v: number) => v >= 3600 ? `${(v / 3600).toFixed(1)}h` : `${(v / 60).toFixed(0)}m`}
            onOverride={(v) => updateOverride('federation.remotePDSCacheTTL', v)}
            onReset={() => removeOverride('federation.remotePDSCacheTTL')}
          />
        </OverrideCard>
      </div>
    </div>
  );
}

// ─── Shared Components ───

function OverrideCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function OverrideToggle({ label, path, globalValue, overrideValue, onOverride, onReset }: {
  label: string; path: string; globalValue: boolean; overrideValue?: boolean;
  onOverride: (v: boolean) => void; onReset: () => void;
}) {
  const isOverridden = overrideValue !== undefined;
  const effectiveValue = overrideValue ?? globalValue;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">{label}</span>
        {isOverridden ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">OVERRIDE</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-text-muted font-medium">INHERITED</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOverride(!effectiveValue)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            effectiveValue ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            effectiveValue ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
        {isOverridden && (
          <button onClick={onReset} className="text-[10px] text-text-muted hover:text-error transition-colors">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function OverrideSlider({ label, path, globalValue, overrideValue, min, max, step = 1, unit, formatValue, onOverride, onReset }: {
  label: string; path: string; globalValue: number; overrideValue?: number;
  min: number; max: number; step?: number; unit?: string;
  formatValue?: (v: number) => string;
  onOverride: (v: number) => void; onReset: () => void;
}) {
  const isOverridden = overrideValue !== undefined;
  const effectiveValue = overrideValue ?? globalValue;
  const display = formatValue ? formatValue(effectiveValue) : `${effectiveValue}${unit || ''}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">{label}</span>
          {isOverridden ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">OVERRIDE</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-text-muted font-medium">INHERITED</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-accent">{display}</span>
          {isOverridden && (
            <button onClick={onReset} className="text-[10px] text-text-muted hover:text-error transition-colors">
              Reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={effectiveValue}
        onChange={(e) => onOverride(Number(e.target.value))}
        className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
      />
    </div>
  );
}

function OverrideSelect({ label, path, globalValue, overrideValue, options, onOverride, onReset }: {
  label: string; path: string; globalValue: string; overrideValue?: string;
  options: Array<{ value: string; label: string }>;
  onOverride: (v: string) => void; onReset: () => void;
}) {
  const isOverridden = overrideValue !== undefined;
  const effectiveValue = overrideValue ?? globalValue;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">{label}</span>
        {isOverridden ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">OVERRIDE</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-text-muted font-medium">INHERITED</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={effectiveValue}
          onChange={(e) => onOverride(e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {isOverridden && (
          <button onClick={onReset} className="text-[10px] text-text-muted hover:text-error transition-colors">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
