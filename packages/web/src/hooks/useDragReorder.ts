'use client';

import { useState, useCallback, useRef } from 'react';

export interface DragReorderState {
  isDragging: boolean;
  dragIndex: number | null;
  overIndex: number | null;
}

export interface UseDragReorderOptions<T> {
  items: T[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  keyExtractor: (item: T) => string;
}

export interface DragReorderHandlers {
  getDragHandleProps: (index: number) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    'aria-grabbed': boolean;
  };
  getDropTargetProps: (index: number) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    'aria-dropeffect': 'move';
  };
  getKeyboardHandlers: (index: number) => {
    onKeyDown: (e: React.KeyboardEvent) => void;
    tabIndex: number;
    role: string;
    'aria-roledescription': string;
  };
}

export function useDragReorder<T>({
  items,
  onReorder,
  keyExtractor,
}: UseDragReorderOptions<T>): [DragReorderState, DragReorderHandlers] {
  const [state, setState] = useState<DragReorderState>({
    isDragging: false,
    dragIndex: null,
    overIndex: null,
  });

  const dragIndexRef = useRef<number | null>(null);

  const getDragHandleProps = useCallback(
    (index: number) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));

        // Set a custom drag image with slight opacity
        const target = e.currentTarget as HTMLElement;
        const row = target.closest('[data-drag-item]') as HTMLElement | null;
        if (row) {
          e.dataTransfer.setDragImage(row, 0, 0);
        }

        dragIndexRef.current = index;
        setState({ isDragging: true, dragIndex: index, overIndex: null });
      },
      onDragEnd: (_e: React.DragEvent) => {
        dragIndexRef.current = null;
        setState({ isDragging: false, dragIndex: null, overIndex: null });
      },
      'aria-grabbed': state.dragIndex === index,
    }),
    [state.dragIndex]
  );

  const getDropTargetProps = useCallback(
    (index: number) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      },
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
          setState((prev) => ({ ...prev, overIndex: index }));
        }
      },
      onDragLeave: (_e: React.DragEvent) => {
        setState((prev) => (prev.overIndex === index ? { ...prev, overIndex: null } : prev));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const fromIndex = dragIndexRef.current;
        if (fromIndex !== null && fromIndex !== index) {
          onReorder(fromIndex, index);
        }
        dragIndexRef.current = null;
        setState({ isDragging: false, dragIndex: null, overIndex: null });
      },
      'aria-dropeffect': 'move' as 'move',
    }),
    [onReorder]
  );

  // Keyboard-based reordering (accessibility)
  const getKeyboardHandlers = useCallback(
    (index: number) => ({
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowUp' && index > 0) {
          e.preventDefault();
          onReorder(index, index - 1);
        } else if (e.key === 'ArrowDown' && index < items.length - 1) {
          e.preventDefault();
          onReorder(index, index + 1);
        }
      },
      tabIndex: 0,
      role: 'listitem',
      'aria-roledescription': 'sortable item',
    }),
    [items.length, onReorder]
  );

  return [
    state,
    {
      getDragHandleProps,
      getDropTargetProps,
      getKeyboardHandlers,
    },
  ];
}
