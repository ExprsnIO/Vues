'use client';

import { useState, useCallback, useRef } from 'react';

export interface DragReparentState {
  isDragging: boolean;
  dragId: string | null;
  overId: string | null;
  isValidDrop: boolean;
}

export interface UseDragReparentOptions {
  /** Validate whether the drop target is valid (e.g., prevent circular references) */
  validateDrop: (dragId: string, targetId: string) => boolean;
  /** Called when an item is reparented */
  onReparent: (itemId: string, newParentId: string | null) => void;
  /** Get the IDs of all descendants of a node (to prevent circular drops) */
  getDescendantIds?: (id: string) => string[];
}

export interface DragReparentHandlers {
  getDragProps: (id: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
  getDropTargetProps: (id: string) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** Props for a "root" drop zone (reparent to top level) */
  getRootDropProps: () => {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

export function useDragReparent({
  validateDrop,
  onReparent,
  getDescendantIds,
}: UseDragReparentOptions): [DragReparentState, DragReparentHandlers] {
  const [state, setState] = useState<DragReparentState>({
    isDragging: false,
    dragId: null,
    overId: null,
    isValidDrop: false,
  });

  const dragIdRef = useRef<string | null>(null);

  const getDragProps = useCallback(
    (id: string) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-reparent-id', id);
        dragIdRef.current = id;
        setState({ isDragging: true, dragId: id, overId: null, isValidDrop: false });
      },
      onDragEnd: (_e: React.DragEvent) => {
        dragIdRef.current = null;
        setState({ isDragging: false, dragId: null, overId: null, isValidDrop: false });
      },
    }),
    []
  );

  const getDropTargetProps = useCallback(
    (id: string) => ({
      onDragOver: (e: React.DragEvent) => {
        const dragId = dragIdRef.current;
        if (!dragId || dragId === id) return;

        // Check for circular reference
        if (getDescendantIds) {
          const descendants = getDescendantIds(dragId);
          if (descendants.includes(id)) return;
        }

        if (validateDrop(dragId, id)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      },
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        const dragId = dragIdRef.current;
        if (!dragId || dragId === id) return;

        // Check for circular reference
        if (getDescendantIds) {
          const descendants = getDescendantIds(dragId);
          if (descendants.includes(id)) {
            setState((prev) => ({ ...prev, overId: id, isValidDrop: false }));
            return;
          }
        }

        const valid = validateDrop(dragId, id);
        setState((prev) => ({ ...prev, overId: id, isValidDrop: valid }));
      },
      onDragLeave: (_e: React.DragEvent) => {
        setState((prev) => (prev.overId === id ? { ...prev, overId: null, isValidDrop: false } : prev));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const dragId = dragIdRef.current;
        if (!dragId || dragId === id) return;

        if (validateDrop(dragId, id)) {
          onReparent(dragId, id);
        }

        dragIdRef.current = null;
        setState({ isDragging: false, dragId: null, overId: null, isValidDrop: false });
      },
    }),
    [validateDrop, onReparent, getDescendantIds]
  );

  const getRootDropProps = useCallback(
    () => ({
      onDragOver: (e: React.DragEvent) => {
        if (dragIdRef.current) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      },
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragIdRef.current) {
          setState((prev) => ({ ...prev, overId: '__root__', isValidDrop: true }));
        }
      },
      onDragLeave: (_e: React.DragEvent) => {
        setState((prev) => (prev.overId === '__root__' ? { ...prev, overId: null, isValidDrop: false } : prev));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const dragId = dragIdRef.current;
        if (dragId) {
          onReparent(dragId, null);
        }
        dragIdRef.current = null;
        setState({ isDragging: false, dragId: null, overId: null, isValidDrop: false });
      },
    }),
    [onReparent]
  );

  return [
    state,
    {
      getDragProps,
      getDropTargetProps,
      getRootDropProps,
    },
  ];
}
