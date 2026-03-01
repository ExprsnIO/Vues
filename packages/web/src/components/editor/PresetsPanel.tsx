'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEditor } from '@/lib/editor-context';
import type { EffectInstance } from './effects';

// ============================================================================
// Types
// ============================================================================

interface EffectPreset {
  id: string;
  name: string;
  category: string;
  type: string;
  isBuiltIn: boolean;
  isPublic: boolean;
  isFavorite?: boolean;
  params: Record<string, number | string | boolean>;
  thumbnail?: string;
  ownerDid?: string;
  createdAt: string;
}

type PresetCategory = 'all' | 'favorites' | 'recent' | 'style' | 'color' | 'mood' | 'social' | 'my-presets';

// ============================================================================
// Built-in Presets (fallback when API unavailable)
// ============================================================================

const BUILT_IN_PRESETS: EffectPreset[] = [
  // Style presets
  { id: 'preset-vintage', name: 'Vintage Film', category: 'style', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 0.8, contrast: 1.1, temperature: 0.15, grain: 0.3 }, createdAt: '' },
  { id: 'preset-noir', name: 'Film Noir', category: 'style', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 0, contrast: 1.4, brightness: 0.95, vignette: 0.5 }, createdAt: '' },
  { id: 'preset-cyberpunk', name: 'Cyberpunk', category: 'style', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 1.3, contrast: 1.2, tint: 0.3, chromaShift: 0.1 }, createdAt: '' },
  { id: 'preset-dreamy', name: 'Dreamy', category: 'style', type: 'blur', isBuiltIn: true, isPublic: true, params: { radius: 0.5, bloom: 0.4, saturation: 1.1 }, createdAt: '' },

  // Color presets
  { id: 'preset-warm', name: 'Warm Glow', category: 'color', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { temperature: 0.25, saturation: 1.1, brightness: 1.05 }, createdAt: '' },
  { id: 'preset-cool', name: 'Cool Tone', category: 'color', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { temperature: -0.2, saturation: 0.95, contrast: 1.05 }, createdAt: '' },
  { id: 'preset-vibrant', name: 'Vibrant Pop', category: 'color', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 1.4, contrast: 1.15, brightness: 1.05 }, createdAt: '' },
  { id: 'preset-muted', name: 'Muted Tones', category: 'color', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 0.7, contrast: 0.95, lift: 0.05 }, createdAt: '' },

  // Mood presets
  { id: 'preset-sunset', name: 'Golden Hour', category: 'mood', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { temperature: 0.35, saturation: 1.2, contrast: 1.1, orange: 0.15 }, createdAt: '' },
  { id: 'preset-night', name: 'Night Mode', category: 'mood', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { brightness: 0.85, contrast: 1.2, blue: 0.15, saturation: 0.9 }, createdAt: '' },
  { id: 'preset-dramatic', name: 'Dramatic', category: 'mood', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { contrast: 1.35, saturation: 1.1, clarity: 0.3, vignette: 0.4 }, createdAt: '' },
  { id: 'preset-soft', name: 'Soft & Airy', category: 'mood', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { brightness: 1.1, contrast: 0.9, saturation: 0.85, lift: 0.08 }, createdAt: '' },

  // Social presets
  { id: 'preset-tiktok', name: 'TikTok Viral', category: 'social', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 1.3, contrast: 1.15, sharpen: 0.2 }, createdAt: '' },
  { id: 'preset-instagram', name: 'Instagram Clean', category: 'social', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 1.1, contrast: 1.05, fade: 0.1, vignette: 0.15 }, createdAt: '' },
  { id: 'preset-cinematic', name: 'Cinematic 2.35:1', category: 'social', type: 'crop', isBuiltIn: true, isPublic: true, params: { aspectRatio: 2.35, letterbox: true }, createdAt: '' },
  { id: 'preset-vlog', name: 'Vlog Style', category: 'social', type: 'colorGrade', isBuiltIn: true, isPublic: true, params: { saturation: 1.05, contrast: 1.08, brightness: 1.03, sharpness: 0.15 }, createdAt: '' },
];

// ============================================================================
// Component
// ============================================================================

