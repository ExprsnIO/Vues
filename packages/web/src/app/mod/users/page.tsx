'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, type AdminUserItem } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, formatDistanceToNow } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ModUsersPage() {
  const { user, isLoading: authLoading, isModerator } = useAuth();
  const router = useRouter();

  if (!authLoading && (!user || !isModerator)) {
    router.replace('/');
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <UsersContent />
      </main>
    </div>
  );
}

function UsersContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialDid = searchParams.get('did') || '';

  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(initialDid || null);
  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [sanctionTarget, setSanctionTarget] = useState<{ did: string; handle: string } | null>(null);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['mod-users', search],
    queryFn: () =>
      api.getAdminUsers({
        q: search || undefined,
        limit: 30,
      }),
    refetchInterval: 60000,
  });

  const { data: userDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['mod-user-detail', selectedUser],
    queryFn: () => api.getAdminUser(selectedUser!),
    enabled: !!selectedUser,
  });

  const sanctionMutation = useMutation({
    mutationFn: (vars: {
      userDid: string;
      sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
      reason: string;
      expiresAt?: string;
    }) => api.sanctionUser(vars),
    onSuccess: (_, vars) => {
      toast.success(`${vars.sanctionType} applied`);
      setShowSanctionModal(false);
      setSanctionTarget(null);
      queryClient.invalidateQueries({ queryKey: ['mod-user-detail', vars.userDid] });
      queryClient.invalidateQueries({ queryKey: ['mod-users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply sanction');
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <UsersIcon className="w-6 h-6 text-orange-400" />
        <h1 className="text-2xl font-bold text-text-primary">User Review</h1>
      </div>

      <div className="flex gap-6">
        {/* User list */}
        <div className="w-72 flex-shrink-0">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-orange-400 mb-3"
          />

          {usersLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-14 bg-surface rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {usersData?.users.map((u) => (
                <button
                  key={u.did}
                  onClick={() => setSelectedUser(u.did)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                    selectedUser === u.did
                      ? 'bg-orange-500/10 border border-orange-500/30'
                      : 'hover:bg-surface-hover border border-transparent'
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.handle} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-medium text-text-primary">
                        {u.handle[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      @{u.handle}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={u.status} />
                    </div>
                  </div>
                </button>
              ))}
              {!usersData?.users.length && (
                <p className="text-center text-sm text-text-muted py-8">No users found</p>
              )}
            </div>
          )}
        </div>

        {/* User detail panel */}
        <div className="flex-1 min-w-0">
          {!selectedUser ? (
            <div className="flex flex-col items-center justify-center py-24 text-text-muted">
              <UsersIcon className="w-12 h-12 opacity-30 mb-3" />
              <p>Select a user to review</p>
            </div>
          ) : detailLoading ? (
            <div className="space-y-4">
              <div className="h-20 bg-surface rounded-lg animate-pulse" />
              <div className="h-40 bg-surface rounded-lg animate-pulse" />
            </div>
          ) : userDetail ? (
            <div className="space-y-5">
              {/* User header */}
              <div className="bg-surface border border-border rounded-lg p-5 flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
                  {userDetail.user.avatar ? (
                    <img
                      src={userDetail.user.avatar}
                      alt={userDetail.user.handle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-text-primary">
                      {userDetail.user.handle[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-bold text-text-primary">
                      {userDetail.user.displayName || `@${userDetail.user.handle}`}
                    </h2>
                  </div>
                  <p className="text-text-muted text-sm mb-2">@{userDetail.user.handle}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                    <span>{userDetail.user.followerCount.toLocaleString()} followers</span>
                    <span>{userDetail.user.videoCount} videos</span>
                    <span>{userDetail.reportCount} reports</span>
                    <span>
                      Joined {formatDistanceToNow(new Date(userDetail.user.createdAt))} ago
                    </span>
                  </div>
                </div>

                {/* Quick action buttons */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setSanctionTarget({
                        did: userDetail.user.did,
                        handle: userDetail.user.handle,
                      });
                      setShowSanctionModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/30 rounded-md transition-colors"
                  >
                    <ShieldIcon className="w-3.5 h-3.5" />
                    Sanction
                  </button>
                  <Link
                    href={`/profile/${userDetail.user.handle}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface text-text-muted hover:bg-surface-hover border border-border rounded-md transition-colors"
                  >
                    View Profile
                  </Link>
                </div>
              </div>

              {/* Sanction history */}
              <div className="bg-surface border border-border rounded-lg p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4 text-orange-400" />
                  Sanction History ({userDetail.sanctions.length})
                </h3>
                {userDetail.sanctions.length === 0 ? (
                  <p className="text-sm text-text-muted">No sanctions on record.</p>
                ) : (
                  <div className="space-y-2">
                    {userDetail.sanctions.map((sanction) => (
                      <div
                        key={sanction.id}
                        className="flex items-start gap-3 px-3 py-2.5 bg-background rounded-md border border-border"
                      >
                        <SanctionTypeBadge type={sanction.sanctionType} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary">{sanction.reason}</p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {formatDistanceToNow(new Date(sanction.createdAt))} ago
                            {sanction.expiresAt && (
                              <span>
                                {' '}
                                · expires {formatDistanceToNow(new Date(sanction.expiresAt))}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent videos */}
              {userDetail.recentVideos.length > 0 && (
                <div className="bg-surface border border-border rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-3">
                    Recent Videos
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {userDetail.recentVideos.slice(0, 6).map((video) => (
                      <Link
                        key={video.uri}
                        href={`/video/${encodeURIComponent(video.uri)}`}
                        className="group block"
                      >
                        <div className="aspect-video bg-background rounded overflow-hidden mb-1">
                          {video.thumbnailUrl ? (
                            <img
                              src={video.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <VideoIcon className="w-6 h-6 text-text-muted opacity-40" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-text-muted truncate line-clamp-1">
                          {video.caption || 'Untitled'}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-text-muted">
              <p>User not found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sanction Modal */}
      {showSanctionModal && sanctionTarget && (
        <SanctionModal
          userDid={sanctionTarget.did}
          userHandle={sanctionTarget.handle}
          onClose={() => {
            setShowSanctionModal(false);
            setSanctionTarget(null);
          }}
          onSanction={(vars) => sanctionMutation.mutate(vars)}
          isLoading={sanctionMutation.isPending}
        />
      )}
    </div>
  );
}

function SanctionModal({
  userDid,
  userHandle,
  onClose,
  onSanction,
  isLoading,
}: {
  userDid: string;
  userHandle: string;
  onClose: () => void;
  onSanction: (vars: {
    userDid: string;
    sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
    reason: string;
    expiresAt?: string;
  }) => void;
  isLoading: boolean;
}) {
  const [sanctionType, setSanctionType] = useState<'warning' | 'mute' | 'suspend' | 'ban'>('warning');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 max-w-md mx-4 border border-border w-full">
        <div className="flex items-center gap-2 mb-4">
          <ShieldIcon className="w-5 h-5 text-orange-400" />
          <h3 className="text-base font-semibold text-text-primary">
            Sanction @{userHandle}
          </h3>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-muted mb-2">Sanction type</label>
          <div className="grid grid-cols-2 gap-2">
            {(['warning', 'mute', 'suspend', 'ban'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSanctionType(type)}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-md border transition-colors capitalize',
                  sanctionType === type
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-border text-text-muted hover:bg-surface-hover'
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {sanctionType !== 'warning' && sanctionType !== 'ban' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-muted mb-2">
              Duration (days, optional)
            </label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 7"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-orange-400"
            />
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-text-muted mb-2">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the reason for this sanction..."
            rows={3}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-orange-400"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-text-muted border border-border rounded-md hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!reason.trim()) return;
              onSanction({
                userDid,
                sanctionType,
                reason: reason.trim(),
                expiresAt:
                  duration && sanctionType !== 'ban'
                    ? new Date(Date.now() + Number(duration) * 24 * 60 * 60 * 1000).toISOString()
                    : undefined,
              });
            }}
            disabled={!reason.trim() || isLoading}
            className="flex-1 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
          >
            {isLoading ? 'Applying...' : `Apply ${sanctionType}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'text-green-400',
    suspended: 'text-orange-400',
    banned: 'text-red-400',
    muted: 'text-yellow-400',
  };
  return (
    <span className={cn('text-xs capitalize', colors[status] || 'text-text-muted')}>
      {status}
    </span>
  );
}

function SanctionTypeBadge({ type }: { type: string }) {
  const configs: Record<string, { label: string; classes: string }> = {
    warning: { label: 'Warning', classes: 'bg-yellow-500/10 text-yellow-400' },
    mute: { label: 'Mute', classes: 'bg-orange-500/10 text-orange-400' },
    suspend: { label: 'Suspend', classes: 'bg-orange-600/10 text-orange-500' },
    ban: { label: 'Ban', classes: 'bg-red-500/10 text-red-400' },
  };
  const config = configs[type] || { label: type, classes: 'bg-surface text-text-muted' };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0',
        config.classes
      )}
    >
      {config.label}
    </span>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
