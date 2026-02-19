'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

// Dynamically import editor components to avoid SSR issues with canvas
const EditorCanvas = dynamic(() => import('@/components/editor/EditorCanvas').then(m => m.EditorCanvas), {
  ssr: false,
  loading: () => <div className="flex-1 bg-gray-900 flex items-center justify-center"><div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" /></div>
});

const EditorTimeline = dynamic(() => import('@/components/editor/EditorTimeline').then(m => m.EditorTimeline), {
  ssr: false,
  loading: () => <div className="h-48 bg-background-alt border-t border-border" />
});

const EditorToolbar = dynamic(() => import('@/components/editor/EditorToolbar').then(m => m.EditorToolbar), {
  ssr: false,
});

const EditorInspector = dynamic(() => import('@/components/editor/EditorInspector').then(m => m.EditorInspector), {
  ssr: false,
});

export default function EditorPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [projectName, setProjectName] = useState('Untitled Project');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(300);
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTool, setSelectedTool] = useState<'select' | 'move' | 'scale' | 'rotate'>('select');
  const [zoom, setZoom] = useState(100);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/editor');
    }
  }, [user, authLoading, router]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentFrame(prev => {
        if (prev >= totalFrames - 1) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, totalFrames, fps]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
      // V: Select tool
      if (e.key === 'v') setSelectedTool('select');
      // G: Move tool
      if (e.key === 'g') setSelectedTool('move');
      // S: Scale tool
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) setSelectedTool('scale');
      // R: Rotate tool
      if (e.key === 'r') setSelectedTool('rotate');
      // Home: Go to start
      if (e.key === 'Home') setCurrentFrame(0);
      // End: Go to end
      if (e.key === 'End') setCurrentFrame(totalFrames - 1);
      // Left: Previous frame
      if (e.key === 'ArrowLeft') setCurrentFrame(prev => Math.max(0, prev - 1));
      // Right: Next frame
      if (e.key === 'ArrowRight') setCurrentFrame(prev => Math.min(totalFrames - 1, prev + 1));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalFrames]);

  const formatTimecode = useCallback((frame: number) => {
    const totalSeconds = frame / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = frame % fps;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }, [fps]);

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
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="bg-transparent text-text-primary font-medium focus:outline-none focus:ring-1 focus:ring-accent rounded px-2 py-1"
          />
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span>{fps} fps</span>
            <span className="w-px h-4 bg-border" />
            <span>{formatTimecode(currentFrame)}</span>
            <span>/</span>
            <span>{formatTimecode(totalFrames)}</span>
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
            selectedTool={selectedTool}
            onSelectTool={setSelectedTool}
          />

          {/* Canvas Area */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 bg-gray-900 relative overflow-hidden">
              <EditorCanvas
                zoom={zoom}
                currentFrame={currentFrame}
                selectedTool={selectedTool}
              />
              {/* Zoom controls */}
              <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-background/90 rounded-lg px-3 py-2">
                <button
                  onClick={() => setZoom(Math.max(25, zoom - 25))}
                  className="text-text-muted hover:text-text-primary"
                >
                  -
                </button>
                <span className="text-sm text-text-primary w-12 text-center">{zoom}%</span>
                <button
                  onClick={() => setZoom(Math.min(400, zoom + 25))}
                  className="text-text-muted hover:text-text-primary"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Inspector Panel */}
          <EditorInspector />
        </div>

        {/* Timeline */}
        <EditorTimeline
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          fps={fps}
          isPlaying={isPlaying}
          onFrameChange={setCurrentFrame}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onTotalFramesChange={setTotalFrames}
        />
      </main>
    </div>
  );
}
