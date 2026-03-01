'use client';

import { createContext, useContext, useCallback, useRef, useEffect, useReducer, useMemo } from 'react';
import type { EffectInstance } from '@/components/editor/effects';
import type { NodeInstance, NodeConnection } from '@/components/editor/nodes/engine/NodeTypes';
import {
  type HistoryState,
  type HistoryEntry,
  createInitialHistoryState,
  isRecordableAction,
  generateInverseAction,
  getActionDescription,
  addHistoryEntry,
  canUndo,
  canRedo,
  getUndoAction,
  getRedoAction,
  moveHistoryIndex,
  getCurrentBatchId,
  shouldMergeWithPrevious,
  startBatch,
  endBatch,
} from './editor-history';

// ============================================================================
// Editor Types
// ============================================================================

export interface EditorElement {
  id: string;
  type: 'video' | 'image' | 'text' | 'shape' | 'audio';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  scale: { x: number; y: number };
  anchor: { x: number; y: number };
  content?: string;
  color?: string;
  src?: string;
  startFrame: number;
  endFrame: number;
  locked: boolean;
  visible: boolean;
  blendMode: string;
  effects: EffectInstance[];
  keyframes: Record<string, Keyframe[]>;
}

export interface Keyframe {
  frame: number;
  value: number | string | { x: number; y: number };
  easing: string;
  expression?: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  src: string;
  startFrame: number;
  endFrame: number;
  volume: number;
  muted: boolean;
  waveformData?: number[];
  beats?: { time: number; strength: number }[];
  bpm?: number;
  // Audio ducking properties
  ducking?: {
    enabled: boolean;
    threshold: number; // 0-1
    reduction: number; // dB reduction (negative value)
    attack: number; // ms
    release: number; // ms
    sidechain?: string; // Track ID to sidechain from
  };
}

// Element grouping for multi-select operations
export interface ElementGroup {
  id: string;
  name: string;
  elementIds: string[];
  color: string;
  locked: boolean;
}

export interface EditorProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  elements: EditorElement[];
  audioTracks: AudioTrack[];
  nodeGraph: {
    nodes: NodeInstance[];
    connections: NodeConnection[];
  };
  globalEffects: EffectInstance[];
  groups: ElementGroup[];
  markers?: { frame: number; label: string; color: string }[];
}

export type EditorMode = 'canvas' | 'nodes';
export type SelectedTool = 'select' | 'move' | 'scale' | 'rotate' | 'text' | 'shape' | 'pen';

export type EditorExperienceMode = 'beginner' | 'pro';

export interface EditorState {
  project: EditorProject;
  selectedElementIds: string[];
  selectedTool: SelectedTool;
  currentFrame: number;
  isPlaying: boolean;
  zoom: number;
  mode: EditorMode;
  editorMode: EditorExperienceMode;
  snapToGrid: boolean;
  snapToBeats: boolean;
  snapToClips: boolean; // New - snap to clip edges
  showGuides: boolean;
  showSafeZone: boolean;
  showSnapLines: boolean; // New - visual snap line indicators
  nodeGraphEffects: EffectInstance[];
  history: HistoryState;
  isHistoryAction: boolean; // Flag to prevent recording undo/redo actions
}

