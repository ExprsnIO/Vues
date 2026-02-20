'use client';

import { useMemo, useCallback } from 'react';

export interface Beat {
  time: number;
  strength: number;
}

export interface BeatSnappingOptions {
  beats: Beat[];
  fps: number;
  snapThreshold?: number; // frames
  enabled?: boolean;
}

export interface BeatSnappingResult {
  /** Snap a frame to the nearest beat if within threshold */
  snapFrame: (frame: number) => number;
  /** Get the nearest beat to a given frame */
  getNearestBeat: (frame: number) => Beat | null;
  /** Get the next beat after a given frame */
  getNextBeat: (frame: number) => Beat | null;
  /** Get the previous beat before a given frame */
  getPreviousBeat: (frame: number) => Beat | null;
  /** Check if a frame is snapped to a beat */
  isSnappedToBeat: (frame: number) => boolean;
  /** Get all beats as frame numbers */
  beatFrames: number[];
  /** Get the BPM (calculated from beats) */
  estimatedBpm: number | null;
}

/**
 * Hook for beat snapping functionality
 */
export function useBeatSnapping({
  beats,
  fps,
  snapThreshold = 5,
  enabled = true,
}: BeatSnappingOptions): BeatSnappingResult {
  // Convert beats to frame numbers
  const beatFrames = useMemo(() => {
    if (!beats || beats.length === 0) return [];
    return beats.map(b => Math.round(b.time * fps)).sort((a, b) => a - b);
  }, [beats, fps]);

  // Estimate BPM from beats
  const estimatedBpm = useMemo(() => {
    if (!beats || beats.length < 2) return null;

    // Calculate intervals between consecutive beats
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i].time - beats[i - 1].time);
    }

    // Find median interval (more robust than mean)
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];

    if (medianInterval <= 0) return null;

    // Convert interval to BPM
    return 60 / medianInterval;
  }, [beats]);

  // Get nearest beat to a frame
  const getNearestBeat = useCallback((frame: number): Beat | null => {
    if (!beats || beats.length === 0) return null;

    const targetTime = frame / fps;
    let nearest = beats[0];
    let nearestDistance = Math.abs(beats[0].time - targetTime);

    for (const beat of beats) {
      const distance = Math.abs(beat.time - targetTime);
      if (distance < nearestDistance) {
        nearest = beat;
        nearestDistance = distance;
      }
    }

    return nearest;
  }, [beats, fps]);

  // Get next beat after a frame
  const getNextBeat = useCallback((frame: number): Beat | null => {
    if (!beats || beats.length === 0) return null;

    const targetTime = frame / fps;
    for (const beat of beats) {
      if (beat.time > targetTime + 0.001) { // Small epsilon for floating point
        return beat;
      }
    }

    return null; // No next beat
  }, [beats, fps]);

  // Get previous beat before a frame
  const getPreviousBeat = useCallback((frame: number): Beat | null => {
    if (!beats || beats.length === 0) return null;

    const targetTime = frame / fps;
    let previous: Beat | null = null;

    for (const beat of beats) {
      if (beat.time < targetTime - 0.001) { // Small epsilon for floating point
        previous = beat;
      } else {
        break;
      }
    }

    return previous;
  }, [beats, fps]);

  // Snap frame to nearest beat if within threshold
  const snapFrame = useCallback((frame: number): number => {
    if (!enabled || beatFrames.length === 0) return frame;

    // Binary search for nearest beat frame
    let left = 0;
    let right = beatFrames.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (beatFrames[mid] < frame) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Check both candidates (left and left-1 if exists)
    const candidates: number[] = [];
    if (left < beatFrames.length) candidates.push(beatFrames[left]);
    if (left > 0) candidates.push(beatFrames[left - 1]);

    // Find closest within threshold
    let nearestBeatFrame = frame;
    let minDistance = snapThreshold + 1;

    for (const beatFrame of candidates) {
      const distance = Math.abs(beatFrame - frame);
      if (distance < minDistance) {
        minDistance = distance;
        nearestBeatFrame = beatFrame;
      }
    }

    return minDistance <= snapThreshold ? nearestBeatFrame : frame;
  }, [enabled, beatFrames, snapThreshold]);

  // Check if a frame is snapped to a beat
  const isSnappedToBeat = useCallback((frame: number): boolean => {
    if (beatFrames.length === 0) return false;
    return beatFrames.some(bf => Math.abs(bf - frame) < 1);
  }, [beatFrames]);

  return {
    snapFrame,
    getNearestBeat,
    getNextBeat,
    getPreviousBeat,
    isSnappedToBeat,
    beatFrames,
    estimatedBpm,
  };
}

/**
 * Format BPM for display
 */
export function formatBpm(bpm: number | null): string {
  if (bpm === null) return '--';
  return `${Math.round(bpm)} BPM`;
}

/**
 * Get beat strength class for styling
 */
export function getBeatStrengthClass(strength: number): string {
  if (strength > 0.8) return 'bg-yellow-400';
  if (strength > 0.5) return 'bg-yellow-500';
  return 'bg-yellow-600';
}
