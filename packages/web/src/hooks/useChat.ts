/**
 * Chat WebSocket Hook
 * Real-time messaging with typing indicators and presence
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth-context';
import { getLocalSession } from '@/lib/auth';
import { MessageView } from '@/lib/api';

// Types
interface UserInfo {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface TypingUser {
  userDid: string;
  user: UserInfo;
  isTyping: boolean;
}

interface PresenceInfo {
  userDid: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: string | null;
}

interface ReactionUpdate {
  messageId: string;
  conversationId: string;
  userDid: string;
  user: UserInfo;
  emoji: string;
  action: 'add' | 'remove';
}

interface ReadReceipt {
  conversationId: string;
  userDid: string;
  messageId?: string;
  readAt: string;
}

interface ConversationUpdate {
  conversationId: string;
  lastMessage: {
    text: string;
    createdAt: string;
  };
}

// Socket singleton
let socket: Socket | null = null;
let socketRefCount = 0;

function getSocket(token: string, userDid: string): Socket {
  if (!socket || !socket.connected) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

    socket = io(`${apiUrl}/chat`, {
      auth: {
        token,
        userDid,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Chat: Connected to WebSocket');
    });

    socket.on('disconnect', (reason) => {
      console.log('Chat: Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('Chat: Connection error:', error);
    });
  }

  return socket;
}

function releaseSocket() {
  socketRefCount--;
  if (socketRefCount <= 0 && socket) {
    socket.disconnect();
    socket = null;
    socketRefCount = 0;
  }
}

export interface UseChatOptions {
  conversationId?: string;
  onNewMessage?: (message: MessageView) => void;
  onTypingUpdate?: (data: TypingUser) => void;
  onPresenceUpdate?: (data: PresenceInfo) => void;
  onReactionUpdate?: (data: ReactionUpdate) => void;
  onReadReceipt?: (data: ReadReceipt) => void;
  onConversationUpdate?: (data: ConversationUpdate) => void;
}

export interface UseChatReturn {
  isConnected: boolean;
  typingUsers: Map<string, TypingUser>;
  presence: Map<string, PresenceInfo>;
  sendTyping: (isTyping: boolean) => void;
  sendMessage: (message: MessageView) => void;
  sendReaction: (messageId: string, emoji: string, action: 'add' | 'remove') => void;
  markAsRead: (messageId?: string) => void;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  getPresence: (userDids: string[]) => void;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const [presence, setPresence] = useState<Map<string, PresenceInfo>>(new Map());

  const socketRef = useRef<Socket | null>(null);
  const currentConversationRef = useRef<string | null>(options.conversationId || null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Store callbacks in refs to avoid dependency changes
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  // Initialize socket connection
  useEffect(() => {
    if (!user) return;

    const session = getLocalSession();
    if (!session) return;

    const sock = getSocket(session.accessJwt, user.did);
    socketRef.current = sock;
    socketRefCount++;

    // Connection handlers
    const handleConnect = () => {
      setIsConnected(true);

      // Rejoin conversation if needed
      if (currentConversationRef.current) {
        sock.emit('join-conversation', { conversationId: currentConversationRef.current });
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    // Message handlers
    const handleNewMessage = (message: MessageView) => {
      callbacksRef.current.onNewMessage?.(message);
    };

    const handleTypingUpdate = (data: TypingUser) => {
      if (data.userDid === user.did) return; // Ignore own typing

      setTypingUsers((prev) => {
        const next = new Map(prev);

        // Clear existing timeout
        const existingTimeout = typingTimeoutRef.current.get(data.userDid);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        if (data.isTyping) {
          next.set(data.userDid, data);

          // Auto-clear after 3 seconds
          const timeout = setTimeout(() => {
            setTypingUsers((p) => {
              const n = new Map(p);
              n.delete(data.userDid);
              return n;
            });
            typingTimeoutRef.current.delete(data.userDid);
          }, 3000);

          typingTimeoutRef.current.set(data.userDid, timeout);
        } else {
          next.delete(data.userDid);
        }

        return next;
      });

      callbacksRef.current.onTypingUpdate?.(data);
    };

    const handlePresenceUpdate = (data: PresenceInfo) => {
      setPresence((prev) => {
        const next = new Map(prev);
        next.set(data.userDid, data);
        return next;
      });

      callbacksRef.current.onPresenceUpdate?.(data);
    };

    const handleReactionUpdate = (data: ReactionUpdate) => {
      callbacksRef.current.onReactionUpdate?.(data);
    };

    const handleReadReceipt = (data: ReadReceipt) => {
      callbacksRef.current.onReadReceipt?.(data);
    };

    const handleConversationUpdate = (data: ConversationUpdate) => {
      callbacksRef.current.onConversationUpdate?.(data);
    };

    const handleTypingStatus = (data: { conversationId: string; typingUsers: string[] }) => {
      // Initial typing status when joining conversation
      setTypingUsers((prev) => {
        const next = new Map(prev);
        for (const userDid of data.typingUsers) {
          if (userDid !== user.did) {
            next.set(userDid, { userDid, user: { did: userDid, handle: 'unknown' }, isTyping: true });
          }
        }
        return next;
      });
    };

    const handleConversationPresence = (data: { conversationId: string; participants: PresenceInfo[] }) => {
      setPresence((prev) => {
        const next = new Map(prev);
        for (const p of data.participants) {
          next.set(p.userDid, p);
        }
        return next;
      });
    };

    const handlePresenceData = (data: { users: PresenceInfo[] }) => {
      setPresence((prev) => {
        const next = new Map(prev);
        for (const p of data.users) {
          next.set(p.userDid, p);
        }
        return next;
      });
    };

    // Register handlers
    sock.on('connect', handleConnect);
    sock.on('disconnect', handleDisconnect);
    sock.on('new-message', handleNewMessage);
    sock.on('typing-update', handleTypingUpdate);
    sock.on('presence-update', handlePresenceUpdate);
    sock.on('reaction-update', handleReactionUpdate);
    sock.on('read-receipt', handleReadReceipt);
    sock.on('conversation-updated', handleConversationUpdate);
    sock.on('typing-status', handleTypingStatus);
    sock.on('conversation-presence', handleConversationPresence);
    sock.on('presence-data', handlePresenceData);

    // Set initial connection state
    setIsConnected(sock.connected);

    // Join initial conversation
    if (options.conversationId) {
      sock.emit('join-conversation', { conversationId: options.conversationId });
    }

    return () => {
      sock.off('connect', handleConnect);
      sock.off('disconnect', handleDisconnect);
      sock.off('new-message', handleNewMessage);
      sock.off('typing-update', handleTypingUpdate);
      sock.off('presence-update', handlePresenceUpdate);
      sock.off('reaction-update', handleReactionUpdate);
      sock.off('read-receipt', handleReadReceipt);
      sock.off('conversation-updated', handleConversationUpdate);
      sock.off('typing-status', handleTypingStatus);
      sock.off('conversation-presence', handleConversationPresence);
      sock.off('presence-data', handlePresenceData);

      // Clear typing timeouts
      for (const timeout of typingTimeoutRef.current.values()) {
        clearTimeout(timeout);
      }
      typingTimeoutRef.current.clear();

      releaseSocket();
    };
  }, [user?.did]);

  // Join/leave conversation when conversationId changes
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock || !isConnected) return;

    // Leave old conversation
    if (currentConversationRef.current && currentConversationRef.current !== options.conversationId) {
      sock.emit('leave-conversation', { conversationId: currentConversationRef.current });
      setTypingUsers(new Map());
    }

    // Join new conversation
    if (options.conversationId) {
      sock.emit('join-conversation', { conversationId: options.conversationId });
      currentConversationRef.current = options.conversationId;
    } else {
      currentConversationRef.current = null;
    }
  }, [options.conversationId, isConnected]);

  // Send typing indicator
  const sendTyping = useCallback((isTyping: boolean) => {
    const sock = socketRef.current;
    if (!sock || !currentConversationRef.current) return;

    sock.emit('typing', {
      conversationId: currentConversationRef.current,
      isTyping,
    });
  }, []);

  // Send message (broadcast to WebSocket after API save)
  const sendMessage = useCallback((message: MessageView) => {
    const sock = socketRef.current;
    if (!sock) return;

    sock.emit('message-sent', { message });
  }, []);

  // Send reaction
  const sendReaction = useCallback((messageId: string, emoji: string, action: 'add' | 'remove') => {
    const sock = socketRef.current;
    if (!sock || !currentConversationRef.current) return;

    sock.emit('message-reaction', {
      messageId,
      conversationId: currentConversationRef.current,
      emoji,
      action,
    });
  }, []);

  // Mark messages as read
  const markAsRead = useCallback((messageId?: string) => {
    const sock = socketRef.current;
    if (!sock || !currentConversationRef.current) return;

    sock.emit('message-read', {
      conversationId: currentConversationRef.current,
      messageId,
    });
  }, []);

  // Join a conversation
  const joinConversation = useCallback((conversationId: string) => {
    const sock = socketRef.current;
    if (!sock) return;

    sock.emit('join-conversation', { conversationId });
    currentConversationRef.current = conversationId;
  }, []);

  // Leave a conversation
  const leaveConversation = useCallback((conversationId: string) => {
    const sock = socketRef.current;
    if (!sock) return;

    sock.emit('leave-conversation', { conversationId });
    if (currentConversationRef.current === conversationId) {
      currentConversationRef.current = null;
    }
    setTypingUsers(new Map());
  }, []);

  // Get presence for specific users
  const getPresence = useCallback((userDids: string[]) => {
    const sock = socketRef.current;
    if (!sock) return;

    sock.emit('get-presence', { userDids });
  }, []);

  return {
    isConnected,
    typingUsers,
    presence,
    sendTyping,
    sendMessage,
    sendReaction,
    markAsRead,
    joinConversation,
    leaveConversation,
    getPresence,
  };
}

// Typing indicator debounce hook
export function useTypingIndicator(
  sendTyping: (isTyping: boolean) => void,
  debounceMs: number = 1000
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(true);
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout to stop typing
    timeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(false);
      timeoutRef.current = null;
    }, debounceMs);
  }, [sendTyping, debounceMs]);

  const stopTyping = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(false);
    }
  }, [sendTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { handleTyping, stopTyping };
}