export interface EditorContextType {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  selectElement: (id: string, additive?: boolean) => void;
  updateElement: (id: string, updates: Partial<EditorElement>) => void;
  addElement: (element: Omit<EditorElement, 'id'>) => void;
  deleteElements: (ids: string[]) => void;
  addKeyframe: (elementId: string, property: string, keyframe: Keyframe) => void;
  updateKeyframe: (elementId: string, property: string, keyframeIndex: number, updates: Partial<Keyframe>) => void;
  setCurrentFrame: (frame: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  // History operations
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  historyEntries: HistoryEntry[];
  // Group operations
  groupElements: (elementIds: string[], name?: string) => void;
  ungroupElements: (groupId: string) => void;
  // Element move/trim
  moveElement: (id: string, startFrame: number, endFrame: number) => void;
  trimElement: (id: string, startFrame: number, endFrame: number) => void;
  // Batch operations (for grouping related edits)
  startBatch: () => string;
  endBatch: () => void;
}

export type EditorAction =
  | { type: 'SET_PROJECT'; project: EditorProject }
  | { type: 'SELECT_ELEMENT'; id: string; additive?: boolean }
  | { type: 'DESELECT_ALL' }
  | { type: 'UPDATE_ELEMENT'; id: string; updates: Partial<EditorElement> }
  | { type: 'ADD_ELEMENT'; element: EditorElement }
  | { type: 'DELETE_ELEMENTS'; ids: string[] }
  | { type: 'RESTORE_ELEMENTS'; elements: EditorElement[] }
  | { type: 'SET_TOOL'; tool: SelectedTool }
  | { type: 'SET_FRAME'; frame: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_MODE'; mode: EditorMode }
  | { type: 'SET_EDITOR_MODE'; editorMode: EditorExperienceMode }
  | { type: 'ADD_KEYFRAME'; elementId: string; property: string; keyframe: Keyframe }
  | { type: 'UPDATE_KEYFRAME'; elementId: string; property: string; keyframeIndex: number; updates: Partial<Keyframe> }
  | { type: 'DELETE_KEYFRAME'; elementId: string; property: string; frame: number }
  | { type: 'UPDATE_EFFECTS'; elementId: string; effects: EffectInstance[] }
  | { type: 'UPDATE_GLOBAL_EFFECTS'; effects: EffectInstance[] }
  | { type: 'UPDATE_NODE_GRAPH'; nodes: NodeInstance[]; connections: NodeConnection[] }
  | { type: 'ADD_AUDIO_TRACK'; track: AudioTrack }
  | { type: 'UPDATE_AUDIO_TRACK'; id: string; updates: Partial<AudioTrack> }
  | { type: 'DELETE_AUDIO_TRACK'; id: string }
  | { type: 'TOGGLE_SNAP_GRID' }
  | { type: 'TOGGLE_SNAP_BEATS' }
  | { type: 'TOGGLE_SNAP_CLIPS' }
  | { type: 'TOGGLE_GUIDES' }
  | { type: 'TOGGLE_SAFE_ZONE' }
  | { type: 'TOGGLE_SNAP_LINES' }
  | { type: 'SET_NODE_GRAPH_EFFECTS'; effects: EffectInstance[] }
  // History actions
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RECORD_HISTORY'; entry: HistoryEntry }
  | { type: 'SET_HISTORY_ACTION'; isHistoryAction: boolean }
  // Element move/trim actions
  | { type: 'MOVE_ELEMENT'; id: string; startFrame: number; endFrame: number }
  | { type: 'TRIM_ELEMENT'; id: string; startFrame: number; endFrame: number }
  // Group actions
  | { type: 'GROUP_ELEMENTS'; group: ElementGroup }
  | { type: 'UNGROUP_ELEMENTS'; groupId: string }
  | { type: 'UPDATE_GROUP'; id: string; updates: Partial<ElementGroup> }
  // Marker actions
  | { type: 'ADD_MARKER'; marker: { frame: number; label: string; color: string } }
  | { type: 'DELETE_MARKER'; frame: number };

// ============================================================================
// Editor Context
// ============================================================================

const EditorContext = createContext<EditorContextType | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}

export function createDefaultProject(): EditorProject {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 300,
    elements: [
      {
        id: 'demo-shape',
        type: 'shape',
        name: 'Shape 1',
        x: 340,
        y: 760,
        width: 400,
        height: 400,
        rotation: 0,
        opacity: 1,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        color: '#6366f1',
        startFrame: 0,
        endFrame: 300,
        locked: false,
        visible: true,
        blendMode: 'normal',
        effects: [],
        keyframes: {},
      },
      {
        id: 'demo-text',
        type: 'text',
        name: 'Title',
        x: 440,
        y: 500,
        width: 200,
        height: 60,
        rotation: 0,
        opacity: 1,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        content: 'Sample Text',
        color: '#ffffff',
        startFrame: 0,
        endFrame: 300,
        locked: false,
        visible: true,
        blendMode: 'normal',
        effects: [],
        keyframes: {},
      },
    ],
    audioTracks: [],
    nodeGraph: { nodes: [], connections: [] },
    globalEffects: [],
    groups: [],
    markers: [],
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: { ...action.project, groups: action.project.groups || [] } };

