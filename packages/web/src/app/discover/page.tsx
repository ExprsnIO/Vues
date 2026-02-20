'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, VideoView } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

// Fallback tags if API fails
const FALLBACK_TAGS = ['fyp', 'viral', 'funny', 'dance', 'music'];

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'videos' | 'users' | 'sounds'>(
    'videos'
  );

  // Fetch trending tags
  const { data: trendingTagsData } = useQuery({
    queryKey: ['trending-tags'],
    queryFn: () => api.getTrendingTags(15),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const trendingTags = trendingTagsData?.tags ?? FALLBACK_TAGS.map(name => ({ name, videoCount: 0 }));

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['search', searchQuery, searchType],
    queryFn: () => api.search(searchQuery, searchType),
    enabled: searchQuery.length >= 2,
  });

  return (
    <div className="flex min-h-screen bg-background-alt">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0 p-4 lg:p-6">
        <div className="w-full">
          <h1 className="text-2xl font-bold text-white mb-6">Discover</h1>

          {/* Search bar */}
          <div className="relative mb-6">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos, users, or sounds"
              className="w-full pl-12 pr-4 py-3 bg-surface border border-border rounded-full text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Search type tabs */}
          {searchQuery.length >= 2 && (
            <div className="flex gap-2 mb-6">
              {(['videos', 'users', 'sounds'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setSearchType(type)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    searchType === type
                      ? 'bg-accent text-white'
                      : 'bg-surface text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {searchQuery.length >= 2 ? (
            isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : searchResults?.results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">
                  No {searchType} found for &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {searchType === 'videos' && (
                  <VideoResults results={searchResults?.results as VideoView[]} />
                )}
                {searchType === 'users' && (
                  <UserResults results={searchResults?.results as UserResult[]} />
                )}
                {searchType === 'sounds' && (
                  <SoundResults results={searchResults?.results as SoundResult[]} />
                )}
              </div>
            )
          ) : (
            <>
              {/* Trending hashtags */}
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Trending Hashtags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {trendingTags.map((tag) => (
                    <Link
                      key={tag.name}
                      href={`/tag/${encodeURIComponent(tag.name)}`}
                      className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-full text-sm transition-colors flex items-center gap-2"
                    >
                      <span>#{tag.name}</span>
                      {tag.videoCount > 0 && (
                        <span className="text-gray-400 text-xs">
                          {formatCount(tag.videoCount)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>

              {/* Categories */}
              <section>
                <h2 className="text-lg font-semibold text-white mb-4">
                  Categories
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {CATEGORIES.map((category) => (
                    <Link
                      key={category.id}
                      href={`/tag/${encodeURIComponent(category.id)}`}
                      className="relative overflow-hidden rounded-xl aspect-[2/1] group"
                    >
                      <div
                        className={`absolute inset-0 ${category.gradient}`}
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {category.name}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const CATEGORIES = [
  { id: 'comedy', name: 'Comedy', gradient: 'bg-gradient-to-br from-yellow-500 to-orange-600' },
  { id: 'dance', name: 'Dance', gradient: 'bg-gradient-to-br from-pink-500 to-purple-600' },
  { id: 'music', name: 'Music', gradient: 'bg-gradient-to-br from-green-500 to-teal-600' },
  { id: 'sports', name: 'Sports', gradient: 'bg-gradient-to-br from-blue-500 to-indigo-600' },
  { id: 'food', name: 'Food', gradient: 'bg-gradient-to-br from-red-500 to-pink-600' },
  { id: 'gaming', name: 'Gaming', gradient: 'bg-gradient-to-br from-purple-500 to-violet-600' },
];

function SearchIcon({ className }: { className?: string }) {
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
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

// Search Result Types
interface UserResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followerCount: number;
  verified?: boolean;
}

interface SoundResult {
  id: string;
  title: string;
  artist?: string;
  useCount: number;
  coverUrl?: string;
}

// Video Results Component
function VideoResults({ results }: { results: VideoView[] }) {
  if (!results?.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {results.map((video) => {
        const videoUrl = video.video?.cdnUrl || video.cdnUrl;
        return (
          <Link
            key={video.uri}
            href={`/video/${encodeURIComponent(video.uri)}`}
            className="relative aspect-[9/16] bg-surface rounded-lg overflow-hidden group"
          >
            {video.video?.thumbnail || video.thumbnailUrl ? (
              <img
                src={video.video?.thumbnail || video.thumbnailUrl}
                alt={video.caption || 'Video'}
                className="w-full h-full object-cover"
              />
            ) : videoUrl ? (
              <video
                src={videoUrl.startsWith('/') ? `http://localhost:3002${videoUrl}` : videoUrl}
                className="w-full h-full object-cover"
                muted
                preload="metadata"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-white text-xs">
              <PlayIcon className="w-3 h-3" />
              <span>{formatCount(video.viewCount)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// User Results Component
function UserResults({ results }: { results: UserResult[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const followMutation = useMutation({
    mutationFn: (did: string) => api.follow(did),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search'] });
    },
  });

  if (!results?.length) return null;

  return (
    <div className="space-y-3">
      {results.map((result) => (
        <div key={result.did} className="flex items-center gap-4 p-3 bg-surface rounded-lg">
          <Link href={`/profile/${result.handle}`} className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-surface overflow-hidden">
              {result.avatar ? (
                <img src={result.avatar} alt={result.handle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                  {result.handle[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </Link>
          <Link href={`/profile/${result.handle}`} className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">
              {result.displayName || `@${result.handle}`}
              {result.verified && <VerifiedBadge />}
            </p>
            <p className="text-gray-400 text-sm truncate">@{result.handle}</p>
            <p className="text-gray-500 text-xs">{formatCount(result.followerCount)} followers</p>
          </Link>
          {user && user.did !== result.did && (
            <button
              onClick={() => followMutation.mutate(result.did)}
              disabled={followMutation.isPending}
              className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              Follow
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Sound Results Component
function SoundResults({ results }: { results: SoundResult[] }) {
  if (!results?.length) return null;

  return (
    <div className="space-y-3">
      {results.map((sound) => (
        <Link
          key={sound.id}
          href={`/?feed=sound:${sound.id}`}
          className="flex items-center gap-4 p-3 bg-surface rounded-lg hover:bg-surface transition-colors"
        >
          <div className="w-12 h-12 rounded-lg bg-surface overflow-hidden flex-shrink-0">
            {sound.coverUrl ? (
              <img src={sound.coverUrl} alt={sound.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <MusicIcon className="w-6 h-6 text-gray-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{sound.title}</p>
            <p className="text-gray-400 text-sm truncate">{sound.artist || 'Original Sound'}</p>
            <p className="text-gray-500 text-xs">{formatCount(sound.useCount)} videos</p>
          </div>
          <PlayIcon className="w-6 h-6 text-white flex-shrink-0" />
        </Link>
      ))}
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg className="w-4 h-4 text-accent inline ml-1" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
