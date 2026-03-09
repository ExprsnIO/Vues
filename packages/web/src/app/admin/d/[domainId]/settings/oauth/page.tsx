'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/admin/ui/DataTable';

interface OAuthProvider {
  id: string;
  provider: 'google' | 'github' | 'apple' | 'microsoft' | 'twitter' | 'discord' | 'custom';
  name: string;
  clientId: string;
  enabled: boolean;
  userCount: number;
  lastLogin?: string;
  createdAt: string;
}

const PROVIDER_ICONS: Record<string, string> = {
  google: '🔵',
  github: '⚫',
  apple: '🍎',
  microsoft: '🟦',
  twitter: '🐦',
  discord: '🎮',
  custom: '⚙️',
};

export default function DomainOAuthPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: providers = [], isLoading } = useQuery<OAuthProvider[]>({
    queryKey: ['admin', 'domain', domainId, 'oauth-providers'],
    queryFn: async () => {
      // TODO: Replace with actual API call
      return [
        {
          id: '1',
          provider: 'google',
          name: 'Google',
          clientId: '123456789.apps.googleusercontent.com',
          enabled: true,
          userCount: 450,
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          provider: 'github',
          name: 'GitHub',
          clientId: 'gh_abc123',
          enabled: true,
          userCount: 120,
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          provider: 'apple',
          name: 'Apple',
          clientId: 'com.exprsn.app',
          enabled: false,
          userCount: 0,
          createdAt: new Date().toISOString(),
        },
      ];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'oauth-providers'] });
    },
  });

  const columns = [
    {
      key: 'provider',
      header: 'Provider',
      render: (provider: OAuthProvider) => (
        <div className="flex items-center gap-3">
          <span className="text-2xl">{PROVIDER_ICONS[provider.provider]}</span>
          <div>
            <div className="font-medium text-text-primary">{provider.name}</div>
            <div className="text-sm text-text-muted">{provider.clientId}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (provider: OAuthProvider) => (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={() =>
              toggleMutation.mutate({ id: provider.id, enabled: !provider.enabled })
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
        </label>
      ),
    },
    {
      key: 'userCount',
      header: 'Users',
      render: (provider: OAuthProvider) => (
        <span className="text-text-secondary">{provider.userCount}</span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      render: (provider: OAuthProvider) => (
        <span className="text-text-muted text-sm">
          {provider.lastLogin ? new Date(provider.lastLogin).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (provider: OAuthProvider) => (
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm text-accent hover:text-accent-hover">
            Configure
          </button>
          <button className="px-3 py-1 text-sm text-red-500 hover:text-red-400">
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">OAuth Providers</h1>
          <p className="text-text-muted mt-1">
            Configure OAuth authentication providers for this domain
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
        >
          Add Provider
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Providers</p>
          <p className="text-2xl font-bold text-text-primary">{providers.length}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Enabled</p>
          <p className="text-2xl font-bold text-green-500">
            {providers.filter((p) => p.enabled).length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">OAuth Users</p>
          <p className="text-2xl font-bold text-text-primary">
            {providers.reduce((sum, p) => sum + p.userCount, 0)}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Most Popular</p>
          <p className="text-2xl font-bold text-text-primary">
            {providers.length > 0
              ? providers.reduce((a, b) => (a.userCount > b.userCount ? a : b)).name
              : '-'}
          </p>
        </div>
      </div>

      {/* Available Providers */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="font-medium text-text-primary mb-3">Quick Add</h3>
        <div className="flex flex-wrap gap-2">
          {['Google', 'GitHub', 'Apple', 'Microsoft', 'Twitter', 'Discord'].map((name) => (
            <button
              key={name}
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-accent hover:text-accent transition-colors flex items-center gap-2"
            >
              <span>{PROVIDER_ICONS[name.toLowerCase()]}</span>
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={providers}
        columns={columns}
        keyExtractor={(provider) => provider.id}
        isLoading={isLoading}
        emptyMessage="No OAuth providers configured"
      />
    </div>
  );
}
