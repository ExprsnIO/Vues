'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/admin/ui/DataTable';

interface DomainRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  isSystem: boolean;
  createdAt: string;
}

export default function DomainRolesPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery<DomainRole[]>({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: async () => {
      // TODO: Replace with actual API call
      return [
        {
          id: '1',
          name: 'Admin',
          description: 'Full administrative access to the domain',
          permissions: ['*'],
          userCount: 3,
          isSystem: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Moderator',
          description: 'Can moderate content and manage reports',
          permissions: ['content:read', 'content:moderate', 'reports:manage'],
          userCount: 12,
          isSystem: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'Content Creator',
          description: 'Can create and manage own content',
          permissions: ['content:create', 'content:edit_own', 'content:delete_own'],
          userCount: 156,
          isSystem: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: '4',
          name: 'Viewer',
          description: 'Basic viewing permissions',
          permissions: ['content:read'],
          userCount: 1250,
          isSystem: true,
          createdAt: new Date().toISOString(),
        },
      ];
    },
  });

  const filteredRoles = roles.filter((role) =>
    search ? role.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  const columns = [
    {
      key: 'name',
      header: 'Role Name',
      render: (role: DomainRole) => (
        <div className="flex items-center gap-2">
          <div className="font-medium text-text-primary">{role.name}</div>
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
        <span className="text-text-secondary text-sm">{role.description}</span>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (role: DomainRole) => (
        <div className="flex flex-wrap gap-1">
          {role.permissions.slice(0, 3).map((perm) => (
            <span
              key={perm}
              className="px-1.5 py-0.5 text-xs bg-surface-hover text-text-muted rounded"
            >
              {perm}
            </span>
          ))}
          {role.permissions.length > 3 && (
            <span className="px-1.5 py-0.5 text-xs bg-surface-hover text-text-muted rounded">
              +{role.permissions.length - 3} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'userCount',
      header: 'Users',
      render: (role: DomainRole) => (
        <span className="text-text-secondary">{role.userCount}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (role: DomainRole) => (
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm text-accent hover:text-accent-hover">
            Edit
          </button>
          {!role.isSystem && (
            <button className="px-3 py-1 text-sm text-red-500 hover:text-red-400">
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

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
          <p className="text-2xl font-bold text-text-primary">{roles.length}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">System Roles</p>
          <p className="text-2xl font-bold text-accent">
            {roles.filter((r) => r.isSystem).length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Custom Roles</p>
          <p className="text-2xl font-bold text-text-primary">
            {roles.filter((r) => !r.isSystem).length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Assigned</p>
          <p className="text-2xl font-bold text-text-primary">
            {roles.reduce((sum, r) => sum + r.userCount, 0)}
          </p>
        </div>
      </div>

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
    </div>
  );
}
