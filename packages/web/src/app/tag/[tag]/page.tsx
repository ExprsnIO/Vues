'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { VideoFeed } from '@/components/VideoFeed';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCount } from '@/lib/utils';

export default function TagPage() {
  const params = useParams();
  const tag = decodeURIComponent(params.tag as string).replace(/^#/, '');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: hashtagInfo, isLoading: infoLoading } = useQuery({
    queryKey: ['hashtag-info', tag],
    queryFn: () => api.getHashtagInfo(tag),
    retry: false,
    // Fall back gracefully if the endpoint doesn't exist yet
  });

  // Fall back to the tag videos endpoint for basic video count if hashtagInfo is unavailable
  const { data: tagData } = useQuery({
    queryKey: ['tag', tag],
    queryFn: () => api.getVideosByTag(tag, { limit: 1 }),
    enabled: !hashtagInfo,
  });

  const videoCount = hashtagInfo?.videoCount ?? tagData?.tag?.videoCount;
  const viewCount = hashtagInfo?.viewCount;
  const followerCount = hashtagInfo?.followerCount;
  const isFollowing = hashtagInfo?.isFollowing ?? false;
  const trending = hashtagInfo?.trending;

  const followMutation = useMutation({
    mutationFn: () =>
      isFollowing ? api.unfollowHashtag(tag) : api.followHashtag(tag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hashtag-info', tag] });
      queryClient.invalidateQueries({ queryKey: ['followed-hashtags'] });
    },
  });

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        {/* Tag Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center flex-shrink-0">
                <HashIcon className="w-8 h-8 text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-text-primary">#{tag}</h1>
                  {trending && <TrendingIndicator direction={trending.direction} velocity={trending.velocity} />}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  {videoCount !== undefined && (
                    <StatBadge label="videos" value={videoCount} />
                  )}
                  {viewCount !== undefined && (
                    <StatBadge label="views" value={viewCount} />
                  )}
                  {followerCount !== undefined && (
                    <StatBadge label="followers" value={followerCount} />
                  )}
                  {trending?.rank !== undefined && (
                    <span className="text-xs text-text-muted">
                      #{trending.rank} trending
                    </span>
                  )}
                </div>
              </div>

              {/* Follow button — only shown to authenticated users */}
              {user && (
                <button
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending || infoLoading}
                  className={
                    isFollowing
                      ? 'flex-shrink-0 px-5 py-2 rounded-lg border border-border text-text-primary text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50'
                      : 'flex-shrink-0 px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50'
                  }
                >
                  {followMutation.isPending
                    ? '...'
                    : isFollowing
                    ? 'Following'
                    : 'Follow'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Video Feed */}
        <VideoFeed feedType={`tag:${tag}`} />
      </main>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <p className="text-text-muted text-sm">
      <span className="text-text-primary font-semibold">{formatCount(value)}</span>{' '}
      {label}
    </p>
  );
}

function TrendingIndicator({
  direction,
  velocity,
}: {
  direction: 'up' | 'down' | 'stable';
  velocity: number;
}) {
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
        <ArrowUpIcon className="w-3 h-3" />
        {velocity > 0 ? `+${Math.round(velocity)}%` : 'Rising'}
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
        <ArrowDownIcon className="w-3 h-3" />
        {velocity < 0 ? `${Math.round(velocity)}%` : 'Falling'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-400/10 px-2 py-0.5 rounded-full">
      <DashIcon className="w-3 h-3" />
      Stable
    </span>
  );
}

function HashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
    </svg>
  );
}

function DashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}
