'use client';

import { ReactNode, useState, useMemo, useCallback } from 'react';
import { NoResultsState, NoDataState } from './EmptyState';
import { TableSkeleton } from './LoadingSkeleton';

export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
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
  // Compact mode
  compact?: boolean;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  loading = false,
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
}: DataTableProps<T>) {
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

  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1;

  if (loading) {
    return <TableSkeleton rows={5} columns={columns.length + (selectable ? 1 : 0)} />;
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

  return (
    <div className={`overflow-hidden rounded-xl border border-border ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-hover">
            <tr>
              {selectable && (
                <th className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} w-12`}>
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
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`
                    ${compact ? 'px-3 py-2' : 'px-4 py-3'}
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
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 15l7-7 7 7"
                          />
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
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
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
            {data.map((row, index) => {
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
                >
                  {selectable && (
                    <td
                      className={`${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(key)}
                        className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                        aria-label={`Select row ${key}`}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`
                        ${compact ? 'px-3 py-2' : 'px-4 py-3'}
                        text-sm text-text-primary
                        ${column.align === 'center' ? 'text-center' : ''}
                        ${column.align === 'right' ? 'text-right' : 'text-left'}
                      `}
                    >
                      {column.render
                        ? column.render(row, index)
                        : (row[column.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              );
            })}
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
