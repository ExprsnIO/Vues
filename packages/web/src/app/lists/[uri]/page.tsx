'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, ListItemView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function ListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uri = decodeURIComponent(params.uri as string);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // Get list details
  const {
    data: listData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['list', uri],
    queryFn: ({ pageParam }) => api.getList(uri, { cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
  });

  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteList(uri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      router.push('/lists');
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (subjectDid: string) => api.removeListItem(uri, subjectDid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list', uri] });
    },
  });

  const list = listData?.pages[0]?.list;
  const items = listData?.pages.flatMap((page) => page.items) ?? [];
  const isOwner = user && list?.creator?.did === user.did;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {isLoading ? (
            <div className="animate-pulse">
              <div className="flex items-start gap-6 mb-8">
                <div className="w-20 h-20 rounded-xl bg-surface" />
                <div className="flex-1">
                  <div className="h-6 w-48 bg-surface rounded mb-3" />
                  <div className="h-4 w-32 bg-surface rounded" />
                </div>
              </div>
            </div>
          ) : list ? (
            <>
              {/* List Header */}
              <div className="flex items-start gap-6 mb-8">
                {/* List avatar */}
                <div className="w-20 h-20 rounded-xl bg-surface overflow-hidden flex-shrink-0">
                  {list.avatar ? (
                    <img
                      src={list.avatar}
                      alt={list.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-accent/20">
                      <ListIcon className="w-10 h-10 text-accent" />
                    </div>
                  )}
                </div>

                {/* List info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-text-primary">
                      {list.name}
                    </h1>
                    <span className="text-xs capitalize px-2 py-0.5 bg-surface rounded text-text-muted">
                      {list.purpose === 'modlist' ? 'Mute list' : 'List'}
                    </span>
                  </div>
                  {list.description && (
                    <p className="text-text-muted mb-2">{list.description}</p>
                  )}
                  <p className="text-sm text-text-muted">
                    {list.memberCount} members
                    {list.creator && (
                      <> · by <Link href={`/profile/${list.creator.handle}`} className="text-accent hover:underline">@{list.creator.handle}</Link></>
                    )}
                  </p>

                  {/* Actions */}
                  {isOwner && (
                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => setIsEditing(!isEditing)}
                        className="px-4 py-2 border border-border text-text-primary hover:bg-surface rounded-lg text-sm font-medium transition-colors"
                      >
                        {isEditing ? 'Done Editing' : 'Edit List'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this list?')) {
                            deleteMutation.mutate();
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="px-4 py-2 border border-red-700 text-red-500 hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Members */}
              <div className="border-t border-border pt-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Members
                </h2>

                {items.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <MemberItem
                          key={item.uri}
                          item={item}
                          isEditing={isEditing}
                          onRemove={() => removeItemMutation.mutate(item.subject.did)}
                          isRemoving={removeItemMutation.isPending}
                        />
                      ))}
                    </div>

                    {/* Load more */}
                    <div ref={loadMoreRef} className="h-1" />
                    {isFetchingNextPage && (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <UserIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
                    <p className="text-text-muted">No members in this list yet</p>
                    {isOwner && (
                      <p className="text-sm text-text-muted mt-2">
                        Add members from their profile pages
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <ListIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">List not found</h2>
              <p className="text-text-muted mb-4">
                This list may have been deleted or is unavailable.
              </p>
              <Link href="/lists" className="text-accent hover:underline">
                View your lists
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MemberItem({
  item,
  isEditing,
  onRemove,
  isRemoving,
}: {
  item: ListItemView;
  isEditing: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const { subject } = item;

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-surface">
      <Link
        href={`/profile/${subject.handle}`}
        className="flex-shrink-0"
      >
        <div className="w-12 h-12 rounded-full bg-background overflow-hidden">
          {subject.avatar ? (
            <img
              src={subject.avatar}
              alt={subject.handle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-primary font-semibold">
              {subject.handle[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </Link>

      <Link
        href={`/profile/${subject.handle}`}
        className="flex-1 min-w-0"
      >
        <p className="font-medium text-text-primary truncate">
          {subject.displayName || `@${subject.handle}`}
        </p>
        <p className="text-sm text-text-muted truncate">@{subject.handle}</p>
      </Link>

      {isEditing && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="px-3 py-1.5 text-red-500 hover:bg-red-900/20 rounded text-sm transition-colors"
        >
          Remove
        </button>
      )}
    </div>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  );
}
