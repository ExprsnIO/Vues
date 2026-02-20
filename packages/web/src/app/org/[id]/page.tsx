'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, OrganizationView, OrganizationMemberView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';
import { Avatar } from '@/components/Avatar';

export default function OrganizationDashboard() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const orgId = params.id as string;

  const [organization, setOrganization] = useState<OrganizationView | null>(null);
  const [members, setMembers] = useState<OrganizationMemberView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'settings'>('overview');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadOrganization();
  }, [orgId]);

  const loadOrganization = async () => {
    try {
      setLoading(true);
      const [orgResponse, membersResponse] = await Promise.all([
        api.getOrganization(orgId),
        api.getOrganizationMembers(orgId),
      ]);
      setOrganization(orgResponse.organization);
      setMembers(membersResponse.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    try {
      setInviting(true);
      await api.inviteOrganizationMember(orgId, {
        email: inviteEmail,
        role: inviteRole,
      });
      setShowInviteModal(false);
      setInviteEmail('');
      loadOrganization();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await api.removeMember(orgId, memberId);
      loadOrganization();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: 'admin' | 'member') => {
    try {
      await api.updateMemberRole(orgId, memberId, newRole);
      loadOrganization();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const canManageMembers = organization?.viewer?.permissions.includes('manage_members');
  const canBulkImport = organization?.viewer?.permissions.includes('bulk_import');

  if (loading) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500" />
        </main>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Organization not found'}</p>
            <button
              onClick={() => router.back()}
              className="text-pink-400 hover:text-pink-300"
            >
              Go back
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{organization.name}</h1>
              <p className="text-gray-400 mt-1">
                {organization.type.charAt(0).toUpperCase() + organization.type.slice(1)}
                {organization.verified && (
                  <span className="ml-2 text-blue-400">Verified</span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              {canBulkImport && (
                <Link
                  href={`/org/${orgId}/import`}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
                >
                  Bulk Import
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-800 mb-6">
          {(['overview', 'members', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-pink-400 border-b-2 border-pink-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-900 rounded-xl p-6">
              <h3 className="text-gray-400 text-sm mb-2">Members</h3>
              <p className="text-3xl font-bold text-white">{organization.memberCount}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-6">
              <h3 className="text-gray-400 text-sm mb-2">Your Role</h3>
              <p className="text-3xl font-bold text-white capitalize">
                {organization.viewer?.role || 'Member'}
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-6">
              <h3 className="text-gray-400 text-sm mb-2">Created</h3>
              <p className="text-lg text-white">
                {new Date(organization.createdAt).toLocaleDateString()}
              </p>
            </div>

            {organization.website && (
              <div className="bg-gray-900 rounded-xl p-6 col-span-full">
                <h3 className="text-gray-400 text-sm mb-2">Website</h3>
                <a
                  href={organization.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-400 hover:text-pink-300"
                >
                  {organization.website}
                </a>
              </div>
            )}

            <div className="bg-gray-900 rounded-xl p-6 col-span-full">
              <h3 className="text-white font-medium mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-3">
                {canBulkImport && (
                  <Link
                    href={`/org/${orgId}/import`}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Import Users
                  </Link>
                )}
                {canManageMembers && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Invite Member
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-medium text-white">
                Members ({members.length})
              </h2>
              {canManageMembers && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
                >
                  Invite Member
                </button>
              )}
            </div>

            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-400 text-sm font-medium p-4">User</th>
                    <th className="text-left text-gray-400 text-sm font-medium p-4">Role</th>
                    <th className="text-left text-gray-400 text-sm font-medium p-4">Joined</th>
                    {canManageMembers && (
                      <th className="text-right text-gray-400 text-sm font-medium p-4">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b border-gray-800 last:border-0">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={member.user.avatar}
                            alt={member.user.handle}
                            size={40}
                          />
                          <div>
                            <p className="text-white font-medium">
                              {member.user.displayName || member.user.handle}
                            </p>
                            <p className="text-gray-400 text-sm">@{member.user.handle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {canManageMembers && member.role !== 'owner' ? (
                          <select
                            value={member.role}
                            onChange={(e) => handleUpdateRole(member.id, e.target.value as 'admin' | 'member')}
                            className="bg-gray-800 text-white rounded px-2 py-1 text-sm"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                        ) : (
                          <span className={`text-sm px-2 py-1 rounded ${
                            member.role === 'owner'
                              ? 'bg-pink-900 text-pink-300'
                              : member.role === 'admin'
                              ? 'bg-blue-900 text-blue-300'
                              : 'bg-gray-800 text-gray-300'
                          }`}>
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-gray-400 text-sm">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                      {canManageMembers && (
                        <td className="p-4 text-right">
                          {member.role !== 'owner' && member.user.did !== user?.did && (
                            <button
                              onClick={() => handleRemoveMember(member.id)}
                              className="text-red-400 hover:text-red-300 text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="bg-gray-900 rounded-xl p-6">
              <h3 className="text-white font-medium mb-4">Organization Settings</h3>
              <p className="text-gray-400">
                Settings management coming soon.
              </p>
            </div>
          </div>
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md mx-4">
              <h2 className="text-xl font-medium text-white mb-4">Invite Member</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex-1 px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {inviting ? 'Inviting...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
