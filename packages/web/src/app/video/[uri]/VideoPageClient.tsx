'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { useLoginModal } from '@/components/LoginModal';
import { VideoPlayer } from '@/components/VideoPlayer';
import { CommentThread } from '@/components/comments/CommentThread';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useVideoShare } from '@/hooks/useVideoShare';
import { formatCount } from '@/lib/utils';
import type { CommentsPosition } from '@exprsn/shared';
import toast from 'react-hot-toast';

interface VideoPageClientProps {
  uri: string;
}

export function VideoPageClient({ uri }: VideoPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { open: openLoginModal } = useLoginModal();
  const queryClient = useQueryClient();
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const trackedViewRef = useRef<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['video', uri],
    queryFn: () => api.getVideo(uri),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    enabled: !!user,
  });

  const video = data?.video;
  const commentsPosition: CommentsPosition = settingsData?.settings?.layout?.commentsPosition ?? 'side';
  const cameFromShare = searchParams.get('ref') === 'share';
  const sharedByHandle = searchParams.get('sharedBy')?.replace(/^@/, '').trim() || null;
  const { share, shareCount, shareState } = useVideoShare({
    video: video ?? null,
    user,
  });
  const { data: authorProfileData } = useQuery({
    queryKey: ['video-author-profile', video?.author.handle],
    queryFn: () => api.getProfile(video!.author.handle),
    enabled: cameFromShare && !!video && !!user && user.did !== video.author.did,
  });

  // Update state when video data changes
  useEffect(() => {
    if (video) {
      setIsLiked(video.viewer?.liked ?? false);
      setLikeCount(video.likeCount ?? 0);
    }
  }, [video]);

  useEffect(() => {
    if (!video || trackedViewRef.current === video.uri) return;

    trackedViewRef.current = video.uri;
    api.trackView(video.uri, {
      sessionPosition: 1,
      engagementActions: cameFromShare ? ['shared'] : undefined,
      videoDuration: video.video?.duration || video.duration,
    }).catch(() => {});
  }, [cameFromShare, video]);

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!video) throw new Error('No video');
      if (isLiked && video.viewer?.likeUri) {
        await api.unlike(video.viewer.likeUri);
        return { liked: false };
      } else {
        await api.like(video.uri, video.cid);
        return { liked: true };
      }
    },
    onMutate: async () => {
      setIsLiked(!isLiked);
      setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
    },
    onError: () => {
      if (video) {
        setIsLiked(video.viewer?.liked ?? false);
        setLikeCount(video.likeCount ?? 0);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', uri] });
    },
  });

  const followFromShareMutation = useMutation({
    mutationFn: async () => {
      if (!video) throw new Error('No video');

      await api.follow(video.author.did);
    },
    onSuccess: () => {
      if (!video) return;
      api.trackVideoEvent(video.uri, 'share_recipient_followed', ['shared_link']).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['video-author-profile', video.author.handle] });
      toast.success(`Following @${video.author.handle}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to follow creator');
    },
  });

  const handleLike = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    likeMutation.mutate();
  };

  const handleFollowFromShare = () => {
    if (!video) return;
    if (!user) {
      openLoginModal('Log in to follow creators from shared videos');
      return;
    }
    followFromShareMutation.mutate();
  };

  const getVideoUrl = () => {
    if (!video) return '';
    const url = video.video?.hlsPlaylist || video.hlsPlaylist || video.video?.cdnUrl || video.cdnUrl;
    if (!url) return '';
    return url.startsWith('/') ? `http://localhost:3002${url}` : url;
  };

  const renderVideoContent = () => {
    if (isLoading) {
      return <div className="animate-pulse w-full max-w-md aspect-[9/16] bg-surface rounded-lg" />;
    }

    if (error || !video) {
      return (
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Video not found</h2>
          <p className="text-gray-400 mb-4">This video may have been removed or is unavailable.</p>
          <Link href="/" className="text-accent hover:underline">
            Go back home
          </Link>
        </div>
      );
    }

    return (
      <div className="relative w-full max-w-md aspect-[9/16]">
        <VideoPlayer
          src={getVideoUrl()}
          poster={video.video?.thumbnail || video.thumbnailUrl}
          autoPlay
          loop
          muted={false}
          className="w-full h-full rounded-lg"
        />

        {/* Video Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          {/* Author */}
          <Link
            href={`/profile/${video.author.handle}`}
            className="flex items-center gap-3 mb-3"
          >
            <div className="w-10 h-10 rounded-full bg-surface overflow-hidden">
              {video.author.avatar ? (
                <img
                  src={video.author.avatar}
                  alt={video.author.displayName || video.author.handle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                  {video.author.handle[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-white font-semibold">
                {video.author.displayName || `@${video.author.handle}`}
              </p>
              <p className="text-gray-300 text-sm">@{video.author.handle}</p>
            </div>
          </Link>

          {/* Caption */}
          {video.caption && (
            <p className="text-white text-sm mb-2">{video.caption}</p>
          )}

          {/* Tags */}
          {video.tags && video.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {video.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tag/${encodeURIComponent(tag)}`}
                  className="text-accent text-sm hover:underline"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderVideoStats = () => {
    if (!video) return null;

    const alreadyFollowingAuthor = authorProfileData?.profile.viewer?.following ?? false;
    const canShowFollowCta =
      !user || !!authorProfileData || user.did === video.author.did;
    const showFollowCta =
      cameFromShare &&
      user?.did !== video.author.did &&
      canShowFollowCta &&
      !alreadyFollowingAuthor;
    const sharedByLabel = sharedByHandle ? `Shared by @${sharedByHandle}` : 'Shared with you';

    return (
      <div className="p-4 border-b border-border">
        {cameFromShare && (
          <div className="mb-4 rounded-2xl border border-accent/20 bg-accent/10 p-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent">
              <ShareIcon className="h-4 w-4" />
              <span>{sharedByLabel}</span>
            </div>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Keep up with @{video.author.handle} if this one hit.
                </p>
                <p className="text-sm text-text-muted">
                  Follow the creator or pass the video on while it is already in motion.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {showFollowCta ? (
                  <button
                    onClick={handleFollowFromShare}
                    disabled={followFromShareMutation.isPending}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover disabled:opacity-60"
                  >
                    {followFromShareMutation.isPending ? 'Following...' : `Follow @${video.author.handle}`}
                  </button>
                ) : user?.did !== video.author.did ? (
                  <Link
                    href={`/profile/${video.author.handle}`}
                    className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
                  >
                    {alreadyFollowingAuthor ? 'View creator' : 'See creator'}
                  </Link>
                ) : null}
                <button
                  onClick={share}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
                >
                  Share this video
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={handleLike}
            disabled={likeMutation.isPending}
            className="flex items-center gap-2 text-text-primary hover:text-accent transition-colors"
          >
            <HeartIcon filled={isLiked} className={`w-6 h-6 ${isLiked ? 'text-red-500' : ''}`} />
            <span className="font-medium">{formatCount(likeCount)}</span>
          </button>
          <div className="flex items-center gap-2 text-text-muted">
            <CommentIcon className="w-6 h-6" />
            <span>{formatCount(video.commentCount ?? 0)}</span>
          </div>
          <div className="flex items-center gap-2 text-text-muted">
            <ViewIcon className="w-6 h-6" />
            <span>{formatCount(video.viewCount ?? 0)}</span>
          </div>
          <button
            onClick={share}
            className={`flex items-center gap-2 transition-colors ${
              shareState === 'shared' ? 'text-accent' : 'text-text-muted hover:text-accent'
            }`}
          >
            <ShareIcon className="w-6 h-6" />
            <span>{formatCount(shareCount)}</span>
          </button>
        </div>
        {shareState === 'shared' && (
          <p className="mt-3 text-sm text-accent">
            Link copied. Send it to a friend.
          </p>
        )}
        {cameFromShare && (
          <p className="mt-3 text-sm text-text-muted">
            Opened from a shared link. If it lands, follow the creator or pass it on.
          </p>
        )}
      </div>
    );
  };

  // Side layout: video on left, comments on right
  if (commentsPosition === 'side') {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
          <div className="flex h-screen">
            {/* Video Section */}
            <div className="flex-1 flex items-center justify-center bg-black relative">
              {/* Back button */}
              <button
                onClick={() => router.back()}
                className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
              >
                <BackIcon className="w-6 h-6 text-white" />
              </button>
              {renderVideoContent()}
            </div>

            {/* Sidebar Actions & Comments */}
            {video && (
              <div className="w-96 border-l border-border bg-background flex flex-col hidden lg:flex">
                {renderVideoStats()}
                {/* Inline Comments */}
                <div className="flex-1 overflow-hidden">
                  <CommentThread
                    videoUri={video.uri}
                    inline={true}
                    position="side"
                  />
                </div>
              </div>
            )}
          </div>
          {video && (
            <div className="border-t border-border bg-background lg:hidden">
              {renderVideoStats()}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Bottom layout: video on top, comments on bottom
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="flex flex-col h-screen">
          {/* Video Section */}
          <div className="flex-1 flex items-center justify-center bg-black relative min-h-0">
            {/* Back button */}
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            >
              <BackIcon className="w-6 h-6 text-white" />
            </button>
            {renderVideoContent()}
          </div>

          {/* Bottom Actions & Comments */}
          {video && (
            <div className="border-t border-border bg-background flex flex-col hidden lg:flex max-h-[45vh]">
              {renderVideoStats()}
              {/* Inline Comments */}
              <div className="flex-1 overflow-hidden">
                <CommentThread
                  videoUri={video.uri}
                  inline={true}
                  position="bottom"
                />
              </div>
            </div>
          )}
        </div>
        {video && (
          <div className="border-t border-border bg-background lg:hidden">
            {renderVideoStats()}
          </div>
        )}
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

function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
      />
    </svg>
  );
}

function ViewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
      />
    </svg>
  );
}
