'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { api, type GroupedNotificationView } from '@/lib/api';
import { NotificationsSkeleton } from '@/components/skeletons';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';
import { useMessagingStore } from '@/stores/messaging-store';

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
    queryKey: ['notifications-grouped'],
    queryFn: ({ pageParam }) =>
      api.getGroupedNotifications(pageParam, 30),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!user,
  });

  // Mark notifications as seen when page is viewed
  const seenMutation = useMutation({
    mutationFn: () => api.updateNotificationSeen(new Date().toISOString()),
    onSuccess: () => {
      queryClient.setQueryData(['unread-notifications'], { count: 0 });
    },
  });

  useEffect(() => {
    if (user && !authLoading) {
      seenMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <NotificationsSkeleton />
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
                <GroupedNotificationItem
                  key={notification.id}
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

// =============================================================================
// Grouped notification item
// =============================================================================

function GroupedNotificationItem({
  notification,
}: {
  notification: GroupedNotificationView;
}) {
  const router = useRouter();
  const { openConversation } = useMessagingStore();
  const { reason, actors, actorCount, subjectPreview, subject, isRead, latestAt, isGrouped } =
    notification;

  const isMessageNotification = reason === 'message' || reason === 'dm';

  // Build human-readable actor label, e.g. "Alice, Bob, and 13 others"
  const actorLabel = buildActorLabel(actors, actorCount);

  const content = getNotificationContent(reason, actorLabel);

  const handleClick = () => {
    if (isMessageNotification) {
      // For single message notifications, subject doubles as conversationId
      if (subject) {
        openConversation(subject);
      }
      return;
    }
    const target = subject
      ? `/video/${encodeURIComponent(subject)}`
      : `/profile/${actors[0]?.handle ?? ''}`;
    router.push(target);
  };

  const itemClasses = `flex items-start gap-3 p-4 rounded-lg transition-colors cursor-pointer w-full text-left ${
    isRead ? 'hover:bg-surface' : 'bg-accent/5 hover:bg-accent/10'
  }`;

  const innerContent = (
    <>
      {/* Avatar stack or single avatar */}
      <div className="relative flex-shrink-0 w-12 h-10">
        {isGrouped ? (
          <StackedAvatars actors={actors} />
        ) : (
          <SingleAvatar actor={actors[0]} />
        )}
        {/* Notification type icon badge */}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-background rounded-full flex items-center justify-center">
          {content.icon}
        </div>
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm">
          <span className="font-semibold">{actorLabel}</span>{' '}
          {content.text}
        </p>
        <p className="text-text-muted text-xs mt-1">
          {formatDistanceToNow(new Date(latestAt))}
        </p>
      </div>

      {/* Video thumbnail for like/comment/repost notifications */}
      {subjectPreview?.thumbnailUrl && (
        <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-surface ml-1">
          <img
            src={subjectPreview.thumbnailUrl}
            alt={subjectPreview.caption ?? 'video thumbnail'}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Unread dot */}
      {!isRead && (
        <div className="w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-2" />
      )}
    </>
  );

  if (isMessageNotification) {
    return (
      <button onClick={handleClick} className={itemClasses}>
        {innerContent}
      </button>
    );
  }

  const targetLink = subject
    ? `/video/${encodeURIComponent(subject)}`
    : `/profile/${actors[0]?.handle ?? ''}`;

  return (
    <Link href={targetLink} className={itemClasses}>
      {innerContent}
    </Link>
  );
}

// =============================================================================
// Stacked avatars (up to 3)
// =============================================================================

function StackedAvatars({
  actors,
}: {
  actors: GroupedNotificationView['actors'];
}) {
  // Show at most 3 avatars, each offset slightly to the right
  const visible = actors.slice(0, 3);
  const size = 32; // px
  const overlap = 10; // px

  return (
    <div
      className="relative"
      style={{ width: size + (visible.length - 1) * (size - overlap), height: size }}
    >
      {visible.map((actor, i) => (
        <div
          key={actor.did}
          className="absolute top-0 rounded-full bg-surface border-2 border-background overflow-hidden"
          style={{
            width: size,
            height: size,
            left: i * (size - overlap),
            zIndex: visible.length - i,
          }}
        >
          {actor.avatar ? (
            <img
              src={actor.avatar}
              alt={actor.handle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-primary text-xs font-semibold">
              {actor.handle[0]?.toUpperCase()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SingleAvatar({
  actor,
}: {
  actor: GroupedNotificationView['actors'][number] | undefined;
}) {
  if (!actor) return <div className="w-10 h-10 rounded-full bg-surface" />;

  return (
    <div className="w-10 h-10 rounded-full bg-surface overflow-hidden">
      {actor.avatar ? (
        <img src={actor.avatar} alt={actor.handle} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-primary font-semibold">
          {actor.handle[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function buildActorLabel(
  actors: GroupedNotificationView['actors'],
  total: number
): string {
  if (actors.length === 0) return 'Someone';

  const names = actors.map((a) => a.displayName || `@${a.handle}`);
  const remaining = total - actors.length;

  if (remaining <= 0) {
    if (names.length === 1) return names[0]!;
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }

  // There are more actors than the 3 we loaded
  const listedNames = names.join(', ');
  return `${listedNames}, and ${remaining} other${remaining === 1 ? '' : 's'}`;
}

function getNotificationContent(
  reason: string,
  actorLabel: string
): { icon: React.ReactNode; text: string } {
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
    case 'comment':
      return {
        icon: <CommentIcon className="w-5 h-5 text-blue-500" />,
        text: 'commented on your video',
      };
    case 'reply':
      return {
        icon: <CommentIcon className="w-5 h-5 text-blue-500" />,
        text: 'replied to your comment',
      };
    case 'mention':
      return {
        icon: <MentionIcon className="w-5 h-5 text-purple-500" />,
        text: 'mentioned you',
      };
    case 'repost':
      return {
        icon: <RepostIcon className="w-5 h-5 text-green-500" />,
        text: 'reposted your video',
      };
    case 'message':
    case 'dm':
      return {
        icon: <DirectMessageIcon className="w-5 h-5 text-accent" />,
        text: 'sent you a message',
      };
    default:
      return {
        icon: <NotificationIcon className="w-5 h-5 text-text-muted" />,
        text: 'interacted with your content',
      };
  }
}

// =============================================================================
// Icons
// =============================================================================

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

function DirectMessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </svg>
  );
}
