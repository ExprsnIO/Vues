'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EditorSettings as EditorSettingsType, UserSettingsUpdate, CustomEffectPreset } from '@exprsn/shared';
import { SettingsRow, ToggleSwitch, Select } from './SettingsSection';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface EditorSettingsProps {
  editor: EditorSettingsType;
  onUpdate: (update: UserSettingsUpdate) => void;
  isUpdating: boolean;
}

interface EffectPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  effects: Array<{ type: string; params: Record<string, number | string | boolean> }>;
}

// System preset categories and their icons
const CATEGORY_ICONS: Record<string, string> = {
  style: 'paintbrush',
  color: 'palette',
  mood: 'face',
  social: 'share',
  portrait: 'user',
  landscape: 'mountain',
  custom: 'star',
};

export function EditorSettings({ editor, onUpdate, isUpdating }: EditorSettingsProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPresetForEdit, setSelectedPresetForEdit] = useState<CustomEffectPreset | null>(null);

  // Zustand actions
  const addCustomPreset = useSettingsStore((state) => state.addCustomPreset);
  const removeCustomPreset = useSettingsStore((state) => state.removeCustomPreset);
  const toggleFavoritePreset = useSettingsStore((state) => state.toggleFavoritePreset);
  const updateEditor = useSettingsStore((state) => state.updateEditor);

  // Get editor settings from store as fallback
  const storeEditor = useSettingsStore((state) => state.settings.editor);

  // Use provided editor prop or fall back to store
  const editorSettings = editor || storeEditor;

  // Fetch system presets
  const { data: presetsData } = useQuery({
    queryKey: ['effects', 'presets'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.studio.effects.presets`);
      return response.json();
    },
  });

  const systemPresets: EffectPreset[] = presetsData?.presets || [];

  // Combine system presets with custom presets (defensive: use empty array if undefined)
  const customPresets = editorSettings?.customPresets || [];
  const allPresets = [
    ...systemPresets,
    ...customPresets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || 'Custom preset',
      category: 'custom',
      effects: p.effects,
    })),
  ];

  const handleSetDefaultPreset = useCallback(
    (presetId: string | null) => {
      updateEditor({ defaultPresetId: presetId });
      onUpdate({ editor: { defaultPresetId: presetId } });
    },
    [updateEditor, onUpdate]
  );

  const handleToggleAutoApply = useCallback(
    (autoApply: boolean) => {
      updateEditor({ autoApplyDefault: autoApply });
      onUpdate({ editor: { autoApplyDefault: autoApply } });
    },
    [updateEditor, onUpdate]
  );

  const handleToggleDescriptions = useCallback(
    (show: boolean) => {
      updateEditor({ showPresetDescriptions: show });
      onUpdate({ editor: { showPresetDescriptions: show } });
    },
    [updateEditor, onUpdate]
  );

  const handleCreatePreset = useCallback(
    (name: string, description: string, effects: Array<{ type: string; params: Record<string, number | string | boolean> }>) => {
      addCustomPreset({ name, description, effects });
      toast.success(`Created preset "${name}"`);
      setShowCreateModal(false);
    },
    [addCustomPreset]
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      const preset = editorSettings.customPresets.find((p) => p.id === presetId);
      if (preset && window.confirm(`Delete preset "${preset.name}"?`)) {
        removeCustomPreset(presetId);
        toast.success('Preset deleted');
      }
    },
    [editorSettings.customPresets, removeCustomPreset]
  );

  const handleToggleFavorite = useCallback(
    (presetId: string) => {
      toggleFavoritePreset(presetId);
    },
    [toggleFavoritePreset]
  );

  // Get preset by ID
  const getPresetById = (id: string): EffectPreset | undefined => {
    return allPresets.find((p) => p.id === id);
  };

  const defaultPreset = editorSettings.defaultPresetId ? getPresetById(editorSettings.defaultPresetId) : null;

  return (
    <div className="space-y-6">
      {/* Default Preset */}
      <div>
        <p className="text-sm font-medium text-text-primary mb-3">Default Effect Preset</p>
        <p className="text-xs text-text-muted mb-3">
          This preset will be suggested when you start editing a new video.
        </p>
        <Select
          value={editorSettings.defaultPresetId || 'none'}
          onChange={(value) => handleSetDefaultPreset(value === 'none' ? null : value)}
          options={[
            { value: 'none', label: 'None' },
            ...allPresets.map((p) => ({ value: p.id, label: `${p.name} (${p.category})` })),
          ]}
          disabled={isUpdating}
        />
      </div>

      {/* Auto-apply default */}
      <SettingsRow
        label="Auto-apply default preset"
        description="Automatically apply the default preset when starting the editor"
      >
        <ToggleSwitch
          checked={editorSettings.autoApplyDefault}
          onChange={handleToggleAutoApply}
          disabled={isUpdating || !editorSettings.defaultPresetId}
        />
      </SettingsRow>

      {/* Show descriptions */}
      <SettingsRow
        label="Show preset descriptions"
        description="Display descriptions below preset names in the effects panel"
      >
        <ToggleSwitch
          checked={editorSettings.showPresetDescriptions}
          onChange={handleToggleDescriptions}
          disabled={isUpdating}
        />
      </SettingsRow>

      {/* Favorite Presets */}
      <div>
        <p className="text-sm font-medium text-text-primary mb-3">Favorite Presets</p>
        <p className="text-xs text-text-muted mb-3">
          Quick access to your favorite presets in the editor.
        </p>
        {(!editorSettings.favoritePresetIds || editorSettings.favoritePresetIds.length === 0) ? (
          <p className="text-sm text-text-muted italic">No favorites yet. Star presets in the editor to add them here.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(editorSettings.favoritePresetIds || []).map((presetId) => {
              const preset = getPresetById(presetId);
              if (!preset) return null;
              return (
                <div
                  key={presetId}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover rounded-lg"
                >
                  <span className="text-sm text-text-primary">{preset.name}</span>
                  <button
                    onClick={() => handleToggleFavorite(presetId)}
                    className="text-yellow-500 hover:text-yellow-400"
                    title="Remove from favorites"
                  >
                    <StarFilledIcon className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Presets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Custom Presets</p>
            <p className="text-xs text-text-muted mt-1">
              Create your own effect combinations.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 bg-accent text-text-inverse text-sm rounded-lg hover:bg-accent-hover transition-colors"
          >
            Create New
          </button>
        </div>

        {(!editorSettings.customPresets || editorSettings.customPresets.length === 0) ? (
          <p className="text-sm text-text-muted italic">No custom presets yet.</p>
        ) : (
          <div className="space-y-2">
            {(editorSettings.customPresets || []).map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between p-3 bg-surface-hover rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-text-primary">{preset.name}</span>
                    {(editorSettings.favoritePresetIds || []).includes(preset.id) && (
                      <StarFilledIcon className="w-3 h-3 text-yellow-500" />
                    )}
                    {editorSettings.defaultPresetId === preset.id && (
                      <span className="px-1.5 py-0.5 bg-accent/20 text-accent text-xs rounded">Default</span>
                    )}
                  </div>
                  {preset.description && (
                    <p className="text-xs text-text-muted mt-1">{preset.description}</p>
                  )}
                  <p className="text-xs text-text-muted mt-1">
                    {preset.effects.length} effect{preset.effects.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleFavorite(preset.id)}
                    className={cn(
                      'p-1.5 rounded hover:bg-surface transition-colors',
                      (editorSettings.favoritePresetIds || []).includes(preset.id) ? 'text-yellow-500' : 'text-text-muted'
                    )}
                    title={(editorSettings.favoritePresetIds || []).includes(preset.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {(editorSettings.favoritePresetIds || []).includes(preset.id) ? (
                      <StarFilledIcon className="w-4 h-4" />
                    ) : (
                      <StarIcon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedPresetForEdit(preset)}
                    className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface rounded transition-colors"
                    title="Edit preset"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePreset(preset.id)}
                    className="p-1.5 text-text-muted hover:text-red-500 hover:bg-surface rounded transition-colors"
                    title="Delete preset"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Presets */}
      {editorSettings.recentPresetIds && editorSettings.recentPresetIds.length > 0 && (
        <div>
          <p className="text-sm font-medium text-text-primary mb-3">Recently Used</p>
          <div className="flex flex-wrap gap-2">
            {(editorSettings.recentPresetIds || []).slice(0, 5).map((presetId) => {
              const preset = getPresetById(presetId);
              if (!preset) return null;
              return (
                <span
                  key={presetId}
                  className="px-2 py-1 bg-surface-hover text-text-muted text-xs rounded"
                >
                  {preset.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Preset Modal */}
      {showCreateModal && (
        <CreatePresetModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePreset}
        />
      )}

      {/* Edit Preset Modal */}
      {selectedPresetForEdit && (
        <EditPresetModal
          preset={selectedPresetForEdit}
          onClose={() => setSelectedPresetForEdit(null)}
          onSave={(name, description) => {
            // Update the preset in the store
            const updatedPresets = editorSettings.customPresets.map((p) =>
              p.id === selectedPresetForEdit.id ? { ...p, name, description } : p
            );
            updateEditor({ customPresets: updatedPresets });
            toast.success('Preset updated');
            setSelectedPresetForEdit(null);
          }}
        />
      )}
    </div>
  );
}

// Create Preset Modal
interface CreatePresetModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string, effects: Array<{ type: string; params: Record<string, number | string | boolean> }>) => void;
}

function CreatePresetModal({ onClose, onCreate }: CreatePresetModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEffects, setSelectedEffects] = useState<Array<{ type: string; params: Record<string, number | string | boolean> }>>([]);

  // Fetch available effects
  const { data: effectsData } = useQuery({
    queryKey: ['effects', 'list'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.studio.effects.list`);
      return response.json();
    },
  });

  const effectsByCategory: Record<string, Array<{ type: string; name: string; params: Array<{ name: string; default: number | string | boolean }> }>> =
    effectsData?.effectsByCategory || {};

  const handleAddEffect = (effectType: string, effectDef: { params: Array<{ name: string; default: number | string | boolean }> }) => {
    const defaultParams: Record<string, number | string | boolean> = {};
    effectDef.params.forEach((p) => {
      defaultParams[p.name] = p.default;
    });
    setSelectedEffects([...selectedEffects, { type: effectType, params: defaultParams }]);
  };

  const handleRemoveEffect = (index: number) => {
    setSelectedEffects(selectedEffects.filter((_, i) => i !== index));
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (selectedEffects.length === 0) {
      toast.error('Please add at least one effect');
      return;
    }
    onCreate(name.trim(), description.trim(), selectedEffects);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Create Custom Preset</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Look"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
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

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Effects</label>

            {/* Selected effects */}
            {selectedEffects.length > 0 && (
              <div className="mb-3 space-y-2">
                {selectedEffects.map((effect, index) => (
                  <div key={index} className="flex items-center justify-between px-3 py-2 bg-surface-hover rounded-lg">
                    <span className="text-sm text-text-primary">{effect.type}</span>
                    <button
                      onClick={() => handleRemoveEffect(index)}
                      className="text-text-muted hover:text-red-500"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add effect */}
            <div className="border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
              {Object.entries(effectsByCategory).map(([category, effects]) => (
                <div key={category} className="mb-3 last:mb-0">
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">{category}</p>
                  <div className="flex flex-wrap gap-1">
                    {effects.map((effect) => {
                      const isAdded = selectedEffects.some((e) => e.type === effect.type);
                      return (
                        <button
                          key={effect.type}
                          onClick={() => !isAdded && handleAddEffect(effect.type, effect)}
                          disabled={isAdded}
                          className={cn(
                            'px-2 py-1 text-xs rounded transition-colors',
                            isAdded
                              ? 'bg-accent/20 text-accent cursor-default'
                              : 'bg-surface-hover text-text-primary hover:bg-border'
                          )}
                        >
                          {effect.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
            onClick={handleCreate}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
          >
            Create Preset
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit Preset Modal
interface EditPresetModalProps {
  preset: CustomEffectPreset;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}

function EditPresetModal({ preset, onClose, onSave }: EditPresetModalProps) {
  const [name, setName] = useState(preset.name);
  const [description, setDescription] = useState(preset.description || '');

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    onSave(name.trim(), description.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Edit Preset</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>

          <div>
            <p className="text-sm text-text-muted">
              {preset.effects.length} effect{preset.effects.length !== 1 ? 's' : ''}: {preset.effects.map((e) => e.type).join(', ')}
            </p>
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
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// Icons
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

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default EditorSettings;
