'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type VideoView } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { CommentThread } from './comments/CommentThread';

interface VideoActionsProps {
  video: VideoView;
}

export function VideoActions({ video }: VideoActionsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isLiked, setIsLiked] = useState(video.viewer?.liked ?? false);
  const [likeCount, setLikeCount] = useState(video.likeCount);
  const [showComments, setShowComments] = useState(false);

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
      // TODO: Show login modal
      return;
    }
    likeMutation.mutate();
  }, [user, likeMutation]);

  const handleComment = useCallback(() => {
    setShowComments(true);
  }, []);

  const handleShare = useCallback(async () => {
    const shareUrl = `${window.location.origin}/video/${encodeURIComponent(video.uri)}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: video.caption || 'Check out this video',
          url: shareUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      // TODO: Show toast
    }
  }, [video]);

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
        <button onClick={handleShare} className="flex flex-col items-center">
          <div className="p-2 rounded-full text-white">
            <ShareIcon className="w-8 h-8" />
          </div>
          <span className="text-xs text-white font-medium">
            {formatCount(video.shareCount)}
          </span>
        </button>

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
