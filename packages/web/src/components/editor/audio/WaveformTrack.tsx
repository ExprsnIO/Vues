/**
 * WaveformTrack Component
 * Displays audio waveform visualization in the editor timeline
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
  showBeats?: boolean;
  height?: number;
  color?: string;
  backgroundColor?: string;
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
  showBeats = true,
  height = 48,
  color = '#6366f1',
  backgroundColor = 'transparent',
}: WaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localPeaks, setLocalPeaks] = useState<WaveformPeak[]>([]);

  // Fetch waveform data from API
  const { data: waveformData, isLoading: waveformLoading } = useQuery({
    queryKey: ['waveform', soundId, videoUri, startTime, endTime],
    queryFn: async () => {
      if (!soundId && !videoUri) return null;

      const params = new URLSearchParams();
      if (soundId) params.set('soundId', soundId);
      if (videoUri) params.set('videoUri', videoUri);
      params.set('startTime', startTime.toString());
      params.set('endTime', endTime.toString());
      params.set('targetPeaks', '300');

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

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
      // Draw placeholder
      ctx.fillStyle = color + '30';
      ctx.fillRect(0, height * 0.3, rect.width, height * 0.4);
      return;
    }

    // Draw waveform
    const barWidth = rect.width / peaks.length;
    const centerY = height / 2;

    ctx.fillStyle = color;

    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i];
      const x = i * barWidth;

      // Scale peaks to fit height
      const minHeight = Math.abs(peak.min) * centerY;
      const maxHeight = Math.abs(peak.max) * centerY;

      // Draw symmetric bar
      ctx.fillRect(x, centerY - maxHeight, barWidth - 0.5, maxHeight + minHeight);
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

    // Draw playhead
    if (currentTime >= startTime && currentTime <= endTime) {
      const playheadX =
        ((currentTime - startTime) / (endTime - startTime)) * rect.width;

      ctx.fillStyle = '#fff';
      ctx.fillRect(playheadX - 1, 0, 2, height);
    }
  }, [peaks, visibleBeats, currentTime, startTime, endTime, height, color, backgroundColor, showBeats]);

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

  return (
    <div
      ref={containerRef}
      className="relative cursor-pointer"
      style={{ height }}
      onClick={handleClick}
      onDoubleClick={handleBeatClick}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: '100%', height }}
      />

      {/* Loading indicator */}
      {waveformLoading && !localPeaks.length && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* BPM display */}
      {beatData?.bpm && (
        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white font-mono">
          {Math.round(beatData.bpm)} BPM
        </div>
      )}
    </div>
  );
}

export default WaveformTrack;
