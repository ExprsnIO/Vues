'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar, useSidebar } from '@/components/Sidebar';
import { UserActionsMenu } from '@/components/UserActionsMenu';
import { BlockedMutedSettings } from '@/components/settings/BlockedMutedSettings';
import { api, VideoView, OrganizationView, CollectionView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';

interface ProfileClientProps {
  handle: string;
}

export default function ProfileClient({ handle }: ProfileClientProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { openSettings } = useSidebar();
  const [activeTab, setActiveTab] = useState<'videos' | 'liked' | 'collections' | 'blocked' | 'account'>('videos');
  const [showStatsModal, setShowStatsModal] = useState(false);

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

  // Fetch user's organizations if viewing own profile
  const { data: orgsData } = useQuery({
    queryKey: ['my-organizations'],
    queryFn: () => api.getMyOrganizations(),
    enabled: isOwnProfile,
  });

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
                  <div className="flex items-center gap-6 mb-4 flex-wrap">
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
                    {data.profile.totalViews !== undefined && (
                      <div>
                        <span className="font-semibold text-text-primary">{formatCount(data.profile.totalViews)}</span>
                        <span className="text-text-muted ml-1">Total Views</span>
                      </div>
                    )}
                    {(data.profile.totalViews !== undefined || data.profile.averageEngagement !== undefined || data.profile.mostPopularVideo) && (
                      <button
                        onClick={() => setShowStatsModal(true)}
                        className="text-accent hover:underline text-sm font-medium"
                      >
                        View detailed stats
                      </button>
                    )}
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
                          href="/upload"
                          className="inline-flex items-center gap-2 px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                        >
                          <StudioIcon className="w-4 h-4" />
                          Studio
                        </Link>
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
                  <button
                    onClick={() => setActiveTab('collections')}
                    className={cn(
                      'pb-4 px-2 font-medium transition-colors relative',
                      activeTab === 'collections'
                        ? 'text-text-primary'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    Collections
                    {activeTab === 'collections' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                    )}
                  </button>
                  {isOwnProfile && (
                    <>
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
                      <button
                        onClick={() => setActiveTab('account')}
                        className={cn(
                          'pb-4 px-2 font-medium transition-colors relative',
                          activeTab === 'account'
                            ? 'text-text-primary'
                            : 'text-text-muted hover:text-text-primary'
                        )}
                      >
                        Account
                        {activeTab === 'account' && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'account' && isOwnProfile ? (
                <AccountSection
                  user={user}
                  organizations={orgsData?.organizations || []}
                />
              ) : activeTab === 'blocked' && isOwnProfile ? (
                <BlockedMutedSettings />
              ) : activeTab === 'collections' ? (
                <CollectionsSection handle={handle} />
              ) : (
                <>
                  {/* Pinned Videos Section */}
                  {activeTab === 'videos' && data.pinnedVideos && data.pinnedVideos.length > 0 && (
                    <div className="mb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <PinIcon className="w-5 h-5 text-text-muted" />
                        <h2 className="text-lg font-semibold text-text-primary">Pinned Videos</h2>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {data.pinnedVideos.map((video) => (
                          <VideoThumbnail key={video.uri} video={video} isPinned={true} isOwnProfile={isOwnProfile} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Video Grid */}
                  <div className="grid grid-cols-3 gap-4">
                    {data.videos.map((video) => (
                      <VideoThumbnail key={video.uri} video={video} isOwnProfile={isOwnProfile} />
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

      {/* Enhanced Stats Modal */}
      {showStatsModal && data && (
        <StatsModal
          profile={data.profile}
          onClose={() => setShowStatsModal(false)}
        />
      )}
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

function VideoThumbnail({ video, isPinned = false, isOwnProfile = false }: { video: VideoView; isPinned?: boolean; isOwnProfile?: boolean }) {
  const queryClient = useQueryClient();
  const videoUrl = video.video?.cdnUrl || video.cdnUrl;
  const [isHovering, setIsHovering] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();

  // Check if device supports hover (desktop)
  const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  const pinMutation = useMutation({
    mutationFn: () => api.pinVideo(video.uri),
    onSuccess: () => {
      toast.success('Video pinned to profile');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => {
      toast.error('Failed to pin video');
    },
  });

  const unpinMutation = useMutation({
    mutationFn: () => api.unpinVideo(video.uri),
    onSuccess: () => {
      toast.success('Video unpinned');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => {
      toast.error('Failed to unpin video');
    },
  });

  const handleMouseEnter = () => {
    if (!supportsHover || !videoUrl) return;

    setIsHovering(true);
    // Delay preview start to avoid accidental triggers
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPreview(true);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {
          // Ignore autoplay errors
        });
      }
    }, 300);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setShowPreview(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handlePinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPinned) {
      unpinMutation.mutate();
    } else {
      pinMutation.mutate();
    }
  };

  return (
    <div className="relative aspect-[9/16] bg-surface rounded-lg overflow-hidden group">
      <Link
        href={`/video/${encodeURIComponent(video.uri)}`}
        className="absolute inset-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      {/* Thumbnail image */}
      {video.video?.thumbnail || video.thumbnailUrl ? (
        <img
          src={video.video?.thumbnail || video.thumbnailUrl}
          alt={video.caption || 'Video thumbnail'}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            showPreview && "opacity-0"
          )}
        />
      ) : !videoUrl && (
        <div className="w-full h-full flex items-center justify-center text-text-muted">
          <PlayIcon className="w-12 h-12" />
        </div>
      )}

      {/* Preview video (only on desktop hover) */}
      {videoUrl && supportsHover && (
        <video
          ref={videoRef}
          src={videoUrl.startsWith('/') ? `http://localhost:3002${videoUrl}` : videoUrl}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            showPreview ? "opacity-100" : "opacity-0"
          )}
          muted
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => {
            // Stop after 5 seconds
            if (e.currentTarget.currentTime >= 5) {
              e.currentTarget.pause();
            }
          }}
        />
      )}

      {/* Hover overlay with enhanced view count */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-300",
        isHovering ? "opacity-100" : "opacity-0"
      )}>
        <div className="absolute inset-0 flex items-center justify-center">
          {!showPreview && <PlayIcon className="w-12 h-12 text-white drop-shadow-lg" />}
        </div>

        {/* Enhanced view count on hover */}
        {isHovering && (
          <div className="absolute top-2 left-2 right-2">
            <div className="bg-black/70 backdrop-blur-sm rounded-md px-3 py-2">
              <div className="flex items-center gap-2 text-white text-sm font-medium">
                <PlayIcon className="w-4 h-4" />
                <span>{formatCount(video.viewCount)} views</span>
              </div>
            </div>
          </div>
        )}
      </div>

        {/* Stats overlay (always visible at bottom) */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-3 text-white text-sm drop-shadow-lg">
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

      {/* Pin badge (for pinned videos) */}
      {isPinned && (
        <div className="absolute top-2 right-2 bg-accent text-white rounded-full p-1.5 shadow-lg z-10">
          <PinIcon className="w-4 h-4" />
        </div>
      )}

      {/* Pin/Unpin action button (for own videos on hover) */}
      {isOwnProfile && supportsHover && (
        <button
          onClick={handlePinClick}
          disabled={pinMutation.isPending || unpinMutation.isPending}
          className={cn(
            "absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white rounded-full p-2 shadow-lg transition-opacity z-10",
            "hover:bg-black/90",
            isHovering ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          title={isPinned ? "Unpin from profile" : "Pin to profile"}
        >
          {pinMutation.isPending || unpinMutation.isPending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isPinned ? (
            <UnpinIcon className="w-4 h-4" />
          ) : (
            <PinIcon className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
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

// Account Section Component
function AccountSection({ user, organizations }: { user: { did: string; handle: string } | null; organizations: OrganizationView[] }) {
  const [exportStatus, setExportStatus] = useState<'idle' | 'processing' | 'ready'>('idle');

  // Get role badge color
  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'owner': return 'bg-yellow-500/10 text-yellow-500';
      case 'admin': return 'bg-red-500/10 text-red-500';
      case 'creator': return 'bg-purple-500/10 text-purple-500';
      case 'moderator': return 'bg-blue-500/10 text-blue-500';
      case 'member': return 'bg-green-500/10 text-green-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { success: true };
    },
    onMutate: () => setExportStatus('processing'),
    onSuccess: () => {
      toast.success('Export requested! You\'ll receive an email when it\'s ready.');
      setExportStatus('idle');
    },
    onError: () => {
      setExportStatus('idle');
      toast.error('Failed to request data export');
    },
  });

  return (
    <div className="space-y-6">
      {/* Organizations Section (if user is in any) */}
      {organizations.length > 0 && (
        <div className="bg-surface rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <BuildingIcon className="w-5 h-5 text-purple-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-medium text-text-primary mb-1">Organizations</h3>
              <p className="text-sm text-text-muted mb-4">
                You are a member of {organizations.length} organization{organizations.length > 1 ? 's' : ''}.
              </p>
              <div className="space-y-3">
                {organizations.map((org) => (
                  <div key={org.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center">
                        <span className="text-text-muted font-medium text-xs">
                          {org.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-text-primary font-medium">{org.name}</p>
                        {org.type && (
                          <p className="text-xs text-text-muted capitalize">{org.type}</p>
                        )}
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs font-medium px-2 py-1 rounded-full capitalize",
                      getRoleBadgeColor(org.viewer?.role)
                    )}>
                      {org.viewer?.role || 'member'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Export Section */}
      <div className="bg-surface rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <DownloadIcon className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium text-text-primary mb-1">Download Your Data</h3>
            <p className="text-sm text-text-muted mb-4">
              Get a copy of all your data including your videos, comments, likes, and profile information.
            </p>
            <button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || exportStatus === 'processing'}
              className="px-4 py-2 text-sm font-medium bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors disabled:opacity-50"
            >
              {exportStatus === 'processing' ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                'Request Export'
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function StudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M16 12V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2zm-6 0V4h4v8.5l1.5 1.5h-7l1.5-1.5z" />
    </svg>
  );
}

function UnpinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M2 5.27L3.28 4 20 20.72 18.73 22l-3.73-3.73V22h-2v-6H8v-2l2-2V9.27L2 1.27 3.28 0 2 5.27zM16 12V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.04 0-.08.01-.12.01l9.11 9.11V12h-.01L18 14v2h-3.73L16 12zm-6 0V9.27l1.73 1.73L10 12z" />
    </svg>
  );
}

function StatsModal({ profile, onClose }: { profile: any; onClose: () => void }) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Profile Statistics</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Videos"
              value={formatCount(profile.videoCount)}
              icon={<VideoIcon className="w-5 h-5 text-blue-500" />}
            />
            <StatCard
              label="Total Views"
              value={formatCount(profile.totalViews || 0)}
              icon={<EyeIcon className="w-5 h-5 text-purple-500" />}
            />
            <StatCard
              label="Followers"
              value={formatCount(profile.followerCount)}
              icon={<UsersIcon className="w-5 h-5 text-green-500" />}
            />
            <StatCard
              label="Following"
              value={formatCount(profile.followingCount)}
              icon={<FollowingIcon className="w-5 h-5 text-yellow-500" />}
            />
            {profile.averageEngagement !== undefined && (
              <StatCard
                label="Avg Engagement"
                value={`${profile.averageEngagement.toFixed(1)}%`}
                icon={<ChartIcon className="w-5 h-5 text-pink-500" />}
              />
            )}
            {profile.videoCount > 0 && profile.totalViews && (
              <StatCard
                label="Avg Views/Video"
                value={formatCount(Math.floor(profile.totalViews / profile.videoCount))}
                icon={<TrendingIcon className="w-5 h-5 text-accent" />}
              />
            )}
          </div>

          {/* Most Popular Video */}
          {profile.mostPopularVideo && (
            <div className="bg-background rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-muted mb-3 uppercase">Most Popular Video</h3>
              <Link
                href={`/video/${encodeURIComponent(profile.mostPopularVideo.uri)}`}
                className="flex gap-4 hover:bg-surface-hover rounded-lg p-2 -m-2 transition-colors"
              >
                <div className="w-24 h-32 bg-surface rounded-lg overflow-hidden flex-shrink-0">
                  {profile.mostPopularVideo.video?.thumbnail || profile.mostPopularVideo.thumbnailUrl ? (
                    <img
                      src={profile.mostPopularVideo.video?.thumbnail || profile.mostPopularVideo.thumbnailUrl}
                      alt="Most popular video"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PlayIcon className="w-8 h-8 text-text-muted" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium line-clamp-2 mb-2">
                    {profile.mostPopularVideo.caption || 'Untitled video'}
                  </p>
                  <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                    <span className="flex items-center gap-1">
                      <PlayIcon className="w-4 h-4" />
                      {formatCount(profile.mostPopularVideo.viewCount)} views
                    </span>
                    <span className="flex items-center gap-1">
                      <HeartIcon className="w-4 h-4" />
                      {formatCount(profile.mostPopularVideo.likeCount)} likes
                    </span>
                    <span className="flex items-center gap-1">
                      <CommentIcon className="w-4 h-4" />
                      {formatCount(profile.mostPopularVideo.commentCount)} comments
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-background rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-text-primary mb-1">{value}</p>
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.407.659-.97.659-1.591v-9a2.25 2.25 0 00-2.25-2.25h-9c-.621 0-1.184.252-1.591.659m12.182 12.182L2.909 5.909M1.5 4.5l1.409 1.409" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function FollowingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function TrendingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function CollectionsSection({ handle }: { handle: string }) {
  const { data: collectionsData, isLoading } = useQuery({
    queryKey: ['collections', handle],
    queryFn: () => api.getUserCollections(handle),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="aspect-square bg-surface rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const collections = collectionsData?.collections || [];

  if (collections.length === 0) {
    return (
      <div className="text-center py-16">
        <CollectionGridIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
        <p className="text-text-muted mb-2">No collections yet</p>
        <p className="text-sm text-text-muted">Collections will appear here</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {collections.map((collection) => (
        <CollectionCard key={collection.id} collection={collection} />
      ))}
    </div>
  );
}

function CollectionCard({ collection }: { collection: CollectionView }) {
  return (
    <Link
      href={`/collection/${collection.id}`}
      className="bg-surface rounded-lg overflow-hidden hover:bg-surface-hover transition-colors group"
    >
      {/* Thumbnail Grid (2x2) */}
      <div className="aspect-square grid grid-cols-2 gap-0.5 bg-background">
        {collection.thumbnails.slice(0, 4).map((thumb, i) => (
          <div key={i} className="relative bg-surface overflow-hidden">
            <img
              src={thumb}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        ))}
        {/* Fill empty slots if less than 4 thumbnails */}
        {[...Array(Math.max(0, 4 - collection.thumbnails.length))].map((_, i) => (
          <div key={`empty-${i}`} className="bg-surface flex items-center justify-center">
            <PlayIcon className="w-8 h-8 text-text-muted opacity-30" />
          </div>
        ))}
      </div>

      {/* Collection Info */}
      <div className="p-4">
        <h3 className="font-semibold text-text-primary mb-1 line-clamp-1">
          {collection.name}
        </h3>
        {collection.description && (
          <p className="text-sm text-text-muted mb-2 line-clamp-2">
            {collection.description}
          </p>
        )}
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <CollectionGridIcon className="w-4 h-4" />
          <span>{collection.videoCount} video{collection.videoCount !== 1 ? 's' : ''}</span>
          {!collection.isPublic && (
            <>
              <span>•</span>
              <LockIcon className="w-4 h-4" />
              <span>Private</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function CollectionGridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
