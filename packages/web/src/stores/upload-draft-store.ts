import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface UploadDraft {
  id: string;
  file?: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  previewUrl?: string;
  title: string;
  description: string;
  tags: string[];
  visibility: 'public' | 'followers' | 'private' | 'unlisted';
  allowComments: boolean;
  allowDuets: boolean;
  allowStitches: boolean;
  coverImage?: {
    type: 'frame' | 'custom';
    data?: string; // base64 or URL
    timestamp?: number; // for frame selection
  };
  currentStep: number;
  completedSteps: number[];
  createdAt: string;
  updatedAt: string;
}

interface UploadDraftState {
  currentDraft: UploadDraft | null;
  drafts: UploadDraft[];
  lastSaved: string | null;
  autoSaveEnabled: boolean;

  // Actions
  createDraft: (file?: File) => string;
  updateDraft: (updates: Partial<Omit<UploadDraft, 'id' | 'createdAt'>>) => void;
  loadDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  clearCurrentDraft: () => void;
  setCurrentStep: (step: number) => void;
  markStepCompleted: (step: number) => void;
  getAllDrafts: () => UploadDraft[];
  setAutoSave: (enabled: boolean) => void;
}

const createEmptyDraft = (file?: File): UploadDraft => {
  const now = new Date().toISOString();
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file: file ? {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    } : undefined,
    title: '',
    description: '',
    tags: [],
    visibility: 'public',
    allowComments: true,
    allowDuets: true,
    allowStitches: true,
    currentStep: 0,
    completedSteps: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const useUploadDraftStore = create<UploadDraftState>()(
  persist(
    (set, get) => ({
      currentDraft: null,
      drafts: [],
      lastSaved: null,
      autoSaveEnabled: true,

      createDraft: (file?: File) => {
        const draft = createEmptyDraft(file);
        set((state) => ({
          currentDraft: draft,
          drafts: [...state.drafts, draft],
          lastSaved: new Date().toISOString(),
        }));
        return draft.id;
      },

      updateDraft: (updates: Partial<Omit<UploadDraft, 'id' | 'createdAt'>>) => {
        const state = get();
        if (!state.currentDraft) return;

        const updatedDraft = {
          ...state.currentDraft,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        set({
          currentDraft: updatedDraft,
          drafts: state.drafts.map((d) =>
            d.id === updatedDraft.id ? updatedDraft : d
          ),
          lastSaved: new Date().toISOString(),
        });
      },

      loadDraft: (id: string) => {
        const state = get();
        const draft = state.drafts.find((d) => d.id === id);
        if (draft) {
          set({ currentDraft: draft });
        }
      },

      deleteDraft: (id: string) => {
        const state = get();
        set({
          drafts: state.drafts.filter((d) => d.id !== id),
          currentDraft: state.currentDraft?.id === id ? null : state.currentDraft,
        });
      },

      clearCurrentDraft: () => {
        const state = get();
        if (state.currentDraft) {
          set({
            drafts: state.drafts.filter((d) => d.id !== state.currentDraft?.id),
            currentDraft: null,
            lastSaved: null,
          });
        }
      },

      setCurrentStep: (step: number) => {
        get().updateDraft({ currentStep: step });
      },

      markStepCompleted: (step: number) => {
        const state = get();
        if (!state.currentDraft) return;

        const completedSteps = [...state.currentDraft.completedSteps];
        if (!completedSteps.includes(step)) {
          completedSteps.push(step);
          get().updateDraft({ completedSteps });
        }
      },

      getAllDrafts: () => {
        return get().drafts;
      },

      setAutoSave: (enabled: boolean) => {
        set({ autoSaveEnabled: enabled });
      },
    }),
    {
      name: 'exprsn-upload-drafts',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentDraft: state.currentDraft,
        drafts: state.drafts,
        lastSaved: state.lastSaved,
        autoSaveEnabled: state.autoSaveEnabled,
      }),
    }
  )
);
