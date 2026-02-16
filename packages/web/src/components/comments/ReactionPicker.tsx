'use client';

import { useCallback } from 'react';
import { type ReactionType } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ReactionPickerProps {
  currentReaction?: ReactionType;
  counts: {
    like: number;
    love: number;
    dislike: number;
  };
  onReact: (type: ReactionType) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ReactionPicker({
  currentReaction,
  counts,
  onReact,
  disabled = false,
  compact = false,
}: ReactionPickerProps) {
  const handleClick = useCallback(
    (type: ReactionType) => {
      if (!disabled) {
        onReact(type);
      }
    },
    [disabled, onReact]
  );

  const formatCount = (count: number): string => {
    if (count === 0) return '';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const totalPositive = counts.like + counts.love;

  return (
    <div className="flex items-center gap-1">
      {/* Like button */}
      <button
        onClick={() => handleClick('like')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors',
          currentReaction === 'like'
            ? 'bg-blue-500/20 text-blue-500'
            : 'text-text-muted hover:text-text-primary hover:bg-surface',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        title="Like"
      >
        <ThumbsUpIcon
          className="w-4 h-4"
          filled={currentReaction === 'like'}
        />
        {!compact && counts.like > 0 && (
          <span>{formatCount(counts.like)}</span>
        )}
      </button>

      {/* Love button */}
      <button
        onClick={() => handleClick('love')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors',
          currentReaction === 'love'
            ? 'bg-pink-500/20 text-pink-500'
            : 'text-text-muted hover:text-text-primary hover:bg-surface',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        title="Love"
      >
        <HeartIcon
          className="w-4 h-4"
          filled={currentReaction === 'love'}
        />
        {!compact && counts.love > 0 && (
          <span>{formatCount(counts.love)}</span>
        )}
      </button>

      {/* Dislike button */}
      <button
        onClick={() => handleClick('dislike')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors',
          currentReaction === 'dislike'
            ? 'bg-red-500/20 text-red-500'
            : 'text-text-muted hover:text-text-primary hover:bg-surface',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        title="Dislike"
      >
        <ThumbsDownIcon
          className="w-4 h-4"
          filled={currentReaction === 'dislike'}
        />
        {!compact && counts.dislike > 0 && (
          <span>{formatCount(counts.dislike)}</span>
        )}
      </button>

      {/* Total count (compact mode) */}
      {compact && totalPositive > 0 && (
        <span className="text-text-muted text-xs ml-1">
          {formatCount(totalPositive)}
        </span>
      )}
    </div>
  );
}

function ThumbsUpIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"
      />
    </svg>
  );
}

function ThumbsDownIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365-.183-.75-.575-.75h-.908c-.889 0-1.713.518-1.972 1.368a12 12 0 00-.521 3.507c0 1.553.295 3.036.831 4.398.306.774-.092 1.727-.822 1.727h-.35c-.483 0-.963-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"
      />
    </svg>
  );
}

function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}
