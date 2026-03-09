'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

export interface Permission {
  id: string;
  name: string;
  description?: string;
  category: string;
}

export interface PermissionCategory {
  id: string;
  name: string;
  description?: string;
}

interface ScopeSelectorProps {
  permissions: Permission[];
  categories: PermissionCategory[];
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ScopeSelector({
  permissions,
  categories,
  selectedPermissions,
  onChange,
  disabled = false,
  placeholder = 'Select permissions...',
}: ScopeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(categories.map(c => c.id)));
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Group permissions by category
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    permissions.forEach((perm) => {
      if (!groups[perm.category]) {
        groups[perm.category] = [];
      }
      groups[perm.category].push(perm);
    });
    return groups;
  }, [permissions]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!search) return groupedPermissions;

    const searchLower = search.toLowerCase();
    const filtered: Record<string, Permission[]> = {};

    Object.entries(groupedPermissions).forEach(([category, perms]) => {
      const matchedPerms = perms.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.id.toLowerCase().includes(searchLower)
      );
      if (matchedPerms.length > 0) {
        filtered[category] = matchedPerms;
      }
    });

    return filtered;
  }, [groupedPermissions, search]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const togglePermission = (permId: string) => {
    if (selectedPermissions.includes(permId)) {
      onChange(selectedPermissions.filter((p) => p !== permId));
    } else {
      onChange([...selectedPermissions, permId]);
    }
  };

  const selectAllInCategory = (categoryId: string) => {
    const categoryPerms = groupedPermissions[categoryId]?.map((p) => p.id) || [];
    const allSelected = categoryPerms.every((p) => selectedPermissions.includes(p));

    if (allSelected) {
      onChange(selectedPermissions.filter((p) => !categoryPerms.includes(p)));
    } else {
      const newPerms = new Set([...selectedPermissions, ...categoryPerms]);
      onChange(Array.from(newPerms));
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-surface border border-border rounded-lg transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-border-hover'
        } ${isOpen ? 'border-accent ring-2 ring-accent/50' : ''}`}
      >
        <span className={selectedPermissions.length > 0 ? 'text-text-primary' : 'text-text-muted'}>
          {selectedPermissions.length > 0
            ? `${selectedPermissions.length} permission${selectedPermissions.length > 1 ? 's' : ''} selected`
            : placeholder}
        </span>
        <ChevronIcon className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search permissions..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-surface-hover border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Permission list */}
          <div className="flex-1 overflow-y-auto">
            {Object.keys(filteredGroups).length === 0 ? (
              <div className="p-4 text-center text-sm text-text-muted">
                No permissions found
              </div>
            ) : (
              categories
                .filter((cat) => filteredGroups[cat.id])
                .map((category) => {
                  const categoryPerms = filteredGroups[category.id];
                  const isExpanded = expandedCategories.has(category.id);
                  const allSelected = categoryPerms.every((p) => selectedPermissions.includes(p.id));
                  const someSelected = categoryPerms.some((p) => selectedPermissions.includes(p.id)) && !allSelected;

                  return (
                    <div key={category.id} className="border-b border-border last:border-0">
                      {/* Category header */}
                      <div
                        className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover cursor-pointer"
                        onClick={() => toggleCategory(category.id)}
                      >
                        <ChevronIcon
                          className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={(e) => {
                            e.stopPropagation();
                            selectAllInCategory(category.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                        />
                        <span className="flex-1 font-medium text-sm text-text-primary">{category.name}</span>
                        <span className="text-xs text-text-muted">
                          {categoryPerms.filter((p) => selectedPermissions.includes(p.id)).length}/{categoryPerms.length}
                        </span>
                      </div>

                      {/* Permissions */}
                      {isExpanded && (
                        <div className="pl-8 pr-3 pb-2 space-y-1">
                          {categoryPerms.map((perm) => {
                            const isSelected = selectedPermissions.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                  isSelected ? 'bg-accent/5' : 'hover:bg-surface-hover'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePermission(perm.id)}
                                  className="w-4 h-4 mt-0.5 rounded border-border text-accent focus:ring-accent"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-text-primary">{perm.name}</p>
                                  {perm.description && (
                                    <p className="text-xs text-text-muted truncate">{perm.description}</p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>

          {/* Footer */}
          {selectedPermissions.length > 0 && (
            <div className="p-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-text-muted">{selectedPermissions.length} selected</span>
              <button
                onClick={clearAll}
                className="text-xs text-accent hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Display chips for selected permissions
interface ScopeChipsProps {
  permissions: Permission[];
  selectedPermissions: string[];
  onRemove?: (permId: string) => void;
  maxDisplay?: number;
}

export function ScopeChips({
  permissions,
  selectedPermissions,
  onRemove,
  maxDisplay = 5,
}: ScopeChipsProps) {
  const selectedPerms = permissions.filter((p) => selectedPermissions.includes(p.id));
  const displayPerms = selectedPerms.slice(0, maxDisplay);
  const overflow = selectedPerms.length - maxDisplay;

  if (selectedPerms.length === 0) {
    return <span className="text-sm text-text-muted">No permissions</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayPerms.map((perm) => (
        <span
          key={perm.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full"
        >
          {perm.name}
          {onRemove && (
            <button
              onClick={() => onRemove(perm.id)}
              className="p-0.5 hover:bg-accent/20 rounded-full"
            >
              <CloseIcon className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded-full">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
