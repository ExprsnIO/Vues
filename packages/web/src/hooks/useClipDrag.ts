'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SnapResult } from './useTimelineSnapping';

// ============================================================================
// Types
// ============================================================================

export type DragMode = 'idle' | 'move' | 'trim-start' | 'trim-end';

export interface DragState {
  mode: DragMode;
  elementId: string | null;
  startX: number;
  startFrame: number;
  originalStartFrame: number;
  originalEndFrame: number;
  currentFrame: number;
  previewStartFrame: number;
  previewEndFrame: number;
  snapResult: SnapResult | null;
}

export interface UseClipDragOptions {
  pixelsPerFrame: number;
  minClipDuration: number; // Minimum frames for a clip
  onMove: (id: string, startFrame: number, endFrame: number) => void;
  onTrim: (id: string, startFrame: number, endFrame: number) => void;
  snapFrame: (frame: number) => SnapResult;
  snapRange: (startFrame: number, endFrame: number) => {
    start: SnapResult;
    end: SnapResult;
    preferredSnap: 'start' | 'end' | 'none';
  };
  updateSnapLines: (frame: number, isRange?: boolean, rangeEnd?: number) => void;
  clearSnapLines: () => void;
  onDragStart?: (id: string, mode: DragMode) => void;
  onDragEnd?: (id: string, mode: DragMode) => void;
}

export interface ClipDragHandlers {
  onMouseDown: (
    e: React.MouseEvent,
    elementId: string,
    startFrame: number,
    endFrame: number
  ) => void;
  getCursor: (
    e: React.MouseEvent,
    elementId: string,
    clipLeft: number,
    clipWidth: number
  ) => string;
}

// ============================================================================
// Constants
// ============================================================================

const TRIM_HANDLE_WIDTH = 8; // Pixels for trim handle hit area

// ============================================================================
// Hook
// ============================================================================

