'use client';

import { useState } from 'react';
import { usePrefetchConfig } from './hooks/usePrefetchConfig';
import { usePrefetchMetrics } from './hooks/usePrefetchMetrics';
import { usePrefetchLogs } from './hooks/usePrefetchLogs';
import { OverviewTab } from './components/OverviewTab';
import { CacheTiersTab } from './components/CacheTiersTab';
import { QueueWorkersTab } from './components/QueueWorkersTab';
import { StrategyTab } from './components/StrategyTab';
import { RulesEngineTab } from './components/RulesEngineTab';
import { EdgeCdnTab } from './components/EdgeCdnTab';
import { FederationTab } from './components/FederationTab';
import { AlertsTab } from './components/AlertsTab';
import { ResilienceTab } from './components/ResilienceTab';
import { LiveLogsTab } from './components/LiveLogsTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'cache', label: 'Cache Tiers' },
  { id: 'queue', label: 'Queue & Workers' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'rules', label: 'Rules Engine' },
  { id: 'edge', label: 'Edge/CDN' },
  { id: 'federation', label: 'Federation' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'resilience', label: 'Resilience' },
  { id: 'logs', label: 'Live Logs' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function PrefetchAdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const {
    config,
    isLoading: configLoading,
    isDirty,
    updateConfig,
    saveConfig,
    discardChanges,
    isSaving,
  } = usePrefetchConfig();
  const { metrics, health } = usePrefetchMetrics();
  const { logs, refetchLogs } = usePrefetchLogs();

  const isDisabled = !config?.enabled;

  const renderTab = () => {
    if (configLoading) {
      return (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-lg" />
          ))}
        </div>
      );
    }

    if (!config) return null;

    switch (activeTab) {
      case 'overview':
        return <OverviewTab metrics={metrics} health={health} config={config} />;
      case 'cache':
        return <CacheTiersTab config={config} updateConfig={updateConfig} disabled={isDisabled} />;
      case 'queue':
        return <QueueWorkersTab config={config} updateConfig={updateConfig} disabled={isDisabled} />;
      case 'strategy':
        return <StrategyTab config={config} updateConfig={updateConfig} disabled={isDisabled} />;
      case 'rules':
        return <RulesEngineTab disabled={isDisabled} />;
      case 'edge':
        return <EdgeCdnTab config={config} updateConfig={updateConfig} disabled={isDisabled} />;
      case 'federation':
        return <FederationTab config={config} updateConfig={updateConfig} disabled={isDisabled} />;
      case 'alerts':
        return <AlertsTab disabled={isDisabled} />;
      case 'resilience':
        return <ResilienceTab config={config} updateConfig={updateConfig} health={health} disabled={isDisabled} />;
      case 'logs':
        return <LiveLogsTab logs={logs} onRefresh={refetchLogs} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Prefetch Engine</h1>
          <p className="text-sm text-text-muted mt-1">
            Configure prefetching, caching, and content delivery
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Master toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-text-muted">
              {config?.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              onClick={() => updateConfig({ enabled: !config?.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config?.enabled ? 'bg-success' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config?.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>

          {/* Save / Discard */}
          {isDirty && (
            <div className="flex items-center gap-2">
              <button
                onClick={discardChanges}
                className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveConfig}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Disabled overlay indicator */}
      {isDisabled && activeTab !== 'overview' && activeTab !== 'logs' && (
        <div className="bg-warning-muted border border-warning/30 rounded-lg p-3 text-sm text-warning">
          Prefetch engine is disabled. Changes will be saved but won't take effect until enabled.
        </div>
      )}

      {/* Tab content */}
      <div className={isDisabled && activeTab !== 'overview' && activeTab !== 'logs' ? 'opacity-60' : ''}>
        {renderTab()}
      </div>
    </div>
  );
}
