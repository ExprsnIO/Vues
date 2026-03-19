import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type DrawerState = 'closed' | 'list' | 'conversation' | 'new' | 'minimized';

interface MessagingState {
  drawerState: DrawerState;
  activeConversationId: string | null;
  targetUserDid: string | null;
  totalUnreadCount: number;
  soundEnabled: boolean;
  desktopNotificationsEnabled: boolean;

  // Actions
  openDrawer: () => void;
  openConversation: (conversationId: string) => void;
  openNewConversation: (targetDid?: string) => void;
  minimize: () => void;
  closeDrawer: () => void;
  setUnreadCount: (count: number) => void;
  decrementUnread: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setDesktopNotificationsEnabled: (enabled: boolean) => void;
}

export const useMessagingStore = create<MessagingState>()(
  persist(
    (set) => ({
      drawerState: 'closed',
      activeConversationId: null,
      targetUserDid: null,
      totalUnreadCount: 0,
      soundEnabled: true,
      desktopNotificationsEnabled: false,

      openDrawer: () => set({ drawerState: 'list', targetUserDid: null }),

      openConversation: (conversationId) =>
        set({
          drawerState: 'conversation',
          activeConversationId: conversationId,
          targetUserDid: null,
        }),

      openNewConversation: (targetDid) =>
        set({
          drawerState: 'new',
          targetUserDid: targetDid || null,
          activeConversationId: null,
        }),

      minimize: () => set({ drawerState: 'minimized' }),

      closeDrawer: () =>
        set({
          drawerState: 'closed',
          activeConversationId: null,
          targetUserDid: null,
        }),

      setUnreadCount: (count) => set({ totalUnreadCount: count }),

      decrementUnread: () =>
        set((state) => ({
          totalUnreadCount: Math.max(0, state.totalUnreadCount - 1),
        })),

      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setDesktopNotificationsEnabled: (enabled) =>
        set({ desktopNotificationsEnabled: enabled }),
    }),
    {
      name: 'exprsn-messaging',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        soundEnabled: state.soundEnabled,
        desktopNotificationsEnabled: state.desktopNotificationsEnabled,
        // Don't persist drawer state or active conversation
      }),
    }
  )
);
