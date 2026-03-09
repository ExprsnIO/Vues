'use client';

import { useState, useRef, useEffect } from 'react';
import { useFilterPresetsStore, FilterPreset } from '@/stores/filter-presets-store';
import { UseAdminFiltersReturn, SortDirection } from '@/hooks/useAdminFilters';

interface FilterPresetsProps {
  pageKey: string;
  filters: UseAdminFiltersReturn;
  className?: string;
}

export function FilterPresets({ pageKey, filters, className = '' }: FilterPresetsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { presets: allPresets, addPreset, deletePreset, setDefault, renamePreset, duplicatePreset } =
    useFilterPresetsStore();
  const presets = allPresets[pageKey] || [];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  // Apply default preset on mount
  useEffect(() => {
    const defaultPreset = presets.find((p) => p.isDefault);
    if (defaultPreset) {
      applyPreset(defaultPreset);
    }
  }, []); // Only on mount

  const applyPreset = (preset: FilterPreset) => {
    filters.applyPreset({
      filters: preset.filters,
      sort: preset.sort as { key: string; direction: SortDirection } | undefined,
    });
    setIsOpen(false);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;

    addPreset(pageKey, {
      name: newPresetName.trim(),
      filters: filters.filters,
      sort: filters.sortKey
        ? { key: filters.sortKey, direction: filters.sortDirection }
        : undefined,
    });

    setNewPresetName('');
    setIsCreating(false);
  };

  const handleRename = (id: string) => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    renamePreset(pageKey, id, editingName.trim());
    setEditingId(null);
  };

  const handleToggleDefault = (id: string, isCurrentlyDefault: boolean) => {
    setDefault(pageKey, isCurrentlyDefault ? null : id);
  };

  const activeFilterCount = Object.values(filters.filters).filter((v) => v.length > 0).length;
  const hasActiveFilters = activeFilterCount > 0 || filters.search || filters.sortKey;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
          hasActiveFilters
            ? 'bg-accent/10 border-accent text-accent'
            : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
        }`}
      >
        <BookmarkIcon className="w-4 h-4" />
        <span>Presets</span>
        {presets.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-surface-hover rounded-full">
            {presets.length}
          </span>
        )}
        <ChevronIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Save current filters */}
          <div className="p-3 border-b border-border">
            {isCreating ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSavePreset();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="Preset name..."
                  className="flex-1 px-2 py-1 text-sm bg-surface-hover border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                  className="p-1 text-accent hover:bg-accent/10 rounded disabled:opacity-50"
                >
                  <CheckIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewPresetName('');
                  }}
                  className="p-1 text-text-muted hover:bg-surface-hover rounded"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                disabled={!hasActiveFilters}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlusIcon className="w-4 h-4" />
                Save current filters as preset
              </button>
            )}
          </div>

          {/* Preset list */}
          <div className="max-h-64 overflow-y-auto">
            {presets.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-muted">
                No saved presets
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="group flex items-center gap-2 px-3 py-2 hover:bg-surface-hover"
                >
                  {editingId === preset.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(preset.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => handleRename(preset.id)}
                        autoFocus
                        className="flex-1 px-2 py-0.5 text-sm bg-surface-hover border border-border rounded text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => applyPreset(preset)}
                        className="flex-1 flex items-center gap-2 text-left"
                      >
                        <span className="text-sm text-text-primary truncate">{preset.name}</span>
                        {preset.isDefault && (
                          <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                            default
                          </span>
                        )}
                      </button>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleDefault(preset.id, preset.isDefault || false);
                          }}
                          className="p-1 text-text-muted hover:text-accent hover:bg-accent/10 rounded transition-colors"
                          title={preset.isDefault ? 'Remove as default' : 'Set as default'}
                        >
                          <StarIcon
                            className={`w-3.5 h-3.5 ${preset.isDefault ? 'fill-accent text-accent' : ''}`}
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(preset.id);
                            setEditingName(preset.name);
                          }}
                          className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
                          title="Rename"
                        >
                          <EditIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicatePreset(pageKey, preset.id);
                          }}
                          className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
                          title="Duplicate"
                        >
                          <CopyIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePreset(pageKey, preset.id);
                          }}
                          className="p-1 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <div className="px-3 py-2 border-t border-border">
              <button
                onClick={() => {
                  filters.clearAll();
                  setIsOpen(false);
                }}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Icons
function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
