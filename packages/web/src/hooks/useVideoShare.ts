'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, type VideoView } from '@/lib/api';
import type { User } from '@/lib/auth-context';

interface UseVideoShareOptions {
  video: VideoView | null;
  user: User | null;
  onShared?: () => void;
}

type ShareState = 'idle' | 'sharing' | 'shared';

const SHARED_STATE_TIMEOUT_MS = 2500;

export function useVideoShare({ video, user, onShared }: UseVideoShareOptions) {
  const [shareCount, setShareCount] = useState(video?.shareCount ?? 0);
  const [shareState, setShareState] = useState<ShareState>('idle');
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setShareCount(video?.shareCount ?? 0);
  }, [video?.shareCount, video?.uri]);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const markShared = useCallback(() => {
    setShareState('shared');
    if (resetTimeoutRef.current) {
      window.clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = window.setTimeout(() => {
      setShareState('idle');
    }, SHARED_STATE_TIMEOUT_MS);
  }, []);

  const trackShare = useCallback(async (platform: string) => {
    if (!user || !video) return;

    try {
      await api.trackShare(video.uri, platform);
      setShareCount((current) => current + 1);
    } catch (error) {
      console.error('Failed to track share:', error);
    }
  }, [user, video]);

  const share = useCallback(async () => {
    if (shareState === 'sharing' || !video) return;

    const shareParams = new URLSearchParams({ ref: 'share' });
    if (user?.handle) {
      shareParams.set('sharedBy', user.handle);
    }

    const shareUrl = `${window.location.origin}/video/${encodeURIComponent(video.uri)}?${shareParams.toString()}`;
    const shareTitle = video.caption || `Watch @${video.author.handle} on Exprsn`;
    const copyShareLink = async () => {
      await navigator.clipboard.writeText(shareUrl);
      await trackShare('copy_link');
      onShared?.();
      markShared();
      toast.success('Link copied');
    };

    setShareState('sharing');

    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: shareTitle,
            text: video.caption || `Watch @${video.author.handle} on Exprsn`,
            url: shareUrl,
          });
          await trackShare('native_share');
          onShared?.();
          markShared();
          toast.success('Shared');
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
        }
      }

      await copyShareLink();
    } catch {
      toast.error('Failed to share this video');
    } finally {
      setShareState((current) => (current === 'sharing' ? 'idle' : current));
    }
  }, [markShared, onShared, shareState, trackShare, user?.handle, video]);

  return {
    share,
    shareCount,
    shareState,
  };
}
