'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ChallengeEntryView } from '@/lib/api';

type SortType = 'top' | 'recent';

export default function ChallengeDetailPage() {
  const params = useParams();
  const hashtag = params.hashtag as string;
  const [entriesSort, setEntriesSort] = useState<SortType>('top');

  const { data: challengeData, isLoading: challengeLoading } = useQuery({
    queryKey: ['challenge', hashtag],
    queryFn: () => api.getChallenge({ hashtag }),
  });

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['challenge', hashtag, 'leaderboard'],
    queryFn: () => api.getChallengeLeaderboard(challengeData!.challenge.id, { limit: 10 }),
    enabled: !!challengeData?.challenge.id,
  });

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['challenge', hashtag, 'entries', entriesSort],
    queryFn: () => api.getChallengeEntries(challengeData!.challenge.id, { sort: entriesSort, limit: 30 }),
    enabled: !!challengeData?.challenge.id,
  });

  const { data: featuredData } = useQuery({
    queryKey: ['challenge', hashtag, 'featured'],
    queryFn: () => api.getChallengeFeatured(challengeData!.challenge.id),
    enabled: !!challengeData?.challenge.id && challengeData.challenge.status === 'ended',
  });

  if (challengeLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-surface rounded w-1/3 mb-4" />
          <div className="h-4 bg-surface rounded w-1/2 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 h-96 bg-surface rounded-xl" />
            <div className="h-96 bg-surface rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!challengeData) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <TrophyIcon className="w-16 h-16 mx-auto text-text-muted mb-4" />
        <h1 className="text-2xl font-bold text-text-primary mb-2">Challenge Not Found</h1>
        <p className="text-text-muted mb-4">The challenge #{hashtag} doesn't exist.</p>
        <Link href="/discover/challenges" className="text-accent hover:underline">
          Browse all challenges
        </Link>
      </div>
    );
  }

  const { challenge, topEntries, featuredEntries, userParticipation } = challengeData;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'voting': return 'bg-yellow-500';
      case 'upcoming': return 'bg-blue-500';
      case 'ended': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-accent font-medium text-lg">#{challenge.hashtag}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${getStatusColor(challenge.status)}`}>
            {challenge.status}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-4">{challenge.name}</h1>
        {challenge.description && (
          <p className="text-text-muted text-lg mb-4">{challenge.description}</p>
        )}

        {/* Stats Row */}
        <div className="flex flex-wrap gap-6 mb-6">
          <div className="flex items-center gap-2">
            <VideoIcon className="w-5 h-5 text-text-muted" />
            <span className="text-text-primary font-medium">{formatNumber(challenge.entryCount)}</span>
            <span className="text-text-muted">entries</span>
          </div>
          <div className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-text-muted" />
            <span className="text-text-primary font-medium">{formatNumber(challenge.participantCount)}</span>
            <span className="text-text-muted">participants</span>
          </div>
          <div className="flex items-center gap-2">
            <EyeIcon className="w-5 h-5 text-text-muted" />
            <span className="text-text-primary font-medium">{formatNumber(challenge.totalViews)}</span>
            <span className="text-text-muted">total views</span>
          </div>
        </div>

        {/* Dates */}
        <div className="flex flex-wrap gap-4 text-sm text-text-muted">
          <div>
            <span className="font-medium">Start:</span> {new Date(challenge.startAt).toLocaleDateString()}
          </div>
          <div>
            <span className="font-medium">End:</span> {new Date(challenge.endAt).toLocaleDateString()}
          </div>
          {challenge.votingEndAt && (
            <div>
              <span className="font-medium">Voting ends:</span> {new Date(challenge.votingEndAt).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Prizes */}
        {challenge.prizes && (
          <div className="mt-4 p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <TrophyIcon className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold text-text-primary">Prizes</span>
            </div>
            <p className="text-text-muted">{challenge.prizes}</p>
          </div>
        )}

        {/* Rules */}
        {challenge.rules && (
          <div className="mt-4 p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon className="w-5 h-5 text-text-muted" />
              <span className="font-semibold text-text-primary">Rules</span>
            </div>
            <p className="text-text-muted whitespace-pre-wrap">{challenge.rules}</p>
          </div>
        )}

        {/* User Participation */}
        {userParticipation && (
          <div className="mt-4 p-4 bg-accent/10 border border-accent/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <CheckIcon className="w-5 h-5 text-accent" />
              <span className="font-semibold text-text-primary">You're participating!</span>
            </div>
            <p className="text-text-muted">
              You have {userParticipation.entryCount} {userParticipation.entryCount === 1 ? 'entry' : 'entries'}
              {userParticipation.bestRank && ` • Best rank: #${userParticipation.bestRank}`}
            </p>
          </div>
        )}

        {/* Join CTA */}
        {challenge.status === 'active' && !userParticipation && (
          <div className="mt-6">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-text-inverse font-medium rounded-xl hover:bg-accent-hover transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Join Challenge
            </Link>
            <p className="mt-2 text-sm text-text-muted">
              Post a video with #{challenge.hashtag} to automatically enter
            </p>
          </div>
        )}
      </div>

      {/* Winners Section (for ended challenges) */}
      {challenge.status === 'ended' && featuredData && featuredData.winners.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
            <TrophyIcon className="w-6 h-6 text-yellow-500" />
            Winners
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredData.winners.map((entry, index) => (
              <LeaderboardCard key={entry.id} entry={entry} rank={index + 1} isWinner />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Entries */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary">Entries</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setEntriesSort('top')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  entriesSort === 'top'
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface text-text-muted hover:bg-surface-hover'
                }`}
              >
                Top
              </button>
              <button
                onClick={() => setEntriesSort('recent')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  entriesSort === 'recent'
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface text-text-muted hover:bg-surface-hover'
                }`}
              >
                Recent
              </button>
            </div>
          </div>

          {entriesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="aspect-[9/16] bg-surface rounded-xl animate-pulse" />
              ))}
            </div>
          ) : entriesData?.entries.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-xl">
              <VideoIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">No entries yet. Be the first!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {entriesData?.entries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-4">Leaderboard</h2>
          {leaderboardLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-surface border border-border rounded-xl p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-surface-hover rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-surface-hover rounded w-24 mb-1" />
                      <div className="h-3 bg-surface-hover rounded w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : leaderboardData?.entries.length === 0 ? (
            <div className="text-center py-8 bg-surface rounded-xl">
              <p className="text-text-muted">Leaderboard will appear after entries are ranked</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaderboardData?.entries.map((entry, index) => (
                <LeaderboardCard key={entry.id} entry={entry} rank={index + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderboardCard({ entry, rank, isWinner }: { entry: ChallengeEntryView; rank: number; isWinner?: boolean }) {
  const getRankStyle = () => {
    if (isWinner) {
      if (rank === 1) return 'bg-yellow-500 text-white';
      if (rank === 2) return 'bg-gray-400 text-white';
      if (rank === 3) return 'bg-amber-600 text-white';
    }
    if (rank === 1) return 'bg-yellow-500 text-white';
    if (rank === 2) return 'bg-gray-400 text-white';
    if (rank === 3) return 'bg-amber-600 text-white';
    return 'bg-surface-hover text-text-muted';
  };

  return (
    <Link href={`/video/${encodeURIComponent(entry.videoUri)}`}>
      <div className={`bg-surface border rounded-xl p-4 hover:bg-surface-hover transition-colors ${
        isWinner ? 'border-yellow-500/50' : 'border-border'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle()}`}>
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {entry.author?.avatar ? (
                <img src={entry.author.avatar} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-surface-hover" />
              )}
              <span className="font-medium text-text-primary truncate">
                {entry.author?.displayName || entry.author?.handle || 'Unknown'}
              </span>
              {isWinner && <TrophyIcon className="w-4 h-4 text-yellow-500" />}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
              <span>{formatNumber(entry.viewCount)} views</span>
              <span>{formatNumber(entry.likeCount)} likes</span>
            </div>
          </div>
          {entry.video?.video?.thumbnail && (
            <img
              src={entry.video.video.thumbnail}
              alt=""
              className="w-12 h-16 rounded object-cover"
            />
          )}
        </div>
      </div>
    </Link>
  );
}

function EntryCard({ entry }: { entry: ChallengeEntryView }) {
  return (
    <Link href={`/video/${encodeURIComponent(entry.videoUri)}`}>
      <div className="relative aspect-[9/16] bg-surface rounded-xl overflow-hidden group">
        {entry.video?.video?.thumbnail ? (
          <img
            src={entry.video.video.thumbnail}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-surface-hover flex items-center justify-center">
            <VideoIcon className="w-8 h-8 text-text-muted" />
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Stats */}
        <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2 text-white text-sm">
            {entry.author?.avatar ? (
              <img src={entry.author.avatar} alt="" className="w-5 h-5 rounded-full" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-white/20" />
            )}
            <span className="truncate">{entry.author?.displayName || entry.author?.handle}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-white/80 text-xs">
            <span>{formatNumber(entry.viewCount)} views</span>
            <span>{formatNumber(entry.likeCount)} likes</span>
          </div>
        </div>

        {/* Rank badge */}
        {entry.rank && entry.rank <= 10 && (
          <div className="absolute top-2 left-2 w-6 h-6 bg-accent text-text-inverse text-xs font-bold rounded-full flex items-center justify-center">
            {entry.rank}
          </div>
        )}

        {/* Featured badge */}
        {entry.isFeatured && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-500 text-white text-xs font-medium rounded">
            Featured
          </div>
        )}

        {/* Winner badge */}
        {entry.isWinner && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-yellow-500 text-white text-xs font-medium rounded">
            <TrophyIcon className="w-3 h-3" />
            Winner
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

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
