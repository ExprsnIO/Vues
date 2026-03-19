'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCount } from '@/lib/utils';
import { api } from '@/lib/api';
import { ExportButton } from '@/components/admin/ExportModal';
import { AdminChart } from '@/components/admin/charts/AdminChart';

type TabType = 'jobs' | 'workers' | 'quotas' | 'batches' | 'config';
type JobStatus = 'all' | 'pending' | 'rendering' | 'completed' | 'failed' | 'paused';
type Priority = 'all' | 'urgent' | 'high' | 'normal' | 'low';

interface RenderJob {
  id: string;
  projectId: string;
  userDid: string;
  userHandle?: string;
  status: string;
  progress: number;
  priority: string;
  priorityScore: number;
  format: string;
  quality: string;
  width: number;
  height: number;
  workerId?: string;
  batchId?: string;
  dependsOnJobId?: string;
  estimatedDurationSeconds?: number;
  actualDurationSeconds?: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  pausedAt?: string;
}

interface RenderWorker {
  id: string;
  hostname: string;
  status: string;
  concurrency: number;
  activeJobs: number;
  totalProcessed: number;
  failedJobs: number;
  avgProcessingTime?: number;
  gpuEnabled: boolean;
  gpuModel?: string;
  lastHeartbeat?: string;
  startedAt: string;
}

interface UserQuota {
  userDid: string;
  userHandle?: string;
  dailyLimit: number;
  dailyUsed: number;
  weeklyLimit: number;
  weeklyUsed: number;
  concurrentLimit: number;
  maxQuality: string;
  priorityBoost: number;
}

interface RenderBatch {
  id: string;
  userDid: string;
  userHandle?: string;
  name?: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: string;
  createdAt: string;
  completedAt?: string;
}

interface QueueStats {
  pending: number;
  rendering: number;
  completed: number;
  failed: number;
  paused: number;
  totalToday: number;
  avgWaitTime: number;
  avgRenderTime: number;
  priorityBreakdown: {
    urgent: number;
    high: number;
    normal: number;
    low: number;
  };
}

