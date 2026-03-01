'use client';

import { useEditor, type EditorExperienceMode } from '@/lib/editor-context';

// ============================================================================
// Editor Mode Toggle Component
// ============================================================================

export function EditorModeToggle() {
  const { state, dispatch } = useEditor();
  const currentMode = state.editorMode;

  const toggleMode = () => {
    dispatch({
      type: 'SET_EDITOR_MODE',
      editorMode: currentMode === 'beginner' ? 'pro' : 'beginner',
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted">Mode:</span>
      <button
        onClick={toggleMode}
        className={`relative w-16 h-6 rounded-full transition-colors ${
          currentMode === 'pro' ? 'bg-accent' : 'bg-surface-hover'
        }`}
        title={currentMode === 'pro' ? 'Switch to Beginner Mode' : 'Switch to Pro Mode'}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
            currentMode === 'pro' ? 'translate-x-10' : 'translate-x-0'
          }`}
        />
        <span
          className={`absolute inset-0 flex items-center justify-center text-[10px] font-medium ${
            currentMode === 'pro' ? 'text-white' : 'text-text-muted'
          }`}
        >
          {currentMode === 'pro' ? 'PRO' : 'BASIC'}
        </span>
      </button>
    </div>
  );
}

// ============================================================================
// Mode-Aware Wrapper Component
// ============================================================================

interface ModeGateProps {
  children: React.ReactNode;
  mode: EditorExperienceMode | EditorExperienceMode[];
  fallback?: React.ReactNode;
}

export function ModeGate({ children, mode, fallback = null }: ModeGateProps) {
  const { state } = useEditor();
  const modes = Array.isArray(mode) ? mode : [mode];

  if (!modes.includes(state.editorMode)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// ============================================================================
// Pro Feature Indicator
// ============================================================================

export function ProFeatureIndicator({
  feature,
  className,
}: {
  feature: string;
  className?: string;
}) {
  const { state } = useEditor();

  if (state.editorMode === 'pro') return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <ProBadge />
      <span className="text-xs text-text-muted">
        Enable Pro mode to use {feature}
      </span>
    </div>
  );
}

function ProBadge() {
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gradient-to-r from-accent to-purple-500 text-white rounded">
      PRO
    </span>
  );
}

// ============================================================================
// Feature Configuration by Mode
// ============================================================================

export const MODE_FEATURES = {
  beginner: {
    // Canvas features
    showGrid: true,
    showSafeZone: true,
    autoSnap: true,
    // Timeline features
    showKeyframes: false,
    showExpressions: false,
    showAdvancedTrimming: false,
    // Effects features
    showNodeGraph: false,
    showColorGrading: false,
    showLUTs: false,
    showAdvancedEffects: false,
    // Audio features
    showAudioDucking: false,
    showBeatSync: true,
    // Collaboration features
    showComments: true,
    showVersionHistory: false,
    // Export features
    showAdvancedExport: false,
    maxQuality: 'high' as const,
    // Presets - simplified
    presetCategories: ['style', 'social'] as const,
  },
  pro: {
    // Canvas features
    showGrid: true,
    showSafeZone: true,
    autoSnap: true,
    // Timeline features
    showKeyframes: true,
    showExpressions: true,
    showAdvancedTrimming: true,
    // Effects features
    showNodeGraph: true,
    showColorGrading: true,
    showLUTs: true,
    showAdvancedEffects: true,
    // Audio features
    showAudioDucking: true,
    showBeatSync: true,
    // Collaboration features
    showComments: true,
    showVersionHistory: true,
    // Export features
    showAdvancedExport: true,
    maxQuality: 'ultra' as const,
    // Presets - all
    presetCategories: ['all', 'favorites', 'recent', 'style', 'color', 'mood', 'social', 'my-presets'] as const,
  },
};

export function useModeFeatures() {
  const { state } = useEditor();
  return MODE_FEATURES[state.editorMode];
}

// ============================================================================
// Beginner Mode Tooltip
// ============================================================================

export function BeginnerTooltip({
  children,
  content,
  show = true,
}: {
  children: React.ReactNode;
  content: string;
  show?: boolean;
}) {
  const { state } = useEditor();

  if (state.editorMode !== 'beginner' || !show) {
    return <>{children}</>;
  }

  return (
    <div className="group relative inline-block">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  );
}

// ============================================================================
// Onboarding Steps (for beginner mode)
// ============================================================================

export const BEGINNER_ONBOARDING = [
  {
    id: 'welcome',
    title: 'Welcome to the Editor',
    content: 'Let\'s create something amazing! This quick tour will show you the basics.',
    target: null,
  },
  {
    id: 'canvas',
    title: 'Your Canvas',
    content: 'This is where your video comes to life. Click and drag elements to position them.',
    target: '.editor-canvas',
  },
  {
    id: 'timeline',
    title: 'Timeline',
    content: 'Control when elements appear and disappear. Drag clips to move them, and drag edges to trim.',
    target: '.editor-timeline',
  },
  {
    id: 'effects',
    title: 'Effects & Presets',
    content: 'Add filters, transitions, and animations with one click using presets.',
    target: '.effects-panel',
  },
  {
    id: 'export',
    title: 'Export Your Video',
    content: 'When you\'re done, click Export to download or publish your creation.',
    target: '.export-button',
  },
];
