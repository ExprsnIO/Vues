'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

// Types
interface EffectParam {
  name: string;
  label: string;
  type: 'number' | 'color' | 'select' | 'boolean' | 'range';
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string | number; label: string }>;
}

interface EffectDefinition {
  type: string;
  name: string;
  description: string;
  category: string;
  params: EffectParam[];
}

interface AppliedEffect {
  type: string;
  params: Record<string, number | string | boolean>;
}

interface EffectPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  effects: AppliedEffect[];
  thumbnail?: string;
  isCustom?: boolean;
}

interface EffectCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface EffectsPanelProps {
  onEffectsChange: (effects: AppliedEffect[]) => void;
  initialEffects?: AppliedEffect[];
}

export function EffectsPanel({ onEffectsChange, initialEffects = [] }: EffectsPanelProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'effects' | 'presets'>('presets');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [appliedEffects, setAppliedEffects] = useState<AppliedEffect[]>(initialEffects);
  const [expandedEffect, setExpandedEffect] = useState<string | null>(null);

  // Fetch effects list
  const { data: effectsData } = useQuery({
    queryKey: ['effects', 'list'],
    queryFn: async () => {
      const response = await fetch('/api/xrpc/io.exprsn.studio.effects.list');
      return response.json();
    },
  });

  // Fetch presets
  const { data: presetsData } = useQuery({
    queryKey: ['effects', 'presets'],
    queryFn: async () => {
      const response = await fetch('/api/xrpc/io.exprsn.studio.effects.presets');
      return response.json();
    },
  });

  const categories: EffectCategory[] = effectsData?.categories || [];
  const effectsByCategory: Record<string, EffectDefinition[]> = effectsData?.effectsByCategory || {};
  const presets: EffectPreset[] = presetsData?.presets || [];
  const userPresets: EffectPreset[] = presetsData?.userPresets || [];

  // Apply preset
  const handleApplyPreset = useCallback(
    (preset: EffectPreset) => {
      setAppliedEffects(preset.effects);
      onEffectsChange(preset.effects);
      toast.success(`Applied "${preset.name}" preset`);
    },
    [onEffectsChange]
  );

  // Add effect
  const handleAddEffect = useCallback(
    (effect: EffectDefinition) => {
      const defaultParams: Record<string, number | string | boolean> = {};
      effect.params.forEach((p) => {
        defaultParams[p.name] = p.default;
      });

      const newEffect: AppliedEffect = {
        type: effect.type,
        params: defaultParams,
      };

      const newEffects = [...appliedEffects, newEffect];
      setAppliedEffects(newEffects);
      onEffectsChange(newEffects);
      setExpandedEffect(effect.type);
    },
    [appliedEffects, onEffectsChange]
  );

  // Update effect params
  const handleUpdateEffect = useCallback(
    (effectType: string, paramName: string, value: number | string | boolean) => {
      const newEffects = appliedEffects.map((e) => {
        if (e.type === effectType) {
          return { ...e, params: { ...e.params, [paramName]: value } };
        }
        return e;
      });
      setAppliedEffects(newEffects);
      onEffectsChange(newEffects);
    },
    [appliedEffects, onEffectsChange]
  );

  // Remove effect
  const handleRemoveEffect = useCallback(
    (effectType: string) => {
      const newEffects = appliedEffects.filter((e) => e.type !== effectType);
      setAppliedEffects(newEffects);
      onEffectsChange(newEffects);
    },
    [appliedEffects, onEffectsChange]
  );

  // Clear all effects
  const handleClearEffects = useCallback(() => {
    setAppliedEffects([]);
    onEffectsChange([]);
  }, [onEffectsChange]);

  // Save as preset mutation
  const savePresetMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const response = await fetch('/api/xrpc/io.exprsn.studio.effects.savePreset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          effects: appliedEffects,
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['effects', 'presets'] });
      toast.success('Preset saved!');
    },
    onError: () => {
      toast.error('Failed to save preset');
    },
  });

  // Find effect definition
  const getEffectDefinition = (type: string): EffectDefinition | undefined => {
    for (const effects of Object.values(effectsByCategory)) {
      const found = effects.find((e) => e.type === type);
      if (found) return found;
    }
    return undefined;
  };

  return (
    <div className="h-full flex flex-col bg-surface border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-semibold text-text-primary">Effects</h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('presets')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'presets'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Presets
        </button>
        <button
          onClick={() => setActiveTab('effects')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'effects'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Effects
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'presets' && (
          <div className="space-y-4">
            {/* System Presets */}
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className="p-3 bg-surface-hover rounded-lg text-left hover:bg-border transition-colors"
                >
                  <div className="font-medium text-sm text-text-primary">{preset.name}</div>
                  <div className="text-xs text-text-muted mt-1">{preset.description}</div>
                </button>
              ))}
            </div>

            {/* User Presets */}
            {userPresets.length > 0 && (
              <>
                <div className="pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-text-muted mb-2">My Presets</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {userPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      className="p-3 bg-accent/10 rounded-lg text-left hover:bg-accent/20 transition-colors"
                    >
                      <div className="font-medium text-sm text-text-primary">{preset.name}</div>
                      <div className="text-xs text-text-muted mt-1">{preset.description}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="space-y-4">
            {/* Category Filter */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedCategory === null
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-muted hover:text-text-primary'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-accent text-text-inverse'
                      : 'bg-surface-hover text-text-muted hover:text-text-primary'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Effects List */}
            <div className="space-y-2">
              {Object.entries(effectsByCategory)
                .filter(([cat]) => !selectedCategory || cat === selectedCategory)
                .map(([category, effects]) => (
                  <div key={category}>
                    {!selectedCategory && (
                      <h4 className="text-xs font-medium text-text-muted uppercase mb-2">
                        {categories.find((c) => c.id === category)?.name || category}
                      </h4>
                    )}
                    <div className="space-y-1">
                      {effects.map((effect) => {
                        const isApplied = appliedEffects.some((e) => e.type === effect.type);
                        return (
                          <button
                            key={effect.type}
                            onClick={() => !isApplied && handleAddEffect(effect)}
                            disabled={isApplied}
                            className={`w-full px-3 py-2 text-left rounded-lg transition-colors ${
                              isApplied
                                ? 'bg-accent/20 text-accent cursor-default'
                                : 'bg-surface-hover hover:bg-border text-text-primary'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{effect.name}</span>
                              {isApplied && (
                                <span className="text-xs text-accent">Added</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Applied Effects */}
      {appliedEffects.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 py-2 flex items-center justify-between bg-surface-hover">
            <span className="text-sm font-medium text-text-primary">
              Applied ({appliedEffects.length})
            </span>
            <button
              onClick={handleClearEffects}
              className="text-xs text-text-muted hover:text-red-500 transition-colors"
            >
              Clear All
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto p-2 space-y-2">
            {appliedEffects.map((effect) => {
              const definition = getEffectDefinition(effect.type);
              const isExpanded = expandedEffect === effect.type;

              return (
                <div key={effect.type} className="bg-surface-hover rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2">
                    <button
                      onClick={() => setExpandedEffect(isExpanded ? null : effect.type)}
                      className="flex-1 text-left text-sm text-text-primary font-medium"
                    >
                      {definition?.name || effect.type}
                    </button>
                    <button
                      onClick={() => handleRemoveEffect(effect.type)}
                      className="text-text-muted hover:text-red-500 transition-colors"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Effect Controls */}
                  {isExpanded && definition && (
                    <div className="px-3 pb-3 space-y-3">
                      {definition.params.map((param) => (
                        <EffectControl
                          key={param.name}
                          param={param}
                          value={effect.params[param.name]}
                          onChange={(value) =>
                            handleUpdateEffect(effect.type, param.name, value)
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Save Preset Button */}
          <div className="p-2 border-t border-border">
            <button
              onClick={() => {
                const name = prompt('Preset name:');
                if (name) {
                  savePresetMutation.mutate({ name, description: '' });
                }
              }}
              className="w-full px-3 py-2 bg-accent text-text-inverse text-sm rounded-lg hover:bg-accent-hover transition-colors"
            >
              Save as Preset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Effect Control Component
interface EffectControlProps {
  param: EffectParam;
  value: number | string | boolean;
  onChange: (value: number | string | boolean) => void;
}

function EffectControl({ param, value, onChange }: EffectControlProps) {
  if (param.type === 'range' || param.type === 'number') {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-text-muted">{param.label}</label>
          <span className="text-xs text-text-primary font-mono">
            {typeof value === 'number' ? value.toFixed(2) : value}
          </span>
        </div>
        <input
          type="range"
          min={param.min ?? 0}
          max={param.max ?? 1}
          step={param.step ?? 0.01}
          value={value as number}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
      </div>
    );
  }

  if (param.type === 'boolean') {
    return (
      <div className="flex items-center justify-between">
        <label className="text-xs text-text-muted">{param.label}</label>
        <button
          onClick={() => onChange(!value)}
          className={`w-10 h-6 rounded-full transition-colors ${
            value ? 'bg-accent' : 'bg-gray-600'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform ${
              value ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    );
  }

  if (param.type === 'select' && param.options) {
    return (
      <div>
        <label className="text-xs text-text-muted mb-1 block">{param.label}</label>
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 bg-surface border border-border rounded text-text-primary text-sm"
        >
          {param.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (param.type === 'color') {
    return (
      <div>
        <label className="text-xs text-text-muted mb-1 block">{param.label}</label>
        <input
          type="color"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 rounded cursor-pointer"
        />
      </div>
    );
  }

  return null;
}

// Icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default EffectsPanel;
