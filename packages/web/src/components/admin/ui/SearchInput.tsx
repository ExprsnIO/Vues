'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  autoFocus?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showClear?: boolean;
  loading?: boolean;
  onSubmit?: () => void;
}

const sizeStyles = {
  sm: 'h-8 text-sm pl-8 pr-3',
  md: 'h-10 text-sm pl-10 pr-4',
  lg: 'h-12 text-base pl-11 pr-4',
};

const iconSizeStyles = {
  sm: 'w-4 h-4 left-2',
  md: 'w-5 h-5 left-3',
  lg: 'w-5 h-5 left-3.5',
};

export function SearchInput({
  value: controlledValue,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  autoFocus = false,
  className = '',
  size = 'md',
  showClear = true,
  loading = false,
  onSubmit,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync internal value with controlled value
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
    }
  }, [controlledValue]);

  const debouncedOnChange = useCallback(
    (value: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onChange(value);
      }, debounceMs);
    },
    [onChange, debounceMs]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    debouncedOnChange(newValue);
  };

  const handleClear = () => {
    setInternalValue('');
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      // Clear any pending debounce and submit immediately
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      onChange(internalValue);
      onSubmit();
    }
    if (e.key === 'Escape' && internalValue) {
      handleClear();
    }
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Search Icon */}
      <svg
        className={`absolute top-1/2 -translate-y-1/2 text-text-muted ${iconSizeStyles[size]}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`
          w-full bg-surface border border-border rounded-lg
          text-text-primary placeholder:text-text-muted
          focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
          transition-colors
          ${sizeStyles[size]}
          ${showClear && internalValue ? 'pr-10' : ''}
        `}
      />

      {/* Loading Spinner or Clear Button */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {loading && (
          <svg
            className="animate-spin h-4 w-4 text-text-muted"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {showClear && internalValue && !loading && (
          <button
            onClick={handleClear}
            className="p-0.5 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Clear search"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// Keyboard shortcut indicator for search
interface SearchWithShortcutProps extends SearchInputProps {
  shortcut?: string;
}

export function SearchWithShortcut({
  shortcut = '/',
  ...props
}: SearchWithShortcutProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === shortcut &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcut]);

  return (
    <div className="relative">
      <SearchInput {...props} />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-text-muted bg-surface-hover rounded border border-border">
        {shortcut}
      </kbd>
    </div>
  );
}
