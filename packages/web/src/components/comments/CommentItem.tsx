'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type CommentView, type ReactionType } from '@/lib/api';
import { ReactionPicker } from './ReactionPicker';
import { CommentInput } from './CommentInput';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';

interface CommentItemProps {
  comment: CommentView;
  onReply: (commentUri: string) => void;
  isReplying: boolean;
  onSubmitReply: (text: string) => void;
  onCancelReply: () => void;
  isNested?: boolean;
}

export function CommentItem({
  comment,
  onReply,
  isReplying,
  onSubmitReply,
  onCancelReply,
  isNested = false,
}: CommentItemProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showReplies, setShowReplies] = useState(false);
  const [currentReaction, setCurrentReaction] = useState<ReactionType | undefined>(
    comment.viewer?.reaction
  );
  const [reactionCounts, setReactionCounts] = useState({
    like: comment.likeCount,
    love: comment.loveCount,
    dislike: comment.dislikeCount,
  });

  const reactionMutation = useMutation({
    mutationFn: async (reactionType: ReactionType) => {
      if (currentReaction === reactionType) {
        await api.unreactToComment(comment.uri);
        return { removed: true, type: reactionType };
      }
      await api.reactToComment(comment.uri, reactionType);
      return { removed: false, type: reactionType };
    },
    onMutate: async (reactionType) => {
      // Optimistic update
      const prevReaction = currentReaction;
      const newCounts = { ...reactionCounts };

      // Remove previous reaction count
      if (prevReaction) {
        newCounts[prevReaction] = Math.max(0, newCounts[prevReaction] - 1);
      }

      // Add new reaction count (or just remove if same)
      if (reactionType !== prevReaction) {
        newCounts[reactionType] = newCounts[reactionType] + 1;
        setCurrentReaction(reactionType);
      } else {
        setCurrentReaction(undefined);
      }

      setReactionCounts(newCounts);
      return { prevReaction, prevCounts: reactionCounts };
    },
    onError: (_, __, context) => {
      // Revert on error
      if (context) {
        setCurrentReaction(context.prevReaction);
        setReactionCounts(context.prevCounts);
      }
    },
  });

  const handleReaction = useCallback(
    (reactionType: ReactionType) => {
      if (!user) return;
      reactionMutation.mutate(reactionType);
    },
    [user, reactionMutation]
  );

  const handleReplyClick = useCallback(() => {
    onReply(comment.uri);
  }, [comment.uri, onReply]);

  const toggleReplies = useCallback(() => {
    setShowReplies((prev) => !prev);
  }, []);

  const totalReactions = reactionCounts.like + reactionCounts.love + reactionCounts.dislike;

  return (
    <div className={`py-3 ${isNested ? 'pl-10' : ''}`}>
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-surface overflow-hidden">
            {comment.author.avatar ? (
              <img
                src={comment.author.avatar}
                alt={comment.author.handle}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-primary font-medium text-sm">
                {comment.author.handle[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary text-sm">
              {comment.author.displayName || `@${comment.author.handle}`}
            </span>
            <span className="text-text-muted text-xs">
              {formatDistanceToNow(new Date(comment.createdAt))}
            </span>
          </div>

          <p className="text-text-primary text-sm mt-1 whitespace-pre-wrap">
            {comment.text}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 mt-2">
            <ReactionPicker
              currentReaction={currentReaction}
              counts={reactionCounts}
              onReact={handleReaction}
              disabled={!user}
            />

            {!isNested && (
              <button
                onClick={handleReplyClick}
                className="text-text-muted hover:text-text-primary text-xs font-medium"
              >
                Reply
              </button>
            )}
          </div>

          {/* Reply input */}
          {isReplying && (
            <div className="mt-3">
              <CommentInput
                onSubmit={onSubmitReply}
                onCancel={onCancelReply}
                placeholder={`Reply to @${comment.author.handle}...`}
                autoFocus
              />
            </div>
          )}

          {/* Nested replies preview */}
          {!isNested && comment.replies && comment.replies.length > 0 && (
            <div className="mt-2">
              <button
                onClick={toggleReplies}
                className="text-accent hover:text-accent-hover text-xs font-medium"
              >
                {showReplies
                  ? 'Hide replies'
                  : `View ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
              </button>

              {showReplies && (
                <div className="mt-2 border-l-2 border-border">
                  {comment.replies.map((reply) => (
                    <CommentItem
                      key={reply.uri}
                      comment={reply}
                      onReply={() => {}}
                      isReplying={false}
                      onSubmitReply={() => {}}
                      onCancelReply={() => {}}
                      isNested
                    />
                  ))}
                  {comment.replyCount > comment.replies.length && (
                    <button className="text-accent hover:text-accent-hover text-xs font-medium pl-3 py-2">
                      View all {comment.replyCount} replies
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
