'use client';

import Link from 'next/link';
import { type VideoView } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

interface VideoOverlayProps {
  video: VideoView;
}

export function VideoOverlay({ video }: VideoOverlayProps) {
  // Type guard for sound property
  const videoWithSound = video as VideoView & {
    sound?: {
      id: string;
      title: string;
      artist?: string;
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-20 p-4 pb-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
      {/* Author info */}
      <Link
        href={`/profile/${video.author.handle}`}
        className="flex items-center gap-2 mb-2 hover:opacity-80"
      >
        <span className="font-semibold text-white">@{video.author.handle}</span>
        {video.author.displayName && (
          <span className="text-gray-300 text-sm truncate">
            {video.author.displayName}
          </span>
        )}
      </Link>

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
