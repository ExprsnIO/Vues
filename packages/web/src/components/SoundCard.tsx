'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import type { SoundView } from '@/lib/api';
import { formatCount } from '@/lib/utils';

interface SoundCardProps {
  sound: SoundView;
  showPlayButton?: boolean;
}

export function SoundCard({ sound, showPlayButton = true }: SoundCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!sound.audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(sound.audioUrl);
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <Link
      href={`/sounds/${sound.id}`}
      className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-hover transition-colors group"
    >
      {/* Cover art */}
      <div className="relative w-16 h-16 rounded-lg bg-background overflow-hidden flex-shrink-0">
        {sound.coverUrl ? (
          <img
            src={sound.coverUrl}
            alt={sound.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-accent/20">
            <MusicNoteIcon className="w-8 h-8 text-accent" />
          </div>
        )}

        {/* Play button overlay */}
        {showPlayButton && sound.audioUrl && (
          <button
            onClick={handlePlayToggle}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isPlaying ? (
              <PauseIcon className="w-6 h-6 text-white" />
            ) : (
              <PlayIcon className="w-6 h-6 text-white" />
            )}
          </button>
        )}
      </div>

      {/* Sound info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-text-primary truncate">{sound.title}</h3>
        {sound.artist && (
          <p className="text-sm text-text-muted truncate">{sound.artist}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
          <span className="flex items-center gap-1">
            <VideoIcon className="w-4 h-4" />
            {formatCount(sound.useCount)} videos
          </span>
          {sound.duration && (
            <span>{formatDuration(sound.duration)}</span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ChevronRightIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
    </Link>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
