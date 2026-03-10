'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, TrendingSoundView } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface TrendingSoundsProps {
  limit?: number;
}

export function TrendingSounds({ limit = 10 }: TrendingSoundsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['trending-sounds', limit],
    queryFn: () => api.getTrendingSounds({ limit }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Trending Sounds</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SoundCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (error || !data?.sounds || data.sounds.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Trending Sounds</h2>
        <Link
          href="/sounds"
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          View All
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.sounds.map((sound, index) => (
          <SoundCard key={sound.id} sound={sound} rank={index + 1} />
        ))}
      </div>
    </section>
  );
}

interface SoundCardProps {
  sound: TrendingSoundView;
  rank: number;
}

function SoundCard({ sound, rank }: SoundCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!audioRef.current) {
      // Create audio element on first play
      audioRef.current = new Audio(sound.audioUrl);
      audioRef.current.volume = 0.5;
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

  const trendingColor =
    sound.trendingDirection === 'up'
      ? 'text-green-500'
      : sound.trendingDirection === 'down'
      ? 'text-red-500'
      : 'text-gray-400';

  return (
    <Link
      href={`/?feed=sound:${sound.id}`}
      className="relative group bg-surface hover:bg-surface-hover rounded-lg p-3 transition-colors flex items-center gap-3"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Rank Badge */}
      <div className="flex-shrink-0 w-8 text-center">
        <span className={cn(
          'text-lg font-bold',
          rank <= 3 ? 'text-accent' : 'text-text-muted'
        )}>
          {rank}
        </span>
      </div>

      {/* Cover Image with Play Button */}
      <div className="relative w-16 h-16 rounded-lg bg-surface-hover flex-shrink-0 overflow-hidden">
        {sound.coverUrl ? (
          <img
            src={sound.coverUrl}
            alt={sound.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MusicIcon className="w-8 h-8 text-gray-400" />
          </div>
        )}

        {/* Play Button Overlay */}
        {sound.audioUrl && (
          <button
            onClick={handlePlayPause}
            className={cn(
              'absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity',
              isHovered || isPlaying ? 'opacity-100' : 'opacity-0'
            )}
          >
            {isPlaying ? (
              <PauseIcon className="w-8 h-8 text-white" />
            ) : (
              <PlayIcon className="w-8 h-8 text-white" />
            )}
          </button>
        )}

        {/* Trending Direction Badge */}
        <div className={cn('absolute top-1 right-1 p-1', trendingColor)}>
          {sound.trendingDirection === 'up' ? (
            <TrendingUpIcon className="w-4 h-4" />
          ) : sound.trendingDirection === 'down' ? (
            <TrendingDownIcon className="w-4 h-4" />
          ) : null}
        </div>
      </div>

      {/* Sound Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-text-primary font-medium truncate">{sound.title}</h3>
        <p className="text-sm text-text-muted truncate">
          {sound.artist || 'Original Sound'}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-text-muted">
            {formatCount(sound.useCount)} videos
          </span>
          {sound.velocity > 0 && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <FireIcon className="w-3 h-3" />
              +{formatCount(sound.recentUseCount)}
            </span>
          )}
        </div>
      </div>

      {/* Sample Videos Preview */}
      {sound.sampleVideos && sound.sampleVideos.length > 0 && (
        <div className="flex-shrink-0 flex gap-1">
          {sound.sampleVideos.slice(0, 3).map((video, i) => (
            <div
              key={i}
              className="w-12 h-16 rounded bg-surface-hover overflow-hidden"
            >
              {video.thumbnailUrl && (
                <img
                  src={video.thumbnailUrl}
                  alt="Sample video"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Arrow Icon */}
      <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors flex-shrink-0" />
    </Link>
  );
}

function SoundCardSkeleton() {
  return (
    <div className="bg-surface rounded-lg p-3 flex items-center gap-3 animate-pulse">
      <div className="w-8 h-8 bg-surface-hover rounded" />
      <div className="w-16 h-16 bg-surface-hover rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-surface-hover rounded w-3/4" />
        <div className="h-3 bg-surface-hover rounded w-1/2" />
        <div className="h-3 bg-surface-hover rounded w-1/3" />
      </div>
      <div className="w-5 h-5 bg-surface-hover rounded" />
    </div>
  );
}

// Icons
function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
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

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function TrendingDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
    </svg>
  );
}

function FireIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 23a7.5 7.5 0 01-5.138-12.963C8.204 8.774 11.5 6.5 11 1.5c6 4 9 8 3 14 1 0 2.5 0 5-2.47.27.773.5 1.604.5 2.47A7.5 7.5 0 0112 23z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
