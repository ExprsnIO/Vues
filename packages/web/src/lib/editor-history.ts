'use client';

import type { EditorAction, EditorState, EditorElement, AudioTrack } from './editor-context';

// ============================================================================
// History Types
// ============================================================================

export interface HistoryEntry {
  id: string;
  action: EditorAction;
  inverseAction: EditorAction;
  timestamp: number;
  description: string;
  batchId?: string; // For grouping related actions
}

export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number; // Points to last applied entry (-1 means empty)
  maxEntries: number;
}

// Actions that should NOT be recorded in history
const NON_RECORDABLE_ACTIONS: EditorAction['type'][] = [
  'SET_FRAME',
  'SET_PLAYING',
  'SET_ZOOM',
  'SET_TOOL',
  'SET_MODE',
  'SELECT_ELEMENT',
  'DESELECT_ALL',
  'TOGGLE_SNAP_GRID',
  'TOGGLE_SNAP_BEATS',
  'TOGGLE_GUIDES',
  'TOGGLE_SAFE_ZONE',
];

// ============================================================================
// History Functions
// ============================================================================

export function createInitialHistoryState(maxEntries = 50): HistoryState {
  return {
    entries: [],
    currentIndex: -1,
    maxEntries,
  };
}

export function isRecordableAction(action: EditorAction): boolean {
  return !NON_RECORDABLE_ACTIONS.includes(action.type);
}

export function generateInverseAction(
  action: EditorAction,
  stateBefore: EditorState
): EditorAction | null {
  switch (action.type) {
    case 'UPDATE_ELEMENT': {
      const element = stateBefore.project.elements.find(el => el.id === action.id);
      if (!element) return null;

      // Capture only the properties that were changed
      const updates: Partial<EditorElement> = {};
      for (const key of Object.keys(action.updates) as (keyof EditorElement)[]) {
        updates[key] = element[key] as never;
      }

      return { type: 'UPDATE_ELEMENT', id: action.id, updates };
    }

    case 'ADD_ELEMENT': {
      return { type: 'DELETE_ELEMENTS', ids: [action.element.id] };
    }

    case 'DELETE_ELEMENTS': {
      // Need to restore all deleted elements
      const deletedElements = stateBefore.project.elements.filter(
        el => action.ids.includes(el.id)
      );
      // Return a batch restore action - we'll handle this specially
      return {
        type: 'RESTORE_ELEMENTS',
        elements: deletedElements,
      } as unknown as EditorAction;
    }

    case 'ADD_KEYFRAME': {
      return {
        type: 'DELETE_KEYFRAME',
        elementId: action.elementId,
        property: action.property,
        frame: action.keyframe.frame,
      } as unknown as EditorAction;
    }

    case 'UPDATE_KEYFRAME': {
      const element = stateBefore.project.elements.find(el => el.id === action.elementId);
      if (!element) return null;
      const keyframes = element.keyframes[action.property];
      if (!keyframes || !keyframes[action.keyframeIndex]) return null;

      return {
        type: 'UPDATE_KEYFRAME',
        elementId: action.elementId,
        property: action.property,
        keyframeIndex: action.keyframeIndex,
        updates: { ...keyframes[action.keyframeIndex] },
      };
    }

    case 'UPDATE_EFFECTS': {
      const element = stateBefore.project.elements.find(el => el.id === action.elementId);
      if (!element) return null;
      return { type: 'UPDATE_EFFECTS', elementId: action.elementId, effects: [...element.effects] };
    }

    case 'UPDATE_GLOBAL_EFFECTS': {
      return { type: 'UPDATE_GLOBAL_EFFECTS', effects: [...stateBefore.project.globalEffects] };
    }

    case 'UPDATE_NODE_GRAPH': {
      return {
        type: 'UPDATE_NODE_GRAPH',
        nodes: [...stateBefore.project.nodeGraph.nodes],
        connections: [...stateBefore.project.nodeGraph.connections],
      };
    }

    case 'ADD_AUDIO_TRACK': {
      return { type: 'DELETE_AUDIO_TRACK', id: action.track.id } as unknown as EditorAction;
    }

    case 'UPDATE_AUDIO_TRACK': {
      const track = stateBefore.project.audioTracks.find(t => t.id === action.id);
      if (!track) return null;

      const updates: Partial<AudioTrack> = {};
      for (const key of Object.keys(action.updates) as (keyof AudioTrack)[]) {
        updates[key] = track[key] as never;
      }

      return { type: 'UPDATE_AUDIO_TRACK', id: action.id, updates };
    }

    case 'SET_PROJECT': {
      return { type: 'SET_PROJECT', project: stateBefore.project };
    }

    case 'MOVE_ELEMENT': {
      const el = stateBefore.project.elements.find(e => e.id === (action as { id: string }).id);
      if (!el) return null;
      return {
        type: 'MOVE_ELEMENT',
        id: (action as { id: string }).id,
        startFrame: el.startFrame,
        endFrame: el.endFrame,
      } as unknown as EditorAction;
    }

    case 'TRIM_ELEMENT': {
      const el = stateBefore.project.elements.find(e => e.id === (action as { id: string }).id);
      if (!el) return null;
      return {
        type: 'TRIM_ELEMENT',
        id: (action as { id: string }).id,
        startFrame: el.startFrame,
        endFrame: el.endFrame,
      } as unknown as EditorAction;
    }

    case 'GROUP_ELEMENTS': {
      return {
        type: 'UNGROUP_ELEMENTS',
        groupId: (action as { group: { id: string } }).group.id,
      } as unknown as EditorAction;
    }

    case 'UNGROUP_ELEMENTS': {
      const groups = (stateBefore as EditorState & { groups?: Map<string, unknown> }).groups;
      const group = groups?.get((action as { groupId: string }).groupId);
      if (!group) return null;
      return {
        type: 'GROUP_ELEMENTS',
        group,
      } as unknown as EditorAction;
    }

    default:
      return null;
  }
}