export default function RenderPipelineAdmin() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('jobs');
  const [statusFilter, setStatusFilter] = useState<JobStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<RenderJob | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [editingQuota, setEditingQuota] = useState<UserQuota | null>(null);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render'] });
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, queryClient]);

  // Fetch queue stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'render', 'stats'],
    queryFn: () => api.getRenderQueueStats(),
  });

  // Fetch jobs
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['admin', 'render', 'jobs', statusFilter, priorityFilter],
    queryFn: () => api.listRenderJobs({
      status: statusFilter === 'all' ? undefined : statusFilter,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
      limit: 50,
    }),
    enabled: activeTab === 'jobs',
  });

  // Fetch workers
  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ['admin', 'render', 'workers'],
    queryFn: () => api.listRenderWorkers(),
    enabled: activeTab === 'workers',
  });

  // Fetch batches
  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['admin', 'render', 'batches'],
    queryFn: () => api.listRenderBatches(),
    enabled: activeTab === 'batches',
  });

  // Job mutations
  const pauseJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.pauseRenderJob(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render'] });
      setSelectedJob(null);
    },
  });

  const resumeJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.resumeRenderJob(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render'] });
      setSelectedJob(null);
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.cancelRenderJob(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render'] });
      setSelectedJob(null);
    },
  });

  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.retryRenderJob(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render'] });
      setSelectedJob(null);
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ jobId, priority }: { jobId: string; priority: string }) => {
      await api.updateRenderJobPriority(jobId, priority);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render'] });
    },
  });

  const drainWorkerMutation = useMutation({
    mutationFn: async (workerId: string) => {
      await api.drainRenderWorker(workerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render', 'workers'] });
    },
  });

  const updateQuotaMutation = useMutation({
    mutationFn: async (quota: UserQuota) => {
      await api.updateUserRenderQuota(quota.userDid, quota);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render', 'quotas'] });
      setEditingQuota(null);
    },
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-500',
      rendering: 'bg-blue-500/10 text-blue-500',
      completed: 'bg-green-500/10 text-green-500',
      failed: 'bg-red-500/10 text-red-500',
      paused: 'bg-gray-500/10 text-gray-500',
      active: 'bg-green-500/10 text-green-500',
      draining: 'bg-yellow-500/10 text-yellow-500',
      offline: 'bg-red-500/10 text-red-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      urgent: 'bg-red-500 text-white',
      high: 'bg-orange-500/10 text-orange-500',
      normal: 'bg-gray-500/10 text-gray-500',
      low: 'bg-blue-500/10 text-blue-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[priority] || styles.normal}`}>
        {priority}
      </span>
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  const getWorkerHealth = (worker: RenderWorker) => {
    if (!worker.lastHeartbeat) return 'unknown';
    const lastBeat = new Date(worker.lastHeartbeat).getTime();
    const diff = Date.now() - lastBeat;
    if (diff < 30000) return 'healthy';
    if (diff < 60000) return 'warning';
    return 'unhealthy';
  };

  if (statsLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Render Pipeline</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border"
            />
            Auto-refresh (5s)
          </label>
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 rounded-lg">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-blue-500">
              {stats?.rendering || 0} jobs rendering
            </span>
          </div>
          <ExportButton
            exportType="renderJobs"
            filters={{
              status: statusFilter !== 'all' ? statusFilter : undefined,
            }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard label="Pending" value={stats?.pending || 0} color="yellow" />
        <StatCard label="Rendering" value={stats?.rendering || 0} color="blue" />
        <StatCard label="Completed" value={stats?.completed || 0} color="green" />
        <StatCard label="Failed" value={stats?.failed || 0} color="red" />
        <StatCard label="Today" value={stats?.totalToday || 0} />
      </div>

      {/* Priority Breakdown */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-sm text-text-muted mb-4">Queue Priority Breakdown</h3>
        <div className="flex gap-4">
          {['urgent', 'high', 'normal', 'low'].map((priority) => (
            <div key={priority} className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted capitalize">{priority}</span>
                <span className="text-sm font-medium text-text-primary">
                  {stats?.priorityBreakdown?.[priority as keyof typeof stats.priorityBreakdown] || 0}
                </span>
              </div>
              <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    priority === 'urgent'
                      ? 'bg-red-500'
                      : priority === 'high'
                      ? 'bg-orange-500'
                      : priority === 'normal'
                      ? 'bg-gray-500'
                      : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      ((stats?.priorityBreakdown?.[priority as keyof typeof stats.priorityBreakdown] || 0) /
                        Math.max(1, (stats?.pending || 0) + (stats?.rendering || 0))) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Render Jobs Chart */}
      <AdminChart
        title="Render Jobs Over Time"
        metric="renders"
        type="bar"
        defaultPeriod="7d"
        color="#8b5cf6"
        height={200}
      />

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {(['jobs', 'workers', 'batches', 'quotas', 'config'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {tab === 'config' ? 'Configuration' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Jobs Tab */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <input
              type="text"
              placeholder="Search by project or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JobStatus)}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="rendering">Rendering</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="paused">Paused</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as Priority)}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Jobs List */}
          {jobsLoading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-surface rounded-xl" />
              ))}
            </div>
          ) : jobs?.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No jobs found</div>
          ) : (
            <div className="space-y-3">
              {jobs?.map((job) => (
                <div
                  key={job.id}
                  className="bg-surface border border-border rounded-xl p-4 hover:border-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-sm text-text-primary">{job.id}</span>
                        {getStatusBadge(job.status)}
                        {getPriorityBadge(job.priority)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-text-muted">
                        <span>Project: {job.projectId}</span>
                        <span>User: {job.userHandle || job.userDid.slice(0, 20)}...</span>
                        <span>
                          {job.width}x{job.height} {job.format.toUpperCase()} {job.quality}
                        </span>
                      </div>
                      {job.status === 'rendering' && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-text-muted">Progress</span>
                            <span className="text-xs font-medium text-text-primary">{job.progress}%</span>
                          </div>
                          <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent transition-all duration-300"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedJob(job)}
                        className="px-3 py-1 text-sm text-accent hover:bg-accent/10 rounded transition-colors"
                      >
                        Details
                      </button>
                      {job.status === 'pending' && (
                        <button
                          onClick={() => pauseJobMutation.mutate(job.id)}
                          className="px-3 py-1 text-sm text-yellow-500 hover:bg-yellow-500/10 rounded transition-colors"
                        >
                          Pause
                        </button>
                      )}
                      {job.status === 'paused' && (
                        <button
                          onClick={() => resumeJobMutation.mutate(job.id)}
                          className="px-3 py-1 text-sm text-green-500 hover:bg-green-500/10 rounded transition-colors"
                        >
                          Resume
                        </button>
                      )}
                      {job.status === 'failed' && (
                        <button
                          onClick={() => retryJobMutation.mutate(job.id)}
                          className="px-3 py-1 text-sm text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
                        >
                          Retry
                        </button>
                      )}
                      {['pending', 'rendering'].includes(job.status) && (
                        <button
                          onClick={() => {
                            if (confirm('Cancel this render job?')) {
                              cancelJobMutation.mutate(job.id);
                            }
                          }}
                          className="px-3 py-1 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Workers Tab */}
      {activeTab === 'workers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {workersLoading ? (
            [1, 2].map((i) => <div key={i} className="h-48 bg-surface rounded-xl animate-pulse" />)
          ) : workers?.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-text-muted">No workers registered</div>
          ) : (
            workers?.map((worker) => (
              <div key={worker.id} className="bg-surface border border-border rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text-primary">{worker.hostname}</h3>
                      {getStatusBadge(worker.status)}
                      {worker.gpuEnabled && (
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded text-xs">
                          GPU
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted font-mono">{worker.id}</p>
                  </div>
                  <div
                    className={`w-3 h-3 rounded-full ${
                      getWorkerHealth(worker) === 'healthy'
                        ? 'bg-green-500'
                        : getWorkerHealth(worker) === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    title={`Health: ${getWorkerHealth(worker)}`}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-text-muted">Active Jobs</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {worker.activeJobs}/{worker.concurrency}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Processed</p>
                    <p className="text-lg font-semibold text-text-primary">{worker.totalProcessed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Failed</p>
                    <p className="text-lg font-semibold text-red-500">{worker.failedJobs}</p>
                  </div>
                </div>

                {worker.avgProcessingTime && (
                  <div className="mb-4">
                    <p className="text-xs text-text-muted">Avg Processing Time</p>
                    <p className="text-sm text-text-primary">{formatDuration(worker.avgProcessingTime)}</p>
                  </div>
                )}

                {worker.gpuModel && (
                  <div className="mb-4">
                    <p className="text-xs text-text-muted">GPU</p>
                    <p className="text-sm text-text-primary">{worker.gpuModel}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="text-xs text-text-muted">
                    Started: {formatTimestamp(worker.startedAt)}
                  </div>
                  {worker.status === 'active' && (
                    <button
                      onClick={() => {
                        if (confirm('Drain this worker? It will stop accepting new jobs.')) {
                          drainWorkerMutation.mutate(worker.id);
                        }
                      }}
                      className="px-3 py-1 text-sm text-yellow-500 hover:bg-yellow-500/10 rounded transition-colors"
                    >
                      Drain
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Batches Tab */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          {batchesLoading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-surface rounded-xl" />
              ))}
            </div>
          ) : batches?.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No batches found</div>
          ) : (
            batches?.map((batch) => (
              <div key={batch.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-text-primary">{batch.name || batch.id}</span>
                      {getStatusBadge(batch.status)}
                    </div>
                    <p className="text-sm text-text-muted">
                      User: {batch.userHandle || batch.userDid.slice(0, 20)}...
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-text-primary">
                      {batch.completedJobs}/{batch.totalJobs}
                    </p>
                    <p className="text-xs text-text-muted">jobs completed</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${(batch.completedJobs / batch.totalJobs) * 100}%` }}
                    />
                    {batch.failedJobs > 0 && (
                      <div
                        className="h-full bg-red-500 -mt-2"
                        style={{
                          width: `${(batch.failedJobs / batch.totalJobs) * 100}%`,
                          marginLeft: `${(batch.completedJobs / batch.totalJobs) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
                {batch.failedJobs > 0 && (
                  <p className="mt-2 text-xs text-red-500">{batch.failedJobs} jobs failed</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Quotas Tab */}
      {activeTab === 'quotas' && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Search for a user to view and edit their render quotas.
          </p>
          <input
            type="text"
            placeholder="Search user by handle or DID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && <RenderConfigurationTab />}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Job Details</h3>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-muted">Job ID</p>
                <p className="text-sm font-mono text-text-primary">{selectedJob.id}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Status</p>
                  {getStatusBadge(selectedJob.status)}
                </div>
                <div>
                  <p className="text-xs text-text-muted">Priority</p>
                  <select
                    value={selectedJob.priority}
                    onChange={(e) => {
                      updatePriorityMutation.mutate({
                        jobId: selectedJob.id,
                        priority: e.target.value,
                      });
                      setSelectedJob({ ...selectedJob, priority: e.target.value });
                    }}
                    className="px-2 py-1 bg-surface border border-border rounded text-sm text-text-primary"
                    disabled={!['pending', 'paused'].includes(selectedJob.status)}
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="text-xs text-text-muted">Output Settings</p>
                <p className="text-sm text-text-primary">
                  {selectedJob.width}x{selectedJob.height} - {selectedJob.format.toUpperCase()} -{' '}
                  {selectedJob.quality}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Project ID</p>
                  <p className="text-sm font-mono text-text-primary">{selectedJob.projectId}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">User</p>
                  <p className="text-sm text-text-primary truncate">
                    {selectedJob.userHandle || selectedJob.userDid}
                  </p>
                </div>
              </div>

              {selectedJob.workerId && (
                <div>
                  <p className="text-xs text-text-muted">Worker</p>
                  <p className="text-sm font-mono text-text-primary">{selectedJob.workerId}</p>
                </div>
              )}

              {selectedJob.batchId && (
                <div>
                  <p className="text-xs text-text-muted">Batch ID</p>
                  <p className="text-sm font-mono text-text-primary">{selectedJob.batchId}</p>
                </div>
              )}

              {selectedJob.dependsOnJobId && (
                <div>
                  <p className="text-xs text-text-muted">Depends On</p>
                  <p className="text-sm font-mono text-text-primary">{selectedJob.dependsOnJobId}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Created</p>
                  <p className="text-sm text-text-primary">{formatTimestamp(selectedJob.createdAt)}</p>
                </div>
                {selectedJob.startedAt && (
                  <div>
                    <p className="text-xs text-text-muted">Started</p>
                    <p className="text-sm text-text-primary">{formatTimestamp(selectedJob.startedAt)}</p>
                  </div>
                )}
              </div>

              {selectedJob.actualDurationSeconds && (
                <div>
                  <p className="text-xs text-text-muted">Duration</p>
                  <p className="text-sm text-text-primary">
                    {formatDuration(selectedJob.actualDurationSeconds)}
                  </p>
                </div>
              )}

              {selectedJob.error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-xs text-red-500 font-medium mb-1">Error</p>
                  <p className="text-sm text-red-400">{selectedJob.error}</p>
                </div>
              )}

              {selectedJob.status === 'rendering' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-muted">Progress</span>
                    <span className="text-sm font-medium text-text-primary">{selectedJob.progress}%</span>
                  </div>
                  <div className="h-3 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${selectedJob.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-border">
                {selectedJob.status === 'pending' && (
                  <button
                    onClick={() => pauseJobMutation.mutate(selectedJob.id)}
                    disabled={pauseJobMutation.isPending}
                    className="flex-1 px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Pause
                  </button>
                )}
                {selectedJob.status === 'paused' && (
                  <button
                    onClick={() => resumeJobMutation.mutate(selectedJob.id)}
                    disabled={resumeJobMutation.isPending}
                    className="flex-1 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Resume
                  </button>
                )}
                {selectedJob.status === 'failed' && (
                  <button
                    onClick={() => retryJobMutation.mutate(selectedJob.id)}
                    disabled={retryJobMutation.isPending}
                    className="flex-1 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
                {['pending', 'rendering'].includes(selectedJob.status) && (
                  <button
                    onClick={() => {
                      if (confirm('Cancel this render job?')) {
                        cancelJobMutation.mutate(selectedJob.id);
                      }
                    }}
                    disabled={cancelJobMutation.isPending}
                    className="flex-1 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color?: 'yellow' | 'blue' | 'green' | 'red';
}

function StatCard({ label, value, color }: StatCardProps) {
  const colorStyles = {
    yellow: 'text-yellow-500',
    blue: 'text-blue-500',
    green: 'text-green-500',
    red: 'text-red-500',
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-sm text-text-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ? colorStyles[color] : 'text-text-primary'}`}>
        {formatCount(value)}
      </p>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// =============================================================================
// Render Configuration Tab
// =============================================================================

interface RenderConfig {
  // Video Input Sources
  inputSources: {
    localUpload: boolean;
    s3Import: boolean;
    dockerVolume: boolean;
    kubernetesVolume: boolean;
  };
  // Video Output Destinations
  outputDestinations: {
    s3Export: boolean;
    dockerVolume: boolean;
    kubernetesVolume: boolean;
    cdnPush: boolean;
  };
  // Docker Configuration
  docker: {
    enabled: boolean;
    socketPath: string;
    networkMode: string;
    inputVolumePath: string;
    outputVolumePath: string;
    gpuEnabled: boolean;
    memoryLimit: string;
    cpuLimit: string;
  };
  // Kubernetes Configuration
  kubernetes: {
    enabled: boolean;
    namespace: string;
    inputPvcName: string;
    outputPvcName: string;
    storageClass: string;
    gpuNodeSelector: string;
    resourceRequests: {
      cpu: string;
      memory: string;
      gpu: string;
    };
    resourceLimits: {
      cpu: string;
      memory: string;
      gpu: string;
    };
  };
  // Studio Export Settings
  studioExport: {
    defaultFormat: string;
    defaultQuality: string;
    presets: string[];
    hlsEnabled: boolean;
    hlsSegmentDuration: number;
    dashEnabled: boolean;
    thumbnailGeneration: boolean;
    animatedPreview: boolean;
  };
}

function RenderConfigurationTab() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<'sources' | 'docker' | 'kubernetes' | 'export'>('sources');

  // Fetch current configuration
  const { data: config, isLoading } = useQuery({
    queryKey: ['admin', 'render', 'config'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/xrpc/io.exprsn.admin.render.getConfig`,
          {
            headers: { 'X-Dev-Admin': 'true' },
            credentials: 'include',
          }
        );
        if (!response.ok) throw new Error('Failed to fetch config');
        return response.json() as Promise<RenderConfig>;
      } catch {
        // Return default config if endpoint doesn't exist
        return {
          inputSources: {
            localUpload: true,
            s3Import: true,
            dockerVolume: false,
            kubernetesVolume: false,
          },
          outputDestinations: {
            s3Export: true,
            dockerVolume: false,
            kubernetesVolume: false,
            cdnPush: true,
          },
          docker: {
            enabled: false,
            socketPath: '/var/run/docker.sock',
            networkMode: 'bridge',
            inputVolumePath: '/data/input',
            outputVolumePath: '/data/output',
            gpuEnabled: false,
            memoryLimit: '4g',
            cpuLimit: '2',
          },
          kubernetes: {
            enabled: false,
            namespace: 'exprsn-render',
            inputPvcName: 'render-input-pvc',
            outputPvcName: 'render-output-pvc',
            storageClass: 'standard',
            gpuNodeSelector: 'nvidia.com/gpu=true',
            resourceRequests: {
              cpu: '1',
              memory: '2Gi',
              gpu: '0',
            },
            resourceLimits: {
              cpu: '4',
              memory: '8Gi',
              gpu: '1',
            },
          },
          studioExport: {
            defaultFormat: 'mp4',
            defaultQuality: '1080p',
            presets: ['360p', '480p', '720p', '1080p', '4k'],
            hlsEnabled: true,
            hlsSegmentDuration: 6,
            dashEnabled: false,
            thumbnailGeneration: true,
            animatedPreview: true,
          },
        } as RenderConfig;
      }
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<RenderConfig>) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/xrpc/io.exprsn.admin.render.updateConfig`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Dev-Admin': 'true',
          },
          credentials: 'include',
          body: JSON.stringify(updates),
        }
      );
      if (!response.ok) throw new Error('Failed to update config');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'render', 'config'] });
    },
  });

  if (isLoading || !config) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-surface rounded-xl" />
        <div className="h-48 bg-surface rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Navigation */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'sources' as const, label: 'Input/Output', icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          )},
          { id: 'docker' as const, label: 'Docker', icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.12a.186.186 0 00-.185.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z"/>
            </svg>
          )},
          { id: 'kubernetes' as const, label: 'Kubernetes', icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 01-2.075-2.597l2.578-.437.004.005a.44.44 0 01.485.606zm-.833-2.129a.44.44 0 00.173-.756l.002-.011L7.585 9.7a5.143 5.143 0 00-.73 3.255l2.514-.725.002-.009zm1.145-1.98a.44.44 0 00.699-.337l-.01-.02.15-2.62a5.144 5.144 0 00-3.01 1.442l2.165 1.548.006-.013zm2.373-.313a.44.44 0 00.672.393l.013.013 2.18-1.527a5.143 5.143 0 00-3.017-1.463l.153 2.584zm1.947 1.946a.44.44 0 00.177.757l.01.003 2.508.735a5.143 5.143 0 00-.718-3.257l-1.97 1.77-.007-.008zm-1.306 2.063a.44.44 0 00.478-.612l.01-.005-1.02-2.397a.45.45 0 00-.093-.093L10.38 11.09a.44.44 0 00-.208.09l-2.613.738-.007-.013a5.171 5.171 0 002.563 2.55l-.007-.013.993-2.385a.447.447 0 00.095.099l2.544-.746zm.143 2.413l-.01-.007a.44.44 0 00-.67.393l-.01.02-.16 2.623a5.143 5.143 0 003.02-1.452l-2.17-1.577zm3.063-7.652a6.19 6.19 0 00-11.786 0A6.181 6.181 0 002.36 13.02a6.19 6.19 0 003.625 5.631 6.181 6.181 0 006.515.043 6.19 6.19 0 003.616-5.674 6.181 6.181 0 00-2.364-4.352l-.001-.001-.002-.003zm-.855.908a5.19 5.19 0 01-.003 6.887 5.176 5.176 0 01-7.32.003 5.19 5.19 0 01-.001-6.89 5.176 5.176 0 017.324 0z"/>
            </svg>
          )},
          { id: 'export' as const, label: 'Studio Export', icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          )},
        ].map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeSection === section.id
                ? 'bg-accent text-text-inverse shadow-md'
                : 'bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {/* Input/Output Sources Section */}
      {activeSection === 'sources' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Video Input Sources</h3>
            <p className="text-sm text-text-muted mb-4">Configure where videos can be imported from</p>
            <div className="space-y-4">
              <ConfigToggle
                label="Local Upload"
                description="Upload videos directly from browser"
                checked={config.inputSources.localUpload}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    inputSources: { ...config.inputSources, localUpload: checked },
                  })
                }
              />
              <ConfigToggle
                label="S3/MinIO Import"
                description="Import from S3-compatible storage"
                checked={config.inputSources.s3Import}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    inputSources: { ...config.inputSources, s3Import: checked },
                  })
                }
              />
              <ConfigToggle
                label="Docker Volume"
                description="Mount Docker volumes for input"
                checked={config.inputSources.dockerVolume}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    inputSources: { ...config.inputSources, dockerVolume: checked },
                  })
                }
              />
              <ConfigToggle
                label="Kubernetes PVC"
                description="Use Kubernetes persistent volume claims"
                checked={config.inputSources.kubernetesVolume}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    inputSources: { ...config.inputSources, kubernetesVolume: checked },
                  })
                }
              />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Video Output Destinations</h3>
            <p className="text-sm text-text-muted mb-4">Configure where processed videos are exported</p>
            <div className="space-y-4">
              <ConfigToggle
                label="S3/MinIO Export"
                description="Export to S3-compatible storage"
                checked={config.outputDestinations.s3Export}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    outputDestinations: { ...config.outputDestinations, s3Export: checked },
                  })
                }
              />
              <ConfigToggle
                label="Docker Volume"
                description="Write output to Docker volumes"
                checked={config.outputDestinations.dockerVolume}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    outputDestinations: { ...config.outputDestinations, dockerVolume: checked },
                  })
                }
              />
              <ConfigToggle
                label="Kubernetes PVC"
                description="Write to Kubernetes persistent volume claims"
                checked={config.outputDestinations.kubernetesVolume}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    outputDestinations: { ...config.outputDestinations, kubernetesVolume: checked },
                  })
                }
              />
              <ConfigToggle
                label="CDN Push"
                description="Push directly to CDN edge nodes"
                checked={config.outputDestinations.cdnPush}
                onChange={(checked) =>
                  updateConfigMutation.mutate({
                    outputDestinations: { ...config.outputDestinations, cdnPush: checked },
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Docker Configuration Section */}
      {activeSection === 'docker' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-500/10 to-transparent border-b border-border">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${config.docker.enabled ? 'bg-blue-500/20 text-blue-500' : 'bg-border text-text-muted'} transition-colors`}>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.12a.186.186 0 00-.185.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  Docker Configuration
                  {config.docker.enabled && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-500 rounded-full">Active</span>
                  )}
                </h3>
                <p className="text-sm text-text-muted">Configure Docker-based render workers</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.docker.enabled}
              onClick={() => updateConfigMutation.mutate({ docker: { ...config.docker, enabled: !config.docker.enabled } })}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface ${
                config.docker.enabled ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.docker.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <div className="p-6">

          {config.docker.enabled && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ConfigInput
                  label="Docker Socket Path"
                  value={config.docker.socketPath}
                  placeholder="/var/run/docker.sock"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      docker: { ...config.docker, socketPath: value },
                    })
                  }
                />
                <ConfigSelect
                  label="Network Mode"
                  value={config.docker.networkMode}
                  options={[
                    { value: 'bridge', label: 'Bridge' },
                    { value: 'host', label: 'Host' },
                    { value: 'none', label: 'None' },
                  ]}
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      docker: { ...config.docker, networkMode: value },
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ConfigInput
                  label="Input Volume Path"
                  value={config.docker.inputVolumePath}
                  placeholder="/data/input"
                  description="Path inside container for input videos"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      docker: { ...config.docker, inputVolumePath: value },
                    })
                  }
                />
                <ConfigInput
                  label="Output Volume Path"
                  value={config.docker.outputVolumePath}
                  placeholder="/data/output"
                  description="Path inside container for output videos"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      docker: { ...config.docker, outputVolumePath: value },
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ConfigInput
                  label="Memory Limit"
                  value={config.docker.memoryLimit}
                  placeholder="4g"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      docker: { ...config.docker, memoryLimit: value },
                    })
                  }
                />
                <ConfigInput
                  label="CPU Limit"
                  value={config.docker.cpuLimit}
                  placeholder="2"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      docker: { ...config.docker, cpuLimit: value },
                    })
                  }
                />
                <ConfigToggle
                  label="GPU Enabled"
                  description="Enable NVIDIA GPU support"
                  checked={config.docker.gpuEnabled}
                  onChange={(checked) =>
                    updateConfigMutation.mutate({
                      docker: { ...config.docker, gpuEnabled: checked },
                    })
                  }
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  }
                />
              </div>
            </div>
          )}
          {!config.docker.enabled && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-hover mb-4">
                <svg className="w-8 h-8 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185"/>
                </svg>
              </div>
              <h4 className="text-lg font-medium text-text-primary mb-2">Docker Integration Disabled</h4>
              <p className="text-sm text-text-muted max-w-md mx-auto">Enable Docker to use containerized render workers with custom volume mounts and GPU acceleration.</p>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Kubernetes Configuration Section */}
      {activeSection === 'kubernetes' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-600/10 to-transparent border-b border-border">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${config.kubernetes.enabled ? 'bg-blue-600/20 text-blue-500' : 'bg-border text-text-muted'} transition-colors`}>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 01-2.075-2.597l2.578-.437.004.005a.44.44 0 01.485.606zm-.833-2.129a.44.44 0 00.173-.756l.002-.011L7.585 9.7a5.143 5.143 0 00-.73 3.255l2.514-.725.002-.009zm1.145-1.98a.44.44 0 00.699-.337l-.01-.02.15-2.62a5.144 5.144 0 00-3.01 1.442l2.165 1.548.006-.013zm2.373-.313a.44.44 0 00.672.393l.013.013 2.18-1.527a5.143 5.143 0 00-3.017-1.463l.153 2.584zm1.947 1.946a.44.44 0 00.177.757l.01.003 2.508.735a5.143 5.143 0 00-.718-3.257l-1.97 1.77-.007-.008z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  Kubernetes Configuration
                  {config.kubernetes.enabled && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-500 rounded-full">Active</span>
                  )}
                </h3>
                <p className="text-sm text-text-muted">Configure Kubernetes-based render workers</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.kubernetes.enabled}
              onClick={() => updateConfigMutation.mutate({ kubernetes: { ...config.kubernetes, enabled: !config.kubernetes.enabled } })}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface ${
                config.kubernetes.enabled ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.kubernetes.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <div className="p-6">
          {config.kubernetes.enabled && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ConfigInput
                  label="Namespace"
                  value={config.kubernetes.namespace}
                  placeholder="exprsn-render"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      kubernetes: { ...config.kubernetes, namespace: value },
                    })
                  }
                />
                <ConfigInput
                  label="Storage Class"
                  value={config.kubernetes.storageClass}
                  placeholder="standard"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      kubernetes: { ...config.kubernetes, storageClass: value },
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ConfigInput
                  label="Input PVC Name"
                  value={config.kubernetes.inputPvcName}
                  placeholder="render-input-pvc"
                  description="PersistentVolumeClaim for input videos"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      kubernetes: { ...config.kubernetes, inputPvcName: value },
                    })
                  }
                />
                <ConfigInput
                  label="Output PVC Name"
                  value={config.kubernetes.outputPvcName}
                  placeholder="render-output-pvc"
                  description="PersistentVolumeClaim for output videos"
                  onChange={(value) =>
                    updateConfigMutation.mutate({
                      kubernetes: { ...config.kubernetes, outputPvcName: value },
                    })
                  }
                />
              </div>

              <ConfigInput
                label="GPU Node Selector"
                value={config.kubernetes.gpuNodeSelector}
                placeholder="nvidia.com/gpu=true"
                description="Label selector for GPU nodes"
                onChange={(value) =>
                  updateConfigMutation.mutate({
                    kubernetes: { ...config.kubernetes, gpuNodeSelector: value },
                  })
                }
              />

              <div className="border-t border-border pt-6">
                <h4 className="text-sm font-medium text-text-primary mb-4">Resource Requests</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ConfigInput
                    label="CPU"
                    value={config.kubernetes.resourceRequests.cpu}
                    placeholder="1"
                    onChange={(value) =>
                      updateConfigMutation.mutate({
                        kubernetes: {
                          ...config.kubernetes,
                          resourceRequests: { ...config.kubernetes.resourceRequests, cpu: value },
                        },
                      })
                    }
                  />
                  <ConfigInput
                    label="Memory"
                    value={config.kubernetes.resourceRequests.memory}
                    placeholder="2Gi"
                    onChange={(value) =>
                      updateConfigMutation.mutate({
                        kubernetes: {
                          ...config.kubernetes,
                          resourceRequests: { ...config.kubernetes.resourceRequests, memory: value },
                        },
                      })
                    }
                  />
                  <ConfigInput
                    label="GPU"
                    value={config.kubernetes.resourceRequests.gpu}
                    placeholder="0"
                    onChange={(value) =>
                      updateConfigMutation.mutate({
                        kubernetes: {
                          ...config.kubernetes,
                          resourceRequests: { ...config.kubernetes.resourceRequests, gpu: value },
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h4 className="text-sm font-medium text-text-primary mb-4">Resource Limits</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ConfigInput
                    label="CPU"
                    value={config.kubernetes.resourceLimits.cpu}
                    placeholder="4"
                    onChange={(value) =>
                      updateConfigMutation.mutate({
                        kubernetes: {
                          ...config.kubernetes,
                          resourceLimits: { ...config.kubernetes.resourceLimits, cpu: value },
                        },
                      })
                    }
                  />
                  <ConfigInput
                    label="Memory"
                    value={config.kubernetes.resourceLimits.memory}
                    placeholder="8Gi"
                    onChange={(value) =>
                      updateConfigMutation.mutate({
                        kubernetes: {
                          ...config.kubernetes,
                          resourceLimits: { ...config.kubernetes.resourceLimits, memory: value },
                        },
                      })
                    }
                  />
                  <ConfigInput
                    label="GPU"
                    value={config.kubernetes.resourceLimits.gpu}
                    placeholder="1"
                    onChange={(value) =>
                      updateConfigMutation.mutate({
                        kubernetes: {
                          ...config.kubernetes,
                          resourceLimits: { ...config.kubernetes.resourceLimits, gpu: value },
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          {!config.kubernetes.enabled && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-hover mb-4">
                <svg className="w-8 h-8 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 01-2.075-2.597l2.578-.437.004.005a.44.44 0 01.485.606zm-.833-2.129a.44.44 0 00.173-.756l.002-.011L7.585 9.7a5.143 5.143 0 00-.73 3.255l2.514-.725.002-.009z"/>
                </svg>
              </div>
              <h4 className="text-lg font-medium text-text-primary mb-2">Kubernetes Integration Disabled</h4>
              <p className="text-sm text-text-muted max-w-md mx-auto">Enable Kubernetes to use distributed render workers with persistent volume claims and GPU scheduling.</p>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Studio Export Settings Section */}
      {activeSection === 'export' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-6">Studio Export Settings</h3>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ConfigSelect
                label="Default Format"
                value={config.studioExport.defaultFormat}
                options={[
                  { value: 'mp4', label: 'MP4 (H.264)' },
                  { value: 'webm', label: 'WebM (VP9)' },
                  { value: 'mov', label: 'MOV (ProRes)' },
                  { value: 'mkv', label: 'MKV' },
                ]}
                onChange={(value) =>
                  updateConfigMutation.mutate({
                    studioExport: { ...config.studioExport, defaultFormat: value },
                  })
                }
              />
              <ConfigSelect
                label="Default Quality"
                value={config.studioExport.defaultQuality}
                options={[
                  { value: '360p', label: '360p' },
                  { value: '480p', label: '480p' },
                  { value: '720p', label: '720p (HD)' },
                  { value: '1080p', label: '1080p (Full HD)' },
                  { value: '1440p', label: '1440p (2K)' },
                  { value: '4k', label: '4K (UHD)' },
                ]}
                onChange={(value) =>
                  updateConfigMutation.mutate({
                    studioExport: { ...config.studioExport, defaultQuality: value },
                  })
                }
              />
            </div>

            <div className="border-t border-border pt-6">
              <h4 className="text-sm font-medium text-text-primary mb-4">Streaming Formats</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <ConfigToggle
                    label="HLS (HTTP Live Streaming)"
                    description="Generate HLS playlists for adaptive streaming"
                    checked={config.studioExport.hlsEnabled}
                    onChange={(checked) =>
                      updateConfigMutation.mutate({
                        studioExport: { ...config.studioExport, hlsEnabled: checked },
                      })
                    }
                  />
                  {config.studioExport.hlsEnabled && (
                    <ConfigInput
                      label="HLS Segment Duration (seconds)"
                      value={config.studioExport.hlsSegmentDuration.toString()}
                      placeholder="6"
                      onChange={(value) =>
                        updateConfigMutation.mutate({
                          studioExport: {
                            ...config.studioExport,
                            hlsSegmentDuration: parseInt(value) || 6,
                          },
                        })
                      }
                    />
                  )}
                </div>
                <div>
                  <ConfigToggle
                    label="DASH (Dynamic Adaptive Streaming)"
                    description="Generate DASH manifests for streaming"
                    checked={config.studioExport.dashEnabled}
                    onChange={(checked) =>
                      updateConfigMutation.mutate({
                        studioExport: { ...config.studioExport, dashEnabled: checked },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <h4 className="text-sm font-medium text-text-primary mb-4">Thumbnail & Preview</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ConfigToggle
                  label="Thumbnail Generation"
                  description="Auto-generate video thumbnails"
                  checked={config.studioExport.thumbnailGeneration}
                  onChange={(checked) =>
                    updateConfigMutation.mutate({
                      studioExport: { ...config.studioExport, thumbnailGeneration: checked },
                    })
                  }
                />
                <ConfigToggle
                  label="Animated Preview"
                  description="Generate animated GIF/WebP previews"
                  checked={config.studioExport.animatedPreview}
                  onChange={(checked) =>
                    updateConfigMutation.mutate({
                      studioExport: { ...config.studioExport, animatedPreview: checked },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigToggle({
  label,
  description,
  checked,
  onChange,
  icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors">
      <div className="flex items-start gap-3">
        {icon && (
          <div className={`mt-0.5 p-2 rounded-lg ${checked ? 'bg-accent/10 text-accent' : 'bg-border text-text-muted'} transition-colors`}>
            {icon}
          </div>
        )}
        <div>
          <label className="text-text-primary font-medium cursor-pointer" onClick={() => onChange(!checked)}>
            {label}
          </label>
          {description && <p className="text-sm text-text-muted mt-0.5">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function ConfigInput({
  label,
  value,
  placeholder,
  description,
  onChange,
  icon,
  suffix,
}: {
  label: string;
  value: string;
  placeholder?: string;
  description?: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <div className="p-1.5 rounded-lg bg-border text-text-muted">
            {icon}
          </div>
        )}
        <label className="text-sm font-medium text-text-primary">{label}</label>
      </div>
      <div className="relative">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent focus:border-accent transition-all"
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            {suffix}
          </span>
        )}
      </div>
      {description && <p className="text-xs text-text-muted mt-2">{description}</p>}
    </div>
  );
}

function ConfigSelect({
  label,
  value,
  options,
  onChange,
  icon,
  description,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <div className="p-1.5 rounded-lg bg-border text-text-muted">
            {icon}
          </div>
        )}
        <label className="text-sm font-medium text-text-primary">{label}</label>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-accent transition-all"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description && <p className="text-xs text-text-muted mt-2">{description}</p>}
    </div>
  );
}
