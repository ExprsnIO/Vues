'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, OrganizationView, OrganizationMemberView, OrganizationStatsView, OrganizationActivityView, OrganizationTagView, OrganizationBlockedWordView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';
import { Avatar } from '@/components/Avatar';

type TabType = 'overview' | 'members' | 'settings';
type MemberSortField = 'name' | 'role' | 'joinedAt';
type SortOrder = 'asc' | 'desc';

export default function OrganizationDashboard() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const orgId = params.id as string;

  const [organization, setOrganization] = useState<OrganizationView | null>(null);
  const [members, setMembers] = useState<OrganizationMemberView[]>([]);
  const [stats, setStats] = useState<OrganizationStatsView | null>(null);
  const [activity, setActivity] = useState<OrganizationActivityView[]>([]);
  const [tags, setTags] = useState<OrganizationTagView[]>([]);
  const [blockedWords, setBlockedWords] = useState<OrganizationBlockedWordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Member filtering/sorting state
  const [memberSearch, setMemberSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [sortField, setSortField] = useState<MemberSortField>('joinedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);

  // Edit member modal state
  const [editingMember, setEditingMember] = useState<OrganizationMemberView | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');

  // Settings state
  const [settingsSection, setSettingsSection] = useState<'general' | 'tags' | 'blocked-words' | 'danger'>('general');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#f83b85');
  const [newBlockedWord, setNewBlockedWord] = useState('');
  const [newBlockedWordSeverity, setNewBlockedWordSeverity] = useState<'low' | 'medium' | 'high'>('medium');

  useEffect(() => {
    loadOrganization();
  }, [orgId]);

  useEffect(() => {
    if (activeTab === 'overview') {
      loadStats();
      loadActivity();
    } else if (activeTab === 'settings') {
      loadTags();
      loadBlockedWords();
    }
  }, [activeTab, orgId]);

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

  const loadStats = async () => {
    try {
      const statsData = await api.getOrganizationStats(orgId);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadActivity = async () => {
    try {
      const activityData = await api.getOrganizationActivity(orgId, { limit: 10 });
      setActivity(activityData.activity);
    } catch (err) {
      console.error('Failed to load activity:', err);
    }
  };

  const loadTags = async () => {
    try {
      const tagsData = await api.getOrganizationTags(orgId);
      setTags(tagsData.tags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const loadBlockedWords = async () => {
    try {
      const wordsData = await api.getOrganizationBlockedWords(orgId);
      setBlockedWords(wordsData.words);
    } catch (err) {
      console.error('Failed to load blocked words:', err);
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

  const handleSuspendMember = async (memberId: string, action: 'suspend' | 'activate') => {
    const reason = action === 'suspend' ? prompt('Enter suspension reason:') : undefined;
    if (action === 'suspend' && !reason) return;

    try {
      await api.suspendOrganizationMember(orgId, memberId, action, reason || undefined);
      loadOrganization();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} member`);
    }
  };

  const handleResetPassword = async (memberId: string) => {
    if (!confirm('Reset password for this member? A new password will be generated.')) return;

    try {
      const result = await api.resetMemberPassword(orgId, memberId);
      alert(`New password: ${result.password}\n\nPlease share this securely with the member.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  const handleUpdateMember = async () => {
    if (!editingMember) return;

    try {
      await api.updateOrganizationMember(orgId, editingMember.id, {
        displayName: editDisplayName,
        bio: editBio,
      });
      setEditingMember(null);
      loadOrganization();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update member');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      await api.createOrganizationTag(orgId, { name: newTagName, color: newTagColor });
      setNewTagName('');
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create tag');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Delete this tag?')) return;

    try {
      await api.deleteOrganizationTag(orgId, tagId);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete tag');
    }
  };

  const handleAddBlockedWord = async () => {
    if (!newBlockedWord.trim()) return;

    try {
      await api.addOrganizationBlockedWord(orgId, {
        word: newBlockedWord,
        severity: newBlockedWordSeverity,
      });
      setNewBlockedWord('');
      loadBlockedWords();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add blocked word');
    }
  };

  const handleRemoveBlockedWord = async (wordId: string) => {
    try {
      await api.removeOrganizationBlockedWord(orgId, wordId);
      loadBlockedWords();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove word');
    }
  };

  const handleExportMembers = async (format: 'csv' | 'xlsx') => {
    try {
      const blob = await api.exportOrganizationMembers(orgId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `members.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export members');
    }
  };

  const handleDeleteOrganization = async () => {
    const confirmation = prompt(`Type "${organization?.name}" to confirm deletion:`);
    if (confirmation !== organization?.name) {
      alert('Organization name did not match');
      return;
    }

    try {
      await api.deleteOrganization({ organizationId: orgId, confirmName: confirmation });
      router.push('/');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete organization');
    }
  };

  const toggleSort = (field: MemberSortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedMembers = members
    .filter((member) => {
      const matchesSearch = memberSearch === '' ||
        member.user.handle.toLowerCase().includes(memberSearch.toLowerCase()) ||
        member.user.displayName?.toLowerCase().includes(memberSearch.toLowerCase());
      const matchesRole = roleFilter === '' || member.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = (a.user.displayName || a.user.handle).localeCompare(b.user.displayName || b.user.handle);
          break;
        case 'role':
          comparison = a.role.localeCompare(b.role);
          break;
        case 'joinedAt':
          comparison = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const canManageMembers = organization?.viewer?.permissions.includes('manage_members');
  const canBulkImport = organization?.viewer?.permissions.includes('bulk_import');
  const isOwner = organization?.viewer?.role === 'owner';

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent" />
        </main>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="text-center">
            <p className="text-error mb-4">{error || 'Organization not found'}</p>
            <button
              onClick={() => router.back()}
              className="text-accent hover:text-accent-hover"
            >
              Go back
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">{organization.name}</h1>
              <p className="text-text-muted mt-1">
                {organization.type.charAt(0).toUpperCase() + organization.type.slice(1)}
                {organization.verified && (
                  <span className="ml-2 text-info">Verified</span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              {canBulkImport && (
                <Link
                  href={`/org/${orgId}/import`}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
                >
                  Bulk Import
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-border mb-6">
          {(['overview', 'members', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-surface rounded-xl p-6">
                <h3 className="text-text-muted text-sm mb-2">Total Members</h3>
                <p className="text-3xl font-bold text-text-primary">{stats?.memberCount ?? organization.memberCount}</p>
              </div>
              <div className="bg-surface rounded-xl p-6">
                <h3 className="text-text-muted text-sm mb-2">Active Members</h3>
                <p className="text-3xl font-bold text-success">{stats?.activeMembers ?? '-'}</p>
              </div>
              <div className="bg-surface rounded-xl p-6">
                <h3 className="text-text-muted text-sm mb-2">Suspended</h3>
                <p className="text-3xl font-bold text-warning">{stats?.suspendedMembers ?? 0}</p>
              </div>
              <div className="bg-surface rounded-xl p-6">
                <h3 className="text-text-muted text-sm mb-2">Your Role</h3>
                <p className="text-3xl font-bold text-text-primary capitalize">
                  {organization.viewer?.role || 'Member'}
                </p>
              </div>
            </div>

            {/* Role Distribution */}
            {stats?.membersByRole && stats.membersByRole.length > 0 && (
              <div className="bg-surface rounded-xl p-6">
                <h3 className="text-text-primary font-medium mb-4">Members by Role</h3>
                <div className="flex gap-6">
                  {stats.membersByRole.map((item) => (
                    <div key={item.role} className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${
                        item.role === 'owner' ? 'bg-accent' :
                        item.role === 'admin' ? 'bg-info' : 'bg-text-muted'
                      }`} />
                      <span className="text-text-secondary capitalize">{item.role}</span>
                      <span className="text-text-primary font-medium">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-surface rounded-xl p-6">
              <h3 className="text-text-primary font-medium mb-4">Recent Activity</h3>
              {activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <Avatar
                        src={item.actor.avatar}
                        alt={item.actor.handle}
                        size={32}
                      />
                      <div className="flex-1">
                        <p className="text-text-secondary text-sm">
                          <span className="text-text-primary font-medium">{item.actor.displayName || item.actor.handle}</span>
                          {' '}{item.action}
                        </p>
                        <p className="text-text-muted text-xs">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-muted">No recent activity</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-surface rounded-xl p-6">
              <h3 className="text-text-primary font-medium mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-3">
                {canBulkImport && (
                  <Link
                    href={`/org/${orgId}/import`}
                    className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
                  >
                    Import Users
                  </Link>
                )}
                {canManageMembers && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
                  >
                    Invite Member
                  </button>
                )}
                <button
                  onClick={() => handleExportMembers('csv')}
                  className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => handleExportMembers('xlsx')}
                  className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
                >
                  Export Excel
                </button>
              </div>
            </div>

            {organization.website && (
              <div className="bg-surface rounded-xl p-6">
                <h3 className="text-text-muted text-sm mb-2">Website</h3>
                <a
                  href={organization.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover"
                >
                  {organization.website}
                </a>
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div>
            {/* Search and Filter Bar */}
            <div className="flex flex-wrap gap-4 mb-6">
              <input
                type="text"
                placeholder="Search members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="flex-1 min-w-[200px] bg-surface text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-surface text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border"
              >
                <option value="">All Roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              {canManageMembers && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
                >
                  Invite Member
                </button>
              )}
            </div>

            <div className="bg-surface rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      onClick={() => toggleSort('name')}
                      className="text-left text-text-muted text-sm font-medium p-4 cursor-pointer hover:text-text-primary"
                    >
                      User {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => toggleSort('role')}
                      className="text-left text-text-muted text-sm font-medium p-4 cursor-pointer hover:text-text-primary"
                    >
                      Role {sortField === 'role' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => toggleSort('joinedAt')}
                      className="text-left text-text-muted text-sm font-medium p-4 cursor-pointer hover:text-text-primary"
                    >
                      Joined {sortField === 'joinedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    {canManageMembers && (
                      <th className="text-right text-text-muted text-sm font-medium p-4">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedMembers.map((member) => (
                    <tr key={member.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={member.user.avatar}
                            alt={member.user.handle}
                            size={40}
                          />
                          <div>
                            <p className="text-text-primary font-medium">
                              {member.user.displayName || member.user.handle}
                            </p>
                            <p className="text-text-muted text-sm">@{member.user.handle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {canManageMembers && member.role !== 'owner' ? (
                          <select
                            value={member.role}
                            onChange={(e) => handleUpdateRole(member.id, e.target.value as 'admin' | 'member')}
                            className="bg-surface-hover text-text-primary rounded px-2 py-1 text-sm border border-border"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                        ) : (
                          <span className={`text-sm px-2 py-1 rounded ${
                            member.role === 'owner'
                              ? 'bg-accent-muted text-accent'
                              : member.role === 'admin'
                              ? 'bg-info-muted text-info'
                              : 'bg-surface-hover text-text-secondary'
                          }`}>
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-text-muted text-sm">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                      {canManageMembers && (
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            {member.role !== 'owner' && member.user.did !== user?.did && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingMember(member);
                                    setEditDisplayName(member.user.displayName || '');
                                    setEditBio('');
                                  }}
                                  className="text-text-secondary hover:text-text-primary text-sm px-2 py-1 rounded bg-surface-hover"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleResetPassword(member.id)}
                                  className="text-warning hover:text-warning text-sm px-2 py-1 rounded bg-warning-muted"
                                >
                                  Reset PW
                                </button>
                                <button
                                  onClick={() => handleRemoveMember(member.id)}
                                  className="text-error hover:text-error text-sm px-2 py-1 rounded bg-error-muted"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredAndSortedMembers.length === 0 && (
                <div className="p-8 text-center text-text-muted">
                  No members found
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex gap-6">
            {/* Settings Sidebar */}
            <div className="w-48 space-y-1">
              {(['general', 'tags', 'blocked-words', 'danger'] as const).map((section) => (
                <button
                  key={section}
                  onClick={() => setSettingsSection(section)}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                    settingsSection === section
                      ? 'bg-accent text-text-inverse'
                      : 'text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {section === 'blocked-words' ? 'Blocked Words' :
                   section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </div>

            {/* Settings Content */}
            <div className="flex-1 max-w-2xl">
              {settingsSection === 'general' && (
                <div className="bg-surface rounded-xl p-6">
                  <h3 className="text-text-primary font-medium mb-4">General Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-text-muted text-sm mb-2">Organization Name</label>
                      <input
                        type="text"
                        value={organization.name}
                        disabled
                        className="w-full bg-surface-hover text-text-primary rounded-lg px-4 py-2 border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-text-muted text-sm mb-2">Type</label>
                      <input
                        type="text"
                        value={organization.type}
                        disabled
                        className="w-full bg-surface-hover text-text-primary rounded-lg px-4 py-2 border border-border capitalize"
                      />
                    </div>
                    <div>
                      <label className="block text-text-muted text-sm mb-2">Created</label>
                      <input
                        type="text"
                        value={new Date(organization.createdAt).toLocaleDateString()}
                        disabled
                        className="w-full bg-surface-hover text-text-primary rounded-lg px-4 py-2 border border-border"
                      />
                    </div>
                  </div>
                </div>
              )}

              {settingsSection === 'tags' && (
                <div className="bg-surface rounded-xl p-6">
                  <h3 className="text-text-primary font-medium mb-4">Tag Management</h3>

                  {/* Create Tag */}
                  <div className="flex gap-3 mb-6">
                    <input
                      type="text"
                      placeholder="Tag name"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="flex-1 bg-surface-hover text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border"
                    />
                    <input
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="w-12 h-10 rounded-lg cursor-pointer"
                    />
                    <button
                      onClick={handleCreateTag}
                      disabled={!newTagName.trim()}
                      className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-text-inverse rounded-lg transition-colors"
                    >
                      Create Tag
                    </button>
                  </div>

                  {/* Tag List */}
                  <div className="space-y-2">
                    {tags.map((tag) => (
                      <div key={tag.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-text-primary">{tag.name}</span>
                          <span className="text-text-muted text-sm">({tag.memberCount} members)</span>
                        </div>
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          className="text-error hover:text-error text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                    {tags.length === 0 && (
                      <p className="text-text-muted text-center py-4">No tags created yet</p>
                    )}
                  </div>
                </div>
              )}

              {settingsSection === 'blocked-words' && (
                <div className="bg-surface rounded-xl p-6">
                  <h3 className="text-text-primary font-medium mb-4">Blocked Words</h3>

                  {/* Add Word */}
                  <div className="flex gap-3 mb-6">
                    <input
                      type="text"
                      placeholder="Enter word to block"
                      value={newBlockedWord}
                      onChange={(e) => setNewBlockedWord(e.target.value)}
                      className="flex-1 bg-surface-hover text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border"
                    />
                    <select
                      value={newBlockedWordSeverity}
                      onChange={(e) => setNewBlockedWordSeverity(e.target.value as 'low' | 'medium' | 'high')}
                      className="bg-surface-hover text-text-primary rounded-lg px-4 py-2 border border-border"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <button
                      onClick={handleAddBlockedWord}
                      disabled={!newBlockedWord.trim()}
                      className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-text-inverse rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  {/* Word List */}
                  <div className="space-y-2">
                    {blockedWords.map((word) => (
                      <div key={word.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-text-primary font-mono">{word.word}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            word.severity === 'high' ? 'bg-error-muted text-error' :
                            word.severity === 'medium' ? 'bg-warning-muted text-warning' :
                            'bg-surface text-text-muted'
                          }`}>
                            {word.severity}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveBlockedWord(word.id)}
                          className="text-error hover:text-error text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {blockedWords.length === 0 && (
                      <p className="text-text-muted text-center py-4">No blocked words</p>
                    )}
                  </div>
                </div>
              )}

              {settingsSection === 'danger' && isOwner && (
                <div className="bg-surface rounded-xl p-6 border border-error">
                  <h3 className="text-error font-medium mb-4">Danger Zone</h3>
                  <p className="text-text-muted mb-6">
                    These actions are irreversible. Please proceed with caution.
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-error-muted rounded-lg">
                      <div>
                        <p className="text-text-primary font-medium">Delete Organization</p>
                        <p className="text-text-muted text-sm">Permanently delete this organization and all its data</p>
                      </div>
                      <button
                        onClick={handleDeleteOrganization}
                        className="px-4 py-2 bg-error hover:bg-error text-text-inverse rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {settingsSection === 'danger' && !isOwner && (
                <div className="bg-surface rounded-xl p-6">
                  <p className="text-text-muted">Only the organization owner can access danger zone settings.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-md mx-4 border border-border">
              <h2 className="text-xl font-medium text-text-primary mb-4">Invite Member</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-text-muted text-sm mb-2">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="w-full bg-surface-hover text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border"
                  />
                </div>

                <div>
                  <label className="block text-text-muted text-sm mb-2">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                    className="w-full bg-surface-hover text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-inverse rounded-lg transition-colors"
                >
                  {inviting ? 'Inviting...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Member Modal */}
        {editingMember && (
          <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-md mx-4 border border-border">
              <h2 className="text-xl font-medium text-text-primary mb-4">Edit Member</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-text-muted text-sm mb-2">Display Name</label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="Display Name"
                    className="w-full bg-surface-hover text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border"
                  />
                </div>

                <div>
                  <label className="block text-text-muted text-sm mb-2">Bio</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Bio"
                    rows={3}
                    className="w-full bg-surface-hover text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent border border-border resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingMember(null)}
                  className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateMember}
                  className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
