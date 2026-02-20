'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar, useSidebar } from '@/components/Sidebar';
import { UserActionsMenu } from '@/components/UserActionsMenu';
import { BlockedMutedSettings } from '@/components/settings/BlockedMutedSettings';
import { api, VideoView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const handle = params.handle as string;
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { openSettings } = useSidebar();
  const [activeTab, setActiveTab] = useState<'videos' | 'liked' | 'blocked'>('videos');

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

  const messageMutation = useMutation({
    mutationFn: (did: string) => api.getOrCreateConversation(did),
    onSuccess: (result) => {
      router.push(`/messages/${result.conversation.id}`);
    },
    onError: () => {
      toast.error('Failed to start conversation');
    },
  });

  const handleMessageClick = () => {
    if (!user) {
      router.push('/login?redirect=' + encodeURIComponent(`/profile/${handle}`));
      return;
    }
    if (data?.profile.did) {
      messageMutation.mutate(data.profile.did);
    }
  };

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
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-text-muted">@{data.profile.handle}</p>
                    {!isOwnProfile && data.profile.viewer?.followedBy && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-surface text-text-muted rounded">
                        Follows you
                      </span>
                    )}
                  </div>

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

                  {/* Location & Links */}
                  <div className="flex flex-wrap items-center gap-4 mb-4">
                    {data.profile.location && (
                      <span className="flex items-center gap-1 text-text-muted text-sm">
                        <LocationIcon className="w-4 h-4" />
                        {data.profile.location}
                      </span>
                    )}
                    {data.profile.website && (
                      <a
                        href={data.profile.website.startsWith('http') ? data.profile.website : `https://${data.profile.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-accent hover:underline text-sm"
                      >
                        <LinkIcon className="w-4 h-4" />
                        {data.profile.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    {data.profile.socialLinks?.twitter && (
                      <a
                        href={`https://twitter.com/${data.profile.socialLinks.twitter.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-muted hover:text-text-primary transition-colors"
                        title="Twitter"
                      >
                        <TwitterIcon className="w-5 h-5" />
                      </a>
                    )}
                    {data.profile.socialLinks?.instagram && (
                      <a
                        href={`https://instagram.com/${data.profile.socialLinks.instagram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-muted hover:text-text-primary transition-colors"
                        title="Instagram"
                      >
                        <InstagramIcon className="w-5 h-5" />
                      </a>
                    )}
                    {data.profile.socialLinks?.youtube && (
                      <a
                        href={data.profile.socialLinks.youtube.startsWith('http') ? data.profile.socialLinks.youtube : `https://youtube.com/${data.profile.socialLinks.youtube}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-muted hover:text-text-primary transition-colors"
                        title="YouTube"
                      >
                        <YouTubeIcon className="w-5 h-5" />
                      </a>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    {isOwnProfile ? (
                      <>
                        <Link
                          href="/profile/edit"
                          className="inline-block px-6 py-2 border border-border rounded-lg text-text-primary hover:bg-surface transition-colors"
                        >
                          Edit profile
                        </Link>
                        <button
                          onClick={openSettings}
                          className="p-2 border border-border rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                          aria-label="Settings"
                        >
                          <SettingsIcon className="w-5 h-5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleFollowClick}
                          disabled={followMutation.isPending || unfollowMutation.isPending || data?.profile.viewer?.blockedBy}
                          className={cn(
                            'px-6 py-2 rounded-lg font-medium transition-colors',
                            data?.profile.viewer?.blockedBy
                              ? 'bg-surface text-text-muted cursor-not-allowed'
                              : isFollowing
                                ? 'border border-border text-text-primary hover:bg-surface'
                                : 'bg-accent text-white hover:bg-accent-hover'
                          )}
                        >
                          {followMutation.isPending || unfollowMutation.isPending
                            ? '...'
                            : data?.profile.viewer?.blockedBy
                              ? 'Blocked'
                              : isFollowing
                                ? 'Following'
                                : 'Follow'}
                        </button>
                        <button
                          onClick={handleMessageClick}
                          disabled={data?.profile.viewer?.blockedBy || messageMutation.isPending}
                          className={cn(
                            'px-6 py-2 border border-border rounded-lg transition-colors',
                            data?.profile.viewer?.blockedBy
                              ? 'text-text-muted cursor-not-allowed'
                              : 'text-text-primary hover:bg-surface'
                          )}
                        >
                          {messageMutation.isPending ? '...' : 'Message'}
                        </button>
                        <UserActionsMenu
                          userDid={data.profile.did}
                          userHandle={data.profile.handle}
                          viewer={{
                            blocking: data.profile.viewer?.blocking,
                            blockUri: data.profile.viewer?.blockUri,
                            muting: data.profile.viewer?.muting,
                            muteUri: data.profile.viewer?.muteUri,
                          }}
                        />
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
                  {isOwnProfile && (
                    <button
                      onClick={() => setActiveTab('blocked')}
                      className={cn(
                        'pb-4 px-2 font-medium transition-colors relative',
                        activeTab === 'blocked'
                          ? 'text-text-primary'
                          : 'text-text-muted hover:text-text-primary'
                      )}
                    >
                      Blocked & Muted
                      {activeTab === 'blocked' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'blocked' && isOwnProfile ? (
                <BlockedMutedSettings />
              ) : (
                <>
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
        <span className="flex items-center gap-1">
          <HeartIcon className="w-4 h-4" />
          {formatCount(video.likeCount)}
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

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
