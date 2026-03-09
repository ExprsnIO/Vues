'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type SortDirection = 'asc' | 'desc' | null;

export interface UseAdminFiltersOptions {
  defaultSort?: { key: string; direction: SortDirection };
  defaultFilters?: Record<string, string[]>;
  syncWithUrl?: boolean;
}

export interface UseAdminFiltersReturn {
  sortKey: string | null;
  sortDirection: SortDirection;
  filters: Record<string, string[]>;
  search: string;
  setSort: (key: string, direction: SortDirection) => void;
  setFilter: (key: string, values: string[]) => void;
  toggleFilterValue: (key: string, value: string) => void;
  setSearch: (query: string) => void;
  clearAll: () => void;
  clearFilters: () => void;
  clearSort: () => void;
  hasActiveFilters: boolean;
  toQueryParams: () => URLSearchParams;
  applyPreset: (preset: { filters?: Record<string, string[]>; sort?: { key: string; direction: SortDirection } }) => void;
}

export function useAdminFilters(options: UseAdminFiltersOptions = {}): UseAdminFiltersReturn {
  const {
    defaultSort,
    defaultFilters = {},
    syncWithUrl = false,
  } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize state from URL params if syncing
  const getInitialState = () => {
    if (syncWithUrl && searchParams) {
      const sortKey = searchParams.get('sortKey');
      const sortDirection = searchParams.get('sortDir') as SortDirection;
      const search = searchParams.get('q') || '';

      // Parse filters from URL
      const filters: Record<string, string[]> = { ...defaultFilters };
      searchParams.forEach((value, key) => {
        if (key.startsWith('filter_')) {
          const filterKey = key.replace('filter_', '');
          filters[filterKey] = value.split(',');
        }
      });

      return {
        sortKey: sortKey || defaultSort?.key || null,
        sortDirection: sortDirection || defaultSort?.direction || null,
        filters,
        search,
      };
    }

    return {
      sortKey: defaultSort?.key || null,
      sortDirection: defaultSort?.direction || null,
      filters: defaultFilters,
      search: '',
    };
  };

  const [sortKey, setSortKey] = useState<string | null>(() => getInitialState().sortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => getInitialState().sortDirection);
  const [filters, setFilters] = useState<Record<string, string[]>>(() => getInitialState().filters);
  const [search, setSearchState] = useState<string>(() => getInitialState().search);

  // Sync to URL when state changes
  useEffect(() => {
    if (!syncWithUrl) return;

    const params = new URLSearchParams();

    if (sortKey) params.set('sortKey', sortKey);
    if (sortDirection) params.set('sortDir', sortDirection);
    if (search) params.set('q', search);

    Object.entries(filters).forEach(([key, values]) => {
      if (values.length > 0) {
        params.set(`filter_${key}`, values.join(','));
      }
    });

    const queryString = params.toString();
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

    router.replace(newUrl, { scroll: false });
  }, [syncWithUrl, sortKey, sortDirection, filters, search, pathname, router]);

  const setSort = useCallback((key: string, direction: SortDirection) => {
    setSortKey(direction ? key : null);
    setSortDirection(direction);
  }, []);

  const setFilter = useCallback((key: string, values: string[]) => {
    setFilters((prev) => ({
      ...prev,
      [key]: values,
    }));
  }, []);

  const toggleFilterValue = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const current = prev[key] || [];
      const newValues = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return {
        ...prev,
        [key]: newValues,
      };
    });
  }, []);

  const setSearch = useCallback((query: string) => {
    setSearchState(query);
  }, []);

  const clearAll = useCallback(() => {
    setSortKey(defaultSort?.key || null);
    setSortDirection(defaultSort?.direction || null);
    setFilters(defaultFilters);
    setSearchState('');
  }, [defaultSort, defaultFilters]);

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, [defaultFilters]);

  const clearSort = useCallback(() => {
    setSortKey(defaultSort?.key || null);
    setSortDirection(defaultSort?.direction || null);
  }, [defaultSort]);

  const hasActiveFilters = useMemo(() => {
    const hasFilters = Object.values(filters).some((v) => v.length > 0);
    const hasSearch = search.length > 0;
    const hasSort = sortKey !== (defaultSort?.key || null) || sortDirection !== (defaultSort?.direction || null);
    return hasFilters || hasSearch || hasSort;
  }, [filters, search, sortKey, sortDirection, defaultSort]);

  const toQueryParams = useCallback(() => {
    const params = new URLSearchParams();

    if (sortKey) params.set('sort', sortKey);
    if (sortDirection) params.set('order', sortDirection);
    if (search) params.set('q', search);

    Object.entries(filters).forEach(([key, values]) => {
      if (values.length > 0) {
        params.set(key, values.join(','));
      }
    });

    return params;
  }, [sortKey, sortDirection, filters, search]);

  const applyPreset = useCallback((preset: { filters?: Record<string, string[]>; sort?: { key: string; direction: SortDirection } }) => {
    if (preset.filters) {
      setFilters({ ...defaultFilters, ...preset.filters });
    }
    if (preset.sort) {
      setSortKey(preset.sort.key);
      setSortDirection(preset.sort.direction);
    }
  }, [defaultFilters]);

  return {
    sortKey,
    sortDirection,
    filters,
    search,
    setSort,
    setFilter,
    toggleFilterValue,
    setSearch,
    clearAll,
    clearFilters,
    clearSort,
    hasActiveFilters,
    toQueryParams,
    applyPreset,
  };
}
