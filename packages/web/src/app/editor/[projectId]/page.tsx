'use client';

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/lib/auth-context';
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
  type: 'video' | 'image' | 'text' | 'shape' | 'audio' | 'solid';
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
  // New fields from backend
  speed?: number;
  reverse?: boolean;
  loop?: boolean;
  loopCount?: number;
  sourceStart?: number;
  sourceEnd?: number;
  textStyle?: Record<string, unknown>;
  shapeStyle?: Record<string, unknown>;
  solidColor?: string;
  shapeType?: string;
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

export interface EditorTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'overlay';
  order: number;
  locked: boolean;
  muted: boolean;
  visible: boolean;
  volume: number;
  color?: string;
  clips: EditorElement[];
}

export interface EditorProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  elements: EditorElement[];
  tracks: EditorTrack[];
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
  nodeGraphEffects: EffectInstance[];
  isLoading: boolean;
  error: string | null;
}

interface EditorContextType {
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

type EditorAction =
  | { type: 'SET_PROJECT'; project: EditorProject }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
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

function createEmptyProject(): EditorProject {
  return {
    id: '',
    name: 'Loading...',
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 300,
    elements: [],
    tracks: [],
    audioTracks: [],
    nodeGraph: { nodes: [], connections: [] },
    globalEffects: [],
  };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.project, isLoading: false, error: null };

    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };

    case 'SET_ERROR':
      return { ...state, error: action.error, isLoading: false };

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

    default:
      return state;
  }
}

// ============================================================================
// API Helper
// ============================================================================

async function loadProjectFromAPI(projectId: string, token: string): Promise<EditorProject> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  const response = await fetch(`${apiUrl}/xrpc/io.exprsn.studio.getProject?projectId=${projectId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load project: ${response.statusText}`);
  }

  const data = await response.json();
  const project = data.project;

  // Convert API response to EditorProject format
  const elements: EditorElement[] = [];

  // Flatten clips from all tracks into elements
  for (const track of project.tracks || []) {
    for (const clip of track.clips || []) {
      const transform = clip.transform || {};
      elements.push({
        id: clip.id,
        type: clip.type,
        name: clip.name,
        x: transform.x || 0,
        y: transform.y || 0,
        width: transform.width || 1080,
        height: transform.height || 1920,
        rotation: transform.rotation || 0,
        opacity: transform.opacity ?? 1,
        scale: { x: transform.scaleX || 1, y: transform.scaleY || 1 },
        anchor: { x: transform.anchorX || 0.5, y: transform.anchorY || 0.5 },
        content: clip.textContent || clip.text_content,
        color: clip.solidColor || clip.solid_color,
        src: clip.assetUrl,
        startFrame: clip.startFrame || clip.start_frame || 0,
        endFrame: clip.endFrame || clip.end_frame || 150,
        locked: clip.locked || false,
        visible: true,
        blendMode: clip.blendMode || clip.blend_mode || 'normal',
        effects: (clip.effects || []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          type: e.type as string,
          enabled: e.enabled !== false,
          params: e.params as Record<string, unknown> || {},
        })),
        keyframes: clip.keyframes || {},
        speed: clip.speed,
        reverse: clip.reverse,
        loop: clip.loop,
        loopCount: clip.loopCount || clip.loop_count,
        sourceStart: clip.sourceStart || clip.source_start,
        sourceEnd: clip.sourceEnd || clip.source_end,
        textStyle: clip.textStyle || clip.text_style,
        shapeStyle: clip.shapeStyle || clip.shape_style,
        solidColor: clip.solidColor || clip.solid_color,
        shapeType: clip.shapeType || clip.shape_type,
      });
    }
  }

  const settings = project.settings || {};

  return {
    id: project.id,
    name: project.title,
    width: settings.width || 1080,
    height: settings.height || 1920,
    fps: settings.fps || 30,
    duration: settings.duration || 300,
    elements,
    tracks: project.tracks || [],
    audioTracks: [],
    nodeGraph: { nodes: [], connections: [] },
    globalEffects: [],
  };
}

// ============================================================================
// Main Editor Page
// ============================================================================

export default function EditorProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { user, isLoading: authLoading, token } = useAuth();
  const router = useRouter();

  const [state, dispatch] = useState<EditorState>(() => ({
    project: createEmptyProject(),
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
    isLoading: true,
    error: null,
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  // Custom dispatch
  const customDispatch = useCallback((action: EditorAction) => {
    dispatch(prev => editorReducer(prev, action));
  }, []);

  // Load project from API
  useEffect(() => {
    if (!projectId || authLoading) return;
    if (!user || !token) {
      router.push('/login?redirect=/editor/' + projectId);
      return;
    }

    customDispatch({ type: 'SET_LOADING', loading: true });

    loadProjectFromAPI(projectId, token)
      .then(project => {
        customDispatch({ type: 'SET_PROJECT', project });
      })
      .catch(error => {
        console.error('Failed to load project:', error);
        customDispatch({ type: 'SET_ERROR', error: error.message });
      });
  }, [projectId, user, token, authLoading, router, customDispatch]);

  // Execute node graph
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

      if (e.code === 'Space') {
        e.preventDefault();
        customDispatch({ type: 'SET_PLAYING', playing: !stateRef.current.isPlaying });
      }
      if (e.key === 'v') customDispatch({ type: 'SET_TOOL', tool: 'select' });
      if (e.key === 'g') customDispatch({ type: 'SET_TOOL', tool: 'move' });
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) customDispatch({ type: 'SET_TOOL', tool: 'scale' });
      if (e.key === 'r') customDispatch({ type: 'SET_TOOL', tool: 'rotate' });
      if (e.key === 't') customDispatch({ type: 'SET_TOOL', tool: 'text' });
      if (e.key === 'u') customDispatch({ type: 'SET_TOOL', tool: 'shape' });
      if ((e.key === 'Delete' || e.key === 'Backspace') && stateRef.current.selectedElementIds.length > 0) {
        e.preventDefault();
        customDispatch({ type: 'DELETE_ELEMENTS', ids: stateRef.current.selectedElementIds });
      }
      if (e.key === 'Escape') customDispatch({ type: 'DESELECT_ALL' });
      if (e.key === 'Home') customDispatch({ type: 'SET_FRAME', frame: 0 });
      if (e.key === 'End') customDispatch({ type: 'SET_FRAME', frame: stateRef.current.project.duration - 1 });
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        customDispatch({ type: 'SET_FRAME', frame: stateRef.current.currentFrame - 1 });
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        customDispatch({ type: 'SET_FRAME', frame: stateRef.current.currentFrame + 1 });
      }
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault();
        customDispatch({ type: 'SET_MODE', mode: stateRef.current.mode === 'canvas' ? 'nodes' : 'canvas' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customDispatch]);

  // Context value
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

  if (authLoading || state.isLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-muted">Loading project...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h1 className="text-xl font-bold text-text-primary mb-2">Failed to load project</h1>
          <p className="text-text-muted mb-4">{state.error}</p>
          <button
            onClick={() => router.push('/editor')}
            className="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover"
          >
            Create New Project
          </button>
        </div>
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
            <span className="text-text-primary font-medium">{state.project.name}</span>

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

            {/* Project Info */}
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="px-2 py-1 bg-surface rounded">{state.project.elements.length} clips</span>
              <span className="px-2 py-1 bg-surface rounded">{state.project.tracks?.length || 0} tracks</span>
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
