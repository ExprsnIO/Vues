'use client';

import { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import type { EffectInstance } from '@/components/editor/effects';
import type { NodeInstance, NodeConnection } from '@/components/editor/nodes/engine/NodeTypes';
import { useNodeGraphEffects } from '@/hooks/useNodeGraphEffects';

// Dynamically import heavy editor components
const EditorCanvasEnhanced = dynamic(
  () => import('@/components/editor/EditorCanvasEnhanced').then(m => m.EditorCanvasEnhanced),
  { ssr: false, loading: () => <CanvasLoader /> }
);

const EditorTimelineEnhanced = dynamic(
  () => import('@/components/editor/EditorTimelineEnhanced').then(m => m.EditorTimelineEnhanced),
  { ssr: false, loading: () => <div className="h-48 bg-background-alt border-t border-border" /> }
);

const EditorInspectorEnhanced = dynamic(
  () => import('@/components/editor/EditorInspectorEnhanced').then(m => m.EditorInspectorEnhanced),
  { ssr: false }
);

const NodeEditor = dynamic(
  () => import('@/components/editor/nodes/ui/NodeEditor').then(m => m.NodeEditor),
  { ssr: false, loading: () => <div className="flex-1 bg-gray-900 flex items-center justify-center"><div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" /></div> }
);

function CanvasLoader() {
  return (
    <div className="flex-1 bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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

type EditorMode = 'canvas' | 'nodes';
type SelectedTool = 'select' | 'move' | 'scale' | 'rotate' | 'text' | 'shape' | 'pen';

interface EditorState {
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
  nodeGraphEffects: EffectInstance[]; // Effects generated from node graph
}

interface EditorContextType {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  // Convenience methods
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

type EditorAction =
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
  | { type: 'TOGGLE_SAFE_ZONE' };

// ============================================================================
// Editor Context
// ============================================================================

const EditorContext = createContext<EditorContextType | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}

function createDefaultProject(): EditorProject {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 300, // 10 seconds at 30fps
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

function editorReducer(state: EditorState, action: EditorAction): EditorState {
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
            // Remove existing keyframe at same frame
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

    default:
      return state;
  }
}

// ============================================================================
// Main Editor Page
// ============================================================================

export default function EditorPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [state, dispatch] = useState<EditorState>(() => ({
    project: createDefaultProject(),
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
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  // Custom dispatch that updates state
  const customDispatch = useCallback((action: EditorAction) => {
    dispatch(prev => editorReducer(prev, action));
  }, []);

  // Execute node graph and get effect outputs
  const nodeGraphResult = useNodeGraphEffects({
    nodes: state.project.nodeGraph.nodes,
    connections: state.project.nodeGraph.connections,
    currentTime: state.currentFrame / state.project.fps,
    currentFrame: state.currentFrame,
    fps: state.project.fps,
    duration: state.project.duration / state.project.fps,
    width: state.project.width,
    height: state.project.height,
    enabled: state.project.nodeGraph.nodes.length > 0,
  });

  // Sync node graph effects to state when they change
  useEffect(() => {
    if (JSON.stringify(state.nodeGraphEffects) !== JSON.stringify(nodeGraphResult.effects)) {
      dispatch(prev => ({ ...prev, nodeGraphEffects: nodeGraphResult.effects }));
    }
  }, [nodeGraphResult.effects, state.nodeGraphEffects]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/editor');
    }
  }, [user, authLoading, router]);

  // Playback timer
  useEffect(() => {
    if (!state.isPlaying) return;

    const interval = setInterval(() => {
      dispatch(prev => {
        const nextFrame = prev.currentFrame + 1;
        if (nextFrame >= prev.project.duration) {
          return { ...prev, isPlaying: false, currentFrame: 0 };
        }
        return { ...prev, currentFrame: nextFrame };
      });
    }, 1000 / state.project.fps);

    return () => clearInterval(interval);
  }, [state.isPlaying, state.project.fps, state.project.duration]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        customDispatch({ type: 'SET_PLAYING', playing: !stateRef.current.isPlaying });
      }
      // V: Select tool
      if (e.key === 'v') customDispatch({ type: 'SET_TOOL', tool: 'select' });
      // G: Move tool
      if (e.key === 'g') customDispatch({ type: 'SET_TOOL', tool: 'move' });
      // S: Scale tool (without ctrl/cmd)
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) customDispatch({ type: 'SET_TOOL', tool: 'scale' });
      // R: Rotate tool
      if (e.key === 'r') customDispatch({ type: 'SET_TOOL', tool: 'rotate' });
      // T: Text tool
      if (e.key === 't') customDispatch({ type: 'SET_TOOL', tool: 'text' });
      // U: Shape tool
      if (e.key === 'u') customDispatch({ type: 'SET_TOOL', tool: 'shape' });
      // Delete/Backspace: Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && stateRef.current.selectedElementIds.length > 0) {
        e.preventDefault();
        customDispatch({ type: 'DELETE_ELEMENTS', ids: stateRef.current.selectedElementIds });
      }
      // Escape: Deselect all
      if (e.key === 'Escape') customDispatch({ type: 'DESELECT_ALL' });
      // Home: Go to start
      if (e.key === 'Home') customDispatch({ type: 'SET_FRAME', frame: 0 });
      // End: Go to end
      if (e.key === 'End') customDispatch({ type: 'SET_FRAME', frame: stateRef.current.project.duration - 1 });
      // Left: Previous frame
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        customDispatch({ type: 'SET_FRAME', frame: stateRef.current.currentFrame - 1 });
      }
      // Right: Next frame
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        customDispatch({ type: 'SET_FRAME', frame: stateRef.current.currentFrame + 1 });
      }
      // Tab: Toggle mode
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault();
        customDispatch({ type: 'SET_MODE', mode: stateRef.current.mode === 'canvas' ? 'nodes' : 'canvas' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customDispatch]);

  // Context value with convenience methods
  const contextValue: EditorContextType = {
    state,
    dispatch: customDispatch,
    selectElement: (id, additive) => customDispatch({ type: 'SELECT_ELEMENT', id, additive }),
    updateElement: (id, updates) => customDispatch({ type: 'UPDATE_ELEMENT', id, updates }),
    addElement: (element) => customDispatch({ type: 'ADD_ELEMENT', element: { ...element, id: crypto.randomUUID() } as EditorElement }),
    deleteElements: (ids) => customDispatch({ type: 'DELETE_ELEMENTS', ids }),
    addKeyframe: (elementId, property, keyframe) => customDispatch({ type: 'ADD_KEYFRAME', elementId, property, keyframe }),
    updateKeyframe: (elementId, property, keyframeIndex, updates) => customDispatch({ type: 'UPDATE_KEYFRAME', elementId, property, keyframeIndex, updates }),
    setCurrentFrame: (frame) => customDispatch({ type: 'SET_FRAME', frame }),
    play: () => customDispatch({ type: 'SET_PLAYING', playing: true }),
    pause: () => customDispatch({ type: 'SET_PLAYING', playing: false }),
    togglePlay: () => customDispatch({ type: 'SET_PLAYING', playing: !state.isPlaying }),
  };

  const formatTimecode = useCallback((frame: number) => {
    const fps = state.project.fps;
    const totalSeconds = frame / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = frame % fps;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }, [state.project.fps]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 flex flex-col h-screen overflow-hidden">
          {/* Editor Header */}
          <header className="h-12 bg-background-alt border-b border-border flex items-center px-4 gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-accent to-accent-hover rounded flex items-center justify-center">
                <span className="text-white font-bold text-xs">E</span>
              </div>
              <span className="font-semibold text-text-primary">Studio</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <input
              type="text"
              value={state.project.name}
              onChange={(e) => dispatch(prev => ({ ...prev, project: { ...prev.project, name: e.target.value } }))}
              className="bg-transparent text-text-primary font-medium focus:outline-none focus:ring-1 focus:ring-accent rounded px-2 py-1"
            />

            {/* Mode Toggle */}
            <div className="flex items-center bg-surface rounded-lg p-0.5">
              <button
                onClick={() => customDispatch({ type: 'SET_MODE', mode: 'canvas' })}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  state.mode === 'canvas' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Canvas
              </button>
              <button
                onClick={() => customDispatch({ type: 'SET_MODE', mode: 'nodes' })}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  state.mode === 'nodes' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Nodes
              </button>
            </div>

            <div className="flex-1" />

            {/* View Options */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => customDispatch({ type: 'TOGGLE_GUIDES' })}
                className={`p-1.5 rounded transition-colors ${state.showGuides ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
                title="Toggle Guides"
              >
                <GridIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => customDispatch({ type: 'TOGGLE_SAFE_ZONE' })}
                className={`p-1.5 rounded transition-colors ${state.showSafeZone ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
                title="Toggle Safe Zone"
              >
                <SafeZoneIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => customDispatch({ type: 'TOGGLE_SNAP_BEATS' })}
                className={`p-1.5 rounded transition-colors ${state.snapToBeats ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
                title="Snap to Beats"
              >
                <MusicIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span>{state.project.fps} fps</span>
              <span className="w-px h-4 bg-border" />
              <span className="font-mono">{formatTimecode(state.currentFrame)}</span>
              <span>/</span>
              <span className="font-mono">{formatTimecode(state.project.duration)}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <button className="px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface rounded transition-colors">
              Preview
            </button>
            <button className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors">
              Export
            </button>
          </header>

          {/* Main Editor Area */}
          <div className="flex-1 flex min-h-0">
            {/* Toolbar */}
            <EditorToolbar
              selectedTool={state.selectedTool}
              onSelectTool={(tool) => customDispatch({ type: 'SET_TOOL', tool })}
            />

            {/* Canvas / Nodes Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {state.mode === 'canvas' ? (
                <div className="flex-1 bg-gray-900 relative overflow-hidden">
                  <EditorCanvasEnhanced />
                  {/* Zoom controls */}
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-background/90 rounded-lg px-3 py-2">
                    <button
                      onClick={() => customDispatch({ type: 'SET_ZOOM', zoom: state.zoom - 25 })}
                      className="text-text-muted hover:text-text-primary"
                    >
                      -
                    </button>
                    <span className="text-sm text-text-primary w-12 text-center">{state.zoom}%</span>
                    <button
                      onClick={() => customDispatch({ type: 'SET_ZOOM', zoom: state.zoom + 25 })}
                      className="text-text-muted hover:text-text-primary"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : (
                <NodeEditor
                  initialNodes={state.project.nodeGraph.nodes}
                  initialConnections={state.project.nodeGraph.connections}
                  onChange={(nodes, connections) => customDispatch({
                    type: 'UPDATE_NODE_GRAPH',
                    nodes,
                    connections,
                  })}
                />
              )}
            </div>

            {/* Inspector Panel */}
            <EditorInspectorEnhanced />
          </div>

          {/* Timeline */}
          <EditorTimelineEnhanced />
        </main>
      </div>
    </EditorContext.Provider>
  );
}

// ============================================================================
// Toolbar Component
// ============================================================================

function EditorToolbar({
  selectedTool,
  onSelectTool,
}: {
  selectedTool: SelectedTool;
  onSelectTool: (tool: SelectedTool) => void;
}) {
  const tools: { id: SelectedTool; icon: React.FC<{ className?: string }>; label: string; shortcut: string }[] = [
    { id: 'select', icon: SelectIcon, label: 'Select', shortcut: 'V' },
    { id: 'move', icon: MoveIcon, label: 'Move', shortcut: 'G' },
    { id: 'scale', icon: ScaleIcon, label: 'Scale', shortcut: 'S' },
    { id: 'rotate', icon: RotateIcon, label: 'Rotate', shortcut: 'R' },
    { id: 'text', icon: TextIcon, label: 'Text', shortcut: 'T' },
    { id: 'shape', icon: ShapeIcon, label: 'Shape', shortcut: 'U' },
  ];

  return (
    <div className="w-12 bg-background-alt border-r border-border flex flex-col items-center py-2 gap-1 shrink-0">
      {tools.map(({ id, icon: Icon, label, shortcut }) => (
        <button
          key={id}
          onClick={() => onSelectTool(id)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            selectedTool === id
              ? 'bg-accent text-white'
              : 'text-text-muted hover:text-text-primary hover:bg-surface'
          }`}
          title={`${label} (${shortcut})`}
        >
          <Icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function SelectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
    </svg>
  );
}

function MoveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15M3.75 20.25h4.5m-4.5 0v-4.5m0 4.5L9 15" />
    </svg>
  );
}

function RotateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function TextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function ShapeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function SafeZoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5" />
    </svg>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
    </svg>
  );
}
