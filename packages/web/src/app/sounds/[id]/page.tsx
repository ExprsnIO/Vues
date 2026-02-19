'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useInView } from 'react-intersection-observer';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';

export default function SoundDetailPage() {
  const params = useParams();
  const soundId = params.id as string;
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get sound details
  const { data: soundData, isLoading: soundLoading } = useQuery({
    queryKey: ['sound', soundId],
    queryFn: () => api.getSound(soundId),
  });

  // Get videos using this sound
  const {
    data: videosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: videosLoading,
  } = useInfiniteQuery({
    queryKey: ['sound-videos', soundId],
    queryFn: ({ pageParam }) => api.getVideosBySound(soundId, { cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
  });

  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  });

  const sound = soundData?.sound;
  const videos = videosData?.pages.flatMap((page) => page.videos) ?? [];

  const handlePlayToggle = () => {
    if (!sound?.audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(sound.audioUrl);
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {soundLoading ? (
            <div className="animate-pulse">
              <div className="flex items-start gap-6 mb-8">
                <div className="w-32 h-32 rounded-xl bg-surface" />
                <div className="flex-1">
                  <div className="h-6 w-48 bg-surface rounded mb-3" />
                  <div className="h-4 w-32 bg-surface rounded mb-4" />
                  <div className="h-10 w-32 bg-surface rounded" />
                </div>
              </div>
            </div>
          ) : sound ? (
            <>
              {/* Sound Header */}
              <div className="flex items-start gap-6 mb-8">
                {/* Cover art */}
                <div className="w-32 h-32 rounded-xl bg-surface overflow-hidden flex-shrink-0">
                  {sound.coverUrl ? (
                    <img
                      src={sound.coverUrl}
                      alt={sound.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-accent/20">
                      <MusicNoteIcon className="w-16 h-16 text-accent" />
                    </div>
                  )}
                </div>

                {/* Sound info */}
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-text-primary mb-1">
                    {sound.title}
                  </h1>
                  {sound.artist && (
                    <p className="text-text-muted mb-2">{sound.artist}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-text-muted mb-4">
                    <span>{formatCount(sound.useCount)} videos</span>
                    {sound.duration && (
                      <span>{formatDuration(sound.duration)}</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    {sound.audioUrl && (
                      <button
                        onClick={handlePlayToggle}
                        className="flex items-center gap-2 px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                      >
                        {isPlaying ? (
                          <>
                            <PauseIcon className="w-5 h-5" />
                            Pause
                          </>
                        ) : (
                          <>
                            <PlayIcon className="w-5 h-5" />
                            Play
                          </>
                        )}
                      </button>
                    )}
                    <button className="flex items-center gap-2 px-6 py-2 border border-border text-text-primary hover:bg-surface rounded-lg font-medium transition-colors">
                      <UseIcon className="w-5 h-5" />
                      Use this sound
                    </button>
                  </div>
                </div>
              </div>

              {/* Videos grid */}
              <div className="border-t border-border pt-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Videos using this sound
                </h2>

                {videosLoading ? (
                  <div className="grid grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="aspect-[9/16] bg-surface rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : videos.length > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      {videos.map((video) => (
                        <Link
                          key={video.uri}
                          href={`/video/${encodeURIComponent(video.uri)}`}
                          className="relative aspect-[9/16] bg-surface rounded-lg overflow-hidden group"
                        >
                          {video.video?.thumbnail || video.thumbnailUrl ? (
                            <img
                              src={video.video?.thumbnail || video.thumbnailUrl}
                              alt={video.caption || 'Video thumbnail'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-muted">
                              <VideoIcon className="w-12 h-12" />
                            </div>
                          )}

                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <PlayIcon className="w-12 h-12 text-white" />
                          </div>

                          {/* Stats */}
                          <div className="absolute bottom-2 left-2 text-white text-sm flex items-center gap-1">
                            <PlayIcon className="w-4 h-4" />
                            {formatCount(video.viewCount)}
                          </div>
                        </Link>
                      ))}
                    </div>

                    {/* Load more */}
                    <div ref={loadMoreRef} className="h-1" />
                    {isFetchingNextPage && (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <VideoIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
                    <p className="text-text-muted">No videos using this sound yet</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <MusicNoteIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">Sound not found</h2>
              <p className="text-text-muted mb-4">
                This sound may have been removed or is unavailable.
              </p>
              <Link href="/sounds" className="text-accent hover:underline">
                Browse sounds
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
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
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  );
}

function UseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}
