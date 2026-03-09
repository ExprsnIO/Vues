'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  PageSkeleton,
  StatCard,
} from '@/components/admin/ui';
import { TokenList, CreateTokenForm } from '@/components/admin/tokens';

export default function TokensPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<any>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'tokens'],
    queryFn: () => api.adminDomainTokensList(domainId),
    enabled: !!domainId,
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'tokens', 'stats'],
    queryFn: () => api.adminDomainTokensStats(domainId),
    enabled: !!domainId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainTokensCreate(domainId, data),
    onSuccess: (result) => {
      setNewToken(result.token);
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'tokens'] });
    },
    onError: () => {
      toast.error('Failed to create token');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => api.adminDomainTokensRevoke(domainId, tokenId),
    onSuccess: () => {
      toast.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'tokens'] });
      setRevokeTarget(null);
    },
    onError: () => {
      toast.error('Failed to revoke token');
    },
  });

  const handleCreateComplete = () => {
    setShowCreateModal(false);
    setNewToken(null);
  };

  const copyToken = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      toast.success('Token copied to clipboard');
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  const tokens = data?.tokens || [];
  const stats = statsData?.stats || {
    total: 0,
    active: 0,
    totalRequests: 0,
    requestsToday: 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Tokens"
        description={`Manage API access for ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Create Token
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Tokens"
          value={stats.total}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          }
        />
        <StatCard
          title="Active"
          value={stats.active}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Requests"
          value={stats.totalRequests.toLocaleString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          title="Requests Today"
          value={stats.requestsToday.toLocaleString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Token List */}
      <TokenList
        tokens={tokens}
        onSelect={(token) => router.push(`/admin/d/${domainId}/settings/tokens/${token.id}`)}
        onRevoke={(tokenId) => setRevokeTarget(tokens.find((t: any) => t.id === tokenId))}
      />

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal && !newToken}
        onClose={() => setShowCreateModal(false)}
        title="Create API Token"
        size="lg"
      >
        <CreateTokenForm
          onSubmit={createMutation.mutate}
          onCancel={() => setShowCreateModal(false)}
          isSubmitting={createMutation.isPending}
        />
      </Modal>

      {/* Token Created Modal */}
      <Modal
        isOpen={!!newToken}
        onClose={handleCreateComplete}
        title="Token Created"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-500">Token created successfully</p>
                <p className="text-xs text-text-muted mt-1">
                  Make sure to copy your token now. You won't be able to see it again!
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-surface-hover rounded-lg">
            <p className="text-xs font-medium text-text-muted uppercase mb-2">Your API Token</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-surface rounded font-mono text-sm text-text-primary break-all">
                {newToken}
              </code>
              <button
                onClick={copyToken}
                className="p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-xs text-yellow-500">
              Store this token securely. For security reasons, it will not be shown again.
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleCreateComplete}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation */}
      <ConfirmDialog
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        title="Revoke Token?"
        message={`Are you sure you want to revoke "${revokeTarget?.name}"? This action cannot be undone and any applications using this token will stop working.`}
        confirmLabel="Revoke"
        variant="danger"
        isLoading={revokeMutation.isPending}
      />
    </div>
  );
}
