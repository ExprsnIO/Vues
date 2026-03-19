'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

interface ActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  description?: string;
}

interface ActionMenuSection {
  title?: string;
  items: ActionMenuItem[];
}

interface ActionMenuProps {
  items: ActionMenuItem[] | ActionMenuSection[];
  trigger?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

function isActionMenuSection(
  item: ActionMenuItem | ActionMenuSection
): item is ActionMenuSection {
  return 'items' in item;
}

export function ActionMenu({
  items,
  trigger,
  align = 'right',
  className = '',
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleItemClick = (item: ActionMenuItem) => {
    if (!item.disabled) {
      item.onClick();
      setIsOpen(false);
    }
  };

  const renderItem = (item: ActionMenuItem, index: number) => {
    return (
      <button
        key={index}
        onClick={() => handleItemClick(item)}
        disabled={item.disabled}
        className={`
          w-full flex items-center gap-3 px-3 py-2 text-sm text-left
          transition-colors rounded-md
          ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover'}
          ${
            item.variant === 'danger'
              ? 'text-red-500 hover:bg-red-500/10'
              : 'text-text-secondary hover:text-text-primary'
          }
        `}
      >
        {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
        <div className="flex-1 min-w-0">
          <div>{item.label}</div>
          {item.description && (
            <div className="text-xs text-text-muted truncate">
              {item.description}
            </div>
          )}
        </div>
      </button>
    );
  };

  const renderSections = () => {
    const hasSections = items.length > 0 && isActionMenuSection(items[0]);

    if (hasSections) {
      return (items as ActionMenuSection[]).map((section, sectionIndex) => (
        <div
          key={sectionIndex}
          className={sectionIndex > 0 ? 'border-t border-border pt-1 mt-1' : ''}
        >
          {section.title && (
            <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
              {section.title}
            </div>
          )}
          {section.items.map((item, index) => renderItem(item, index))}
        </div>
      ));
    }

    return (items as ActionMenuItem[]).map((item, index) =>
      renderItem(item, index)
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
        aria-label="Open actions menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {trigger || (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`
            absolute top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-xl z-[9999] p-1
            ${align === 'right' ? 'right-0' : 'left-0'}
          `}
          style={{
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)'
          }}
        >
          {renderSections()}
        </div>
      )}
    </div>
  );
}

// Row action menu specifically styled for table rows
interface RowActionMenuProps {
  items: ActionMenuItem[];
  className?: string;
}

export function RowActionMenu({ items, className = '' }: RowActionMenuProps) {
  return (
    <ActionMenu
      items={items}
      align="right"
      className={className}
      trigger={
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
          />
        </svg>
      }
    />
  );
}