export function getActionDescription(action: EditorAction, state: EditorState): string {
  switch (action.type) {
    case 'UPDATE_ELEMENT': {
      const element = state.project.elements.find(el => el.id === action.id);
      const name = element?.name || 'Element';
      const props = Object.keys(action.updates).join(', ');
      return `Update ${name} (${props})`;
    }
    case 'ADD_ELEMENT':
      return `Add ${action.element.name || action.element.type}`;
    case 'DELETE_ELEMENTS':
      return `Delete ${action.ids.length} element(s)`;
    case 'ADD_KEYFRAME':
      return `Add keyframe`;
    case 'UPDATE_KEYFRAME':
      return `Update keyframe`;
    case 'UPDATE_EFFECTS':
      return `Update effects`;
    case 'UPDATE_GLOBAL_EFFECTS':
      return `Update global effects`;
    case 'UPDATE_NODE_GRAPH':
      return `Update node graph`;
    case 'ADD_AUDIO_TRACK':
      return `Add audio track`;
    case 'UPDATE_AUDIO_TRACK':
      return `Update audio track`;
    case 'SET_PROJECT':
      return `Load project`;
    case 'MOVE_ELEMENT':
      return `Move element`;
    case 'TRIM_ELEMENT':
      return `Trim element`;
    case 'GROUP_ELEMENTS':
      return `Group elements`;
    case 'UNGROUP_ELEMENTS':
      return `Ungroup elements`;
    default:
      return action.type;
  }
}

export function addHistoryEntry(
  historyState: HistoryState,
  entry: HistoryEntry
): HistoryState {
  // Remove any entries after current index (redo history is discarded on new action)
  const entries = historyState.entries.slice(0, historyState.currentIndex + 1);

  // Add new entry
  entries.push(entry);

  // Trim to max entries
  while (entries.length > historyState.maxEntries) {
    entries.shift();
  }

  return {
    ...historyState,
    entries,
    currentIndex: entries.length - 1,
  };
}

export function canUndo(historyState: HistoryState): boolean {
  return historyState.currentIndex >= 0;
}

export function canRedo(historyState: HistoryState): boolean {
  return historyState.currentIndex < historyState.entries.length - 1;
}

export function getUndoAction(historyState: HistoryState): EditorAction | null {
  if (!canUndo(historyState)) return null;
  return historyState.entries[historyState.currentIndex].inverseAction;
}

export function getRedoAction(historyState: HistoryState): EditorAction | null {
  if (!canRedo(historyState)) return null;
  return historyState.entries[historyState.currentIndex + 1].action;
}

export function moveHistoryIndex(
  historyState: HistoryState,
  direction: 'undo' | 'redo'
): HistoryState {
  if (direction === 'undo' && !canUndo(historyState)) return historyState;
  if (direction === 'redo' && !canRedo(historyState)) return historyState;

  return {
    ...historyState,
    currentIndex: direction === 'undo'
      ? historyState.currentIndex - 1
      : historyState.currentIndex + 1,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

let currentBatchId: string | null = null;

export function startBatch(): string {
  currentBatchId = crypto.randomUUID();
  return currentBatchId;
}

export function endBatch(): void {
  currentBatchId = null;
}

export function getCurrentBatchId(): string | null {
  return currentBatchId;
}

// Merge consecutive similar actions (e.g., multiple position updates during drag)
export function shouldMergeWithPrevious(
  prevEntry: HistoryEntry | undefined,
  action: EditorAction,
  batchId: string | null
): boolean {
  if (!prevEntry) return false;

  // If same batch, merge
  if (batchId && prevEntry.batchId === batchId) return true;

  // Merge consecutive updates to same element within 500ms
  if (
    action.type === 'UPDATE_ELEMENT' &&
    prevEntry.action.type === 'UPDATE_ELEMENT' &&
    action.id === (prevEntry.action as { id: string }).id &&
    Date.now() - prevEntry.timestamp < 500
  ) {
    // Only merge if updating same properties
    const prevKeys = Object.keys((prevEntry.action as { updates: object }).updates);
    const newKeys = Object.keys(action.updates);
    if (prevKeys.length === newKeys.length && prevKeys.every(k => newKeys.includes(k))) {
      return true;
    }
  }

  return false;
}
