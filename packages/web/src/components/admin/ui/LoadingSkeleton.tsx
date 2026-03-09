'use client';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-hover rounded ${className}`}
      aria-hidden="true"
    />
  );
}

// Common skeleton presets
export function TextSkeleton({
  width = 'w-full',
  height = 'h-4',
}: {
  width?: string;
  height?: string;
}) {
  return <Skeleton className={`${width} ${height}`} />;
}

export function AvatarSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }[size];

  return <Skeleton className={`${sizeClass} rounded-full`} />;
}

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-4 bg-surface border border-border rounded-xl ${className}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <AvatarSkeleton />
        <div className="flex-1">
          <TextSkeleton width="w-32" height="h-4" />
          <TextSkeleton width="w-24" height="h-3" />
        </div>
      </div>
      <TextSkeleton width="w-full" height="h-4" />
      <TextSkeleton width="w-3/4" height="h-4" />
    </div>
  );
}

export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <TextSkeleton width={i === 0 ? 'w-48' : 'w-24'} />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full">
        <thead className="bg-surface-hover">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <TextSkeleton width="w-20" height="h-3" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="p-4 bg-surface border border-border rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <TextSkeleton width="w-24" height="h-3" />
        <Skeleton className="w-5 h-5 rounded" />
      </div>
      <TextSkeleton width="w-16" height="h-8" />
      <TextSkeleton width="w-20" height="h-3" />
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg"
        >
          <AvatarSkeleton size="sm" />
          <div className="flex-1">
            <TextSkeleton width="w-32" height="h-4" />
            <TextSkeleton width="w-48" height="h-3" />
          </div>
          <Skeleton className="w-16 h-6 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <TextSkeleton width="w-48" height="h-8" />
          <TextSkeleton width="w-64" height="h-4" />
        </div>
        <Skeleton className="w-24 h-10 rounded-lg" />
      </div>

      {/* Stats */}
      <StatsGridSkeleton />

      {/* Table */}
      <TableSkeleton />
    </div>
  );
}
