'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  PageSkeleton,
  StatCard,
} from '@/components/admin/ui';

interface Token {
  id: string;
  name: string;
  description?: string;
  tokenType: 'personal' | 'service';
  tokenPrefix: string;
  ownerDid: string;
  ownerHandle?: string;
  scopes: string[];
  status: 'active' | 'revoked' | 'expired';
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  requestCount: number;
}

export default function GlobalTokensPage() {
  const queryClient = useQueryClient();
  const [revokeTarget, setRevokeTarget] = useState<Token | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'revoked' | 'expired'>('all');
  const [tokenType, setTokenType] = useState<'all' | 'personal' | 'service'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tokens', 'global'],
    queryFn: async () => {
      const response = await api.get('/xrpc/io.exprsn.admin.tokens.list') as { data: { tokens: Token[] } };
      return response.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const response = await api.post('/xrpc/io.exprsn.admin.tokens.revoke', {
        tokenId,
      }) as { data: { success: boolean } };
      return response.data;
    },
    onSuccess: () => {
      toast.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'tokens', 'global'] });
      setRevokeTarget(null);
    },
    onError: () => {
      toast.error('Failed to revoke token');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const tokens: Token[] = data?.tokens || [];
  const stats = (data as Record<string, unknown>)?.stats as { total: number; active: number; personal: number; service: number } | undefined ?? {
    total: tokens.length,
    active: tokens.filter((t: Token) => t.status === 'active').length,
    personal: tokens.filter((t: Token) => t.tokenType === 'personal').length,
    service: tokens.filter((t: Token) => t.tokenType === 'service').length,
  };

  const filteredTokens = tokens.filter((token: Token) => {
    if (filter !== 'all' && token.status !== filter) return false;
    if (tokenType !== 'all' && token.tokenType !== tokenType) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Tokens"
        description="Manage all API tokens across the platform"
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
          title="Personal Tokens"
          value={stats.personal}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
        <StatCard
          title="Service Tokens"
          value={stats.service}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-muted">Status:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-muted">Type:</label>
          <select
            value={tokenType}
            onChange={(e) => setTokenType(e.target.value as any)}
            className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm"
          >
            <option value="all">All Types</option>
            <option value="personal">Personal</option>
            <option value="service">Service</option>
          </select>
        </div>
      </div>

      {/* Token List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Token</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Owner</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Last Used</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredTokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  No tokens found
                </td>
              </tr>
            ) : (
              filteredTokens.map((token: Token) => (
                <tr key={token.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-text-primary">{token.name}</p>
                      <p className="text-xs text-text-muted font-mono">{token.tokenPrefix}...</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${encodeURIComponent(token.ownerDid)}`}
                      className="text-accent hover:underline text-sm"
                    >
                      @{token.ownerHandle || token.ownerDid.slice(-8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      token.tokenType === 'service'
                        ? 'bg-purple-500/10 text-purple-500'
                        : 'bg-blue-500/10 text-blue-500'
                    }`}>
                      {token.tokenType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      token.status === 'active'
                        ? 'bg-green-500/10 text-green-500'
                        : token.status === 'revoked'
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {token.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {token.lastUsedAt
                      ? new Date(token.lastUsedAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {token.status === 'active' && (
                      <button
                        onClick={() => setRevokeTarget(token)}
                        className="text-sm text-red-500 hover:text-red-600"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Revoke Confirmation */}
      {revokeTarget && (
        <ConfirmDialog
          isOpen={true}
          title="Revoke Token"
          message={`Are you sure you want to revoke "${revokeTarget.name}"? This action cannot be undone.`}
          confirmLabel="Revoke"
          variant="danger"
          onConfirm={() => revokeMutation.mutate(revokeTarget.id)}
          onClose={() => setRevokeTarget(null)}
          isLoading={revokeMutation.isPending}
        />
      )}
    </div>
  );
}