export function PresetsPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<PresetCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPreset, setPreviewPreset] = useState<EffectPreset | null>(null);
  const { state, dispatch } = useEditor();
  const queryClient = useQueryClient();

  // Fetch presets from API
  const { data: apiPresets, isLoading } = useQuery({
    queryKey: ['effect-presets', selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all' && selectedCategory !== 'favorites' && selectedCategory !== 'recent' && selectedCategory !== 'my-presets') {
        params.set('category', selectedCategory);
      }
      if (selectedCategory === 'my-presets') {
        params.set('ownerOnly', 'true');
      }
      if (selectedCategory === 'favorites') {
        params.set('favorites', 'true');
      }
      if (searchQuery) {
        params.set('search', searchQuery);
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.listEffectPresets?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
        }
      );

      if (!response.ok) {
        // Return built-in presets as fallback
        return null;
      }

      const data = await response.json();
      return data.presets as EffectPreset[];
    },
    staleTime: 30000,
  });

  // Combine API presets with built-in
  const allPresets = useMemo(() => {
    const presets = apiPresets || BUILT_IN_PRESETS;
    return presets;
  }, [apiPresets]);

  // Filter presets
  const filteredPresets = useMemo(() => {
    return allPresets.filter(preset => {
      // Category filter
      if (selectedCategory !== 'all' && selectedCategory !== 'favorites' && selectedCategory !== 'recent' && selectedCategory !== 'my-presets') {
        if (preset.category !== selectedCategory) return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          preset.name.toLowerCase().includes(query) ||
          preset.category.toLowerCase().includes(query) ||
          preset.type.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [allPresets, selectedCategory, searchQuery]);

  // Apply preset to selected element or globally
  const applyPreset = useCallback((preset: EffectPreset) => {
    const selectedIds = state.selectedElementIds;

    // Create effect instance from preset
    const effect: EffectInstance = {
      id: crypto.randomUUID(),
      effectId: preset.type,
      enabled: true,
      parameters: { ...preset.params },
      order: 0,
    };

    if (selectedIds.length > 0) {
      // Apply to selected elements
      selectedIds.forEach(elementId => {
        const element = state.project.elements.find(el => el.id === elementId);
        if (element) {
          dispatch({
            type: 'UPDATE_EFFECTS',
            elementId,
            effects: [...element.effects, effect],
          });
        }
      });
    } else {
      // Apply globally
      dispatch({
        type: 'UPDATE_GLOBAL_EFFECTS',
        effects: [...state.project.globalEffects, effect],
      });
    }
  }, [state.selectedElementIds, state.project.elements, state.project.globalEffects, dispatch]);

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.togglePresetFavorite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
          body: JSON.stringify({ presetId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to toggle favorite');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['effect-presets'] });
    },
  });

  const categories: { id: PresetCategory; label: string }[] = [
    { id: 'all', label: 'All Presets' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'recent', label: 'Recent' },
    { id: 'style', label: 'Style' },
    { id: 'color', label: 'Color' },
    { id: 'mood', label: 'Mood' },
    { id: 'social', label: 'Social' },
    { id: 'my-presets', label: 'My Presets' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">Effect Presets</h3>
        <button
          onClick={onClose}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Category Tabs */}
      <div className="p-2 border-b border-border flex gap-1 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary hover:bg-surface'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search presets..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Presets Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-surface rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <p className="text-sm">No presets found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredPresets.map(preset => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isPreview={previewPreset?.id === preset.id}
                onPreview={() => setPreviewPreset(preset)}
                onStopPreview={() => setPreviewPreset(null)}
                onApply={() => {
                  applyPreset(preset);
                  setPreviewPreset(null);
                }}
                onToggleFavorite={() => toggleFavoriteMutation.mutate(preset.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Info */}
      {previewPreset && (
        <div className="p-3 border-t border-border bg-surface/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">{previewPreset.name}</p>
              <p className="text-xs text-text-muted">{previewPreset.category} • {previewPreset.type}</p>
            </div>
            <button
              onClick={() => {
                applyPreset(previewPreset);
                setPreviewPreset(null);
              }}
              className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Preset Card
// ============================================================================

function PresetCard({
  preset,
  isPreview,
  onPreview,
  onStopPreview,
  onApply,
  onToggleFavorite,
}: {
  preset: EffectPreset;
  isPreview: boolean;
  onPreview: () => void;
  onStopPreview: () => void;
  onApply: () => void;
  onToggleFavorite: () => void;
}) {
  // Generate a gradient based on preset params
  const gradientStyle = useMemo(() => {
    const params = preset.params;
    const temp = (params.temperature as number) || 0;
    const sat = (params.saturation as number) || 1;

    const hue1 = temp > 0 ? 30 : 210;
    const hue2 = temp > 0 ? 60 : 240;
    const satPercent = Math.min(100, Math.max(20, sat * 50));

    return {
      background: `linear-gradient(135deg, hsl(${hue1}, ${satPercent}%, 30%), hsl(${hue2}, ${satPercent}%, 20%))`,
    };
  }, [preset.params]);

  return (
    <div
      className={`relative rounded-lg overflow-hidden cursor-pointer group ${
        isPreview ? 'ring-2 ring-accent' : ''
      }`}
      onMouseEnter={onPreview}
      onMouseLeave={onStopPreview}
      onClick={onApply}
    >
      {/* Preview */}
      <div className="aspect-square" style={gradientStyle}>
        {preset.thumbnail ? (
          <img
            src={preset.thumbnail}
            alt={preset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PresetIcon className="w-8 h-8 text-white/30" />
          </div>
        )}

        {/* Favorite button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-colors ${
            preset.isFavorite
              ? 'text-yellow-500 bg-black/30'
              : 'text-white/50 hover:text-white bg-black/20'
          }`}
        >
          <StarIcon className="w-3.5 h-3.5" filled={preset.isFavorite} />
        </button>

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
            isPreview ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <span className="text-xs text-white font-medium">Click to Apply</span>
        </div>
      </div>

      {/* Name */}
      <div className="p-1.5 bg-surface">
        <p className="text-xs font-medium text-text-primary truncate">{preset.name}</p>
        <p className="text-[10px] text-text-muted truncate">{preset.category}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function PresetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
