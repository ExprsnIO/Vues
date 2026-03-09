'use client';

import { useState, useRef, useEffect } from 'react';

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: DateRangePreset[];
  placeholder?: string;
  className?: string;
}

interface DateRangePreset {
  label: string;
  getValue: () => DateRange;
}

const defaultPresets: DateRangePreset[] = [
  {
    label: 'Today',
    getValue: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start: today, end };
    },
  },
  {
    label: 'Yesterday',
    getValue: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const end = new Date(yesterday);
      end.setHours(23, 59, 59, 999);
      return { start: yesterday, end };
    },
  },
  {
    label: 'Last 7 days',
    getValue: () => {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
  {
    label: 'Last 30 days',
    getValue: () => {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
  {
    label: 'Last 90 days',
    getValue: () => {
      const start = new Date();
      start.setDate(start.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
  {
    label: 'This month',
    getValue: () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
  {
    label: 'Last month',
    getValue: () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
];

export function DateRangePicker({
  value,
  onChange,
  presets = defaultPresets,
  placeholder = 'Select date range',
  className = '',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempStart, setTempStart] = useState<string>('');
  const [tempEnd, setTempEnd] = useState<string>('');
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
    setTempStart(value.start ? formatDateInput(value.start) : '');
    setTempEnd(value.end ? formatDateInput(value.end) : '');
  }, [value]);

  const formatDateInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const formatDateDisplay = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleApply = () => {
    const start = tempStart ? new Date(tempStart + 'T00:00:00') : null;
    const end = tempEnd ? new Date(tempEnd + 'T23:59:59') : null;
    onChange({ start, end });
    setIsOpen(false);
  };

  const handlePresetClick = (preset: DateRangePreset) => {
    const range = preset.getValue();
    onChange(range);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ start: null, end: null });
    setTempStart('');
    setTempEnd('');
  };

  const displayValue = () => {
    if (value.start && value.end) {
      return `${formatDateDisplay(value.start)} - ${formatDateDisplay(value.end)}`;
    }
    if (value.start) {
      return `From ${formatDateDisplay(value.start)}`;
    }
    if (value.end) {
      return `Until ${formatDateDisplay(value.end)}`;
    }
    return null;
  };

  const hasValue = value.start || value.end;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
          ${
            hasValue
              ? 'bg-accent/10 border-accent text-accent'
              : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
          }
        `}
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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span>{displayValue() || placeholder}</span>
        {hasValue && (
          <button
            onClick={handleClear}
            className="p-0.5 hover:bg-accent/20 rounded transition-colors"
            aria-label="Clear date range"
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
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Presets */}
          <div className="p-3 border-b border-border">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Quick select
            </div>
            <div className="flex flex-wrap gap-1">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className="px-2 py-1 text-xs bg-surface-hover hover:bg-border text-text-secondary hover:text-text-primary rounded transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom range */}
          <div className="p-3 space-y-3">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Custom range
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Start date
                </label>
                <input
                  type="date"
                  value={tempStart}
                  onChange={(e) => setTempStart(e.target.value)}
                  max={tempEnd || undefined}
                  className="w-full px-2 py-1.5 text-sm bg-surface-hover border border-border rounded text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  End date
                </label>
                <input
                  type="date"
                  value={tempEnd}
                  onChange={(e) => setTempEnd(e.target.value)}
                  min={tempStart || undefined}
                  className="w-full px-2 py-1.5 text-sm bg-surface-hover border border-border rounded text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 py-2 border-t border-border flex justify-end gap-2">
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