export function useClipDrag({
  pixelsPerFrame,
  minClipDuration,
  onMove,
  onTrim,
  snapFrame,
  snapRange,
  updateSnapLines,
  clearSnapLines,
  onDragStart,
  onDragEnd,
}: UseClipDragOptions): [DragState, ClipDragHandlers] {
  const [dragState, setDragState] = useState<DragState>({
    mode: 'idle',
    elementId: null,
    startX: 0,
    startFrame: 0,
    originalStartFrame: 0,
    originalEndFrame: 0,
    currentFrame: 0,
    previewStartFrame: 0,
    previewEndFrame: 0,
    snapResult: null,
  });

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // Determine drag mode based on mouse position
  const getDragMode = useCallback(
    (e: React.MouseEvent, clipLeft: number, clipWidth: number): DragMode => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const relativeX = x - clipLeft;

      // Check if clicking near start edge (trim start)
      if (relativeX <= TRIM_HANDLE_WIDTH) {
        return 'trim-start';
      }

      // Check if clicking near end edge (trim end)
      if (relativeX >= clipWidth - TRIM_HANDLE_WIDTH) {
        return 'trim-end';
      }

      // Otherwise, move
      return 'move';
    },
    []
  );

  // Get cursor based on position
  const getCursor = useCallback(
    (
      e: React.MouseEvent,
      elementId: string,
      clipLeft: number,
      clipWidth: number
    ): string => {
      // If already dragging, show appropriate cursor
      if (dragState.mode !== 'idle') {
        if (dragState.mode === 'move') return 'grabbing';
        return 'ew-resize';
      }

      const mode = getDragMode(e, clipLeft, clipWidth);
      switch (mode) {
        case 'trim-start':
        case 'trim-end':
          return 'ew-resize';
        case 'move':
          return 'grab';
        default:
          return 'default';
      }
    },
    [dragState.mode, getDragMode]
  );

  // Handle mouse down on clip
  const onMouseDown = useCallback(
    (
      e: React.MouseEvent,
      elementId: string,
      startFrame: number,
      endFrame: number
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      const clipLeft = startFrame * pixelsPerFrame;
      const clipWidth = (endFrame - startFrame) * pixelsPerFrame;

      const mode = getDragMode(e, clipLeft, clipWidth);
      const startX = e.clientX;
      const initialFrame = Math.round((e.clientX - rect.left + (e.currentTarget.parentElement?.scrollLeft || 0)) / pixelsPerFrame);

      setDragState({
        mode,
        elementId,
        startX,
        startFrame: initialFrame,
        originalStartFrame: startFrame,
        originalEndFrame: endFrame,
        currentFrame: initialFrame,
        previewStartFrame: startFrame,
        previewEndFrame: endFrame,
        snapResult: null,
      });

      onDragStart?.(elementId, mode);
    },
    [pixelsPerFrame, getDragMode, onDragStart]
  );

  // Handle mouse move (global)
  useEffect(() => {
    if (dragState.mode === 'idle') return;

    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (state.mode === 'idle' || !state.elementId) return;

      const deltaX = e.clientX - state.startX;
      const deltaFrames = Math.round(deltaX / pixelsPerFrame);
      const duration = state.originalEndFrame - state.originalStartFrame;

      let newStartFrame = state.originalStartFrame;
      let newEndFrame = state.originalEndFrame;
      let snapResult: SnapResult | null = null;

      switch (state.mode) {
        case 'move': {
          // Move entire clip
          const newStart = state.originalStartFrame + deltaFrames;
          const newEnd = state.originalEndFrame + deltaFrames;

          // Apply snapping
          const rangeSnap = snapRange(newStart, newEnd);

          if (rangeSnap.preferredSnap === 'start') {
            newStartFrame = rangeSnap.start.frame;
            newEndFrame = newStartFrame + duration;
            snapResult = rangeSnap.start;
            updateSnapLines(newStartFrame, true, newEndFrame);
          } else if (rangeSnap.preferredSnap === 'end') {
            newEndFrame = rangeSnap.end.frame;
            newStartFrame = newEndFrame - duration;
            snapResult = rangeSnap.end;
            updateSnapLines(newEndFrame, true, newStartFrame);
          } else {
            newStartFrame = newStart;
            newEndFrame = newEnd;
            updateSnapLines(newStart, true, newEnd);
          }

          // Clamp to valid range
          if (newStartFrame < 0) {
            newStartFrame = 0;
            newEndFrame = duration;
          }
          break;
        }

        case 'trim-start': {
          // Trim from start
          let newStart = state.originalStartFrame + deltaFrames;

          // Apply snapping
          const snap = snapFrame(newStart);
          if (snap.snapped) {
            newStart = snap.frame;
            snapResult = snap;
          }
          updateSnapLines(newStart);

          // Clamp to valid range
          newStartFrame = Math.max(0, Math.min(newStart, state.originalEndFrame - minClipDuration));
          newEndFrame = state.originalEndFrame;
          break;
        }

        case 'trim-end': {
          // Trim from end
          let newEnd = state.originalEndFrame + deltaFrames;

          // Apply snapping
          const snap = snapFrame(newEnd);
          if (snap.snapped) {
            newEnd = snap.frame;
            snapResult = snap;
          }
          updateSnapLines(newEnd);

          // Clamp to valid range
          newStartFrame = state.originalStartFrame;
          newEndFrame = Math.max(state.originalStartFrame + minClipDuration, newEnd);
          break;
        }
      }

      setDragState(prev => ({
        ...prev,
        currentFrame: state.startFrame + deltaFrames,
        previewStartFrame: newStartFrame,
        previewEndFrame: newEndFrame,
        snapResult,
      }));
    };

    const handleMouseUp = () => {
      const state = dragStateRef.current;
      if (state.mode === 'idle' || !state.elementId) return;

      // Apply the change
      if (state.mode === 'move') {
        onMove(state.elementId, state.previewStartFrame, state.previewEndFrame);
      } else {
        onTrim(state.elementId, state.previewStartFrame, state.previewEndFrame);
      }

      onDragEnd?.(state.elementId, state.mode);
      clearSnapLines();

      setDragState({
        mode: 'idle',
        elementId: null,
        startX: 0,
        startFrame: 0,
        originalStartFrame: 0,
        originalEndFrame: 0,
        currentFrame: 0,
        previewStartFrame: 0,
        previewEndFrame: 0,
        snapResult: null,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState.mode,
    pixelsPerFrame,
    minClipDuration,
    onMove,
    onTrim,
    snapFrame,
    snapRange,
    updateSnapLines,
    clearSnapLines,
    onDragEnd,
  ]);

  return [
    dragState,
    {
      onMouseDown,
      getCursor,
    },
  ];
}

// ============================================================================
// Helper: Check if dragging
// ============================================================================

export function isDragging(state: DragState): boolean {
  return state.mode !== 'idle';
}

export function isDraggingElement(state: DragState, elementId: string): boolean {
  return state.mode !== 'idle' && state.elementId === elementId;
}
