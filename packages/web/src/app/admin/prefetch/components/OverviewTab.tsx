'use client';

import { StatCard } from './shared/StatCard';

interface OverviewTabProps {
  metrics: any;
  health: any;
  config: any;
}

export function OverviewTab({ metrics, health, config }: OverviewTabProps) {
  const hitRate = metrics?.cache?.hitRate != null ? (metrics.cache.hitRate * 100).toFixed(1) : '—';
  const avgLatency = metrics?.prefetch?.avgDuration != null ? `${Math.round(metrics.prefetch.avgDuration)}ms` : '—';
  const queueDepth = metrics?.queue?.waiting ?? '—';
  const activeJobs = metrics?.queue?.active ?? '—';
  const totalJobs = metrics?.prefetch?.totalJobs ?? '—';
  const failedJobs = metrics?.prefetch?.failed ?? '—';

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Hit Rate" value={`${hitRate}%`} />
        <StatCard label="Active Jobs" value={activeJobs} />
        <StatCard label="Queue Depth" value={queueDepth} />
        <StatCard label="Avg Latency" value={avgLatency} />
        <StatCard label="Total Jobs" value={totalJobs} />
        <StatCard label="Failed Jobs" value={failedJobs} />
      </div>

      {/* Health status */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">System Health</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <HealthIndicator
            name="Redis"
            status={health?.components?.redis?.status || 'unknown'}
          />
          <HealthIndicator
            name="Queue"
            status={health?.components?.queue?.status || 'unknown'}
            detail={health?.components?.queue?.waiting != null ? `${health.components.queue.waiting} waiting` : undefined}
          />
          <HealthIndicator
            name="Engine"
            status={config?.enabled ? 'healthy' : 'disabled'}
          />
        </div>
      </div>

      {/* Cache tier distribution */}
      {metrics?.cache && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Cache Tier Distribution</h3>
          <div className="space-y-3">
            <TierBar label="Hot" hits={metrics.cache.hotHits} total={metrics.cache.hotHits + metrics.cache.warmHits + metrics.cache.coldHits + metrics.cache.misses} color="bg-error" />
            <TierBar label="Warm" hits={metrics.cache.warmHits} total={metrics.cache.hotHits + metrics.cache.warmHits + metrics.cache.coldHits + metrics.cache.misses} color="bg-warning" />
            <TierBar label="Cold" hits={metrics.cache.coldHits} total={metrics.cache.hotHits + metrics.cache.warmHits + metrics.cache.coldHits + metrics.cache.misses} color="bg-accent" />
            <TierBar label="Miss" hits={metrics.cache.misses} total={metrics.cache.hotHits + metrics.cache.warmHits + metrics.cache.coldHits + metrics.cache.misses} color="bg-border" />
          </div>
        </div>
      )}
    </div>
  );
}

function HealthIndicator({ name, status, detail }: { name: string; status: string; detail?: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-success',
    degraded: 'bg-warning',
    unhealthy: 'bg-error',
    disabled: 'bg-text-muted',
    unknown: 'bg-border',
    fallback: 'bg-warning',
    unavailable: 'bg-text-muted',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${colors[status] || 'bg-border'}`} />
      <div>
        <span className="text-sm text-text-secondary">{name}</span>
        <span className="text-xs text-text-muted ml-1 capitalize">({status})</span>
        {detail && <p className="text-xs text-text-muted">{detail}</p>}
      </div>
    </div>
  );
}

function TierBar({ label, hits, total, color }: { label: string; hits: number; total: number; color: string }) {
  const pct = total > 0 ? (hits / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-muted w-10">{label}</span>
      <div className="flex-1 h-4 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-muted w-16 text-right">{hits.toLocaleString()} ({pct.toFixed(1)}%)</span>
    </div>
  );
}
