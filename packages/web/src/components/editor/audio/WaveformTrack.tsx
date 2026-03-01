/**
 * WaveformTrack Component
 * Displays audio waveform visualization in the editor timeline
 *
 * Features:
 * - Zoom-responsive detail levels
 * - requestAnimationFrame optimized rendering
 * - Audio scrub preview on hover
 * - Loading skeleton animation
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

interface WaveformPeak {
  min: number;
  max: number;
}

interface Beat {
  time: number;
  strength: number;
}

interface WaveformTrackProps {
  soundId?: string;
  videoUri?: string;
  audioFile?: File;
  startTime: number;
  endTime: number;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  onBeatClick?: (beat: Beat) => void;
  onHoverTime?: (time: number | null) => void; // For audio scrub preview
  showBeats?: boolean;
  height?: number;
  color?: string;
  backgroundColor?: string;
  zoom?: number; // Timeline zoom level for responsive detail
  showScrubPreview?: boolean; // Show time preview on hover
}

export function WaveformTrack({
  soundId,
  videoUri,
  audioFile,
  startTime,
  endTime,
  duration,
  currentTime,
  isPlaying,
  onSeek,
  onBeatClick,
  onHoverTime,
  showBeats = true,
  height = 48,
  color = '#6366f1',
  backgroundColor = 'transparent',
  zoom = 1,
  showScrubPreview = true,
}: WaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [localPeaks, setLocalPeaks] = useState<WaveformPeak[]>([]);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Calculate target peaks based on zoom level
  const targetPeaks = useMemo(() => {
    // More peaks at higher zoom for more detail
    return Math.min(600, Math.max(100, Math.round(300 * zoom)));
  }, [zoom]);

  // Fetch waveform data from API with zoom-responsive detail level
  const { data: waveformData, isLoading: waveformLoading } = useQuery({
    queryKey: ['waveform', soundId, videoUri, startTime, endTime, targetPeaks],
    queryFn: async () => {
      if (!soundId && !videoUri) return null;

      const params = new URLSearchParams();
      if (soundId) params.set('soundId', soundId);
      if (videoUri) params.set('videoUri', videoUri);
      params.set('startTime', startTime.toString());
      params.set('endTime', endTime.toString());
      params.set('targetPeaks', targetPeaks.toString());

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.audio.getWaveform?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch waveform');
      }

      return response.json();
    },
    enabled: !!(soundId || videoUri),
    staleTime: 60000,
  });

  // Fetch beat markers
  const { data: beatData } = useQuery({
    queryKey: ['beats', soundId, videoUri, startTime, endTime],
    queryFn: async () => {
      if (!soundId && !videoUri) return null;

      const params = new URLSearchParams();
      if (soundId) params.set('soundId', soundId);
      if (videoUri) params.set('videoUri', videoUri);
      params.set('startTime', startTime.toString());
      params.set('endTime', endTime.toString());

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.audio.getBeats?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch beats');
      }

      return response.json();
    },
    enabled: !!(soundId || videoUri) && showBeats,
    staleTime: 60000,
  });

  // Analyze local audio file
  useEffect(() => {
    if (!audioFile) return;

    const analyzeFile = async () => {
      const audioContext = new AudioContext();
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get channel data
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const numPeaks = 300;
      const samplesPerPeak = Math.floor(channelData.length / numPeaks);

      const peaks: WaveformPeak[] = [];

      for (let i = 0; i < numPeaks; i++) {
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, channelData.length);

        let min = Infinity;
        let max = -Infinity;

        for (let j = start; j < end; j++) {
          const sample = channelData[j];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }

        peaks.push({ min, max });
      }

      setLocalPeaks(peaks);
      audioContext.close();
    };

    analyzeFile().catch(console.error);
  }, [audioFile]);

  // Get peaks from API data or local analysis
  const peaks = useMemo(() => {
    if (waveformData?.peaks) return waveformData.peaks;
    if (localPeaks.length > 0) return localPeaks;
    return [];
  }, [waveformData, localPeaks]);

  // Filter beats to visible range
  const visibleBeats = useMemo(() => {
    if (!beatData?.beats) return [];
    return (beatData.beats as Beat[]).filter(
      (b) => b.time >= startTime && b.time <= endTime
    );
  }, [beatData, startTime, endTime]);

  // Draw waveform with requestAnimationFrame optimization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width * dpr;
      const canvasHeight = height * dpr;

      canvas.width = width;
      canvas.height = canvasHeight;

      ctx.scale(dpr, dpr);

      // Clear
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, rect.width, height);

      if (peaks.length === 0) {
        // Draw animated loading skeleton
        const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
        const shimmerPos = (Date.now() % 2000) / 2000;
        gradient.addColorStop(Math.max(0, shimmerPos - 0.3), color + '20');
        gradient.addColorStop(shimmerPos, color + '40');
        gradient.addColorStop(Math.min(1, shimmerPos + 0.3), color + '20');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, height * 0.25, rect.width, height * 0.5);

        // Request next frame for animation if loading
        if (waveformLoading || (audioFile && localPeaks.length === 0)) {
          animationFrameRef.current = requestAnimationFrame(draw);
        }
        return;
      }

      // Draw waveform
      const barWidth = Math.max(1, rect.width / peaks.length);
      const centerY = height / 2;
      const gap = zoom > 2 ? 1 : 0.5; // More gap at higher zoom

      ctx.fillStyle = color;

      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i];
        const x = i * barWidth;

        // Scale peaks to fit height
        const minHeight = Math.abs(peak.min) * centerY;
        const maxHeight = Math.abs(peak.max) * centerY;

        // Draw symmetric bar with rounded tops at high zoom
        if (zoom > 2) {
          ctx.beginPath();
          const barW = barWidth - gap;
          ctx.roundRect(x, centerY - maxHeight, barW, maxHeight + minHeight, 1);
          ctx.fill();
        } else {
          ctx.fillRect(x, centerY - maxHeight, barWidth - gap, maxHeight + minHeight);
        }
      }

      // Draw beat markers
      if (showBeats && visibleBeats.length > 0) {
        ctx.fillStyle = '#f59e0b';

        for (const beat of visibleBeats) {
          const x = ((beat.time - startTime) / (endTime - startTime)) * rect.width;
          const markerHeight = height * (0.3 + beat.strength * 0.7);
          const markerY = (height - markerHeight) / 2;

          ctx.fillRect(x - 1, markerY, 2, markerHeight);
        }
      }

      // Draw hover preview line
      if (hoverX !== null && showScrubPreview) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(hoverX, 0);
        ctx.lineTo(hoverX, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw playhead
      if (currentTime >= startTime && currentTime <= endTime) {
        const playheadX =
          ((currentTime - startTime) / (endTime - startTime)) * rect.width;

        // Draw glow effect
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#fff';
        ctx.fillRect(playheadX - 1, 0, 2, height);
        ctx.shadowBlur = 0;
      }
    };

    // Use requestAnimationFrame for smooth rendering
    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [peaks, visibleBeats, currentTime, startTime, endTime, height, color, backgroundColor, showBeats, hoverX, showScrubPreview, zoom, waveformLoading, audioFile, localPeaks.length]);

  // Handle mouse move for scrub preview
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !showScrubPreview) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = startTime + (x / rect.width) * (endTime - startTime);

      setHoverX(x);
      setHoverTime(time);
      onHoverTime?.(time);
    },
    [startTime, endTime, showScrubPreview, onHoverTime]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    setHoverTime(null);
    onHoverTime?.(null);
  }, [onHoverTime]);

  // Handle click to seek
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      const time = startTime + progress * (endTime - startTime);

      onSeek(Math.max(startTime, Math.min(endTime, time)));
    },
    [onSeek, startTime, endTime]
  );

  // Handle beat click
  const handleBeatClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onBeatClick || !containerRef.current || visibleBeats.length === 0) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickTime = startTime + (x / rect.width) * (endTime - startTime);

      // Find nearest beat
      let nearestBeat = visibleBeats[0];
      let nearestDistance = Math.abs(clickTime - nearestBeat.time);

      for (const beat of visibleBeats) {
        const distance = Math.abs(clickTime - beat.time);
        if (distance < nearestDistance) {
          nearestBeat = beat;
          nearestDistance = distance;
        }
      }

      // Only trigger if click is close enough (within 0.1s)
      if (nearestDistance < 0.1) {
        e.stopPropagation();
        onBeatClick(nearestBeat);
      }
    },
    [onBeatClick, visibleBeats, startTime, endTime]
  );

  // Format time for display
  const formatTime = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative cursor-pointer"
      style={{ height }}
      onClick={handleClick}
      onDoubleClick={handleBeatClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: '100%', height }}
      />

      {/* Hover time tooltip */}
      {hoverTime !== null && showScrubPreview && hoverX !== null && (
        <div
          className="absolute -top-7 px-1.5 py-0.5 bg-black/90 rounded text-xs text-white font-mono pointer-events-none transform -translate-x-1/2 whitespace-nowrap z-10"
          style={{ left: hoverX }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Loading skeleton overlay */}
      {waveformLoading && !localPeaks.length && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-4 bg-white/30 rounded animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-6 bg-white/30 rounded animate-pulse" style={{ animationDelay: '100ms' }} />
            <div className="w-1 h-5 bg-white/30 rounded animate-pulse" style={{ animationDelay: '200ms' }} />
            <div className="w-1 h-7 bg-white/30 rounded animate-pulse" style={{ animationDelay: '300ms' }} />
            <div className="w-1 h-4 bg-white/30 rounded animate-pulse" style={{ animationDelay: '400ms' }} />
          </div>
        </div>
      )}

      {/* BPM display */}
      {beatData?.bpm && (
        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white font-mono">
          {Math.round(beatData.bpm)} BPM
        </div>
      )}

      {/* Current time display (optional, shows during playback) */}
      {isPlaying && currentTime >= startTime && currentTime <= endTime && (
        <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[10px] text-white font-mono">
          {formatTime(currentTime)}
        </div>
      )}
    </div>
  );
}

export default WaveformTrack;
