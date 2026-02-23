'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const did = decodeURIComponent(params.did as string);
  const queryClient = useQueryClient();

  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'user', did],
    queryFn: () => api.getAdminUser(did),
  });

  const { data: accountData } = useQuery({
    queryKey: ['admin', 'user', 'account', did],
    queryFn: () => api.getUserAccountInfo(did),
  });

  const setPasswordMutation = useMutation({
    mutationFn: (password: string) => api.setUserPassword({ did, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'account', did] });
      setShowPasswordModal(false);
      toast.success('Password updated successfully');
    },
    onError: () => toast.error('Failed to update password'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.resetUserPassword({ did }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'account', did] });
      toast.success(`Temporary password: ${data.temporaryPassword}`, { duration: 10000 });
    },
    onError: () => toast.error('Failed to reset password'),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: () => api.forceUserLogout({ did }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'account', did] });
      toast.success(`Logged out ${data.sessionsInvalidated} session(s)`);
    },
    onError: () => toast.error('Failed to logout user'),
  });

  const verifyMutation = useMutation({
    mutationFn: (verified: boolean) => api.updateAdminUser({ did, verified }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', did] });
      toast.success('User updated');
    },
    onError: () => toast.error('Failed to update user'),
  });

  const sanctionMutation = useMutation({
    mutationFn: (data: {
      sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
      reason: string;
      expiresAt?: string;
    }) => api.sanctionUser({ userDid: did, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', did] });
      setShowSanctionModal(false);
      toast.success('Sanction applied');
    },
    onError: () => toast.error('Failed to apply sanction'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface rounded animate-pulse" />
        <div className="h-64 bg-surface rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-text-primary mb-2">User not found</h2>
        <Link href="/admin/users" className="text-accent hover:underline">
          Back to users
        </Link>
      </div>
    );
  }

  const { user, sanctions, recentVideos, reportCount } = data;
  const activeSanction = sanctions?.find(
    (s: any) => !s.expiresAt || new Date(s.expiresAt) > new Date()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-hover"
        >
          <BackIcon className="w-5 h-5 text-text-muted" />
        </button>
        <h1 className="text-2xl font-bold text-text-primary">User Details</h1>
      </div>

      {/* User Profile Card */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
            {user.avatar ? (
              <img src={user.avatar} alt={user.handle} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-2xl font-bold">
                {user.handle[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-text-primary">
                {user.displayName || user.handle}
              </h2>
              {user.verified && <VerifiedBadge />}
              {activeSanction && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${getSanctionColor(activeSanction.sanctionType)}`}>
                  {activeSanction.sanctionType}
                </span>
              )}
            </div>
            <p className="text-text-muted mb-3">@{user.handle}</p>
            {user.bio && <p className="text-text-secondary text-sm mb-4">{user.bio}</p>}
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-semibold text-text-primary">{formatCount(user.followerCount)}</span>
                <span className="text-text-muted ml-1">followers</span>
              </div>
              <div>
                <span className="font-semibold text-text-primary">{formatCount(user.followingCount)}</span>
                <span className="text-text-muted ml-1">following</span>
              </div>
              <div>
                <span className="font-semibold text-text-primary">{user.videoCount}</span>
                <span className="text-text-muted ml-1">videos</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => verifyMutation.mutate(!user.verified)}
              disabled={verifyMutation.isPending}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors text-sm"
            >
              {user.verified ? 'Remove Verification' : 'Verify User'}
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors text-sm"
            >
              Manage Password
            </button>
            <button
              onClick={() => setShowSanctionModal(true)}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-sm"
            >
              Issue Sanction
            </button>
          </div>
        </div>
      </div>

      {/* Stats & Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-sm text-text-muted mb-1">Joined</p>
          <p className="text-text-primary font-medium">
            {new Date(user.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-sm text-text-muted mb-1">Reports Against</p>
          <p className={`font-medium ${reportCount > 0 ? 'text-red-500' : 'text-text-primary'}`}>
            {reportCount}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-sm text-text-muted mb-1">DID</p>
          <p className="text-text-primary font-mono text-xs truncate">{user.did}</p>
        </div>
      </div>

      {/* Sanction History */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Sanction History</h3>
        {sanctions?.length === 0 ? (
          <p className="text-text-muted text-sm">No sanctions on record</p>
        ) : (
          <div className="space-y-3">
            {sanctions?.map((sanction: any) => (
              <div
                key={sanction.id}
                className="flex items-start justify-between p-3 bg-surface-hover rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getSanctionColor(sanction.sanctionType)}`}>
                      {sanction.sanctionType}
                    </span>
                    {sanction.expiresAt && new Date(sanction.expiresAt) < new Date() && (
                      <span className="text-xs text-text-muted">Expired</span>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary">{sanction.reason}</p>
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(sanction.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Videos */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Recent Videos</h3>
        {recentVideos?.length === 0 ? (
          <p className="text-text-muted text-sm">No videos</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {recentVideos?.map((video: any) => (
              <div key={video.uri} className="aspect-[9/16] rounded-lg bg-surface-hover overflow-hidden">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <VideoIcon className="w-8 h-8 text-text-muted" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-xs text-white">{formatCount(video.viewCount)} views</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sanction Modal */}
      {showSanctionModal && (
        <SanctionModal
          onClose={() => setShowSanctionModal(false)}
          onSubmit={(data) => sanctionMutation.mutate(data)}
          isLoading={sanctionMutation.isPending}
        />
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <PasswordModal
          account={accountData?.account}
          onClose={() => setShowPasswordModal(false)}
          onSetPassword={(password) => setPasswordMutation.mutate(password)}
          onResetPassword={() => resetPasswordMutation.mutate()}
          onForceLogout={() => forceLogoutMutation.mutate()}
          isLoading={setPasswordMutation.isPending || resetPasswordMutation.isPending || forceLogoutMutation.isPending}
        />
      )}
    </div>
  );
}

function PasswordModal({
  account,
  onClose,
  onSetPassword,
  onResetPassword,
  onForceLogout,
  isLoading,
}: {
  account?: {
    did: string;
    handle: string;
    email: string | null;
    status: string;
    hasPassword: boolean;
    activeSessions: number;
    createdAt: string;
    updatedAt: string;
  };
  onClose: () => void;
  onSetPassword: (password: string) => void;
  onResetPassword: () => void;
  onForceLogout: () => void;
  isLoading: boolean;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const passwordsMatch = newPassword === confirmPassword;
  const passwordValid = newPassword.length >= 8;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Password Management</h2>

        {/* Account Info */}
        {account && (
          <div className="mb-6 p-4 bg-surface rounded-lg">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-muted">Handle</p>
                <p className="text-text-primary font-medium">@{account.handle}</p>
              </div>
              <div>
                <p className="text-text-muted">Email</p>
                <p className="text-text-primary font-medium">{account.email || 'Not set'}</p>
              </div>
              <div>
                <p className="text-text-muted">Password Set</p>
                <p className={`font-medium ${account.hasPassword ? 'text-green-500' : 'text-orange-500'}`}>
                  {account.hasPassword ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Active Sessions</p>
                <p className="text-text-primary font-medium">{account.activeSessions}</p>
              </div>
            </div>
          </div>
        )}

        {/* Set New Password */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-text-secondary">Set New Password</h3>
          <div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className={`w-full px-4 py-2 bg-surface border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent ${
                confirmPassword && !passwordsMatch ? 'border-red-500' : 'border-border'
              }`}
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
            )}
          </div>
          <button
            onClick={() => onSetPassword(newPassword)}
            disabled={isLoading || !passwordValid || !passwordsMatch}
            className="w-full py-2 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Setting...' : 'Set Password'}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="border-t border-border pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-text-secondary">Quick Actions</h3>

          {!showConfirmReset ? (
            <button
              onClick={() => setShowConfirmReset(true)}
              disabled={isLoading}
              className="w-full py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 rounded-lg transition-colors text-sm"
            >
              Generate Temporary Password
            </button>
          ) : (
            <div className="p-3 bg-orange-500/10 rounded-lg">
              <p className="text-orange-500 text-sm mb-2">
                This will generate a temporary password and invalidate all sessions. Are you sure?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirmReset(false)}
                  className="flex-1 py-1.5 bg-surface-hover text-text-primary rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onResetPassword();
                    setShowConfirmReset(false);
                  }}
                  disabled={isLoading}
                  className="flex-1 py-1.5 bg-orange-500 text-white rounded text-sm"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onForceLogout}
            disabled={isLoading || !account?.activeSessions}
            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            Force Logout ({account?.activeSessions || 0} sessions)
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function SanctionModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: { sanctionType: 'warning' | 'mute' | 'suspend' | 'ban'; reason: string; expiresAt?: string }) => void;
  isLoading: boolean;
}) {
  const [sanctionType, setSanctionType] = useState<'warning' | 'mute' | 'suspend' | 'ban'>('warning');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');

  const handleSubmit = () => {
    let expiresAt: string | undefined;
    if (duration && sanctionType !== 'ban') {
      const days = parseInt(duration);
      if (!isNaN(days)) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }
    }
    onSubmit({ sanctionType, reason, expiresAt });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Issue Sanction</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(['warning', 'mute', 'suspend', 'ban'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setSanctionType(type)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors capitalize ${
                    sanctionType === type
                      ? getSanctionColor(type)
                      : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reason for this sanction..."
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              rows={3}
            />
          </div>

          {sanctionType !== 'ban' && sanctionType !== 'warning' && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Duration (days)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Leave empty for permanent"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !reason}
            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Applying...' : 'Apply Sanction'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getSanctionColor(type: string): string {
  const colors: Record<string, string> = {
    warning: 'bg-yellow-500/10 text-yellow-500',
    mute: 'bg-orange-500/10 text-orange-500',
    suspend: 'bg-red-500/10 text-red-500',
    ban: 'bg-red-700/10 text-red-700',
  };
  return colors[type] || colors.warning;
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
