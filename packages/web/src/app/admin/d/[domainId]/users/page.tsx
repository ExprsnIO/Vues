// @ts-nocheck
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { RowActionMenu } from '@/components/admin/ui/ActionMenu';
import { FilterBar } from '@/components/admin/ui/FilterBar';
import { useAdminFilters } from '@/hooks/useAdminFilters';
import { SuspendUserModal } from '@/components/admin/modals/SuspendUserModal';
import { BanUserModal } from '@/components/admin/modals/BanUserModal';
import toast from 'react-hot-toast';

type UserRole = 'admin' | 'moderator' | 'member';
type ModalType = 'suspend' | 'ban' | null;
type ModalUser = { did: string; handle: string; displayName?: string } | null;

interface DomainUser {
  id: string;
  userDid: string;
  role: string;
  createdAt: string;
  isActive?: boolean;
  status?: string;
  permissions?: string[];
  directPermissions?: string[];
  assignedRoles?: Array<{ id: string; name: string; displayName?: string }>;
  groups?: Array<{ id: string; name: string }>;
  effectivePermissions?: string[];
  source?: 'domain' | 'global_inherited';
  handle?: string;
  user?: {
    did?: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export default function DomainUsersPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();

  const filters = useAdminFilters({
    syncWithUrl: true,
  });

  const roleFilter = (filters.filters.role?.[0] || '') as UserRole | '';
  const includeInheritedAdmins = filters.filters.inherited?.[0] === 'true';

  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DomainUser | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'role' | 'remove' | null>(null);
  const [bulkRole, setBulkRole] = useState<UserRole>('member');
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalUser, setModalUser] = useState<ModalUser>(null);
  const queryClient = useQueryClient();

