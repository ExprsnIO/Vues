'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PrefetchAlert {
  id: string;
  name: string;
  description?: string;
  metric: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  channels: string[];
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggered?: string;
  triggerCount: number;
}

interface AlertsTabProps {
  disabled?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-accent/20 text-accent',
  warning: 'bg-warning-muted text-warning',
  critical: 'bg-error-muted text-error',
};

const METRIC_OPTIONS = [
  'cache.hitRate', 'cache.misses', 'prefetch.failed', 'prefetch.avgDuration',
  'queue.waiting', 'queue.failed', 'queue.active',
];

export function AlertsTab({ disabled }: AlertsTabProps) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newAlert, setNewAlert] = useState({
    name: '', metric: 'queue.waiting', condition: 'gt' as string,
    threshold: 100, severity: 'warning' as string,
    channels: ['dashboard'] as string[], enabled: true, cooldownMinutes: 15,
  });

  const { data } = useQuery({
    queryKey: ['admin', 'prefetch', 'alerts'],
    queryFn: () => api.get<{ alerts: PrefetchAlert[] }>('/xrpc/io.exprsn.admin.prefetch.alerts'),
  });

  const alerts = data?.alerts || [];

  const createMutation = useMutation({
    mutationFn: (alert: any) => api.post('/xrpc/io.exprsn.admin.prefetch.alerts', alert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'alerts'] });
      setIsCreating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/xrpc/io.exprsn.admin.prefetch.alerts/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'alerts'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/xrpc/io.exprsn.admin.prefetch.alerts/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'alerts'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-secondary">Alerts ({alerts.length})</h3>
        <button
          onClick={() => setIsCreating(true)}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-primary rounded-lg disabled:opacity-50"
        >
          Add Alert
        </button>
      </div>

      {alerts.length === 0 && !isCreating && (
        <div className="text-center py-8 bg-surface border border-border rounded-lg">
          <p className="text-sm text-text-muted">No alerts configured</p>
          <p className="text-xs text-text-muted mt-1">Set up alerts to monitor prefetch engine health</p>
        </div>
      )}

      {/* Alert list */}
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleMutation.mutate({ id: alert.id, enabled: !alert.enabled })}
                  disabled={disabled}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                    alert.enabled ? 'bg-success' : 'bg-border'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    alert.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
                <div>
                  <span className="text-sm font-medium text-text-secondary">{alert.name}</span>
                  <p className="text-xs text-text-muted">
                    {alert.metric} {alert.condition} {alert.threshold}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[alert.severity]}`}>
                  {alert.severity}
                </span>
                <span className="text-xs text-text-muted">
                  {alert.triggerCount} triggers
                </span>
                {alert.lastTriggered && (
                  <span className="text-xs text-text-muted">
                    Last: {new Date(alert.lastTriggered).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={() => { if (confirm('Delete this alert?')) deleteMutation.mutate(alert.id); }}
                  disabled={disabled}
                  className="text-xs text-error hover:text-error ml-2 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="bg-surface border border-accent/30 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium text-text-secondary">New Alert</h4>
          <input
            type="text"
            placeholder="Alert name"
            value={newAlert.name}
            onChange={(e) => setNewAlert({ ...newAlert, name: e.target.value })}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-text-secondary focus:outline-none focus:border-accent"
          />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-text-muted">Metric</label>
              <select
                value={newAlert.metric}
                onChange={(e) => setNewAlert({ ...newAlert, metric: e.target.value })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-secondary mt-1"
              >
                {METRIC_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted">Condition</label>
              <select
                value={newAlert.condition}
                onChange={(e) => setNewAlert({ ...newAlert, condition: e.target.value })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-secondary mt-1"
              >
                {['gt', 'gte', 'lt', 'lte', 'eq'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted">Threshold</label>
              <input
                type="number"
                value={newAlert.threshold}
                onChange={(e) => setNewAlert({ ...newAlert, threshold: Number(e.target.value) })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-secondary mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted">Severity</label>
              <select
                value={newAlert.severity}
                onChange={(e) => setNewAlert({ ...newAlert, severity: e.target.value })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-secondary mt-1"
              >
                {['info', 'warning', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted">Cooldown (min)</label>
              <input
                type="number"
                value={newAlert.cooldownMinutes}
                onChange={(e) => setNewAlert({ ...newAlert, cooldownMinutes: Number(e.target.value) })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-secondary mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-sm text-text-muted border border-border rounded-lg">Cancel</button>
            <button
              onClick={() => createMutation.mutate(newAlert)}
              disabled={!newAlert.name}
              className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-primary rounded-lg disabled:opacity-50"
            >
              Create Alert
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
