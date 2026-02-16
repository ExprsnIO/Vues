'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type CommentSortType } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SortSelectorProps {
  value: CommentSortType;
  onChange: (value: CommentSortType) => void;
}

const SORT_OPTIONS: { value: CommentSortType; label: string; description: string }[] = [
  { value: 'top', label: 'Top', description: 'Most liked comments' },
  { value: 'hot', label: 'Hot', description: 'Popular and recent' },
  { value: 'recent', label: 'Recent', description: 'Newest first' },
];

export function SortSelector({ value, onChange }: SortSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = SORT_OPTIONS.find((opt) => opt.value === value) || SORT_OPTIONS[0]!;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (newValue: CommentSortType) => {
      onChange(newValue);
      setIsOpen(false);
    },
    [onChange]
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-text-muted hover:text-text-primary text-sm font-medium rounded-lg hover:bg-surface transition-colors"
      >
        <SortIcon className="w-4 h-4" />
        <span>{currentOption.label}</span>
        <ChevronIcon className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full px-3 py-2 text-left hover:bg-surface transition-colors',
                value === option.value && 'bg-surface'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-sm font-medium',
                    value === option.value ? 'text-accent' : 'text-text-primary'
                  )}
                >
                  {option.label}
                </span>
                {value === option.value && <CheckIcon className="w-4 h-4 text-accent" />}
              </div>
              <p className="text-xs text-text-muted mt-0.5">{option.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
