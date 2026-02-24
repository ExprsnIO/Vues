'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function SoundDetailPage() {
  const params = useParams();
  const soundId = params.id as string;
  const [isPlaying, setIsPlaying] = useState(false);
  const [sortBy, setSortBy] = useState<'popular' | 'recent'>('popular');
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sound', soundId],
    queryFn: () => api.getSound(soundId),
    enabled: !!soundId,
  });

  const {
    data: videosData,
    isLoading: videosLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['sound', soundId, 'videos', sortBy],
    queryFn: ({ pageParam }) =>
      api.getVideosUsingSound(soundId, { limit: 20, cursor: pageParam, sort: sortBy }),
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: !!soundId,
    initialPageParam: undefined as string | undefined,
  });

  const videos = videosData?.pages.flatMap((page) => page.videos) || [];

  const togglePlay = () => {
    if (!audioRef.current || !data?.sound?.audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="flex items-start gap-6 mb-8">
            <div className="w-32 h-32 bg-surface-hover rounded-xl" />
            <div className="flex-1">
              <div className="h-8 bg-surface-hover rounded w-1/2 mb-2" />
              <div className="h-4 bg-surface-hover rounded w-1/3 mb-4" />
              <div className="h-10 bg-surface-hover rounded w-40" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.sound) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <MusicIcon className="w-16 h-16 mx-auto text-text-muted mb-4" />
        <h1 className="text-2xl font-bold text-text-primary mb-2">Sound Not Found</h1>
        <p className="text-text-muted mb-6">This sound may have been removed or doesn't exist.</p>
        <Link href="/discover/sounds" className="text-accent hover:underline">
          Browse trending sounds
        </Link>
      </div>
    );
  }

  const { sound, originalVideo, sampleVideos } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Sound Header */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-8">
        {/* Cover */}
        <div className="relative group">
          {sound.coverUrl || (sampleVideos && sampleVideos[0]?.thumbnailUrl) ? (
            <img
              src={sound.coverUrl || sampleVideos?.[0]?.thumbnailUrl}
              alt=""
              className="w-32 h-32 rounded-xl object-cover"
            />
          ) : (
            <div className="w-32 h-32 rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
              <MusicIcon className="w-16 h-16 text-text-inverse" />
            </div>
          )}
          <button
            onClick={togglePlay}
            disabled={!sound.audioUrl}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl disabled:cursor-not-allowed"
          >
            {isPlaying ? (
              <PauseIcon className="w-12 h-12 text-white" />
            ) : (
              <PlayIcon className="w-12 h-12 text-white" />
            )}
          </button>
          {sound.audioUrl && (
            <audio
              ref={audioRef}
              src={sound.audioUrl}
              onEnded={() => setIsPlaying(false)}
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary mb-1">{sound.title}</h1>
          {sound.artist && (
            <p className="text-lg text-text-muted mb-2">{sound.artist}</p>
          )}

          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            <div className="flex items-center gap-1 text-text-muted">
              <VideoIcon className="w-4 h-4" />
              <span>{formatNumber(sound.useCount)} videos</span>
            </div>
            {sound.recentUseCount > 0 && (
              <div className="flex items-center gap-1 text-green-500">
                <TrendUpIcon className="w-4 h-4" />
                <span>{sound.recentUseCount} in last 24h</span>
              </div>
            )}
            {sound.duration && (
              <div className="flex items-center gap-1 text-text-muted">
                <ClockIcon className="w-4 h-4" />
                <span>{formatDuration(sound.duration)}</span>
              </div>
            )}
            {sound.trending && (
              <div className="flex items-center gap-1 text-accent">
                <FireIcon className="w-4 h-4" />
                <span>#{sound.trending.rank} Trending</span>
              </div>
            )}
          </div>

          <button className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-text-inverse font-medium rounded-lg transition-colors flex items-center gap-2">
            <MusicIcon className="w-5 h-5" />
            Use this sound
          </button>
        </div>
      </div>

      {/* Original Video */}
      {originalVideo && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Original Video</h2>
          <Link href={`/video/${encodeURIComponent(originalVideo.uri)}`}>
            <div className="bg-surface border border-border rounded-xl p-4 hover:bg-surface-hover transition-colors flex items-center gap-4">
              {originalVideo.thumbnailUrl ? (
                <img
                  src={originalVideo.thumbnailUrl}
                  alt=""
                  className="w-20 h-28 rounded-lg object-cover"
                />
              ) : (
                <div className="w-20 h-28 rounded-lg bg-surface-hover flex items-center justify-center">
                  <VideoIcon className="w-8 h-8 text-text-muted" />
                </div>
              )}
              {originalVideo.author && (
                <div className="flex items-center gap-3">
                  {originalVideo.author.avatar ? (
                    <img
                      src={originalVideo.author.avatar}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted">
                      {originalVideo.author.handle[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-text-primary">
                      {originalVideo.author.displayName || `@${originalVideo.author.handle}`}
                    </p>
                    <p className="text-sm text-text-muted">@{originalVideo.author.handle}</p>
                  </div>
                </div>
              )}
            </div>
          </Link>
        </div>
      )}

      {/* Videos Using This Sound */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Videos using this sound
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('popular')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'popular'
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-primary hover:bg-border'
              }`}
            >
              Popular
            </button>
            <button
              onClick={() => setSortBy('recent')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'recent'
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-primary hover:bg-border'
              }`}
            >
              Recent
            </button>
          </div>
        </div>

        {videosLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[9/16] bg-surface-hover rounded-xl animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-12 bg-surface border border-border rounded-xl">
            <VideoIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">No videos using this sound yet</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {videos.map((video) => (
                <Link key={video.uri} href={`/video/${encodeURIComponent(video.uri)}`}>
                  <div className="group relative aspect-[9/16] bg-surface-hover rounded-xl overflow-hidden">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VideoIcon className="w-8 h-8 text-text-muted" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="flex items-center gap-2 text-xs text-white">
                        <span className="flex items-center gap-1">
                          <PlayIcon className="w-3 h-3" />
                          {formatNumber(video.viewCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <HeartIcon className="w-3 h-3" />
                          {formatNumber(video.likeCount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {hasNextPage && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-6 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
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

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function FireIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
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
