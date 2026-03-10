'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';

interface GPUWorker {
  id: string;
  hostname: string;
  status: 'active' | 'draining' | 'offline';
  gpuModel: string | null;
  gpuCount: number;
  gpuMemoryMB: number | null;
  gpuUtilization: number | null;
  gpuMemoryUsed: number | null;
  activeJobs: number;
  allocatedGPUs: number;
  availableGPUs: number;
  lastHeartbeat: string | null;
  allocations: Array<{
    id: string;
    jobId: string;
    gpuIndex: number;
    jobType: string;
    allocatedAt: string;
    memoryAllocatedMB: number | null;
  }>;
}

interface GPUAllocation {
  id: string;
  workerId: string;
  workerHostname: string | null;
  workerGPUModel: string | null;
  jobId: string;
  jobStatus: string | null;
  jobPriority: string | null;
  gpuIndex: number;
  jobType: string;
  allocatedAt: string;
  memoryAllocatedMB: number | null;
  currentStep: string | null;
  progress: number | null;
}

interface GPUPriority {
  id: string;
  jobType: string;
  priority: number;
  requiresGPU: boolean;
  preferredGPUModel: string | null;
  maxGPUMemoryMB: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function GPUManagementPage() {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [editingPriority, setEditingPriority] = useState<GPUPriority | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [priorityForm, setPriorityForm] = useState({
    jobType: '',
    priority: 50,
    requiresGPU: false,
    preferredGPUModel: '',
    maxGPUMemoryMB: 0,
  });

  // GPU Overview
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin', 'gpu', 'overview'],
    queryFn: () => api.adminGPUOverview(),
    refetchInterval: 15000,
  });

  // GPU Workers
  const { data: workersData, isLoading: workersLoading } = useQuery({
    queryKey: ['admin', 'gpu', 'workers'],
    queryFn: () => api.adminGPUWorkers(true),
    refetchInterval: 15000,
  });

  // GPU Allocations
  const { data: allocationsData, isLoading: allocationsLoading } = useQuery({
    queryKey: ['admin', 'gpu', 'allocations'],
    queryFn: () => api.adminGPUAllocations(),
    refetchInterval: 10000,
  });

  // GPU Priorities
  const { data: prioritiesData, refetch: refetchPriorities } = useQuery({
    queryKey: ['admin', 'gpu', 'priorities'],
    queryFn: () => api.adminGPUPriorities(),
  });

  // GPU Metrics for selected worker
  const { data: metricsData } = useQuery({
    queryKey: ['admin', 'gpu', 'metrics', selectedWorker],
    queryFn: () => api.adminGPUMetrics(selectedWorker || undefined, 6, 60),
    enabled: !!selectedWorker,
    refetchInterval: 30000,
  });

  const handleSavePriority = async () => {
    try {
      if (!priorityForm.jobType || priorityForm.priority < 0 || priorityForm.priority > 100) {
        setError('Job type is required and priority must be between 0 and 100');
        return;
      }

      await api.adminGPUSetPriority({
        jobType: priorityForm.jobType,
        priority: priorityForm.priority,
        requiresGPU: priorityForm.requiresGPU,
        preferredGPUModel: priorityForm.preferredGPUModel || undefined,
        maxGPUMemoryMB: priorityForm.maxGPUMemoryMB || undefined,
      });

      setShowPriorityModal(false);
      setEditingPriority(null);
      setPriorityForm({
        jobType: '',
        priority: 50,
        requiresGPU: false,
        preferredGPUModel: '',
        maxGPUMemoryMB: 0,
      });
      refetchPriorities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save priority');
    }
  };

  const handleDeletePriority = async (jobType: string) => {
    if (!confirm(`Are you sure you want to delete priority for ${jobType}?`)) return;
    try {
      await api.adminGPUDeletePriority(jobType);
      refetchPriorities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete priority');
    }
  };

  const handleEditPriority = (priority: GPUPriority) => {
    setEditingPriority(priority);
    setPriorityForm({
      jobType: priority.jobType,
      priority: priority.priority,
      requiresGPU: priority.requiresGPU,
      preferredGPUModel: priority.preferredGPUModel || '',
      maxGPUMemoryMB: priority.maxGPUMemoryMB || 0,
    });
    setShowPriorityModal(true);
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'draining':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'offline':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return 'text-red-400';
    if (utilization >= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  if (overviewLoading || workersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/infrastructure"
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              Infrastructure
            </Link>
            <span className="text-text-muted">/</span>
            <h1 className="text-2xl font-bold text-text-primary">GPU Management</h1>
          </div>
          <p className="text-text-muted mt-1">GPU allocation, utilization, and priority settings</p>
        </div>
        <button
          onClick={() => setShowPriorityModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Priority Rule
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* GPU Overview Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-6 bg-surface border border-border rounded-xl">
            <div className="text-3xl font-bold text-text-primary">{overview.totalGPUs}</div>
            <div className="text-sm text-text-muted mt-1">Total GPUs</div>
          </div>
          <div className="p-6 bg-surface border border-border rounded-xl">
            <div className="text-3xl font-bold text-green-400">{overview.availableGPUs}</div>
            <div className="text-sm text-text-muted mt-1">Available GPUs</div>
          </div>
          <div className="p-6 bg-surface border border-border rounded-xl">
            <div className="text-3xl font-bold text-yellow-400">{overview.allocatedGPUs}</div>
            <div className="text-sm text-text-muted mt-1">Allocated GPUs</div>
          </div>
          <div className="p-6 bg-surface border border-border rounded-xl">
            <div className={`text-3xl font-bold ${getUtilizationColor(overview.utilizationPercent)}`}>
              {overview.utilizationPercent}%
            </div>
            <div className="text-sm text-text-muted mt-1">Avg Utilization</div>
          </div>
        </div>
      )}

      {/* GPU Workers Table */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">GPU Workers</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Worker</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">GPU Model</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">GPUs</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Memory</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Utilization</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Active Jobs</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {workersData?.workers.map((worker) => (
                <tr
                  key={worker.id}
                  className="border-b border-border/50 hover:bg-surface-hover cursor-pointer transition-colors"
                  onClick={() => setSelectedWorker(worker.id)}
                >
                  <td className="py-3 px-4 text-sm text-text-primary font-medium">
                    {worker.hostname}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 text-xs rounded border ${getStatusColor(worker.status)}`}>
                      {worker.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    {worker.gpuModel || 'Unknown'}
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">{worker.availableGPUs}</span>
                      <span className="text-text-muted">/</span>
                      <span>{worker.gpuCount}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    {worker.gpuMemoryMB
                      ? `${Math.round((worker.gpuMemoryUsed || 0) / 1024)}GB / ${Math.round(worker.gpuMemoryMB / 1024)}GB`
                      : 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <span className={getUtilizationColor(worker.gpuUtilization || 0)}>
                      {worker.gpuUtilization?.toFixed(1) || '0'}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    {worker.activeJobs}
                  </td>
                  <td className="py-3 px-4 text-sm text-text-muted">
                    {formatTimestamp(worker.lastHeartbeat)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {workersData?.workers.length === 0 && (
            <div className="text-center py-8 text-text-muted">No GPU workers found</div>
          )}
        </div>
      </div>

      {/* GPU Allocations Table */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Active GPU Allocations</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Worker</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">GPU</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Job ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Progress</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Memory</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Duration</th>
              </tr>
            </thead>
            <tbody>
              {allocationsData?.allocations.map((allocation) => (
                <tr key={allocation.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="py-3 px-4 text-sm text-text-primary">
                    {allocation.workerHostname || 'Unknown'}
                    <div className="text-xs text-text-muted">{allocation.workerGPUModel}</div>
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    GPU {allocation.gpuIndex}
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary font-mono">
                    {allocation.jobId.substring(0, 12)}...
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <span className="px-2 py-1 text-xs bg-accent/10 text-accent rounded">
                      {allocation.jobType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    {allocation.jobStatus || 'Unknown'}
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    {allocation.progress !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-border rounded-full h-2 max-w-[100px]">
                          <div
                            className="bg-accent h-2 rounded-full transition-all"
                            style={{ width: `${allocation.progress}%` }}
                          />
                        </div>
                        <span className="text-xs">{allocation.progress}%</span>
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-text-primary">
                    {allocation.memoryAllocatedMB
                      ? `${Math.round(allocation.memoryAllocatedMB / 1024)}GB`
                      : 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-sm text-text-muted">
                    {formatTimestamp(allocation.allocatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allocationsData?.allocations.length === 0 && (
            <div className="text-center py-8 text-text-muted">No active GPU allocations</div>
          )}
        </div>
      </div>

      {/* GPU Priority Settings */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Job Type Priority Settings</h2>
        <div className="space-y-2">
          {prioritiesData?.priorities.map((priority) => (
            <div
              key={priority.id}
              className="flex items-center justify-between p-4 bg-surface-hover rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-primary">{priority.jobType}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    priority.requiresGPU
                      ? 'bg-yellow-500/10 text-yellow-400'
                      : 'bg-gray-500/10 text-gray-400'
                  }`}>
                    {priority.requiresGPU ? 'Requires GPU' : 'Optional GPU'}
                  </span>
                  {priority.preferredGPUModel && (
                    <span className="text-xs text-text-muted">
                      Prefers: {priority.preferredGPUModel}
                    </span>
                  )}
                </div>
                {priority.maxGPUMemoryMB && (
                  <div className="text-xs text-text-muted mt-1">
                    Max Memory: {Math.round(priority.maxGPUMemoryMB / 1024)}GB
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-lg font-semibold text-text-primary">{priority.priority}</div>
                  <div className="text-xs text-text-muted">Priority</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditPriority(priority)}
                    className="px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeletePriority(priority.jobType)}
                    className="px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {prioritiesData?.priorities.length === 0 && (
            <div className="text-center py-8 text-text-muted">
              No priority rules configured. Click &quot;Add Priority Rule&quot; to create one.
            </div>
          )}
        </div>
      </div>

      {/* GPU Metrics Chart (if worker selected) */}
      {selectedWorker && metricsData && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">GPU Metrics (Last 6 hours)</h2>
            <button
              onClick={() => setSelectedWorker(null)}
              className="text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-text-primary">
                {metricsData.stats.avgUtilization.toFixed(1)}%
              </div>
              <div className="text-xs text-text-muted">Avg Utilization</div>
            </div>
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-text-primary">
                {Math.round(metricsData.stats.avgMemoryUsed / 1024)}GB
              </div>
              <div className="text-xs text-text-muted">Avg Memory Used</div>
            </div>
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-text-primary">
                {metricsData.stats.avgTemperature.toFixed(1)}°C
              </div>
              <div className="text-xs text-text-muted">Avg Temperature</div>
            </div>
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-text-primary">
                {metricsData.stats.dataPoints}
              </div>
              <div className="text-xs text-text-muted">Data Points</div>
            </div>
          </div>
        </div>
      )}

      {/* Priority Modal */}
      {showPriorityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md border border-border">
            <h2 className="text-xl font-semibold text-text-primary mb-4">
              {editingPriority ? 'Edit Priority Rule' : 'Add Priority Rule'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Job Type</label>
                <input
                  type="text"
                  value={priorityForm.jobType}
                  onChange={(e) => setPriorityForm({ ...priorityForm, jobType: e.target.value })}
                  disabled={!!editingPriority}
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                  placeholder="render"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">
                  Priority (0-100, higher = more priority)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={priorityForm.priority}
                  onChange={(e) =>
                    setPriorityForm({ ...priorityForm, priority: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresGPU"
                  checked={priorityForm.requiresGPU}
                  onChange={(e) => setPriorityForm({ ...priorityForm, requiresGPU: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-surface-hover text-accent focus:ring-accent"
                />
                <label htmlFor="requiresGPU" className="text-sm text-text-muted">
                  Requires GPU
                </label>
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">Preferred GPU Model (optional)</label>
                <input
                  type="text"
                  value={priorityForm.preferredGPUModel}
                  onChange={(e) =>
                    setPriorityForm({ ...priorityForm, preferredGPUModel: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="NVIDIA RTX 4090"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">Max GPU Memory (MB, optional)</label>
                <input
                  type="number"
                  min="0"
                  value={priorityForm.maxGPUMemoryMB}
                  onChange={(e) =>
                    setPriorityForm({ ...priorityForm, maxGPUMemoryMB: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="16384"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPriorityModal(false);
                  setEditingPriority(null);
                  setPriorityForm({
                    jobType: '',
                    priority: 50,
                    requiresGPU: false,
                    preferredGPUModel: '',
                    maxGPUMemoryMB: 0,
                  });
                }}
                className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePriority}
                disabled={!priorityForm.jobType}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed text-text-inverse rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
