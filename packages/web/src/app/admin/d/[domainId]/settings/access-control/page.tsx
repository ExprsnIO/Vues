'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  Badge,
  SearchInput,
  Modal,
  ConfirmDialog,
  FormField,
  Input,
  Toggle,
  PageSkeleton,
} from '@/components/admin/ui';

interface Role {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
  createdAt: string;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

const AVAILABLE_PERMISSIONS: Permission[] = [
  { id: 'users.view', name: 'View Users', description: 'View user profiles and lists', category: 'Users' },
  { id: 'users.manage', name: 'Manage Users', description: 'Create, edit, and delete users', category: 'Users' },
  { id: 'users.ban', name: 'Ban Users', description: 'Ban and suspend users', category: 'Users' },
  { id: 'content.view', name: 'View Content', description: 'View all content', category: 'Content' },
  { id: 'content.moderate', name: 'Moderate Content', description: 'Remove and flag content', category: 'Content' },
  { id: 'content.delete', name: 'Delete Content', description: 'Permanently delete content', category: 'Content' },
  { id: 'reports.view', name: 'View Reports', description: 'View user reports', category: 'Moderation' },
  { id: 'reports.manage', name: 'Manage Reports', description: 'Process and resolve reports', category: 'Moderation' },
  { id: 'settings.view', name: 'View Settings', description: 'View domain settings', category: 'Settings' },
  { id: 'settings.manage', name: 'Manage Settings', description: 'Modify domain settings', category: 'Settings' },
  { id: 'analytics.view', name: 'View Analytics', description: 'Access analytics data', category: 'Analytics' },
  { id: 'billing.view', name: 'View Billing', description: 'View payment information', category: 'Billing' },
  { id: 'billing.manage', name: 'Manage Billing', description: 'Modify billing settings', category: 'Billing' },
  { id: 'api.manage', name: 'Manage API', description: 'Create and manage API tokens', category: 'API' },
  { id: 'admin.full', name: 'Full Admin', description: 'Full administrative access', category: 'Admin' },
];

export default function AccessControlPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  });

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.adminDomainRolesList(domainId),
    enabled: !!domainId,
  });

  const { data: permissionCatalogData } = useQuery({
    queryKey: ['admin', 'domain', 'permission-catalog'],
    queryFn: () => api.adminDomainPermissionCatalog(),
    enabled: !!domainId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainRolesCreate(domainId, data),
    onSuccess: () => {
      toast.success('Role created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setShowCreateModal(false);
      setNewRole({ name: '', description: '', permissions: [] });
    },
    onError: () => {
      toast.error('Failed to create role');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & any) => api.adminDomainRolesUpdate(domainId, id, data),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setEditingRole(null);
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainRolesDelete(domainId, id),
    onSuccess: () => {
      toast.success('Role deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error('Failed to delete role');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  let roles: Role[] = data?.roles || [];

  if (search) {
    roles = roles.filter(r =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
    );
  }

  const togglePermission = (permissions: string[], permission: string, setter: (p: string[]) => void) => {
    if (permissions.includes(permission)) {
      setter(permissions.filter(p => p !== permission));
    } else {
      setter([...permissions, permission]);
    }
  };

  const permissionOptions = permissionCatalogData?.permissions?.map((permission) => ({
    id: permission.id,
    name: permission.label,
    description: permission.description,
    category: permission.category,
  })) || AVAILABLE_PERMISSIONS;

  const groupedPermissions = permissionOptions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const RoleForm = ({
    role,
    permissions,
    onPermissionsChange,
    onSubmit,
    onCancel,
    isSubmitting,
    submitLabel,
  }: {
    role: { name: string; description: string };
    permissions: string[];
    onPermissionsChange: (p: string[]) => void;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    submitLabel: string;
  }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormField label="Role Name" required>
        <Input
          value={role.name}
          onChange={(e) => editingRole
            ? setEditingRole({ ...editingRole, name: e.target.value })
            : setNewRole({ ...newRole, name: e.target.value })}
          placeholder="e.g., Moderator"
          disabled={editingRole?.isSystem}
        />
      </FormField>

      <FormField label="Description">
        <textarea
          value={role.description}
          onChange={(e) => editingRole
            ? setEditingRole({ ...editingRole, description: e.target.value })
            : setNewRole({ ...newRole, description: e.target.value })}
          placeholder="Describe this role..."
          rows={2}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>

      <div className="space-y-3">
        <p className="text-sm font-medium text-text-primary">Permissions</p>
        {Object.entries(groupedPermissions).map(([category, perms]) => (
          <div key={category} className="p-3 bg-surface-hover rounded-lg">
            <p className="text-xs font-medium text-text-muted uppercase mb-2">{category}</p>
            <div className="space-y-2">
              {perms.map((perm) => (
                <label
                  key={perm.id}
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm.id)}
                    onChange={() => togglePermission(permissions, perm.id, onPermissionsChange)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm text-text-primary">{perm.name}</p>
                    <p className="text-xs text-text-muted">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!role.name || isSubmitting}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access Control"
        description={`Manage roles and permissions for ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Create Role
          </button>
        }
      />

      {/* Search */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search roles..."
          className="w-64"
        />
      </div>

      {/* Roles Grid */}
      {roles.length === 0 ? (
        <div className="p-12 bg-surface border border-border rounded-xl text-center">
          <h4 className="text-lg font-medium text-text-primary mb-2">
            {search ? 'No roles match your search' : 'No custom roles'}
          </h4>
          <p className="text-sm text-text-muted mb-4">
            {search ? 'Try a different search term' : 'Create custom roles to define permissions'}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Create First Role
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {roles.map((role) => (
            <div
              key={role.id}
              className="p-5 bg-surface border border-border rounded-xl"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-text-primary">{role.displayName || role.name}</h4>
                    {role.isSystem && (
                      <Badge variant="info" size="sm">System</Badge>
                    )}
                  </div>
                  <p className="text-sm text-text-muted mt-1">{role.description}</p>
                </div>
                {!role.isSystem && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingRole(role)}
                      className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(role)}
                      className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-text-muted mb-3">
                <span>{role.permissions.length} permissions</span>
                <span>{role.userCount} users</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 5).map((perm) => (
                  <Badge key={perm} variant="default" size="sm">{perm}</Badge>
                ))}
                {role.permissions.length > 5 && (
                  <Badge variant="default" size="sm">+{role.permissions.length - 5}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Role"
        size="lg"
      >
        <RoleForm
          role={newRole}
          permissions={newRole.permissions}
          onPermissionsChange={(p) => setNewRole({ ...newRole, permissions: p })}
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(newRole);
          }}
          onCancel={() => setShowCreateModal(false)}
          isSubmitting={createMutation.isPending}
          submitLabel="Create Role"
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingRole}
        onClose={() => setEditingRole(null)}
        title="Edit Role"
        size="lg"
      >
        {editingRole && (
          <RoleForm
            role={editingRole}
            permissions={editingRole.permissions}
            onPermissionsChange={(p) => setEditingRole({ ...editingRole, permissions: p })}
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({
                id: editingRole.id,
                name: editingRole.name,
                description: editingRole.description,
                permissions: editingRole.permissions,
              });
            }}
            onCancel={() => setEditingRole(null)}
            isSubmitting={updateMutation.isPending}
            submitLabel="Update Role"
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Role?"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Users with this role will lose their permissions.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
