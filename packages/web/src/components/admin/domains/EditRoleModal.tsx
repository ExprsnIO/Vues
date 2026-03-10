'use client';

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface EditRoleModalProps {
  roleId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditRoleModal({ roleId, isOpen, onClose, onSuccess }: EditRoleModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('50');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Fetch role details
  const { data: role, isLoading: isLoadingRole } = useQuery({
    queryKey: ['admin', 'domain', 'role', roleId],
    queryFn: () => api.adminDomainRolesGet(roleId),
    enabled: isOpen && !!roleId,
  });

  // Fetch permission catalog
  const { data: catalog } = useQuery({
    queryKey: ['admin', 'domain', 'permissions', 'catalog'],
    queryFn: () => api.adminDomainPermissionsCatalog(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Initialize form with role data
  useEffect(() => {
    if (role) {
      setDisplayName(role.displayName);
      setDescription(role.description || '');
      setPriority(role.priority.toString());
      setSelectedPermissions(role.permissions);
    }
  }, [role]);

  // Auto-expand all categories on mount
  useEffect(() => {
    if (catalog?.categories) {
      setExpandedCategories(new Set(catalog.categories.map(c => c.id)));
    }
  }, [catalog]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.adminDomainRolesUpdate(roleId, {
        displayName,
        description: description || undefined,
        priority: parseInt(priority, 10),
        permissions: selectedPermissions,
      }),
    onSuccess: () => {
      toast.success('Role updated successfully');
      onSuccess();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update role');
    },
  });

  const handleClose = useCallback(() => {
    setSearchTerm('');
    onClose();
  }, [onClose]);

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((p) => p !== permissionId)
        : [...prev, permissionId]
    );
  };

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

  const selectAllInCategory = (categoryPermissions: string[]) => {
    const allSelected = categoryPermissions.every((p) => selectedPermissions.includes(p));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((p) => !categoryPermissions.includes(p)));
    } else {
      setSelectedPermissions((prev) => [...new Set([...prev, ...categoryPermissions])]);
    }
  };

  const handleSubmit = () => {
    if (!displayName.trim()) {
      toast.error('Display name is required');
      return;
    }
    updateMutation.mutate();
  };

  if (!isOpen) return null;

  // Filter permissions based on search
  const filteredCategories = catalog?.categories.map((category) => ({
    ...category,
    permissions: category.permissions.filter(
      (p) =>
        !searchTerm ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter((category) => category.permissions.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Edit Role</h2>
              <p className="text-sm text-text-muted mt-1">
                {role?.isSystem ? (
                  <span className="text-amber-500">System role - limited editing</span>
                ) : (
                  'Update role details and permissions'
                )}
              </p>
            </div>
            {role?.isSystem && (
              <span className="px-2 py-1 text-xs bg-accent/10 text-accent rounded">
                System
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {isLoadingRole ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : (
            <>
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                {/* Role Name (read-only) */}
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Role Name
                  </label>
                  <input
                    type="text"
                    value={role?.name || ''}
                    disabled
                    className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-text-muted mt-1">Cannot be changed</p>
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={role?.isSystem}
                    placeholder="e.g., Content Moderator"
                    className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-surface-hover disabled:cursor-not-allowed"
                    autoFocus
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={role?.isSystem}
                  placeholder="Brief description of this role's purpose..."
                  rows={2}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:bg-surface-hover disabled:cursor-not-allowed"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">
                  Priority
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={role?.isSystem}
                  min="1"
                  max="100"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-surface-hover disabled:cursor-not-allowed"
                />
                <p className="text-xs text-text-muted mt-1">Higher priority roles take precedence (1-100)</p>
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-text-muted">
                    Permissions
                  </label>
                  <span className="text-xs text-text-muted">
                    {selectedPermissions.length} selected
                  </span>
                </div>

                {/* Search */}
                <input
                  type="search"
                  placeholder="Search permissions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 mb-3 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />

                {/* Permission Categories */}
                <div className="border border-border rounded-lg divide-y divide-border max-h-96 overflow-y-auto">
                  {filteredCategories?.map((category) => {
                    const isExpanded = expandedCategories.has(category.id);
                    const categoryPermissionIds = category.permissions.map((p) => p.id);
                    const allSelected = categoryPermissionIds.every((p) => selectedPermissions.includes(p));
                    const someSelected = categoryPermissionIds.some((p) => selectedPermissions.includes(p)) && !allSelected;

                    return (
                      <div key={category.id}>
                        {/* Category Header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-surface-hover">
                          <button
                            onClick={() => toggleCategory(category.id)}
                            className="text-text-secondary hover:text-text-primary"
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(input) => {
                              if (input) input.indeterminate = someSelected;
                            }}
                            onChange={() => selectAllInCategory(categoryPermissionIds)}
                            disabled={role?.isSystem}
                            className="w-4 h-4 rounded border-border text-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <button
                            onClick={() => toggleCategory(category.id)}
                            className="flex-1 text-left font-medium text-text-primary text-sm"
                          >
                            {category.name}
                            <span className="ml-2 text-xs text-text-muted">
                              ({category.permissions.length})
                            </span>
                          </button>
                        </div>

                        {/* Category Permissions */}
                        {isExpanded && (
                          <div className="divide-y divide-border">
                            {category.permissions.map((permission) => (
                              <label
                                key={permission.id}
                                className={`flex items-center gap-3 px-4 py-3 pl-12 ${role?.isSystem ? 'cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPermissions.includes(permission.id)}
                                  onChange={() => togglePermission(permission.id)}
                                  disabled={role?.isSystem}
                                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-text-primary text-sm">{permission.name}</p>
                                  <p className="text-xs text-text-muted">{permission.description}</p>
                                  <p className="text-xs text-text-muted/60 font-mono mt-0.5">{permission.id}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {!filteredCategories?.length && (
                    <div className="px-4 py-8 text-center text-text-muted">
                      {searchTerm ? 'No permissions found' : 'Loading permissions...'}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!displayName.trim() || updateMutation.isPending || isLoadingRole || role?.isSystem}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? 'Updating...' : 'Update Role'}
          </button>
        </div>
      </div>
    </div>
  );
}
