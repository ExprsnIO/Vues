'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export interface ChatUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  isModerator?: boolean;
  isHost?: boolean;
}

export interface ChatMessage {
  id: string;
  streamId: string;
  sender: ChatUser;
  text: string;
  messageType: 'chat' | 'system' | 'highlight';
  createdAt: string;
}

export interface ChatSettings {
  slowMode: boolean;
  slowModeInterval: number;
  subscriberOnly: boolean;
  emoteOnly: boolean;
}

interface UseLiveChatOptions {
  streamId: string;
  token: string | null;
  onError?: (message: string) => void;
}

interface UseLiveChatReturn {
  messages: ChatMessage[];
  viewerCount: number;
  pinnedMessage: ChatMessage | null;
  settings: ChatSettings | null;
  isConnected: boolean;
  isModerator: boolean;
  isHost: boolean;
  sendMessage: (text: string) => void;
  deleteMessage: (messageId: string, reason?: string) => void;
  banUser: (userDid: string, duration?: number, reason?: string) => void;
  pinMessage: (message: ChatMessage | null) => void;
  updateSettings: (settings: Partial<ChatSettings>) => void;
}

export function useLiveChat({
  streamId,
  token,
  onError,
}: UseLiveChatOptions): UseLiveChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!streamId || !token) return;

    // Connect to the live chat namespace
    const socket = io(`${API_BASE}/live-chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Live Chat] Connected');
      setIsConnected(true);
      socket.emit('join-stream', streamId);
    });

    socket.on('disconnect', () => {
      console.log('[Live Chat] Disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Live Chat] Connection error:', error.message);
      onError?.(error.message);
    });

    socket.on('error', (data: { message: string }) => {
      console.error('[Live Chat] Error:', data.message);
      onError?.(data.message);
    });

    socket.on('joined', (data: { viewerCount: number; isModerator: boolean; isHost: boolean }) => {
      setViewerCount(data.viewerCount);
      setIsModerator(data.isModerator);
      setIsHost(data.isHost);
    });

    socket.on('chat-history', (data: { messages: ChatMessage[] }) => {
      setMessages(data.messages);
    });

    socket.on('chat-message', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('message-deleted', (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    });

    socket.on('viewer-count', (data: { count: number }) => {
      setViewerCount(data.count);
    });

    socket.on('chat-settings', (newSettings: ChatSettings) => {
      setSettings(newSettings);
    });

    socket.on('pinned-message', (message: ChatMessage | null) => {
      setPinnedMessage(message);
    });

    socket.on('user-banned', (data: { reason?: string; duration?: number }) => {
      if (data.reason !== undefined && data.duration !== undefined) {
        // This is our own ban notification
        onError?.(`You have been banned from chat. Reason: ${data.reason || 'No reason provided'}`);
        socket.disconnect();
      }
    });

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat');
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      socket.emit('leave-stream');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [streamId, token, onError]);

  const sendMessage = useCallback((text: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('send-message', { text });
    }
  }, []);

  const deleteMessage = useCallback((messageId: string, reason?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('delete-message', { messageId, reason });
    }
  }, []);

  const banUser = useCallback((userDid: string, duration?: number, reason?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('ban-user', { userDid, duration, reason });
    }
  }, []);

  const pinMessage = useCallback((message: ChatMessage | null) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('pin-message', { message });
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<ChatSettings>) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('update-settings', newSettings);
    }
  }, []);

  return {
    messages,
    viewerCount,
    pinnedMessage,
    settings,
    isConnected,
    isModerator,
    isHost,
    sendMessage,
    deleteMessage,
    banUser,
    pinMessage,
    updateSettings,
  };
}

export default useLiveChat;
