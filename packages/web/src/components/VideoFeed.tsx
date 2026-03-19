'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { api, type VideoView } from '@/lib/api';
import { VideoPlayer, type VideoPlayerHandle } from './VideoPlayer';
import { VideoActions } from './VideoActions';
import { VideoOverlay } from './VideoOverlay';
import { SuggestedUsers } from './SuggestedUsers';
import { useFeedStore } from '@/stores/feed-store';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useAccessibility } from '@/stores/settings-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface VideoFeedProps {
  feedType: string;
}

// Track watch progress for a video
interface WatchProgress {
  startTime: number;
  watchedDuration: number;
  loopCount: number;
  milestonesSent: Set<string>;
  engagementActions: Set<string>;
  videoDuration: number;
}

export function VideoFeed({ feedType }: VideoFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { reducedMotion } = useAccessibility();

  // Also detect OS-level preference so the setting works before the store loads
  const prefersReducedMotion =
    reducedMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const viewTrackedRef = useRef<Set<string>>(new Set());
  const watchProgressRef = useRef<Map<string, WatchProgress>>(new Map());
  const preloadedVideosRef = useRef<Set<string>>(new Set());
  const hasRestoredPosition = useRef(false);

  const { savePosition, getPosition } = useFeedStore();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    useInfiniteQuery({
      queryKey: ['feed', feedType],
      queryFn: ({ pageParam }) => api.getFeed(feedType, pageParam),
      getNextPageParam: (lastPage) => lastPage.cursor,
      initialPageParam: undefined as string | undefined,
    });

  const videos = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.feed) ?? [];
    // Deduplicate by URI to prevent React key warnings when pages overlap
    const seen = new Set<string>();
    return all.filter((v) => {
      if (seen.has(v.uri)) return false;
      seen.add(v.uri);
      return true;
    });
  }, [data]);

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const { isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    enabled: true,
  });

  // Preload next videos when current video changes
  useEffect(() => {
    if (videos.length === 0) return;

    // Preload next 2 videos
    const videosToPreload = videos.slice(currentIndex + 1, currentIndex + 3);
    videosToPreload.forEach((video) => {
      if (preloadedVideosRef.current.has(video.uri)) return;
      preloadedVideosRef.current.add(video.uri);

      const videoEmbed = video.video;
      const rawSrc = videoEmbed?.hlsPlaylist || videoEmbed?.cdnUrl;
      if (!rawSrc) return;

      const src = rawSrc.startsWith('/') ? `${API_BASE}${rawSrc}` : rawSrc;

      // Create link preload for video
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'fetch';
      link.href = src;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);

      // Also preload thumbnail
      const rawPoster = videoEmbed?.thumbnail || video.thumbnailUrl;
      if (rawPoster) {
        const poster = rawPoster.startsWith('/') ? `${API_BASE}${rawPoster}` : rawPoster;
        const imgLink = document.createElement('link');
        imgLink.rel = 'preload';
        imgLink.as = 'image';
        imgLink.href = poster;
        document.head.appendChild(imgLink);
      }
    });
  }, [currentIndex, videos]);

  // Load more when near end - start earlier for smoother experience
  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    rootMargin: '200px', // Start loading 200px before visible
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  });

  // Track engagement action
  const trackEngagement = useCallback((videoUri: string, action: string) => {
    const progress = watchProgressRef.current.get(videoUri);
    if (progress) {
      progress.engagementActions.add(action);
    }
  }, []);

  // Handle video progress updates
  const handleVideoProgress = useCallback(
    (videoUri: string, currentTime: number, duration: number, looped: boolean) => {
      let progress = watchProgressRef.current.get(videoUri);

      if (!progress) {
        progress = {
          startTime: Date.now(),
          watchedDuration: 0,
          loopCount: 0,
          milestonesSent: new Set(),
          engagementActions: new Set(),
          videoDuration: duration,
        };
        watchProgressRef.current.set(videoUri, progress);
      }

      progress.watchedDuration = currentTime;
      progress.videoDuration = duration;

      if (looped) {
        progress.loopCount++;
      }

      // Send milestone updates
      const completionRate = duration > 0 ? currentTime / duration : 0;
      const milestones = ['25%', '50%', '75%', '100%'] as const;

      for (const milestone of milestones) {
        const threshold = parseInt(milestone) / 100;
        if (completionRate >= threshold && !progress.milestonesSent.has(milestone)) {
          progress.milestonesSent.add(milestone);

          // Send tracking update
          api
            .trackView(videoUri, {
              watchDuration: Math.round(currentTime),
              completed: milestone === '100%',
              loopCount: progress.loopCount,
              sessionPosition: currentIndex + 1,
              engagementActions: Array.from(progress.engagementActions),
              milestone,
              videoDuration: duration,
            })
            .catch(() => {});
        }
      }
    },
    [currentIndex]
  );

  // Handle scroll to update current video
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;

    videos.forEach((video, index) => {
      const element = videoRefs.current.get(video.uri);
      if (element) {
        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(containerCenter - elementCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      }
    });

    if (closestIndex !== currentIndex) {
      // Send final tracking for the video we're leaving
      const prevVideo = videos[currentIndex];
      if (prevVideo) {
        const progress = watchProgressRef.current.get(prevVideo.uri);
        if (progress && progress.watchedDuration > 0) {
          const completionRate = progress.videoDuration > 0
            ? progress.watchedDuration / progress.videoDuration
            : 0;

          api
            .trackView(prevVideo.uri, {
              watchDuration: Math.round(progress.watchedDuration),
              completed: completionRate >= 0.95,
              loopCount: progress.loopCount,
              sessionPosition: currentIndex + 1,
              engagementActions: Array.from(progress.engagementActions),
              videoDuration: progress.videoDuration,
            })
            .catch(() => {});
        }
      }

      setCurrentIndex(closestIndex);

      // Track view for the new current video
      const currentVideo = videos[closestIndex];
      if (currentVideo && !viewTrackedRef.current.has(currentVideo.uri)) {
        viewTrackedRef.current.add(currentVideo.uri);
        api.trackView(currentVideo.uri, { sessionPosition: closestIndex + 1 }).catch(() => {});
      }
    }
  }, [videos, currentIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Track initial video view
  useEffect(() => {
    if (videos.length > 0 && !viewTrackedRef.current.has(videos[0].uri)) {
      viewTrackedRef.current.add(videos[0].uri);
      api.trackView(videos[0].uri, { sessionPosition: 1 }).catch(() => {});
    }
  }, [videos]);

  // Restore scroll position when component mounts
  useEffect(() => {
    if (!hasRestoredPosition.current && videos.length > 0 && containerRef.current) {
      const savedPosition = getPosition(feedType);
      if (savedPosition) {
        // Wait a tick for the DOM to settle
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = savedPosition.scrollTop;
            setCurrentIndex(savedPosition.currentIndex);
            hasRestoredPosition.current = true;
          }
        }, 0);
      } else {
        hasRestoredPosition.current = true;
      }
    }
  }, [videos.length, feedType, getPosition]);

  // Save scroll position when scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScrollForPosition = () => {
      if (hasRestoredPosition.current) {
        savePosition(feedType, container.scrollTop, currentIndex);
      }
    };

    // Throttle position saving
    let timeoutId: NodeJS.Timeout;
    const throttledSave = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleScrollForPosition, 500);
    };

    container.addEventListener('scroll', throttledSave);
    return () => {
      clearTimeout(timeoutId);
      container.removeEventListener('scroll', throttledSave);
    };
  }, [feedType, currentIndex, savePosition]);

  // Memoize context value for video items
  const feedContext = useMemo(
    () => ({
      onProgress: handleVideoProgress,
      onEngagement: trackEngagement,
    }),
    [handleVideoProgress, trackEngagement]
  );

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-3rem)] flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full loading-spinner" />
      </div>
    );
  }

  if (videos.length === 0) {
    const isFollowingFeed = feedType === 'following';
    return (
      <div className="h-[calc(100vh-3rem)] flex flex-col items-center justify-center bg-background text-text-primary px-4 text-center">
        <EmptyIcon className="w-16 h-16 text-text-muted mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          {isFollowingFeed ? 'No videos from people you follow' : 'No videos yet'}
        </h2>
        <p className="text-text-muted max-w-md mb-8">
          {isFollowingFeed
            ? 'Start following creators to see their videos here.'
            : 'Be the first to upload a video!'}
        </p>
        {isFollowingFeed && (
          <div className="w-full max-w-sm bg-surface p-4 rounded-xl">
            <SuggestedUsers limit={5} showTitle={true} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-[calc(100vh-3rem)] overflow-y-scroll no-scrollbar',
        prefersReducedMotion ? 'overflow-y-auto' : 'snap-feed'
      )}
    >
      {/* Pull to refresh indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pointer-events-none transition-all"
          style={{
            transform: `translateY(${isPulling ? Math.min(pullDistance, 80) : 0}px)`,
            opacity: isPulling || isRefreshing ? 1 : 0,
          }}
        >
          <div className="bg-surface/95 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
            {isRefreshing ? (
              <>
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-text-primary">Refreshing...</span>
              </>
            ) : (
              <>
                <RefreshIcon className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-text-primary">
                  {pullDistance >= 80 ? 'Release to refresh' : 'Pull to refresh'}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {videos.map((video, index) => (
        <VideoItem
          key={video.uri}
          video={video}
          isActive={index === currentIndex}
          reducedMotion={prefersReducedMotion}
          onProgress={feedContext.onProgress}
          onEngagement={feedContext.onEngagement}
          ref={(el) => {
            if (el) {
              videoRefs.current.set(video.uri, el);
            } else {
              videoRefs.current.delete(video.uri);
            }
          }}
        />
      ))}

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="h-20 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full loading-spinner" />
        </div>
      )}
    </div>
  );
}

interface VideoItemProps {
  video: VideoView;
  isActive: boolean;
  reducedMotion: boolean;
  onProgress: (videoUri: string, currentTime: number, duration: number, looped: boolean) => void;
  onEngagement: (videoUri: string, action: string) => void;
}

const VideoItem = ({
  video,
  isActive,
  reducedMotion,
  onProgress,
  onEngagement,
  ref,
}: VideoItemProps & { ref: (el: HTMLDivElement | null) => void }) => {
  const videoRef = useRef<VideoPlayerHandle>(null);
  const lastTimeRef = useRef(0);

  // Video data is nested under video.video from the API
  const videoEmbed = video.video;
  const rawSrc = videoEmbed?.hlsPlaylist || videoEmbed?.cdnUrl || '';
  const src = rawSrc.startsWith('/') ? `${API_BASE}${rawSrc}` : rawSrc;

  const rawPoster = videoEmbed?.thumbnail || video.thumbnailUrl || '';
  const poster = rawPoster.startsWith('/') ? `${API_BASE}${rawPoster}` : rawPoster;

  // Handle time updates for progress tracking
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    // Detect loop (time went backwards)
    const looped = currentTime < lastTimeRef.current - 1;
    lastTimeRef.current = currentTime;

    onProgress(video.uri, currentTime, duration, looped);
  }, [video.uri, onProgress]);

  // Handle play event
  const handlePlay = useCallback(() => {
    onEngagement(video.uri, 'played');
  }, [video.uri, onEngagement]);

  // Handle pause event
  const handlePause = useCallback(() => {
    onEngagement(video.uri, 'paused');
  }, [video.uri, onEngagement]);

  // Handle double-tap to like
  const handleDoubleTap = useCallback(() => {
    onEngagement(video.uri, 'liked');
  }, [video.uri, onEngagement]);

  return (
    <div ref={ref} className={cn('relative h-screen w-full', !reducedMotion && 'snap-start')}>
      <VideoPlayer
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={isActive && !reducedMotion}
        loop
        muted  // Must be muted for autoplay to work in browsers
        showControls={false}  // Hide controls in feed view
        className="h-full w-full"
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onDoubleTap={handleDoubleTap}
      />
      {/* When reduced motion is on and video is active but not yet playing,
          show a visible play button so users can start playback themselves. */}
      {reducedMotion && isActive && (
        <button
          onClick={() => videoRef.current?.play()}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
      <VideoOverlay video={video} />
      <VideoActions
        video={video}
        onEngagement={(action) => onEngagement(video.uri, action)}
      />
    </div>
  );
};

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}
