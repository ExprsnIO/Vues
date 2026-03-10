'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/admin/ui/DataTable';
import { FilterDropdown } from '@/components/admin/ui/FilterDropdown';
import toast from 'react-hot-toast';

interface AuthenticationConfig {
  id: string;
  name: string;
  type: 'oidc' | 'saml' | 'oauth2' | 'ldap';
  status: 'active' | 'inactive' | 'testing';
  domainCount: number;
  lastUsedAt?: string;
  createdAt: string;
}

export default function AuthenticationPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'authentication', 'providers', search, typeFilter, statusFilter],
    queryFn: () => api.adminAuthListProviders({
      search: search || undefined,
      type: typeFilter[0],
      status: statusFilter[0],
    }),
  });

  const configs = data?.providers || [];
  const stats = data?.stats || { total: 0, active: 0, oauth: 0, samlLdap: 0 };

  const deleteMutation = useMutation({
    mutationFn: (providerId: string) => api.adminAuthDeleteProvider(providerId),
    onSuccess: () => {
      toast.success('Provider deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'authentication'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete provider');
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ providerId, status }: { providerId: string; status: string }) =>
      api.adminAuthUpdateProvider(providerId, { status }),
    onSuccess: () => {
      toast.success('Provider status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'authentication'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update provider');
    },
  });

  const handleDelete = (providerId: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteMutation.mutate(providerId);
    }
  };

  const handleToggleStatus = (providerId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    toggleStatusMutation.mutate({ providerId, status: newStatus });
  };

  const columns = [
    {
      key: 'name',
      header: 'Provider Name',
      render: (config: AuthenticationConfig) => (
        <div className="font-medium text-text-primary">{config.name}</div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (config: AuthenticationConfig) => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-surface-hover text-text-secondary uppercase">
          {config.type}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (config: AuthenticationConfig) => (
        <button
          onClick={() => handleToggleStatus(config.id, config.status)}
          className={`px-2 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${
            config.status === 'active'
              ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
              : config.status === 'testing'
              ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
              : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
          }`}
        >
          {config.status}
        </button>
      ),
    },
    {
      key: 'domainCount',
      header: 'Domains Using',
      render: (config: AuthenticationConfig) => (
        <span className="text-text-secondary">{config.domainCount}</span>
      ),
    },
    {
      key: 'lastUsed',
      header: 'Last Used',
      render: (config: AuthenticationConfig) => (
        <span className="text-text-muted text-sm">
          {config.lastUsedAt ? new Date(config.lastUsedAt).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (config: AuthenticationConfig) => (
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm text-accent hover:text-accent-hover">
            Configure
          </button>
          <button
            onClick={() => handleDelete(config.id, config.name)}
            className="px-3 py-1 text-sm text-red-500 hover:text-red-400"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Authentication</h1>
          <p className="text-text-muted mt-1">
            Manage global authentication providers and SSO configurations
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
        >
          Add Provider
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-500 text-sm">
            Failed to load providers: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Providers</p>
          <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Active</p>
          <p className="text-2xl font-bold text-green-500">{stats.active}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">OAuth/OIDC</p>
          <p className="text-2xl font-bold text-text-primary">{stats.oauth}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">SAML/LDAP</p>
          <p className="text-2xl font-bold text-text-primary">{stats.samlLdap}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <input
          type="search"
          placeholder="Search providers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <FilterDropdown
          label="Type"
          options={[
            { value: 'oauth2', label: 'OAuth 2.0' },
            { value: 'oidc', label: 'OpenID Connect' },
            { value: 'saml', label: 'SAML' },
            { value: 'ldap', label: 'LDAP' },
          ]}
          selected={typeFilter}
          onChange={setTypeFilter}
        />
        <FilterDropdown
          label="Status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'testing', label: 'Testing' },
          ]}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {/* Table */}
      <DataTable
        data={configs}
        columns={columns}
        keyExtractor={(config) => config.id}
        isLoading={isLoading}
        emptyMessage="No authentication providers configured"
      />

      {/* Create Modal - placeholder for now */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Add Authentication Provider</h2>
            <p className="text-text-muted mb-4">Provider creation form coming soon.</p>
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
