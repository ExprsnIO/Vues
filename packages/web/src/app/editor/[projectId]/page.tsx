'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/lib/auth-context';
import {
  EditorProvider,
  useEditor,
  type EditorProject,
  type EditorElement,
  type SelectedTool,
} from '@/lib/editor-context';
import type { EffectInstance } from '@/components/editor/effects';
import { ExportModal } from '@/components/editor/ExportModal';

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
        type: clip.type === 'solid' ? 'shape' : clip.type,
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
        color: clip.solidColor || clip.solid_color || '#6366f1',
        src: clip.assetUrl,
        startFrame: clip.startFrame || clip.start_frame || 0,
        endFrame: clip.endFrame || clip.end_frame || 150,
        locked: clip.locked || false,
        visible: true,
        blendMode: clip.blendMode || clip.blend_mode || 'normal',
        effects: (clip.effects || []).map((e: Record<string, unknown>) => ({
          id: e.id as string || crypto.randomUUID(),
          type: e.type as string,
          enabled: e.enabled !== false,
          params: e.params as Record<string, unknown> || {},
        })),
        keyframes: clip.keyframes || {},
      });
    }
  }

  const settings = project.settings || {};

  return {
    id: project.id,
    name: project.title,
    width: settings.width || 1080,
    height: settings.height || 1920,
    fps: settings.frameRate || settings.fps || 30,
    duration: settings.duration || 300,
    elements,
    audioTracks: [],
    nodeGraph: { nodes: [], connections: [] },
    globalEffects: [],
    groups: [],
    markers: [],
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
  const hasRedirected = useRef(false);

  const [loadedProject, setLoadedProject] = useState<EditorProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load project from API
  useEffect(() => {
    if (!projectId || authLoading) return;
    if ((!user || !token) && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace('/login?redirect=/editor/' + projectId);
      return;
    }
    if (!user || !token) return;

    setIsLoading(true);
    setError(null);

    loadProjectFromAPI(projectId, token)
      .then(project => {
        setLoadedProject(project);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load project:', err);
        setError(err.message);
        setIsLoading(false);
      });
  }, [projectId, user, token, authLoading, router]);

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-muted">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h1 className="text-xl font-bold text-text-primary mb-2">Failed to load project</h1>
          <p className="text-text-muted mb-4">{error}</p>
          <button
            onClick={() => router.push('/editor')}
            className="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  if (!user || !loadedProject) {
    return null;
  }

  return (
    <EditorProvider initialProject={loadedProject}>
      <EditorUI />
    </EditorProvider>
  );
}

// ============================================================================
// Editor UI (wrapped in context)
// ============================================================================

function EditorUI() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useEditor();
  const router = useRouter();
  const [showExportModal, setShowExportModal] = useState(false);

  const formatTimecode = useCallback((frame: number) => {
    const fps = state.project.fps;
    const totalSeconds = frame / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = frame % fps;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }, [state.project.fps]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 flex flex-col h-screen overflow-hidden">
        {/* Editor Header */}
        <header className="h-12 bg-background-alt border-b border-border flex items-center px-4 gap-4 shrink-0">
          <button
            onClick={() => router.push('/editor')}
            className="p-1.5 rounded hover:bg-surface transition-colors"
            title="Back to projects"
          >
            <BackIcon className="w-5 h-5 text-text-muted" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-accent to-accent-hover rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-semibold text-text-primary">Studio</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <span className="text-text-primary font-medium">{state.project.name}</span>

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-1.5 rounded transition-colors ${
                canUndo
                  ? 'text-text-muted hover:text-text-primary hover:bg-surface'
                  : 'text-text-muted/40 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <UndoIcon className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-1.5 rounded transition-colors ${
                canRedo
                  ? 'text-text-muted hover:text-text-primary hover:bg-surface'
                  : 'text-text-muted/40 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Shift+Z)"
            >
              <RedoIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center bg-surface rounded-lg p-0.5">
            <button
              onClick={() => dispatch({ type: 'SET_MODE', mode: 'canvas' })}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                state.mode === 'canvas' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Canvas
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_MODE', mode: 'nodes' })}
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
          <button
            onClick={() => setShowExportModal(true)}
            className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors"
          >
            Export
          </button>
        </header>

        {/* Export Modal */}
        {showExportModal && (
          <ExportModal
            projectId={state.project.id}
            projectName={state.project.name}
            width={state.project.width}
            height={state.project.height}
            fps={state.project.fps}
            duration={state.project.duration}
            onClose={() => setShowExportModal(false)}
          />
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex min-h-0">
          {/* Toolbar */}
          <EditorToolbar
            selectedTool={state.selectedTool}
            onSelectTool={(tool) => dispatch({ type: 'SET_TOOL', tool })}
          />

          {/* Canvas / Nodes Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {state.mode === 'canvas' ? (
              <div className="flex-1 bg-gray-900 relative overflow-hidden">
                <EditorCanvasEnhanced />
                <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-background/90 rounded-lg px-3 py-2">
                  <button
                    onClick={() => dispatch({ type: 'SET_ZOOM', zoom: state.zoom - 25 })}
                    className="text-text-muted hover:text-text-primary"
                  >
                    -
                  </button>
                  <span className="text-sm text-text-primary w-12 text-center">{state.zoom}%</span>
                  <button
                    onClick={() => dispatch({ type: 'SET_ZOOM', zoom: state.zoom + 25 })}
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
                onChange={(nodes, connections) => dispatch({
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

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

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

function UndoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function RedoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
    </svg>
  );
}
