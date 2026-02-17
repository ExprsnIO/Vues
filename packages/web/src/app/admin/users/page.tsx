'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [verified, setVerified] = useState<string>('');
  const [sort, setSort] = useState('recent');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', { search, verified, sort }],
    queryFn: () =>
      api.getAdminUsers({
        q: search || undefined,
        verified: verified || undefined,
        sort,
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

  const users = data?.users || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Users</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <select
          value={verified}
          onChange={(e) => setVerified(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All users</option>
          <option value="true">Verified only</option>
          <option value="false">Unverified only</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="recent">Most Recent</option>
          <option value="followers">Most Followers</option>
          <option value="videos">Most Videos</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Followers
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Videos
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-text-muted">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user: any) => (
                <tr key={user.did} className="hover:bg-surface-hover">
                  <td className="px-6 py-4">
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
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-6 py-4 text-text-primary">
                    {formatCount(user.followerCount)}
                  </td>
                  <td className="px-6 py-4 text-text-primary">
                    {formatCount(user.videoCount)}
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() =>
                          verifyMutation.mutate({
                            did: user.did,
                            verified: !user.verified,
                          })
                        }
                        className="px-3 py-1 text-sm bg-surface-hover hover:bg-border rounded transition-colors"
                        disabled={verifyMutation.isPending}
                      >
                        {user.verified ? 'Unverify' : 'Verify'}
                      </button>
                      <Link
                        href={`/admin/users/${encodeURIComponent(user.did)}`}
                        className="px-3 py-1 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
