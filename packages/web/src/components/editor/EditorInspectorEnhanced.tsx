'use client';

import { useState, useCallback } from 'react';
import { useEditor } from '@/app/editor/page';
import type { EditorElement, Keyframe } from '@/app/editor/page';
import { VisualEffectsPanel } from './effects/VisualEffectsPanel';
import type { EffectInstance } from './effects';
import { ExpressionEditor } from './ExpressionEditor';

type InspectorTab = 'transform' | 'style' | 'effects' | 'keyframes';

export function EditorInspectorEnhanced() {
  const { state, updateElement, addKeyframe, updateKeyframe, dispatch } = useEditor();
  const [activeTab, setActiveTab] = useState<InspectorTab>('transform');

  const selectedElements = state.project.elements.filter(el =>
    state.selectedElementIds.includes(el.id)
  );
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

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
      <div className="flex-1 overflow-y-auto">
        {!selectedElement ? (
          <div className="p-4 text-center text-text-muted text-sm">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface flex items-center justify-center">
              <SelectIcon className="w-6 h-6" />
            </div>
            {selectedElements.length > 1 ? (
              <p>{selectedElements.length} elements selected</p>
            ) : (
              <p>Select an element to edit its properties</p>
            )}
          </div>
        ) : (
          <div className="p-4">
            {activeTab === 'transform' && (
              <TransformPanel
                element={selectedElement}
                onUpdate={(updates) => updateElement(selectedElement.id, updates)}
              />
            )}
            {activeTab === 'style' && (
              <StylePanel
                element={selectedElement}
                onUpdate={(updates) => updateElement(selectedElement.id, updates)}
              />
            )}
            {activeTab === 'effects' && (
              <EffectsPanelWrapper
                element={selectedElement}
                currentTime={(state.currentFrame / state.project.fps)}
                onEffectsChange={(effects) => dispatch({
                  type: 'UPDATE_EFFECTS',
                  elementId: selectedElement.id,
                  effects,
                })}
              />
            )}
            {activeTab === 'keyframes' && (
              <KeyframesPanel
                element={selectedElement}
                currentFrame={state.currentFrame}
                fps={state.project.fps}
                onAddKeyframe={(property, value) => addKeyframe(selectedElement.id, property, {
                  frame: state.currentFrame,
                  value,
                  easing: 'easeInOut',
                })}
                onUpdateKeyframe={(property, keyframeIndex, updates) =>
                  updateKeyframe(selectedElement.id, property, keyframeIndex, updates)
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Element info footer */}
      {selectedElement && (
        <div className="p-3 border-t border-border bg-surface/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">
              {selectedElement.type.charAt(0).toUpperCase() + selectedElement.type.slice(1)}
            </span>
            <span className="text-text-muted font-mono">
              {selectedElement.id.slice(0, 8)}
            </span>
          </div>
          <input
            type="text"
            value={selectedElement.name}
            onChange={(e) => updateElement(selectedElement.id, { name: e.target.value })}
            className="w-full mt-1 px-2 py-1 bg-surface border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Transform Panel
// ============================================================================

function TransformPanel({
  element,
  onUpdate,
}: {
  element: EditorElement;
  onUpdate: (updates: Partial<EditorElement>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Position
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PropertyInput
          label="X"
          value={Math.round(element.x)}
          unit="px"
          onChange={(v) => onUpdate({ x: v })}
        />
        <PropertyInput
          label="Y"
          value={Math.round(element.y)}
          unit="px"
          onChange={(v) => onUpdate({ y: v })}
        />
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Size
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PropertyInput
          label="W"
          value={Math.round(element.width)}
          unit="px"
          onChange={(v) => onUpdate({ width: v })}
        />
        <PropertyInput
          label="H"
          value={Math.round(element.height)}
          unit="px"
          onChange={(v) => onUpdate({ height: v })}
        />
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Scale
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PropertyInput
          label="X"
          value={element.scale.x * 100}
          unit="%"
          onChange={(v) => onUpdate({ scale: { ...element.scale, x: v / 100 } })}
        />
        <PropertyInput
          label="Y"
          value={element.scale.y * 100}
          unit="%"
          onChange={(v) => onUpdate({ scale: { ...element.scale, y: v / 100 } })}
        />
      </div>

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Rotation
      </div>
      <PropertyInput
        label="Angle"
        value={element.rotation}
        unit="deg"
        onChange={(v) => onUpdate({ rotation: v })}
      />

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Anchor Point
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PropertyInput
          label="X"
          value={element.anchor.x * 100}
          unit="%"
          onChange={(v) => onUpdate({ anchor: { ...element.anchor, x: v / 100 } })}
        />
        <PropertyInput
          label="Y"
          value={element.anchor.y * 100}
          unit="%"
          onChange={(v) => onUpdate({ anchor: { ...element.anchor, y: v / 100 } })}
        />
      </div>

      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border">
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={element.locked}
            onChange={(e) => onUpdate({ locked: e.target.checked })}
            className="accent-accent"
          />
          Locked
        </label>
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={element.visible}
            onChange={(e) => onUpdate({ visible: e.target.checked })}
            className="accent-accent"
          />
          Visible
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// Style Panel
// ============================================================================

function StylePanel({
  element,
  onUpdate,
}: {
  element: EditorElement;
  onUpdate: (updates: Partial<EditorElement>) => void;
}) {
  const blendModes = [
    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  ];

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
          value={element.opacity * 100}
          onChange={(e) => onUpdate({ opacity: parseInt(e.target.value) / 100 })}
          className="flex-1 accent-accent"
        />
        <span className="text-sm text-text-primary w-12 text-right">
          {Math.round(element.opacity * 100)}%
        </span>
      </div>

      {(element.type === 'shape' || element.type === 'text') && (
        <>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
            {element.type === 'text' ? 'Text Color' : 'Fill Color'}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={element.color || '#ffffff'}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="w-10 h-10 rounded border border-border cursor-pointer"
            />
            <input
              type="text"
              value={element.color || '#ffffff'}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono uppercase"
            />
          </div>
        </>
      )}

      {element.type === 'text' && (
        <>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
            Text Content
          </div>
          <textarea
            value={element.content || ''}
            onChange={(e) => onUpdate({ content: e.target.value })}
            rows={3}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </>
      )}

      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
        Blend Mode
      </div>
      <select
        value={element.blendMode}
        onChange={(e) => onUpdate({ blendMode: e.target.value })}
        className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary capitalize"
      >
        {blendModes.map((mode) => (
          <option key={mode} value={mode} className="capitalize">
            {mode.replace('-', ' ')}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// Effects Panel Wrapper
// ============================================================================

function EffectsPanelWrapper({
  element,
  currentTime,
  onEffectsChange,
}: {
  element: EditorElement;
  currentTime: number;
  onEffectsChange: (effects: EffectInstance[]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Visual Effects
      </div>
      <VisualEffectsPanel
        effects={element.effects}
        onEffectsChange={onEffectsChange}
        currentTime={currentTime}
      />
    </div>
  );
}

// ============================================================================
// Keyframes Panel
// ============================================================================

function KeyframesPanel({
  element,
  currentFrame,
  fps,
  onAddKeyframe,
  onUpdateKeyframe,
}: {
  element: EditorElement;
  currentFrame: number;
  fps: number;
  onAddKeyframe: (property: string, value: number | { x: number; y: number }) => void;
  onUpdateKeyframe: (property: string, keyframeIndex: number, updates: Partial<Keyframe>) => void;
}) {
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ prop: string; index: number } | null>(null);

  const animatableProperties = [
    { key: 'opacity', label: 'Opacity', value: element.opacity },
    { key: 'rotation', label: 'Rotation', value: element.rotation },
    { key: 'scale.x', label: 'Scale X', value: element.scale.x },
    { key: 'scale.y', label: 'Scale Y', value: element.scale.y },
    { key: 'x', label: 'Position X', value: element.x },
    { key: 'y', label: 'Position Y', value: element.y },
  ];

  const hasKeyframes = Object.keys(element.keyframes).length > 0;

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Animatable Properties
      </div>

      <div className="space-y-2">
        {animatableProperties.map(({ key, label, value }) => {
          const keyframes = element.keyframes[key] || [];
          const hasKeyframeAtFrame = keyframes.some(k => k.frame === currentFrame);
          const hasExpression = keyframes.some(k => k.expression);

          return (
            <div
              key={key}
              className="flex items-center justify-between p-2 bg-surface rounded-lg hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAddKeyframe(key, value)}
                  className={`w-5 h-5 flex items-center justify-center transition-colors ${
                    hasKeyframeAtFrame
                      ? 'text-accent'
                      : keyframes.length > 0
                      ? 'text-yellow-500'
                      : 'text-text-muted hover:text-accent'
                  }`}
                  title={hasKeyframeAtFrame ? 'Keyframe at current frame' : 'Add keyframe'}
                >
                  <KeyframeIcon className="w-4 h-4" />
                </button>
                <span className="text-sm text-text-primary">{label}</span>
                {hasExpression && (
                  <span className="text-xs text-accent" title="Has expression">fx</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted font-mono">
                  {typeof value === 'number' ? value.toFixed(2) : JSON.stringify(value)}
                </span>
                {keyframes.length > 0 && (
                  <span className="text-xs text-accent">{keyframes.length} kf</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasKeyframes && (
        <>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 mt-6">
            Keyframe List
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.entries(element.keyframes).map(([prop, keyframes]) =>
              keyframes.map((kf, i) => {
                const isSelected = selectedKeyframe?.prop === prop && selectedKeyframe?.index === i;
                return (
                  <div key={`${prop}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedKeyframe(isSelected ? null : { prop, index: i })}
                      className={`w-full flex items-center justify-between p-2 bg-surface rounded text-xs transition-colors ${
                        isSelected ? 'ring-1 ring-accent' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <span className="text-text-primary">{prop}</span>
                      <span className="text-text-muted">Frame {kf.frame}</span>
                      <span className="text-accent font-mono">
                        {kf.expression ? (
                          <span title={kf.expression}>fx</span>
                        ) : (
                          typeof kf.value === 'number' ? kf.value.toFixed(2) : JSON.stringify(kf.value)
                        )}
                      </span>
                    </button>

                    {/* Expression editor for selected keyframe */}
                    {isSelected && (
                      <div className="mt-2 p-3 bg-background rounded-lg border border-border">
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-text-muted mb-1 block">Value</label>
                            <input
                              type="number"
                              value={typeof kf.value === 'number' ? kf.value : 0}
                              onChange={(e) => onUpdateKeyframe(prop, i, { value: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-text-muted mb-1 block">Easing</label>
                            <select
                              value={kf.easing || 'linear'}
                              onChange={(e) => onUpdateKeyframe(prop, i, { easing: e.target.value })}
                              className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
                            >
                              <option value="linear">Linear</option>
                              <option value="easeIn">Ease In</option>
                              <option value="easeOut">Ease Out</option>
                              <option value="easeInOut">Ease In Out</option>
                              <option value="easeInQuad">Ease In Quad</option>
                              <option value="easeOutQuad">Ease Out Quad</option>
                              <option value="easeInOutQuad">Ease In Out Quad</option>
                              <option value="easeInCubic">Ease In Cubic</option>
                              <option value="easeOutCubic">Ease Out Cubic</option>
                              <option value="bounce">Bounce</option>
                              <option value="elastic">Elastic</option>
                            </select>
                          </div>
                          <ExpressionEditor
                            expression={kf.expression || ''}
                            onExpressionChange={(expr) => onUpdateKeyframe(prop, i, { expression: expr || undefined })}
                            context={{
                              time: currentFrame / fps,
                              frame: currentFrame,
                              fps,
                              value: kf.value,
                              propertyName: prop,
                            }}
                            placeholder="Optional: override with expression"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {!hasKeyframes && (
        <div className="text-center py-6 text-text-muted text-sm">
          <KeyframeIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
          No keyframes set.
          <br />
          Click the diamond icon to add keyframes.
        </div>
      )}

      <div className="border-t border-border pt-4 mt-6">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Expression Templates
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Wiggle', desc: 'Random shake' },
            { label: 'Pulse', desc: 'Rhythmic scale' },
            { label: 'Bounce', desc: 'Bounce in' },
            { label: 'Wave', desc: 'Sine motion' },
            { label: 'Loop', desc: 'Repeat cycle' },
            { label: 'Spring', desc: 'Elastic settle' },
          ].map(({ label, desc }) => (
            <button
              key={label}
              className="px-3 py-2 bg-surface rounded text-left hover:bg-surface-hover transition-colors"
              title={desc}
            >
              <div className="text-xs text-text-primary">{label}</div>
              <div className="text-[10px] text-text-muted">{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function PropertyInput({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted w-4">{label}</span>
      <div className="flex-1 flex items-center bg-surface border border-border rounded overflow-hidden">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-transparent px-2 py-1.5 text-sm text-text-primary outline-none w-full"
        />
        <span className="text-xs text-text-muted px-2 border-l border-border">{unit}</span>
      </div>
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

function KeyframeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l7.794 7.794a1 1 0 010 1.412L12 21l-7.794-7.794a1 1 0 010-1.412L12 3z" />
    </svg>
  );
}
