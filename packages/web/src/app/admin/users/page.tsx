'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { BulkActionBar } from '@/components/admin/BulkActionBar';
import { ExportButton } from '@/components/admin/ExportModal';
import { DataTable, Column } from '@/components/admin/ui/DataTable';
import { FilterBar } from '@/components/admin/ui/FilterBar';
import { useAdminFilters } from '@/hooks/useAdminFilters';
import toast from 'react-hot-toast';

interface User {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  verified: boolean;
  status: string;
  followerCount: number;
  videoCount: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();

  const filters = useAdminFilters({
    defaultSort: { key: 'createdAt', direction: 'desc' },
    syncWithUrl: true,
  });

  // Map sort key to API sort param
  const apiSortParam = useMemo(() => {
    if (!filters.sortKey) return 'recent';
    const sortMap: Record<string, string> = {
      createdAt: 'recent',
      followerCount: 'followers',
      videoCount: 'videos',
    };
    return sortMap[filters.sortKey] || 'recent';
  }, [filters.sortKey]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', {
      search: filters.search,
      verified: filters.filters.verified?.[0],
      sort: apiSortParam,
    }],
    queryFn: () =>
      api.getAdminUsers({
        q: filters.search || undefined,
        verified: filters.filters.verified?.[0] || undefined,
        sort: apiSortParam,
      }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ did, verified }: { did: string; verified: boolean }) =>
      api.updateAdminUser({ did, verified }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User updated');
    },
    onError: () => {
      toast.error('Failed to update user');
    },
  });

  const users: User[] = data?.users || [];

  const columns: Column<User>[] = useMemo(() => [
    {
      key: 'user',
      header: 'User',
      render: (user) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.handle}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                {user.handle[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-text-primary flex items-center gap-1">
              {user.displayName || user.handle}
              {user.verified && (
                <VerifiedBadge className="w-4 h-4 text-accent" />
              )}
            </p>
            <p className="text-sm text-text-muted">@{user.handle}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => <StatusBadge status={user.status} />,
    },
    {
      key: 'followerCount',
      header: 'Followers',
      sortable: true,
      render: (user) => <span className="text-text-primary">{formatCount(user.followerCount)}</span>,
    },
    {
      key: 'videoCount',
      header: 'Videos',
      sortable: true,
      render: (user) => <span className="text-text-primary">{formatCount(user.videoCount)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      render: (user) => (
        <span className="text-text-muted">
          {new Date(user.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (user) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              verifyMutation.mutate({
                did: user.did,
                verified: !user.verified,
              });
            }}
            className="px-3 py-1 text-sm bg-surface-hover hover:bg-border rounded transition-colors"
            disabled={verifyMutation.isPending}
          >
            {user.verified ? 'Unverify' : 'Verify'}
          </button>
          <Link
            href={`/admin/users/${encodeURIComponent(user.did)}`}
            className="px-3 py-1 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </Link>
        </div>
      ),
    },
  ], [verifyMutation]);

  const filterConfig = [
    {
      key: 'verified',
      label: 'Verification',
      multiple: false,
      options: [
        { value: 'true', label: 'Verified' },
        { value: 'false', label: 'Unverified' },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'warning', label: 'Warning' },
        { value: 'mute', label: 'Muted' },
        { value: 'suspend', label: 'Suspended' },
        { value: 'ban', label: 'Banned' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Users</h1>
        <ExportButton
          exportType="users"
          filters={{
            status: filters.filters.verified?.[0] === 'true' ? 'active' : undefined,
          }}
        />
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        filterConfig={filterConfig}
        searchPlaceholder="Search users by handle or name..."
        pageKey="admin-users"
      />

      {/* Users Table */}
      <DataTable
        data={users}
        columns={columns}
        keyExtractor={(user) => user.did}
        loading={isLoading}
        emptyMessage="users"
        selectable
        selectedKeys={filters.filters.selected || []}
        onSelectionChange={(keys) => filters.setFilter('selected', keys)}
        sortKey={filters.sortKey || undefined}
        sortDirection={filters.sortDirection}
        onSort={filters.setSort}
        onRowClick={(user) => {
          window.location.href = `/admin/users/${encodeURIComponent(user.did)}`;
        }}
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedDids={filters.filters.selected || []}
        onClearSelection={() => filters.setFilter('selected', [])}
        onActionComplete={() => filters.setFilter('selected', [])}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-500/10 text-green-500',
    warning: 'bg-yellow-500/10 text-yellow-500',
    mute: 'bg-orange-500/10 text-orange-500',
    suspend: 'bg-red-500/10 text-red-500',
    ban: 'bg-red-700/10 text-red-700',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${
        styles[status] || styles.active
      }`}
    >
      {status}
    </span>
  );
}

function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
