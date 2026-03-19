import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminNavStore {
  // Pinned nav items (stored as href strings)
  pinnedItems: string[];
  pinItem: (href: string) => void;
  unpinItem: (href: string) => void;
  isPinned: (href: string) => boolean;

  // Sidebar search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Expanded groups (persisted)
  expandedGroups: string[];
  toggleGroup: (groupId: string) => void;
  expandGroup: (groupId: string) => void;

  // Sidebar collapsed state
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAdminNavStore = create<AdminNavStore>()(
  persist(
    (set, get) => ({
      pinnedItems: [],

      pinItem: (href) => {
        set((state) => ({
          pinnedItems: state.pinnedItems.includes(href)
            ? state.pinnedItems
            : [...state.pinnedItems, href],
        }));
      },

      unpinItem: (href) => {
        set((state) => ({
          pinnedItems: state.pinnedItems.filter((h) => h !== href),
        }));
      },

      isPinned: (href) => {
        return get().pinnedItems.includes(href);
      },

      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),

      expandedGroups: ['identity', 'content'],

      toggleGroup: (groupId) => {
        set((state) => ({
          expandedGroups: state.expandedGroups.includes(groupId)
            ? state.expandedGroups.filter((id) => id !== groupId)
            : [...state.expandedGroups, groupId],
        }));
      },

      expandGroup: (groupId) => {
        set((state) => ({
          expandedGroups: state.expandedGroups.includes(groupId)
            ? state.expandedGroups
            : [...state.expandedGroups, groupId],
        }));
      },

      isSidebarCollapsed: false,
      toggleSidebar: () => {
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
      },
    }),
    {
      name: 'admin-nav',
      version: 1,
      partialize: (state) => ({
        pinnedItems: state.pinnedItems,
        expandedGroups: state.expandedGroups,
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    }
  )
);
