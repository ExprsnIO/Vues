'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface DomainGroup {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: string;
  permissions?: string[];
  directPermissions?: string[];
  assignedRoles?: Array<{ id: string; name: string; displayName?: string }>;
}

export default function DomainGroupsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DomainGroup | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'groups'],
    queryFn: () => api.adminDomainsGroupsList(domainId),
    enabled: !!domainId,
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'users', 'group-management'],
    queryFn: () => api.adminDomainsUsersList(domainId),
    enabled: !!domainId,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.adminDomainRolesList(domainId),
    enabled: !!domainId,
  });

  const deleteMutation = useMutation({
    mutationFn: (groupId: string) => api.adminDomainsGroupsDelete(groupId, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'groups'] });
      toast.success('Group deleted');
    },
    onError: () => toast.error('Failed to delete group'),
  });

  const domain = domainData?.domain;
  const groups = groupsData?.groups || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Groups</h1>
          <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Create Group
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <GroupIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No groups in this domain</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
          >
            Create First Group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div key={group.id} className="bg-surface border border-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <GroupIcon className="w-5 h-5 text-accent" />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedGroup(group)}
                    className="p-2 text-text-muted hover:text-text-primary rounded"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this group?')) deleteMutation.mutate(group.id);
                    }}
                    className="p-2 text-text-muted hover:text-red-400 rounded"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">{group.name}</h3>
              {group.description && (
                <p className="text-text-muted text-sm mt-1 line-clamp-2">{group.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4 text-text-muted">
                  <span>{group.memberCount} members</span>
                  <span>{new Date(group.createdAt).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedGroup(group);
                  }}
                  className="px-3 py-1 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
                >
                  Manage
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateGroupModal
          domainId={domainId}
          roles={rolesData?.roles || []}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {selectedGroup && (
        <EditGroupModal
          group={selectedGroup}
          domainId={domainId}
          roles={rolesData?.roles || []}
          users={usersData?.users || []}
          onClose={() => setSelectedGroup(null)}
        />
      )}
    </div>
  );
}

