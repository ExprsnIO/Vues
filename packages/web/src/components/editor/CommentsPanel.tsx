'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEditor } from '@/lib/editor-context';
import { useAuth } from '@/lib/auth-context';

// ============================================================================
// Types
// ============================================================================

interface EditorComment {
  id: string;
  projectId: string;
  userDid: string;
  parentId?: string;
  frame?: number;
  canvasX?: number;
  canvasY?: number;
  elementId?: string;
  content: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedByDid?: string;
  mentionedDids: string[];
  createdAt: string;
  updatedAt: string;
  // Joined data
  user?: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  reactions?: { emoji: string; count: number; hasReacted: boolean }[];
  replies?: EditorComment[];
}

type CommentFilter = 'all' | 'unresolved' | 'resolved' | 'mentions';

// ============================================================================
// Component
// ============================================================================

export function CommentsPanel({
  projectId,
  onClose,
  onJumpToFrame,
  onJumpToCanvas,
}: {
  projectId: string;
  onClose: () => void;
  onJumpToFrame?: (frame: number) => void;
  onJumpToCanvas?: (x: number, y: number) => void;
}) {
  const [filter, setFilter] = useState<CommentFilter>('unresolved');
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [addingAtFrame, setAddingAtFrame] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { state } = useEditor();
  const { user } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch comments
  const { data: comments, isLoading } = useQuery({
    queryKey: ['editor-comments', projectId, filter],
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId,
        filter,
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.listComments?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }

      const data = await response.json();
      return data.comments as EditorComment[];
    },
    staleTime: 10000,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (data: {
      content: string;
      parentId?: string;
      frame?: number;
      canvasX?: number;
      canvasY?: number;
      elementId?: string;
    }) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.addComment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
          body: JSON.stringify({
            projectId,
            ...data,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add comment');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editor-comments', projectId] });
      setNewComment('');
      setReplyingTo(null);
      setAddingAtFrame(null);
    },
  });

  // Resolve comment mutation
  const resolveCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.resolveComment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
          body: JSON.stringify({ commentId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to resolve comment');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editor-comments', projectId] });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.deleteComment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
          body: JSON.stringify({ commentId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete comment');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editor-comments', projectId] });
    },
  });

  // Add reaction mutation
  const addReactionMutation = useMutation({
    mutationFn: async ({ commentId, emoji }: { commentId: string; emoji: string }) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.reactToComment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
          body: JSON.stringify({ commentId, emoji }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add reaction');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editor-comments', projectId] });
    },
  });

  const handleSubmit = useCallback(() => {
    if (!newComment.trim()) return;

    addCommentMutation.mutate({
      content: newComment,
      parentId: replyingTo || undefined,
      frame: addingAtFrame ?? state.currentFrame,
    });
  }, [newComment, replyingTo, addingAtFrame, state.currentFrame, addCommentMutation]);

  // Add comment at current frame
  const handleAddAtCurrentFrame = useCallback(() => {
    setAddingAtFrame(state.currentFrame);
    setReplyingTo(null);
    inputRef.current?.focus();
  }, [state.currentFrame]);

  const filters: { id: CommentFilter; label: string }[] = [
    { id: 'unresolved', label: 'Open' },
    { id: 'all', label: 'All' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'mentions', label: 'Mentions' },
  ];

  // Group comments by frame
  const groupedComments = comments?.reduce((acc, comment) => {
    if (comment.parentId) return acc; // Skip replies
    const frame = comment.frame ?? -1;
    if (!acc[frame]) acc[frame] = [];
    acc[frame].push(comment);
    return acc;
  }, {} as Record<number, EditorComment[]>);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">Comments</h3>
        <button
          onClick={onClose}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="p-2 border-b border-border flex gap-1">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              filter === f.id
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary hover:bg-surface'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 bg-surface rounded-lg animate-pulse">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-surface-hover" />
                  <div className="w-24 h-3 bg-surface-hover rounded" />
                </div>
                <div className="w-full h-4 bg-surface-hover rounded" />
              </div>
            ))}
          </div>
        ) : !comments || comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <CommentIcon className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <button
              onClick={handleAddAtCurrentFrame}
              className="mt-2 text-xs text-accent hover:text-accent-hover"
            >
              Add comment at current frame
            </button>
          </div>
        ) : (
          Object.entries(groupedComments || {})
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([frame, frameComments]) => (
              <div key={frame} className="space-y-2">
                {frame !== '-1' && (
                  <button
                    onClick={() => onJumpToFrame?.(Number(frame))}
                    className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                  >
                    <FrameIcon className="w-3 h-3" />
                    Frame {frame}
                  </button>
                )}
                {frameComments.map(comment => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    replies={comments?.filter(c => c.parentId === comment.id) || []}
                    currentUserDid={user?.did}
                    onReply={() => {
                      setReplyingTo(comment.id);
                      inputRef.current?.focus();
                    }}
                    onResolve={() => resolveCommentMutation.mutate(comment.id)}
                    onDelete={() => deleteCommentMutation.mutate(comment.id)}
                    onReact={(emoji) => addReactionMutation.mutate({ commentId: comment.id, emoji })}
                    onJumpToFrame={onJumpToFrame}
                    onJumpToCanvas={onJumpToCanvas}
                  />
                ))}
              </div>
            ))
        )}
      </div>

      {/* Add Comment */}
      <div className="p-3 border-t border-border">
        {replyingTo && (
          <div className="flex items-center justify-between mb-2 text-xs text-text-muted">
            <span>Replying to comment</span>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-accent hover:text-accent-hover"
            >
              Cancel
            </button>
          </div>
        )}
        {addingAtFrame !== null && (
          <div className="flex items-center justify-between mb-2 text-xs text-text-muted">
            <span>Adding at frame {addingAtFrame}</span>
            <button
              onClick={() => setAddingAtFrame(null)}
              className="text-accent hover:text-accent-hover"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSubmit();
              }
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || addCommentMutation.isPending}
            className="px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-text-muted">Ctrl+Enter to send</p>
      </div>
    </div>
  );
}

