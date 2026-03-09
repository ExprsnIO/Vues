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
  Badge,
  ConfirmDialog,
  Tabs,
  PageSkeleton,
} from '@/components/admin/ui';
import {
  ProviderForm,
  JITProvisioningConfig,
  TestConnectionButton,
} from '@/components/admin/sso';

export default function SSOProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const providerId = params.providerId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('settings');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers', providerId],
    queryFn: () => api.adminDomainSSOProviderGet(domainId, providerId),
    enabled: !!domainId && !!providerId,
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers', providerId, 'stats'],
    queryFn: () => api.adminDomainSSOProviderStats(domainId, providerId),
    enabled: !!domainId && !!providerId,
  });

  const { data: linkedUsersData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers', providerId, 'users'],
    queryFn: () => api.adminDomainSSOProviderUsers(domainId, providerId),
    enabled: !!domainId && !!providerId && activeTab === 'users',
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainSSOProviderUpdate(domainId, providerId, data),
    onSuccess: () => {
      toast.success('Provider updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
    },
    onError: () => {
      toast.error('Failed to update provider');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.adminDomainSSOProvidersRemove(domainId, providerId),
    onSuccess: () => {
      toast.success('Provider deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
      router.push(`/admin/d/${domainId}/settings/sso/providers`);
    },
    onError: () => {
      toast.error('Failed to delete provider');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.adminDomainSSOProviderToggle(domainId, providerId, enabled),
    onSuccess: () => {
      toast.success('Provider status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
    },
    onError: () => {
      toast.error('Failed to update provider status');
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: () => api.adminDomainSSOProvidersSetPrimary(domainId, providerId),
    onSuccess: () => {
      toast.success('Set as primary provider');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
    },
    onError: () => {
      toast.error('Failed to set primary provider');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const provider = data?.provider;
  const stats = statsData?.stats || {};
  const linkedUsers = linkedUsersData?.users || [];

  if (!provider) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-lg font-medium text-text-primary mb-2">Provider not found</h2>
        <p className="text-text-muted mb-4">The requested provider could not be found.</p>
        <button
          onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers`)}
          className="text-accent hover:underline"
        >
          Back to providers
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'settings', label: 'Settings' },
    { id: 'provisioning', label: 'Provisioning' },
    { id: 'users', label: 'Linked Users' },
    { id: 'logs', label: 'Activity' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={provider.name}
        description={`${provider.type.toUpperCase()} identity provider`}
        actions={
          <div className="flex items-center gap-3">
            <TestConnectionButton
              onTest={() => api.adminDomainSSOProviderTest(domainId, providerId)}
            />
            {!provider.isPrimary && provider.status === 'active' && (
              <button
                onClick={() => setPrimaryMutation.mutate()}
                disabled={setPrimaryMutation.isPending}
                className="px-3 py-2 text-sm bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors"
              >
                Set as Primary
              </button>
            )}
            <button
              onClick={() => toggleMutation.mutate(provider.status !== 'active')}
              disabled={toggleMutation.isPending}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                provider.status === 'active'
                  ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                  : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
              }`}
            >
              {provider.status === 'active' ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="px-3 py-2 text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        }
      />

      {/* Status Banner */}
      <div className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            provider.status === 'active' ? 'bg-green-500' :
            provider.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
          }`} />
          <Badge variant={
            provider.status === 'active' ? 'success' :
            provider.status === 'error' ? 'danger' : 'default'
          }>
            {provider.status}
          </Badge>
          {provider.isPrimary && (
            <Badge variant="info">Primary</Badge>
          )}
          <Badge variant={
            provider.type === 'oidc' ? 'info' :
            provider.type === 'saml' ? 'purple' : 'success'
          }>
            {provider.type.toUpperCase()}
          </Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-text-muted">Logins (24h):</span>
            <span className="ml-2 font-medium text-text-primary">{stats.logins24h || 0}</span>
          </div>
          <div>
            <span className="text-text-muted">Linked Users:</span>
            <span className="ml-2 font-medium text-text-primary">{stats.linkedUsers || 0}</span>
          </div>
          <div>
            <span className="text-text-muted">Last Login:</span>
            <span className="ml-2 font-medium text-text-primary">
              {stats.lastLogin ? new Date(stats.lastLogin).toLocaleDateString() : 'Never'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl">
          <ProviderForm
            mode="edit"
            initialData={provider}
            onSubmit={updateMutation.mutate}
            onCancel={() => router.push(`/admin/d/${domainId}/settings/sso/providers`)}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      )}

      {activeTab === 'provisioning' && (
        <div className="max-w-2xl">
          <JITProvisioningConfig
            config={provider.jitConfig || {}}
            onChange={(jitConfig) => updateMutation.mutate({ ...provider, jitConfig })}
          />
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-medium text-text-primary">Linked Users</h3>
            <p className="text-sm text-text-muted mt-1">
              Users who have linked their account to this identity provider
            </p>
          </div>
          {linkedUsers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-text-muted">No users have linked their account yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-hover">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">External ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Linked At</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Last Login</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {linkedUsers.map((user: any) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-accent">
                            {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{user.displayName}</p>
                          <p className="text-xs text-text-muted">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted font-mono">{user.externalId}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">
                      {new Date(user.linkedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-sm text-red-500 hover:underline">
                        Unlink
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-medium text-text-primary">Activity Log</h3>
            <p className="text-sm text-text-muted mt-1">
              Recent authentication events for this provider
            </p>
          </div>
          <div className="p-8 text-center">
            <p className="text-text-muted">No recent activity</p>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Provider?"
        message={`Are you sure you want to delete ${provider.name}? Users who have linked their accounts will need to re-link with a different provider.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
