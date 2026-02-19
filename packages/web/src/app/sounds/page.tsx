'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { SoundCard } from '@/components/SoundCard';
import { api } from '@/lib/api';

export default function SoundsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'trending' | 'all'>('trending');

  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['sounds', 'trending'],
    queryFn: () => api.getSounds({ trending: true, limit: 20 }),
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['sounds', 'search', searchQuery],
    queryFn: () => api.getSounds({ query: searchQuery, limit: 20 }),
    enabled: searchQuery.length > 0,
  });

  const sounds = searchQuery.length > 0
    ? searchData?.sounds
    : activeTab === 'trending'
      ? trendingData?.sounds
      : trendingData?.sounds; // TODO: fetch "all" sounds with different sorting

  const isLoading = searchQuery.length > 0 ? searchLoading : trendingLoading;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Header */}
          <h1 className="text-2xl font-bold text-text-primary mb-6">Sounds</h1>

          {/* Search */}
          <div className="relative mb-6">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sounds..."
              className="w-full pl-12 pr-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          {/* Tabs (only show when not searching) */}
          {searchQuery.length === 0 && (
            <div className="flex gap-4 mb-6 border-b border-border">
              <button
                onClick={() => setActiveTab('trending')}
                className={`pb-3 px-2 font-medium transition-colors relative ${
                  activeTab === 'trending'
                    ? 'text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Trending
                {activeTab === 'trending' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`pb-3 px-2 font-medium transition-colors relative ${
                  activeTab === 'all'
                    ? 'text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                All
                {activeTab === 'all' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                )}
              </button>
            </div>
          )}

          {/* Results */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
                  <div className="w-16 h-16 rounded-lg bg-surface" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-surface rounded mb-2" />
                    <div className="h-3 w-24 bg-surface rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : sounds && sounds.length > 0 ? (
            <div className="space-y-2">
              {sounds.map((sound) => (
                <SoundCard key={sound.id} sound={sound} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <MusicNoteIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-muted">
                {searchQuery.length > 0
                  ? `No sounds found for "${searchQuery}"`
                  : 'No sounds available yet'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
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
