'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api, MessageView, ConversationView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useChat, useTypingIndicator } from '@/hooks/useChat';

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
    refetchInterval: 5000,
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

  // Edit message mutation
  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      api.editMessage(messageId, text),
    onSuccess: (result) => {
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((m: MessageView) =>
            m.id === result.message.id ? result.message : m
          ),
        };
      });
    },
    onError: () => {
      toast.error('Failed to edit message');
    },
  });

  // Delete message mutation
  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => api.deleteMessage(conversationId, messageId),
    onSuccess: (_, messageId) => {
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.filter((m: MessageView) => m.id !== messageId),
        };
      });
      toast.success('Message deleted');
    },
    onError: () => {
      toast.error('Failed to delete message');
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

  // WebSocket chat hook
  const {
    isConnected,
    typingUsers,
    presence,
    sendTyping,
    sendMessage: sendSocketMessage,
    sendReaction,
    markAsRead: markReadSocket,
  } = useChat({
    conversationId,
    onNewMessage: (message) => {
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;
        const exists = old.messages.some((m: MessageView) => m.id === message.id);
        if (exists) return old;
        return {
          ...old,
          messages: [message, ...old.messages],
        };
      });
    },
    onReactionUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  // Typing indicator
  const { handleTyping, stopTyping } = useTypingIndicator(sendTyping);

  // Get typing users display
  const typingDisplay = useMemo(() => {
    const users = Array.from(typingUsers.values());
    if (users.length === 0) return null;
    if (users.length === 1) {
      const u = users[0].user;
      return `${u.displayName || u.handle} is typing`;
    }
    return `${users.length} people are typing`;
  }, [typingUsers]);

  // Get other member presence
  const otherMemberPresence = useMemo(() => {
    const otherDid = conversation?.members.find((m) => m.did !== user?.did)?.did;
    if (!otherDid) return null;
    return presence.get(otherDid);
  }, [conversation?.members, presence, user?.did]);

  // Mark as read when viewing
  useEffect(() => {
    if (conversation && conversation.unreadCount > 0) {
      markReadMutation.mutate();
      markReadSocket();
    }
  }, [conversation?.id, conversation?.unreadCount]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.messages.length]);

  const handleSend = useCallback(() => {
    const text = messageText.trim();
    if (!text) return;
    stopTyping();
    sendMessageMutation.mutate(text, {
      onSuccess: (result) => {
        sendSocketMessage(result.message);
      },
    });
  }, [messageText, sendMessageMutation, sendSocketMessage, stopTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMessageText(e.target.value);
      if (e.target.value.trim()) {
        handleTyping();
      }
    },
    [handleTyping]
  );

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login?redirect=/messages');
    return null;
  }

  const otherMember = conversation?.members.find((m) => m.did !== user?.did) || conversation?.members[0];
  const messages = messagesData?.messages || [];
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
            <div className="relative w-10 h-10 rounded-full bg-background overflow-hidden flex-shrink-0">
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
              {otherMemberPresence?.status === 'online' && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface rounded-full" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-text-primary truncate">
                  {otherMember.displayName || `@${otherMember.handle}`}
                </p>
              </div>
              <p className="text-xs text-text-muted truncate">
                {otherMemberPresence?.status === 'online'
                  ? 'Active now'
                  : otherMemberPresence?.lastSeen
                  ? `Last seen ${formatDistanceToNow(new Date(otherMemberPresence.lastSeen))}`
                  : `@${otherMember.handle}`}
              </p>
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
            <div className="w-8 h-8 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
              <MessageIcon className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-muted">No messages yet. Say hello!</p>
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
                      onReaction={(emoji, action) => sendReaction(message.id, emoji, action)}
                      onEdit={(messageId, text) => editMessageMutation.mutate({ messageId, text })}
                      onDelete={(messageId) => {
                        if (confirm('Delete this message?')) {
                          deleteMessageMutation.mutate(messageId);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {typingDisplay && (
        <div className="px-4 py-2 bg-surface border-t border-border">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <TypingDots />
            <span>{typingDisplay}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border p-4 bg-surface">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={messageText}
              onChange={handleInputChange}
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

// ----------------------------------------------------------------------------
// Animated typing dots
// ----------------------------------------------------------------------------

function TypingDots() {
  return (
    <span className="flex items-center gap-0.5">
      <span
        className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce"
        style={{ animationDelay: '0ms', animationDuration: '900ms' }}
      />
      <span
        className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce"
        style={{ animationDelay: '150ms', animationDuration: '900ms' }}
      />
      <span
        className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce"
        style={{ animationDelay: '300ms', animationDuration: '900ms' }}
      />
    </span>
  );
}

// ----------------------------------------------------------------------------
// Message bubble with context menu (edit/delete/copy) and inline edit mode
// ----------------------------------------------------------------------------

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '👎'];

interface MessageBubbleProps {
  message: MessageView;
  isOwn: boolean;
  onReaction: (emoji: string, action: 'add' | 'remove') => void;
  onEdit: (messageId: string, text: string) => void;
  onDelete: (messageId: string) => void;
}

function MessageBubble({ message, isOwn, onReaction, onEdit, onDelete }: MessageBubbleProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const reactions = (message as any).reactions as Array<{
    emoji: string;
    count: number;
    userReacted: boolean;
  }> || [];

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [isEditing]);

  const openContextMenu = useCallback((x: number, y: number) => {
    if (!isOwn) return;
    setContextMenuPos({ x, y });
    setShowContextMenu(true);
  }, [isOwn]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!isOwn) return;
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY);
    },
    [isOwn, openContextMenu]
  );

  // Long-press for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isOwn) return;
      const touch = e.touches[0];
      longPressRef.current = setTimeout(() => {
        openContextMenu(touch.clientX, touch.clientY);
      }, 500);
    },
    [isOwn, openContextMenu]
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.text).then(() => {
      toast.success('Copied');
    });
    setShowContextMenu(false);
  }, [message.text]);

  const handleEditStart = useCallback(() => {
    setEditText(message.text);
    setIsEditing(true);
    setShowContextMenu(false);
  }, [message.text]);

  const handleEditSave = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.text) {
      setIsEditing(false);
      return;
    }
    onEdit(message.id, trimmed);
    setIsEditing(false);
  }, [editText, message.id, message.text, onEdit]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleEditSave();
      }
      if (e.key === 'Escape') {
        setIsEditing(false);
        setEditText(message.text);
      }
    },
    [handleEditSave, message.text]
  );

  return (
    <>
      {/* Context menu overlay */}
      {showContextMenu && contextMenuPos && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowContextMenu(false)} />
          <div
            className="fixed z-40 py-1 bg-surface border border-border rounded-lg shadow-xl min-w-[140px]"
            style={{
              top: contextMenuPos.y,
              left: contextMenuPos.x,
              transform: `translate(${contextMenuPos.x > window.innerWidth - 160 ? '-100%' : '0'}, ${
                contextMenuPos.y > window.innerHeight - 140 ? '-100%' : '0'
              })`,
            }}
          >
            <button
              onClick={handleCopy}
              className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
            >
              <CopyIcon className="w-4 h-4" />
              Copy
            </button>
            <button
              onClick={handleEditStart}
              className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
            >
              <PencilIcon className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => {
                onDelete(message.id);
                setShowContextMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-surface-hover flex items-center gap-2"
            >
              <TrashIcon className="w-4 h-4" />
              Delete
            </button>
          </div>
        </>
      )}

      <div
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="relative max-w-[75%]">
          {/* Reaction picker trigger (non-own messages too) */}
          <button
            onClick={() => setShowReactions(!showReactions)}
            className={`absolute top-1/2 -translate-y-1/2 ${
              isOwn ? 'right-full mr-2' : 'left-full ml-2'
            } p-1 rounded-full bg-surface border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-hover`}
          >
            <span className="text-xs">😊</span>
          </button>

          {/* Reaction picker */}
          {showReactions && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowReactions(false)} />
              <div
                className={`absolute z-20 bottom-full mb-2 ${
                  isOwn ? 'right-0' : 'left-0'
                } bg-surface border border-border rounded-full px-2 py-1 flex gap-1 shadow-lg`}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReaction(emoji, 'add');
                      setShowReactions(false);
                    }}
                    className="p-1.5 hover:bg-surface-hover rounded-full transition-colors text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Bubble */}
          {isEditing ? (
            // Inline edit mode
            <div
              className={`px-3 py-2 rounded-2xl ${
                isOwn ? 'bg-accent/80 rounded-br-md' : 'bg-surface rounded-bl-md'
              }`}
            >
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={1}
                className={`w-full bg-transparent resize-none focus:outline-none whitespace-pre-wrap break-words ${
                  isOwn ? 'text-text-inverse' : 'text-text-primary'
                }`}
                style={{ minWidth: '120px', minHeight: '24px' }}
              />
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  onClick={handleEditSave}
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    isOwn
                      ? 'bg-text-inverse/20 text-text-inverse hover:bg-text-inverse/30'
                      : 'bg-accent text-text-inverse hover:bg-accent-hover'
                  } transition-colors`}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(message.text);
                  }}
                  className={`text-xs ${
                    isOwn ? 'text-text-inverse/70 hover:text-text-inverse' : 'text-text-muted hover:text-text-primary'
                  } transition-colors`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`px-4 py-2.5 rounded-2xl ${
                isOwn
                  ? 'bg-accent text-text-inverse rounded-br-md'
                  : 'bg-surface text-text-primary rounded-bl-md'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
              <div
                className={`flex items-center gap-1.5 mt-1 ${
                  isOwn ? 'justify-end' : 'justify-start'
                }`}
              >
                <p
                  className={`text-xs ${
                    isOwn ? 'text-text-inverse/70' : 'text-text-muted'
                  }`}
                >
                  {formatTime(new Date(message.createdAt))}
                </p>
                {message.editedAt && (
                  <span
                    className={`text-xs italic ${
                      isOwn ? 'text-text-inverse/50' : 'text-text-muted'
                    }`}
                  >
                    Edited
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Reactions display */}
          {reactions.length > 0 && (
            <div
              className={`absolute -bottom-3 ${isOwn ? 'right-2' : 'left-2'} flex gap-0.5`}
            >
              {reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => onReaction(reaction.emoji, reaction.userReacted ? 'remove' : 'add')}
                  className={`px-1.5 py-0.5 text-xs rounded-full border ${
                    reaction.userReacted
                      ? 'bg-accent/20 border-accent'
                      : 'bg-surface border-border'
                  } hover:bg-surface-hover transition-colors`}
                >
                  {reaction.emoji}
                  {reaction.count > 1 && (
                    <span className="ml-0.5 text-text-muted">{reaction.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function groupMessagesByDate(messages: MessageView[]): Record<string, MessageView[]> {
  const groups: Record<string, MessageView[]> = {};

  messages.forEach((message) => {
    const date = new Date(message.createdAt);
    const dateKey = formatDateKey(date);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(message);
  });

  return groups;
}

function formatDateKey(date: Date): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
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

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}