    case 'SELECT_ELEMENT':
      if (action.additive) {
        const exists = state.selectedElementIds.includes(action.id);
        return {
          ...state,
          selectedElementIds: exists
            ? state.selectedElementIds.filter(id => id !== action.id)
            : [...state.selectedElementIds, action.id],
        };
      }
      return { ...state, selectedElementIds: [action.id] };

    case 'DESELECT_ALL':
      return { ...state, selectedElementIds: [] };

    case 'UPDATE_ELEMENT':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.map(el =>
            el.id === action.id ? { ...el, ...action.updates } : el
          ),
        },
      };

    case 'ADD_ELEMENT':
      return {
        ...state,
        project: {
          ...state.project,
          elements: [...state.project.elements, action.element],
        },
        selectedElementIds: [action.element.id],
      };

    case 'DELETE_ELEMENTS': {
      // Also remove elements from any groups they belong to
      const updatedGroups = state.project.groups.map(group => ({
        ...group,
        elementIds: group.elementIds.filter(id => !action.ids.includes(id)),
      })).filter(group => group.elementIds.length > 0);

      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.filter(el => !action.ids.includes(el.id)),
          groups: updatedGroups,
        },
        selectedElementIds: state.selectedElementIds.filter(id => !action.ids.includes(id)),
      };
    }

    case 'RESTORE_ELEMENTS':
      return {
        ...state,
        project: {
          ...state.project,
          elements: [...state.project.elements, ...action.elements],
        },
      };

    case 'SET_TOOL':
      return { ...state, selectedTool: action.tool };

    case 'SET_FRAME': {
      const newFrame = Math.max(0, Math.min(action.frame, state.project.duration - 1));
      return { ...state, currentFrame: newFrame };
    }

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(25, Math.min(400, action.zoom)) };

    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'SET_EDITOR_MODE':
      return { ...state, editorMode: action.editorMode };

    case 'ADD_KEYFRAME':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.map(el => {
            if (el.id !== action.elementId) return el;
            const keyframes = { ...el.keyframes };
            if (!keyframes[action.property]) keyframes[action.property] = [];
            keyframes[action.property] = keyframes[action.property].filter(
              k => k.frame !== action.keyframe.frame
            );
            keyframes[action.property].push(action.keyframe);
            keyframes[action.property].sort((a, b) => a.frame - b.frame);
            return { ...el, keyframes };
          }),
        },
      };

    case 'UPDATE_KEYFRAME':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.map(el => {
            if (el.id !== action.elementId) return el;
            const keyframes = { ...el.keyframes };
            if (!keyframes[action.property]) return el;
            keyframes[action.property] = keyframes[action.property].map((kf, idx) =>
              idx === action.keyframeIndex ? { ...kf, ...action.updates } : kf
            );
            return { ...el, keyframes };
          }),
        },
      };

    case 'DELETE_KEYFRAME':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.map(el => {
            if (el.id !== action.elementId) return el;
            const keyframes = { ...el.keyframes };
            if (!keyframes[action.property]) return el;
            keyframes[action.property] = keyframes[action.property].filter(
              kf => kf.frame !== action.frame
            );
            return { ...el, keyframes };
          }),
        },
      };

    case 'UPDATE_EFFECTS':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.map(el =>
            el.id === action.elementId ? { ...el, effects: action.effects } : el
          ),
        },
      };

    case 'UPDATE_GLOBAL_EFFECTS':
      return {
        ...state,
        project: { ...state.project, globalEffects: action.effects },
      };

    case 'UPDATE_NODE_GRAPH':
      return {
        ...state,
        project: {
          ...state.project,
          nodeGraph: { nodes: action.nodes, connections: action.connections },
        },
      };

    case 'ADD_AUDIO_TRACK':
      return {
        ...state,
        project: {
          ...state.project,
          audioTracks: [...state.project.audioTracks, action.track],
        },
      };

    case 'UPDATE_AUDIO_TRACK':
      return {
        ...state,
        project: {
          ...state.project,
          audioTracks: state.project.audioTracks.map(t =>
            t.id === action.id ? { ...t, ...action.updates } : t
          ),
        },
      };

    case 'DELETE_AUDIO_TRACK':
      return {
        ...state,
        project: {
          ...state.project,
          audioTracks: state.project.audioTracks.filter(t => t.id !== action.id),
        },
      };

    case 'TOGGLE_SNAP_GRID':
      return { ...state, snapToGrid: !state.snapToGrid };

    case 'TOGGLE_SNAP_BEATS':
      return { ...state, snapToBeats: !state.snapToBeats };

    case 'TOGGLE_SNAP_CLIPS':
      return { ...state, snapToClips: !state.snapToClips };

    case 'TOGGLE_GUIDES':
      return { ...state, showGuides: !state.showGuides };

    case 'TOGGLE_SAFE_ZONE':
      return { ...state, showSafeZone: !state.showSafeZone };

    case 'TOGGLE_SNAP_LINES':
      return { ...state, showSnapLines: !state.showSnapLines };

    case 'SET_NODE_GRAPH_EFFECTS':
      return { ...state, nodeGraphEffects: action.effects };

    // History actions
    case 'UNDO': {
      if (!canUndo(state.history)) return state;
      const inverseAction = getUndoAction(state.history);
      if (!inverseAction) return state;

      // Apply inverse action and update history index
      const newHistory = moveHistoryIndex(state.history, 'undo');
      const newState = editorReducer(
        { ...state, history: newHistory, isHistoryAction: true },
        inverseAction
      );
      return { ...newState, isHistoryAction: false };
    }

    case 'REDO': {
      if (!canRedo(state.history)) return state;
      const redoAction = getRedoAction(state.history);
      if (!redoAction) return state;

      // Apply redo action and update history index
      const newHistory = moveHistoryIndex(state.history, 'redo');
      const newState = editorReducer(
        { ...state, history: newHistory, isHistoryAction: true },
        redoAction
      );
      return { ...newState, isHistoryAction: false };
    }

    case 'RECORD_HISTORY':
      return {
        ...state,
        history: addHistoryEntry(state.history, action.entry),
      };

    case 'SET_HISTORY_ACTION':
      return { ...state, isHistoryAction: action.isHistoryAction };

    // Move/Trim actions
    case 'MOVE_ELEMENT':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.map(el =>
            el.id === action.id
              ? { ...el, startFrame: action.startFrame, endFrame: action.endFrame }
              : el
          ),
        },
      };

    case 'TRIM_ELEMENT':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.map(el =>
            el.id === action.id
              ? { ...el, startFrame: action.startFrame, endFrame: action.endFrame }
              : el
          ),
        },
      };

    // Group actions
    case 'GROUP_ELEMENTS':
      return {
        ...state,
        project: {
          ...state.project,
          groups: [...state.project.groups, action.group],
        },
      };

    case 'UNGROUP_ELEMENTS':
      return {
        ...state,
        project: {
          ...state.project,
          groups: state.project.groups.filter(g => g.id !== action.groupId),
        },
      };

    case 'UPDATE_GROUP':
      return {
        ...state,
        project: {
          ...state.project,
          groups: state.project.groups.map(g =>
            g.id === action.id ? { ...g, ...action.updates } : g
          ),
        },
      };

    // Marker actions
    case 'ADD_MARKER':
      return {
        ...state,
        project: {
          ...state.project,
          markers: [...(state.project.markers || []), action.marker],
        },
      };

    case 'DELETE_MARKER':
      return {
        ...state,
        project: {
          ...state.project,
          markers: (state.project.markers || []).filter(m => m.frame !== action.frame),
        },
      };

    default:
      return state;
  }
}

