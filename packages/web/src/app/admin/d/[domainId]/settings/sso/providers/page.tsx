// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  SearchInput,
  FilterDropdown,
  ConfirmDialog,
  PageSkeleton,
} from '@/components/admin/ui';
import { ProviderCard } from '@/components/admin/sso';

interface SSOProvider {
  id: string;
  name: string;
  type: 'oidc' | 'saml' | 'oauth2';
  status: 'active' | 'inactive' | 'error';
  isPrimary: boolean;
  issuer?: string;
  clientId?: string;
  entityId?: string;
  lastSync?: string;
  userCount?: number;
  logo?: string;
}

export default function SSOProvidersPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SSOProvider | null>(null);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers', search, typeFilter, statusFilter],
    queryFn: () => api.adminDomainSSOProvidersList(domainId),
    enabled: !!domainId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.adminDomainSSOProviderToggle(domainId, id, enabled),
    onSuccess: () => {
      toast.success('Provider updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
    },
    onError: () => {
      toast.error('Failed to update provider');
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainSSOProvidersSetPrimary(domainId, id),
    onSuccess: () => {
      toast.success('Primary provider updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
    },
    onError: () => {
      toast.error('Failed to set primary provider');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainSSOProvidersRemove(domainId, id),
    onSuccess: () => {
      toast.success('Provider removed');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error('Failed to remove provider');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  let providers: SSOProvider[] = data?.providers || [];

  // Apply filters
  if (search) {
    providers = providers.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.issuer?.toLowerCase().includes(search.toLowerCase())
    );
  }
  if (typeFilter.length > 0) {
    providers = providers.filter(p => typeFilter.includes(p.type));
  }
  if (statusFilter.length > 0) {
    providers = providers.filter(p => statusFilter.includes(p.status));
  }

  const typeOptions = [
    { value: 'oidc', label: 'OpenID Connect' },
    { value: 'saml', label: 'SAML 2.0' },
    { value: 'oauth2', label: 'OAuth 2.0' },
  ];

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'error', label: 'Error' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Identity Providers"
        description={`Manage SSO providers for ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers/new`)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Add Provider
          </button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search providers..."
          className="w-64"
        />
        <FilterDropdown
          label="Type"
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <FilterDropdown
          label="Status"
          options={statusOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {/* Providers Grid */}
      {providers.length === 0 ? (
        <div className="p-12 bg-surface border border-border rounded-xl text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-surface-hover rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-text-primary mb-2">
            {search || typeFilter.length > 0 || statusFilter.length > 0
              ? 'No providers match your filters'
              : 'No providers configured'}
          </h4>
          <p className="text-sm text-text-muted mb-4">
            {search || typeFilter.length > 0 || statusFilter.length > 0
              ? 'Try adjusting your search or filters'
              : 'Add an identity provider to enable SSO'}
          </p>
          {!search && typeFilter.length === 0 && statusFilter.length === 0 && (
            <button
              onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers/new`)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Add First Provider
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers/${provider.id}`)}
              onToggle={(enabled) => toggleMutation.mutate({ id: provider.id, enabled })}
              onSetPrimary={() => setPrimaryMutation.mutate(provider.id)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Remove Provider?"
        message={`Are you sure you want to remove ${deleteTarget?.name}? Users who have linked their accounts will need to re-link after adding a new provider.`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
