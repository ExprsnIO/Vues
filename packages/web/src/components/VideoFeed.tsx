'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { api, type VideoView } from '@/lib/api';
import { VideoPlayer, type VideoPlayerHandle } from './VideoPlayer';
import { VideoActions } from './VideoActions';
import { VideoOverlay } from './VideoOverlay';
import { SuggestedUsers } from './SuggestedUsers';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const viewTrackedRef = useRef<Set<string>>(new Set());
  const watchProgressRef = useRef<Map<string, WatchProgress>>(new Map());
  const preloadedVideosRef = useRef<Set<string>>(new Set());

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['feed', feedType],
      queryFn: ({ pageParam }) => api.getFeed(feedType, pageParam),
      getNextPageParam: (lastPage) => lastPage.cursor,
      initialPageParam: undefined as string | undefined,
    });

  const videos = data?.pages.flatMap((page) => page.feed) ?? [];

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
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full loading-spinner" />
      </div>
    );
  }

  if (videos.length === 0) {
    const isFollowingFeed = feedType === 'following';
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background text-text-primary px-4 text-center">
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
      className="h-screen overflow-y-scroll snap-feed no-scrollbar"
    >
      {videos.map((video, index) => (
        <VideoItem
          key={video.uri}
          video={video}
          isActive={index === currentIndex}
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
  onProgress: (videoUri: string, currentTime: number, duration: number, looped: boolean) => void;
  onEngagement: (videoUri: string, action: string) => void;
}

const VideoItem = ({
  video,
  isActive,
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
    <div ref={ref} className="relative h-screen w-full snap-start">
      <VideoPlayer
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={isActive}
        loop
        muted  // Must be muted for autoplay to work in browsers
        showControls={false}  // Hide controls in feed view
        className="h-full w-full"
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onDoubleTap={handleDoubleTap}
      />
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
