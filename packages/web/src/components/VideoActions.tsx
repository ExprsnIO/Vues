'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type VideoView } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useLoginModal } from './LoginModal';
import { CommentThread } from './comments/CommentThread';
import { CollabLoopModal } from './CollabLoopModal';
import { ReportModal } from './ReportModal';
import { ReactionPicker } from './ReactionPicker';
import { TipModal } from './TipModal';
import { useVideoShare } from '@/hooks/useVideoShare';
import toast from 'react-hot-toast';

interface VideoActionsProps {
  video: VideoView;
  onEngagement?: (action: string) => void;
}

export function VideoActions({ video, onEngagement }: VideoActionsProps) {
  const { user } = useAuth();
  const { open: openLoginModal } = useLoginModal();
  const queryClient = useQueryClient();
  const [isLiked, setIsLiked] = useState(video.viewer?.liked ?? false);
  const [likeCount, setLikeCount] = useState(video.likeCount);
  const [showComments, setShowComments] = useState(false);
  const [collabLoopModal, setCollabLoopModal] = useState<'collab' | 'loop' | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { share, shareCount, shareState } = useVideoShare({
    video,
    user,
    onShared: () => onEngagement?.('shared'),
  });

  // Check if current user owns this video
  const isOwnVideo = user?.did === video.author.did;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  const notInterestedMutation = useMutation({
    mutationFn: async () => {
      await api.notInterested({ videoUri: video.uri });
    },
    onSuccess: () => {
      setIsHidden(true);
      toast.success('Video hidden from your feed');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: () => {
      toast.error('Failed to update preferences');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/xrpc/io.exprsn.video.delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoUri: video.uri }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete video');
      }
      return response.json();
    },
    onSuccess: () => {
      setIsDeleted(true);
      setShowDeleteConfirm(false);
      toast.success('Video deleted');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete video');
    },
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (isLiked && video.viewer?.likeUri) {
        await api.unlike(video.viewer.likeUri);
        return { liked: false };
      } else {
        await api.like(video.uri, video.cid);
        return { liked: true };
      }
    },
    onMutate: async () => {
      setIsLiked(!isLiked);
      setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
    },
    onError: () => {
      setIsLiked(isLiked);
      setLikeCount(video.likeCount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const handleLike = useCallback(() => {
    if (!user) {
      openLoginModal('Log in to like this video');
      return;
    }
    likeMutation.mutate();
  }, [user, likeMutation, openLoginModal]);

  const handleComment = useCallback(() => {
    setShowComments(true);
  }, []);

  const handleCollab = useCallback(() => {
    if (!user) {
      openLoginModal('Log in to create a collab');
      return;
    }
    setCollabLoopModal('collab');
  }, [user, openLoginModal]);

  const handleLoop = useCallback(() => {
    if (!user) {
      openLoginModal('Log in to create a loop');
      return;
    }
    setCollabLoopModal('loop');
  }, [user, openLoginModal]);

  const handleReport = useCallback(() => {
    if (!user) {
      openLoginModal('Log in to report this video');
      return;
    }
    setShowMoreMenu(false);
    setShowReportModal(true);
  }, [user, openLoginModal]);

  const handleNotInterested = useCallback(() => {
    if (!user) {
      openLoginModal('Log in to personalize your feed');
      return;
    }
    setShowMoreMenu(false);
    notInterestedMutation.mutate();
  }, [user, openLoginModal, notInterestedMutation]);

  const handleTip = useCallback(() => {
    if (!user) {
      openLoginModal('Log in to tip this creator');
      return;
    }
    setShowTipModal(true);
  }, [user, openLoginModal]);

  const handleDelete = useCallback(() => {
    setShowMoreMenu(false);
    setShowDeleteConfirm(true);
  }, []);

  // Hide video if marked as not interested or deleted
  if (isHidden || isDeleted) {
    return null;
  }

  return (
    <>
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5">
        {/* Author avatar */}
        <button className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden bg-gray-800">
            {video.author.avatar ? (
              <img
                src={video.author.avatar}
                alt={video.author.handle}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold">
                {video.author.handle[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs">+</span>
          </div>
        </button>

        {/* Like */}
        <button
          onClick={handleLike}
          className="flex flex-col items-center"
          disabled={likeMutation.isPending}
        >
          <div
            className={`p-2 rounded-full ${isLiked ? 'text-primary-500' : 'text-white'}`}
          >
            <HeartIcon filled={isLiked} className="w-8 h-8" />
          </div>
          <span className="text-xs text-white font-medium">
            {formatCount(likeCount)}
          </span>
        </button>

        {/* Reactions */}
        <ReactionPicker videoUri={video.uri} />

        {/* Comment */}
        <button onClick={handleComment} className="flex flex-col items-center">
          <div className="p-2 rounded-full text-white">
            <CommentIcon className="w-8 h-8" />
          </div>
          <span className="text-xs text-white font-medium">
            {formatCount(video.commentCount)}
          </span>
        </button>

        {/* Share */}
        <button onClick={share} className="flex flex-col items-center">
          <div className={`p-2 rounded-full ${shareState === 'shared' ? 'text-accent' : 'text-white'}`}>
            <ShareIcon className="w-8 h-8" />
          </div>
          <span className="text-xs text-white font-medium">
            {formatCount(shareCount)}
          </span>
        </button>

        {/* Collab */}
        <button onClick={handleCollab} className="flex flex-col items-center">
          <div className="p-2 rounded-full text-white">
            <CollabIcon className="w-8 h-8" />
          </div>
          <span className="text-xs text-white font-medium">Collab</span>
        </button>

        {/* Loop */}
        <button onClick={handleLoop} className="flex flex-col items-center">
          <div className="p-2 rounded-full text-white">
            <LoopIcon className="w-8 h-8" />
          </div>
          <span className="text-xs text-white font-medium">Loop</span>
        </button>

        {/* Tip */}
        <button onClick={handleTip} className="flex flex-col items-center">
          <div className="p-2 rounded-full text-white hover:text-yellow-400 transition-colors">
            <GiftIcon className="w-8 h-8" />
          </div>
          <span className="text-xs text-white font-medium">Tip</span>
        </button>

        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="flex flex-col items-center"
          >
            <div className="p-2 rounded-full text-white hover:text-gray-300 transition-colors">
              <MoreIcon className="w-7 h-7" />
            </div>
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 bottom-full mb-2 w-48 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden z-50">
              {isOwnVideo && (
                <button
                  onClick={handleDelete}
                  className="w-full px-4 py-3 text-left text-red-400 hover:bg-gray-800 flex items-center gap-3 transition-colors"
                >
                  <TrashIcon className="w-5 h-5" />
                  <span>Delete video</span>
                </button>
              )}
              <button
                onClick={handleNotInterested}
                disabled={notInterestedMutation.isPending}
                className="w-full px-4 py-3 text-left text-white hover:bg-gray-800 flex items-center gap-3 transition-colors"
              >
                <EyeOffIcon className="w-5 h-5" />
                <span>{notInterestedMutation.isPending ? 'Hiding...' : 'Not interested'}</span>
              </button>
              <button
                onClick={handleReport}
                className="w-full px-4 py-3 text-left text-white hover:bg-gray-800 flex items-center gap-3 transition-colors"
              >
                <FlagIcon className="w-5 h-5" />
                <span>Report</span>
              </button>
            </div>
          )}
        </div>

        {/* Sound */}
        {video.tags && video.tags.length > 0 && (
          <button className="w-10 h-10 rounded-full bg-gray-800 border-2 border-gray-600 overflow-hidden animate-spin-slow">
            <MusicIcon className="w-full h-full p-2 text-white" />
          </button>
        )}
      </div>

      {/* Comments modal */}
      {showComments && (
        <CommentThread
          videoUri={video.uri}
          onClose={() => setShowComments(false)}
        />
      )}

      {/* Collab/Loop modal */}
      {collabLoopModal && (
        <CollabLoopModal
          video={video}
          type={collabLoopModal}
          isOpen={true}
          onClose={() => setCollabLoopModal(null)}
        />
      )}

      {/* Report modal */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        contentType="video"
        contentUri={video.uri}
        contentCid={video.cid}
        contentPreview={{
          text: video.caption,
          thumbnail: video.video?.thumbnail || video.thumbnailUrl,
          authorHandle: video.author.handle,
        }}
      />

      {/* Tip modal */}
      <TipModal
        isOpen={showTipModal}
        onClose={() => setShowTipModal(false)}
        recipient={video.author}
        videoUri={video.uri}
      />

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-sm mx-4 border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-2">Delete Video?</h3>
            <p className="text-gray-400 mb-6">
              This will remove the video from your profile. You can restore it later from your account settings.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HeartIcon({
  filled,
  className,
}: {
  filled?: boolean;
  className?: string;
}) {
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

function CommentIcon({ className }: { className?: string }) {
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
        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
      />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
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
        d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
      />
    </svg>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function CollabIcon({ className }: { className?: string }) {
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
        d="M3 6h8v12H3zM13 6h8v12h-8z"
      />
    </svg>
  );
}

function LoopIcon({ className }: { className?: string }) {
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
        d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0 0L12 12m-2.879 2.879L19 5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7h7M3 17h7"
      />
    </svg>
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

function FlagIcon({ className }: { className?: string }) {
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
        d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
      />
    </svg>
  );
}

function GiftIcon({ className }: { className?: string }) {
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
        d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
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
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
