'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SystemDiagnostics } from '@/lib/api';

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
  const [metrics, setMetrics] = useState<ClusterMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
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
    if (selectedCluster) {
      loadMetrics(selectedCluster);
    }
  }, [selectedCluster]);

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

  async function loadMetrics(clusterId: string) {
    try {
      const data = await api.adminClusterGetMetrics(clusterId);
      setMetrics(data.metrics);
    } catch (err) {
      console.error('Failed to load metrics:', err);
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

  // System diagnostics query
  const { data: diagnostics, isLoading: diagnosticsLoading } = useQuery({
    queryKey: ['admin', 'diagnostics'],
    queryFn: () => api.getSystemDiagnostics(),
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

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Cluster Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((cluster) => (
          <div
            key={cluster.id}
            className={`p-4 bg-zinc-900 rounded-lg border ${
              selectedCluster === cluster.id
                ? 'border-primary-500'
                : 'border-zinc-800 hover:border-zinc-700'
            } cursor-pointer transition-colors`}
            onClick={() => setSelectedCluster(cluster.id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-white">{cluster.name}</h3>
                <p className="text-sm text-gray-500">
                  {cluster.type === 'kubernetes' ? 'Kubernetes' : 'Docker'} {cluster.region && `• ${cluster.region}`}
                </p>
              </div>
              <span
                className={`px-2 py-1 text-xs rounded border ${getStatusColor(cluster.status)}`}
              >
                {cluster.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
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
            </div>

            {cluster.gpuEnabled && (
              <div className="flex items-center gap-2 text-sm text-yellow-400 mb-3">
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

            <div className="flex gap-2">
              {cluster.status === 'active' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDrainCluster(cluster.id);
                  }}
                  className="flex-1 px-3 py-1.5 text-sm bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
                >
                  Drain
                </button>
              ) : cluster.status === 'draining' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleActivateCluster(cluster.id);
                  }}
                  className="flex-1 px-3 py-1.5 text-sm bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded transition-colors"
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
        ))}

        {clusters.length === 0 && (
          <div className="col-span-full p-8 text-center text-gray-500 bg-zinc-900 rounded-lg border border-zinc-800">
            No clusters configured. Add a cluster to get started.
          </div>
        )}
      </div>

      {/* Metrics Panel */}
      {selectedCluster && metrics && (
        <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <h3 className="text-lg font-semibold text-white mb-4">Cluster Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-white">{metrics.totalJobsProcessed}</div>
              <div className="text-sm text-gray-500">Total Jobs Processed</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-white">{metrics.activeJobs}</div>
              <div className="text-sm text-gray-500">Active Jobs</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-white">{metrics.averageProcessingTimeSeconds}s</div>
              <div className="text-sm text-gray-500">Avg Processing Time</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-2xl font-bold text-green-400">{metrics.successRate.toFixed(1)}%</div>
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
    </div>
  );
}
