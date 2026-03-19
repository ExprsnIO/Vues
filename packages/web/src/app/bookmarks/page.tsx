'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { ListSkeleton } from '@/components/skeletons';
import { useAuth } from '@/lib/auth-context';
import { formatCount } from '@/lib/utils';

export default function BookmarksPage() {
  const { user, isLoading: authLoading } = useAuth();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['bookmarks'],
    queryFn: ({ pageParam }) =>
      api.getBookmarks({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: !!user,
  });

  const bookmarks = data?.pages.flatMap((page) => page.bookmarks) ?? [];
  const videos = bookmarks.map((b) => b.video);

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
          <ListSkeleton count={8} />
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="text-center py-20">
              <BookmarkIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Save your favorites
              </h1>
              <p className="text-text-muted mb-6">
                Log in to bookmark videos and access them anytime.
              </p>
              <div className="flex gap-3 justify-center">
                <Link
                  href="/login"
                  className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="px-6 py-3 border border-border hover:bg-surface text-text-primary rounded-lg font-medium transition-colors"
                >
                  Sign up
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Bookmarks</h1>
          </div>

          {isLoading ? (
            <ListSkeleton count={10} />
          ) : videos.length === 0 ? (
            <div className="text-center py-20">
              <BookmarkIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">
                No bookmarks yet
              </h2>
              <p className="text-text-muted mb-4">
                Bookmark videos to save them for later.
              </p>
              <Link href="/" className="text-accent hover:underline">
                Discover videos
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                {videos.map((video) => (
                  <Link
                    key={video.uri}
                    href={`/video/${encodeURIComponent(video.uri)}`}
                    className="relative aspect-[9/16] bg-surface rounded-lg overflow-hidden group"
                  >
                    {video.video?.thumbnail || video.thumbnailUrl ? (
                      <img
                        src={video.video?.thumbnail || video.thumbnailUrl}
                        alt={video.caption || 'Video thumbnail'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted">
                        <VideoIcon className="w-12 h-12" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <PlayIcon className="w-12 h-12 text-white" />
                    </div>

                    {/* Stats */}
                    <div className="absolute bottom-2 left-2 text-white text-sm flex items-center gap-1">
                      <PlayIcon className="w-4 h-4" />
                      {formatCount(video.viewCount)}
                    </div>
                  </Link>
                ))}
              </div>

              {hasNextPage && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="px-6 py-3 bg-surface hover:bg-surface-hover text-text-primary rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {isFetchingNextPage ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
