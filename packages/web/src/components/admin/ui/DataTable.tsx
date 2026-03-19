'use client';

import { ReactNode, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { NoResultsState, NoDataState } from './EmptyState';
import { TableSkeleton } from './LoadingSkeleton';

export type SortDirection = 'asc' | 'desc' | null;
export type RowDensity = 'compact' | 'default' | 'comfortable';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => ReactNode;
  /** Whether this column can be hidden. Defaults to true. */
  hideable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  isLoading?: boolean;
  emptyState?: ReactNode;
  emptyMessage?: string;
  // Selection
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  // Sorting
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string, direction: SortDirection) => void;
  // Row actions
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  // Pagination
  totalCount?: number;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  // Compact mode (legacy)
  compact?: boolean;
  className?: string;
  // Column visibility
  columnVisibility?: boolean;
  hiddenColumns?: string[];
  onHiddenColumnsChange?: (keys: string[]) => void;
  // Row density
  density?: RowDensity;
  showDensityToggle?: boolean;
  onDensityChange?: (density: RowDensity) => void;
  // Virtual scrolling
  virtualScroll?: boolean;
  virtualRowHeight?: number;
  virtualContainerHeight?: number;
  // Toolbar slot
  toolbar?: ReactNode;
}

const DENSITY_PADDING: Record<RowDensity, string> = {
  compact: 'px-3 py-1.5',
  default: 'px-4 py-3',
  comfortable: 'px-4 py-4',
};

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  loading: loadingProp,
  isLoading,
  emptyState,
  emptyMessage,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  sortKey,
  sortDirection,
  onSort,
  onRowClick,
  rowClassName,
  totalCount,
  pageSize = 10,
  currentPage = 1,
  onPageChange,
  compact = false,
  className = '',
  columnVisibility = false,
  hiddenColumns: hiddenColumnsProp,
  onHiddenColumnsChange,
  density: densityProp,
  showDensityToggle = false,
  onDensityChange,
  virtualScroll = false,
  virtualRowHeight = 48,
  virtualContainerHeight = 600,
  toolbar,
}: DataTableProps<T>) {
  const loading = loadingProp ?? isLoading ?? false;

  // Column visibility state (internal or controlled)
  const [internalHiddenCols, setInternalHiddenCols] = useState<string[]>([]);
  const hiddenColumns = hiddenColumnsProp ?? internalHiddenCols;
  const setHiddenColumns = onHiddenColumnsChange ?? setInternalHiddenCols;
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Density state (internal or controlled)
  const [internalDensity, setInternalDensity] = useState<RowDensity>('default');
  const density = densityProp ?? (compact ? 'compact' : internalDensity);
  const setDensity = onDensityChange ?? setInternalDensity;

  const cellPadding = DENSITY_PADDING[density];

  // Virtual scrolling state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Close column menu on outside click
  useEffect(() => {
    if (!showColumnMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColumnMenu]);

  // Filter visible columns
  const visibleColumns = useMemo(
    () => columns.filter((col) => !hiddenColumns.includes(col.key)),
    [columns, hiddenColumns]
  );

  const allKeys = useMemo(() => data.map(keyExtractor), [data, keyExtractor]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.includes(k));
  const someSelected = selectedKeys.length > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(allKeys);
    }
  }, [allSelected, allKeys, onSelectionChange]);

  const handleSelectRow = useCallback(
    (key: string) => {
      if (selectedKeys.includes(key)) {
        onSelectionChange?.(selectedKeys.filter((k) => k !== key));
      } else {
        onSelectionChange?.([...selectedKeys, key]);
      }
    },
    [selectedKeys, onSelectionChange]
  );

  const handleSort = useCallback(
    (key: string) => {
      if (!onSort) return;
      let newDirection: SortDirection = 'asc';
      if (sortKey === key) {
        if (sortDirection === 'asc') newDirection = 'desc';
        else if (sortDirection === 'desc') newDirection = null;
      }
      onSort(key, newDirection);
    },
    [sortKey, sortDirection, onSort]
  );

  const toggleColumnVisibility = useCallback(
    (key: string) => {
      if (hiddenColumns.includes(key)) {
        setHiddenColumns(hiddenColumns.filter((k) => k !== key));
      } else {
        setHiddenColumns([...hiddenColumns, key]);
      }
    },
    [hiddenColumns, setHiddenColumns]
  );

  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1;

  // Virtual scrolling calculations
  const virtualStartIndex = virtualScroll ? Math.floor(scrollTop / virtualRowHeight) : 0;
  const virtualEndIndex = virtualScroll
    ? Math.min(data.length, virtualStartIndex + Math.ceil(virtualContainerHeight / virtualRowHeight) + 2)
    : data.length;
  const virtualVisibleData = virtualScroll ? data.slice(virtualStartIndex, virtualEndIndex) : data;
  const totalVirtualHeight = virtualScroll ? data.length * virtualRowHeight : 0;

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollTop(scrollContainerRef.current.scrollTop);
    }
  }, []);

  if (loading) {
    return <TableSkeleton rows={5} columns={visibleColumns.length + (selectable ? 1 : 0)} />;
  }

  if (data.length === 0) {
    return (
      emptyState || (
        <div className="border border-border rounded-xl">
          <NoDataState itemType={emptyMessage || 'items'} />
        </div>
      )
    );
  }

  const showToolbar = columnVisibility || showDensityToggle || toolbar;

  return (
    <div className={`overflow-hidden rounded-xl border border-border ${className}`}>
      {/* Toolbar */}
      {showToolbar && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-surface">
          {toolbar}
          <div className="flex-1" />

          {/* Density Toggle */}
          {showDensityToggle && (
            <div className="flex items-center bg-surface-hover rounded-md p-0.5">
              {(['compact', 'default', 'comfortable'] as RowDensity[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    density === d
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                  title={`${d.charAt(0).toUpperCase() + d.slice(1)} density`}
                >
                  <DensityIcon density={d} className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          )}

          {/* Column Visibility */}
          {columnVisibility && (
            <div className="relative" ref={columnMenuRef}>
              <button
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Toggle columns"
              >
                <ColumnsIcon className="w-4 h-4" />
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                  <p className="px-3 py-1.5 text-xs font-medium text-text-muted">Visible Columns</p>
                  {columns.map((col) => {
                    if (col.hideable === false) return null;
                    const isHidden = hiddenColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => toggleColumnVisibility(col.key)}
                          className="w-3.5 h-3.5 rounded border-border text-accent focus:ring-accent"
                        />
                        <span className={isHidden ? 'text-text-muted' : 'text-text-primary'}>
                          {col.header}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div
        ref={virtualScroll ? scrollContainerRef : undefined}
        onScroll={virtualScroll ? handleScroll : undefined}
        className="overflow-x-auto"
        style={virtualScroll ? { maxHeight: virtualContainerHeight, overflowY: 'auto' } : undefined}
      >
        <table className="w-full">
          <thead className="bg-surface-hover sticky top-0 z-10">
            <tr>
              {selectable && (
                <th className={`${cellPadding} w-12`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className={`
                    ${cellPadding}
                    text-xs font-medium text-text-muted uppercase tracking-wider
                    ${column.align === 'center' ? 'text-center' : ''}
                    ${column.align === 'right' ? 'text-right' : 'text-left'}
                    ${column.width || ''}
                  `}
                >
                  {column.sortable && onSort ? (
                    <button
                      onClick={() => handleSort(column.key)}
                      className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
                    >
                      {column.header}
                      <span className="flex flex-col">
                        <svg
                          className={`w-3 h-3 ${
                            sortKey === column.key && sortDirection === 'asc'
                              ? 'text-accent'
                              : 'text-text-muted'
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        <svg
                          className={`w-3 h-3 -mt-1 ${
                            sortKey === column.key && sortDirection === 'desc'
                              ? 'text-accent'
                              : 'text-text-muted'
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* Virtual scroll spacer (top) */}
            {virtualScroll && virtualStartIndex > 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  style={{ height: virtualStartIndex * virtualRowHeight }}
                />
              </tr>
            )}

            {virtualVisibleData.map((row, visibleIndex) => {
              const actualIndex = virtualScroll ? virtualStartIndex + visibleIndex : visibleIndex;
              const key = keyExtractor(row);
              const isSelected = selectedKeys.includes(key);

              return (
                <tr
                  key={key}
                  className={`
                    bg-surface hover:bg-surface-hover transition-colors
                    ${onRowClick ? 'cursor-pointer' : ''}
                    ${isSelected ? 'bg-accent/5' : ''}
                    ${rowClassName?.(row) || ''}
                  `}
                  onClick={() => onRowClick?.(row)}
                  style={virtualScroll ? { height: virtualRowHeight } : undefined}
                >
                  {selectable && (
                    <td className={cellPadding} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(key)}
                        className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                        aria-label={`Select row ${key}`}
                      />
                    </td>
                  )}
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`
                        ${cellPadding}
                        text-sm text-text-primary
                        ${column.align === 'center' ? 'text-center' : ''}
                        ${column.align === 'right' ? 'text-right' : 'text-left'}
                      `}
                    >
                      {column.render
                        ? column.render(row, actualIndex)
                        : (row[column.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Virtual scroll spacer (bottom) */}
            {virtualScroll && virtualEndIndex < data.length && (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  style={{ height: (data.length - virtualEndIndex) * virtualRowHeight }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {onPageChange && totalCount && totalCount > pageSize && (
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <span className="text-sm text-text-muted">
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {generatePageNumbers(currentPage, totalPages).map((page, i) =>
              page === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-text-muted">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => onPageChange(page as number)}
                  className={`
                    px-3 py-1.5 text-sm rounded-lg transition-colors
                    ${
                      currentPage === page
                        ? 'bg-accent text-text-inverse'
                        : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                    }
                  `}
                >
                  {page}
                </button>
              )
            )}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generatePageNumbers(
  currentPage: number,
  totalPages: number
): (number | string)[] {
  const pages: (number | string)[] = [];
  const delta = 1;

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - delta && i <= currentPage + delta)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return pages;
}

// Density icon
function DensityIcon({ density, className }: { density: RowDensity; className?: string }) {
  const gaps = { compact: 2, default: 4, comfortable: 6 };
  const gap = gaps[density];
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" d={`M4 ${6}h16`} />
      <path strokeLinecap="round" d={`M4 ${6 + gap}h16`} />
      <path strokeLinecap="round" d={`M4 ${6 + gap * 2}h16`} />
      {density !== 'compact' && <path strokeLinecap="round" d={`M4 ${6 + gap * 3}h16`} />}
    </svg>
  );
}

// Columns visibility icon
function ColumnsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 19.5h15a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 6v12a1.5 1.5 0 001.5 1.5z" />
    </svg>
  );
}

// Simple table for basic use cases
interface SimpleTableProps {
  children: ReactNode;
  className?: string;
}

export function SimpleTable({ children, className = '' }: SimpleTableProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-border ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full">{children}</table>
      </div>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-hover">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TableRow({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      className={`bg-surface hover:bg-surface-hover transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableHeader({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider ${
        align === 'center'
          ? 'text-center'
          : align === 'right'
          ? 'text-right'
          : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 text-sm text-text-primary ${
        align === 'center'
          ? 'text-center'
          : align === 'right'
          ? 'text-right'
          : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}
