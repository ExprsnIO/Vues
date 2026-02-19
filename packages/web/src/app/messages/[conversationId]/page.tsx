'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api, MessageView, ConversationView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageText, setMessageText] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  // Fetch conversation details
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations({ limit: 50 }),
    enabled: !!user,
  });

  const conversation = conversationsData?.conversations.find((c) => c.id === conversationId);

  // Fetch messages
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.getMessages(conversationId, { limit: 100 }),
    enabled: !!user && !!conversationId,
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });

  // Mark as read when viewing
  const markReadMutation = useMutation({
    mutationFn: () => api.markConversationRead(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (text: string) =>
      api.sendMessage({
        conversationId,
        text,
      }),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });

  // Mute/unmute mutation
  const muteMutation = useMutation({
    mutationFn: (muted: boolean) => api.muteConversation(conversationId, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(conversation?.muted ? 'Conversation unmuted' : 'Conversation muted');
    },
  });

  // Delete conversation mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteConversation(conversationId),
    onSuccess: () => {
      router.push('/messages');
      toast.success('Conversation deleted');
    },
  });

  // Mark as read when viewing
  useEffect(() => {
    if (conversation && conversation.unreadCount > 0) {
      markReadMutation.mutate();
    }
  }, [conversation?.id, conversation?.unreadCount]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.messages.length]);

  const handleSend = useCallback(() => {
    const text = messageText.trim();
    if (!text) return;
    sendMessageMutation.mutate(text);
  }, [messageText, sendMessageMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login?redirect=/messages');
    return null;
  }

  // Get the other participant
  const otherMember = conversation?.members.find((m) => m.did !== user?.did) || conversation?.members[0];
  const messages = messagesData?.messages || [];

  // Group messages by date
  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex-shrink-0 h-16 bg-surface border-b border-border flex items-center px-4 gap-4">
        <Link
          href="/messages"
          className="p-2 -ml-2 text-text-muted hover:text-text-primary rounded-lg transition-colors lg:hidden"
        >
          <BackIcon className="w-5 h-5" />
        </Link>

        {otherMember ? (
          <Link href={`/profile/${otherMember.handle}`} className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-background overflow-hidden flex-shrink-0">
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
            <div className="min-w-0">
              <p className="font-medium text-text-primary truncate">
                {otherMember.displayName || `@${otherMember.handle}`}
              </p>
              <p className="text-sm text-text-muted truncate">@{otherMember.handle}</p>
            </div>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {/* Options menu */}
        <div className="relative">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
          >
            <MoreIcon className="w-5 h-5" />
          </button>

          {showOptions && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
              <div className="absolute right-0 top-full mt-1 py-1 bg-surface border border-border rounded-lg shadow-lg z-20 min-w-[160px]">
                <button
                  onClick={() => {
                    muteMutation.mutate(!conversation?.muted);
                    setShowOptions(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
                >
                  {conversation?.muted ? (
                    <>
                      <UnmuteIcon className="w-4 h-4" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <MuteIcon className="w-4 h-4" />
                      Mute
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this conversation? This cannot be undone.')) {
                      deleteMutation.mutate();
                    }
                    setShowOptions(false);
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
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messagesLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
              <MessageIcon className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-muted">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-4">
                  <span className="px-3 py-1 text-xs text-text-muted bg-surface rounded-full">
                    {date}
                  </span>
                </div>
                <div className="space-y-2">
                  {dateMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender.did === user?.did}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border p-4 bg-surface">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-4 py-3 bg-background border border-border rounded-2xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none max-h-32"
              style={{ minHeight: '48px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessageMutation.isPending}
            className="p-3 bg-accent text-text-inverse rounded-full hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, isOwn }: { message: MessageView; isOwn: boolean }) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
          isOwn
            ? 'bg-accent text-text-inverse rounded-br-md'
            : 'bg-surface text-text-primary rounded-bl-md'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p
          className={`text-xs mt-1 ${
            isOwn ? 'text-text-inverse/70' : 'text-text-muted'
          }`}
        >
          {formatTime(new Date(message.createdAt))}
        </p>
      </div>
    </div>
  );
}

function groupMessagesByDate(messages: MessageView[]): Record<string, MessageView[]> {
  const groups: Record<string, MessageView[]> = {};

  messages.forEach((message) => {
    const date = new Date(message.createdAt);
    const dateKey = formatDateKey(date);

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(message);
  });

  return groups;
}

function formatDateKey(date: Date): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Icons
function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
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

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function MuteIcon({ className }: { className?: string }) {
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
