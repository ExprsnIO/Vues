'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, VideoView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function ProfilePage() {
  const params = useParams();
  const handle = params.handle as string;
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'videos' | 'liked'>('videos');

  const { data, isLoading, error } = useQuery({
    queryKey: ['profile', handle],
    queryFn: () => api.getProfile(handle),
  });

  const followMutation = useMutation({
    mutationFn: () => api.follow(data!.profile.did),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', handle] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => api.unfollow({ did: data!.profile.did }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', handle] });
    },
  });

  const handleFollowClick = () => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (data?.profile.viewer?.following) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const isOwnProfile = user?.did === data?.profile.did;
  const isFollowing = data?.profile.viewer?.following;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {isLoading ? (
            <ProfileSkeleton />
          ) : error ? (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-text-primary mb-2">User not found</h2>
              <p className="text-text-muted">The user @{handle} doesn't exist or has been removed.</p>
            </div>
          ) : data ? (
            <>
              {/* Profile Header */}
              <div className="flex items-start gap-8 mb-8">
                {/* Avatar */}
                <div className="w-32 h-32 rounded-full bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
                  {data.profile.avatar ? (
                    <img
                      src={data.profile.avatar}
                      alt={data.profile.displayName || data.profile.handle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-bold text-text-primary">
                      {data.profile.handle[0]?.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Profile Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <h1 className="text-2xl font-bold text-text-primary">
                      {data.profile.displayName || `@${data.profile.handle}`}
                    </h1>
                    {data.profile.verified && (
                      <VerifiedBadge />
                    )}
                  </div>
                  <p className="text-text-muted mb-4">@{data.profile.handle}</p>

                  {/* Stats */}
                  <div className="flex items-center gap-6 mb-4">
                    <Link href={`/profile/${handle}/following`} className="hover:underline">
                      <span className="font-semibold text-text-primary">{formatCount(data.profile.followingCount)}</span>
                      <span className="text-text-muted ml-1">Following</span>
                    </Link>
                    <Link href={`/profile/${handle}/followers`} className="hover:underline">
                      <span className="font-semibold text-text-primary">{formatCount(data.profile.followerCount)}</span>
                      <span className="text-text-muted ml-1">Followers</span>
                    </Link>
                    <div>
                      <span className="font-semibold text-text-primary">{formatCount(data.profile.videoCount)}</span>
                      <span className="text-text-muted ml-1">Videos</span>
                    </div>
                  </div>

                  {/* Bio */}
                  {data.profile.bio && (
                    <p className="text-text-primary mb-4">{data.profile.bio}</p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    {isOwnProfile ? (
                      <button className="px-6 py-2 border border-border rounded-lg text-text-primary hover:bg-surface transition-colors">
                        Edit profile
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleFollowClick}
                          disabled={followMutation.isPending || unfollowMutation.isPending}
                          className={cn(
                            'px-6 py-2 rounded-lg font-medium transition-colors',
                            isFollowing
                              ? 'border border-border text-text-primary hover:bg-surface'
                              : 'bg-accent text-white hover:bg-accent-hover'
                          )}
                        >
                          {followMutation.isPending || unfollowMutation.isPending
                            ? '...'
                            : isFollowing
                              ? 'Following'
                              : 'Follow'}
                        </button>
                        <button className="px-6 py-2 border border-border rounded-lg text-text-primary hover:bg-surface transition-colors">
                          Message
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-border mb-6">
                <div className="flex gap-8">
                  <button
                    onClick={() => setActiveTab('videos')}
                    className={cn(
                      'pb-4 px-2 font-medium transition-colors relative',
                      activeTab === 'videos'
                        ? 'text-text-primary'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    Videos
                    {activeTab === 'videos' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('liked')}
                    className={cn(
                      'pb-4 px-2 font-medium transition-colors relative',
                      activeTab === 'liked'
                        ? 'text-text-primary'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    Liked
                    {activeTab === 'liked' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                    )}
                  </button>
                </div>
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-3 gap-4">
                {data.videos.map((video) => (
                  <VideoThumbnail key={video.uri} video={video} />
                ))}
              </div>

              {data.videos.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-text-muted">
                    {activeTab === 'videos' ? 'No videos yet' : 'No liked videos'}
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start gap-8 mb-8">
        <div className="w-32 h-32 rounded-full bg-surface" />
        <div className="flex-1">
          <div className="h-8 w-48 bg-surface rounded mb-4" />
          <div className="h-4 w-32 bg-surface rounded mb-4" />
          <div className="flex gap-6 mb-4">
            <div className="h-4 w-24 bg-surface rounded" />
            <div className="h-4 w-24 bg-surface rounded" />
            <div className="h-4 w-24 bg-surface rounded" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="aspect-[9/16] bg-surface rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function VideoThumbnail({ video }: { video: VideoView }) {
  const videoUrl = video.video?.cdnUrl || video.cdnUrl;

  return (
    <Link
      href={`/video/${encodeURIComponent(video.uri)}`}
      className="relative aspect-[9/16] bg-surface rounded-lg overflow-hidden group"
    >
      {video.video?.thumbnail || video.thumbnailUrl ? (
        <img
          src={video.video?.thumbnail || video.thumbnailUrl}
          alt={video.caption || 'Video thumbnail'}
          className="w-full h-full object-cover"
        />
      ) : videoUrl ? (
        <video
          src={videoUrl.startsWith('/') ? `http://localhost:3002${videoUrl}` : videoUrl}
          className="w-full h-full object-cover"
          muted
          preload="metadata"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-muted">
          <PlayIcon className="w-12 h-12" />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <PlayIcon className="w-12 h-12 text-white" />
      </div>

      {/* Stats overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-3 text-white text-sm">
        <span className="flex items-center gap-1">
          <PlayIcon className="w-4 h-4" />
          {formatCount(video.viewCount)}
        </span>
      </div>
    </Link>
  );
}

function VerifiedBadge() {
  return (
    <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return count.toString();
}
