'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type ContentType = 'all' | 'videos' | 'users' | 'sounds' | 'tags';
export type Duration = 'all' | 'short' | 'medium' | 'long';
export type TimeRange = 'all' | 'today' | 'week' | 'month';
export type SortBy = 'relevance' | 'views' | 'recent';

export interface SearchFiltersState {
  contentType: ContentType;
  duration: Duration;
  timeRange: TimeRange;
  sortBy: SortBy;
}

interface SearchFiltersProps {
  filters: SearchFiltersState;
  onChange: (filters: SearchFiltersState) => void;
  showDuration?: boolean; // Only show for video searches
}

export function SearchFilters({ filters, onChange, showDuration = true }: SearchFiltersProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const updateFilter = <K extends keyof SearchFiltersState>(
    key: K,
    value: SearchFiltersState[K]
  ) => {
    onChange({ ...filters, [key]: value });
    setExpandedSection(null);
  };

  const hasActiveFilters =
    filters.contentType !== 'all' ||
    filters.duration !== 'all' ||
    filters.timeRange !== 'all' ||
    filters.sortBy !== 'relevance';

  const resetFilters = () => {
    onChange({
      contentType: 'all',
      duration: 'all',
      timeRange: 'all',
      sortBy: 'relevance',
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Content Type Filter */}
      <FilterDropdown
        label="Type"
        value={filters.contentType}
        options={[
          { value: 'all', label: 'All' },
          { value: 'videos', label: 'Videos' },
          { value: 'users', label: 'Users' },
          { value: 'sounds', label: 'Sounds' },
          { value: 'tags', label: 'Tags' },
        ]}
        onChange={(value) => updateFilter('contentType', value as ContentType)}
        isOpen={expandedSection === 'type'}
        onToggle={() => setExpandedSection(expandedSection === 'type' ? null : 'type')}
        icon={<TypeIcon />}
      />

      {/* Duration Filter (only for videos) */}
      {showDuration && (
        <FilterDropdown
          label="Duration"
          value={filters.duration}
          options={[
            { value: 'all', label: 'Any' },
            { value: 'short', label: 'Short (<30s)' },
            { value: 'medium', label: 'Medium (30s-3m)' },
            { value: 'long', label: 'Long (>3m)' },
          ]}
          onChange={(value) => updateFilter('duration', value as Duration)}
          isOpen={expandedSection === 'duration'}
          onToggle={() => setExpandedSection(expandedSection === 'duration' ? null : 'duration')}
          icon={<ClockIcon />}
        />
      )}

      {/* Time Range Filter */}
      <FilterDropdown
        label="Time"
        value={filters.timeRange}
        options={[
          { value: 'all', label: 'All Time' },
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'This Week' },
          { value: 'month', label: 'This Month' },
        ]}
        onChange={(value) => updateFilter('timeRange', value as TimeRange)}
        isOpen={expandedSection === 'time'}
        onToggle={() => setExpandedSection(expandedSection === 'time' ? null : 'time')}
        icon={<CalendarIcon />}
      />

      {/* Sort By Filter */}
      <FilterDropdown
        label="Sort"
        value={filters.sortBy}
        options={[
          { value: 'relevance', label: 'Relevance' },
          { value: 'views', label: 'Most Viewed' },
          { value: 'recent', label: 'Most Recent' },
        ]}
        onChange={(value) => updateFilter('sortBy', value as SortBy)}
        isOpen={expandedSection === 'sort'}
        onToggle={() => setExpandedSection(expandedSection === 'sort' ? null : 'sort')}
        icon={<SortIcon />}
      />

      {/* Reset Button */}
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="px-3 py-1.5 text-sm font-medium text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
        >
          <XIcon className="w-4 h-4" />
          Reset
        </button>
      )}
    </div>
  );
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
  isOpen,
  onToggle,
  icon,
}: FilterDropdownProps) {
  const selectedOption = options.find((opt) => opt.value === value);
  const isActive = value !== 'all' && value !== 'relevance';

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={cn(
          'px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2',
          isActive
            ? 'bg-accent text-white'
            : 'bg-surface text-text-primary hover:bg-surface-hover border border-border'
        )}
      >
        {icon && <span className="w-4 h-4">{icon}</span>}
        <span>{label}</span>
        <span className={cn('text-xs opacity-75', isActive && 'font-semibold')}>
          {selectedOption?.label}
        </span>
        <ChevronIcon className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-surface border border-border rounded-lg shadow-xl z-50 min-w-[150px] py-1">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                'w-full px-4 py-2 text-left text-sm transition-colors hover:bg-surface-hover',
                option.value === value
                  ? 'text-accent font-medium'
                  : 'text-text-primary'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Icons
function TypeIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