  // Sync URL param with context
  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  // Get domain info
  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  // Get domain users
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'users', { roleFilter, includeInheritedAdmins }],
    queryFn: () => api.adminDomainsUsersList(domainId, { includeInherited: includeInheritedAdmins }),
  });

  const { data: groupsData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'groups'],
    queryFn: () => api.adminDomainsGroupsList(domainId),
    enabled: !!domainId,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.adminDomainRolesList(domainId),
    enabled: !!domainId,
  });

  const { data: permissionCatalog } = useQuery({
    queryKey: ['admin', 'domain', 'permission-catalog'],
    queryFn: () => api.adminDomainPermissionCatalog(),
    enabled: !!domainId,
  });

  const removeMutation = useMutation({
    mutationFn: (userDid: string) => api.adminDomainsUsersRemove(domainId, userDid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('User removed from domain');
    },
    onError: () => toast.error('Failed to remove user'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: (data: { userDid: string; role: UserRole; roleIds?: string[]; groupIds?: string[]; directPermissions?: string[] }) =>
      api.adminDomainsUsersUpdateRole({ domainId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      setSelectedUser(null);
      toast.success('User role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  const bulkRemoveMutation = useMutation({
    mutationFn: async (userDids: string[]) => {
      const results = await Promise.allSettled(
        userDids.map(did => api.adminDomainsUsersRemove(domainId, did))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`Failed to remove ${failed} user(s)`);
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success(`Removed ${selectedUserIds.size} user(s) from domain`);
      setSelectedUserIds(new Set());
      setBulkAction(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkRoleUpdateMutation = useMutation({
    mutationFn: async (data: { userDids: string[]; role: UserRole }) => {
      const results = await Promise.allSettled(
        data.userDids.map(did => api.adminDomainsUsersUpdateRole({ domainId, userDid: did, role: data.role }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`Failed to update ${failed} user(s)`);
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success(`Updated role for ${selectedUserIds.size} user(s)`);
      setSelectedUserIds(new Set());
      setBulkAction(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unsuspendMutation = useMutation({
    mutationFn: (userDid: string) =>
      api.adminDomainUsersUnsuspend({ domainId, userDid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('User unsuspended');
    },
    onError: () => {
      toast.error('Failed to unsuspend user');
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (userDid: string) =>
      api.adminDomainUsersUnban({ domainId, userDid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('User unbanned');
    },
    onError: () => {
      toast.error('Failed to unban user');
    },
  });

  const openModal = (type: ModalType, user: DomainUser) => {
    setModalUser({
      did: user.userDid,
      handle: user.user?.handle || '',
      displayName: user.user?.displayName,
    });
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalUser(null);
  };

  const domain = domainData?.domain;
  const allUsers = usersData?.users || [];
  const groups = groupsData?.groups || [];
  const roles = rolesData?.roles || [];
  const permissions = permissionCatalog?.permissions || [];

  const users = useMemo(() => {
    return allUsers.filter((user) => {
      const matchesRole = !roleFilter || user.role === roleFilter;
      const matchesSearch = !filters.search ||
        user.user?.handle?.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.user?.displayName?.toLowerCase().includes(filters.search.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [allUsers, roleFilter, filters.search]);

  const stats = useMemo(() => ({
    total: allUsers.length,
    admins: allUsers.filter(u => u.role === 'admin').length,
    moderators: allUsers.filter(u => u.role === 'moderator').length,
    members: allUsers.filter(u => u.role === 'member').length,
  }), [allUsers]);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'moderator': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map(u => u.id)));
    }
  };

  const getSelectedUserDids = () => users.filter(u => selectedUserIds.has(u.id)).map(u => u.userDid);

  useEffect(() => {
    setSelectedUserIds(new Set());
  }, [roleFilter, filters.search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Users</h1>
          <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
          <p className="text-sm text-text-muted">Total Users</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">{stats.admins}</p>
          <p className="text-sm text-text-muted">Admins</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.moderators}</p>
          <p className="text-sm text-text-muted">Moderators</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{stats.members}</p>
          <p className="text-sm text-text-muted">Members</p>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedUserIds.size > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-accent font-medium">{selectedUserIds.size} user(s) selected</span>
            <button onClick={() => setSelectedUserIds(new Set())} className="text-text-muted hover:text-text-primary text-sm">
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkAction('role')} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm">
              Change Role
            </button>
            <button onClick={() => setBulkAction('remove')} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm">
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <FilterBar
        filters={filters}
        filterConfig={[
          {
            key: 'role',
            label: 'Role',
            multiple: false,
            options: [
              { value: 'admin', label: 'Admins' },
              { value: 'moderator', label: 'Moderators' },
              { value: 'member', label: 'Members' },
            ],
          },
          {
            key: 'inherited',
            label: 'Source',
            multiple: false,
            options: [
              { value: 'true', label: 'Include inherited' },
              { value: 'false', label: 'Domain only' },
            ],
          },
        ]}
        searchPlaceholder="Search by handle or name..."
        pageKey={`domain-${domainId}-users`}
      />

      {/* Users List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <UserIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">
            {allUsers.length === 0 ? 'No users in this domain' : 'No users match your search'}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.size === users.length && users.length > 0}
                    onChange={toggleAllSelection}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center overflow-hidden">
                        {user.user?.avatar ? (
                          <img src={user.user.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-text-muted text-lg">{user.user?.handle?.[0]?.toUpperCase() || '?'}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-text-primary font-medium">{user.user?.displayName || user.user?.handle || 'Unknown'}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-text-muted text-sm">@{user.user?.handle}</p>
                          {user.source === 'global_inherited' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              Global Admin
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-text-muted text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-sm ${user.isActive !== false ? 'text-green-400' : 'text-text-muted'}`}>
                      <span className={`w-2 h-2 rounded-full ${user.isActive !== false ? 'bg-green-400' : 'bg-gray-400'}`} />
                      {user.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelectedUser(user)} className="text-accent hover:text-accent-hover text-sm">
                        Edit Role
                      </button>
                      {user.source === 'global_inherited' ? (
                        <span className="text-text-muted text-sm">Managed globally</span>
                      ) : (
                        <>
                          <button
                            onClick={() => { if (confirm('Remove this user from the domain?')) removeMutation.mutate(user.userDid); }}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                          <RowActionMenu
                            items={[
                              ...(user.status === 'suspend'
                                ? [
                                    {
                                      label: 'Unsuspend',
                                      onClick: () => unsuspendMutation.mutate(user.userDid),
                                      icon: (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ),
                                    },
                                  ]
                                : [
                                    {
                                      label: 'Suspend',
                                      onClick: () => openModal('suspend', user),
                                      icon: (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                      ),
                                      variant: 'default' as const,
                                    },
                                  ]),
                              ...(user.status === 'ban'
                                ? [
                                    {
                                      label: 'Unban',
                                      onClick: () => unbanMutation.mutate(user.userDid),
                                      icon: (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ),
                                    },
                                  ]
                                : [
                                    {
                                      label: 'Ban',
                                      onClick: () => openModal('ban', user),
                                      icon: (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                      ),
                                      variant: 'danger' as const,
                                    },
                                  ]),
                            ]}
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Role Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedUser(null)} />
          <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-text-primary mb-4">Edit User Access</h2>
            <p className="text-text-muted mb-4">
              Change role for @{selectedUser.user?.handle}
            </p>
            {selectedUser.source === 'global_inherited' && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-text-muted">
                This administrator is inherited from the global admin team. Edit the global admin record to change access.
              </div>
            )}
            <select
              value={selectedUser.role}
              onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value })}
              disabled={selectedUser.source === 'global_inherited'}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary mb-4"
            >
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="member">Member</option>
            </select>
            <div className="space-y-4 mb-4">
              <div>
                <p className="text-sm text-text-muted mb-2">Role Bundles</p>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-lg border border-border p-3">
                  {roles.map((role) => {
                    const selectedRoleIds = new Set((selectedUser.assignedRoles || []).map((item) => item.id));
                    return (
                      <label key={role.id} className="flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.has(role.id)}
                          disabled={selectedUser.source === 'global_inherited'}
                          onChange={(e) => {
                            const nextIds = new Set((selectedUser.assignedRoles || []).map((item) => item.id));
                            if (e.target.checked) nextIds.add(role.id);
                            else nextIds.delete(role.id);
                            setSelectedUser({
                              ...selectedUser,
                              assignedRoles: roles.filter((item) => nextIds.has(item.id)).map((item) => ({
                                id: item.id,
                                name: item.name,
                                displayName: item.displayName,
                              })),
                            });
                          }}
                        />
                        <span>{role.displayName || role.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm text-text-muted mb-2">Groups</p>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-lg border border-border p-3">
                  {groups.map((group) => {
                    const selectedGroupIds = new Set((selectedUser.groups || []).map((item) => item.id));
                    return (
                      <label key={group.id} className="flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.has(group.id)}
                          disabled={selectedUser.source === 'global_inherited'}
                          onChange={(e) => {
                            const nextIds = new Set((selectedUser.groups || []).map((item) => item.id));
                            if (e.target.checked) nextIds.add(group.id);
                            else nextIds.delete(group.id);
                            setSelectedUser({
                              ...selectedUser,
                              groups: groups.filter((item) => nextIds.has(item.id)).map((item) => ({
                                id: item.id,
                                name: item.name,
                              })),
                            });
                          }}
                        />
                        <span>{group.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm text-text-muted mb-2">Direct Permissions</p>
                <textarea
                  value={(selectedUser.directPermissions || []).join('\n')}
                  onChange={(e) =>
                    setSelectedUser({
                      ...selectedUser,
                      directPermissions: e.target.value
                        .split(/\s|,|\n/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                  disabled={selectedUser.source === 'global_inherited'}
                  rows={6}
                  placeholder={permissions.slice(0, 6).map((permission) => permission.id).join('\n')}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
                <p className="mt-2 text-xs text-text-muted">
                  One permission ID per line. Available permissions: {permissions.length}.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedUser(null)} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => updateRoleMutation.mutate({
                  userDid: selectedUser.userDid,
                  role: selectedUser.role as UserRole,
                  roleIds: (selectedUser.assignedRoles || []).map((role) => role.id),
                  groupIds: (selectedUser.groups || []).map((group) => group.id),
                  directPermissions: selectedUser.directPermissions || [],
                })}
                disabled={updateRoleMutation.isPending || selectedUser.source === 'global_inherited'}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
              >
                {updateRoleMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Role Modal */}
      {bulkAction === 'role' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBulkAction(null)} />
          <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-text-primary mb-4">Change Role for {selectedUserIds.size} Users</h2>
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value as UserRole)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary mb-4"
            >
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="member">Member</option>
            </select>
            <div className="flex gap-3">
              <button onClick={() => setBulkAction(null)} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => bulkRoleUpdateMutation.mutate({ userDids: getSelectedUserDids(), role: bulkRole })}
                disabled={bulkRoleUpdateMutation.isPending}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
              >
                {bulkRoleUpdateMutation.isPending ? 'Updating...' : 'Update All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Remove Modal */}
      {bulkAction === 'remove' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBulkAction(null)} />
          <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-text-primary mb-4">Remove {selectedUserIds.size} Users</h2>
            <p className="text-text-muted mb-4">
              Are you sure you want to remove these users from the domain? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setBulkAction(null)} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => bulkRemoveMutation.mutate(getSelectedUserDids())}
                disabled={bulkRemoveMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50"
              >
                {bulkRemoveMutation.isPending ? 'Removing...' : 'Remove All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <AddUserModal domainId={domainId} onClose={() => setShowAddUser(false)} />
      )}

      {/* Moderation Modals */}
      {modalUser && (
        <>
          <SuspendUserModal
            isOpen={activeModal === 'suspend'}
            onClose={closeModal}
            user={modalUser}
            domainId={domainId}
          />
          <BanUserModal
            isOpen={activeModal === 'ban'}
            onClose={closeModal}
            user={modalUser}
            domainId={domainId}
          />
        </>
      )}
    </div>
  );
}

function AddUserModal({ domainId, onClose }: { domainId: string; onClose: () => void }) {
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: (data: { domainId: string; userHandle: string; role: string }) =>
      api.adminDomainsUsersAdd(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('User added to domain');
      onClose();
    },
    onError: () => toast.error('Failed to add user'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add User to Domain</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">User Handle</label>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="member">Member</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => addMutation.mutate({ domainId, userHandle: handle.replace('@', ''), role })}
            disabled={!handle || addMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {addMutation.isPending ? 'Adding...' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
