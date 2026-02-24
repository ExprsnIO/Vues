'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEditor } from '@/stores/settings-store';
import { cn } from '@/lib/utils';
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
  const [selectedPresetCategory, setSelectedPresetCategory] = useState<string | null>(null);
  const [appliedEffects, setAppliedEffects] = useState<AppliedEffect[]>(initialEffects);
  const [expandedEffect, setExpandedEffect] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // User editor settings
  const {
    favoritePresetIds,
    recentPresetIds,
    customPresets,
    showPresetDescriptions,
    toggleFavoritePreset,
    addRecentPreset,
    addCustomPreset,
  } = useEditor();

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
  const presetCategories: string[] = presetsData?.categories || ['style', 'color', 'mood', 'social', 'portrait', 'landscape', 'custom'];

  // Category display names
  const presetCategoryNames: Record<string, string> = {
    style: 'Style',
    color: 'Color',
    mood: 'Mood',
    social: 'Social',
    portrait: 'Portrait',
    landscape: 'Landscape',
    custom: 'My Presets',
  };

  // Group presets by category
  const presetsByCategory = presets.reduce((acc, preset) => {
    const cat = preset.category || 'style';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(preset);
    return acc;
  }, {} as Record<string, EffectPreset[]>);

  // All presets including custom ones from settings
  const allPresets: EffectPreset[] = [
    ...presets,
    ...customPresets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      category: 'custom',
      effects: p.effects,
      isCustom: true,
    })),
  ];

  // Get preset by ID
  const getPresetById = (id: string): EffectPreset | undefined => {
    return allPresets.find((p) => p.id === id);
  };

  // Favorite presets
  const favoritePresets = favoritePresetIds
    .map((id) => getPresetById(id))
    .filter((p): p is EffectPreset => p !== undefined);

  // Recent presets
  const recentPresets = recentPresetIds
    .map((id) => getPresetById(id))
    .filter((p): p is EffectPreset => p !== undefined)
    .slice(0, 5);

  // Apply preset
  const handleApplyPreset = useCallback(
    (preset: EffectPreset) => {
      setAppliedEffects(preset.effects);
      onEffectsChange(preset.effects);
      addRecentPreset(preset.id);
      toast.success(`Applied "${preset.name}" preset`);
    },
    [onEffectsChange, addRecentPreset]
  );

  // Toggle favorite
  const handleToggleFavorite = useCallback(
    (presetId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavoritePreset(presetId);
      const isFav = favoritePresetIds.includes(presetId);
      toast.success(isFav ? 'Removed from favorites' : 'Added to favorites');
    },
    [toggleFavoritePreset, favoritePresetIds]
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
            {/* Favorites Section */}
            {favoritePresets.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-yellow-500 uppercase mb-2 flex items-center gap-1">
                  <StarFilledIcon className="w-3 h-3" /> Favorites
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {favoritePresets.map((preset) => (
                    <PresetButton
                      key={preset.id}
                      preset={preset}
                      isFavorite={true}
                      showDescription={showPresetDescriptions}
                      onApply={() => handleApplyPreset(preset)}
                      onToggleFavorite={(e) => handleToggleFavorite(preset.id, e)}
                      variant="favorite"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Section */}
            {recentPresets.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-text-muted uppercase mb-2 flex items-center gap-1">
                  <ClockIcon className="w-3 h-3" /> Recent
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {recentPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      className="flex-shrink-0 px-3 py-1.5 bg-surface-hover rounded-lg text-sm text-text-primary hover:bg-border transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category Filter */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedPresetCategory(null)}
                className={cn(
                  'px-2 py-1 text-xs rounded transition-colors',
                  selectedPresetCategory === null
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-muted hover:text-text-primary'
                )}
              >
                All
              </button>
              {presetCategories.filter(c => c !== 'custom').map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedPresetCategory(cat)}
                  className={cn(
                    'px-2 py-1 text-xs rounded transition-colors',
                    selectedPresetCategory === cat
                      ? 'bg-accent text-text-inverse'
                      : 'bg-surface-hover text-text-muted hover:text-text-primary'
                  )}
                >
                  {presetCategoryNames[cat] || cat}
                </button>
              ))}
            </div>

            {/* Presets by Category */}
            {selectedPresetCategory === null ? (
              // Show all categories
              Object.entries(presetsByCategory).map(([category, categoryPresets]) => (
                <div key={category}>
                  <h3 className="text-xs font-medium text-text-muted uppercase mb-2 mt-3">
                    {presetCategoryNames[category] || category}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {categoryPresets.map((preset) => (
                      <PresetButton
                        key={preset.id}
                        preset={preset}
                        isFavorite={favoritePresetIds.includes(preset.id)}
                        showDescription={showPresetDescriptions}
                        onApply={() => handleApplyPreset(preset)}
                        onToggleFavorite={(e) => handleToggleFavorite(preset.id, e)}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              // Show selected category only
              <div className="grid grid-cols-2 gap-2">
                {(presetsByCategory[selectedPresetCategory] || []).map((preset) => (
                  <PresetButton
                    key={preset.id}
                    preset={preset}
                    isFavorite={favoritePresetIds.includes(preset.id)}
                    showDescription={showPresetDescriptions}
                    onApply={() => handleApplyPreset(preset)}
                    onToggleFavorite={(e) => handleToggleFavorite(preset.id, e)}
                  />
                ))}
              </div>
            )}

            {/* Custom Presets from Settings */}
            {customPresets.length > 0 && (
              <>
                <div className="pt-4 border-t border-border">
                  <h3 className="text-xs font-medium text-accent uppercase mb-2">My Custom Presets</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {customPresets.map((preset) => (
                    <PresetButton
                      key={preset.id}
                      preset={{
                        id: preset.id,
                        name: preset.name,
                        description: preset.description || '',
                        category: 'custom',
                        effects: preset.effects,
                        isCustom: true,
                      }}
                      isFavorite={favoritePresetIds.includes(preset.id)}
                      showDescription={showPresetDescriptions}
                      onApply={() => handleApplyPreset({
                        id: preset.id,
                        name: preset.name,
                        description: preset.description || '',
                        category: 'custom',
                        effects: preset.effects,
                        isCustom: true,
                      })}
                      onToggleFavorite={(e) => handleToggleFavorite(preset.id, e)}
                      variant="custom"
                    />
                  ))}
                </div>
              </>
            )}

            {/* User Presets from Server (legacy) */}
            {userPresets.length > 0 && (
              <>
                <div className="pt-4 border-t border-border">
                  <h3 className="text-xs font-medium text-text-muted uppercase mb-2">Saved Presets</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {userPresets.map((preset) => (
                    <PresetButton
                      key={preset.id}
                      preset={preset}
                      isFavorite={favoritePresetIds.includes(preset.id)}
                      showDescription={showPresetDescriptions}
                      onApply={() => handleApplyPreset(preset)}
                      onToggleFavorite={(e) => handleToggleFavorite(preset.id, e)}
                    />
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
              onClick={() => setShowSaveModal(true)}
              className="w-full px-3 py-2 bg-accent text-text-inverse text-sm rounded-lg hover:bg-accent-hover transition-colors"
            >
              Save as Custom Preset
            </button>
          </div>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSaveModal && (
        <SavePresetModal
          effects={appliedEffects}
          onClose={() => setShowSaveModal(false)}
          onSave={(name, description) => {
            addCustomPreset({ name, description, effects: appliedEffects });
            toast.success(`Created preset "${name}"`);
            setShowSaveModal(false);
          }}
        />
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

// Preset Button Component
interface PresetButtonProps {
  preset: EffectPreset;
  isFavorite: boolean;
  showDescription: boolean;
  onApply: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  variant?: 'default' | 'favorite' | 'custom';
}

function PresetButton({ preset, isFavorite, showDescription, onApply, onToggleFavorite, variant = 'default' }: PresetButtonProps) {
  const bgClass = {
    default: 'bg-surface-hover hover:bg-border',
    favorite: 'bg-yellow-500/10 hover:bg-yellow-500/20',
    custom: 'bg-accent/10 hover:bg-accent/20',
  }[variant];

  return (
    <div className={cn('relative p-3 rounded-lg text-left transition-colors group', bgClass)}>
      <button onClick={onApply} className="w-full text-left">
        <div className="flex items-center gap-1">
          <span className="font-medium text-sm text-text-primary">{preset.name}</span>
          {isFavorite && <StarFilledIcon className="w-3 h-3 text-yellow-500" />}
        </div>
        {showDescription && preset.description && (
          <div className="text-xs text-text-muted mt-1 line-clamp-1">{preset.description}</div>
        )}
      </button>
      <button
        onClick={onToggleFavorite}
        className={cn(
          'absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
          isFavorite ? 'text-yellow-500' : 'text-text-muted hover:text-yellow-500'
        )}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFavorite ? <StarFilledIcon className="w-4 h-4" /> : <StarIcon className="w-4 h-4" />}
      </button>
    </div>
  );
}

// Save Preset Modal
interface SavePresetModalProps {
  effects: AppliedEffect[];
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}

function SavePresetModal({ effects, onClose, onSave }: SavePresetModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    onSave(name.trim(), description.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md m-4">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Save Custom Preset</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Look"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A warm vintage look..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>

          <div className="p-3 bg-surface-hover rounded-lg">
            <p className="text-xs text-text-muted mb-2">Effects included:</p>
            <div className="flex flex-wrap gap-1">
              {effects.map((effect) => (
                <span key={effect.type} className="px-2 py-0.5 bg-surface text-xs text-text-primary rounded">
                  {effect.type}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  );
}

// Icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function StarFilledIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default EffectsPanel;
