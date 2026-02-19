'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

type Tab = 'blocked' | 'muted';

interface BlockedUser {
  uri: string;
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  blockedAt: string;
}

interface MutedUser {
  uri: string;
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  mutedAt: string;
}

export function BlockedMutedSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('blocked');
  const [confirmUnblock, setConfirmUnblock] = useState<BlockedUser | null>(null);
  const [confirmUnmute, setConfirmUnmute] = useState<MutedUser | null>(null);
  const queryClient = useQueryClient();

  // Fetch blocked users
  const { data: blockedData, isLoading: blockedLoading } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.getBlocks({ limit: 100 }),
    enabled: activeTab === 'blocked',
  });

  // Fetch muted users
  const { data: mutedData, isLoading: mutedLoading } = useQuery({
    queryKey: ['mutes'],
    queryFn: () => api.getMutes({ limit: 100 }),
    enabled: activeTab === 'muted',
  });

  // Unblock mutation
  const unblockMutation = useMutation({
    mutationFn: (blockUri: string) => api.unblock(blockUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocks'] });
      setConfirmUnblock(null);
      toast.success('User unblocked');
    },
    onError: () => {
      toast.error('Failed to unblock user');
    },
  });

  // Unmute mutation
  const unmuteMutation = useMutation({
    mutationFn: (muteUri: string) => api.unmute(muteUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mutes'] });
      setConfirmUnmute(null);
      toast.success('User unmuted');
    },
    onError: () => {
      toast.error('Failed to unmute user');
    },
  });

  const blockedUsers = (blockedData?.blocks || []) as BlockedUser[];
  const mutedUsers = (mutedData?.mutes || []) as MutedUser[];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('blocked')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'blocked'
              ? 'text-accent border-accent'
              : 'text-text-muted border-transparent hover:text-text-primary'
          }`}
        >
          Blocked ({blockedUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('muted')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'muted'
              ? 'text-accent border-accent'
              : 'text-text-muted border-transparent hover:text-text-primary'
          }`}
        >
          Muted ({mutedUsers.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === 'blocked' && (
        <div>
          <p className="text-sm text-text-muted mb-4">
            Blocked users cannot see your profile, videos, or interact with you.
          </p>

          {blockedLoading ? (
            <div className="bg-surface rounded-xl p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-14 bg-background rounded-lg" />
                <div className="h-14 bg-background rounded-lg" />
              </div>
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="bg-surface rounded-xl p-8 text-center">
              <BlockIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium mb-1">No blocked users</p>
              <p className="text-text-muted text-sm">Users you block will appear here</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl divide-y divide-border overflow-hidden">
              {blockedUsers.map((user) => (
                <div key={user.uri} className="p-4 flex items-center justify-between">
                  <Link
                    href={`/profile/${user.handle}`}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted">
                        {user.handle[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-text-primary font-medium">
                        {user.displayName || user.handle}
                      </p>
                      <p className="text-sm text-text-muted">@{user.handle}</p>
                    </div>
                  </Link>
                  <button
                    onClick={() => setConfirmUnblock(user)}
                    className="px-4 py-1.5 text-sm font-medium text-text-primary bg-surface-hover hover:bg-border rounded-lg transition-colors"
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'muted' && (
        <div>
          <p className="text-sm text-text-muted mb-4">
            Muted users' content won't appear in your feed, but they can still interact with you.
          </p>

          {mutedLoading ? (
            <div className="bg-surface rounded-xl p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-14 bg-background rounded-lg" />
                <div className="h-14 bg-background rounded-lg" />
              </div>
            </div>
          ) : mutedUsers.length === 0 ? (
            <div className="bg-surface rounded-xl p-8 text-center">
              <MuteIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium mb-1">No muted users</p>
              <p className="text-text-muted text-sm">Users you mute will appear here</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl divide-y divide-border overflow-hidden">
              {mutedUsers.map((user) => (
                <div key={user.uri} className="p-4 flex items-center justify-between">
                  <Link
                    href={`/profile/${user.handle}`}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted">
                        {user.handle[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-text-primary font-medium">
                        {user.displayName || user.handle}
                      </p>
                      <p className="text-sm text-text-muted">@{user.handle}</p>
                    </div>
                  </Link>
                  <button
                    onClick={() => setConfirmUnmute(user)}
                    className="px-4 py-1.5 text-sm font-medium text-text-primary bg-surface-hover hover:bg-border rounded-lg transition-colors"
                  >
                    Unmute
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unblock Confirm Modal */}
      {confirmUnblock && (
        <ConfirmModal
          title={`Unblock @${confirmUnblock.handle}?`}
          description="They will be able to see your profile and videos again. You can block them again at any time."
          confirmLabel="Unblock"
          confirmColor="bg-accent hover:bg-accent-hover"
          isLoading={unblockMutation.isPending}
          onClose={() => setConfirmUnblock(null)}
          onConfirm={() => unblockMutation.mutate(confirmUnblock.uri)}
        />
      )}

      {/* Unmute Confirm Modal */}
      {confirmUnmute && (
        <ConfirmModal
          title={`Unmute @${confirmUnmute.handle}?`}
          description="Their content will appear in your feed again. You can mute them again at any time."
          confirmLabel="Unmute"
          confirmColor="bg-accent hover:bg-accent-hover"
          isLoading={unmuteMutation.isPending}
          onClose={() => setConfirmUnmute(null)}
          onConfirm={() => unmuteMutation.mutate(confirmUnmute.uri)}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmColor,
  isLoading,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: string;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
        <p className="text-text-muted text-sm mb-6">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${confirmColor}`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function MuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  );
}
