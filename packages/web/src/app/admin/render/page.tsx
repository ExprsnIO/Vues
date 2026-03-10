'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCount } from '@/lib/utils';
import { api } from '@/lib/api';
import { ExportButton } from '@/components/admin/ExportModal';
import { AdminChart } from '@/components/admin/charts/AdminChart';

type TabType = 'jobs' | 'workers' | 'quotas' | 'batches';
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
          {(['jobs', 'workers', 'batches', 'quotas'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
