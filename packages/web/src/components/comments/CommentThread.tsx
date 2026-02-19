'use client';

import { useState, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type CommentView, type CommentSortType } from '@/lib/api';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';
import { SortSelector } from './SortSelector';
import { useAuth } from '@/lib/auth-context';

type CommentsPosition = 'side' | 'bottom';

interface CommentThreadProps {
  videoUri: string;
  onClose?: () => void;
  inline?: boolean;
  position?: CommentsPosition;
}

export function CommentThread({ videoUri, onClose, inline = false, position = 'side' }: CommentThreadProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<CommentSortType>('top');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['comments', videoUri, sort],
    queryFn: ({ pageParam }) => api.getComments(videoUri, { cursor: pageParam, sort }),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
  });

  const createCommentMutation = useMutation({
    mutationFn: (data: { text: string; parentUri?: string }) =>
      api.createComment(videoUri, data.text, data.parentUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', videoUri] });
      setReplyingTo(null);
    },
  });

  const handleSubmitComment = useCallback(
    (text: string, parentUri?: string) => {
      if (!user) return;
      createCommentMutation.mutate({ text, parentUri });
    },
    [user, createCommentMutation]
  );

  const handleSortChange = useCallback((newSort: CommentSortType) => {
    setSort(newSort);
  }, []);

  const handleReply = useCallback((commentUri: string) => {
    setReplyingTo(commentUri);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const comments = data?.pages.flatMap((page) => page.comments) ?? [];

  const content = (
    <>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b border-border ${inline ? '' : ''}`}>
        <h2 className="text-lg font-semibold text-text-primary">
          Comments
        </h2>
        <div className="flex items-center gap-3">
          <SortSelector value={sort} onChange={handleSortChange} />
          {!inline && onClose && (
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary p-1"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="text-center py-8 text-text-muted">
            Failed to load comments
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            No comments yet. Be the first to comment!
          </div>
        ) : (
          <>
            {comments.map((comment) => (
              <CommentItem
                key={comment.uri}
                comment={comment}
                onReply={handleReply}
                isReplying={replyingTo === comment.uri}
                onSubmitReply={(text) => handleSubmitComment(text, comment.uri)}
                onCancelReply={handleCancelReply}
              />
            ))}
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full py-3 text-accent hover:text-accent-hover font-medium"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more comments'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Comment Input */}
      <div className="border-t border-border px-4 py-3">
        <CommentInput
          onSubmit={(text) => handleSubmitComment(text)}
          isSubmitting={createCommentMutation.isPending}
          placeholder="Add a comment..."
        />
      </div>
    </>
  );

  // Inline mode: render directly without modal wrapper
  if (inline) {
    const containerClass = position === 'bottom'
      ? 'h-full flex flex-col max-h-[40vh]'
      : 'h-full flex flex-col';

    return (
      <div className={containerClass}>
        {content}
      </div>
    );
  }

  // Modal mode: render with overlay
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-[75vh] bg-background rounded-t-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
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
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
