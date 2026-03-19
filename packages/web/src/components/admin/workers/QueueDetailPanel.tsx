'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface QueueDetailPanelProps {
  queueName: string;
  onClose: () => void;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function CountBar({ counts }: { counts: Record<string, number> }) {
  const items = [
    { label: 'Waiting', key: 'waiting', color: 'bg-yellow-500' },
    { label: 'Active', key: 'active', color: 'bg-blue-500' },
    { label: 'Completed', key: 'completed', color: 'bg-green-500' },
    { label: 'Failed', key: 'failed', color: 'bg-red-500' },
    { label: 'Delayed', key: 'delayed', color: 'bg-purple-500' },
  ];

  const total = items.reduce((sum, item) => sum + (counts[item.key] ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* Proportional bar */}
      {total > 0 && (
        <div className="flex h-3 rounded-full overflow-hidden gap-px">
          {items.map((item) => {
            const value = counts[item.key] ?? 0;
            if (value === 0) return null;
            const pct = (value / total) * 100;
            return (
              <div
                key={item.key}
                className={`${item.color} transition-all`}
                style={{ width: `${pct}%`, minWidth: pct > 0 ? '2px' : '0' }}
                title={`${item.label}: ${formatNumber(value)}`}
              />
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="grid grid-cols-5 gap-2">
        {items.map((item) => (
          <div key={item.key} className="text-center">
            <div className={`w-2 h-2 rounded-full ${item.color} mx-auto mb-1`} />
            <p className="text-xs font-medium text-text-primary">{formatNumber(counts[item.key] ?? 0)}</p>
            <p className="text-xs text-text-muted">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobDataPreview({ data }: { data: unknown }) {
  if (!data) return <span className="text-text-muted text-xs">-</span>;

  let preview: string;
  try {
    const str = JSON.stringify(data);
    preview = str.length > 100 ? str.slice(0, 97) + '...' : str;
  } catch {
    preview = String(data);
  }

  return (
    <code className="text-xs font-mono text-text-secondary bg-surface-hover px-2 py-1 rounded break-all">
      {preview}
    </code>
  );
}

type ActiveTab = 'recent' | 'failed';

export function QueueDetailPanel({ queueName, onClose }: QueueDetailPanelProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('recent');
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'workers', 'queue', queueName],
    queryFn: () => api.getWorkerQueue(queueName),
    refetchInterval: 5000,
  });

  const retryMutation = useMutation({
    mutationFn: ({ jobId }: { jobId: string }) => api.retryWorkerJob(queueName, jobId),
    onMutate: ({ jobId }) => setRetryingJobId(jobId),
    onSettled: () => {
      setRetryingJobId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'workers', 'queue', queueName] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'workers', 'list'] });
    },
  });

  const cleanMutation = useMutation({
    mutationFn: ({ status, grace }: { status: string; grace?: number }) =>
      api.cleanWorkerQueue(queueName, status, grace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workers', 'queue', queueName] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'workers', 'list'] });
    },
  });

  const queue = data?.queue;
  const recentJobs: any[] = data?.recentJobs || [];
  const failedJobs: any[] = data?.failedJobs || [];

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              {queue?.displayName || queueName}
            </h3>
            <p className="text-xs text-text-muted font-mono">{queueName}</p>
          </div>
          {queue?.status === 'paused' && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500">
              Paused
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="px-6 py-8 space-y-4">
          <div className="h-12 bg-surface-hover rounded-lg animate-pulse" />
          <div className="h-32 bg-surface-hover rounded-lg animate-pulse" />
        </div>
      )}

      {error && (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-text-muted">Failed to load queue details</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="p-6 space-y-6">
          {/* Count bar */}
          {queue?.counts && (
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-3">Job Distribution</h4>
              <CountBar counts={queue.counts} />
            </div>
          )}

          {/* Clean actions */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Clean:</span>
            <button
              onClick={() => cleanMutation.mutate({ status: 'completed', grace: 3600000 })}
              disabled={cleanMutation.isPending}
              className="px-3 py-1 text-xs font-medium rounded-md bg-surface-hover text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
            >
              Completed &gt;1h
            </button>
            <button
              onClick={() => cleanMutation.mutate({ status: 'failed', grace: 86400000 })}
              disabled={cleanMutation.isPending}
              className="px-3 py-1 text-xs font-medium rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Failed &gt;24h
            </button>
            <button
              onClick={() => cleanMutation.mutate({ status: 'failed', grace: 0 })}
              disabled={cleanMutation.isPending}
              className="px-3 py-1 text-xs font-medium rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              All Failed
            </button>
            {cleanMutation.data && (
              <span className="text-xs text-text-muted">
                Cleaned {cleanMutation.data.cleaned} jobs
              </span>
            )}
          </div>

          {/* Tabs */}
          <div>
            <div className="flex items-center gap-1 border-b border-border mb-4">
              <button
                onClick={() => setActiveTab('recent')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'recent'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                Recent Jobs
                {recentJobs.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-surface-hover text-text-muted">
                    {recentJobs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('failed')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'failed'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                Failed Jobs
                {failedJobs.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-500/10 text-red-500">
                    {failedJobs.length}
                  </span>
                )}
              </button>
            </div>

            {/* Recent jobs tab */}
            {activeTab === 'recent' && (
              <div className="space-y-2">
                {recentJobs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-text-muted">No recent completed jobs</p>
                  </div>
                ) : (
                  recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-start justify-between p-3 rounded-lg bg-surface-hover gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-text-muted">
                            {String(job.id).slice(-12)}
                          </span>
                          <span className="px-1.5 py-0.5 text-xs rounded-full bg-green-500/10 text-green-500">
                            {job.name || 'completed'}
                          </span>
                        </div>
                        <JobDataPreview data={job.data} />
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {job.processedOn && (
                          <p className="text-xs text-text-muted">{formatTimestamp(new Date(job.processedOn).toISOString())}</p>
                        )}
                        {job.finishedOn && job.processedOn && (
                          <p className="text-xs text-text-muted">
                            {formatDuration(job.finishedOn - job.processedOn)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Failed jobs tab */}
            {activeTab === 'failed' && (
              <div className="space-y-2">
                {failedJobs.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm text-text-muted">No failed jobs</p>
                  </div>
                ) : (
                  failedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-text-muted">
                              {String(job.id).slice(-12)}
                            </span>
                            {job.attemptsMade !== undefined && (
                              <span className="text-xs text-text-muted">
                                {job.attemptsMade} attempt{job.attemptsMade !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {job.failedReason && (
                            <p className="text-xs text-red-400 break-all">{job.failedReason}</p>
                          )}
                          {job.data && (
                            <div className="mt-1">
                              <JobDataPreview data={job.data} />
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">
                          {job.timestamp && (
                            <p className="text-xs text-text-muted whitespace-nowrap">
                              {formatTimestamp(new Date(job.timestamp).toISOString())}
                            </p>
                          )}
                          <button
                            onClick={() => retryMutation.mutate({ jobId: String(job.id) })}
                            disabled={retryMutation.isPending && retryingJobId === String(job.id)}
                            className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-text-inverse hover:bg-accent-hover transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {retryingJobId === String(job.id) ? 'Retrying...' : 'Retry'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
