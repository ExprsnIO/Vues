'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';

const TRENDING_TAGS = [
  'fyp',
  'viral',
  'funny',
  'dance',
  'music',
  'comedy',
  'cooking',
  'fitness',
  'travel',
  'fashion',
];

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'videos' | 'users' | 'sounds'>(
    'videos'
  );

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['search', searchQuery, searchType],
    queryFn: () => api.search(searchQuery, searchType),
    enabled: searchQuery.length >= 2,
  });

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-60 p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Discover</h1>

          {/* Search bar */}
          <div className="relative mb-6">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos, users, or sounds"
              className="w-full pl-12 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-full text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-white hover:bg-zinc-700'
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
                <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full loading-spinner" />
              </div>
            ) : searchResults?.results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">
                  No {searchType} found for &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Results would be rendered here based on type */}
                <p className="text-gray-400">
                  {searchResults?.results.length} results
                </p>
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
                  {TRENDING_TAGS.map((tag) => (
                    <Link
                      key={tag}
                      href={`/tag/${tag}`}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full text-sm transition-colors"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              </section>

              {/* Categories */}
              <section>
                <h2 className="text-lg font-semibold text-white mb-4">
                  Categories
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {CATEGORIES.map((category) => (
                    <Link
                      key={category.id}
                      href={`/category/${category.id}`}
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
