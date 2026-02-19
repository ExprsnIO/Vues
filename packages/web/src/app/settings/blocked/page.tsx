'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

export default function BlockedUsersPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.getBlocks({ limit: 100 }),
    enabled: !!user,
  });

  const unblockMutation = useMutation({
    mutationFn: (blockUri: string) => api.unblock(blockUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocks'] });
      toast.success('User unblocked');
    },
    onError: () => {
      toast.error('Failed to unblock user');
    },
  });

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login?redirect=/settings/blocked');
    return null;
  }

  const blockedUsers = data?.blocks || [];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/settings"
              className="p-2 -ml-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
            >
              <BackIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Blocked Accounts</h1>
              <p className="text-text-muted text-sm mt-1">
                Blocked users cannot see your profile, videos, or send you messages.
              </p>
            </div>
          </div>

          {/* Content */}
          {authLoading || isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="text-center py-20">
              <BlockIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">No blocked accounts</h2>
              <p className="text-text-muted">
                When you block someone, they'll appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {blockedUsers.map((blockedUser) => (
                <div
                  key={blockedUser.did}
                  className="flex items-center gap-4 p-4 bg-surface rounded-xl"
                >
                  {/* Avatar */}
                  <Link
                    href={`/profile/${blockedUser.handle}`}
                    className="w-12 h-12 rounded-full bg-background flex items-center justify-center overflow-hidden flex-shrink-0"
                  >
                    {blockedUser.avatar ? (
                      <img
                        src={blockedUser.avatar}
                        alt={blockedUser.handle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-text-primary font-medium">
                        {blockedUser.handle[0]?.toUpperCase()}
                      </span>
                    )}
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/profile/${blockedUser.handle}`}
                      className="font-medium text-text-primary hover:underline truncate block"
                    >
                      {blockedUser.displayName || `@${blockedUser.handle}`}
                    </Link>
                    <p className="text-sm text-text-muted truncate">@{blockedUser.handle}</p>
                  </div>

                  {/* Unblock button */}
                  <button
                    onClick={() => unblockMutation.mutate(`at://${user?.did}/app.bsky.graph.block/${blockedUser.did}`)}
                    disabled={unblockMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-accent border border-accent rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
                  >
                    {unblockMutation.isPending ? '...' : 'Unblock'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function BlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  );
}
