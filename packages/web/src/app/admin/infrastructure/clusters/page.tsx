'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface ClusterConfig {
  id: string;
  name: string;
  type: 'docker' | 'kubernetes' | 'docker-compose' | 'docker-swarm';
  endpoint: string;
  tls?: {
    enabled: boolean;
    caCert?: string;
    clientCert?: string;
    clientKey?: string;
    skipVerify?: boolean;
  };
  auth?: {
    type: 'none' | 'basic' | 'token' | 'certificate';
    username?: string;
    password?: string;
    token?: string;
  };
  config?: {
    namespace?: string;
    context?: string;
    kubeconfigPath?: string;
    dockerHost?: string;
  };
  resources?: {
    maxCpu?: string;
    maxMemory?: string;
    maxGpu?: number;
  };
  status: 'active' | 'inactive' | 'error' | 'draining' | 'offline';
  region?: string;
  gpuEnabled: boolean;
  gpuCount?: number;
  lastHealthCheck?: string;
  errorMessage?: string;
  workerStats?: {
    total: number;
    active: number;
    offline: number;
  };
}

export default function ClustersPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<ClusterConfig | null>(null);
  const queryClient = useQueryClient();

  const { data: clustersData, isLoading } = useQuery({
    queryKey: ['admin', 'clusters'],
    queryFn: async () => {
      const response = await fetch('/xrpc/io.exprsn.admin.cluster.list', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch clusters');
      return response.json() as Promise<{ clusters: ClusterConfig[] }>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch('/xrpc/io.exprsn.admin.cluster.delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId }),
      });
      if (!response.ok) throw new Error('Failed to delete cluster');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clusters'] });
      toast.success('Cluster deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (cluster: ClusterConfig) => {
      const response = await fetch('/xrpc/io.exprsn.admin.cluster.testConnection', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: cluster.id,
          type: cluster.type,
          endpoint: cluster.endpoint,
          tls: cluster.tls,
          auth: cluster.auth,
          config: cluster.config,
        }),
      });
      if (!response.ok) throw new Error('Failed to test connection');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ['admin', 'clusters'] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: Error) => {
      toast.error(`Connection test failed: ${error.message}`);
    },
  });

  const clusters = clustersData?.clusters || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'inactive':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      case 'draining':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'offline':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'error':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'kubernetes':
        return '⎈';
      case 'docker':
        return '🐳';
      case 'docker-compose':
        return '🐳';
      case 'docker-swarm':
        return '🐝';
      default:
        return '📦';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Render Clusters</h1>
          <p className="text-text-muted mt-1">
            Manage Docker and Kubernetes clusters for video rendering
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedCluster(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Cluster
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="bg-surface border border-border rounded-lg p-4 hover:border-accent/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getTypeIcon(cluster.type)}</span>
                <div>
                  <h3 className="font-semibold text-text-primary">{cluster.name}</h3>
                  <p className="text-sm text-text-muted capitalize">
                    {cluster.type.replace('-', ' ')}
                    {cluster.region && ` • ${cluster.region}`}
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-1 text-xs rounded border ${getStatusBadge(cluster.status)}`}
              >
                {cluster.status}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-xs text-text-muted">
                <span className="font-medium">Endpoint:</span>
                <div className="text-text-primary font-mono text-[11px] mt-1 truncate">
                  {cluster.endpoint}
                </div>
              </div>

              {cluster.tls?.enabled && (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  TLS Enabled
                </div>
              )}

              {cluster.auth?.type && cluster.auth.type !== 'none' && (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Auth: {cluster.auth.type}
                </div>
              )}
            </div>

            {cluster.workerStats && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center p-2 bg-surface-hover rounded">
                  <div className="text-lg font-semibold text-text-primary">
                    {cluster.workerStats.total}
                  </div>
                  <div className="text-xs text-text-muted">Workers</div>
                </div>
                <div className="text-center p-2 bg-surface-hover rounded">
                  <div className="text-lg font-semibold text-green-400">
                    {cluster.workerStats.active}
                  </div>
                  <div className="text-xs text-text-muted">Active</div>
                </div>
                <div className="text-center p-2 bg-surface-hover rounded">
                  <div className="text-lg font-semibold text-red-400">
                    {cluster.workerStats.offline}
                  </div>
                  <div className="text-xs text-text-muted">Offline</div>
                </div>
              </div>
            )}

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
                GPU Enabled ({cluster.gpuCount || 0} GPUs)
              </div>
            )}

            {cluster.errorMessage && (
              <div className="p-2 mb-3 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                {cluster.errorMessage}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => testConnectionMutation.mutate(cluster)}
                disabled={testConnectionMutation.isPending}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded transition-colors disabled:opacity-50"
              >
                Test
              </button>
              <button
                onClick={() => {
                  setSelectedCluster(cluster);
                  setShowModal(true);
                }}
                className="flex-1 px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete cluster "${cluster.name}"?`)) {
                    deleteMutation.mutate(cluster.id);
                  }
                }}
                className="px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {clusters.length === 0 && (
          <div className="col-span-full p-8 text-center text-text-muted bg-surface border border-border rounded-lg">
            No clusters configured. Add a cluster to enable distributed video rendering.
          </div>
        )}
      </div>

      {showModal && (
        <ClusterConfigModal
          cluster={selectedCluster}
          onClose={() => {
            setShowModal(false);
            setSelectedCluster(null);
          }}
        />
      )}
    </div>
  );
}

