'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, ConversationView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';

export default function MessagesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations({ limit: 50 }),
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId: string) => api.deleteConversation(conversationId),
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

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="sticky top-0 bg-background/80 backdrop-blur-sm z-10 px-4 py-4 border-b border-border">
            <div className="flex items-center justify-between">
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
          </div>

          {/* Content */}
          {authLoading || isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
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
          ) : (
            <div className="divide-y divide-border">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  currentUserDid={user?.did}
                  onDelete={() => {
                    if (confirm('Delete this conversation? This cannot be undone.')) {
                      deleteConversationMutation.mutate(conversation.id);
                    }
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

function ConversationItem({
  conversation,
  currentUserDid,
  onDelete,
}: {
  conversation: ConversationView;
  currentUserDid?: string;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  // Get the other participant (not the current user)
  const otherMember = conversation.members.find((m) => m.did !== currentUserDid) || conversation.members[0];

  return (
    <div className="relative group">
      <Link
        href={`/messages/${conversation.id}`}
        className={`flex items-center gap-4 px-4 py-4 hover:bg-surface transition-colors ${
          conversation.unreadCount > 0 ? 'bg-surface/50' : ''
        }`}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-14 h-14 rounded-full bg-surface overflow-hidden">
            {otherMember.avatar ? (
              <img
                src={otherMember.avatar}
                alt={otherMember.handle}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-primary font-bold text-lg">
                {otherMember.handle[0]?.toUpperCase()}
              </div>
            )}
          </div>
          {conversation.unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-text-inverse">
                {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={`font-medium truncate ${
              conversation.unreadCount > 0 ? 'text-text-primary' : 'text-text-secondary'
            }`}>
              {otherMember.displayName || `@${otherMember.handle}`}
            </span>
            {conversation.lastMessage && (
              <span className="text-xs text-text-muted flex-shrink-0 ml-2">
                {formatDistanceToNow(new Date(conversation.lastMessage.createdAt))}
              </span>
            )}
          </div>
          <p className={`text-sm truncate ${
            conversation.unreadCount > 0 ? 'text-text-primary font-medium' : 'text-text-muted'
          }`}>
            {conversation.lastMessage?.text || 'No messages yet'}
          </p>
        </div>

        {/* Muted indicator */}
        {conversation.muted && (
          <MutedIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
        )}
      </Link>

      {/* Menu button */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
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
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-full mt-1 py-1 bg-surface border border-border rounded-lg shadow-lg z-20 min-w-[140px]">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-surface-hover"
              >
                Delete
              </button>
            </div>
          </>
        )}
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
