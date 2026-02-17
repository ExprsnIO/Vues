'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api, ActorProfileView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCount } from '@/lib/utils';

interface SuggestedUsersProps {
  limit?: number;
  showTitle?: boolean;
  compact?: boolean;
}

export function SuggestedUsers({
  limit = 5,
  showTitle = true,
  compact = false,
}: SuggestedUsersProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suggestions', limit],
    queryFn: () => api.getSuggestions({ limit }),
    enabled: !!user,
  });

  const followMutation = useMutation({
    mutationFn: (did: string) => api.follow(did),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
    },
  });

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {showTitle && (
          <h3 className="text-text-secondary font-medium text-sm">
            Suggested accounts
          </h3>
        )}
        {[...Array(limit)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-surface" />
            <div className="flex-1">
              <div className="h-4 w-24 bg-surface rounded mb-1" />
              <div className="h-3 w-16 bg-surface rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const suggestions = data?.actors || [];

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {showTitle && (
        <div className="flex items-center justify-between">
          <h3 className="text-text-secondary font-medium text-sm">
            Suggested accounts
          </h3>
          <Link
            href="/discover"
            className="text-accent text-xs font-medium hover:underline"
          >
            See all
          </Link>
        </div>
      )}

      {suggestions.map((actor) => (
        <SuggestedUserItem
          key={actor.did}
          actor={actor}
          compact={compact}
          onFollow={() => followMutation.mutate(actor.did)}
          isFollowing={followMutation.isPending}
        />
      ))}
    </div>
  );
}

interface SuggestedUserItemProps {
  actor: ActorProfileView;
  compact?: boolean;
  onFollow: () => void;
  isFollowing: boolean;
}

function SuggestedUserItem({
  actor,
  compact,
  onFollow,
  isFollowing,
}: SuggestedUserItemProps) {
  return (
    <div className="flex items-center gap-3">
      <Link href={`/profile/${actor.handle}`} className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-surface overflow-hidden">
          {actor.avatar ? (
            <img
              src={actor.avatar}
              alt={actor.handle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-primary font-semibold">
              {actor.handle[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          href={`/profile/${actor.handle}`}
          className="block text-text-primary text-sm font-medium truncate hover:underline"
        >
          {actor.displayName || `@${actor.handle}`}
          {actor.verified && <VerifiedBadge />}
        </Link>
        <p className="text-text-muted text-xs truncate">
          {compact ? `@${actor.handle}` : `${formatCount(actor.followerCount || 0)} followers`}
        </p>
      </div>

      <button
        onClick={onFollow}
        disabled={isFollowing}
        className="px-3 py-1 bg-accent hover:bg-accent-hover text-text-inverse text-xs font-medium rounded transition-colors disabled:opacity-50"
      >
        {isFollowing ? '...' : 'Follow'}
      </button>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <svg
      className="w-3.5 h-3.5 text-accent inline ml-0.5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