export function createInitialState(project?: EditorProject): EditorState {
  const proj = project || createDefaultProject();
  return {
    project: { ...proj, groups: proj.groups || [], markers: proj.markers || [] },
    selectedElementIds: [],
    selectedTool: 'select',
    currentFrame: 0,
    isPlaying: false,
    zoom: 100,
    mode: 'canvas',
    editorMode: 'pro',
    snapToGrid: true,
    snapToBeats: false,
    snapToClips: true,
    showGuides: true,
    showSafeZone: true,
    showSnapLines: true,
    nodeGraphEffects: [],
    history: createInitialHistoryState(50),
    isHistoryAction: false,
  };
}

// History-aware dispatch wrapper
function createHistoryDispatch(
  baseDispatch: React.Dispatch<EditorAction>,
  stateRef: React.MutableRefObject<EditorState>
): React.Dispatch<EditorAction> {
  return (action: EditorAction) => {
    const currentState = stateRef.current;

    // Don't record history for non-recordable actions or during undo/redo
    if (
      currentState.isHistoryAction ||
      !isRecordableAction(action) ||
      action.type === 'UNDO' ||
      action.type === 'REDO' ||
      action.type === 'RECORD_HISTORY' ||
      action.type === 'SET_HISTORY_ACTION'
    ) {
      baseDispatch(action);
      return;
    }

    // Generate inverse action before applying
    const inverseAction = generateInverseAction(action, currentState);

    // Apply the action
    baseDispatch(action);

    // Record in history if we have an inverse
    if (inverseAction) {
      const batchId = getCurrentBatchId();
      const prevEntry = currentState.history.entries[currentState.history.currentIndex];

      // Check if we should merge with previous entry
      if (shouldMergeWithPrevious(prevEntry, action, batchId)) {
        // Update the previous entry's action but keep its original inverse
        // This way undo goes back to the original state
        return;
      }

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        action,
        inverseAction,
        timestamp: Date.now(),
        description: getActionDescription(action, currentState),
        batchId: batchId || undefined,
      };

      baseDispatch({ type: 'RECORD_HISTORY', entry });
    }
  };
}

