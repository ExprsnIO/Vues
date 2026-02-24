'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, TrendingSoundView } from '@/lib/api';

export default function TrendingSoundsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['sounds', 'trending'],
    queryFn: () => api.getTrendingSounds({ limit: 50 }),
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['sounds', 'search', searchQuery],
    queryFn: () => api.searchSounds(searchQuery, { limit: 30 }),
    enabled: searchQuery.length >= 2,
  });

  const sounds = searchQuery.length >= 2
    ? searchData?.sounds || []
    : trendingData?.sounds || [];

  const isLoading = searchQuery.length >= 2 ? searchLoading : trendingLoading;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Trending Sounds</h1>
        <p className="text-text-muted">Discover the hottest audio tracks on Exprsn</p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sounds by title or artist..."
            className="w-full pl-12 pr-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      {/* Sound Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-surface-hover rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-surface-hover rounded w-3/4 mb-2" />
                  <div className="h-3 bg-surface-hover rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : sounds.length === 0 ? (
        <div className="text-center py-16">
          <MusicIcon className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <p className="text-text-muted">
            {searchQuery.length >= 2
              ? `No sounds found for "${searchQuery}"`
              : 'No trending sounds yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sounds.map((sound, index) => (
            <SoundCard
              key={sound.id}
              sound={sound as TrendingSoundView}
              rank={searchQuery.length >= 2 ? undefined : index + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SoundCard({ sound, rank }: { sound: TrendingSoundView; rank?: number }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <Link href={`/sound/${sound.id}`}>
      <div className="bg-surface border border-border rounded-xl p-4 hover:bg-surface-hover transition-colors group">
        <div className="flex items-center gap-4">
          {/* Rank or Play Button */}
          <div className="relative">
            {sound.coverUrl || (sound.sampleVideos && sound.sampleVideos[0]?.thumbnailUrl) ? (
              <img
                src={sound.coverUrl || sound.sampleVideos?.[0]?.thumbnailUrl}
                alt=""
                className="w-16 h-16 rounded-lg object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
                <MusicIcon className="w-8 h-8 text-text-inverse" />
              </div>
            )}
            {rank && (
              <div className="absolute -top-2 -left-2 w-6 h-6 bg-accent text-text-inverse text-xs font-bold rounded-full flex items-center justify-center">
                {rank}
              </div>
            )}
            <button
              onClick={(e) => {
                e.preventDefault();
                setIsPlaying(!isPlaying);
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
            >
              {isPlaying ? (
                <PauseIcon className="w-8 h-8 text-white" />
              ) : (
                <PlayIcon className="w-8 h-8 text-white" />
              )}
            </button>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-text-primary truncate">{sound.title}</h3>
            {sound.artist && (
              <p className="text-sm text-text-muted truncate">{sound.artist}</p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
              <span>{formatNumber(sound.useCount)} videos</span>
              {'velocity' in sound && (
                <span className={`flex items-center gap-0.5 ${
                  sound.trendingDirection === 'up' ? 'text-green-500' :
                  sound.trendingDirection === 'down' ? 'text-red-500' :
                  'text-text-muted'
                }`}>
                  {sound.trendingDirection === 'up' && <TrendUpIcon className="w-3 h-3" />}
                  {sound.trendingDirection === 'down' && <TrendDownIcon className="w-3 h-3" />}
                  {sound.recentUseCount} today
                </span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <ChevronRightIcon className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors" />
        </div>

        {/* Sample Videos */}
        {sound.sampleVideos && sound.sampleVideos.length > 0 && (
          <div className="flex gap-1 mt-3 -mx-1">
            {sound.sampleVideos.slice(0, 3).map((video, i) => (
              <div key={i} className="flex-1">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="w-full aspect-[9/16] object-cover rounded"
                  />
                ) : (
                  <div className="w-full aspect-[9/16] bg-surface-hover rounded" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
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

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

function TrendDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  );
}
