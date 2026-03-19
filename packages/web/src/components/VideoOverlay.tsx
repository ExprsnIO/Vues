'use client';

import { useState } from 'react';
import Link from 'next/link';
import { type VideoView } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { IdentityBadge } from '@/components/IdentityBadge';
import { SignatureBadge } from '@/components/SignatureBadge';

interface VideoOverlayProps {
  video: VideoView;
  followedTags?: string[];
  isFollowing?: boolean;
}

export function VideoOverlay({ video, followedTags = [], isFollowing = false }: VideoOverlayProps) {
  const [showWhyCard, setShowWhyCard] = useState(false);

  // Type guard for sound property
  const videoWithSound = video as VideoView & {
    sound?: {
      id: string;
      title: string;
      artist?: string;
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-20 p-4 pb-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent group">
      {/* Author info */}
      <div className="flex items-center gap-2 mb-2">
        <Link
          href={`/profile/${video.author.handle}`}
          className="flex items-center gap-2 hover:opacity-80"
        >
          <span className="font-semibold text-white">@{video.author.handle}</span>
          {video.author.displayName && (
            <span className="text-gray-300 text-sm truncate">
              {video.author.displayName}
            </span>
          )}
        </Link>
        <IdentityBadge did={video.author.did} size="sm" />
        {video.signature?.verified && (
          <SignatureBadge videoUri={video.uri} signed={true} verified={true} size="sm" />
        )}
        <button
          onClick={() => setShowWhyCard(!showWhyCard)}
          className="opacity-0 group-hover:opacity-70 transition-opacity text-white text-xs px-2 py-0.5 rounded-full bg-black/40 hover:opacity-100"
          aria-label="Why am I seeing this?"
        >
          Why?
        </button>
      </div>

      {/* Why this video explainer card */}
      {showWhyCard && (
        <div className="absolute bottom-24 left-4 right-16 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-xs text-white space-y-1.5 z-10">
          <p className="font-medium">Why you're seeing this</p>
          {video.tags?.some(t => followedTags.includes(t)) && (
            <p className="text-white/70">• You follow #{video.tags!.find(t => followedTags.includes(t))}</p>
          )}
          {isFollowing && (
            <p className="text-white/70">• You follow @{video.author.handle}</p>
          )}
          {!isFollowing && !video.tags?.some(t => followedTags.includes(t)) && (
            <p className="text-white/70">• Popular in your region</p>
          )}
          <p className="text-white/70">• {video.viewCount.toLocaleString()} views</p>
          <button
            onClick={() => setShowWhyCard(false)}
            className="text-accent text-xs mt-1 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Caption */}
      {video.caption && (
        <p className="text-white text-sm mb-2 line-clamp-2">{video.caption}</p>
      )}

      {/* Tags */}
      {video.tags && video.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {video.tags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              href={`/tag/${encodeURIComponent(tag)}`}
              className="text-sm text-white/90 hover:text-white"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* Sound attribution - clickable link to sound page */}
      {videoWithSound.sound && (
        <Link
          href={`/sound/${videoWithSound.sound.id}`}
          className="flex items-center gap-2 mt-2 group cursor-pointer"
        >
          <MusicIcon className="w-4 h-4 text-white animate-spin-slow" />
          <div className="flex-1 overflow-hidden">
            <p className="text-white text-sm truncate group-hover:underline">
              {videoWithSound.sound.artist
                ? `${videoWithSound.sound.title} - ${videoWithSound.sound.artist}`
                : videoWithSound.sound.title || `Original Sound - @${video.author.handle}`
              }
            </p>
          </div>
        </Link>
      )}

      {/* Timestamp */}
      <span className="text-xs text-gray-400 mt-2 block">
        {formatRelativeTime(video.createdAt)}
      </span>
    </div>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}
