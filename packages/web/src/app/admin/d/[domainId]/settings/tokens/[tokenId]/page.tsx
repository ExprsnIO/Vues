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
  TokenPermissionsEditor,
  TokenUsageStats,
  RateLimitConfig,
} from '@/components/admin/tokens';

export default function TokenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const tokenId = params.tokenId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('overview');
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedScopes, setEditedScopes] = useState<string[]>([]);
  const [editedRateLimit, setEditedRateLimit] = useState<{ requests: number; window: number } | null>(null);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'tokens', tokenId],
    queryFn: () => api.adminDomainTokenGet(domainId, tokenId),
    enabled: !!domainId && !!tokenId,
  });

  const { data: usageData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'tokens', tokenId, 'usage'],
    queryFn: () => api.adminDomainTokenUsage(domainId, tokenId),
    enabled: !!domainId && !!tokenId && activeTab === 'usage',
  });

  useEffect(() => {
    if (data?.token) {
      setEditedScopes(data.token.scopes);
      setEditedRateLimit(data.token.rateLimit || null);
    }
  }, [data?.token]);

  const updateMutation = useMutation({
    mutationFn: (updates: any) => api.adminDomainTokenUpdate(domainId, tokenId, updates),
    onSuccess: () => {
      toast.success('Token updated');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'tokens'] });
    },
    onError: () => {
      toast.error('Failed to update token');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => api.adminDomainTokensRevoke(domainId, tokenId),
    onSuccess: () => {
      toast.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'tokens'] });
      router.push(`/admin/d/${domainId}/settings/tokens`);
    },
    onError: () => {
      toast.error('Failed to revoke token');
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.adminDomainTokenRefresh(domainId, tokenId),
    onSuccess: (result) => {
      toast.success('Token refreshed - new token generated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'tokens'] });
      // Show the new token to the user
      navigator.clipboard.writeText(result.token);
      toast.success('New token copied to clipboard');
    },
    onError: () => {
      toast.error('Failed to refresh token');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const token = data?.token;

  if (!token) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-lg font-medium text-text-primary mb-2">Token not found</h2>
        <p className="text-text-muted mb-4">The requested token could not be found.</p>
        <button
          onClick={() => router.push(`/admin/d/${domainId}/settings/tokens`)}
          className="text-accent hover:underline"
        >
          Back to tokens
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'usage', label: 'Usage' },
  ];

  const handleScopeChange = (scopes: string[]) => {
    setEditedScopes(scopes);
    setHasChanges(true);
  };

  const handleRateLimitChange = (rateLimit: { requests: number; window: number }) => {
    setEditedRateLimit(rateLimit);
    setHasChanges(true);
  };

  const saveChanges = () => {
    const updates: any = {};
    if (JSON.stringify(editedScopes) !== JSON.stringify(token.scopes)) {
      updates.scopes = editedScopes;
    }
    if (JSON.stringify(editedRateLimit) !== JSON.stringify(token.rateLimit)) {
      updates.rateLimit = editedRateLimit;
    }
    updateMutation.mutate(updates);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={token.name}
        description="API Token Details"
        actions={
          <div className="flex items-center gap-3">
            {hasChanges && (
              <button
                onClick={saveChanges}
                disabled={updateMutation.isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            )}
            {token.status === 'active' && (
              <>
                <button
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                  className="px-3 py-2 text-sm bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors"
                >
                  Regenerate
                </button>
                <button
                  onClick={() => setShowRevokeDialog(true)}
                  className="px-3 py-2 text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  Revoke
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Status Banner */}
      <div className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            token.status === 'active' ? 'bg-green-500' :
            token.status === 'expired' ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          <Badge variant={
            token.status === 'active' ? 'success' :
            token.status === 'expired' ? 'warning' : 'danger'
          }>
            {token.status}
          </Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-text-muted">Prefix:</span>
            <span className="ml-2 font-mono text-text-primary">{token.prefix}...</span>
          </div>
          <div>
            <span className="text-text-muted">Created:</span>
            <span className="ml-2 text-text-primary">{new Date(token.createdAt).toLocaleDateString()}</span>
          </div>
          {token.expiresAt && (
            <div>
              <span className="text-text-muted">Expires:</span>
              <span className="ml-2 text-text-primary">{new Date(token.expiresAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Token Info */}
          <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
            <h3 className="font-medium text-text-primary">Token Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-text-muted">Name</p>
                <p className="text-text-primary">{token.name}</p>
              </div>
              {token.description && (
                <div>
                  <p className="text-sm text-text-muted">Description</p>
                  <p className="text-text-primary">{token.description}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-text-muted">Created By</p>
                <p className="text-text-primary">{token.createdBy?.name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Last Used</p>
                <p className="text-text-primary">
                  {token.lastUsed ? new Date(token.lastUsed).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-surface border border-border rounded-xl">
              <p className="text-sm text-text-muted">Total Requests</p>
              <p className="text-2xl font-bold text-text-primary">{token.usageCount.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-surface border border-border rounded-xl">
              <p className="text-sm text-text-muted">Scopes</p>
              <p className="text-2xl font-bold text-text-primary">{token.scopes.length}</p>
            </div>
            <div className="p-4 bg-surface border border-border rounded-xl">
              <p className="text-sm text-text-muted">Rate Limit</p>
              <p className="text-2xl font-bold text-text-primary">
                {token.rateLimit ? `${token.rateLimit.requests}/${token.rateLimit.window}s` : 'Default'}
              </p>
            </div>
          </div>

          {/* Scopes Summary */}
          <div className="p-5 bg-surface border border-border rounded-xl">
            <h3 className="font-medium text-text-primary mb-3">Permissions</h3>
            <div className="flex flex-wrap gap-2">
              {token.scopes.map((scope: string) => (
                <Badge key={scope} variant="default">{scope}</Badge>
              ))}
            </div>
          </div>

          {/* Rate Limit Config */}
          {token.rateLimit && (
            <div className="p-5 bg-surface border border-border rounded-xl">
              <h3 className="font-medium text-text-primary mb-4">Rate Limit Configuration</h3>
              <RateLimitConfig
                config={editedRateLimit || token.rateLimit}
                onChange={handleRateLimitChange}
                disabled={token.status !== 'active'}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="font-medium text-text-primary mb-4">Token Permissions</h3>
          <TokenPermissionsEditor
            availableScopes={[
              { scope: 'read:profile', label: 'Read Profile', description: 'Read user profile information', category: 'Users' },
              { scope: 'write:profile', label: 'Write Profile', description: 'Update user profile', category: 'Users' },
              { scope: 'read:content', label: 'Read Content', description: 'Read posts and media', category: 'Content' },
              { scope: 'write:content', label: 'Write Content', description: 'Create and edit posts', category: 'Content' },
              { scope: 'delete:content', label: 'Delete Content', description: 'Delete posts and media', category: 'Content' },
              { scope: 'read:followers', label: 'Read Followers', description: 'Read follower lists', category: 'Social' },
              { scope: 'write:follows', label: 'Write Follows', description: 'Follow/unfollow users', category: 'Social' },
              { scope: 'read:notifications', label: 'Read Notifications', description: 'Read notifications', category: 'Notifications' },
              { scope: 'read:analytics', label: 'Read Analytics', description: 'Access analytics data', category: 'Analytics' },
              { scope: 'admin:users', label: 'Admin Users', description: 'User administration', category: 'Admin' },
              { scope: 'admin:content', label: 'Admin Content', description: 'Content moderation', category: 'Admin' },
              { scope: 'admin:settings', label: 'Admin Settings', description: 'Domain settings', category: 'Admin' },
            ]}
            selectedScopes={editedScopes}
            onChange={handleScopeChange}
            disabled={token.status !== 'active'}
          />
        </div>
      )}

      {activeTab === 'usage' && usageData?.usage && (
        <TokenUsageStats
          usage={usageData.usage}
          rateLimit={token.rateLimit}
        />
      )}

      {/* Revoke Confirmation */}
      <ConfirmDialog
        isOpen={showRevokeDialog}
        onClose={() => setShowRevokeDialog(false)}
        onConfirm={() => revokeMutation.mutate()}
        title="Revoke Token?"
        message={`Are you sure you want to revoke "${token.name}"? This action cannot be undone and any applications using this token will stop working immediately.`}
        confirmLabel="Revoke Token"
        variant="danger"
        isLoading={revokeMutation.isPending}
      />
    </div>
  );
}
