'use client';

import Link from 'next/link';
import { ChallengeEntryView } from '@/lib/api';

interface LeaderboardCardProps {
  entry: ChallengeEntryView;
  rank: number;
  isWinner?: boolean;
  showVideo?: boolean;
}

export function LeaderboardCard({ entry, rank, isWinner, showVideo = true }: LeaderboardCardProps) {
  const getRankStyle = () => {
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
              {entry.author?.verified && <VerifiedIcon className="w-4 h-4 text-accent" />}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
              <span>{formatNumber(entry.viewCount)} views</span>
              <span>{formatNumber(entry.likeCount)} likes</span>
              <span>{formatNumber(entry.commentCount)} comments</span>
            </div>
          </div>
          {showVideo && entry.video?.video?.thumbnail && (
            <img
              src={entry.video.video.thumbnail}
              alt=""
              className="w-12 h-16 rounded object-cover"
            />
          )}
        </div>

        {/* Engagement score bar */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-text-muted">Engagement Score</span>
            <span className="font-medium text-text-primary">{formatNumber(entry.engagementScore)}</span>
          </div>
          <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${Math.min(100, (entry.engagementScore / 10000) * 100)}%` }}
            />
          </div>
        </div>
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

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default LeaderboardCard;
