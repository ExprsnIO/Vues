'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

export default function MutedUsersPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['mutes'],
    queryFn: () => api.getMutes({ limit: 100 }),
    enabled: !!user,
  });

  const unmuteMutation = useMutation({
    mutationFn: (muteUri: string) => api.unmute(muteUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mutes'] });
      toast.success('User unmuted');
    },
    onError: () => {
      toast.error('Failed to unmute user');
    },
  });

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login?redirect=/settings/muted');
    return null;
  }

  const mutedUsers = data?.mutes || [];

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
              <h1 className="text-2xl font-bold text-text-primary">Muted Accounts</h1>
              <p className="text-text-muted text-sm mt-1">
                Muted users' content won't appear in your For You feed.
              </p>
            </div>
          </div>

          {/* Content */}
          {authLoading || isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mutedUsers.length === 0 ? (
            <div className="text-center py-20">
              <MuteIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">No muted accounts</h2>
              <p className="text-text-muted">
                When you mute someone, they'll appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {mutedUsers.map((mutedUser) => (
                <div
                  key={mutedUser.did}
                  className="flex items-center gap-4 p-4 bg-surface rounded-xl"
                >
                  {/* Avatar */}
                  <Link
                    href={`/profile/${mutedUser.handle}`}
                    className="w-12 h-12 rounded-full bg-background flex items-center justify-center overflow-hidden flex-shrink-0"
                  >
                    {mutedUser.avatar ? (
                      <img
                        src={mutedUser.avatar}
                        alt={mutedUser.handle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-text-primary font-medium">
                        {mutedUser.handle[0]?.toUpperCase()}
                      </span>
                    )}
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/profile/${mutedUser.handle}`}
                      className="font-medium text-text-primary hover:underline truncate block"
                    >
                      {mutedUser.displayName || `@${mutedUser.handle}`}
                    </Link>
                    <p className="text-sm text-text-muted truncate">@{mutedUser.handle}</p>
                  </div>

                  {/* Unmute button */}
                  <button
                    onClick={() => unmuteMutation.mutate(`at://${user?.did}/app.bsky.graph.mute/${mutedUser.did}`)}
                    disabled={unmuteMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-accent border border-accent rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
                  >
                    {unmuteMutation.isPending ? '...' : 'Unmute'}
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

function MuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
      />
    </svg>
  );
}
