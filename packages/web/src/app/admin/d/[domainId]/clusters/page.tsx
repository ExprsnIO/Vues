// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface DomainCluster {
  id: string;
  clusterId: string;
  domainId: string;
  isPrimary: boolean;
  cluster: {
    id: string;
    name: string;
    type: 'docker' | 'kubernetes';
    status: 'active' | 'draining' | 'offline' | 'error';
    region: string | null;
    gpuEnabled: boolean;
    gpuCount: number;
    workerStats?: {
      total: number;
      active: number;
      offline: number;
    };
  };
}

interface AvailableCluster {
  id: string;
  name: string;
  type: 'docker' | 'kubernetes';
  status: string;
  region: string | null;
  gpuEnabled: boolean;
}

export default function DomainClustersPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();
  const [showAssignModal, setShowAssignModal] = useState(false);

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: clustersData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'clusters'],
    queryFn: () => api.adminDomainClustersList(domainId),
    enabled: !!domainId,
  });

  const removeMutation = useMutation({
    mutationFn: (clusterId: string) => api.adminDomainClustersRemove({ domainId, clusterId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'clusters'] });
      toast.success('Cluster removed from domain');
    },
    onError: () => toast.error('Failed to remove cluster'),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (clusterId: string) => api.adminDomainClustersSetPrimary({ domainId, clusterId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'clusters'] });
      toast.success('Primary cluster updated');
    },
    onError: () => toast.error('Failed to set primary cluster'),
  });

  const domain = domainData?.domain;
  const clusters = clustersData?.clusters || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'draining': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'offline': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      case 'error': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
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
          <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Assign Cluster
        </button>
      </div>

      {/* Clusters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((dc: DomainCluster) => (
          <div key={dc.id} className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text-primary">{dc.cluster.name}</h3>
                  {dc.isPrimary && (
                    <span className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-muted">
                  {dc.cluster.type === 'kubernetes' ? 'Kubernetes' : 'Docker'}
                  {dc.cluster.region && ` • ${dc.cluster.region}`}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs rounded border ${getStatusBadge(dc.cluster.status)}`}>
                {dc.cluster.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-2 bg-surface-hover rounded">
                <div className="text-lg font-semibold text-text-primary">
                  {dc.cluster.workerStats?.total || 0}
                </div>
                <div className="text-xs text-text-muted">Workers</div>
              </div>
              <div className="text-center p-2 bg-surface-hover rounded">
                <div className="text-lg font-semibold text-green-400">
                  {dc.cluster.workerStats?.active || 0}
                </div>
                <div className="text-xs text-text-muted">Active</div>
              </div>
              <div className="text-center p-2 bg-surface-hover rounded">
                <div className="text-lg font-semibold text-red-400">
                  {dc.cluster.workerStats?.offline || 0}
                </div>
                <div className="text-xs text-text-muted">Offline</div>
              </div>
            </div>

            {dc.cluster.gpuEnabled && (
              <div className="flex items-center gap-2 text-sm text-yellow-400 mb-3">
                <GpuIcon className="w-4 h-4" />
                GPU Enabled ({dc.cluster.gpuCount} GPUs)
              </div>
            )}

            <div className="flex gap-2">
              {!dc.isPrimary && (
                <button
                  onClick={() => setPrimaryMutation.mutate(dc.clusterId)}
                  className="flex-1 px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
                >
                  Set Primary
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm('Remove this cluster from the domain?')) {
                    removeMutation.mutate(dc.clusterId);
                  }
                }}
                className="px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {clusters.length === 0 && (
          <div className="col-span-full p-8 text-center text-text-muted bg-surface border border-border rounded-lg">
            No clusters assigned to this domain. Assign a cluster to enable video processing.
          </div>
        )}
      </div>

      {showAssignModal && (
        <AssignClusterModal domainId={domainId} onClose={() => setShowAssignModal(false)} />
      )}
    </div>
  );
}

function AssignClusterModal({ domainId, onClose }: { domainId: string; onClose: () => void }) {
  const [selectedCluster, setSelectedCluster] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'clusters', 'available'],
    queryFn: () => api.adminDomainClustersAvailable(domainId),
  });

  const assignMutation = useMutation({
    mutationFn: () => api.adminDomainClustersAssign({ domainId, clusterId: selectedCluster, isPrimary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'clusters'] });
      toast.success('Cluster assigned to domain');
      onClose();
    },
    onError: () => toast.error('Failed to assign cluster'),
  });

  const availableClusters = data?.clusters || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Assign Cluster</h2>

        {isLoading ? (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : availableClusters.length === 0 ? (
          <div className="py-8 text-center text-text-muted">
            No available clusters to assign. All clusters are already assigned to this domain.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Select Cluster</label>
              <select
                value={selectedCluster}
                onChange={(e) => setSelectedCluster(e.target.value)}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              >
                <option value="">Choose a cluster...</option>
                {availableClusters.map((cluster: AvailableCluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.name} ({cluster.type}{cluster.region ? ` - ${cluster.region}` : ''})
                    {cluster.gpuEnabled ? ' [GPU]' : ''}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-text-primary">Set as primary cluster</span>
            </label>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => assignMutation.mutate()}
            disabled={!selectedCluster || assignMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {assignMutation.isPending ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M13 7H7v6h6V7z" />
      <path
        fillRule="evenodd"
        d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z"
        clipRule="evenodd"
      />
    </svg>
  );
}
