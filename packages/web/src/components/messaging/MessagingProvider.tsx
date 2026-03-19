'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getLocalSession } from '@/lib/auth';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useMessagingStore } from '@/stores/messaging-store';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { MessageDrawer } from './MessageDrawer';
import { MinimizedBubble } from './MinimizedBubble';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

const PUSH_PROMPT_KEY = 'exprsn_push_prompt_shown';

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pushPromptShownRef = useRef(false);

  const {
    drawerState,
    activeConversationId,
    totalUnreadCount,
    soundEnabled,
    desktopNotificationsEnabled,
    setUnreadCount,
    openConversation,
    closeDrawer,
  } = useMessagingStore();

  const { isSupported: pushSupported, permission: pushPermission, isSubscribed: pushSubscribed, subscribe: pushSubscribe } = usePushNotifications();

  // Keep a ref so the socket closure always reads the latest push state without
  // needing to re-establish the connection on every render.
  const pushStateRef = useRef({ pushSupported, pushPermission, pushSubscribed, pushSubscribe });
  useEffect(() => {
    pushStateRef.current = { pushSupported, pushPermission, pushSubscribed, pushSubscribe };
  });

  const isOnMessagesPage = pathname?.startsWith('/messages');

  // ---------------------------------------------------------------------------
  // Fetch initial unread count (and poll as fallback)
  // ---------------------------------------------------------------------------
  useQuery({
    queryKey: ['messaging', 'unread'],
    queryFn: async () => {
      const data = await api.getConversations({ limit: 50 });
      const unread = (data.conversations || []).reduce(
        (sum: number, c: { unreadCount: number }) => sum + (c.unreadCount || 0),
        0
      );
      setUnreadCount(unread);
      return unread;
    },
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // ---------------------------------------------------------------------------
  // Global WebSocket connection for cross-conversation notifications
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    const session = getLocalSession();
    if (!session?.accessJwt) return;

    const socket = io(`${API_URL}/chat`, {
      auth: { token: session.accessJwt, userDid: session.did },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      // Join the user-level room so the server can push global notifications
      socket.emit('join-user', { userDid: session.did });
    });

    socket.on('new-message', (data: any) => {
      const { conversationId, message, sender } = data;

      // Skip: we're already viewing this conversation in the drawer
      if (
        drawerState === 'conversation' &&
        activeConversationId === conversationId
      ) {
        return;
      }
      // Skip: on the full messages page for this conversation
      if (isOnMessagesPage && pathname?.includes(conversationId)) return;
      // Skip: own message
      if (sender?.did === session.did) return;

      // Increment unread count
      setUnreadCount(totalUnreadCount + 1);

      // Toast notification — clicking opens the drawer conversation
      toast.custom(
        (t) => (
          <div
            className={`${
              t.visible ? 'animate-in slide-in-from-bottom' : 'animate-out fade-out'
            } max-w-sm w-full bg-surface border border-border rounded-lg shadow-lg p-3 cursor-pointer`}
            onClick={() => {
              toast.dismiss(t.id);
              openConversation(conversationId);
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                {sender?.avatar ? (
                  <img
                    src={sender.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted text-sm font-bold">
                    {sender?.handle?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {sender?.displayName || sender?.handle || 'Someone'}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {message?.text || 'New message'}
                </p>
              </div>
            </div>
          </div>
        ),
        { duration: 4000, position: 'bottom-right' }
      );

      // One-time push notification prompt after first incoming message
      const { pushSupported: ps, pushPermission: pp, pushSubscribed: psub, pushSubscribe: psubFn } = pushStateRef.current;
      if (
        ps &&
        pp === 'default' &&
        !psub &&
        !pushPromptShownRef.current &&
        typeof localStorage !== 'undefined' &&
        !localStorage.getItem(PUSH_PROMPT_KEY)
      ) {
        pushPromptShownRef.current = true;
        localStorage.setItem(PUSH_PROMPT_KEY, '1');

        toast.custom(
          (t) => (
            <div
              className={`${
                t.visible ? 'animate-in slide-in-from-bottom' : 'animate-out fade-out'
              } max-w-sm w-full bg-surface border border-border rounded-lg shadow-lg p-4`}
            >
              <p className="text-sm font-medium text-text-primary mb-1">
                Never miss a message
              </p>
              <p className="text-xs text-text-muted mb-3">
                Enable push notifications to get alerts even when the tab is closed.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    toast.dismiss(t.id);
                    await psubFn();
                  }}
                  className="flex-1 px-3 py-1.5 bg-accent text-text-inverse text-xs font-medium rounded-md hover:bg-accent/90 transition-colors"
                >
                  Enable
                </button>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="px-3 py-1.5 text-text-muted text-xs rounded-md hover:bg-surface-hover transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
          ),
          { duration: 8000, position: 'bottom-right' }
        );
      }

      // Sound notification
      if (soundEnabled) {
        if (!audioRef.current) {
          audioRef.current = new Audio('/sounds/message.mp3');
          audioRef.current.volume = 0.3;
        }
        audioRef.current.play().catch(() => {
          // Autoplay blocked – silently ignore
        });
      }

      // Browser notification when tab is hidden
      if (
        desktopNotificationsEnabled &&
        document.hidden &&
        Notification.permission === 'granted'
      ) {
        new Notification(
          sender?.displayName || sender?.handle || 'New message',
          {
            body: message?.text || 'You have a new message',
            icon: sender?.avatar || '/icon-192.png',
            tag: `msg-${conversationId}`,
          }
        );
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // Only reconnect when the user changes — the effect captures the other
    // values it needs via refs/closure but we want this to stay stable.
  }, [user?.did]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + M — toggle drawer
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        const store = useMessagingStore.getState();
        if (store.drawerState === 'closed') {
          store.openDrawer();
        } else {
          store.closeDrawer();
        }
      }

      // Escape — close drawer (but not if minimized)
      if (
        e.key === 'Escape' &&
        drawerState !== 'closed' &&
        drawerState !== 'minimized'
      ) {
        closeDrawer();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerState, closeDrawer]);

  // ---------------------------------------------------------------------------
  // Auto-close when navigating to the full messages page
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (
      isOnMessagesPage &&
      drawerState !== 'closed' &&
      drawerState !== 'minimized'
    ) {
      closeDrawer();
    }
  }, [isOnMessagesPage]);

  return (
    <>
      {children}
      {user && !isOnMessagesPage && <MessageDrawer />}
      {user && !isOnMessagesPage && drawerState === 'minimized' && (
        <MinimizedBubble />
      )}
    </>
  );
}