function ClusterConfigModal({
  cluster,
  onClose,
}: {
  cluster: ClusterConfig | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!cluster;

  const [formData, setFormData] = useState({
    name: cluster?.name || '',
    type: cluster?.type || ('kubernetes' as const),
    endpoint: cluster?.endpoint || '',
    region: cluster?.region || '',
    gpuEnabled: cluster?.gpuEnabled || false,
    gpuCount: cluster?.gpuCount || 0,
    tlsEnabled: cluster?.tls?.enabled || false,
    tlsCaCert: cluster?.tls?.caCert || '',
    tlsClientCert: cluster?.tls?.clientCert || '',
    tlsClientKey: cluster?.tls?.clientKey || '',
    tlsSkipVerify: cluster?.tls?.skipVerify || false,
    authType: cluster?.auth?.type || ('none' as const),
    authUsername: cluster?.auth?.username || '',
    authPassword: cluster?.auth?.password || '',
    authToken: cluster?.auth?.token || '',
    k8sNamespace: cluster?.config?.namespace || 'default',
    k8sContext: cluster?.config?.context || '',
    k8sKubeconfigPath: cluster?.config?.kubeconfigPath || '',
    dockerHost: cluster?.config?.dockerHost || '',
    maxCpu: cluster?.resources?.maxCpu || '',
    maxMemory: cluster?.resources?.maxMemory || '',
    maxGpu: cluster?.resources?.maxGpu || 0,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isEditing
        ? '/xrpc/io.exprsn.admin.cluster.update'
        : '/xrpc/io.exprsn.admin.cluster.create';

      const payload: any = {
        name: formData.name,
        type: formData.type,
        endpoint: formData.endpoint,
        region: formData.region || undefined,
        gpuEnabled: formData.gpuEnabled,
        gpuCount: formData.gpuCount,
        tls: {
          enabled: formData.tlsEnabled,
          caCert: formData.tlsCaCert || undefined,
          clientCert: formData.tlsClientCert || undefined,
          clientKey: formData.tlsClientKey || undefined,
          skipVerify: formData.tlsSkipVerify,
        },
        auth: {
          type: formData.authType,
          username: formData.authUsername || undefined,
          password: formData.authPassword || undefined,
          token: formData.authToken || undefined,
        },
        config: {
          namespace: formData.k8sNamespace || undefined,
          context: formData.k8sContext || undefined,
          kubeconfigPath: formData.k8sKubeconfigPath || undefined,
          dockerHost: formData.dockerHost || undefined,
        },
        resources: {
          maxCpu: formData.maxCpu || undefined,
          maxMemory: formData.maxMemory || undefined,
          maxGpu: formData.maxGpu || undefined,
        },
      };

      if (isEditing) {
        payload.clusterId = cluster.id;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save cluster');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clusters'] });
      toast.success(isEditing ? 'Cluster updated' : 'Cluster created');
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-border p-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">
            {isEditing ? 'Edit Cluster' : 'Add Cluster'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">Basic Configuration</h3>

            <div>
              <label className="block text-sm text-text-muted mb-1">Cluster Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                placeholder="Production Cluster"
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Cluster Type</label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as any,
                  })
                }
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
              >
                <option value="kubernetes">Kubernetes</option>
                <option value="docker">Docker</option>
                <option value="docker-compose">Docker Compose</option>
                <option value="docker-swarm">Docker Swarm</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">
                Endpoint
                <span className="ml-2 text-xs">
                  {formData.type === 'kubernetes'
                    ? '(e.g., https://k8s.example.com:6443)'
                    : '(e.g., tcp://localhost:2375 or https://docker.example.com)'}
                </span>
              </label>
              <input
                type="text"
                value={formData.endpoint}
                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-sm"
                placeholder={
                  formData.type === 'kubernetes'
                    ? 'https://k8s.example.com:6443'
                    : 'tcp://localhost:2375'
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Region (Optional)</label>
                <input
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  placeholder="us-west-1"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-6">
                  <input
                    type="checkbox"
                    checked={formData.gpuEnabled}
                    onChange={(e) => setFormData({ ...formData, gpuEnabled: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-text-primary">GPU Enabled</span>
                </label>
              </div>
            </div>

            {formData.gpuEnabled && (
              <div>
                <label className="block text-sm text-text-muted mb-1">GPU Count</label>
                <input
                  type="number"
                  value={formData.gpuCount}
                  onChange={(e) =>
                    setFormData({ ...formData, gpuCount: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  min="0"
                />
              </div>
            )}
          </div>

          {/* TLS Configuration */}
          <div className="space-y-4 border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">TLS Configuration</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.tlsEnabled}
                  onChange={(e) => setFormData({ ...formData, tlsEnabled: e.target.checked })}
                  className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm text-text-primary">Enable TLS</span>
              </label>
            </div>

            {formData.tlsEnabled && (
              <>
                <div>
                  <label className="block text-sm text-text-muted mb-1">
                    CA Certificate (PEM)
                  </label>
                  <textarea
                    value={formData.tlsCaCert}
                    onChange={(e) => setFormData({ ...formData, tlsCaCert: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-xs"
                    rows={4}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-muted mb-1">
                    Client Certificate (PEM)
                  </label>
                  <textarea
                    value={formData.tlsClientCert}
                    onChange={(e) => setFormData({ ...formData, tlsClientCert: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-xs"
                    rows={4}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-muted mb-1">Client Key (PEM)</label>
                  <textarea
                    value={formData.tlsClientKey}
                    onChange={(e) => setFormData({ ...formData, tlsClientKey: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-xs"
                    rows={4}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.tlsSkipVerify}
                    onChange={(e) => setFormData({ ...formData, tlsSkipVerify: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-text-primary">Skip TLS Verification</span>
                  <span className="text-xs text-red-400">(Not recommended for production)</span>
                </label>
              </>
            )}
          </div>

          {/* Authentication */}
          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-lg font-semibold text-text-primary">Authentication</h3>

            <div>
              <label className="block text-sm text-text-muted mb-1">Authentication Type</label>
              <select
                value={formData.authType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    authType: e.target.value as any,
                  })
                }
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
              >
                <option value="none">None</option>
                <option value="basic">Basic (Username/Password)</option>
                <option value="token">Bearer Token</option>
                <option value="certificate">Certificate</option>
              </select>
            </div>

            {formData.authType === 'basic' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.authUsername}
                    onChange={(e) => setFormData({ ...formData, authUsername: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.authPassword}
                    onChange={(e) => setFormData({ ...formData, authPassword: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  />
                </div>
              </div>
            )}

            {formData.authType === 'token' && (
              <div>
                <label className="block text-sm text-text-muted mb-1">Bearer Token</label>
                <input
                  type="password"
                  value={formData.authToken}
                  onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-sm"
                  placeholder="eyJhbGciOiJSUzI1NiIs..."
                />
              </div>
            )}
          </div>

          {/* Kubernetes-specific Configuration */}
          {formData.type === 'kubernetes' && (
            <div className="space-y-4 border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-text-primary">
                Kubernetes Configuration
              </h3>

              <div>
                <label className="block text-sm text-text-muted mb-1">Namespace</label>
                <input
                  type="text"
                  value={formData.k8sNamespace}
                  onChange={(e) => setFormData({ ...formData, k8sNamespace: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  placeholder="default"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">
                  Context (Optional)
                </label>
                <input
                  type="text"
                  value={formData.k8sContext}
                  onChange={(e) => setFormData({ ...formData, k8sContext: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  placeholder="production-cluster"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">
                  Kubeconfig Path (Optional)
                </label>
                <input
                  type="text"
                  value={formData.k8sKubeconfigPath}
                  onChange={(e) =>
                    setFormData({ ...formData, k8sKubeconfigPath: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-sm"
                  placeholder="/home/user/.kube/config"
                />
              </div>
            </div>
          )}

          {/* Docker-specific Configuration */}
          {(formData.type === 'docker' ||
            formData.type === 'docker-compose' ||
            formData.type === 'docker-swarm') && (
            <div className="space-y-4 border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-text-primary">Docker Configuration</h3>

              <div>
                <label className="block text-sm text-text-muted mb-1">
                  Docker Host (Optional)
                </label>
                <input
                  type="text"
                  value={formData.dockerHost}
                  onChange={(e) => setFormData({ ...formData, dockerHost: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-sm"
                  placeholder="unix:///var/run/docker.sock"
                />
              </div>
            </div>
          )}

          {/* Resource Limits */}
          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-lg font-semibold text-text-primary">Resource Limits</h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Max CPU</label>
                <input
                  type="text"
                  value={formData.maxCpu}
                  onChange={(e) => setFormData({ ...formData, maxCpu: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  placeholder="4000m"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">Max Memory</label>
                <input
                  type="text"
                  value={formData.maxMemory}
                  onChange={(e) => setFormData({ ...formData, maxMemory: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  placeholder="8Gi"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">Max GPU</label>
                <input
                  type="number"
                  value={formData.maxGpu}
                  onChange={(e) =>
                    setFormData({ ...formData, maxGpu: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                  min="0"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-border p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!formData.name || !formData.endpoint || saveMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update Cluster' : 'Create Cluster'}
          </button>
        </div>
      </div>
    </div>
  );
}
