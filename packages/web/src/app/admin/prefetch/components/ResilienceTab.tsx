'use client';

import { ConfigSlider } from './shared/ConfigSlider';
import { ConfigToggle } from './shared/ConfigToggle';

interface ResilienceTabProps {
  config: any;
  updateConfig: (updates: any) => void;
  health?: any;
  disabled?: boolean;
}

export function ResilienceTab({ config, updateConfig, health, disabled }: ResilienceTabProps) {
  return (
    <div className="space-y-6">
      {/* Circuit Breaker */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-secondary">Circuit Breaker</h3>
          <ConfigToggle
            label=""
            checked={config.resilience.circuitBreaker.enabled}
            onChange={(v) => updateConfig({ resilience: { circuitBreaker: { enabled: v } } })}
            disabled={disabled}
          />
        </div>
        {config.resilience.circuitBreaker.enabled && (
          <div className="space-y-4">
            <ConfigSlider
              label="Failure Threshold"
              description="Consecutive failures before circuit opens"
              value={config.resilience.circuitBreaker.failureThreshold}
              min={1} max={100}
              onChange={(v) => updateConfig({ resilience: { circuitBreaker: { failureThreshold: v } } })}
              disabled={disabled}
            />
            <ConfigSlider
              label="Reset Timeout"
              description="Time before attempting half-open state"
              value={config.resilience.circuitBreaker.resetTimeoutMs}
              min={1000} max={300000} step={1000}
              formatValue={(v) => `${(v / 1000).toFixed(0)}s`}
              onChange={(v) => updateConfig({ resilience: { circuitBreaker: { resetTimeoutMs: v } } })}
              disabled={disabled}
            />
            <ConfigSlider
              label="Half-Open Probes"
              description="Test requests in half-open state"
              value={config.resilience.circuitBreaker.halfOpenProbes}
              min={1} max={10}
              onChange={(v) => updateConfig({ resilience: { circuitBreaker: { halfOpenProbes: v } } })}
              disabled={disabled}
            />
            {/* State diagram */}
            <div className="bg-background rounded-lg p-4">
              <p className="text-xs text-text-muted mb-2">Circuit State Flow</p>
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="px-2 py-1 bg-success-muted text-success rounded">Closed</span>
                <span className="text-text-muted">→ {config.resilience.circuitBreaker.failureThreshold} failures →</span>
                <span className="px-2 py-1 bg-error-muted text-error rounded">Open</span>
                <span className="text-text-muted">→ {(config.resilience.circuitBreaker.resetTimeoutMs / 1000).toFixed(0)}s →</span>
                <span className="px-2 py-1 bg-warning-muted text-warning rounded">Half-Open</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Telemetry */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Telemetry & Retention</h3>
        <ConfigSlider
          label="Metrics Retention"
          value={config.resilience.metricsRetentionDays}
          min={1} max={365}
          unit=" days"
          onChange={(v) => updateConfig({ resilience: { metricsRetentionDays: v } })}
          disabled={disabled}
        />
        <ConfigSlider
          label="Snapshot Interval"
          description="How often metrics are persisted to Redis"
          value={config.resilience.snapshotIntervalMs}
          min={5000} max={3600000} step={5000}
          formatValue={(v) => v >= 60000 ? `${(v / 60000).toFixed(0)}m` : `${(v / 1000).toFixed(0)}s`}
          onChange={(v) => updateConfig({ resilience: { snapshotIntervalMs: v } })}
          disabled={disabled}
        />
        <div className="bg-background rounded-lg p-3">
          <p className="text-xs text-text-muted">Estimated Storage</p>
          <p className="text-sm text-text-secondary">
            ~{((config.resilience.metricsRetentionDays * 24 * 0.5) / 1000).toFixed(1)} MB
            <span className="text-xs text-text-muted ml-1">(~0.5KB per hourly snapshot)</span>
          </p>
        </div>
      </div>

      {/* Health checks */}
      {health && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Health Checks</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(health.components || {}).map(([name, comp]: [string, any]) => (
              <div key={name} className="flex items-center justify-between bg-background rounded-lg p-3">
                <span className="text-sm text-text-secondary capitalize">{name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  comp.status === 'healthy' ? 'bg-success-muted text-success' :
                  comp.status === 'degraded' || comp.status === 'fallback' ? 'bg-warning-muted text-warning' :
                  comp.status === 'unhealthy' ? 'bg-error-muted text-error' :
                  'bg-border text-text-muted'
                }`}>
                  {comp.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
