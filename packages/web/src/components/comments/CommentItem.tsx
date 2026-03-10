'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type CommentView, type ReactionType } from '@/lib/api';
import { ReactionPicker } from './ReactionPicker';
import { CommentEmojiPicker, type CommentEmojiType } from './CommentEmojiPicker';
import { CommentInput } from './CommentInput';
import { CommentText } from './CommentText';
import { ReportModal } from '@/components/ReportModal';
import { useAuth } from '@/lib/auth-context';
import { useLoginModal } from '@/components/LoginModal';
import { formatDistanceToNow } from '@/lib/utils';

interface CommentItemProps {
  comment: CommentView;
  onReply: (commentUri: string) => void;
  isReplying: boolean;
  onSubmitReply: (text: string) => void;
  onCancelReply: () => void;
  isNested?: boolean;
  videoUri?: string;
  videoAuthorDid?: string;
}

export function CommentItem({
  comment,
  onReply,
  isReplying,
  onSubmitReply,
  onCancelReply,
  isNested = false,
  videoUri,
  videoAuthorDid,
}: CommentItemProps) {
  const { user } = useAuth();
  const { open: openLoginModal } = useLoginModal();
  const queryClient = useQueryClient();
  const [showReplies, setShowReplies] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [currentReaction, setCurrentReaction] = useState<ReactionType | undefined>(
    comment.viewer?.reaction
  );
  const [reactionCounts, setReactionCounts] = useState({
    like: comment.likeCount,
    love: comment.loveCount,
    dislike: comment.dislikeCount,
  });
  const [currentEmoji, setCurrentEmoji] = useState<CommentEmojiType | undefined>(
    comment.viewer?.emoji
  );
  const [emojiCounts, setEmojiCounts] = useState<Record<CommentEmojiType, number>>(
    comment.emojiCounts || {
      heart: 0,
      laugh: 0,
      wow: 0,
      sad: 0,
      angry: 0,
      clap: 0,
    }
  );
  const [isPinned, setIsPinned] = useState(comment.isPinned || false);

  // Check if current user is video owner (can pin comments)
  const isVideoOwner = user?.did === videoAuthorDid;

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleReport = useCallback(() => {
    if (!user) {
      openLoginModal('Log in to report this comment');
      return;
    }
    setShowMenu(false);
    setShowReportModal(true);
  }, [user, openLoginModal]);

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

  const emojiReactionMutation = useMutation({
    mutationFn: async (emojiType: CommentEmojiType) => {
      if (currentEmoji === emojiType) {
        await api.removeCommentEmoji(comment.uri);
        return { removed: true, type: emojiType };
      }
      await api.addCommentEmoji(comment.uri, emojiType);
      return { removed: false, type: emojiType };
    },
    onMutate: async (emojiType) => {
      const prevEmoji = currentEmoji;
      const newCounts = { ...emojiCounts };

      if (prevEmoji) {
        newCounts[prevEmoji] = Math.max(0, newCounts[prevEmoji] - 1);
      }

      if (emojiType !== prevEmoji) {
        newCounts[emojiType] = newCounts[emojiType] + 1;
        setCurrentEmoji(emojiType);
      } else {
        setCurrentEmoji(undefined);
      }

      setEmojiCounts(newCounts);
      return { prevEmoji, prevCounts: emojiCounts };
    },
    onError: (_, __, context) => {
      if (context) {
        setCurrentEmoji(context.prevEmoji);
        setEmojiCounts(context.prevCounts);
      }
    },
  });

  const handleEmojiReaction = useCallback(
    (emojiType: CommentEmojiType) => {
      if (!user) {
        openLoginModal('Log in to react to this comment');
        return;
      }
      emojiReactionMutation.mutate(emojiType);
    },
    [user, openLoginModal, emojiReactionMutation]
  );

  const pinMutation = useMutation({
    mutationFn: async () => {
      if (isPinned) {
        await api.unpinComment(videoUri!);
        return { pinned: false };
      }
      await api.pinComment(comment.uri, videoUri!);
      return { pinned: true };
    },
    onSuccess: (data) => {
      setIsPinned(data.pinned);
      queryClient.invalidateQueries({ queryKey: ['comments', videoUri] });
    },
  });

  const handlePin = useCallback(() => {
    if (!isVideoOwner || !videoUri) return;
    setShowMenu(false);
    pinMutation.mutate();
  }, [isVideoOwner, videoUri, pinMutation]);

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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-text-primary text-sm">
              {comment.author.displayName || `@${comment.author.handle}`}
            </span>
            <span className="text-text-muted text-xs">
              {formatDistanceToNow(new Date(comment.createdAt))}
            </span>
            {isPinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-accent text-xs font-medium rounded-full">
                <PinIcon className="w-3 h-3" />
                Pinned
              </span>
            )}
          </div>

          <CommentText text={comment.text} />

          {/* Actions */}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <ReactionPicker
              currentReaction={currentReaction}
              counts={reactionCounts}
              onReact={handleReaction}
              disabled={!user}
            />

            <CommentEmojiPicker
              currentEmoji={currentEmoji}
              counts={emojiCounts}
              onReact={handleEmojiReaction}
              disabled={!user}
              compact
            />

            {!isNested && (
              <button
                onClick={handleReplyClick}
                className="text-text-muted hover:text-text-primary text-xs font-medium"
              >
                Reply
              </button>
            )}

            {/* More menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="text-text-muted hover:text-text-primary p-1 -m-1"
              >
                <MoreIcon className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute left-0 top-full mt-1 py-1 bg-surface border border-border rounded-lg shadow-lg z-10 min-w-[140px]">
                  {isVideoOwner && !isNested && videoUri && (
                    <button
                      onClick={handlePin}
                      disabled={pinMutation.isPending}
                      className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
                    >
                      <PinIcon className="w-4 h-4" />
                      {isPinned ? 'Unpin comment' : 'Pin comment'}
                    </button>
                  )}
                  <button
                    onClick={handleReport}
                    className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-surface-hover flex items-center gap-2"
                  >
                    <FlagIcon className="w-4 h-4" />
                    Report
                  </button>
                </div>
              )}
            </div>
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
                      videoUri={videoUri}
                      videoAuthorDid={videoAuthorDid}
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

      {/* Report Modal */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        contentType="comment"
        contentUri={comment.uri}
        contentCid={comment.cid}
        contentPreview={{
          text: comment.text,
          authorHandle: comment.author.handle,
        }}
      />
    </div>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11.25l-3-3m0 0l-3 3m3-3v7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
