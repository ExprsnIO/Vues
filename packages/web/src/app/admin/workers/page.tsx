'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { QueueDetailPanel } from '@/components/admin/workers/QueueDetailPanel';

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface QueueInfo {
  name: string;
  displayName: string;
  status: 'active' | 'paused';
  counts: QueueCounts;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({
  title,
  value,
  variant = 'default',
  icon,
}: {
  title: string;
  value: number | string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  icon: React.ReactNode;
}) {
  const variantStyles: Record<string, string> = {
    default: 'bg-surface border-border',
    success: 'bg-surface border-border',
    warning: 'bg-surface border-border',
    error: 'bg-surface border-border',
    info: 'bg-surface border-border',
  };
  const iconStyles: Record<string, string> = {
    default: 'bg-surface-hover text-text-muted',
    success: 'bg-green-500/10 text-green-500',
    warning: 'bg-yellow-500/10 text-yellow-500',
    error: 'bg-red-500/10 text-red-500',
    info: 'bg-blue-500/10 text-blue-500',
  };

  return (
    <div className={`rounded-xl border p-5 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted mb-1">{title}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${iconStyles[variant]}`}>{icon}</div>
      </div>
    </div>
  );
}

function QueueStatusBadge({ status }: { status: 'active' | 'paused' }) {
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      Active
    </span>
  );
}

export default function WorkersAdminPage() {
  const queryClient = useQueryClient();
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'workers', 'list'],
    queryFn: () => api.getWorkerQueues(),
    refetchInterval: 5000,
  });

  const pauseMutation = useMutation({
    mutationFn: (queue: string) => api.pauseWorkerQueue(queue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'workers'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (queue: string) => api.resumeWorkerQueue(queue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'workers'] }),
  });

  const queues: QueueInfo[] = data?.queues || [];
  const totalActive = queues.reduce((sum, q) => sum + (q.counts?.active ?? 0), 0);
  const totalFailed = queues.reduce((sum, q) => sum + (q.counts?.failed ?? 0), 0);
  const totalWaiting = queues.reduce((sum, q) => sum + (q.counts?.waiting ?? 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 bg-surface-hover rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-72 bg-surface-hover rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-surface-hover rounded-xl animate-pulse border border-border" />
          ))}
        </div>
        <div className="h-64 bg-surface-hover rounded-xl animate-pulse border border-border" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="text-text-muted">Failed to load worker queue data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Worker Queues</h1>
          <p className="text-text-muted mt-1">
            Monitor and manage background job processing across all queues
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted bg-surface border border-border rounded-lg px-3 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Auto-refreshing every 5s
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Queues"
          value={queues.length}
          variant="default"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          }
        />
        <StatCard
          title="Active Jobs"
          value={formatNumber(totalActive)}
          variant={totalActive > 0 ? 'info' : 'default'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
        />
        <StatCard
          title="Waiting Jobs"
          value={formatNumber(totalWaiting)}
          variant={totalWaiting > 100 ? 'warning' : 'default'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Failed Jobs"
          value={formatNumber(totalFailed)}
          variant={totalFailed > 0 ? 'error' : 'default'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Queue Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Queue Overview</h2>
        </div>

        {queues.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <p className="text-text-muted text-sm">No queues configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Queue
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Waiting
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Active
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Failed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Delayed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queues.map((queue) => (
                  <tr
                    key={queue.name}
                    className={`bg-surface transition-colors cursor-pointer hover:bg-surface-hover ${
                      selectedQueue === queue.name ? 'bg-accent/5' : ''
                    }`}
                    onClick={() => setSelectedQueue(selectedQueue === queue.name ? null : queue.name)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {queue.displayName || queue.name}
                          </p>
                          <p className="text-xs text-text-muted font-mono">{queue.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <QueueStatusBadge status={queue.status} />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`text-sm font-medium ${(queue.counts?.waiting ?? 0) > 0 ? 'text-yellow-500' : 'text-text-muted'}`}>
                        {formatNumber(queue.counts?.waiting ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`text-sm font-medium ${(queue.counts?.active ?? 0) > 0 ? 'text-blue-500' : 'text-text-muted'}`}>
                        {formatNumber(queue.counts?.active ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm text-text-muted">
                        {formatNumber(queue.counts?.completed ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`text-sm font-medium ${(queue.counts?.failed ?? 0) > 0 ? 'text-red-500' : 'text-text-muted'}`}>
                        {formatNumber(queue.counts?.failed ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm text-text-muted">
                        {formatNumber(queue.counts?.delayed ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {queue.status === 'active' ? (
                          <button
                            onClick={() => pauseMutation.mutate(queue.name)}
                            disabled={pauseMutation.isPending}
                            className="px-3 py-1 text-xs font-medium rounded-md bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => resumeMutation.mutate(queue.name)}
                            disabled={resumeMutation.isPending}
                            className="px-3 py-1 text-xs font-medium rounded-md bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedQueue(selectedQueue === queue.name ? null : queue.name)}
                          className="px-3 py-1 text-xs font-medium rounded-md bg-surface-hover text-text-secondary hover:bg-border transition-colors"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Queue Detail Panel */}
      {selectedQueue && (
        <QueueDetailPanel
          queueName={selectedQueue}
          onClose={() => setSelectedQueue(null)}
        />
      )}
    </div>
  );
}
