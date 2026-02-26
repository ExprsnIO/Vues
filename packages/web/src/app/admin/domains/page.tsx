'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type DomainType = 'hosted' | 'federated' | '';
type DomainStatus = '' | 'pending' | 'verifying' | 'active' | 'suspended' | 'inactive';

export default function AdminDomainsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DomainType>('');
  const [statusFilter, setStatusFilter] = useState<DomainStatus>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domains', { search, typeFilter, statusFilter }],
    queryFn: () =>
      api.adminDomainsList({
        q: search || undefined,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainsDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
      toast.success('Domain deleted');
    },
    onError: () => {
      toast.error('Failed to delete domain');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainsVerify(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
      toast.success('Domain verified');
    },
    onError: () => {
      toast.error('Failed to verify domain');
    },
  });

  const domains = data?.domains || [];
  const stats = data?.stats;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === domains.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(domains.map((d) => d.id)));
    }
  };

  const isAllSelected = domains.length > 0 && selectedIds.size === domains.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < domains.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'pending':
      case 'verifying':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'suspended':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'inactive':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'hosted' ? (
      <ServerIcon className="w-4 h-4" />
    ) : (
      <GlobeIcon className="w-4 h-4" />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Domains</h1>
          <p className="text-text-muted mt-1">Manage hosted and federated domains</p>
        </div>
        <Link
          href="/admin/domains/new"
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Domain
        </Link>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
            <p className="text-sm text-text-muted">Total Domains</p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-2xl font-bold text-green-400">{stats.active}</p>
            <p className="text-sm text-text-muted">Active</p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
            <p className="text-sm text-text-muted">Pending</p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-2xl font-bold text-blue-400">{stats.hosted}</p>
            <p className="text-sm text-text-muted">Hosted</p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-2xl font-bold text-purple-400">{stats.federated}</p>
            <p className="text-sm text-text-muted">Federated</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DomainType)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All Types</option>
          <option value="hosted">Hosted</option>
          <option value="federated">Federated</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DomainStatus)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="verifying">Verifying</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Domains Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-12">
            <GlobeIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No domains found</p>
            <Link
              href="/admin/domains/new"
              className="inline-block mt-4 text-accent hover:underline"
            >
              Add your first domain
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Domain
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Users
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Certificates
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {domains.map((domain) => (
                <tr
                  key={domain.id}
                  className="hover:bg-surface-hover transition-colors"
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(domain.id)}
                      onChange={() => toggleSelection(domain.id)}
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/domains/${domain.id}`}
                      className="hover:text-accent transition-colors"
                    >
                      <div className="font-medium text-text-primary">
                        {domain.name}
                      </div>
                      <div className="text-sm text-text-muted">
                        {domain.domain}
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                      {getTypeIcon(domain.type)}
                      {domain.type.charAt(0).toUpperCase() + domain.type.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                        domain.status
                      )}`}
                    >
                      {domain.status.charAt(0).toUpperCase() + domain.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-text-secondary">
                    {domain.userCount}
                  </td>
                  <td className="px-6 py-4 text-text-secondary">
                    {domain.certificateCount}
                  </td>
                  <td className="px-6 py-4 text-text-muted text-sm">
                    {new Date(domain.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {domain.status === 'pending' && (
                        <button
                          onClick={() => verifyMutation.mutate(domain.id)}
                          disabled={verifyMutation.isPending}
                          className="text-green-400 hover:text-green-300 transition-colors text-sm"
                        >
                          Verify
                        </button>
                      )}
                      <Link
                        href={`/admin/domains/${domain.id}`}
                        className="text-accent hover:text-accent-hover transition-colors text-sm"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this domain?')) {
                            deleteMutation.mutate(domain.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-300 transition-colors text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}
