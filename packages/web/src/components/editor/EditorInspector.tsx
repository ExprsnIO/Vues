'use client';

import { useState } from 'react';

type InspectorTab = 'transform' | 'style' | 'effects' | 'keyframes';

export function EditorInspector() {
  const [activeTab, setActiveTab] = useState<InspectorTab>('transform');

  return (
    <div className="w-72 bg-background-alt border-l border-border flex flex-col shrink-0 hidden lg:flex">
      {/* Tab Header */}
      <div className="flex border-b border-border">
        {(['transform', 'style', 'effects', 'keyframes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'transform' && <TransformPanel />}
        {activeTab === 'style' && <StylePanel />}
        {activeTab === 'effects' && <EffectsPanel />}
        {activeTab === 'keyframes' && <KeyframesPanel />}
      </div>
    </div>
  );
}

function TransformPanel() {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Position
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PropertyInput label="X" value={340} unit="px" />
        <PropertyInput label="Y" value={760} unit="px" />
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Size
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PropertyInput label="W" value={400} unit="px" />
        <PropertyInput label="H" value={400} unit="px" />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input type="checkbox" id="lock-aspect" className="accent-accent" defaultChecked />
        <label htmlFor="lock-aspect" className="text-xs text-text-muted">
          Lock aspect ratio
        </label>
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Rotation
      </div>
      <PropertyInput label="Angle" value={0} unit="deg" />

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Anchor Point
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PropertyInput label="X" value={200} unit="px" />
        <PropertyInput label="Y" value={200} unit="px" />
      </div>
    </div>
  );
}

function StylePanel() {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Opacity
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={100}
          className="flex-1 accent-accent"
        />
        <span className="text-sm text-text-primary w-12 text-right">100%</span>
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Fill
      </div>
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded border border-border cursor-pointer"
          style={{ backgroundColor: '#6366f1' }}
        />
        <input
          type="text"
          defaultValue="#6366F1"
          className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono"
        />
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Stroke
      </div>
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded border-2 border-dashed border-text-muted cursor-pointer flex items-center justify-center"
        >
          <span className="text-xs text-text-muted">-</span>
        </div>
        <span className="text-sm text-text-muted">No stroke</span>
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Corner Radius
      </div>
      <PropertyInput label="Radius" value={16} unit="px" />

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Blend Mode
      </div>
      <select className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary">
        <option>Normal</option>
        <option>Multiply</option>
        <option>Screen</option>
        <option>Overlay</option>
        <option>Darken</option>
        <option>Lighten</option>
        <option>Color Dodge</option>
        <option>Color Burn</option>
      </select>
    </div>
  );
}

function EffectsPanel() {
  const effects = [
    { name: 'Drop Shadow', enabled: false },
    { name: 'Blur', enabled: false },
    { name: 'Glow', enabled: false },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Effects
        </span>
        <button className="text-xs text-accent hover:text-accent-hover">+ Add</button>
      </div>

      {effects.map((effect) => (
        <div
          key={effect.name}
          className="flex items-center justify-between p-3 bg-surface rounded-lg"
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              defaultChecked={effect.enabled}
              className="accent-accent"
            />
            <span className="text-sm text-text-primary">{effect.name}</span>
          </div>
          <button className="text-text-muted hover:text-text-primary">
            <ChevronIcon className="w-4 h-4" />
          </button>
        </div>
      ))}

      <div className="text-center py-8 text-text-muted text-sm">
        No effects applied.
        <br />
        Click "+ Add" to add an effect.
      </div>
    </div>
  );
}

function KeyframesPanel() {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Animated Properties
      </div>

      <div className="text-center py-8 text-text-muted text-sm">
        <KeyframeIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        No keyframes set.
        <br />
        Click the diamond icon next to any property to add keyframes.
      </div>

      <div className="border-t border-border pt-4 mt-6">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Easing Presets
        </div>
        <div className="grid grid-cols-2 gap-2">
          {['Linear', 'Ease In', 'Ease Out', 'Ease In Out'].map((preset) => (
            <button
              key={preset}
              className="px-3 py-2 bg-surface rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface/80 transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PropertyInput({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted w-4">{label}</span>
      <div className="flex-1 flex items-center bg-surface border border-border rounded overflow-hidden">
        <input
          type="number"
          defaultValue={value}
          className="flex-1 bg-transparent px-2 py-1.5 text-sm text-text-primary outline-none w-full"
        />
        <span className="text-xs text-text-muted px-2 border-l border-border">{unit}</span>
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function KeyframeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l7.794 7.794a1 1 0 010 1.412L12 21l-7.794-7.794a1 1 0 010-1.412L12 3z"
      />
    </svg>
  );
}
