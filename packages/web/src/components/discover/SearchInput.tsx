'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, VideoView } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { formatCount } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string, type?: 'videos' | 'users' | 'sounds') => void;
  placeholder?: string;
}

interface SuggestionItem {
  type: 'video' | 'user' | 'sound' | 'tag' | 'history';
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  count?: number;
  query?: string;
}

export function SearchInput({ value, onChange, onSearch, placeholder }: SearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { history, addSearch, removeItem, clearHistory } = useSearchHistory();
  const debouncedQuery = useDebounce(value, 300);

  // Fetch suggestions when user types
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['search-suggestions', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return null;

      // Fetch from multiple endpoints in parallel
      const [videos, users, sounds] = await Promise.all([
        api.search(debouncedQuery, 'videos').catch(() => ({ results: [] })),
        api.searchActors(debouncedQuery, { limit: 3 }).catch(() => ({ actors: [] })),
        api.searchSounds(debouncedQuery, { limit: 3 }).catch(() => ({ sounds: [] })),
      ]);

      const items: SuggestionItem[] = [];

      // Add users (top 3)
      (users.actors || []).slice(0, 3).forEach((user) => {
        items.push({
          type: 'user',
          id: user.did,
          title: user.displayName || user.handle,
          subtitle: `@${user.handle}`,
          thumbnail: user.avatar,
          count: user.followerCount,
        });
      });

      // Add sounds (top 3)
      (sounds.sounds || []).slice(0, 3).forEach((sound) => {
        items.push({
          type: 'sound',
          id: sound.id,
          title: sound.title,
          subtitle: sound.artist || 'Original Sound',
          thumbnail: sound.coverUrl,
          count: sound.useCount,
        });
      });

      // Add videos (top 4)
      (videos.results as VideoView[] || []).slice(0, 4).forEach((video) => {
        items.push({
          type: 'video',
          id: video.uri,
          title: video.caption || 'Video',
          subtitle: video.author.displayName || `@${video.author.handle}`,
          thumbnail: video.video?.thumbnail || video.thumbnailUrl,
          count: video.viewCount,
        });
      });

      // Add hashtag suggestion if query starts with #
      if (debouncedQuery.startsWith('#')) {
        items.unshift({
          type: 'tag',
          id: debouncedQuery.slice(1),
          title: debouncedQuery,
          subtitle: 'Search hashtag',
        });
      }

      return items;
    },
    enabled: debouncedQuery.length >= 2 && isFocused,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Show history when input is empty and focused
  const showHistory = isFocused && !value && history.length > 0;
  const showSuggestions = isFocused && value.length >= 2 && (suggestions?.length ?? 0) > 0;
  const showDropdown = showHistory || showSuggestions;

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestions, history]);

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;

    const items = showHistory ? history : suggestions || [];
    const maxIndex = items.length - 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        if (showHistory) {
          const item = history[selectedIndex];
          onChange(item.query);
          onSearch(item.query, item.type === 'all' ? undefined : item.type);
        } else if (suggestions) {
          handleSuggestionClick(suggestions[selectedIndex]);
        }
      } else if (value) {
        addSearch(value);
        onSearch(value);
      }
    } else if (e.key === 'Escape') {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (item: SuggestionItem) => {
    if (item.type === 'history') {
      onChange(item.query!);
      onSearch(item.query!);
    } else if (item.type === 'tag') {
      const query = `#${item.id}`;
      onChange(query);
      addSearch(query);
      onSearch(query);
    } else if (item.type === 'video') {
      window.location.href = `/video/${encodeURIComponent(item.id)}`;
    } else if (item.type === 'user') {
      const handle = item.subtitle?.replace('@', '') || item.id;
      window.location.href = `/profile/${handle}`;
    } else if (item.type === 'sound') {
      window.location.href = `/?feed=sound:${item.id}`;
    }
    setIsFocused(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder || 'Search videos, users, or sounds'}
          className="w-full pl-12 pr-10 py-3 bg-surface border border-border rounded-full text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            aria-label="Clear search"
          >
            <XIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showDropdown && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-xl z-50 max-h-[400px] overflow-y-auto"
        >
          {/* Search History */}
          {showHistory && (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-sm text-text-muted font-medium">Recent Searches</span>
                <button
                  onClick={clearHistory}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  Clear All
                </button>
              </div>
              {history.map((item, index) => (
                <button
                  key={index}
                  onClick={() => {
                    onChange(item.query);
                    onSearch(item.query, item.type === 'all' ? undefined : item.type);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors ${
                    selectedIndex === index ? 'bg-surface-hover' : ''
                  }`}
                >
                  <ClockIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <span className="flex-1 text-left text-text-primary">{item.query}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(index);
                    }}
                    className="text-gray-400 hover:text-white"
                    aria-label="Remove"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </button>
              ))}
            </>
          )}

          {/* Live Suggestions */}
          {showSuggestions && (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                suggestions?.map((item, index) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleSuggestionClick(item)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors ${
                      selectedIndex === index ? 'bg-surface-hover' : ''
                    }`}
                  >
                    {/* Thumbnail/Icon */}
                    <div className="w-10 h-10 rounded-lg bg-surface-hover flex-shrink-0 overflow-hidden">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : item.type === 'user' ? (
                        <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                          {item.title[0]?.toUpperCase()}
                        </div>
                      ) : item.type === 'sound' ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <MusicIcon className="w-5 h-5 text-gray-400" />
                        </div>
                      ) : item.type === 'tag' ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <HashtagIcon className="w-5 h-5 text-gray-400" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PlayIcon className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-text-primary truncate">
                        <HighlightMatch text={item.title} query={value} />
                      </p>
                      {item.subtitle && (
                        <p className="text-sm text-text-muted truncate">{item.subtitle}</p>
                      )}
                    </div>

                    {/* Count */}
                    {item.count !== undefined && (
                      <span className="text-xs text-text-muted flex-shrink-0">
                        {item.type === 'user'
                          ? `${formatCount(item.count)} followers`
                          : `${formatCount(item.count)} ${item.type === 'sound' ? 'uses' : 'views'}`}
                      </span>
                    )}

                    {/* Type Badge */}
                    <TypeBadge type={item.type} />
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Highlight matching text
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <span className="text-accent font-semibold">
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}

// Type badge
function TypeBadge({ type }: { type: string }) {
  const colors = {
    video: 'bg-blue-500/10 text-blue-500',
    user: 'bg-purple-500/10 text-purple-500',
    sound: 'bg-green-500/10 text-green-500',
    tag: 'bg-orange-500/10 text-orange-500',
  };

  const color = colors[type as keyof typeof colors] || 'bg-gray-500/10 text-gray-500';

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {type}
    </span>
  );
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function HashtagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
    </svg>
  );
}
