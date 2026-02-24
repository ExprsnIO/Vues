'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, ChallengeView } from '@/lib/api';

type TabType = 'active' | 'upcoming' | 'ended';

export default function ChallengesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['challenges', 'active'],
    queryFn: () => api.getActiveChallenges({ limit: 50 }),
    enabled: activeTab === 'active' && searchQuery.length < 2,
  });

  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['challenges', 'upcoming'],
    queryFn: () => api.getUpcomingChallenges({ limit: 50 }),
    enabled: activeTab === 'upcoming' && searchQuery.length < 2,
  });

  const { data: endedData, isLoading: endedLoading } = useQuery({
    queryKey: ['challenges', 'ended'],
    queryFn: () => api.getEndedChallenges({ limit: 50 }),
    enabled: activeTab === 'ended' && searchQuery.length < 2,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['challenges', 'search', searchQuery],
    queryFn: () => api.searchChallenges(searchQuery, { limit: 30 }),
    enabled: searchQuery.length >= 2,
  });

  const getTabData = () => {
    if (searchQuery.length >= 2) return searchData?.challenges || [];
    switch (activeTab) {
      case 'active': return activeData?.challenges || [];
      case 'upcoming': return upcomingData?.challenges || [];
      case 'ended': return endedData?.challenges || [];
    }
  };

  const isLoading = searchQuery.length >= 2
    ? searchLoading
    : activeTab === 'active' ? activeLoading
    : activeTab === 'upcoming' ? upcomingLoading
    : endedLoading;

  const challenges = getTabData();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Video Challenges</h1>
        <p className="text-text-muted">Participate in trending challenges and win prizes</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search challenges..."
            className="w-full pl-12 pr-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabs */}
      {searchQuery.length < 2 && (
        <div className="flex gap-2 mb-6">
          {(['active', 'upcoming', 'ended'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Challenge Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-6 animate-pulse">
              <div className="h-6 bg-surface-hover rounded w-3/4 mb-3" />
              <div className="h-4 bg-surface-hover rounded w-full mb-2" />
              <div className="h-4 bg-surface-hover rounded w-1/2 mb-4" />
              <div className="flex gap-4">
                <div className="h-8 bg-surface-hover rounded w-20" />
                <div className="h-8 bg-surface-hover rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-16">
          <TrophyIcon className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <p className="text-text-muted">
            {searchQuery.length >= 2
              ? `No challenges found for "${searchQuery}"`
              : `No ${activeTab} challenges`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChallengeCard({ challenge }: { challenge: ChallengeView }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'voting': return 'bg-yellow-500';
      case 'upcoming': return 'bg-blue-500';
      case 'ended': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getTimeInfo = () => {
    const now = new Date();
    const start = new Date(challenge.startAt);
    const end = new Date(challenge.endAt);

    if (challenge.status === 'upcoming') {
      return `Starts ${formatRelativeTime(start)}`;
    } else if (challenge.status === 'active' || challenge.status === 'voting') {
      return `Ends ${formatRelativeTime(end)}`;
    } else {
      return `Ended ${formatRelativeTime(end)}`;
    }
  };

  return (
    <Link href={`/challenge/${challenge.hashtag}`}>
      <div className="bg-surface border border-border rounded-xl p-6 hover:bg-surface-hover transition-colors group">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-text-primary truncate group-hover:text-accent transition-colors">
              {challenge.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-accent font-medium">#{challenge.hashtag}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${getStatusColor(challenge.status)}`}>
                {challenge.status}
              </span>
            </div>
          </div>
          {challenge.coverImage && (
            <img
              src={challenge.coverImage}
              alt=""
              className="w-16 h-16 rounded-lg object-cover ml-4"
            />
          )}
        </div>

        {/* Description */}
        {challenge.description && (
          <p className="text-sm text-text-muted line-clamp-2 mb-4">
            {challenge.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-text-muted">
            <VideoIcon className="w-4 h-4" />
            <span>{formatNumber(challenge.entryCount)} entries</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <UsersIcon className="w-4 h-4" />
            <span>{formatNumber(challenge.participantCount)} participants</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <ClockIcon className="w-4 h-4" />
            <span>{getTimeInfo()}</span>
          </div>
        </div>

        {/* Prizes */}
        {challenge.prizes && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm">
              <TrophyIcon className="w-4 h-4 text-yellow-500" />
              <span className="text-text-primary font-medium">{challenge.prizes}</span>
            </div>
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

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const absDiff = Math.abs(diff);

  const minutes = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

  const prefix = diff > 0 ? 'in ' : '';
  const suffix = diff < 0 ? ' ago' : '';

  if (days > 0) return `${prefix}${days} day${days > 1 ? 's' : ''}${suffix}`;
  if (hours > 0) return `${prefix}${hours} hour${hours > 1 ? 's' : ''}${suffix}`;
  if (minutes > 0) return `${prefix}${minutes} minute${minutes > 1 ? 's' : ''}${suffix}`;
  return 'just now';
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
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

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
