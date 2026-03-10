'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/admin/ui/DataTable';
import { CreateRoleModal } from '@/components/admin/domains/CreateRoleModal';
import { EditRoleModal } from '@/components/admin/domains/EditRoleModal';
import toast from 'react-hot-toast';

interface DomainRole {
  id: string;
  domainId: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  priority: number;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export default function DomainRolesPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch roles
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.adminDomainRolesList(domainId, { includeSystem: true }),
  });

  const roles = data?.roles || [];

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => api.adminDomainRolesDelete(roleId),
    onSuccess: () => {
      toast.success('Role deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setDeletingRoleId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete role');
      setDeletingRoleId(null);
    },
  });

  const handleDelete = (roleId: string, roleName: string) => {
    if (confirm(`Are you sure you want to delete the role "${roleName}"? This action cannot be undone.`)) {
      setDeletingRoleId(roleId);
      deleteMutation.mutate(roleId);
    }
  };

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
  };

  const handleEditSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
  };

  const filteredRoles = roles.filter((role) =>
    search ?
      role.name.toLowerCase().includes(search.toLowerCase()) ||
      role.displayName.toLowerCase().includes(search.toLowerCase()) ||
      role.description?.toLowerCase().includes(search.toLowerCase())
    : true
  );

  const columns = [
    {
      key: 'name',
      header: 'Role Name',
      render: (role: DomainRole) => (
        <div className="flex items-center gap-2">
          <div>
            <div className="font-medium text-text-primary">{role.displayName}</div>
            <div className="text-xs text-text-muted font-mono">{role.name}</div>
          </div>
          {role.isSystem && (
            <span className="px-1.5 py-0.5 text-xs bg-accent/10 text-accent rounded">
              System
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (role: DomainRole) => (
        <span className="text-text-secondary text-sm">
          {role.description || <span className="text-text-muted italic">No description</span>}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (role: DomainRole) => (
        <span className="text-text-secondary font-mono">{role.priority}</span>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (role: DomainRole) => (
        <div className="flex flex-wrap gap-1">
          {role.permissions.length === 0 ? (
            <span className="text-xs text-text-muted italic">No permissions</span>
          ) : (
            <>
              {role.permissions.slice(0, 2).map((perm) => (
                <span
                  key={perm}
                  className="px-1.5 py-0.5 text-xs bg-surface-hover text-text-muted rounded font-mono"
                  title={perm}
                >
                  {perm.split('.').pop()}
                </span>
              ))}
              {role.permissions.length > 2 && (
                <span
                  className="px-1.5 py-0.5 text-xs bg-surface-hover text-text-muted rounded"
                  title={role.permissions.join(', ')}
                >
                  +{role.permissions.length - 2} more
                </span>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (role: DomainRole) => (
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setEditingRoleId(role.id)}
            className="px-3 py-1 text-sm text-accent hover:text-accent-hover"
          >
            {role.isSystem ? 'View' : 'Edit'}
          </button>
          {!role.isSystem && (
            <button
              onClick={() => handleDelete(role.id, role.displayName)}
              disabled={deletingRoleId === role.id}
              className="px-3 py-1 text-sm text-red-500 hover:text-red-400 disabled:opacity-50"
            >
              {deletingRoleId === role.id ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      ),
    },
  ];

  // Calculate stats
  const stats = {
    total: roles.length,
    system: roles.filter((r) => r.isSystem).length,
    custom: roles.filter((r) => !r.isSystem).length,
    totalPermissions: roles.reduce((sum, r) => sum + r.permissions.length, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Roles</h1>
          <p className="text-text-muted mt-1">
            Manage roles and permissions for this domain
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
        >
          Create Role
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Roles</p>
          <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">System Roles</p>
          <p className="text-2xl font-bold text-accent">{stats.system}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Custom Roles</p>
          <p className="text-2xl font-bold text-text-primary">{stats.custom}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Permissions</p>
          <p className="text-2xl font-bold text-text-primary">{stats.totalPermissions}</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-500 text-sm">
            Failed to load roles: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-4">
        <input
          type="search"
          placeholder="Search roles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Table */}
      <DataTable
        data={filteredRoles}
        columns={columns}
        keyExtractor={(role) => role.id}
        isLoading={isLoading}
        emptyMessage="No roles found"
      />

      {/* Modals */}
      <CreateRoleModal
        domainId={domainId}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      {editingRoleId && (
        <EditRoleModal
          roleId={editingRoleId}
          isOpen={!!editingRoleId}
          onClose={() => setEditingRoleId(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
