import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface FeedPosition {
  scrollTop: number;
  currentIndex: number;
  timestamp: number;
}

interface FeedStore {
  positions: Record<string, FeedPosition>;

  // Actions
  savePosition: (feedType: string, scrollTop: number, currentIndex: number) => void;
  getPosition: (feedType: string) => FeedPosition | null;
  clearPosition: (feedType: string) => void;
  clearAllPositions: () => void;
}

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export const useFeedStore = create<FeedStore>()(
  persist(
    (set, get) => ({
      positions: {},

      savePosition: (feedType: string, scrollTop: number, currentIndex: number) => {
        set((state) => ({
          positions: {
            ...state.positions,
            [feedType]: {
              scrollTop,
              currentIndex,
              timestamp: Date.now(),
            },
          },
        }));
      },

      getPosition: (feedType: string) => {
        const position = get().positions[feedType];
        if (!position) return null;

        // Check if position is too old
        const age = Date.now() - position.timestamp;
        if (age > MAX_AGE_MS) {
          get().clearPosition(feedType);
          return null;
        }

        return position;
      },

      clearPosition: (feedType: string) => {
        set((state) => {
          const { [feedType]: _, ...rest } = state.positions;
          return { positions: rest };
        });
      },

      clearAllPositions: () => {
        set({ positions: {} });
      },
    }),
    {
      name: 'exprsn-feed',
      storage: createJSONStorage(() => sessionStorage), // Use sessionStorage for per-session memory
      partialize: (state) => ({ positions: state.positions }),
    }
  )
);
