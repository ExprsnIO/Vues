'use client';

import { useRef, useCallback, useState } from 'react';

interface EditorTimelineProps {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isPlaying: boolean;
  onFrameChange: (frame: number) => void;
  onPlayPause: () => void;
  onTotalFramesChange: (frames: number) => void;
}

interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'effect';
  clips: Clip[];
  muted: boolean;
  locked: boolean;
}

interface Clip {
  id: string;
  name: string;
  startFrame: number;
  endFrame: number;
  color: string;
}

const FRAME_WIDTH = 3;

const initialTracks: Track[] = [
  {
    id: 'video-1',
    name: 'Video 1',
    type: 'video',
    muted: false,
    locked: false,
    clips: [
      { id: 'clip-1', name: 'Main Video', startFrame: 0, endFrame: 150, color: '#6366f1' },
      { id: 'clip-2', name: 'B-Roll', startFrame: 180, endFrame: 280, color: '#8b5cf6' },
    ],
  },
  {
    id: 'text-1',
    name: 'Text',
    type: 'text',
    muted: false,
    locked: false,
    clips: [
      { id: 'clip-3', name: 'Title', startFrame: 30, endFrame: 120, color: '#ec4899' },
    ],
  },
  {
    id: 'audio-1',
    name: 'Audio',
    type: 'audio',
    muted: false,
    locked: false,
    clips: [
      { id: 'clip-4', name: 'Background Music', startFrame: 0, endFrame: 300, color: '#10b981' },
    ],
  },
];

export function EditorTimeline({
  currentFrame,
  totalFrames,
  fps,
  isPlaying,
  onFrameChange,
  onPlayPause,
}: EditorTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [tracks] = useState<Track[]>(initialTracks);
  const [timelineZoom, setTimelineZoom] = useState(1);

  const formatTime = useCallback(
    (frame: number) => {
      const totalSeconds = frame / fps;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    },
    [fps]
  );

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.round(x / (FRAME_WIDTH * timelineZoom));
      onFrameChange(Math.max(0, Math.min(frame, totalFrames - 1)));
    },
    [totalFrames, onFrameChange, timelineZoom]
  );

  // Generate time markers
  const markers = [];
  const markerInterval = fps; // One marker per second
  for (let i = 0; i <= totalFrames; i += markerInterval) {
    markers.push(i);
  }

  return (
    <div className="h-48 bg-background-alt border-t border-border flex flex-col shrink-0">
      {/* Transport Controls */}
      <div className="h-10 border-b border-border flex items-center px-4 gap-2 shrink-0">
        <button
          onClick={() => onFrameChange(0)}
          className="p-1.5 rounded hover:bg-surface text-text-muted hover:text-text-primary transition-colors"
          title="Go to start (Home)"
        >
          <SkipBackIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => onFrameChange(Math.max(0, currentFrame - 1))}
          className="p-1.5 rounded hover:bg-surface text-text-muted hover:text-text-primary transition-colors"
          title="Previous frame (←)"
        >
          <StepBackIcon className="w-4 h-4" />
        </button>
        <button
          onClick={onPlayPause}
          className="p-2 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors"
          title="Play/Pause (Space)"
        >
          {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onFrameChange(Math.min(totalFrames - 1, currentFrame + 1))}
          className="p-1.5 rounded hover:bg-surface text-text-muted hover:text-text-primary transition-colors"
          title="Next frame (→)"
        >
          <StepForwardIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => onFrameChange(totalFrames - 1)}
          className="p-1.5 rounded hover:bg-surface text-text-muted hover:text-text-primary transition-colors"
          title="Go to end (End)"
        >
          <SkipForwardIcon className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-border mx-2" />

        {/* Timecode display */}
        <div className="font-mono text-sm text-text-primary bg-surface rounded px-2 py-1">
          {formatTime(currentFrame)}
        </div>

        <div className="flex-1" />

        {/* Timeline zoom */}
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span>Zoom:</span>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
            className="w-24 accent-accent"
          />
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Labels */}
        <div className="w-36 border-r border-border flex flex-col shrink-0">
          <div className="h-6 border-b border-border" /> {/* Header spacer */}
          {tracks.map((track) => (
            <div
              key={track.id}
              className="h-10 border-b border-border px-2 flex items-center gap-2"
            >
              <TrackIcon type={track.type} className="w-4 h-4 text-text-muted" />
              <span className="text-xs text-text-primary truncate flex-1">{track.name}</span>
              <button
                className={`p-1 rounded ${track.muted ? 'text-red-500' : 'text-text-muted hover:text-text-primary'}`}
                title={track.muted ? 'Unmute' : 'Mute'}
              >
                {track.muted ? <MuteIcon className="w-3 h-3" /> : <VolumeIcon className="w-3 h-3" />}
              </button>
              <button
                className={`p-1 rounded ${track.locked ? 'text-yellow-500' : 'text-text-muted hover:text-text-primary'}`}
                title={track.locked ? 'Unlock' : 'Lock'}
              >
                {track.locked ? <LockIcon className="w-3 h-3" /> : <UnlockIcon className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>

        {/* Timeline Tracks */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={timelineRef}>
          <div
            className="relative"
            style={{ width: totalFrames * FRAME_WIDTH * timelineZoom }}
            onClick={handleTimelineClick}
          >
            {/* Time Ruler */}
            <div className="h-6 border-b border-border relative bg-surface/50">
              {markers.map((frame) => (
                <div
                  key={frame}
                  className="absolute top-0 h-full flex flex-col items-center"
                  style={{ left: frame * FRAME_WIDTH * timelineZoom }}
                >
                  <span className="text-[10px] text-text-muted">{formatTime(frame)}</span>
                  <div className="flex-1 w-px bg-border" />
                </div>
              ))}
            </div>

            {/* Tracks */}
            {tracks.map((track) => (
              <div
                key={track.id}
                className="h-10 border-b border-border relative"
              >
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="absolute top-1 h-8 rounded cursor-pointer hover:brightness-110 transition-all flex items-center px-2 overflow-hidden"
                    style={{
                      left: clip.startFrame * FRAME_WIDTH * timelineZoom,
                      width: (clip.endFrame - clip.startFrame) * FRAME_WIDTH * timelineZoom,
                      backgroundColor: clip.color,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-xs text-white font-medium truncate">{clip.name}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
              style={{ left: currentFrame * FRAME_WIDTH * timelineZoom }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-sm rotate-45" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case 'video':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
      );
    case 'audio':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
        </svg>
      );
    case 'text':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      );
  }
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function SkipBackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function SkipForwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
    </svg>
  );
}

function StepBackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function StepForwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6-8.5-6z" />
    </svg>
  );
}

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  );
}

function MuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function UnlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
