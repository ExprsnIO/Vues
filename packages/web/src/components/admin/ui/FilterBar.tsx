'use client';

import { ReactNode, useState } from 'react';
import { FilterDropdown } from './FilterDropdown';
import { FilterPresets } from './FilterPresets';
import { UseAdminFiltersReturn } from '@/hooks/useAdminFilters';

interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  searchable?: boolean;
  multiple?: boolean;
}

interface FilterBarProps {
  filters: UseAdminFiltersReturn;
  filterConfig: FilterConfig[];
  showSearch?: boolean;
  searchPlaceholder?: string;
  actions?: ReactNode;
  className?: string;
  pageKey?: string; // For filter presets
  showPresets?: boolean;
}

export function FilterBar({
  filters,
  filterConfig,
  showSearch = true,
  searchPlaceholder = 'Search...',
  actions,
  className = '',
  pageKey,
  showPresets = true,
}: FilterBarProps) {
  const [searchValue, setSearchValue] = useState(filters.search);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    filters.setSearch(searchValue);
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    // Debounce search updates
    const timeoutId = setTimeout(() => {
      filters.setSearch(value);
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Search Input */}
      {showSearch && (
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-4 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/50"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => {
                  setSearchValue('');
                  filters.setSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-primary transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      )}

      {/* Filter Dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        {filterConfig.map((config) => (
          <FilterDropdown
            key={config.key}
            label={config.label}
            options={config.options}
            value={filters.filters[config.key] || []}
            onChange={(values) => filters.setFilter(config.key, values)}
            multiple={config.multiple ?? true}
            searchable={config.searchable}
          />
        ))}

        {/* Filter Presets */}
        {showPresets && pageKey && (
          <FilterPresets pageKey={pageKey} filters={filters} />
        )}

        {/* Clear All Button */}
        {filters.hasActiveFilters && (
          <button
            onClick={filters.clearAll}
            className="flex items-center gap-1 px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            <CloseIcon className="w-3.5 h-3.5" />
            Clear all
          </button>
        )}
      </div>

      {/* Actions Slot */}
      {actions && <div className="ml-auto">{actions}</div>}
    </div>
  );
}

// Compact version for tighter spaces
interface CompactFilterBarProps {
  filters: UseAdminFiltersReturn;
  filterConfig: FilterConfig[];
  showSearch?: boolean;
  searchPlaceholder?: string;
}

export function CompactFilterBar({
  filters,
  filterConfig,
  showSearch = true,
  searchPlaceholder = 'Search...',
}: CompactFilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      {showSearch && (
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => filters.setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-40"
          />
        </div>
      )}

      {filterConfig.map((config) => (
        <FilterDropdown
          key={config.key}
          label={config.label}
          options={config.options}
          value={filters.filters[config.key] || []}
          onChange={(values) => filters.setFilter(config.key, values)}
          multiple={config.multiple ?? true}
          searchable={config.searchable}
        />
      ))}
    </div>
  );
}

// Active filter chips display
interface ActiveFilterChipsProps {
  filters: UseAdminFiltersReturn;
  filterConfig: FilterConfig[];
}

export function ActiveFilterChips({ filters, filterConfig }: ActiveFilterChipsProps) {
  const activeFilters: { key: string; value: string; label: string; filterLabel: string }[] = [];

  filterConfig.forEach((config) => {
    const values = filters.filters[config.key] || [];
    values.forEach((value) => {
      const option = config.options.find((o) => o.value === value);
      if (option) {
        activeFilters.push({
          key: config.key,
          value,
          label: option.label,
          filterLabel: config.label,
        });
      }
    });
  });

  if (activeFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-text-muted">Active filters:</span>
      {activeFilters.map((filter) => (
        <span
          key={`${filter.key}-${filter.value}`}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-accent/10 text-accent rounded-full"
        >
          <span className="text-accent/70">{filter.filterLabel}:</span>
          {filter.label}
          <button
            onClick={() => filters.toggleFilterValue(filter.key, filter.value)}
            className="p-0.5 hover:bg-accent/20 rounded-full transition-colors"
          >
            <CloseIcon className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <button
        onClick={filters.clearFilters}
        className="text-xs text-text-muted hover:text-text-primary transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