// EditorProvider component
export function EditorProvider({
  children,
  initialProject,
}: {
  children: React.ReactNode;
  initialProject?: EditorProject;
}) {
  const [state, baseDispatch] = useReducer(editorReducer, createInitialState(initialProject));
  const stateRef = useRef(state);
  stateRef.current = state;

  // Create history-aware dispatch
  const dispatch = useMemo(
    () => createHistoryDispatch(baseDispatch, stateRef),
    []
  );

  // Playback timer
  useEffect(() => {
    if (!state.isPlaying) return;

    const interval = setInterval(() => {
      dispatch({
        type: 'SET_FRAME',
        frame: stateRef.current.currentFrame + 1 >= stateRef.current.project.duration
          ? 0
          : stateRef.current.currentFrame + 1,
      });
      if (stateRef.current.currentFrame + 1 >= stateRef.current.project.duration) {
        dispatch({ type: 'SET_PLAYING', playing: false });
      }
    }, 1000 / state.project.fps);

    return () => clearInterval(interval);
  }, [state.isPlaying, state.project.fps, dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
        return;
      }

      // Group: Ctrl/Cmd + G
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        if (stateRef.current.selectedElementIds.length > 1) {
          const groupColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];
          const group: ElementGroup = {
            id: crypto.randomUUID(),
            name: `Group ${stateRef.current.project.groups.length + 1}`,
            elementIds: [...stateRef.current.selectedElementIds],
            color: groupColors[stateRef.current.project.groups.length % groupColors.length],
            locked: false,
          };
          dispatch({ type: 'GROUP_ELEMENTS', group });
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        dispatch({ type: 'SET_PLAYING', playing: !stateRef.current.isPlaying });
      }
      if (e.key === 'v') dispatch({ type: 'SET_TOOL', tool: 'select' });
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) dispatch({ type: 'SET_TOOL', tool: 'scale' });
      if (e.key === 'r') dispatch({ type: 'SET_TOOL', tool: 'rotate' });
      if (e.key === 't') dispatch({ type: 'SET_TOOL', tool: 'text' });
      if (e.key === 'u') dispatch({ type: 'SET_TOOL', tool: 'shape' });
      if ((e.key === 'Delete' || e.key === 'Backspace') && stateRef.current.selectedElementIds.length > 0) {
        e.preventDefault();
        dispatch({ type: 'DELETE_ELEMENTS', ids: stateRef.current.selectedElementIds });
      }
      if (e.key === 'Escape') dispatch({ type: 'DESELECT_ALL' });
      if (e.key === 'Home') dispatch({ type: 'SET_FRAME', frame: 0 });
      if (e.key === 'End') dispatch({ type: 'SET_FRAME', frame: stateRef.current.project.duration - 1 });
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dispatch({ type: 'SET_FRAME', frame: stateRef.current.currentFrame - 1 });
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        dispatch({ type: 'SET_FRAME', frame: stateRef.current.currentFrame + 1 });
      }
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault();
        dispatch({ type: 'SET_MODE', mode: stateRef.current.mode === 'canvas' ? 'nodes' : 'canvas' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  // Computed values for history
  const canUndoValue = canUndo(state.history);
  const canRedoValue = canRedo(state.history);

  const contextValue: EditorContextType = useMemo(() => ({
    state,
    dispatch,
    selectElement: (id, additive) => dispatch({ type: 'SELECT_ELEMENT', id, additive }),
    updateElement: (id, updates) => dispatch({ type: 'UPDATE_ELEMENT', id, updates }),
    addElement: (element) => dispatch({ type: 'ADD_ELEMENT', element: { ...element, id: crypto.randomUUID() } as EditorElement }),
    deleteElements: (ids) => dispatch({ type: 'DELETE_ELEMENTS', ids }),
    addKeyframe: (elementId, property, keyframe) => dispatch({ type: 'ADD_KEYFRAME', elementId, property, keyframe }),
    updateKeyframe: (elementId, property, keyframeIndex, updates) => dispatch({ type: 'UPDATE_KEYFRAME', elementId, property, keyframeIndex, updates }),
    setCurrentFrame: (frame) => dispatch({ type: 'SET_FRAME', frame }),
    play: () => dispatch({ type: 'SET_PLAYING', playing: true }),
    pause: () => dispatch({ type: 'SET_PLAYING', playing: false }),
    togglePlay: () => dispatch({ type: 'SET_PLAYING', playing: !stateRef.current.isPlaying }),
    // History operations
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    canUndo: canUndoValue,
    canRedo: canRedoValue,
    historyEntries: state.history.entries,
    // Group operations
    groupElements: (elementIds, name) => {
      const groupColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];
      const group: ElementGroup = {
        id: crypto.randomUUID(),
        name: name || `Group ${state.project.groups.length + 1}`,
        elementIds,
        color: groupColors[state.project.groups.length % groupColors.length],
        locked: false,
      };
      dispatch({ type: 'GROUP_ELEMENTS', group });
    },
    ungroupElements: (groupId) => dispatch({ type: 'UNGROUP_ELEMENTS', groupId }),
    // Move/Trim operations
    moveElement: (id, startFrame, endFrame) => dispatch({ type: 'MOVE_ELEMENT', id, startFrame, endFrame }),
    trimElement: (id, startFrame, endFrame) => dispatch({ type: 'TRIM_ELEMENT', id, startFrame, endFrame }),
    // Batch operations
    startBatch,
    endBatch,
  }), [state, dispatch, canUndoValue, canRedoValue]);

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
}
