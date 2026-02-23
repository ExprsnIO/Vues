'use client';

import { useRef, useCallback, useState, useMemo } from 'react';
import { useEditor } from '@/lib/editor-context';
import type { EditorElement, AudioTrack } from '@/lib/editor-context';
import { useBeatSnapping, formatBpm } from '@/hooks/useBeatSnapping';

export function EditorTimelineEnhanced() {
  const { state, dispatch, selectElement, setCurrentFrame, togglePlay } = useEditor();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);

  const { project, currentFrame, isPlaying, selectedElementIds, snapToBeats } = state;
  const { fps, duration, elements, audioTracks } = project;

  const pixelsPerFrame = 4 * timelineZoom;
  const totalWidth = duration * pixelsPerFrame;

  // Collect all beats from audio tracks
  const allBeats = useMemo(() => {
    const beats: { time: number; strength: number }[] = [];
    for (const track of audioTracks) {
      if (track.beats) {
        beats.push(...track.beats);
      }
    }
    // Sort by time
    return beats.sort((a, b) => a.time - b.time);
  }, [audioTracks]);

  // Use beat snapping hook
  const beatSnapping = useBeatSnapping({
    beats: allBeats,
    fps,
    snapThreshold: 5,
    enabled: snapToBeats,
  });

  // Check if current frame is on a beat
  const isOnBeat = beatSnapping.isSnappedToBeat(currentFrame);

  // Jump to next beat
  const jumpToNextBeat = useCallback(() => {
    const nextBeat = beatSnapping.getNextBeat(currentFrame);
    if (nextBeat) {
      setCurrentFrame(Math.round(nextBeat.time * fps));
    }
  }, [beatSnapping, currentFrame, fps, setCurrentFrame]);

  // Jump to previous beat
  const jumpToPreviousBeat = useCallback(() => {
    const prevBeat = beatSnapping.getPreviousBeat(currentFrame);
    if (prevBeat) {
      setCurrentFrame(Math.round(prevBeat.time * fps));
    }
  }, [beatSnapping, currentFrame, fps, setCurrentFrame]);

  // Handle timeline click to set frame
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0);
    let frame = Math.round(x / pixelsPerFrame);

    // Use beat snapping hook for consistent snap behavior
    frame = beatSnapping.snapFrame(frame);

    setCurrentFrame(Math.max(0, Math.min(duration - 1, frame)));
  }, [pixelsPerFrame, duration, beatSnapping, setCurrentFrame]);

  // Format frame to timecode
  const formatTimecode = useCallback((frame: number) => {
    const totalSeconds = frame / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = frame % fps;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }, [fps]);

  // Generate time markers
  const markers: { frame: number; label: string; major: boolean }[] = [];
  const markerInterval = Math.max(1, Math.floor(fps / timelineZoom));
  for (let f = 0; f <= duration; f += markerInterval) {
    const isMajor = f % (fps * 5) === 0;
    markers.push({
      frame: f,
      label: isMajor ? formatTimecode(f) : '',
      major: isMajor,
    });
  }

  return (
    <div className="h-56 bg-background-alt border-t border-border flex flex-col shrink-0">
      {/* Timeline Header / Controls */}
      <div className="h-10 border-b border-border flex items-center px-4 gap-4 shrink-0">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentFrame(0)}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="Go to start"
          >
            <SkipBackIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="Previous frame"
          >
            <StepBackIcon className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="p-2 bg-accent hover:bg-accent-hover text-white rounded-full transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setCurrentFrame(Math.min(duration - 1, currentFrame + 1))}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="Next frame"
          >
            <StepForwardIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentFrame(duration - 1)}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="Go to end"
          >
            <SkipForwardIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Beat navigation - only show if beats are available */}
        {allBeats.length > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1">
              <button
                onClick={jumpToPreviousBeat}
                className={`p-1.5 transition-colors ${snapToBeats ? 'text-yellow-500 hover:text-yellow-400' : 'text-text-muted hover:text-text-primary'}`}
                title="Previous beat"
                disabled={!beatSnapping.getPreviousBeat(currentFrame)}
              >
                <BeatBackIcon className="w-4 h-4" />
              </button>
              <button
                onClick={jumpToNextBeat}
                className={`p-1.5 transition-colors ${snapToBeats ? 'text-yellow-500 hover:text-yellow-400' : 'text-text-muted hover:text-text-primary'}`}
                title="Next beat"
                disabled={!beatSnapping.getNextBeat(currentFrame)}
              >
                <BeatForwardIcon className="w-4 h-4" />
              </button>
              {/* Beat indicator */}
              {isOnBeat && (
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="On beat" />
              )}
            </div>
          </>
        )}

        <div className="h-4 w-px bg-border" />

        {/* Current time display */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-text-primary">
            {formatTimecode(currentFrame)}
          </span>
          {/* BPM display */}
          {beatSnapping.estimatedBpm && (
            <span className="text-xs text-yellow-500/70">
              {formatBpm(beatSnapping.estimatedBpm)}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Timeline zoom */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Zoom</span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.25}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
            className="w-20 accent-accent"
          />
        </div>

        {/* Add track button */}
        <button className="px-3 py-1 text-xs bg-surface hover:bg-surface-hover text-text-primary rounded transition-colors">
          + Add Track
        </button>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Labels */}
        <div className="w-40 border-r border-border shrink-0 overflow-y-auto">
          {/* Video tracks */}
          {elements.length > 0 && (
            <div className="border-b border-border">
              <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase bg-surface/50">
                Video
              </div>
              {elements.map((el) => (
                <div
                  key={el.id}
                  onClick={() => selectElement(el.id)}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 ${
                    selectedElementIds.includes(el.id)
                      ? 'bg-accent/20 text-accent'
                      : 'text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  <ElementIcon type={el.type} className="w-3 h-3" />
                  <span className="truncate">{el.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Audio tracks */}
          {audioTracks.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase bg-surface/50">
                Audio
              </div>
              {audioTracks.map((track) => (
                <div
                  key={track.id}
                  className="px-3 py-2 text-sm text-text-primary hover:bg-surface-hover cursor-pointer transition-colors flex items-center gap-2"
                >
                  <AudioIcon className="w-3 h-3" />
                  <span className="truncate">{track.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({
                        type: 'UPDATE_AUDIO_TRACK',
                        id: track.id,
                        updates: { muted: !track.muted },
                      });
                    }}
                    className={`ml-auto ${track.muted ? 'text-red-500' : 'text-text-muted'}`}
                  >
                    {track.muted ? <MuteIcon className="w-3 h-3" /> : <VolumeIcon className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {elements.length === 0 && audioTracks.length === 0 && (
            <div className="px-3 py-6 text-center text-text-muted text-xs">
              No tracks
            </div>
          )}
        </div>

        {/* Timeline Ruler & Tracks */}
        <div ref={timelineRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            {/* Time Ruler */}
            <div
              className="h-6 border-b border-border relative bg-surface/30 cursor-pointer"
              onClick={handleTimelineClick}
            >
              {markers.map(({ frame, label, major }) => (
                <div
                  key={frame}
                  className="absolute top-0 h-full"
                  style={{ left: frame * pixelsPerFrame }}
                >
                  <div
                    className={`w-px ${major ? 'h-full bg-border' : 'h-2 bg-border/50'}`}
                  />
                  {label && (
                    <span className="absolute top-2 left-1 text-xs text-text-muted whitespace-nowrap">
                      {label}
                    </span>
                  )}
                </div>
              ))}

              {/* Playhead */}
              <div
                className="absolute top-0 w-0.5 h-full bg-accent z-10"
                style={{ left: currentFrame * pixelsPerFrame }}
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-accent rotate-45" />
              </div>
            </div>

            {/* Video Tracks */}
            {elements.map((el) => (
              <TrackRow
                key={el.id}
                element={el}
                pixelsPerFrame={pixelsPerFrame}
                isSelected={selectedElementIds.includes(el.id)}
                currentFrame={currentFrame}
                onClick={() => selectElement(el.id)}
              />
            ))}

            {/* Audio Tracks */}
            {audioTracks.map((track) => (
              <AudioTrackRow
                key={track.id}
                track={track}
                pixelsPerFrame={pixelsPerFrame}
                fps={fps}
                currentFrame={currentFrame}
                snapToBeats={snapToBeats}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Track Row
// ============================================================================

function TrackRow({
  element,
  pixelsPerFrame,
  isSelected,
  currentFrame,
  onClick,
}: {
  element: EditorElement;
  pixelsPerFrame: number;
  isSelected: boolean;
  currentFrame: number;
  onClick: () => void;
}) {
  const left = element.startFrame * pixelsPerFrame;
  const width = (element.endFrame - element.startFrame) * pixelsPerFrame;

  // Get keyframe positions
  const keyframeFrames = new Set<number>();
  Object.values(element.keyframes).forEach(kfs => {
    kfs.forEach(kf => keyframeFrames.add(kf.frame));
  });

  return (
    <div className="h-8 border-b border-border relative">
      {/* Track clip */}
      <div
        onClick={onClick}
        className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all ${
          isSelected
            ? 'bg-accent/40 border border-accent'
            : 'bg-surface-hover hover:bg-surface border border-border'
        }`}
        style={{ left, width }}
      >
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-primary truncate max-w-full pr-4">
          {element.name}
        </span>

        {/* Keyframe markers */}
        {Array.from(keyframeFrames).map((frame) => (
          <div
            key={frame}
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-500 rotate-45"
            style={{ left: (frame - element.startFrame) * pixelsPerFrame - 4 }}
          />
        ))}
      </div>

      {/* Playhead line */}
      <div
        className="absolute top-0 w-0.5 h-full bg-accent/50 pointer-events-none"
        style={{ left: currentFrame * pixelsPerFrame }}
      />
    </div>
  );
}

// ============================================================================
// Audio Track Row
// ============================================================================

function AudioTrackRow({
  track,
  pixelsPerFrame,
  fps,
  currentFrame,
  snapToBeats,
}: {
  track: AudioTrack;
  pixelsPerFrame: number;
  fps: number;
  currentFrame: number;
  snapToBeats: boolean;
}) {
  const left = track.startFrame * pixelsPerFrame;
  const width = (track.endFrame - track.startFrame) * pixelsPerFrame;

  return (
    <div className="h-12 border-b border-border relative">
      {/* Audio clip with waveform */}
      <div
        className={`absolute top-1 bottom-1 rounded bg-green-900/30 border border-green-700/50 overflow-hidden ${
          track.muted ? 'opacity-50' : ''
        }`}
        style={{ left, width }}
      >
        {/* Waveform visualization */}
        {track.waveformData && track.waveformData.length > 0 && (
          <div className="absolute inset-0 flex items-center">
            {track.waveformData.slice(0, Math.floor(width / 2)).map((peak, i) => (
              <div
                key={i}
                className="w-px bg-green-500"
                style={{ height: `${peak * 100}%` }}
              />
            ))}
          </div>
        )}

        {/* Beat markers */}
        {snapToBeats && track.beats && track.beats.map((beat, i) => {
          const beatFrame = Math.round(beat.time * fps);
          if (beatFrame < track.startFrame || beatFrame > track.endFrame) return null;
          return (
            <div
              key={i}
              className="absolute top-0 w-0.5 h-full bg-yellow-500/50"
              style={{
                left: (beatFrame - track.startFrame) * pixelsPerFrame,
                opacity: 0.3 + beat.strength * 0.7,
              }}
            />
          );
        })}

        {/* Track name */}
        <span className="absolute left-2 bottom-1 text-xs text-green-400 truncate">
          {track.name}
        </span>

        {/* BPM indicator */}
        {track.bpm && (
          <span className="absolute right-2 top-1 text-xs text-green-400/70">
            {Math.round(track.bpm)} BPM
          </span>
        )}
      </div>

      {/* Playhead line */}
      <div
        className="absolute top-0 w-0.5 h-full bg-accent/50 pointer-events-none"
        style={{ left: currentFrame * pixelsPerFrame }}
      />
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

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
      <path d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z" />
    </svg>
  );
}

function StepBackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 18l-8-6 8-6v12z" />
    </svg>
  );
}

function StepForwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 6l8 6-8 6V6z" />
    </svg>
  );
}

function BeatBackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6V6z" />
      <path d="M10 6l8 6-8 6V6z" />
      <circle cx="17" cy="12" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function BeatForwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6l8 6-8 6V6z" />
      <path d="M16 6h2v12h-2V6z" />
      <circle cx="5" cy="12" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function ElementIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'text') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 4v3h5.5v12h3V7H19V4H5z" />
      </svg>
    );
  }
  if (type === 'shape') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    );
  }
  if (type === 'image') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function AudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  );
}

function MuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}
