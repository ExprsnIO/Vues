'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  value?: string[];
  selected?: string[]; // Alias for value (backwards compatibility)
  onChange: (value: string[]) => void;
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  className?: string;
}

export function FilterDropdown({
  label,
  options,
  value: valueProp,
  selected,
  onChange,
  multiple = true,
  searchable = false,
  placeholder = 'Select...',
  className = '',
}: FilterDropdownProps) {
  // Support both value and selected props for backwards compatibility
  const value = valueProp ?? selected ?? [];
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
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

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleToggle = (optionValue: string) => {
    if (multiple) {
      if (value.includes(optionValue)) {
        onChange(value.filter((v) => v !== optionValue));
      } else {
        onChange([...value, optionValue]);
      }
    } else {
      onChange(value.includes(optionValue) ? [] : [optionValue]);
      setIsOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectedLabels = options
    .filter((opt) => value.includes(opt.value))
    .map((opt) => opt.label);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
          ${
            value.length > 0
              ? 'bg-accent/10 border-accent text-accent'
              : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
          }
        `}
      >
        <span>{label}</span>
        {value.length > 0 && (
          <>
            <span className="text-xs px-1.5 py-0.5 bg-accent/20 rounded-full">
              {value.length}
            </span>
            <button
              onClick={handleClear}
              className="p-0.5 hover:bg-accent/20 rounded transition-colors"
              aria-label="Clear filter"
            >
              <svg
                className="w-3 h-3"
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
          </>
        )}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-border">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-3 py-1.5 text-sm bg-surface-hover border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-text-muted text-center">
                No options found
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = value.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => handleToggle(option.value)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 text-sm text-left
                      hover:bg-surface-hover transition-colors
                      ${isSelected ? 'bg-accent/5' : ''}
                    `}
                  >
                    {multiple ? (
                      <span
                        className={`
                          w-4 h-4 rounded border flex items-center justify-center
                          ${
                            isSelected
                              ? 'bg-accent border-accent'
                              : 'border-border'
                          }
                        `}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </span>
                    ) : (
                      <span
                        className={`
                          w-4 h-4 rounded-full border flex items-center justify-center
                          ${
                            isSelected
                              ? 'border-accent'
                              : 'border-border'
                          }
                        `}
                      >
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-accent" />
                        )}
                      </span>
                    )}
                    {option.icon && (
                      <span className="text-text-muted">{option.icon}</span>
                    )}
                    <span
                      className={`flex-1 ${
                        isSelected ? 'text-text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {option.label}
                    </span>
                    {option.count !== undefined && (
                      <span className="text-xs text-text-muted">
                        {option.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {multiple && value.length > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <button
                onClick={() => onChange([])}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Simpler select dropdown for single selection
interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  disabled = false,
}: SelectDropdownProps) {
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

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2 text-sm
          bg-surface border border-border rounded-lg transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-border-hover'}
          ${isOpen ? 'border-accent ring-2 ring-accent/50' : ''}
        `}
      >
        <span className={selectedOption ? 'text-text-primary' : 'text-text-muted'}>
          {selectedOption?.label || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                  hover:bg-surface-hover transition-colors
                  ${value === option.value ? 'bg-accent/5 text-accent' : 'text-text-secondary'}
                `}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
