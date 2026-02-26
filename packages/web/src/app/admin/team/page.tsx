'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AdminTeamMember } from '@/lib/api';
import toast from 'react-hot-toast';

type TeamScope = 'global' | string; // 'global' or domain ID

export default function AdminTeamPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedScope, setSelectedScope] = useState<TeamScope>('global');

  // Check if user is super admin
  const { data: adminSession } = useQuery({
    queryKey: ['admin-session'],
    queryFn: () => api.getAdminSession(),
  });

  const isSuperAdmin = adminSession?.admin?.role === 'super_admin';

  // Fetch domains for the selector (super admins only)
  const { data: domainsData } = useQuery({
    queryKey: ['admin-domains'],
    queryFn: () => api.adminDomainsList(),
    enabled: isSuperAdmin,
  });

  const domains = domainsData?.domains || [];

  // Fetch team based on selected scope
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'team', selectedScope],
    queryFn: async () => {
      if (selectedScope === 'global') {
        return api.getAdminTeam();
      } else {
        const result = await api.adminDomainsUsersList(selectedScope);
        // Normalize the domain users response to match admin team structure
        return {
          admins: result.users.map((u) => ({
            id: u.id,
            userDid: u.userDid,
            role: u.role,
            createdAt: u.createdAt,
            user: u.user,
          })),
        };
      }
    },
  });

  // Different mutations based on scope
  const updateMutation = useMutation({
    mutationFn: ({ adminId, role, userDid }: { adminId: string; role: string; userDid?: string }) => {
      if (selectedScope === 'global') {
        return api.updateAdmin({ adminId, role: role as 'admin' | 'moderator' | 'support' });
      } else {
        return api.adminDomainsUsersUpdateRole({
          domainId: selectedScope,
          userDid: userDid!,
          role: role as 'admin' | 'moderator' | 'member',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'team', selectedScope] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  const removeMutation = useMutation({
    mutationFn: ({ adminId, userDid }: { adminId: string; userDid?: string }) => {
      if (selectedScope === 'global') {
        return api.removeAdmin(adminId);
      } else {
        return api.adminDomainsUsersRemove(selectedScope, userDid!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'team', selectedScope] });
      toast.success(selectedScope === 'global' ? 'Admin removed' : 'Team member removed');
    },
    onError: () => toast.error('Failed to remove'),
  });

  // Team members from normalized data
  type TeamMember = AdminTeamMember & { userDid?: string };
  const teamMembers: TeamMember[] = (data?.admins || []) as TeamMember[];

  const roleColors: Record<string, string> = {
    super_admin: 'bg-purple-500/10 text-purple-500',
    admin: 'bg-blue-500/10 text-blue-500',
    moderator: 'bg-green-500/10 text-green-500',
    support: 'bg-gray-500/10 text-gray-400',
    member: 'bg-gray-500/10 text-gray-400',
  };

  const scopeLabel = selectedScope === 'global'
    ? 'Global Admin Team'
    : domains.find((d) => d.id === selectedScope)?.name || 'Domain Team';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin Team</h1>
          {selectedScope !== 'global' && (
            <p className="text-sm text-text-muted mt-1">
              Managing team for: <span className="text-accent">{scopeLabel}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Scope Selector */}
          {isSuperAdmin && domains.length > 0 && (
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-accent focus:outline-none"
            >
              <option value="global">Global Admins</option>
              <optgroup label="Domain Teams">
                {domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            {selectedScope === 'global' ? 'Add Admin' : 'Add Team Member'}
          </button>
        </div>
      </div>

      {/* Team List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Added
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : teamMembers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-text-muted">
                  {selectedScope === 'global' ? 'No admin users' : 'No team members for this domain'}
                </td>
              </tr>
            ) : (
              teamMembers.map((member) => (
                <tr key={member.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden">
                        {member.user?.avatar ? (
                          <img
                            src={member.user.avatar}
                            alt={member.user.handle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                            {member.user?.handle?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">
                          {member.user?.displayName || member.user?.handle || 'Unknown'}
                        </p>
                        <p className="text-sm text-text-muted">@{member.user?.handle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleColors[member.role] || roleColors.member}`}>
                      {member.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {member.role !== 'super_admin' && (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={member.role}
                          onChange={(e) =>
                            updateMutation.mutate({
                              adminId: member.id,
                              role: e.target.value as 'admin' | 'moderator' | 'support',
                              userDid: member.userDid,
                            })
                          }
                          className="px-2 py-1 bg-surface border border-border rounded text-sm text-text-primary"
                        >
                          <option value="admin">Admin</option>
                          <option value="moderator">Moderator</option>
                          {selectedScope === 'global' && <option value="support">Support</option>}
                          {selectedScope !== 'global' && <option value="member">Member</option>}
                        </select>
                        <button
                          onClick={() => {
                            if (confirm(selectedScope === 'global' ? 'Remove this admin?' : 'Remove this team member?')) {
                              removeMutation.mutate({ adminId: member.id, userDid: member.userDid });
                            }
                          }}
                          className="px-3 py-1 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Role Permissions */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Role Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-surface-hover rounded-lg">
            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded-full ${roleColors.admin}`}>Admin</span>
            </h4>
            <ul className="text-sm text-text-muted space-y-1">
              <li>View and edit users</li>
              <li>Moderate content</li>
              <li>Handle reports</li>
              <li>Manage featured content</li>
              <li>View analytics</li>
            </ul>
          </div>
          <div className="p-4 bg-surface-hover rounded-lg">
            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded-full ${roleColors.moderator}`}>Moderator</span>
            </h4>
            <ul className="text-sm text-text-muted space-y-1">
              <li>View users</li>
              <li>Issue warnings</li>
              <li>Moderate content</li>
              <li>Handle reports</li>
            </ul>
          </div>
          <div className="p-4 bg-surface-hover rounded-lg">
            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded-full ${roleColors.support}`}>Support</span>
            </h4>
            <ul className="text-sm text-text-muted space-y-1">
              <li>View users</li>
              <li>View content</li>
              <li>View reports</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Add Admin Modal */}
      {showAddModal && (
        <AddAdminModal
          scope={selectedScope}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'team', selectedScope] });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddAdminModal({
  scope,
  onClose,
  onSuccess,
}: {
  scope: TeamScope;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState<'admin' | 'moderator' | 'support' | 'member'>(scope === 'global' ? 'moderator' : 'member');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isGlobal = scope === 'global';

  const handleSubmit = async () => {
    if (!handle.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      // First, find the user by handle
      const profile = await api.getProfile(handle.replace('@', ''));
      if (!profile?.profile?.did) {
        setError('User not found');
        setIsLoading(false);
        return;
      }

      if (isGlobal) {
        // Add as global admin
        await api.addAdmin({ userDid: profile.profile.did, role: role as 'admin' | 'moderator' | 'support' });
        toast.success('Admin added');
      } else {
        // Add to domain team
        await api.adminDomainsUsersAdd({
          domainId: scope,
          userDid: profile.profile.did,
          role: role as 'admin' | 'moderator' | 'member',
        });
        toast.success('Team member added');
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : isGlobal ? 'Failed to add admin' : 'Failed to add team member');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">
          {isGlobal ? 'Add Admin' : 'Add Team Member'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">User Handle</label>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="username"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'moderator' | 'support' | 'member')}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              {isGlobal && <option value="support">Support</option>}
              {!isGlobal && <option value="member">Member</option>}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !handle.trim()}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Adding...' : isGlobal ? 'Add Admin' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  );
}
