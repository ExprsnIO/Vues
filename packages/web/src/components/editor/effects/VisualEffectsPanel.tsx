/**
 * Visual Effects Panel
 * UI for adding and configuring visual effects in the editor
 */

'use client';

import { useState, useCallback } from 'react';
import {
  builtinFilters,
  filterCategories,
  getFiltersByCategory,
  type EffectDefinition,
  type EffectInstance,
} from './index';

interface VisualEffectsPanelProps {
  effects: EffectInstance[];
  onEffectsChange: (effects: EffectInstance[]) => void;
  currentTime: number;
}

export function VisualEffectsPanel({
  effects,
  onEffectsChange,
  currentTime,
}: VisualEffectsPanelProps) {
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const selectedEffect = effects.find((e) => e.id === selectedEffectId);
  const selectedDefinition = selectedEffect
    ? builtinFilters.find((f) => f.id === selectedEffect.effectId)
    : null;

  const addEffect = useCallback(
    (definitionId: string) => {
      const definition = builtinFilters.find((f) => f.id === definitionId);
      if (!definition) return;

      // Initialize parameters with defaults
      const parameters: Record<string, unknown> = {};
      for (const param of definition.parameters) {
        parameters[param.name] = param.default;
      }

      const newEffect: EffectInstance = {
        id: `effect_${Date.now()}`,
        effectId: definitionId,
        enabled: true,
        parameters,
        order: effects.length,
      };

      onEffectsChange([...effects, newEffect]);
      setSelectedEffectId(newEffect.id);
      setShowAddMenu(false);
    },
    [effects, onEffectsChange]
  );

  const removeEffect = useCallback(
    (id: string) => {
      onEffectsChange(effects.filter((e) => e.id !== id));
      if (selectedEffectId === id) {
        setSelectedEffectId(null);
      }
    },
    [effects, onEffectsChange, selectedEffectId]
  );

  const toggleEffect = useCallback(
    (id: string) => {
      onEffectsChange(
        effects.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
      );
    },
    [effects, onEffectsChange]
  );

  const updateParameter = useCallback(
    (id: string, paramName: string, value: unknown) => {
      onEffectsChange(
        effects.map((e) =>
          e.id === id
            ? { ...e, parameters: { ...e.parameters, [paramName]: value } }
            : e
        )
      );
    },
    [effects, onEffectsChange]
  );

  const moveEffect = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const index = effects.findIndex((e) => e.id === id);
      if (
        (direction === 'up' && index === 0) ||
        (direction === 'down' && index === effects.length - 1)
      ) {
        return;
      }

      const newEffects = [...effects];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newEffects[index], newEffects[swapIndex]] = [
        newEffects[swapIndex],
        newEffects[index],
      ];

      // Update order values
      newEffects.forEach((e, i) => {
        e.order = i;
      });

      onEffectsChange(newEffects);
    },
    [effects, onEffectsChange]
  );

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Visual Effects</h3>
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="text-sm text-accent hover:text-accent-hover flex items-center gap-1"
        >
          <PlusIcon className="w-4 h-4" />
          Add Effect
        </button>
      </div>

      {/* Add Effect Menu */}
      {showAddMenu && (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="p-2 text-xs text-text-muted uppercase font-medium border-b border-border">
            Select Effect
          </div>
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(filterCategories).map(([categoryKey, categoryInfo]) => {
              const categoryFilters = getFiltersByCategory(
                categoryKey as keyof typeof filterCategories
              );
              if (categoryFilters.length === 0) return null;

              return (
                <div key={categoryKey}>
                  <div className="px-3 py-1.5 text-xs text-text-muted bg-background-alt">
                    {categoryInfo.name}
                  </div>
                  {categoryFilters.map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => addEffect(filter.id)}
                      className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover transition-colors flex items-center justify-between"
                    >
                      <span>{filter.name}</span>
                      <span className="text-xs text-text-muted">{filter.description}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Effects List */}
      {effects.length === 0 ? (
        <p className="text-center py-8 text-text-muted text-sm">
          No effects added. Click &quot;Add Effect&quot; to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {effects.map((effect, index) => {
            const definition = builtinFilters.find((f) => f.id === effect.effectId);
            if (!definition) return null;

            return (
              <div
                key={effect.id}
                className={`rounded-lg border transition-colors ${
                  selectedEffectId === effect.id
                    ? 'bg-accent/10 border-accent'
                    : 'bg-surface border-border hover:border-border-hover'
                }`}
              >
                <div className="flex items-center gap-2 p-3">
                  {/* Enable Toggle */}
                  <button
                    onClick={() => toggleEffect(effect.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                      effect.enabled
                        ? 'bg-accent text-white'
                        : 'bg-surface-hover text-text-muted'
                    }`}
                  >
                    {effect.enabled && <CheckIcon className="w-3 h-3" />}
                  </button>

                  {/* Effect Name */}
                  <button
                    onClick={() => setSelectedEffectId(effect.id)}
                    className="flex-1 text-left"
                  >
                    <span
                      className={`text-sm ${
                        effect.enabled ? 'text-text-primary' : 'text-text-muted'
                      }`}
                    >
                      {definition.name}
                    </span>
                  </button>

                  {/* Reorder Buttons */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveEffect(effect.id, 'up')}
                      disabled={index === 0}
                      className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                    >
                      <ChevronUpIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveEffect(effect.id, 'down')}
                      disabled={index === effects.length - 1}
                      className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                    >
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => removeEffect(effect.id)}
                    className="p-1 text-text-muted hover:text-red-500"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Effect Parameters */}
      {selectedEffect && selectedDefinition && (
        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-text-primary">
            {selectedDefinition.name} Settings
          </h4>

          {selectedDefinition.parameters.map((param) => (
            <div key={param.name}>
              <label className="flex items-center justify-between text-xs text-text-muted mb-1">
                <span>{param.label}</span>
                {param.type === 'number' && (
                  <span className="font-mono">
                    {(selectedEffect.parameters[param.name] as number).toFixed(2)}
                  </span>
                )}
              </label>

              {param.type === 'number' && (
                <input
                  type="range"
                  min={param.min ?? 0}
                  max={param.max ?? 1}
                  step={param.step ?? 0.01}
                  value={selectedEffect.parameters[param.name] as number}
                  onChange={(e) =>
                    updateParameter(
                      selectedEffect.id,
                      param.name,
                      parseFloat(e.target.value)
                    )
                  }
                  className="w-full accent-accent"
                />
              )}

              {param.type === 'boolean' && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedEffect.parameters[param.name] as boolean}
                    onChange={(e) =>
                      updateParameter(
                        selectedEffect.id,
                        param.name,
                        e.target.checked
                      )
                    }
                    className="accent-accent"
                  />
                  <span className="text-sm text-text-primary">
                    {param.description || param.label}
                  </span>
                </label>
              )}

              {param.type === 'color' && (
                <input
                  type="color"
                  value={selectedEffect.parameters[param.name] as string}
                  onChange={(e) =>
                    updateParameter(selectedEffect.id, param.name, e.target.value)
                  }
                  className="w-full h-8 rounded border border-border cursor-pointer"
                />
              )}

              {param.type === 'select' && param.options && (
                <select
                  value={selectedEffect.parameters[param.name] as string}
                  onChange={(e) =>
                    updateParameter(selectedEffect.id, param.name, e.target.value)
                  }
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
                >
                  {param.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {param.description && param.type !== 'boolean' && (
                <p className="text-xs text-text-muted mt-1">{param.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview Note */}
      {effects.some((e) => e.enabled) && (
        <div className="p-3 bg-surface rounded-lg">
          <p className="text-xs text-text-muted">
            Effects are applied in order from top to bottom. Drag to reorder.
          </p>
        </div>
      )}
    </div>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

export default VisualEffectsPanel;
