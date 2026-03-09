'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface CreateGroupModalProps {
  domainId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'content.view', label: 'View Content', description: 'View all domain content' },
  { id: 'content.create', label: 'Create Content', description: 'Create new content' },
  { id: 'content.edit', label: 'Edit Content', description: 'Edit existing content' },
  { id: 'content.delete', label: 'Delete Content', description: 'Delete content' },
  { id: 'content.moderate', label: 'Moderate Content', description: 'Approve/reject content' },
  { id: 'users.view', label: 'View Users', description: 'View user list and profiles' },
  { id: 'users.manage', label: 'Manage Users', description: 'Add/remove users from domain' },
  { id: 'reports.view', label: 'View Reports', description: 'View content reports' },
  { id: 'reports.action', label: 'Action Reports', description: 'Take action on reports' },
  { id: 'settings.view', label: 'View Settings', description: 'View domain settings' },
  { id: 'settings.edit', label: 'Edit Settings', description: 'Modify domain settings' },
];

export function CreateGroupModal({ domainId, isOpen, onClose, onSuccess }: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      api.adminDomainsGroupsCreate({
        domainId,
        name,
        description: description || undefined,
        permissions: selectedPermissions,
        isDefault,
      }),
    onSuccess: () => {
      toast.success('Group created successfully');
      onSuccess();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create group');
    },
  });

  const handleClose = useCallback(() => {
    setName('');
    setDescription('');
    setSelectedPermissions([]);
    setIsDefault(false);
    onClose();
  }, [onClose]);

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((p) => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }
    createMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Create Group</h2>
          <p className="text-sm text-text-muted mt-1">Create a new group with specific permissions</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Group Name */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Content Reviewers"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this group's purpose..."
              rows={2}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {/* Default Group Toggle */}
          <div className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg">
            <div>
              <p className="font-medium text-text-primary">Default Group</p>
              <p className="text-sm text-text-muted">New users will automatically join this group</p>
            </div>
            <button
              type="button"
              onClick={() => setIsDefault(!isDefault)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isDefault ? 'bg-accent' : 'bg-surface-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isDefault ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Permissions
            </label>
            <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
              {AVAILABLE_PERMISSIONS.map((permission) => (
                <label
                  key={permission.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission.id)}
                    onChange={() => togglePermission(permission.id)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary text-sm">{permission.label}</p>
                    <p className="text-xs text-text-muted">{permission.description}</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {selectedPermissions.length} permission{selectedPermissions.length !== 1 ? 's' : ''} selected
            </p>
          </div>
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
            disabled={!name.trim() || createMutation.isPending}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
