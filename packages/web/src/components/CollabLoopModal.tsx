'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VideoView } from '@/lib/api';

interface CollabLoopModalProps {
  video: VideoView;
  type: 'collab' | 'loop';
  isOpen: boolean;
  onClose: () => void;
}

export function CollabLoopModal({ video, type, isOpen, onClose }: CollabLoopModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleStart = () => {
    // Navigate to the create page with the original video info
    const params = new URLSearchParams({
      original: video.uri,
      type,
    });
    router.push(`/create/${type}?${params}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-background rounded-2xl p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-text-primary mb-4">
          {type === 'collab' ? 'Create a Collab' : 'Create a Loop'}
        </h2>

        <p className="text-text-muted mb-6">
          {type === 'collab'
            ? 'Record a video that plays side-by-side with this video.'
            : 'Use a clip from this video in your own creation.'}
        </p>

        {/* Original video preview */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-surface mb-6">
          {(video.video?.thumbnail || video.thumbnailUrl) ? (
            <img
              src={video.video?.thumbnail || video.thumbnailUrl}
              alt="Video thumbnail"
              className="w-16 h-24 rounded-lg object-cover"
            />
          ) : (
            <div className="w-16 h-24 rounded-lg bg-surface-hover flex items-center justify-center">
              <VideoIcon className="w-8 h-8 text-text-muted" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary truncate">
              {video.caption || 'Untitled video'}
            </p>
            <p className="text-sm text-text-muted truncate">
              @{video.author?.handle || 'unknown'}
            </p>
          </div>
        </div>

        {type === 'collab' && (
          <div className="mb-6">
            <p className="text-sm font-medium text-text-secondary mb-3">Layout options:</p>
            <div className="grid grid-cols-3 gap-2">
              <LayoutOption
                name="Side by side"
                icon={<SideBySideIcon className="w-6 h-6" />}
                selected
              />
              <LayoutOption
                name="React"
                icon={<ReactIcon className="w-6 h-6" />}
              />
              <LayoutOption
                name="Green screen"
                icon={<GreenScreenIcon className="w-6 h-6" />}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-border text-text-primary hover:bg-surface rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="flex-1 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            Start {type === 'collab' ? 'Collab' : 'Loop'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LayoutOption({
  name,
  icon,
  selected = false,
}: {
  name: string;
  icon: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <button
      className={`p-3 rounded-lg border text-center transition-colors ${
        selected
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border hover:bg-surface text-text-muted'
      }`}
    >
      <div className="flex justify-center mb-1">{icon}</div>
      <span className="text-xs">{name}</span>
    </button>
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

function SideBySideIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h8v12H3zM13 6h8v12h-8z" />
    </svg>
  );
}

function ReactIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18v12H3zM16 18h5v4h-5z" />
    </svg>
  );
}

function GreenScreenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18v16H3zM7 10h10v6H7z" />
    </svg>
  );
}
