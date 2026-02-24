'use client';

import { useRef, useEffect, useCallback } from 'react';
import { WatchPartyPlaybackState, WatchPartyParticipant } from '@/lib/api';

interface PartyPlayerProps {
  playbackState: WatchPartyPlaybackState | null;
  participants: WatchPartyParticipant[];
  canControl: boolean;
  onPlay?: (position: number) => void;
  onPause?: (position: number) => void;
  onSeek?: (position: number) => void;
  onTimeUpdate?: (position: number) => void;
}

export function PartyPlayer({
  playbackState,
  participants,
  canControl,
  onPlay,
  onPause,
  onSeek,
  onTimeUpdate,
}: PartyPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSyncRef = useRef<number>(0);

  // Sync video state from playbackState
  useEffect(() => {
    if (!videoRef.current || !playbackState) return;

    const video = videoRef.current;
    const timeDiff = Math.abs(video.currentTime - playbackState.position);

    // Only sync if position difference is significant (> 2 seconds)
    if (timeDiff > 2) {
      video.currentTime = playbackState.position;
    }

    // Sync play/pause state
    if (playbackState.isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!playbackState.isPlaying && !video.paused) {
      video.pause();
    }
  }, [playbackState]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    onTimeUpdate?.(videoRef.current.currentTime);
  }, [onTimeUpdate]);

  const handlePlay = useCallback(() => {
    if (!canControl || !videoRef.current) return;
    onPlay?.(videoRef.current.currentTime);
  }, [canControl, onPlay]);

  const handlePause = useCallback(() => {
    if (!canControl || !videoRef.current) return;
    onPause?.(videoRef.current.currentTime);
  }, [canControl, onPause]);

  const handleSeeked = useCallback(() => {
    if (!canControl || !videoRef.current) return;
    onSeek?.(videoRef.current.currentTime);
  }, [canControl, onSeek]);

  const presentParticipants = participants.filter((p) => p.isPresent);

  return (
    <div className="flex-1 bg-black flex items-center justify-center relative">
      {playbackState?.videoUri ? (
        <video
          ref={videoRef}
          className="max-w-full max-h-full"
          src={playbackState.videoUri}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeeked={handleSeeked}
          controls={canControl}
          playsInline
        />
      ) : (
        <div className="text-center text-white">
          <VideoIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No video playing</p>
          {canControl && (
            <p className="text-sm opacity-75 mt-2">Add videos to the queue to get started</p>
          )}
        </div>
      )}

      {/* Sync indicator */}
      {!canControl && playbackState?.isPlaying && (
        <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 rounded text-white text-xs flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Synced
        </div>
      )}

      {/* Participant avatars */}
      <div className="absolute bottom-4 left-4 flex -space-x-2">
        {presentParticipants.slice(0, 5).map((p) => (
          <div
            key={p.userDid}
            className="w-8 h-8 rounded-full border-2 border-black overflow-hidden"
            title={p.user?.displayName || p.user?.handle}
          >
            {p.user?.avatar ? (
              <img src={p.user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-accent flex items-center justify-center text-text-inverse text-xs font-medium">
                {(p.user?.handle || 'U')[0].toUpperCase()}
              </div>
            )}
          </div>
        ))}
        {presentParticipants.length > 5 && (
          <div className="w-8 h-8 rounded-full border-2 border-black bg-surface-hover flex items-center justify-center text-text-primary text-xs font-medium">
            +{presentParticipants.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

export default PartyPlayer;
