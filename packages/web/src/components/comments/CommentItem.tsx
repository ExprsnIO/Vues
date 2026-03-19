'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type CommentView, type ReactionType } from '@/lib/api';
import toast from 'react-hot-toast';
import { ReactionPicker } from './ReactionPicker';
import { CommentEmojiPicker, type CommentEmojiType } from './CommentEmojiPicker';
import { CommentInput } from './CommentInput';
import { CommentText } from './CommentText';
import { ReportModal } from '@/components/ReportModal';
import { useAuth } from '@/lib/auth-context';
import { useLoginModal } from '@/components/LoginModal';
import { formatDistanceToNow } from '@/lib/utils';
import { useMessagingStore } from '@/stores/messaging-store';

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
  const { user, isModerator } = useAuth();
  const { open: openLoginModal } = useLoginModal();
  const { openNewConversation } = useMessagingStore();
  const queryClient = useQueryClient();
  const [showReplies, setShowReplies] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showModConfirm, setShowModConfirm] = useState<'remove' | 'warn' | 'flag' | null>(null);
  const [modReason, setModReason] = useState('');
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

  const handleMessage = useCallback(() => {
    setShowMenu(false);
    openNewConversation(comment.author.did);
  }, [comment.author.did, openNewConversation]);

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

  const modMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: 'remove' | 'warn' | 'flag'; reason: string }) => {
      if (action === 'remove') {
        await api.deleteComment(comment.uri);
      } else {
        // warn or flag — create a report with moderator context
        await api.report({
          subjectUri: comment.uri,
          subjectCid: comment.cid,
          reason: 'other',
          description: `[Moderator ${action}] ${reason}`,
        });
      }
      return { action };
    },
    onSuccess: (data) => {
      const messages: Record<string, string> = {
        remove: 'Comment removed',
        warn: 'Warning sent to user',
        flag: 'Comment flagged for review',
      };
      toast.success(messages[data.action]);
      setShowModConfirm(null);
      setModReason('');
      if (data.action === 'remove') {
        queryClient.invalidateQueries({ queryKey: ['comments', videoUri] });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Moderation action failed');
    },
  });

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
                <div className="absolute left-0 top-full mt-1 py-1 bg-surface border border-border rounded-lg shadow-lg z-10 min-w-[180px]">
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
                  {user && comment.author.did !== user.did && (
                    <button
                      onClick={handleMessage}
                      className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
                    >
                      <MessageIcon className="w-4 h-4" />
                      Message @{comment.author.handle}
                    </button>
                  )}
                  <button
                    onClick={handleReport}
                    className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-surface-hover flex items-center gap-2"
                  >
                    <FlagIcon className="w-4 h-4" />
                    Report
                  </button>
                  {isModerator && (
                    <>
                      <div className="border-t border-border my-1" />
                      <div className="px-3 py-1">
                        <span className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide">
                          Moderation
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setShowModConfirm('remove');
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-400/10 flex items-center gap-2"
                      >
                        <TrashModIcon className="w-4 h-4" />
                        Remove Comment
                      </button>
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setShowModConfirm('warn');
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-yellow-400 hover:bg-yellow-400/10 flex items-center gap-2"
                      >
                        <WarnIcon className="w-4 h-4" />
                        Warn User
                      </button>
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setShowModConfirm('flag');
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-orange-400 hover:bg-orange-400/10 flex items-center gap-2"
                      >
                        <FlagIcon className="w-4 h-4" />
                        Flag for Review
                      </button>
                    </>
                  )}
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

      {/* Moderation confirmation modal */}
      {showModConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg p-5 max-w-sm mx-4 border border-border w-full">
            <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wide mb-3">
              {showModConfirm === 'remove' && 'Remove Comment'}
              {showModConfirm === 'warn' && 'Warn User'}
              {showModConfirm === 'flag' && 'Flag for Review'}
            </h3>
            <p className="text-text-muted text-sm mb-3">
              Comment by @{comment.author.handle}: &quot;{comment.text.slice(0, 80)}
              {comment.text.length > 80 ? '…' : ''}&quot;
            </p>
            <textarea
              value={modReason}
              onChange={(e) => setModReason(e.target.value)}
              placeholder="Reason (required)"
              rows={2}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-orange-400 mb-3"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowModConfirm(null);
                  setModReason('');
                }}
                className="flex-1 px-3 py-2 text-sm text-text-muted border border-border rounded-md hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!modReason.trim()) return;
                  modMutation.mutate({ action: showModConfirm, reason: modReason.trim() });
                }}
                disabled={!modReason.trim() || modMutation.isPending}
                className="flex-1 px-3 py-2 text-sm bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
              >
                {modMutation.isPending ? 'Applying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
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

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function TrashModIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