function CreateGroupModal({
  domainId,
  roles,
  onClose,
}: {
  domainId: string;
  roles: Array<{ id: string; name: string; displayName?: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [directPermissions, setDirectPermissions] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { domainId: string; name: string; description?: string; directPermissions?: string[]; roleIds?: string[] }) =>
      api.adminDomainsGroupsCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'groups'] });
      toast.success('Group created');
      onClose();
    },
    onError: () => toast.error('Failed to create group'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Create Group</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Role Bundles</label>
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto rounded-lg border border-border p-3">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(role.id)}
                    onChange={(e) => setSelectedRoleIds((current) =>
                      e.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id)
                    )}
                  />
                  <span>{role.displayName || role.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Direct Permissions</label>
            <textarea
              value={directPermissions}
              onChange={(e) => setDirectPermissions(e.target.value)}
              rows={4}
              placeholder="domain.users.manage"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate({
              domainId,
              name,
              description: description || undefined,
              roleIds: selectedRoleIds,
              directPermissions: directPermissions
                .split(/\s|,|\n/)
                .map((value) => value.trim())
                .filter(Boolean),
            })}
            disabled={!name || createMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditGroupModal({
  group,
  domainId,
  roles,
  users,
  onClose,
}: {
  group: DomainGroup;
  domainId: string;
  roles: Array<{ id: string; name: string; displayName?: string }>;
  users: Array<{ id: string; userDid: string; user?: { handle?: string; displayName?: string } }>;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'members'>('details');
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [directPermissions, setDirectPermissions] = useState(
    (group.directPermissions || group.permissions || []).join('\n')
  );
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    (group.assignedRoles || []).map((role) => role.id)
  );
  const [selectedUserDids, setSelectedUserDids] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'group-members', group.id],
    queryFn: () => api.adminDomainsGroupMembersList(group.id),
    enabled: !!group.id,
  });

  useEffect(() => {
    if (membersData?.members) {
      setSelectedUserDids(membersData.members.map((member) => member.userDid));
    }
  }, [membersData?.members]);

  const updateMutation = useMutation({
    mutationFn: async (data: { groupId: string; domainId: string; name: string; description?: string; directPermissions?: string[]; roleIds?: string[] }) => {
      await api.adminDomainsGroupsUpdate(data);
      await api.adminDomainsGroupMembersBulkSet(group.id, selectedUserDids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'group-members', group.id] });
      toast.success('Group updated');
      onClose();
    },
    onError: () => toast.error('Failed to update group'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userDid: string) => api.adminDomainsGroupMembersRemove(group.id, userDid),
    onSuccess: (_, userDid) => {
      setSelectedUserDids((current) => current.filter((did) => did !== userDid));
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'group-members', group.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'groups'] });
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });

  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return !selectedUserDids.includes(user.userDid);
    const search = searchQuery.toLowerCase();
    const handle = user.user?.handle?.toLowerCase() || '';
    const displayName = user.user?.displayName?.toLowerCase() || '';
    const did = user.userDid.toLowerCase();
    return (
      !selectedUserDids.includes(user.userDid) &&
      (handle.includes(search) || displayName.includes(search) || did.includes(search))
    );
  });

  const currentMembers = membersData?.members || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Edit Group</h2>
            <p className="text-sm text-text-muted mt-1">{group.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-4">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'details'
                ? 'text-accent border-b-2 border-accent -mb-px'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'members'
                ? 'text-accent border-b-2 border-accent -mb-px'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Members ({currentMembers.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Role Bundles</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border border-border p-3">
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <label key={role.id} className="flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.includes(role.id)}
                          onChange={(e) =>
                            setSelectedRoleIds((current) =>
                              e.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id)
                            )
                          }
                        />
                        <span>{role.displayName || role.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-text-muted col-span-2">No roles available</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Direct Permissions</label>
                <textarea
                  value={directPermissions}
                  onChange={(e) => setDirectPermissions(e.target.value)}
                  rows={6}
                  placeholder="domain.users.manage"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none font-mono text-sm"
                />
                <p className="text-xs text-text-muted mt-1">One permission per line</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current Members */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">Current Members</h3>
                {membersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : currentMembers.length === 0 ? (
                  <div className="text-center py-8 border border-border rounded-lg">
                    <p className="text-sm text-text-muted">No members in this group</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {currentMembers.map((member) => (
                      <div
                        key={member.userDid}
                        className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {member.user?.avatar ? (
                            <img
                              src={member.user.avatar}
                              alt=""
                              className="w-8 h-8 rounded-full flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                              <UserIcon className="w-4 h-4 text-accent" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {member.user?.displayName || member.user?.handle || member.userDid}
                            </p>
                            {member.user?.handle && (
                              <p className="text-xs text-text-muted truncate">@{member.user.handle}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('Remove this member from the group?')) {
                              removeMemberMutation.mutate(member.userDid);
                            }
                          }}
                          disabled={removeMemberMutation.isPending}
                          className="p-2 text-text-muted hover:text-red-400 rounded transition-colors flex-shrink-0"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Members */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">Add Members</h3>
                <input
                  type="text"
                  placeholder="Search users by handle or DID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary mb-2"
                />
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8 border border-border rounded-lg">
                      <p className="text-sm text-text-muted">
                        {searchQuery ? 'No users found' : 'All users are already members'}
                      </p>
                    </div>
                  ) : (
                    filteredUsers.slice(0, 50).map((user) => (
                      <button
                        key={user.userDid}
                        onClick={() => setSelectedUserDids((current) => [...current, user.userDid])}
                        className="w-full flex items-center gap-3 p-3 bg-surface-hover hover:bg-border rounded-lg border border-border transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <UserIcon className="w-4 h-4 text-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {user.user?.displayName || user.user?.handle || user.userDid}
                          </p>
                          {user.user?.handle && (
                            <p className="text-xs text-text-muted truncate">@{user.user.handle}</p>
                          )}
                        </div>
                        <PlusIcon className="w-5 h-5 text-accent ml-auto flex-shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              updateMutation.mutate({
                groupId: group.id,
                domainId,
                name,
                description: description || undefined,
                roleIds: selectedRoleIds,
                directPermissions: directPermissions
                  .split(/\s|,|\n/)
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
            disabled={!name || updateMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
