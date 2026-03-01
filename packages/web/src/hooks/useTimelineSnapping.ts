'use client';

import { useMemo, useCallback, useState } from 'react';
import type { EditorElement, AudioTrack } from '@/lib/editor-context';

// ============================================================================
// Types
// ============================================================================

export interface SnapTarget {
  frame: number;
  type: 'clip-start' | 'clip-end' | 'playhead' | 'beat' | 'marker';
  elementId?: string;
  label?: string;
}

export interface SnapResult {
  snapped: boolean;
  frame: number;
  targets: SnapTarget[];
  delta: number;
}

export interface SnapLine {
  frame: number;
  type: SnapTarget['type'];
  active: boolean;
}

export interface UseTimelineSnappingOptions {
  elements: EditorElement[];
  audioTracks: AudioTrack[];
  currentFrame: number;
  fps: number;
  markers?: { frame: number; label: string; color: string }[];
  snapToClips: boolean;
  snapToBeats: boolean;
  snapToPlayhead: boolean;
  snapToMarkers: boolean;
  snapThreshold: number; // In frames
  excludeElementIds?: string[]; // Elements to exclude from snap targets (e.g., being dragged)
}

// ============================================================================
// Hook
// ============================================================================

export function useTimelineSnapping({
  elements,
  audioTracks,
  currentFrame,
  fps,
  markers = [],
  snapToClips,
  snapToBeats,
  snapToPlayhead,
  snapToMarkers,
  snapThreshold,
  excludeElementIds = [],
}: UseTimelineSnappingOptions) {
  const [activeSnapLines, setActiveSnapLines] = useState<SnapLine[]>([]);

  // Build all snap targets
  const snapTargets = useMemo<SnapTarget[]>(() => {
    const targets: SnapTarget[] = [];

    // Add playhead as snap target
    if (snapToPlayhead) {
      targets.push({
        frame: currentFrame,
        type: 'playhead',
        label: 'Playhead',
      });
    }

    // Add clip edges as snap targets
    if (snapToClips) {
      for (const element of elements) {
        if (excludeElementIds.includes(element.id)) continue;

        targets.push({
          frame: element.startFrame,
          type: 'clip-start',
          elementId: element.id,
          label: `${element.name} start`,
        });

        targets.push({
          frame: element.endFrame,
          type: 'clip-end',
          elementId: element.id,
          label: `${element.name} end`,
        });
      }

      // Add audio track edges
      for (const track of audioTracks) {
        targets.push({
          frame: track.startFrame,
          type: 'clip-start',
          label: `${track.name} start`,
        });

        targets.push({
          frame: track.endFrame,
          type: 'clip-end',
          label: `${track.name} end`,
        });
      }
    }

    // Add beat markers as snap targets
    if (snapToBeats) {
      for (const track of audioTracks) {
        if (!track.beats) continue;
        for (const beat of track.beats) {
          const beatFrame = Math.round(beat.time * fps);
          targets.push({
            frame: beatFrame,
            type: 'beat',
            label: `Beat (${Math.round(beat.strength * 100)}%)`,
          });
        }
      }
    }

    // Add project markers
    if (snapToMarkers) {
      for (const marker of markers) {
        targets.push({
          frame: marker.frame,
          type: 'marker',
          label: marker.label,
        });
      }
    }

    // Deduplicate targets at the same frame
    const seen = new Set<number>();
    return targets.filter(t => {
      if (seen.has(t.frame)) return false;
      seen.add(t.frame);
      return true;
    });
  }, [
    elements,
    audioTracks,
    currentFrame,
    fps,
    markers,
    snapToClips,
    snapToBeats,
    snapToPlayhead,
    snapToMarkers,
    excludeElementIds,
  ]);

  // Snap a frame to nearest target
  const snapFrame = useCallback(
    (frame: number): SnapResult => {
      let nearestTarget: SnapTarget | null = null;
      let nearestDistance = Infinity;
      const matchingTargets: SnapTarget[] = [];

      for (const target of snapTargets) {
        const distance = Math.abs(target.frame - frame);

        if (distance <= snapThreshold) {
          matchingTargets.push(target);

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestTarget = target;
          }
        }
      }

      if (nearestTarget) {
        return {
          snapped: true,
          frame: nearestTarget.frame,
          targets: matchingTargets,
          delta: nearestTarget.frame - frame,
        };
      }

      return {
        snapped: false,
        frame,
        targets: [],
        delta: 0,
      };
    },
    [snapTargets, snapThreshold]
  );

  // Snap both start and end frames (for moving clips)
  const snapRange = useCallback(
    (startFrame: number, endFrame: number): { start: SnapResult; end: SnapResult; preferredSnap: 'start' | 'end' | 'none' } => {
      const startSnap = snapFrame(startFrame);
      const endSnap = snapFrame(endFrame);

      // Prefer the snap with smaller delta
      let preferredSnap: 'start' | 'end' | 'none' = 'none';

      if (startSnap.snapped && endSnap.snapped) {
        preferredSnap = Math.abs(startSnap.delta) <= Math.abs(endSnap.delta) ? 'start' : 'end';
      } else if (startSnap.snapped) {
        preferredSnap = 'start';
      } else if (endSnap.snapped) {
        preferredSnap = 'end';
      }

      return { start: startSnap, end: endSnap, preferredSnap };
    },
    [snapFrame]
  );

  // Get snap lines for visual display (call during drag operations)
  const getSnapLines = useCallback(
    (frame: number, isRange = false, rangeEnd?: number): SnapLine[] => {
      const lines: SnapLine[] = [];
      const snapResult = snapFrame(frame);

      for (const target of snapTargets) {
        const distance = Math.abs(target.frame - frame);
        const inRange = isRange && rangeEnd !== undefined
          ? Math.abs(target.frame - rangeEnd) <= snapThreshold
          : false;

        if (distance <= snapThreshold || inRange) {
          lines.push({
            frame: target.frame,
            type: target.type,
            active: snapResult.snapped && snapResult.frame === target.frame,
          });
        }
      }

      return lines;
    },
    [snapTargets, snapFrame, snapThreshold]
  );

  // Update active snap lines (for visual feedback)
  const updateSnapLines = useCallback(
    (frame: number, isRange = false, rangeEnd?: number) => {
      setActiveSnapLines(getSnapLines(frame, isRange, rangeEnd));
    },
    [getSnapLines]
  );

  // Clear snap lines
  const clearSnapLines = useCallback(() => {
    setActiveSnapLines([]);
  }, []);

  // Find nearest snap target for preview
  const findNearestTarget = useCallback(
    (frame: number): SnapTarget | null => {
      let nearest: SnapTarget | null = null;
      let nearestDistance = Infinity;

      for (const target of snapTargets) {
        const distance = Math.abs(target.frame - frame);
        if (distance < nearestDistance && distance <= snapThreshold * 2) {
          nearestDistance = distance;
          nearest = target;
        }
      }

      return nearest;
    },
    [snapTargets, snapThreshold]
  );

  return {
    snapTargets,
    snapFrame,
    snapRange,
    getSnapLines,
    activeSnapLines,
    updateSnapLines,
    clearSnapLines,
    findNearestTarget,
  };
}

// ============================================================================
// Snap Line Colors
// ============================================================================

export function getSnapLineColor(type: SnapTarget['type']): string {
  switch (type) {
    case 'clip-start':
    case 'clip-end':
      return '#6366f1'; // Indigo - element edges
    case 'playhead':
      return '#ef4444'; // Red - playhead
    case 'beat':
      return '#eab308'; // Yellow - beats
    case 'marker':
      return '#22c55e'; // Green - markers
    default:
      return '#6366f1';
  }
}
