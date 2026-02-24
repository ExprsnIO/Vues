'use client';

import { WatchPartyQueueItem, WatchPartyPlaybackState } from '@/lib/api';

interface PartyQueueProps {
  queue: WatchPartyQueueItem[];
  playbackState: WatchPartyPlaybackState | null;
  canControl: boolean;
  onClose: () => void;
  onNextVideo?: () => void;
  onRemoveItem?: (itemId: string) => void;
}

export function PartyQueue({
  queue,
  playbackState,
  canControl,
  onClose,
  onNextVideo,
  onRemoveItem,
}: PartyQueueProps) {
  const currentIndex = queue.findIndex(
    (item) => item.videoUri === playbackState?.videoUri
  );

  return (
    <div className="flex flex-col h-full">
      {/* Queue Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-text-primary">Queue</h2>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {queue.length === 0 ? (
          <div className="text-center py-8">
            <VideoIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">Queue is empty</p>
            {canControl && (
              <p className="text-sm text-text-muted mt-2">
                Add videos to get started
              </p>
            )}
          </div>
        ) : (
          queue.map((item, index) => (
            <QueueItem
              key={item.id}
              item={item}
              index={index}
              isPlaying={item.videoUri === playbackState?.videoUri}
              isPast={currentIndex >= 0 && index < currentIndex}
              canControl={canControl}
              onRemove={onRemoveItem ? () => onRemoveItem(item.id) : undefined}
            />
          ))
        )}
      </div>

      {/* Controls */}
      {canControl && queue.length > 1 && currentIndex < queue.length - 1 && (
        <div className="p-4 border-t border-border">
          <button
            onClick={onNextVideo}
            className="w-full px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
          >
            <NextIcon className="w-5 h-5" />
            Next Video
          </button>
        </div>
      )}
    </div>
  );
}

interface QueueItemProps {
  item: WatchPartyQueueItem;
  index: number;
  isPlaying: boolean;
  isPast: boolean;
  canControl: boolean;
  onRemove?: () => void;
}

function QueueItem({
  item,
  index,
  isPlaying,
  isPast,
  canControl,
  onRemove,
}: QueueItemProps) {
  return (
    <div
      className={`flex gap-3 p-2 rounded-lg transition-colors ${
        isPlaying
          ? 'bg-accent/10 border border-accent/30'
          : isPast
          ? 'opacity-50'
          : 'bg-surface-hover hover:bg-border'
      }`}
    >
      {/* Position */}
      <div className="text-text-muted font-medium w-6 text-center flex-shrink-0 pt-1">
        {isPlaying ? (
          <PlayingIcon className="w-4 h-4 text-accent" />
        ) : (
          index + 1
        )}
      </div>

      {/* Thumbnail */}
      {item.video?.thumbnail ? (
        <img
          src={item.video.thumbnail}
          alt=""
          className="w-16 h-10 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-10 rounded bg-surface flex items-center justify-center flex-shrink-0">
          <VideoIcon className="w-4 h-4 text-text-muted" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">
          {item.video?.caption || 'Video'}
        </p>
        <p className="text-xs text-text-muted">
          {item.video?.author?.displayName || item.video?.author?.handle || 'Unknown'}
        </p>
        {item.video?.duration && (
          <p className="text-xs text-text-muted">
            {formatDuration(item.video.duration)}
          </p>
        )}
      </div>

      {/* Remove button */}
      {canControl && onRemove && !isPlaying && (
        <button
          onClick={onRemove}
          className="text-text-muted hover:text-red-500 transition-colors flex-shrink-0"
        >
          <XIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function PlayingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function NextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  );
}

export default PartyQueue;
