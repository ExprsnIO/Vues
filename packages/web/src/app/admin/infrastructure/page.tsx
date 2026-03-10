'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SystemDiagnostics } from '@/lib/api';
import Link from 'next/link';

interface Cluster {
  id: string;
  name: string;
  type: 'docker' | 'kubernetes';
  endpoint: string | null;
  status: 'active' | 'draining' | 'offline' | 'error';
  region: string | null;
  maxWorkers: number | null;
  currentWorkers: number;
  gpuEnabled: boolean;
  gpuCount: number;
  lastHealthCheck: string | null;
  errorMessage: string | null;
  createdAt: string;
  workerStats?: {
    total: number;
    active: number;
    offline: number;
  };
}

interface Worker {
  id: string;
  hostname: string;
  status: 'active' | 'draining' | 'offline';
  concurrency: number;
  activeJobs: number;
  totalProcessed: number;
  failedJobs: number;
  avgProcessingTime: number | null;
  gpuEnabled: boolean;
  gpuModel: string | null;
  lastHeartbeat: string | null;
  startedAt: string;
  metadata: Record<string, unknown> | null;
  isOnline: boolean;
  clusterId?: string;
}

interface WorkerMetrics {
  workerId: string;
  metrics: {
    activeJobs: number;
    totalProcessed: number;
    failedJobs: number;
    successRate: number;
    avgProcessingTimeSeconds: number;
    concurrency: number;
    uptimeHours: number;
    resourceUsage: {
      cpu: number;
      memory: number;
      disk: number;
      gpu?: number;
    };
  };
  timestamp: string;
}

interface WorkerLogs {
  workerId: string;
  hostname: string;
  logs: string[];
  lines: number;
}

interface ClusterMetrics {
  workerCount: number;
  activeWorkers: number;
  offlineWorkers: number;
  totalJobsProcessed: number;
  totalJobsFailed: number;
  activeJobs: number;
  averageProcessingTimeSeconds: number;
  successRate: number;
}

