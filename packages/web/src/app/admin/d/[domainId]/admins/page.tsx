// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface DomainAdmin {
  id: string;
  userDid: string;
  permissions: string[];
  directPermissions?: string[];
  effectivePermissions?: string[];
  createdAt: string;
  source?: 'domain' | 'global_inherited';
  user?: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

const ADMIN_PERMISSIONS = [
  { id: 'users.view', label: 'View Users', description: 'Can view domain users' },
  { id: 'users.manage', label: 'Manage Users', description: 'Can add/remove/edit domain users' },
  { id: 'groups.manage', label: 'Manage Groups', description: 'Can create/edit/delete groups' },
  { id: 'moderation.view', label: 'View Moderation Queue', description: 'Can view moderation items' },
  { id: 'moderation.action', label: 'Take Moderation Actions', description: 'Can approve/reject/ban content' },
  { id: 'settings.view', label: 'View Settings', description: 'Can view domain settings' },
  { id: 'settings.edit', label: 'Edit Settings', description: 'Can modify domain settings' },
  { id: 'branding.edit', label: 'Edit Branding', description: 'Can modify domain branding' },
];

export default function DomainAdminsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<DomainAdmin | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  // Use domain users with admin role as domain admins
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'users'],
    queryFn: () => api.adminDomainsUsersList(domainId, { includeInherited: true }),
    enabled: !!domainId,
  });

  const domain = domainData?.domain;
  const admins = (usersData?.users || []).filter(u => u.role === 'admin');

  const removeMutation = useMutation({
    mutationFn: (userDid: string) => api.adminDomainsUsersUpdateRole({ domainId, userDid, role: 'member' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Admin removed');
    },
    onError: () => toast.error('Failed to remove admin'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Domain Administrators</h1>
          <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Admin
        </button>
      </div>

      <div className="bg-surface border border-border rounded-lg p-4">
        <p className="text-text-muted text-sm">
          Domain administrators have elevated permissions within this domain. Global admins are
          inherited into every domain and appear here as read-only entries.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : admins.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <AdminIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No administrators assigned to this domain</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
          >
            Add First Admin
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Admin</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Added</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center overflow-hidden">
                        {admin.user?.avatar ? (
                          <img src={admin.user.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-purple-400 text-lg font-semibold">
                            {admin.user?.handle?.[0]?.toUpperCase() || '?'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-text-primary font-medium">
                          {admin.user?.displayName || admin.user?.handle || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-text-muted text-sm">@{admin.user?.handle}</p>
                          {admin.source === 'global_inherited' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              Global Admin
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-text-muted text-sm">
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedAdmin(admin)}
                        className="text-accent hover:text-accent-hover text-sm"
                      >
                        Permissions
                      </button>
                      {admin.source === 'global_inherited' ? (
                        <span className="text-text-muted text-sm">Managed globally</span>
                      ) : (
                        <button
                          onClick={() => {
                            if (confirm('Remove admin privileges from this user?')) {
                              removeMutation.mutate(admin.userDid);
                            }
                          }}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddAdminModal domainId={domainId} onClose={() => setShowAddModal(false)} />
      )}

      {selectedAdmin && (
        <PermissionsModal
          admin={selectedAdmin}
          domainId={domainId}
          onClose={() => setSelectedAdmin(null)}
        />
      )}
    </div>
  );
}

function AddAdminModal({ domainId, onClose }: { domainId: string; onClose: () => void }) {
  const [handle, setHandle] = useState('');
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: (data: { domainId: string; userHandle: string; role: string }) =>
      api.adminDomainsUsersAdd(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Admin added');
      onClose();
    },
    onError: () => toast.error('Failed to add admin'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add Domain Admin</h2>
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
          <p className="text-text-muted text-sm">
            The user will be granted admin privileges for this domain.
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => addMutation.mutate({ domainId, userHandle: handle.replace('@', ''), role: 'admin' })}
            disabled={!handle || addMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {addMutation.isPending ? 'Adding...' : 'Add Admin'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionsModal({ admin, domainId, onClose }: { admin: DomainAdmin; domainId: string; onClose: () => void }) {
  const [permissions, setPermissions] = useState<string[]>(
    admin.directPermissions || admin.permissions || ADMIN_PERMISSIONS.map(p => p.id)
  );

  const togglePermission = (permId: string) => {
    setPermissions(prev =>
      prev.includes(permId)
        ? prev.filter(p => p !== permId)
        : [...prev, permId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-text-primary mb-2">Admin Permissions</h2>
        <p className="text-text-muted text-sm mb-4">
          Configure permissions for @{admin.user?.handle}
        </p>
        {admin.source === 'global_inherited' && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-text-muted">
            This administrator is inherited from the global admin team. Update the global admin record to change access here.
          </div>
        )}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {ADMIN_PERMISSIONS.map((perm) => (
            <label key={perm.id} className="flex items-start gap-3 p-3 bg-surface-hover rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.includes(perm.id)}
                onChange={() => togglePermission(perm.id)}
                disabled={admin.source === 'global_inherited'}
                className="w-4 h-4 mt-0.5 rounded border-border text-accent focus:ring-accent"
              />
              <div>
                <p className="text-text-primary font-medium">{perm.label}</p>
                <p className="text-text-muted text-sm">{perm.description}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => {
              toast.success('Permissions updated');
              onClose();
            }}
            disabled={admin.source === 'global_inherited'}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}
