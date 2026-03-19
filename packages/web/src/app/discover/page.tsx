'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { SearchInput } from '@/components/discover/SearchInput';
import { SearchFilters, SearchFiltersState } from '@/components/discover/SearchFilters';
import { TrendingSounds } from '@/components/discover/TrendingSounds';
import { api, API_BASE, VideoView, TagView } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { DiscoverSkeleton } from '@/components/skeletons';

// Fallback tags if API fails
const FALLBACK_TAGS = ['fyp', 'viral', 'funny', 'dance', 'music'];

export default function DiscoverPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'videos' | 'users' | 'sounds'>(
    'videos'
  );
  const [filters, setFilters] = useState<SearchFiltersState>({
    contentType: 'all',
    duration: 'all',
    timeRange: 'all',
    sortBy: 'relevance',
    verifiedOnly: false,
  });

  const { addSearch } = useSearchHistory();

  // Update search type when content type filter changes
  useEffect(() => {
    if (filters.contentType === 'videos' || filters.contentType === 'users' || filters.contentType === 'sounds') {
      setSearchType(filters.contentType);
    }
  }, [filters.contentType]);

  // Fetch trending tags
  const { data: trendingTagsData } = useQuery({
    queryKey: ['trending-tags'],
    queryFn: () => api.getTrendingTags(15),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const trendingTags = (trendingTagsData?.tags ?? FALLBACK_TAGS.map(name => ({ name, videoCount: 0 }))) as TrendingTagItem[];

  // Fetch followed hashtags for authenticated users
  const { data: followedTagsData } = useQuery({
    queryKey: ['followed-hashtags'],
    queryFn: () => api.getFollowedHashtags(undefined, 12),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  // Build search query with filters
  const buildSearchParams = () => {
    const params: any = {};

    // Duration filter (convert to seconds)
    if (filters.duration === 'short') {
      params.maxDuration = 30;
    } else if (filters.duration === 'medium') {
      params.minDuration = 30;
      params.maxDuration = 180;
    } else if (filters.duration === 'long') {
      params.minDuration = 180;
    }

    // Time range filter
    if (filters.timeRange !== 'all') {
      const now = new Date();
      if (filters.timeRange === 'today') {
        params.since = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      } else if (filters.timeRange === 'week') {
        params.since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (filters.timeRange === 'month') {
        params.since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    // Sort filter
    if (filters.sortBy === 'views') {
      params.sort = 'views';
    } else if (filters.sortBy === 'recent') {
      params.sort = 'recent';
    }

    return params;
  };

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['search', activeSearchQuery, searchType, filters],
    queryFn: async () => {
      const params = buildSearchParams();
      // Note: Current API doesn't support all these params, but we're setting up for future API updates
      const results = await api.search(activeSearchQuery, searchType);

      // Client-side filtering for now (can be removed when API supports it)
      let filtered = results.results;

      // Verified creators filter (users only)
      if (searchType === 'users' && filters.verifiedOnly) {
        filtered = (filtered as UserResult[]).filter(
          (u) => u.verified || (u as any).did?.startsWith('did:exprsn:')
        );
      }

      // Duration filtering for videos
      if (searchType === 'videos' && filters.duration !== 'all') {
        filtered = (filtered as VideoView[]).filter((video) => {
          const duration = video.video?.duration || video.duration || 0;
          if (filters.duration === 'short') return duration < 30;
          if (filters.duration === 'medium') return duration >= 30 && duration <= 180;
          if (filters.duration === 'long') return duration > 180;
          return true;
        });
      }

      // Time range filtering
      if (filters.timeRange !== 'all') {
        const now = Date.now();
        let cutoffTime = 0;
        if (filters.timeRange === 'today') {
          cutoffTime = now - 24 * 60 * 60 * 1000;
        } else if (filters.timeRange === 'week') {
          cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        } else if (filters.timeRange === 'month') {
          cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        }

        filtered = filtered.filter((item: any) => {
          const itemTime = new Date(item.createdAt || item.indexedAt).getTime();
          return itemTime >= cutoffTime;
        });
      }

      // Sorting
      if (filters.sortBy === 'views' && searchType === 'videos') {
        filtered = [...filtered].sort((a: any, b: any) =>
          (b.viewCount || 0) - (a.viewCount || 0)
        );
      } else if (filters.sortBy === 'recent') {
        filtered = [...filtered].sort((a: any, b: any) => {
          const timeA = new Date(a.createdAt || a.indexedAt).getTime();
          const timeB = new Date(b.createdAt || b.indexedAt).getTime();
          return timeB - timeA;
        });
      }

      return { ...results, results: filtered };
    },
    enabled: activeSearchQuery.length >= 2,
  });

  const handleSearch = (query: string, type?: 'videos' | 'users' | 'sounds') => {
    if (query.trim()) {
      setActiveSearchQuery(query.trim());
      addSearch(query.trim(), type || searchType);
      if (type) {
        setSearchType(type);
        setFilters(prev => ({
          ...prev,
          contentType: type,
        }));
      }
    }
  };

  const isSearching = activeSearchQuery.length >= 2;
  const showDurationFilter = filters.contentType === 'all' || filters.contentType === 'videos';

  return (
    <div className="flex min-h-screen bg-background-alt">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0 p-4 lg:p-6">
        <div className="w-full max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Discover</h1>

          {/* Search Input with Autocomplete */}
          <div className="mb-4">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSearch={handleSearch}
              placeholder="Search videos, users, sounds, or hashtags"
            />
          </div>

          {/* Search Filters */}
          {isSearching && (
            <div className="mb-6">
              <SearchFilters
                filters={filters}
                onChange={setFilters}
                showDuration={showDurationFilter}
                showVerifiedToggle={searchType === 'users'}
              />
            </div>
          )}

          {/* Search Results */}
          {isSearching ? (
            isLoading ? (
              <DiscoverSkeleton />
            ) : searchResults?.results.length === 0 ? (
              <div className="text-center py-12">
                <NoResultsIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No results found</h3>
                <p className="text-gray-400">
                  Try adjusting your search or filters to find what you&apos;re looking for.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Results Count */}
                <p className="text-sm text-text-muted mb-4">
                  Found {searchResults?.results.length ?? 0} {searchType}
                  {filters.contentType !== 'all' || filters.duration !== 'all' || filters.timeRange !== 'all' ? ' with filters' : ''}
                </p>

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
              {/* Tags You Follow — authenticated users only */}
              {user && followedTagsData && followedTagsData.tags.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    Tags You Follow
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {followedTagsData.tags.map((item) => (
                      <Link
                        key={item.tag}
                        href={`/tag/${encodeURIComponent(item.tag)}`}
                        className="px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent rounded-full text-sm transition-colors flex items-center gap-2"
                      >
                        <span>#{item.tag}</span>
                        {item.videoCount > 0 && (
                          <span className="text-accent/70 text-xs">
                            {formatCount(item.videoCount)}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Trending Sounds Section */}
              <TrendingSounds limit={9} />

              {/* Trending Hashtags */}
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
                      <TrendingDirectionIcon direction={tag.trendingDirection} />
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

// Trending tag with optional direction fields returned by the API
interface TrendingTagItem extends TagView {
  trendingDirection?: 'up' | 'down' | 'stable';
  velocity?: number;
  rank?: number;
}

function TrendingDirectionIcon({ direction }: { direction?: 'up' | 'down' | 'stable' }) {
  if (direction === 'up') {
    return (
      <svg className="w-3 h-3 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>
    );
  }
  if (direction === 'down') {
    return (
      <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
      </svg>
    );
  }
  if (direction === 'stable') {
    return (
      <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    );
  }
  return null;
}

// Search Result Types
interface UserResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followerCount?: number;
  followersCount?: number;
  verified?: boolean;
}

interface SoundResult {
  id: string;
  title: string;
  artist?: string;
  useCount: number;
  coverUrl?: string;
  audioUrl?: string;
}

// Video Results Component
function VideoResults({ results }: { results: VideoView[] }) {
  if (!results?.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                src={videoUrl.startsWith('/') ? `${API_BASE}${videoUrl}` : videoUrl}
                className="w-full h-full object-cover"
                muted
                preload="metadata"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-2 left-2 right-2">
              <div className="flex items-center gap-2 text-white text-xs mb-1">
                <PlayIcon className="w-3 h-3" />
                <span>{formatCount(video.viewCount)}</span>
              </div>
              {video.caption && (
                <p className="text-white text-xs line-clamp-2">{video.caption}</p>
              )}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {results.map((result) => (
        <div key={result.did} className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface-hover transition-colors">
          <Link href={`/profile/${result.handle}`} className="flex-shrink-0">
            <div className="w-14 h-14 rounded-full bg-surface-hover overflow-hidden">
              {result.avatar ? (
                <img src={result.avatar} alt={result.handle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-semibold text-lg">
                  {result.handle[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </Link>
          <Link href={`/profile/${result.handle}`} className="flex-1 min-w-0">
            <p className="text-white font-medium truncate flex items-center gap-1">
              {result.displayName || `@${result.handle}`}
              {result.verified && <VerifiedBadge />}
            </p>
            <p className="text-gray-400 text-sm truncate">@{result.handle}</p>
            <p className="text-gray-500 text-xs mt-0.5">
              {formatCount(result.followerCount || result.followersCount || 0)} followers
            </p>
          </Link>
          {user && user.did !== result.did && (
            <button
              onClick={() => followMutation.mutate(result.did)}
              disabled={followMutation.isPending}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {results.map((sound) => (
        <Link
          key={sound.id}
          href={`/?feed=sound:${sound.id}`}
          className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface-hover transition-colors group"
        >
          <div className="w-14 h-14 rounded-lg bg-surface-hover overflow-hidden flex-shrink-0">
            {sound.coverUrl ? (
              <img src={sound.coverUrl} alt={sound.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <MusicIcon className="w-7 h-7 text-gray-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{sound.title}</p>
            <p className="text-gray-400 text-sm truncate">{sound.artist || 'Original Sound'}</p>
            <p className="text-gray-500 text-xs mt-0.5">{formatCount(sound.useCount)} videos</p>
          </div>
          <PlayIcon className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors flex-shrink-0" />
        </Link>
      ))}
    </div>
  );
}

// Icons
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
    <svg className="w-4 h-4 text-accent inline" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function NoResultsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
    </svg>
  );
}
