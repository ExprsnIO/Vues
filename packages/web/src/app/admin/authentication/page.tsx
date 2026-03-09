'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/admin/ui/DataTable';
import { FilterDropdown } from '@/components/admin/ui/FilterDropdown';

interface AuthenticationConfig {
  id: string;
  name: string;
  type: 'oidc' | 'saml' | 'oauth2' | 'ldap';
  status: 'active' | 'inactive' | 'testing';
  domainCount: number;
  lastUsed?: string;
  createdAt: string;
}

export default function AuthenticationPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery<AuthenticationConfig[]>({
    queryKey: ['admin', 'authentication', 'configs'],
    queryFn: async () => {
      // TODO: Replace with actual API call
      return [
        {
          id: '1',
          name: 'Google OAuth',
          type: 'oauth2',
          status: 'active',
          domainCount: 12,
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Enterprise SAML',
          type: 'saml',
          status: 'active',
          domainCount: 5,
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'GitHub OAuth',
          type: 'oauth2',
          status: 'active',
          domainCount: 8,
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];
    },
  });

  const filteredConfigs = configs.filter((config) => {
    if (search && !config.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (typeFilter.length > 0 && !typeFilter.includes(config.type)) {
      return false;
    }
    if (statusFilter.length > 0 && !statusFilter.includes(config.status)) {
      return false;
    }
    return true;
  });

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
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            config.status === 'active'
              ? 'bg-green-500/10 text-green-500'
              : config.status === 'testing'
              ? 'bg-yellow-500/10 text-yellow-500'
              : 'bg-red-500/10 text-red-500'
          }`}
        >
          {config.status}
        </span>
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
          {config.lastUsed ? new Date(config.lastUsed).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (config: AuthenticationConfig) => (
        <button className="px-3 py-1 text-sm text-accent hover:text-accent-hover">
          Configure
        </button>
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
        <button className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors">
          Add Provider
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Providers</p>
          <p className="text-2xl font-bold text-text-primary">{configs.length}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Active</p>
          <p className="text-2xl font-bold text-green-500">
            {configs.filter((c) => c.status === 'active').length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">OAuth/OIDC</p>
          <p className="text-2xl font-bold text-text-primary">
            {configs.filter((c) => c.type === 'oauth2' || c.type === 'oidc').length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">SAML/LDAP</p>
          <p className="text-2xl font-bold text-text-primary">
            {configs.filter((c) => c.type === 'saml' || c.type === 'ldap').length}
          </p>
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
        data={filteredConfigs}
        columns={columns}
        keyExtractor={(config) => config.id}
        isLoading={isLoading}
        emptyMessage="No authentication providers configured"
      />
    </div>
  );
}
