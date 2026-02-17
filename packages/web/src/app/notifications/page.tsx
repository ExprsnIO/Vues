'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, NotificationView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';

export default function NotificationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.getNotifications({ cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!user,
  });

  // Mark notifications as seen when page is viewed
  const seenMutation = useMutation({
    mutationFn: () => api.markNotificationsSeen(),
    onSuccess: () => {
      queryClient.setQueryData(['unread-notifications'], { count: 0 });
    },
  });

  useEffect(() => {
    if (user && !authLoading) {
      seenMutation.mutate();
    }
  }, [user, authLoading]);

  // Infinite scroll
  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  });

  const notifications = data?.pages.flatMap((page) => page.notifications) ?? [];

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <NotificationIcon className="w-16 h-16 text-text-muted mb-4" />
            <h1 className="text-2xl font-bold text-text-primary mb-3">
              Sign in to see notifications
            </h1>
            <p className="text-text-muted mb-6 max-w-md">
              Get notified when someone likes, comments, or follows you.
            </p>
            <Link
              href="/login"
              className="px-8 py-3 bg-accent hover:bg-accent-hover text-text-inverse font-medium rounded-lg transition-colors"
            >
              Log in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-text-primary mb-6">
            Notifications
          </h1>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-surface" />
                  <div className="flex-1">
                    <div className="h-4 w-3/4 bg-surface rounded mb-2" />
                    <div className="h-3 w-1/4 bg-surface rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16">
              <NotificationIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-muted">No notifications yet</p>
              <p className="text-text-muted text-sm mt-1">
                When someone interacts with your content, you&apos;ll see it here.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.uri}
                  notification={notification}
                />
              ))}

              {/* Load more trigger */}
              <div ref={loadMoreRef} className="h-1" />

              {isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NotificationItem({ notification }: { notification: NotificationView }) {
  const { reason, author, record, isRead, indexedAt } = notification;

  const getNotificationContent = () => {
    switch (reason) {
      case 'like':
        return {
          icon: <HeartIcon className="w-5 h-5 text-red-500" />,
          text: 'liked your video',
        };
      case 'follow':
        return {
          icon: <FollowIcon className="w-5 h-5 text-accent" />,
          text: 'started following you',
        };
      case 'reply':
        return {
          icon: <CommentIcon className="w-5 h-5 text-blue-500" />,
          text: 'replied to your comment',
        };
      case 'mention':
        return {
          icon: <MentionIcon className="w-5 h-5 text-purple-500" />,
          text: 'mentioned you in a comment',
        };
      case 'repost':
        return {
          icon: <RepostIcon className="w-5 h-5 text-green-500" />,
          text: 'reposted your video',
        };
      default:
        return {
          icon: <NotificationIcon className="w-5 h-5 text-text-muted" />,
          text: 'interacted with your content',
        };
    }
  };

  const content = getNotificationContent();
  const targetLink = record?.uri
    ? `/video/${encodeURIComponent(record.uri)}`
    : `/profile/${author.handle}`;

  return (
    <Link
      href={targetLink}
      className={`flex items-start gap-3 p-4 rounded-lg transition-colors ${
        isRead
          ? 'hover:bg-surface'
          : 'bg-accent/5 hover:bg-accent/10'
      }`}
    >
      {/* Author avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-surface overflow-hidden">
          {author.avatar ? (
            <img
              src={author.avatar}
              alt={author.handle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-primary font-semibold">
              {author.handle[0]?.toUpperCase()}
            </div>
          )}
        </div>
        {/* Notification type icon */}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-background rounded-full flex items-center justify-center">
          {content.icon}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm">
          <span className="font-semibold">
            {author.displayName || `@${author.handle}`}
          </span>{' '}
          {content.text}
        </p>
        {record?.text && (
          <p className="text-text-muted text-sm mt-1 line-clamp-2">
            &quot;{record.text}&quot;
          </p>
        )}
        <p className="text-text-muted text-xs mt-1">
          {formatDistanceToNow(new Date(indexedAt))}
        </p>
      </div>

      {/* Unread indicator */}
      {!isRead && (
        <div className="w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-2" />
      )}
    </Link>
  );
}

function NotificationIcon({ className }: { className?: string }) {
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
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function FollowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3c5.5 0 10 3.58 10 8s-4.5 8-10 8c-1.24 0-2.43-.18-3.53-.5C5.55 21 2 21 2 21c2.33-2.33 2.7-3.9 2.75-4.5C3.05 15.07 2 13.13 2 11c0-4.42 4.5-8 10-8z" />
    </svg>
  );
}

function MentionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
    </svg>
  );
}

function RepostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
    </svg>
  );
}