export default function InfrastructurePage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [workerMetrics, setWorkerMetrics] = useState<WorkerMetrics | null>(null);
  const [workerLogs, setWorkerLogs] = useState<WorkerLogs | null>(null);
  const [clusterMetrics, setClusterMetrics] = useState<ClusterMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for new cluster
  const [newCluster, setNewCluster] = useState({
    name: '',
    type: 'docker' as 'docker' | 'kubernetes',
    endpoint: '',
    region: '',
    maxWorkers: 10,
    gpuEnabled: false,
  });

  useEffect(() => {
    loadClusters();
    const interval = setInterval(loadClusters, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (expandedCluster) {
      loadWorkers(expandedCluster);
    }
  }, [expandedCluster]);

  useEffect(() => {
    if (selectedCluster) {
      loadClusterMetrics(selectedCluster);
    }
  }, [selectedCluster]);

  useEffect(() => {
    if (selectedWorker) {
      loadWorkerMetrics(selectedWorker.id);
      loadWorkerLogs(selectedWorker.id);
    }
  }, [selectedWorker]);

  async function loadClusters() {
    try {
      const data = await api.adminClusterList();
      setClusters(data.clusters);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clusters');
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkers(clusterId: string) {
    try {
      const data = await api.adminWorkersList(clusterId);
      setWorkers(data.workers);
    } catch (err) {
      console.error('Failed to load workers:', err);
    }
  }

  async function loadClusterMetrics(clusterId: string) {
    try {
      const data = await api.adminClusterGetMetrics(clusterId);
      setClusterMetrics(data.metrics);
    } catch (err) {
      console.error('Failed to load cluster metrics:', err);
    }
  }

  async function loadWorkerMetrics(workerId: string) {
    try {
      const data = await api.adminWorkersMetrics(workerId);
      setWorkerMetrics(data);
    } catch (err) {
      console.error('Failed to load worker metrics:', err);
    }
  }

  async function loadWorkerLogs(workerId: string) {
    try {
      const data = await api.adminWorkersLogs(workerId, 100);
      setWorkerLogs(data);
    } catch (err) {
      console.error('Failed to load worker logs:', err);
    }
  }

  async function handleCreateCluster() {
    try {
      await api.adminClusterCreate({
        name: newCluster.name,
        type: newCluster.type,
        endpoint: newCluster.endpoint || undefined,
        region: newCluster.region || undefined,
        maxWorkers: newCluster.maxWorkers,
        gpuEnabled: newCluster.gpuEnabled,
      });
      setShowAddModal(false);
      setNewCluster({
        name: '',
        type: 'docker',
        endpoint: '',
        region: '',
        maxWorkers: 10,
        gpuEnabled: false,
      });
      loadClusters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create cluster');
    }
  }

  async function handleDrainCluster(clusterId: string) {
    try {
      await api.adminClusterDrain(clusterId);
      loadClusters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to drain cluster');
    }
  }

  async function handleActivateCluster(clusterId: string) {
    try {
      await api.adminClusterActivate(clusterId);
      loadClusters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate cluster');
    }
  }

  async function handleDeleteCluster(clusterId: string) {
    if (!confirm('Are you sure you want to delete this cluster?')) return;
    try {
      await api.adminClusterDelete(clusterId);
      loadClusters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete cluster');
    }
  }

  async function handleDrainWorker(workerId: string) {
    try {
      await api.adminWorkersDrain(workerId);
      if (expandedCluster) loadWorkers(expandedCluster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to drain worker');
    }
  }

  async function handleActivateWorker(workerId: string) {
    try {
      await api.adminWorkersActivate(workerId);
      if (expandedCluster) loadWorkers(expandedCluster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate worker');
    }
  }

  async function handleRestartWorker(workerId: string) {
    if (!confirm('Are you sure you want to restart this worker?')) return;
    try {
      await api.adminWorkersRestart(workerId);
      if (expandedCluster) loadWorkers(expandedCluster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart worker');
    }
  }

  async function handleRemoveWorker(workerId: string) {
    if (!confirm('Are you sure you want to remove this worker?')) return;
    try {
      await api.adminWorkersRemove(workerId);
      if (expandedCluster) loadWorkers(expandedCluster);
      if (selectedWorker?.id === workerId) {
        setSelectedWorker(null);
        setShowWorkerModal(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove worker');
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'draining':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'offline':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      case 'error':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getWorkerStatusIndicator = (worker: Worker) => {
    if (!worker.isOnline) return 'bg-gray-500';
    if (worker.status === 'active') return 'bg-green-500';
    if (worker.status === 'draining') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // System diagnostics query
  const { data: diagnostics, isLoading: diagnosticsLoading } = useQuery({
    queryKey: ['admin', 'diagnostics'],
    queryFn: () => api.getSystemDiagnostics(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // GPU overview query
  const { data: gpuOverview, isLoading: gpuLoading } = useQuery({
    queryKey: ['admin', 'gpu', 'overview'],
    queryFn: () => api.adminGPUOverview(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (loading && diagnosticsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  const getServiceStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Infrastructure</h1>
          <p className="text-text-muted mt-1">System health and render cluster management</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Cluster
        </button>
      </div>

      {/* System Diagnostics */}
      {diagnostics && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">System Health</h2>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${getServiceStatusColor(diagnostics.status)}`}
              />
              <span className="text-sm text-text-muted capitalize">{diagnostics.status}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {Object.entries(diagnostics.services).map(([name, service]) => (
              <div key={name} className="p-4 bg-surface-hover rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-primary capitalize">{name}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${getServiceStatusColor(service.status)}`}
                  />
                </div>
                <div className="text-xs text-text-muted">
                  {service.status === 'not_configured'
                    ? 'Not configured'
                    : `${service.latency || 0}ms latency`}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">
                {diagnostics.stats.totalUsers.toLocaleString()}
              </div>
              <div className="text-xs text-text-muted">Total Users</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">
                {diagnostics.stats.totalVideos.toLocaleString()}
              </div>
              <div className="text-xs text-text-muted">Total Videos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">
                {diagnostics.stats.activeSessions.toLocaleString()}
              </div>
              <div className="text-xs text-text-muted">Active Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">
                {Math.round(diagnostics.environment.memory.used)}MB
              </div>
              <div className="text-xs text-text-muted">
                Memory ({Math.round((diagnostics.environment.memory.used / diagnostics.environment.memory.total) * 100)}%)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GPU Overview */}
      {gpuOverview && gpuOverview.totalGPUs > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">GPU Resources</h2>
            <Link
              href="/admin/infrastructure/gpu"
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              View Details →
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-text-primary">{gpuOverview.totalGPUs}</div>
              <div className="text-xs text-text-muted">Total GPUs</div>
            </div>
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-green-400">{gpuOverview.availableGPUs}</div>
              <div className="text-xs text-text-muted">Available</div>
            </div>
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-yellow-400">{gpuOverview.allocatedGPUs}</div>
              <div className="text-xs text-text-muted">Allocated</div>
            </div>
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-accent">{gpuOverview.utilizationPercent}%</div>
              <div className="text-xs text-text-muted">Avg Utilization</div>
            </div>
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="text-2xl font-bold text-text-primary">{gpuOverview.activeWorkers}</div>
              <div className="text-xs text-text-muted">Active Workers</div>
            </div>
          </div>

          {/* GPU Types Breakdown */}
          {Object.keys(gpuOverview.gpuTypes).length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-text-primary mb-2">GPU Types</div>
              {Object.entries(gpuOverview.gpuTypes).map(([model, stats]) => (
                <div key={model} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 7H7v6h6V7z" />
                      <path
                        fillRule="evenodd"
                        d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm text-text-primary">{model}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-text-muted">
                      {stats.total} total
                    </span>
                    <span className="text-xs text-green-400">
                      {stats.total - stats.allocated} available
                    </span>
                    <span className="text-xs text-yellow-400">
                      {stats.allocated} allocated
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Cluster Grid */}
      <div className="space-y-4">
        {clusters.map((cluster) => (
          <div key={cluster.id} className="bg-zinc-900 rounded-lg border border-zinc-800">
            {/* Cluster Header */}
            <div
              className={`p-4 cursor-pointer transition-colors ${
                selectedCluster === cluster.id
                  ? 'bg-primary-500/10'
                  : 'hover:bg-zinc-800/50'
              }`}
              onClick={() => {
                setSelectedCluster(cluster.id);
                setExpandedCluster(expandedCluster === cluster.id ? null : cluster.id);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-white text-lg">{cluster.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded border ${getStatusColor(cluster.status)}`}
                    >
                      {cluster.status}
                    </span>
                    <span className="text-sm text-gray-500">
                      {cluster.type === 'kubernetes' ? 'Kubernetes' : 'Docker'}
                      {cluster.region && ` • ${cluster.region}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 max-w-2xl">
                    <div className="text-center p-2 bg-zinc-800 rounded">
                      <div className="text-lg font-semibold text-white">
                        {cluster.workerStats?.total || 0}
                      </div>
                      <div className="text-xs text-gray-500">Workers</div>
                    </div>
                    <div className="text-center p-2 bg-zinc-800 rounded">
                      <div className="text-lg font-semibold text-green-400">
                        {cluster.workerStats?.active || 0}
                      </div>
                      <div className="text-xs text-gray-500">Active</div>
                    </div>
                    <div className="text-center p-2 bg-zinc-800 rounded">
                      <div className="text-lg font-semibold text-red-400">
                        {cluster.workerStats?.offline || 0}
                      </div>
                      <div className="text-xs text-gray-500">Offline</div>
                    </div>
                    <div className="text-center p-2 bg-zinc-800 rounded">
                      <div className="text-lg font-semibold text-yellow-400">
                        {cluster.maxWorkers || '∞'}
                      </div>
                      <div className="text-xs text-gray-500">Max Workers</div>
                    </div>
                  </div>

                  {cluster.gpuEnabled && (
                    <div className="flex items-center gap-2 text-sm text-yellow-400 mt-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 7H7v6h6V7z" />
                        <path
                          fillRule="evenodd"
                          d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z"
                          clipRule="evenodd"
                        />
                      </svg>
                      GPU Enabled ({cluster.gpuCount} GPUs)
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {cluster.status === 'active' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDrainCluster(cluster.id);
                      }}
                      className="px-3 py-1.5 text-sm bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
                    >
                      Drain
                    </button>
                  ) : cluster.status === 'draining' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivateCluster(cluster.id);
                      }}
                      className="px-3 py-1.5 text-sm bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                    >
                      Activate
                    </button>
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCluster(cluster.id);
                    }}
                    className="px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {/* Workers List (Expanded) */}
            {expandedCluster === cluster.id && (
              <div className="border-t border-zinc-800 p-4">
                <h4 className="text-sm font-semibold text-white mb-3">Workers</h4>
                {workers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No workers in this cluster
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workers.map((worker) => (
                      <div
                        key={worker.id}
                        className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedWorker(worker);
                          setShowWorkerModal(true);
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span
                            className={`w-3 h-3 rounded-full ${getWorkerStatusIndicator(worker)}`}
                          />
                          <div>
                            <div className="font-medium text-white">{worker.hostname}</div>
                            <div className="text-xs text-gray-500">
                              {worker.activeJobs} active • {worker.totalProcessed} processed
                              {worker.gpuEnabled && ' • GPU'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {/* Resource usage bars */}
                          <div className="flex gap-2">
                            {worker.metadata?.cpu !== undefined && (
                              <div className="text-xs">
                                <div className="text-gray-500">CPU</div>
                                <div className="w-16 h-2 bg-zinc-900 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500"
                                    style={{ width: `${worker.metadata.cpu}%` }}
                                  />
                                </div>
                                <div className="text-white text-center">{worker.metadata.cpu}%</div>
                              </div>
                            )}
                            {worker.metadata?.memory !== undefined && (
                              <div className="text-xs">
                                <div className="text-gray-500">RAM</div>
                                <div className="w-16 h-2 bg-zinc-900 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-green-500"
                                    style={{ width: `${worker.metadata.memory}%` }}
                                  />
                                </div>
                                <div className="text-white text-center">{worker.metadata.memory}%</div>
                              </div>
                            )}
                            {worker.gpuEnabled && worker.metadata?.gpu !== undefined && (
                              <div className="text-xs">
                                <div className="text-gray-500">GPU</div>
                                <div className="w-16 h-2 bg-zinc-900 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-yellow-500"
                                    style={{ width: `${worker.metadata.gpu}%` }}
                                  />
                                </div>
                                <div className="text-white text-center">{worker.metadata.gpu}%</div>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {worker.status === 'active' ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDrainWorker(worker.id);
                                }}
                                className="px-2 py-1 text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
                              >
                                Drain
                              </button>
                            ) : worker.status === 'draining' ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActivateWorker(worker.id);
                                }}
                                className="px-2 py-1 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                              >
                                Activate
                              </button>
                            ) : null}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestartWorker(worker.id);
                              }}
                              className="px-2 py-1 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded transition-colors"
                            >
                              Restart
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveWorker(worker.id);
                              }}
                              className="px-2 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {clusters.length === 0 && (
          <div className="col-span-full p-8 text-center text-gray-500 bg-zinc-900 rounded-lg border border-zinc-800">
            No clusters configured. Add a cluster to get started.
          </div>
        )}
      </div>

      {/* Cluster Metrics Panel */}
      {selectedCluster && clusterMetrics && (
        <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <h3 className="text-lg font-semibold text-white mb-4">Cluster Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-white">{clusterMetrics.totalJobsProcessed}</div>
              <div className="text-sm text-gray-500">Total Jobs Processed</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-white">{clusterMetrics.activeJobs}</div>
              <div className="text-sm text-gray-500">Active Jobs</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-white">{clusterMetrics.averageProcessingTimeSeconds}s</div>
              <div className="text-sm text-gray-500">Avg Processing Time</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-green-400">{clusterMetrics.successRate.toFixed(1)}%</div>
              <div className="text-sm text-gray-500">Success Rate</div>
            </div>
          </div>
        </div>
      )}

      {/* Add Cluster Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md border border-zinc-800">
            <h2 className="text-xl font-semibold text-white mb-4">Add Cluster</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newCluster.name}
                  onChange={(e) => setNewCluster({ ...newCluster, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Production Workers"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Type</label>
                <select
                  value={newCluster.type}
                  onChange={(e) =>
                    setNewCluster({ ...newCluster, type: e.target.value as 'docker' | 'kubernetes' })
                  }
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="docker">Docker</option>
                  <option value="kubernetes">Kubernetes</option>
                </select>
              </div>

              {newCluster.type === 'kubernetes' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">API Endpoint</label>
                  <input
                    type="text"
                    value={newCluster.endpoint}
                    onChange={(e) => setNewCluster({ ...newCluster, endpoint: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="https://k8s.example.com"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Region</label>
                <input
                  type="text"
                  value={newCluster.region}
                  onChange={(e) => setNewCluster({ ...newCluster, region: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="us-east-1"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Max Workers</label>
                <input
                  type="number"
                  value={newCluster.maxWorkers}
                  onChange={(e) =>
                    setNewCluster({ ...newCluster, maxWorkers: parseInt(e.target.value) || 10 })
                  }
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gpuEnabled"
                  checked={newCluster.gpuEnabled}
                  onChange={(e) => setNewCluster({ ...newCluster, gpuEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-primary-500 focus:ring-primary-500"
                />
                <label htmlFor="gpuEnabled" className="text-sm text-gray-400">
                  GPU Enabled
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCluster}
                disabled={!newCluster.name}
                className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Worker Detail Modal */}
      {showWorkerModal && selectedWorker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-lg w-full max-w-4xl border border-zinc-800 max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">{selectedWorker.hostname}</h2>
                <p className="text-sm text-gray-500 mt-1">Worker ID: {selectedWorker.id}</p>
              </div>
              <button
                onClick={() => {
                  setShowWorkerModal(false);
                  setSelectedWorker(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Worker Status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-zinc-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`w-2 h-2 rounded-full ${getWorkerStatusIndicator(selectedWorker)}`}
                    />
                    <span className="text-sm text-gray-400">Status</span>
                  </div>
                  <div className="text-lg font-semibold text-white capitalize">{selectedWorker.status}</div>
                </div>
                <div className="p-4 bg-zinc-800 rounded-lg">
                  <div className="text-sm text-gray-400 mb-2">Active Jobs</div>
                  <div className="text-lg font-semibold text-white">{selectedWorker.activeJobs}</div>
                </div>
                <div className="p-4 bg-zinc-800 rounded-lg">
                  <div className="text-sm text-gray-400 mb-2">Concurrency</div>
                  <div className="text-lg font-semibold text-white">{selectedWorker.concurrency}</div>
                </div>
                <div className="p-4 bg-zinc-800 rounded-lg">
                  <div className="text-sm text-gray-400 mb-2">Online</div>
                  <div className="text-lg font-semibold text-white">{selectedWorker.isOnline ? 'Yes' : 'No'}</div>
                </div>
              </div>

              {/* Worker Metrics */}
              {workerMetrics && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Metrics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <div className="text-sm text-gray-400 mb-2">Total Processed</div>
                      <div className="text-lg font-semibold text-white">{workerMetrics.metrics.totalProcessed}</div>
                    </div>
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <div className="text-sm text-gray-400 mb-2">Failed</div>
                      <div className="text-lg font-semibold text-red-400">{workerMetrics.metrics.failedJobs}</div>
                    </div>
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <div className="text-sm text-gray-400 mb-2">Success Rate</div>
                      <div className="text-lg font-semibold text-green-400">{workerMetrics.metrics.successRate.toFixed(1)}%</div>
                    </div>
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <div className="text-sm text-gray-400 mb-2">Avg Time</div>
                      <div className="text-lg font-semibold text-white">{workerMetrics.metrics.avgProcessingTimeSeconds}s</div>
                    </div>
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <div className="text-sm text-gray-400 mb-2">Uptime</div>
                      <div className="text-lg font-semibold text-white">{workerMetrics.metrics.uptimeHours}h</div>
                    </div>
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <div className="text-sm text-gray-400 mb-2">CPU Usage</div>
                      <div className="text-lg font-semibold text-blue-400">{workerMetrics.metrics.resourceUsage.cpu}%</div>
                    </div>
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <div className="text-sm text-gray-400 mb-2">Memory Usage</div>
                      <div className="text-lg font-semibold text-green-400">{workerMetrics.metrics.resourceUsage.memory}%</div>
                    </div>
                    {workerMetrics.metrics.resourceUsage.gpu !== undefined && (
                      <div className="p-4 bg-zinc-800 rounded-lg">
                        <div className="text-sm text-gray-400 mb-2">GPU Usage</div>
                        <div className="text-lg font-semibold text-yellow-400">{workerMetrics.metrics.resourceUsage.gpu}%</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Worker Logs */}
              {workerLogs && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Recent Logs</h3>
                  <div className="bg-black rounded-lg p-4 font-mono text-xs text-gray-300 max-h-96 overflow-auto">
                    {workerLogs.logs.map((log, i) => (
                      <div key={i} className="py-1">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GPU Info */}
              {selectedWorker.gpuEnabled && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">GPU Information</h3>
                  <div className="p-4 bg-zinc-800 rounded-lg">
                    <div className="text-sm text-gray-400 mb-2">GPU Model</div>
                    <div className="text-white">{selectedWorker.gpuModel || 'Unknown'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
