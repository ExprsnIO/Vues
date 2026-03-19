'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ConversationView, MessageView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDistanceToNow } from '@/lib/utils';
import { useDebounce } from '@/lib/hooks';
import { useChat, useTypingIndicator } from '@/hooks/useChat';
import { useMessagingStore } from '@/stores/messaging-store';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Root drawer shell
// ---------------------------------------------------------------------------

export function MessageDrawer() {
  const {
    drawerState,
    activeConversationId,
    closeDrawer,
    minimize,
    openDrawer,
    openNewConversation,
  } = useMessagingStore();

  if (drawerState === 'closed' || drawerState === 'minimized') return null;

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className="fixed inset-0 bg-black/40 z-[55] lg:hidden"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 bottom-0 z-[60] w-full sm:w-[380px] bg-background border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border flex-shrink-0">
          {drawerState === 'conversation' && (
            <button
              onClick={openDrawer}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary mr-1"
              aria-label="Back to conversations"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
          )}

          {drawerState === 'new' && (
            <button
              onClick={openDrawer}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary mr-1"
              aria-label="Back to conversations"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
          )}

          <h2 className="text-sm font-semibold text-text-primary flex-1">
            {drawerState === 'list' && 'Messages'}
            {drawerState === 'conversation' && 'Conversation'}
            {drawerState === 'new' && 'New Message'}
          </h2>

          <div className="flex items-center gap-1">
            {drawerState === 'list' && (
              <button
                onClick={() => openNewConversation()}
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary"
                title="New message"
                aria-label="New message"
              >
                <ComposeIcon className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={minimize}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hidden lg:block"
              title="Minimize"
              aria-label="Minimize messages"
            >
              <ChevronDownIcon className="w-4 h-4" />
            </button>

            <button
              onClick={closeDrawer}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary"
              aria-label="Close messages"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content — keyed per view so each transition re-mounts and plays */}
        <div className="flex-1 overflow-hidden">
          {drawerState === 'list' && (
            <div key="list" className="h-full animate-in fade-in slide-in-from-left-2 duration-150">
              <DrawerConversationList />
            </div>
          )}
          {drawerState === 'conversation' && (
            <div key="conversation" className="h-full animate-in fade-in slide-in-from-right-2 duration-150">
              <DrawerChat conversationId={activeConversationId} />
            </div>
          )}
          {drawerState === 'new' && (
            <div key="new" className="h-full animate-in fade-in slide-in-from-right-2 duration-150">
              <DrawerNewConversation />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Conversation list view
// ---------------------------------------------------------------------------

function DrawerConversationList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { openConversation, openNewConversation } = useMessagingStore();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 250);

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations({ limit: 50 }),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId: string) => api.deleteConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const muteConversationMutation = useMutation({
    mutationFn: ({
      conversationId,
      muted,
    }: {
      conversationId: string;
      muted: boolean;
    }) => api.muteConversation(conversationId, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const conversations = conversationsData?.conversations || [];

  const filtered = useMemo(() => {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-8 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          debouncedQuery ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-text-secondary font-medium">
                No results for "{debouncedQuery}"
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
              <ChatBubbleIcon className="w-10 h-10 text-text-muted" />
              <p className="text-sm text-text-muted">No conversations yet</p>
              <button
                onClick={() => openNewConversation()}
                className="px-4 py-2 bg-accent text-text-inverse text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
              >
                Start a conversation
              </button>
            </div>
          )
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((conversation) => {
              const other =
                conversation.members.find((m) => m.did !== user?.did) ||
                conversation.members[0];
              const isUnread = conversation.unreadCount > 0;

              return (
                <button
                  key={conversation.id}
                  onClick={() => openConversation(conversation.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left ${
                    isUnread ? 'bg-surface/40' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-surface overflow-hidden">
                      {other.avatar ? (
                        <img
                          src={other.avatar}
                          alt={other.handle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-primary font-bold text-sm">
                          {other.handle[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Unread badge */}
                    {isUnread && (
                      <div className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-accent rounded-full flex items-center justify-center px-1">
                        <span className="text-[9px] font-bold text-text-inverse leading-none">
                          {conversation.unreadCount > 9
                            ? '9+'
                            : conversation.unreadCount}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className={`text-xs truncate ${
                          isUnread
                            ? 'font-semibold text-text-primary'
                            : 'font-medium text-text-secondary'
                        }`}
                      >
                        {other.displayName || `@${other.handle}`}
                      </span>
                      {conversation.lastMessage && (
                        <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">
                          {formatDistanceToNow(
                            new Date(conversation.lastMessage.createdAt)
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-xs truncate flex-1 ${
                          isUnread
                            ? 'text-text-primary font-medium'
                            : 'text-text-muted'
                        }`}
                      >
                        {conversation.lastMessage?.text || 'No messages yet'}
                      </p>
                      {conversation.muted && (
                        <MutedIcon className="w-3 h-3 text-text-muted flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat view (compact)
// ---------------------------------------------------------------------------

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '👎'];

function DrawerChat({ conversationId }: { conversationId: string | null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageText, setMessageText] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversation list to find this convo's details
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations({ limit: 50 }),
    enabled: !!user,
  });

  const conversation = conversationsData?.conversations.find(
    (c) => c.id === conversationId
  );

  // Fetch messages
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.getMessages(conversationId!, { limit: 60 }),
    enabled: !!user && !!conversationId,
    refetchInterval: 10000,
  });

  // Mark as read
  const markReadMutation = useMutation({
    mutationFn: () => api.markConversationRead(conversationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: (text: string) =>
      api.sendMessage({ conversationId: conversationId!, text }),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Resize textarea back to single row
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });

  // Edit message
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
    onError: () => toast.error('Failed to edit message'),
  });

  // Delete message
  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.deleteMessage(conversationId!, messageId),
    onSuccess: (_, messageId) => {
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.filter((m: MessageView) => m.id !== messageId),
        };
      });
    },
    onError: () => toast.error('Failed to delete message'),
  });

  // Mute/unmute
  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      api.muteConversation(conversationId!, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setShowOptions(false);
    },
  });

  // WebSocket
  const {
    typingUsers,
    sendTyping,
    sendMessage: sendSocketMessage,
    sendReaction,
    markAsRead: markReadSocket,
  } = useChat({
    conversationId: conversationId || undefined,
    onNewMessage: (message) => {
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;
        const exists = old.messages.some((m: MessageView) => m.id === message.id);
        if (exists) return old;
        return { ...old, messages: [message, ...old.messages] };
      });
    },
    onReactionUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  const { handleTyping, stopTyping } = useTypingIndicator(sendTyping);

  const typingDisplay = useMemo(() => {
    const users = Array.from(typingUsers.values());
    if (users.length === 0) return null;
    const u = users[0].user;
    return users.length === 1
      ? `${u.displayName || u.handle} is typing...`
      : `${users.length} people are typing...`;
  }, [typingUsers]);

  // Mark read on mount / when unread changes
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
    if (!text || sendMessageMutation.isPending) return;
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
      // Auto-resize
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
      if (e.target.value.trim()) handleTyping();
    },
    [handleTyping]
  );

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-text-muted">No conversation selected</p>
      </div>
    );
  }

  const otherMember =
    conversation?.members.find((m) => m.did !== user?.did) ||
    conversation?.members[0];
  const messages = messagesData?.messages || [];
  const grouped = groupByDate(messages);

  return (
    <div className="flex flex-col h-full">
      {/* Compact header with person info */}
      {otherMember && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0 bg-surface/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-surface overflow-hidden flex-shrink-0">
              {otherMember.avatar ? (
                <img
                  src={otherMember.avatar}
                  alt={otherMember.handle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-primary font-bold text-xs">
                  {otherMember.handle[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-text-primary truncate">
              {otherMember.displayName || `@${otherMember.handle}`}
            </span>
          </div>

          {/* Options */}
          <div className="relative">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="p-1 rounded-md hover:bg-surface-hover text-text-muted"
            >
              <MoreIcon className="w-4 h-4" />
            </button>

            {showOptions && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowOptions(false)}
                />
                <div className="absolute right-0 top-full mt-1 py-1 bg-surface border border-border rounded-lg shadow-lg z-20 min-w-[140px]">
                  <button
                    onClick={() =>
                      muteMutation.mutate(!conversation?.muted)
                    }
                    className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2"
                  >
                    {conversation?.muted ? (
                      <>
                        <UnmuteIcon className="w-3.5 h-3.5" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <MutedIcon className="w-3.5 h-3.5" />
                        Mute
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messagesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <ChatBubbleIcon className="w-10 h-10 text-text-muted mb-2" />
            <p className="text-xs text-text-muted">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-2">
                  <span className="px-2 py-0.5 text-[10px] text-text-muted bg-surface rounded-full">
                    {date}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {dateMessages.map((message) => (
                    <CompactMessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender.did === user?.did}
                      onReaction={(emoji, action) =>
                        sendReaction(message.id, emoji, action)
                      }
                      onEdit={(messageId, text) =>
                        editMessageMutation.mutate({ messageId, text })
                      }
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
        <div className="px-3 py-1.5 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <TypingDots />
            <span>{typingDisplay}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border p-3 bg-surface">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              style={{ minHeight: '36px', maxHeight: '96px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessageMutation.isPending}
            className="p-2 bg-accent text-text-inverse rounded-full hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Send message"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact message bubble
// ---------------------------------------------------------------------------

interface CompactBubbleProps {
  message: MessageView;
  isOwn: boolean;
  onReaction: (emoji: string, action: 'add' | 'remove') => void;
  onEdit: (messageId: string, text: string) => void;
  onDelete: (messageId: string) => void;
}

function CompactMessageBubble({
  message,
  isOwn,
  onReaction,
  onEdit,
  onDelete,
}: CompactBubbleProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);

  const reactions =
    (message.reactions as Array<{
      emoji: string;
      count: number;
      userReacted: boolean;
    }>) || [];

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [isEditing]);

  const openContextMenu = useCallback(
    (x: number, y: number) => {
      if (!isOwn) return;
      setContextMenuPos({ x, y });
      setShowContextMenu(true);
    },
    [isOwn]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!isOwn) return;
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY);
    },
    [isOwn, openContextMenu]
  );

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
      {/* Context menu */}
      {showContextMenu && contextMenuPos && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setShowContextMenu(false)}
          />
          <div
            className="fixed z-40 py-1 bg-surface border border-border rounded-lg shadow-xl min-w-[130px]"
            style={{
              top: contextMenuPos.y,
              left: contextMenuPos.x,
              transform: `translate(${
                contextMenuPos.x > window.innerWidth - 150 ? '-100%' : '0'
              }, ${
                contextMenuPos.y > window.innerHeight - 120 ? '-100%' : '0'
              })`,
            }}
          >
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(message.text)
                  .then(() => toast.success('Copied'));
                setShowContextMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              Copy
            </button>
            <button
              onClick={() => {
                setEditText(message.text);
                setIsEditing(true);
                setShowContextMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2"
            >
              <PencilIcon className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={() => {
                onDelete(message.id);
                setShowContextMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-surface-hover flex items-center gap-2"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
      )}

      <div
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-1 duration-150`}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="relative max-w-[80%]">
          {/* Reaction picker trigger */}
          <button
            onClick={() => setShowReactions(!showReactions)}
            className={`absolute top-1/2 -translate-y-1/2 ${
              isOwn ? 'right-full mr-1' : 'left-full ml-1'
            } p-1 rounded-full bg-surface border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-hover`}
          >
            <span className="text-xs">😊</span>
          </button>

          {/* Reaction picker */}
          {showReactions && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowReactions(false)}
              />
              <div
                className={`absolute z-20 bottom-full mb-1 ${
                  isOwn ? 'right-0' : 'left-0'
                } bg-surface border border-border rounded-full px-1.5 py-0.5 flex gap-0.5 shadow-lg`}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReaction(emoji, 'add');
                      setShowReactions(false);
                    }}
                    className="p-1 hover:bg-surface-hover rounded-full transition-colors text-base"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Bubble */}
          {isEditing ? (
            <div
              className={`px-2.5 py-1.5 rounded-xl ${
                isOwn
                  ? 'bg-accent/80 rounded-br-sm'
                  : 'bg-surface rounded-bl-sm'
              }`}
            >
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={1}
                className={`w-full bg-transparent resize-none focus:outline-none text-sm whitespace-pre-wrap break-words ${
                  isOwn ? 'text-text-inverse' : 'text-text-primary'
                }`}
                style={{ minWidth: '80px' }}
              />
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={handleEditSave}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    isOwn
                      ? 'bg-text-inverse/20 text-text-inverse hover:bg-text-inverse/30'
                      : 'bg-accent text-text-inverse hover:bg-accent-hover'
                  }`}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(message.text);
                  }}
                  className={`text-[10px] ${
                    isOwn
                      ? 'text-text-inverse/70'
                      : 'text-text-muted'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`px-3 py-2 rounded-xl ${
                isOwn
                  ? 'bg-accent text-text-inverse rounded-br-sm'
                  : 'bg-surface text-text-primary rounded-bl-sm'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.text}
              </p>
              <div
                className={`flex items-center gap-1 mt-0.5 ${
                  isOwn ? 'justify-end' : 'justify-start'
                }`}
              >
                <p
                  className={`text-[10px] ${
                    isOwn ? 'text-text-inverse/70' : 'text-text-muted'
                  }`}
                >
                  {formatTime(new Date(message.createdAt))}
                </p>
                {message.editedAt && (
                  <span
                    className={`text-[10px] italic ${
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
              className={`absolute -bottom-2.5 ${
                isOwn ? 'right-1' : 'left-1'
              } flex gap-0.5`}
            >
              {reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() =>
                    onReaction(
                      reaction.emoji,
                      reaction.userReacted ? 'remove' : 'add'
                    )
                  }
                  className={`px-1 py-0.5 text-xs rounded-full border ${
                    reaction.userReacted
                      ? 'bg-accent/20 border-accent'
                      : 'bg-surface border-border'
                  } hover:bg-surface-hover transition-colors`}
                >
                  {reaction.emoji}
                  {reaction.count > 1 && (
                    <span className="ml-0.5 text-text-muted">
                      {reaction.count}
                    </span>
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

// ---------------------------------------------------------------------------
// New conversation view
// ---------------------------------------------------------------------------

function DrawerNewConversation() {
  const { user } = useAuth();
  const { openConversation } = useMessagingStore();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Search actors
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['actorSearch', debouncedQuery],
    queryFn: () => api.searchActors(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10000,
  });

  // Suggested: following
  const { data: followingData } = useQuery({
    queryKey: ['following', user?.did],
    queryFn: () => api.getFollowing(user!.did, { limit: 20 }),
    enabled: !!user && !debouncedQuery,
    staleTime: 60000,
  });

  // Create / get conversation
  const createConversationMutation = useMutation({
    mutationFn: (did: string) => api.getOrCreateConversation(did),
    onSuccess: (data) => {
      openConversation(data.conversation.id);
    },
    onError: () => toast.error('Failed to start conversation'),
  });

  const searchResults = searchData?.actors || [];
  const suggestions = followingData?.following || [];
  const showSuggestions = !debouncedQuery && suggestions.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a user..."
            className="w-full pl-8 pr-8 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : debouncedQuery.length >= 2 ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <p className="text-xs text-text-muted">
                No users found for "{debouncedQuery}"
              </p>
            </div>
          ) : (
            <div>
              <p className="px-4 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                Results
              </p>
              <div className="divide-y divide-border">
                {searchResults.map(
                  (actor: {
                    did: string;
                    handle: string;
                    displayName?: string;
                    avatar?: string;
                  }) => (
                    <DrawerUserRow
                      key={actor.did}
                      user={actor}
                      onClick={() =>
                        createConversationMutation.mutate(actor.did)
                      }
                      isLoading={createConversationMutation.isPending}
                    />
                  )
                )}
              </div>
            </div>
          )
        ) : showSuggestions ? (
          <div>
            <p className="px-4 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
              Suggested
            </p>
            <div className="divide-y divide-border">
              {suggestions.map(
                (follow: {
                  did: string;
                  handle: string;
                  displayName?: string;
                  avatar?: string;
                }) => (
                  <DrawerUserRow
                    key={follow.did}
                    user={follow}
                    onClick={() =>
                      createConversationMutation.mutate(follow.did)
                    }
                    isLoading={createConversationMutation.isPending}
                  />
                )
              )}
            </div>
          </div>
        ) : debouncedQuery.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <p className="text-xs text-text-muted">
              Type at least 2 characters
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
            <SearchIcon className="w-8 h-8 text-text-muted" />
            <p className="text-xs text-text-muted">
              Search for someone to message
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DrawerUserRow({
  user,
  onClick,
  isLoading,
}: {
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface transition-colors disabled:opacity-50"
    >
      <div className="w-8 h-8 rounded-full bg-surface overflow-hidden flex-shrink-0">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.handle}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-primary font-bold text-xs">
            {user.handle[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-medium text-text-primary truncate">
          {user.displayName || `@${user.handle}`}
        </p>
        <p className="text-[10px] text-text-muted truncate">@{user.handle}</p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByDate(messages: MessageView[]): Record<string, MessageView[]> {
  const groups: Record<string, MessageView[]> = {};
  messages.forEach((message) => {
    const key = formatDateKey(new Date(message.createdAt));
    if (!groups[key]) groups[key] = [];
    groups[key].push(message);
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

function TypingDots() {
  return (
    <span className="flex items-center gap-0.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1 h-1 bg-text-muted rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
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
