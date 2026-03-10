'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/admin/ui/DataTable';
import toast from 'react-hot-toast';

interface ExprsnDirectory {
  id: string;
  name: string;
  url: string;
  description?: string;
  status: 'online' | 'offline' | 'syncing' | 'error';
  isPrimary: boolean;
  lastSyncAt?: string;
  recordCount: number;
  version?: string;
  createdAt: string;
}

export default function ExprsnDirectoriesPage() {
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'exprsn-directories', search],
    queryFn: () => api.adminDirectoriesList(search || undefined),
  });

  const directories = data?.directories || [];
  const stats = data?.stats || { total: 0, online: 0, syncing: 0, totalRecords: 0 };

  const syncMutation = useMutation({
    mutationFn: (directoryId: string) => api.adminDirectoriesSync(directoryId),
    onSuccess: () => {
      toast.success('Sync started');
      queryClient.invalidateQueries({ queryKey: ['admin', 'exprsn-directories'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to start sync');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (directoryId: string) => api.adminDirectoriesDelete(directoryId),
    onSuccess: () => {
      toast.success('Directory deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'exprsn-directories'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete directory');
    },
  });

  const handleSync = (directoryId: string) => {
    syncMutation.mutate(directoryId);
  };

  const handleDelete = (directoryId: string, name: string, isPrimary: boolean) => {
    if (isPrimary) {
      toast.error('Cannot delete primary directory');
      return;
    }
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteMutation.mutate(directoryId);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Directory Name',
      render: (dir: ExprsnDirectory) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary">{dir.name}</span>
            {dir.isPrimary && (
              <span className="px-1.5 py-0.5 text-xs bg-accent/10 text-accent rounded">
                Primary
              </span>
            )}
          </div>
          <div className="text-sm text-text-muted">{dir.url}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (dir: ExprsnDirectory) => (
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            dir.status === 'online'
              ? 'bg-green-500/10 text-green-500'
              : dir.status === 'syncing'
              ? 'bg-yellow-500/10 text-yellow-500'
              : dir.status === 'error'
              ? 'bg-red-500/10 text-red-500'
              : 'bg-gray-500/10 text-gray-500'
          }`}
        >
          {dir.status}
        </span>
      ),
    },
    {
      key: 'recordCount',
      header: 'Records',
      render: (dir: ExprsnDirectory) => (
        <span className="text-text-secondary">{dir.recordCount.toLocaleString()}</span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (dir: ExprsnDirectory) => (
        <span className="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted">
          v{dir.version || '1.0.0'}
        </span>
      ),
    },
    {
      key: 'lastSync',
      header: 'Last Sync',
      render: (dir: ExprsnDirectory) => (
        <span className="text-text-muted text-sm">
          {dir.lastSyncAt ? new Date(dir.lastSyncAt).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (dir: ExprsnDirectory) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleSync(dir.id)}
            disabled={syncMutation.isPending || dir.status === 'syncing'}
            className="px-3 py-1 text-sm text-accent hover:text-accent-hover disabled:opacity-50"
          >
            {dir.status === 'syncing' ? 'Syncing...' : 'Sync Now'}
          </button>
          <button className="px-3 py-1 text-sm text-text-muted hover:text-text-primary">
            Configure
          </button>
          {!dir.isPrimary && (
            <button
              onClick={() => handleDelete(dir.id, dir.name, dir.isPrimary)}
              className="px-3 py-1 text-sm text-red-500 hover:text-red-400"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Exprsn Directories</h1>
          <p className="text-text-muted mt-1">
            Manage Exprsn directory servers for identity and content discovery
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
        >
          Add Directory
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-500 text-sm">
            Failed to load directories: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Directories</p>
          <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Online</p>
          <p className="text-2xl font-bold text-green-500">{stats.online}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Syncing</p>
          <p className="text-2xl font-bold text-yellow-500">{stats.syncing}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Records</p>
          <p className="text-2xl font-bold text-text-primary">
            {stats.totalRecords.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <input
          type="search"
          placeholder="Search directories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Table */}
      <DataTable
        data={directories}
        columns={columns}
        keyExtractor={(dir) => dir.id}
        isLoading={isLoading}
        emptyMessage="No Exprsn directories configured"
      />

      {/* Create Modal - placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Add Directory</h2>
            <p className="text-text-muted mb-4">Directory creation form coming soon.</p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-surface-hover text-text-primary rounded-lg hover:bg-border transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
