'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, ConversationView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';
import { useDebounce } from '@/lib/hooks';
import { useChat } from '@/hooks/useChat';

export default function MessagesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 250);

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations({ limit: 50 }),
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Server-side message search (fires when query is long enough)
  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ['messageSearch', debouncedQuery],
    queryFn: () => api.searchMessages(debouncedQuery, 20),
    enabled: !!user && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  // Presence for all conversation members
  const { presence } = useChat({ conversationId: undefined });

  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId: string) => api.deleteConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const muteConversationMutation = useMutation({
    mutationFn: ({ conversationId, muted }: { conversationId: string; muted: boolean }) =>
      api.muteConversation(conversationId, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login?redirect=/messages');
    return null;
  }

  const conversations = conversationsData?.conversations || [];
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // Client-side filter: match by participant name/handle OR last message text
  const filteredConversations = useMemo(() => {
    if (!debouncedQuery) return conversations;
    const q = debouncedQuery.toLowerCase();
    return conversations.filter((c) => {
      const other = c.members.find((m) => m.did !== user?.did) || c.members[0];
      const nameMatch =
        other.handle.toLowerCase().includes(q) ||
        (other.displayName || '').toLowerCase().includes(q);
      const msgMatch = (c.lastMessage?.text || '').toLowerCase().includes(q);
      return nameMatch || msgMatch;
    });
  }, [conversations, debouncedQuery, user?.did]);

  const showSearchResults = debouncedQuery.length >= 2 && searchData;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="sticky top-0 bg-background/80 backdrop-blur-sm z-10 px-4 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-text-primary">Messages</h1>
                {totalUnread > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-accent text-text-inverse rounded-full">
                    {totalUnread}
                  </span>
                )}
              </div>
              <Link
                href="/messages/new"
                className="p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
                title="New message"
              >
                <ComposeIcon className="w-5 h-5" />
              </Link>
            </div>

            {/* Search bar */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations or messages..."
                className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-primary transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {authLoading || isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : showSearchResults ? (
            // Server-side message search results
            <MessageSearchResults
              results={searchData.results}
              isLoading={searchFetching}
              query={debouncedQuery}
            />
          ) : filteredConversations.length === 0 ? (
            debouncedQuery ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <SearchIcon className="w-12 h-12 text-text-muted mb-4" />
                <p className="text-text-secondary font-medium mb-1">No results for "{debouncedQuery}"</p>
                <p className="text-sm text-text-muted">Try a different name or message snippet</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <MessageIcon className="w-16 h-16 text-text-muted mb-4" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">No messages yet</h2>
                <p className="text-text-muted mb-6 max-w-sm">
                  Start a conversation by visiting someone's profile and sending them a message.
                </p>
                <Link
                  href="/discover"
                  className="px-6 py-2.5 bg-accent text-text-inverse font-medium rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Discover People
                </Link>
              </div>
            )
          ) : (
            <div className="divide-y divide-border">
              {filteredConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  currentUserDid={user?.did}
                  isOnline={(() => {
                    const other = conversation.members.find((m) => m.did !== user?.did);
                    return other ? presence.get(other.did)?.status === 'online' : false;
                  })()}
                  onDelete={() => {
                    if (confirm('Delete this conversation? This cannot be undone.')) {
                      deleteConversationMutation.mutate(conversation.id);
                    }
                  }}
                  onMuteToggle={() => {
                    muteConversationMutation.mutate({
                      conversationId: conversation.id,
                      muted: !conversation.muted,
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Message search results panel
// ----------------------------------------------------------------------------

function MessageSearchResults({
  results,
  isLoading,
  query,
}: {
  results: Array<{
    conversationId: string;
    message: { id: string; text: string; sentAt: string };
    participant: { did: string; handle: string; displayName?: string; avatar?: string };
  }>;
  isLoading: boolean;
  query: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <SearchIcon className="w-10 h-10 text-text-muted mb-3" />
        <p className="text-text-secondary font-medium mb-1">No messages found for "{query}"</p>
        <p className="text-sm text-text-muted">Try different keywords</p>
      </div>
    );
  }

  return (
    <div>
      <p className="px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wide">
        Message results
      </p>
      <div className="divide-y divide-border">
        {results.map((result) => (
          <Link
            key={`${result.conversationId}-${result.message.id}`}
            href={`/messages/${result.conversationId}`}
            className="flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-surface overflow-hidden flex-shrink-0">
              {result.participant.avatar ? (
                <img
                  src={result.participant.avatar}
                  alt={result.participant.handle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-primary font-bold text-sm">
                  {result.participant.handle[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-medium text-text-primary truncate">
                  {result.participant.displayName || `@${result.participant.handle}`}
                </span>
                <span className="text-xs text-text-muted flex-shrink-0 ml-2">
                  {formatDistanceToNow(new Date(result.message.sentAt))}
                </span>
              </div>
              <p className="text-sm text-text-muted truncate">{result.message.text}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Conversation list item with swipe-to-action
// ----------------------------------------------------------------------------

function ConversationItem({
  conversation,
  currentUserDid,
  isOnline,
  onDelete,
  onMuteToggle,
}: {
  conversation: ConversationView;
  currentUserDid?: string;
  isOnline: boolean;
  onDelete: () => void;
  onMuteToggle: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  // Swipe-to-action state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const swipedRef = useRef(false);
  const SWIPE_THRESHOLD = 80; // px to reveal action buttons
  const SWIPE_MAX = 160; // max reveal width

  const otherMember = conversation.members.find((m) => m.did !== currentUserDid) || conversation.members[0];
  const isUnread = conversation.unreadCount > 0;

  // Touch handlers for swipe-to-archive/mute on mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    swipedRef.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.touches[0].clientX - touchStartXRef.current;
      const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);

      // Only horizontal swipes (not scrolling)
      if (dy > 12 && !swipedRef.current) return;

      if (dx < -8) {
        swipedRef.current = true;
        setIsSwiping(true);
        const clamped = Math.min(Math.abs(dx), SWIPE_MAX);
        setSwipeOffset(clamped);
      } else if (swipedRef.current) {
        setSwipeOffset(0);
      }
    },
    []
  );

  const handleTouchEnd = useCallback(() => {
    setIsSwiping(false);
    if (swipeOffset < SWIPE_THRESHOLD) {
      setSwipeOffset(0);
    } else {
      // Snap open to reveal buttons
      setSwipeOffset(SWIPE_MAX);
    }
  }, [swipeOffset]);

  const closeSwipe = useCallback(() => {
    setSwipeOffset(0);
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* Swipe action buttons (behind the row) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          onClick={() => {
            onMuteToggle();
            closeSwipe();
          }}
          className="w-20 flex flex-col items-center justify-center bg-zinc-500 text-white text-xs gap-1 transition-colors hover:bg-zinc-600 active:bg-zinc-700"
        >
          {conversation.muted ? (
            <>
              <UnmuteIcon className="w-5 h-5" />
              Unmute
            </>
          ) : (
            <>
              <MutedIcon className="w-5 h-5" />
              Mute
            </>
          )}
        </button>
        <button
          onClick={() => {
            onDelete();
            closeSwipe();
          }}
          className="w-20 flex flex-col items-center justify-center bg-red-500 text-white text-xs gap-1 transition-colors hover:bg-red-600 active:bg-red-700"
        >
          <TrashIcon className="w-5 h-5" />
          Delete
        </button>
      </div>

      {/* Swipeable row */}
      <div
        className="relative group"
        style={{
          transform: `translateX(-${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Link
          href={`/messages/${conversation.id}`}
          className={`flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition-colors ${
            isUnread ? 'bg-surface/40' : ''
          }`}
          onClick={() => {
            // Prevent navigation if swiped open
            if (swipeOffset > 10) {
              closeSwipe();
              return;
            }
          }}
        >
          {/* Avatar with online indicator */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-surface overflow-hidden">
              {otherMember.avatar ? (
                <img
                  src={otherMember.avatar}
                  alt={otherMember.handle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-primary font-bold">
                  {otherMember.handle[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {/* Online presence dot */}
            {isOnline && (
              <span
                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full"
                title="Online"
              />
            )}

            {/* Unread count badge */}
            {isUnread && !isOnline && (
              <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent rounded-full flex items-center justify-center px-1">
                <span className="text-[10px] font-bold text-text-inverse leading-none">
                  {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                </span>
              </div>
            )}

            {/* Unread dot + online: show both */}
            {isUnread && isOnline && (
              <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent rounded-full flex items-center justify-center px-1">
                <span className="text-[10px] font-bold text-text-inverse leading-none">
                  {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span
                className={`text-sm truncate ${
                  isUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'
                }`}
              >
                {otherMember.displayName || `@${otherMember.handle}`}
              </span>
              <span className="text-xs text-text-muted flex-shrink-0 ml-2">
                {conversation.lastMessage
                  ? formatDistanceToNow(new Date(conversation.lastMessage.createdAt))
                  : ''}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <p
                className={`text-sm truncate flex-1 ${
                  isUnread ? 'text-text-primary font-medium' : 'text-text-muted'
                }`}
              >
                {conversation.lastMessage?.text || 'No messages yet'}
              </p>

              {/* Unread dot (inline) when no count badge shown */}
              {isUnread && conversation.unreadCount === 1 && (
                <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
              )}

              {/* Muted icon */}
              {conversation.muted && (
                <MutedIcon className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              )}
            </div>
          </div>
        </Link>

        {/* Desktop hover menu */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
          <button
            onClick={(e) => {
              e.preventDefault();
              setShowMenu(!showMenu);
            }}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
          >
            <MoreIcon className="w-5 h-5" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 py-1 bg-surface border border-border rounded-lg shadow-lg z-20 min-w-[148px]">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onMuteToggle();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
                >
                  {conversation.muted ? (
                    <>
                      <UnmuteIcon className="w-4 h-4" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <MutedIcon className="w-4 h-4" />
                      Mute
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-surface-hover flex items-center gap-2"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Icons
function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function ComposeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

function MutedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  );
}

function UnmuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