// ============================================================================
// Comment Card
// ============================================================================

function CommentCard({
  comment,
  replies,
  currentUserDid,
  onReply,
  onResolve,
  onDelete,
  onReact,
  onJumpToFrame,
  onJumpToCanvas,
}: {
  comment: EditorComment;
  replies: EditorComment[];
  currentUserDid?: string;
  onReply: () => void;
  onResolve: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onJumpToFrame?: (frame: number) => void;
  onJumpToCanvas?: (x: number, y: number) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isOwner = currentUserDid === comment.userDid;

  const quickReactions = ['👍', '❤️', '🎉', '🤔'];

  return (
    <div
      className={`p-3 rounded-lg transition-colors ${
        comment.resolved ? 'bg-surface/50 opacity-60' : 'bg-surface'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        {comment.user?.avatar ? (
          <img
            src={comment.user.avatar}
            alt=""
            className="w-6 h-6 rounded-full"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-xs text-accent">
              {comment.user?.handle?.[0]?.toUpperCase() || '?'}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {comment.user?.displayName || comment.user?.handle || 'Unknown'}
            </span>
            <span className="text-xs text-text-muted">
              {formatTime(comment.createdAt)}
            </span>
            {comment.resolved && (
              <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-500 rounded">
                Resolved
              </span>
            )}
          </div>
          <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap">{comment.content}</p>
        </div>
      </div>

      {/* Actions */}
      {showActions && !comment.resolved && (
        <div className="flex items-center gap-1 mt-2 ml-8">
          <button
            onClick={onReply}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Reply"
          >
            <ReplyIcon className="w-3.5 h-3.5" />
          </button>
          {quickReactions.map(emoji => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className="p-1 text-text-muted hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
          {!comment.resolved && (
            <button
              onClick={onResolve}
              className="p-1 text-text-muted hover:text-green-500 transition-colors"
              title="Mark as resolved"
            >
              <CheckIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {isOwner && (
            <button
              onClick={onDelete}
              className="p-1 text-text-muted hover:text-red-500 transition-colors ml-auto"
              title="Delete"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Reactions */}
      {comment.reactions && comment.reactions.length > 0 && (
        <div className="flex items-center gap-1 mt-2 ml-8">
          {comment.reactions.map(reaction => (
            <button
              key={reaction.emoji}
              onClick={() => onReact(reaction.emoji)}
              className={`px-1.5 py-0.5 text-xs rounded-full border transition-colors ${
                reaction.hasReacted
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'bg-surface-hover border-border text-text-muted hover:border-accent'
              }`}
            >
              {reaction.emoji} {reaction.count}
            </button>
          ))}
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-8 mt-2 pl-2 border-l-2 border-border space-y-2">
          {replies.map(reply => (
            <div key={reply.id} className="text-sm">
              <div className="flex items-center gap-1">
                <span className="font-medium text-text-primary">
                  {reply.user?.displayName || reply.user?.handle || 'Unknown'}
                </span>
                <span className="text-xs text-text-muted">{formatTime(reply.createdAt)}</span>
              </div>
              <p className="text-text-primary">{reply.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Comment Marker (for timeline/canvas)
// ============================================================================

export function CommentMarker({
  comment,
  pixelsPerFrame,
  onClick,
}: {
  comment: EditorComment;
  pixelsPerFrame: number;
  onClick: () => void;
}) {
  if (comment.frame === undefined) return null;

  return (
    <button
      onClick={onClick}
      className={`absolute top-0 w-4 h-4 -translate-x-1/2 rounded-full border-2 transition-colors ${
        comment.resolved
          ? 'bg-green-500/20 border-green-500'
          : 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/40'
      }`}
      style={{ left: comment.frame * pixelsPerFrame }}
      title={comment.content.slice(0, 50)}
    >
      <CommentIcon className="w-2 h-2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-500" />
    </button>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// Icons
// ============================================================================

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function FrameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
