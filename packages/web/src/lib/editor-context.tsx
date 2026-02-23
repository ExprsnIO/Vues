'use client';

import { createContext, useContext, useCallback, useRef, useEffect, useReducer } from 'react';
import type { EffectInstance } from '@/components/editor/effects';
import type { NodeInstance, NodeConnection } from '@/components/editor/nodes/engine/NodeTypes';

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
}

export type EditorMode = 'canvas' | 'nodes';
export type SelectedTool = 'select' | 'move' | 'scale' | 'rotate' | 'text' | 'shape' | 'pen';

export interface EditorState {
  project: EditorProject;
  selectedElementIds: string[];
  selectedTool: SelectedTool;
  currentFrame: number;
  isPlaying: boolean;
  zoom: number;
  mode: EditorMode;
  snapToGrid: boolean;
  snapToBeats: boolean;
  showGuides: boolean;
  showSafeZone: boolean;
  nodeGraphEffects: EffectInstance[];
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
}

export type EditorAction =
  | { type: 'SET_PROJECT'; project: EditorProject }
  | { type: 'SELECT_ELEMENT'; id: string; additive?: boolean }
  | { type: 'DESELECT_ALL' }
  | { type: 'UPDATE_ELEMENT'; id: string; updates: Partial<EditorElement> }
  | { type: 'ADD_ELEMENT'; element: EditorElement }
  | { type: 'DELETE_ELEMENTS'; ids: string[] }
  | { type: 'SET_TOOL'; tool: SelectedTool }
  | { type: 'SET_FRAME'; frame: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_MODE'; mode: EditorMode }
  | { type: 'ADD_KEYFRAME'; elementId: string; property: string; keyframe: Keyframe }
  | { type: 'UPDATE_KEYFRAME'; elementId: string; property: string; keyframeIndex: number; updates: Partial<Keyframe> }
  | { type: 'UPDATE_EFFECTS'; elementId: string; effects: EffectInstance[] }
  | { type: 'UPDATE_GLOBAL_EFFECTS'; effects: EffectInstance[] }
  | { type: 'UPDATE_NODE_GRAPH'; nodes: NodeInstance[]; connections: NodeConnection[] }
  | { type: 'ADD_AUDIO_TRACK'; track: AudioTrack }
  | { type: 'UPDATE_AUDIO_TRACK'; id: string; updates: Partial<AudioTrack> }
  | { type: 'TOGGLE_SNAP_GRID' }
  | { type: 'TOGGLE_SNAP_BEATS' }
  | { type: 'TOGGLE_GUIDES' }
  | { type: 'TOGGLE_SAFE_ZONE' }
  | { type: 'SET_NODE_GRAPH_EFFECTS'; effects: EffectInstance[] };

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
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.project };

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

    case 'DELETE_ELEMENTS':
      return {
        ...state,
        project: {
          ...state.project,
          elements: state.project.elements.filter(el => !action.ids.includes(el.id)),
        },
        selectedElementIds: state.selectedElementIds.filter(id => !action.ids.includes(id)),
      };

    case 'SET_TOOL':
      return { ...state, selectedTool: action.tool };

    case 'SET_FRAME':
      return { ...state, currentFrame: Math.max(0, Math.min(action.frame, state.project.duration - 1)) };

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(25, Math.min(400, action.zoom)) };

    case 'SET_MODE':
      return { ...state, mode: action.mode };

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

    case 'TOGGLE_SNAP_GRID':
      return { ...state, snapToGrid: !state.snapToGrid };

    case 'TOGGLE_SNAP_BEATS':
      return { ...state, snapToBeats: !state.snapToBeats };

    case 'TOGGLE_GUIDES':
      return { ...state, showGuides: !state.showGuides };

    case 'TOGGLE_SAFE_ZONE':
      return { ...state, showSafeZone: !state.showSafeZone };

    case 'SET_NODE_GRAPH_EFFECTS':
      return { ...state, nodeGraphEffects: action.effects };

    default:
      return state;
  }
}

export function createInitialState(project?: EditorProject): EditorState {
  return {
    project: project || createDefaultProject(),
    selectedElementIds: [],
    selectedTool: 'select',
    currentFrame: 0,
    isPlaying: false,
    zoom: 100,
    mode: 'canvas',
    snapToGrid: true,
    snapToBeats: false,
    showGuides: true,
    showSafeZone: true,
    nodeGraphEffects: [],
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
  const [state, dispatch] = useReducer(editorReducer, createInitialState(initialProject));
  const stateRef = useRef(state);
  stateRef.current = state;

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
  }, [state.isPlaying, state.project.fps]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        dispatch({ type: 'SET_PLAYING', playing: !stateRef.current.isPlaying });
      }
      if (e.key === 'v') dispatch({ type: 'SET_TOOL', tool: 'select' });
      if (e.key === 'g') dispatch({ type: 'SET_TOOL', tool: 'move' });
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
  }, []);

  const contextValue: EditorContextType = {
    state,
    dispatch,
    selectElement: useCallback((id, additive) => dispatch({ type: 'SELECT_ELEMENT', id, additive }), []),
    updateElement: useCallback((id, updates) => dispatch({ type: 'UPDATE_ELEMENT', id, updates }), []),
    addElement: useCallback((element) => dispatch({ type: 'ADD_ELEMENT', element: { ...element, id: crypto.randomUUID() } as EditorElement }), []),
    deleteElements: useCallback((ids) => dispatch({ type: 'DELETE_ELEMENTS', ids }), []),
    addKeyframe: useCallback((elementId, property, keyframe) => dispatch({ type: 'ADD_KEYFRAME', elementId, property, keyframe }), []),
    updateKeyframe: useCallback((elementId, property, keyframeIndex, updates) => dispatch({ type: 'UPDATE_KEYFRAME', elementId, property, keyframeIndex, updates }), []),
    setCurrentFrame: useCallback((frame) => dispatch({ type: 'SET_FRAME', frame }), []),
    play: useCallback(() => dispatch({ type: 'SET_PLAYING', playing: true }), []),
    pause: useCallback(() => dispatch({ type: 'SET_PLAYING', playing: false }), []),
    togglePlay: useCallback(() => dispatch({ type: 'SET_PLAYING', playing: !stateRef.current.isPlaying }), []),
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
}
