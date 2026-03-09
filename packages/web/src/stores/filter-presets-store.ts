import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string[]>;
  sort?: { key: string; direction: 'asc' | 'desc' | null };
  isDefault?: boolean;
  createdAt: string;
}

interface FilterPresetsStore {
  // Presets keyed by page identifier (e.g., 'admin-users', 'admin-reports')
  presets: Record<string, FilterPreset[]>;

  // Add a new preset for a page
  addPreset: (pageKey: string, preset: Omit<FilterPreset, 'id' | 'createdAt'>) => string;

  // Update an existing preset
  updatePreset: (pageKey: string, id: string, updates: Partial<Omit<FilterPreset, 'id' | 'createdAt'>>) => void;

  // Delete a preset
  deletePreset: (pageKey: string, id: string) => void;

  // Set a preset as the default for a page
  setDefault: (pageKey: string, id: string | null) => void;

  // Get the default preset for a page
  getDefault: (pageKey: string) => FilterPreset | null;

  // Get all presets for a page
  getPresets: (pageKey: string) => FilterPreset[];

  // Rename a preset
  renamePreset: (pageKey: string, id: string, name: string) => void;

  // Duplicate a preset
  duplicatePreset: (pageKey: string, id: string) => string;
}

export const useFilterPresetsStore = create<FilterPresetsStore>()(
  persist(
    (set, get) => ({
      presets: {},

      addPreset: (pageKey, preset) => {
        const id = nanoid();
        const newPreset: FilterPreset = {
          ...preset,
          id,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          presets: {
            ...state.presets,
            [pageKey]: [...(state.presets[pageKey] || []), newPreset],
          },
        }));

        return id;
      },

      updatePreset: (pageKey, id, updates) => {
        set((state) => ({
          presets: {
            ...state.presets,
            [pageKey]: (state.presets[pageKey] || []).map((preset) =>
              preset.id === id ? { ...preset, ...updates } : preset
            ),
          },
        }));
      },

      deletePreset: (pageKey, id) => {
        set((state) => ({
          presets: {
            ...state.presets,
            [pageKey]: (state.presets[pageKey] || []).filter((preset) => preset.id !== id),
          },
        }));
      },

      setDefault: (pageKey, id) => {
        set((state) => ({
          presets: {
            ...state.presets,
            [pageKey]: (state.presets[pageKey] || []).map((preset) => ({
              ...preset,
              isDefault: preset.id === id,
            })),
          },
        }));
      },

      getDefault: (pageKey) => {
        const presets = get().presets[pageKey] || [];
        return presets.find((preset) => preset.isDefault) || null;
      },

      getPresets: (pageKey) => {
        return get().presets[pageKey] || [];
      },

      renamePreset: (pageKey, id, name) => {
        set((state) => ({
          presets: {
            ...state.presets,
            [pageKey]: (state.presets[pageKey] || []).map((preset) =>
              preset.id === id ? { ...preset, name } : preset
            ),
          },
        }));
      },

      duplicatePreset: (pageKey, id) => {
        const presets = get().presets[pageKey] || [];
        const original = presets.find((p) => p.id === id);
        if (!original) return '';

        const newId = nanoid();
        const duplicate: FilterPreset = {
          ...original,
          id: newId,
          name: `${original.name} (copy)`,
          isDefault: false,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          presets: {
            ...state.presets,
            [pageKey]: [...(state.presets[pageKey] || []), duplicate],
          },
        }));

        return newId;
      },
    }),
    {
      name: 'admin-filter-presets',
      version: 1,
    }
  )
);
