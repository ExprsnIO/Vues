'use client';

interface EditorToolbarProps {
  selectedTool: 'select' | 'move' | 'scale' | 'rotate';
  onSelectTool: (tool: 'select' | 'move' | 'scale' | 'rotate') => void;
}

const tools = [
  { id: 'select' as const, label: 'Select', shortcut: 'V', icon: SelectIcon },
  { id: 'move' as const, label: 'Move', shortcut: 'G', icon: MoveIcon },
  { id: 'scale' as const, label: 'Scale', shortcut: 'S', icon: ScaleIcon },
  { id: 'rotate' as const, label: 'Rotate', shortcut: 'R', icon: RotateIcon },
];

export function EditorToolbar({ selectedTool, onSelectTool }: EditorToolbarProps) {
  return (
    <div className="w-12 bg-background-alt border-r border-border flex flex-col items-center py-2 gap-1 shrink-0">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onSelectTool(tool.id)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors group relative ${
            selectedTool === tool.id
              ? 'bg-accent text-white'
              : 'text-text-muted hover:bg-surface hover:text-text-primary'
          }`}
          title={`${tool.label} (${tool.shortcut})`}
        >
          <tool.icon className="w-5 h-5" />
          {/* Tooltip */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-surface rounded text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
            {tool.label}
            <span className="ml-2 text-text-muted">{tool.shortcut}</span>
          </div>
        </button>
      ))}

      <div className="flex-1" />

      {/* Divider */}
      <div className="w-8 h-px bg-border my-2" />

      {/* Additional tools */}
      <button
        className="w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface hover:text-text-primary transition-colors group relative"
        title="Add Media"
      >
        <AddMediaIcon className="w-5 h-5" />
        <div className="absolute left-full ml-2 px-2 py-1 bg-surface rounded text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
          Add Media
        </div>
      </button>

      <button
        className="w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface hover:text-text-primary transition-colors group relative"
        title="Add Text"
      >
        <TextIcon className="w-5 h-5" />
        <div className="absolute left-full ml-2 px-2 py-1 bg-surface rounded text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
          Add Text
        </div>
      </button>

      <button
        className="w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface hover:text-text-primary transition-colors group relative"
        title="Add Shape"
      >
        <ShapeIcon className="w-5 h-5" />
        <div className="absolute left-full ml-2 px-2 py-1 bg-surface rounded text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
          Add Shape
        </div>
      </button>
    </div>
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
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

function AddMediaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function TextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function ShapeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
    </svg>
  );
}
