'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { api, type VideoView } from '@/lib/api';
import { VideoPlayer } from './VideoPlayer';
import { VideoActions } from './VideoActions';
import { VideoOverlay } from './VideoOverlay';

interface VideoFeedProps {
  feedType: string;
}

export function VideoFeed({ feedType }: VideoFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const viewTrackedRef = useRef<Set<string>>(new Set());

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['feed', feedType],
      queryFn: ({ pageParam }) => api.getFeed(feedType, pageParam),
      getNextPageParam: (lastPage) => lastPage.cursor,
      initialPageParam: undefined as string | undefined,
    });

  const videos = data?.pages.flatMap((page) => page.feed) ?? [];

  // Load more when near end
  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  });

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
      setCurrentIndex(closestIndex);

      // Track view for the new current video
      const currentVideo = videos[closestIndex];
      if (currentVideo && !viewTrackedRef.current.has(currentVideo.uri)) {
        viewTrackedRef.current.add(currentVideo.uri);
        api.trackView(currentVideo.uri).catch(() => {});
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
      api.trackView(videos[0].uri).catch(() => {});
    }
  }, [videos]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full loading-spinner" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white">
        <EmptyIcon className="w-16 h-16 text-gray-600 mb-4" />
        <p className="text-gray-400">No videos yet</p>
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
}

const VideoItem = ({
  video,
  isActive,
  ref,
}: VideoItemProps & { ref: (el: HTMLDivElement | null) => void }) => {
  // Video data is nested under video.video from the API
  const videoEmbed = video.video;
  const src = videoEmbed?.hlsPlaylist || videoEmbed?.cdnUrl || '';

  return (
    <div ref={ref} className="relative h-screen w-full snap-start">
      <VideoPlayer
        src={src}
        poster={videoEmbed?.thumbnail || video.thumbnailUrl}
        autoPlay={isActive}
        loop
        muted  // Must be muted for autoplay to work in browsers
        className="h-full w-full"
      />
      <VideoOverlay video={video} />
      <VideoActions video={video} />
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
