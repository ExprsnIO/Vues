'use client';

// Skeleton base
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-hover rounded ${className}`} />;
}

// Feed skeleton - vertical video cards
export function FeedSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="relative aspect-[9/16] bg-surface rounded-xl overflow-hidden">
          <Skeleton className="absolute inset-0 rounded-xl" />
          {/* Action buttons skeleton */}
          <div className="absolute right-3 bottom-20 space-y-4">
            {[1, 2, 3, 4].map((j) => (
              <Skeleton key={j} className="w-10 h-10 rounded-full" />
            ))}
          </div>
          {/* Caption skeleton */}
          <div className="absolute bottom-4 left-4 right-16 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Profile skeleton
export function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-20 h-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      {/* Stats */}
      <div className="flex gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center space-y-1">
            <Skeleton className="h-5 w-12 mx-auto" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Bio */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      {/* Video grid */}
      <div className="grid grid-cols-3 gap-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded" />
        ))}
      </div>
    </div>
  );
}

// Discover skeleton
export function DiscoverSkeleton() {
  return (
    <div className="p-4 space-y-6">
      {/* Search bar */}
      <Skeleton className="h-10 w-full rounded-lg" />
      {/* Trending tags */}
      <div className="flex gap-2 overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full flex-shrink-0" />
        ))}
      </div>
      {/* Video grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// Notifications skeleton
export function NotificationsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
          <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="w-10 h-10 rounded flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

// Video page skeleton
export function VideoPageSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-6xl mx-auto">
      {/* Video */}
      <div className="flex-1">
        <Skeleton className="aspect-[9/16] max-h-[80vh] rounded-xl" />
      </div>
      {/* Sidebar / comments */}
      <div className="w-full lg:w-96 space-y-4">
        {/* Author */}
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        {/* Caption */}
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        {/* Comments */}
        <div className="space-y-3 pt-4 border-t border-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Generic list skeleton
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
