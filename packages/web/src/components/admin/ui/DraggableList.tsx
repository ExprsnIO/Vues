'use client';

import { ReactNode } from 'react';
import { useDragReorder, DragReorderState } from '@/hooks/useDragReorder';

interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number, dragState: DragReorderState, dragHandleElement: ReactNode) => ReactNode;
  className?: string;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  onReorder,
  renderItem,
  className = '',
}: DraggableListProps<T>) {
  const [dragState, handlers] = useDragReorder({
    items,
    onReorder,
    keyExtractor,
  });

  return (
    <div className={`space-y-1 ${className}`} role="list">
      {items.map((item, index) => {
        const key = keyExtractor(item);
        const isDraggedItem = dragState.dragIndex === index;
        const isOverItem = dragState.overIndex === index;

        const dragHandle = (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Drag to reorder"
            {...handlers.getDragHandleProps(index)}
          >
            <DragHandleIcon className="w-4 h-4" />
          </button>
        );

        return (
          <div
            key={key}
            data-drag-item
            className={`
              relative transition-all duration-150
              ${isDraggedItem ? 'opacity-50 scale-[0.98]' : ''}
              ${isOverItem ? 'border-t-2 border-accent' : ''}
            `}
            {...handlers.getDropTargetProps(index)}
            {...handlers.getKeyboardHandlers(index)}
          >
            {renderItem(item, index, dragState, dragHandle)}
          </div>
        );
      })}
    </div>
  );
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h.01M8 10h.01M8 14h.01M8 18h.01M12 6h.01M12 10h.01M12 14h.01M12 18h.01" />
    </svg>
  );
}
