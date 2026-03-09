// @ts-nocheck
'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/admin/ui';

interface Scope {
  scope: string;
  label: string;
  description: string;
  category: string;
}

interface TokenPermissionsEditorProps {
  availableScopes: Scope[];
  selectedScopes: string[];
  onChange: (scopes: string[]) => void;
  disabled?: boolean;
}

export function TokenPermissionsEditor({
  availableScopes,
  selectedScopes,
  onChange,
  disabled = false,
}: TokenPermissionsEditorProps) {
  const groupedScopes = useMemo(() => {
    const groups: Record<string, Scope[]> = {};
    for (const scope of availableScopes) {
      if (!groups[scope.category]) {
        groups[scope.category] = [];
      }
      groups[scope.category].push(scope);
    }
    return groups;
  }, [availableScopes]);

  const toggleScope = (scope: string) => {
    if (disabled) return;
    if (selectedScopes.includes(scope)) {
      onChange(selectedScopes.filter(s => s !== scope));
    } else {
      onChange([...selectedScopes, scope]);
    }
  };

  const toggleCategory = (category: string) => {
    if (disabled) return;
    const categoryScopes = groupedScopes[category].map(s => s.scope);
    const allSelected = categoryScopes.every(s => selectedScopes.includes(s));

    if (allSelected) {
      onChange(selectedScopes.filter(s => !categoryScopes.includes(s)));
    } else {
      const newScopes = new Set([...selectedScopes, ...categoryScopes]);
      onChange(Array.from(newScopes));
    }
  };

  const selectAll = () => {
    if (disabled) return;
    onChange(availableScopes.map(s => s.scope));
  };

  const selectNone = () => {
    if (disabled) return;
    onChange([]);
  };

  const getCategoryPermissionType = (scopes: string[]) => {
    const hasRead = scopes.some(s => s.startsWith('read:'));
    const hasWrite = scopes.some(s => s.startsWith('write:'));
    const hasDelete = scopes.some(s => s.startsWith('delete:'));
    const hasAdmin = scopes.some(s => s.startsWith('admin:'));

    if (hasAdmin) return 'full';
    if (hasDelete) return 'destructive';
    if (hasWrite) return 'write';
    if (hasRead) return 'read';
    return 'custom';
  };

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">
            {selectedScopes.length} of {availableScopes.length} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled}
            className="text-sm text-accent hover:underline disabled:opacity-50"
          >
            Select All
          </button>
          <span className="text-text-muted">|</span>
          <button
            type="button"
            onClick={selectNone}
            disabled={disabled}
            className="text-sm text-accent hover:underline disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Permission Groups */}
      <div className="space-y-3">
        {Object.entries(groupedScopes).map(([category, scopes]) => {
          const categoryScopes = scopes.map(s => s.scope);
          const selectedInCategory = selectedScopes.filter(s => categoryScopes.includes(s));
          const allSelected = selectedInCategory.length === categoryScopes.length;
          const someSelected = selectedInCategory.length > 0 && !allSelected;

          return (
            <div key={category} className="p-4 bg-surface border border-border rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    disabled={disabled}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      allSelected
                        ? 'bg-accent border-accent'
                        : someSelected
                        ? 'bg-accent/50 border-accent'
                        : 'border-border hover:border-accent/50'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {(allSelected || someSelected) && (
                      <svg className="w-3 h-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {allSelected ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                        )}
                      </svg>
                    )}
                  </button>
                  <h4 className="font-medium text-text-primary">{category}</h4>
                </div>
                <Badge variant={
                  getCategoryPermissionType(selectedInCategory) === 'full' ? 'danger' :
                  getCategoryPermissionType(selectedInCategory) === 'destructive' ? 'warning' :
                  getCategoryPermissionType(selectedInCategory) === 'write' ? 'info' :
                  'default'
                } size="sm">
                  {selectedInCategory.length}/{scopes.length}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {scopes.map((scope) => {
                  const isSelected = selectedScopes.includes(scope.scope);
                  const isWrite = scope.scope.startsWith('write:') || scope.scope.startsWith('admin:');
                  const isDelete = scope.scope.startsWith('delete:');

                  return (
                    <button
                      key={scope.scope}
                      type="button"
                      onClick={() => toggleScope(scope.scope)}
                      disabled={disabled}
                      className={`p-3 rounded-lg text-left transition-all ${
                        isSelected
                          ? 'bg-accent/10 border border-accent'
                          : 'bg-surface-hover border border-transparent hover:border-border'
                      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-accent border-accent' : 'border-border'
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                              {scope.label}
                            </span>
                            {(isWrite || isDelete) && (
                              <Badge variant={isDelete ? 'danger' : 'warning'} size="sm">
                                {isDelete ? 'Delete' : 'Write'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{scope.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Scopes Summary */}
      {selectedScopes.length > 0 && (
        <div className="p-4 bg-surface-hover rounded-lg">
          <p className="text-xs font-medium text-text-muted uppercase mb-2">Selected Permissions</p>
          <div className="flex flex-wrap gap-1">
            {selectedScopes.map((scope) => (
              <Badge key={scope} variant="default" size="sm">
                {scope}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TokenPermissionsEditor;
