'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { EditorElement } from '@/lib/editor-context';

// ============================================================================
// Types
// ============================================================================

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseSelectionRectangleOptions {
  elements: EditorElement[];
  pixelsPerFrame: number;
  trackHeight: number;
  headerHeight: number;
  onSelect: (elementIds: string[], additive: boolean) => void;
  enabled?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useSelectionRectangle({
  elements,
  pixelsPerFrame,
  trackHeight,
  headerHeight,
  onSelect,
  enabled = true,
}: UseSelectionRectangleOptions) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!enabled) return;

      // Only start selection on left click and directly on timeline (not on clips)
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target !== e.currentTarget && !target.classList.contains('selection-area')) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      startPosRef.current = { x, y };
      containerRef.current = e.currentTarget;
      setIsSelecting(true);
      setSelectionRect({ x, y, width: 0, height: 0 });
    },
    [enabled]
  );

  useEffect(() => {
    if (!isSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!startPosRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      const x = Math.min(startPosRef.current.x, currentX);
      const y = Math.min(startPosRef.current.y, currentY);
      const width = Math.abs(currentX - startPosRef.current.x);
      const height = Math.abs(currentY - startPosRef.current.y);

      setSelectionRect({ x, y, width, height });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!selectionRect || !containerRef.current) {
        setIsSelecting(false);
        setSelectionRect(null);
        startPosRef.current = null;
        return;
      }

      // Find elements that intersect with selection rectangle
      const selectedIds: string[] = [];

      elements.forEach((element, index) => {
        const elementLeft = element.startFrame * pixelsPerFrame;
        const elementRight = element.endFrame * pixelsPerFrame;
        const elementTop = headerHeight + index * trackHeight;
        const elementBottom = elementTop + trackHeight;

        // Check intersection
        const rectLeft = selectionRect.x;
        const rectRight = selectionRect.x + selectionRect.width;
        const rectTop = selectionRect.y;
        const rectBottom = selectionRect.y + selectionRect.height;

        const intersects =
          elementLeft < rectRight &&
          elementRight > rectLeft &&
          elementTop < rectBottom &&
          elementBottom > rectTop;

        if (intersects) {
          selectedIds.push(element.id);
        }
      });

      if (selectedIds.length > 0) {
        onSelect(selectedIds, e.shiftKey || e.ctrlKey || e.metaKey);
      }

      setIsSelecting(false);
      setSelectionRect(null);
      startPosRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting, selectionRect, elements, pixelsPerFrame, trackHeight, headerHeight, onSelect]);

  return {
    isSelecting,
    selectionRect,
    handleMouseDown,
  };
}

// ============================================================================
// Component
// ============================================================================

export function SelectionRectangle({ rect }: { rect: SelectionRect | null }) {
  if (!rect || rect.width < 5 || rect.height < 5) return null;

  return (
    <div
      className="absolute pointer-events-none border-2 border-accent bg-accent/10 z-30"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}

// ============================================================================
// Multi-Select Handler Component
// ============================================================================

export function MultiSelectArea({
  elements,
  pixelsPerFrame,
  trackHeight,
  headerHeight,
  onSelect,
  children,
}: {
  elements: EditorElement[];
  pixelsPerFrame: number;
  trackHeight: number;
  headerHeight: number;
  onSelect: (elementIds: string[], additive: boolean) => void;
  children: React.ReactNode;
}) {
  const { isSelecting, selectionRect, handleMouseDown } = useSelectionRectangle({
    elements,
    pixelsPerFrame,
    trackHeight,
    headerHeight,
    onSelect,
  });

  return (
    <div className="relative selection-area" onMouseDown={handleMouseDown}>
      {children}
      <SelectionRectangle rect={selectionRect} />
    </div>
  );
}
