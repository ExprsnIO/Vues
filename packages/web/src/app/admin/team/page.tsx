'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AdminTeamMember } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminTeamPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'team'],
    queryFn: () => api.getAdminTeam(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ adminId, role }: { adminId: string; role: 'admin' | 'moderator' | 'support' }) =>
      api.updateAdmin({ adminId, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  const removeMutation = useMutation({
    mutationFn: (adminId: string) => api.removeAdmin(adminId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });
      toast.success('Admin removed');
    },
    onError: () => toast.error('Failed to remove admin'),
  });

  const admins = data?.admins || [];

  const roleColors: Record<string, string> = {
    super_admin: 'bg-purple-500/10 text-purple-500',
    admin: 'bg-blue-500/10 text-blue-500',
    moderator: 'bg-green-500/10 text-green-500',
    support: 'bg-gray-500/10 text-gray-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Admin Team</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Admin
        </button>
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
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-text-muted">
                  No admin users
                </td>
              </tr>
            ) : (
              admins.map((admin: AdminTeamMember) => (
                <tr key={admin.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden">
                        {admin.user?.avatar ? (
                          <img
                            src={admin.user.avatar}
                            alt={admin.user.handle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                            {admin.user?.handle?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">
                          {admin.user?.displayName || admin.user?.handle || 'Unknown'}
                        </p>
                        <p className="text-sm text-text-muted">@{admin.user?.handle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleColors[admin.role]}`}>
                      {admin.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {admin.role !== 'super_admin' && (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={admin.role}
                          onChange={(e) =>
                            updateMutation.mutate({
                              adminId: admin.id,
                              role: e.target.value as 'admin' | 'moderator' | 'support',
                            })
                          }
                          className="px-2 py-1 bg-surface border border-border rounded text-sm text-text-primary"
                        >
                          <option value="admin">Admin</option>
                          <option value="moderator">Moderator</option>
                          <option value="support">Support</option>
                        </select>
                        <button
                          onClick={() => {
                            if (confirm('Remove this admin?')) {
                              removeMutation.mutate(admin.id);
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
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddAdminModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState<'admin' | 'moderator' | 'support'>('moderator');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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

      // Add as admin
      await api.addAdmin({ userDid: profile.profile.did, role });
      toast.success('Admin added');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add admin');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add Admin</h2>

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
              onChange={(e) => setRole(e.target.value as 'admin' | 'moderator' | 'support')}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="support">Support</option>
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
            {isLoading ? 'Adding...' : 'Add Admin'}
          </button>
        </div>
      </div>
    </div>
  );
}
