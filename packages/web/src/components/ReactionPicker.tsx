'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type VideoReactionType } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useLoginModal } from './LoginModal';
import { formatCount } from '@/lib/utils';

const REACTIONS: { type: VideoReactionType; emoji: string; label: string }[] = [
  { type: 'fire', emoji: '\u{1F525}', label: 'Fire' },
  { type: 'love', emoji: '\u{2764}\u{FE0F}', label: 'Love' },
  { type: 'laugh', emoji: '\u{1F602}', label: 'Laugh' },
  { type: 'wow', emoji: '\u{1F62E}', label: 'Wow' },
  { type: 'sad', emoji: '\u{1F622}', label: 'Sad' },
  { type: 'angry', emoji: '\u{1F620}', label: 'Angry' },
];

interface ReactionPickerProps {
  videoUri: string;
  className?: string;
}

export function ReactionPicker({ videoUri, className = '' }: ReactionPickerProps) {
  const { user } = useAuth();
  const { open: openLoginModal } = useLoginModal();
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fetch reactions
  const { data: reactionsData } = useQuery({
    queryKey: ['reactions', videoUri],
    queryFn: () => api.getReactions(videoUri),
  });

  const counts = reactionsData?.counts || {
    fire: 0,
    love: 0,
    laugh: 0,
    wow: 0,
    sad: 0,
    angry: 0,
  };
  const userReactions = reactionsData?.userReactions || [];
  const totalReactions = reactionsData?.totalReactions || 0;

  // Find the most popular reaction for the button display
  const topReaction = REACTIONS.reduce(
    (top, r) => {
      const count = counts[r.type] || 0;
      return count > top.count ? { type: r.type, emoji: r.emoji, count } : top;
    },
    { type: 'fire' as VideoReactionType, emoji: '\u{1F525}', count: 0 }
  );

  // React mutation
  const reactMutation = useMutation({
    mutationFn: ({ reactionType }: { reactionType: VideoReactionType }) =>
      api.react(videoUri, reactionType),
    onMutate: async ({ reactionType }) => {
      await queryClient.cancelQueries({ queryKey: ['reactions', videoUri] });
      const previous = queryClient.getQueryData(['reactions', videoUri]);

      queryClient.setQueryData(['reactions', videoUri], (old: typeof reactionsData) => {
        if (!old) return old;
        const newCounts = { ...old.counts, [reactionType]: (old.counts[reactionType] || 0) + 1 };
        return {
          ...old,
          counts: newCounts,
          totalReactions: old.totalReactions + 1,
          userReactions: [...old.userReactions, reactionType],
        };
      });

      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['reactions', videoUri], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reactions', videoUri] });
    },
  });

  // Unreact mutation
  const unreactMutation = useMutation({
    mutationFn: ({ reactionType }: { reactionType: VideoReactionType }) =>
      api.unreact(videoUri, reactionType),
    onMutate: async ({ reactionType }) => {
      await queryClient.cancelQueries({ queryKey: ['reactions', videoUri] });
      const previous = queryClient.getQueryData(['reactions', videoUri]);

      queryClient.setQueryData(['reactions', videoUri], (old: typeof reactionsData) => {
        if (!old) return old;
        const newCounts = {
          ...old.counts,
          [reactionType]: Math.max((old.counts[reactionType] || 0) - 1, 0),
        };
        return {
          ...old,
          counts: newCounts,
          totalReactions: Math.max(old.totalReactions - 1, 0),
          userReactions: old.userReactions.filter((r: VideoReactionType) => r !== reactionType),
        };
      });

      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['reactions', videoUri], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reactions', videoUri] });
    },
  });

  const handleReactionClick = useCallback(
    (reactionType: VideoReactionType) => {
      if (!user) {
        openLoginModal('Log in to react to this video');
        return;
      }

      if (userReactions.includes(reactionType)) {
        unreactMutation.mutate({ reactionType });
      } else {
        reactMutation.mutate({ reactionType });
      }
    },
    [user, userReactions, reactMutation, unreactMutation, openLoginModal]
  );

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPicker]);

  const hasUserReactions = userReactions.length > 0;

  return (
    <div className={`relative ${className}`}>
      {/* Main reaction button */}
      <button
        ref={buttonRef}
        onClick={() => setShowPicker(!showPicker)}
        className="flex flex-col items-center group"
      >
        <div
          className={`p-2 rounded-full transition-transform group-hover:scale-110 ${
            hasUserReactions ? 'text-yellow-500' : 'text-white'
          }`}
        >
          <span className="text-2xl">{topReaction.emoji}</span>
        </div>
        <span className="text-xs text-white font-medium">{formatCount(totalReactions)}</span>
      </button>

      {/* Reaction picker popup */}
      {showPicker && (
        <div
          ref={pickerRef}
          className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-sm rounded-full px-2 py-1.5 flex items-center gap-1 shadow-lg border border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          {REACTIONS.map((reaction) => {
            const isActive = userReactions.includes(reaction.type);
            const count = counts[reaction.type] || 0;

            return (
              <button
                key={reaction.type}
                onClick={() => {
                  handleReactionClick(reaction.type);
                }}
                className={`relative p-2 rounded-full transition-all hover:scale-125 hover:bg-gray-800 ${
                  isActive ? 'bg-gray-700 scale-110' : ''
                }`}
                title={`${reaction.label}${count > 0 ? ` (${count})` : ''}`}
              >
                <span className="text-xl">{reaction.emoji}</span>
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-gray-700 text-white text-[10px] rounded-full px-1 min-w-[16px] text-center">
                    {formatCount(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ReactionPicker;
