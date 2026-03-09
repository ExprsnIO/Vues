'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const did = decodeURIComponent(params.did as string);
  const queryClient = useQueryClient();

  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [showAddOrgModal, setShowAddOrgModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState<string | null>(null); // domainId
  const [showAddGroupModal, setShowAddGroupModal] = useState<string | null>(null); // domainId
  const [activeTab, setActiveTab] = useState<'overview' | 'domains' | 'organizations' | 'roles'>('overview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'user', did],
    queryFn: () => api.getAdminUser(did),
  });

  const { data: accountData } = useQuery({
    queryKey: ['admin', 'user', 'account', did],
    queryFn: () => api.getUserAccountInfo(did),
  });

  const { data: memberships, refetch: refetchMemberships } = useQuery({
    queryKey: ['admin', 'user', 'memberships', did],
    queryFn: () => api.getUserMemberships(did),
  });

  const setPasswordMutation = useMutation({
    mutationFn: (password: string) => api.setUserPassword({ did, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'account', did] });
      setShowPasswordModal(false);
      toast.success('Password updated successfully');
    },
    onError: () => toast.error('Failed to update password'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.resetUserPassword({ did }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'account', did] });
      toast.success(`Temporary password: ${data.temporaryPassword}`, { duration: 10000 });
    },
    onError: () => toast.error('Failed to reset password'),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: () => api.forceUserLogout({ did }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'account', did] });
      toast.success(`Logged out ${data.sessionsInvalidated} session(s)`);
    },
    onError: () => toast.error('Failed to logout user'),
  });

  const verifyMutation = useMutation({
    mutationFn: (verified: boolean) => api.updateAdminUser({ did, verified }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', did] });
      toast.success('User updated');
    },
    onError: () => toast.error('Failed to update user'),
  });

  const sanctionMutation = useMutation({
    mutationFn: (data: {
      sanctionType: 'warning' | 'mute' | 'suspend' | 'ban';
      reason: string;
      expiresAt?: string;
    }) => api.sanctionUser({ userDid: did, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', did] });
      setShowSanctionModal(false);
      toast.success('Sanction applied');
    },
    onError: () => toast.error('Failed to apply sanction'),
  });

  // Domain mutations
  const addToDomainMutation = useMutation({
    mutationFn: (data: { domainId: string; role?: string }) =>
      api.addUserToDomain({ userDid: did, ...data }),
    onSuccess: () => {
      refetchMemberships();
      setShowAddDomainModal(false);
      toast.success('User added to domain');
    },
    onError: () => toast.error('Failed to add user to domain'),
  });

  const removeFromDomainMutation = useMutation({
    mutationFn: (domainId: string) => api.removeUserFromDomain({ userDid: did, domainId }),
    onSuccess: () => {
      refetchMemberships();
      toast.success('User removed from domain');
    },
    onError: () => toast.error('Failed to remove user from domain'),
  });

  // Organization mutations
  const addToOrgMutation = useMutation({
    mutationFn: (data: { organizationId: string; role?: string }) =>
      api.addUserToOrganization({ userDid: did, ...data }),
    onSuccess: () => {
      refetchMemberships();
      setShowAddOrgModal(false);
      toast.success('User added to organization');
    },
    onError: () => toast.error('Failed to add user to organization'),
  });

  const removeFromOrgMutation = useMutation({
    mutationFn: (organizationId: string) =>
      api.removeUserFromOrganization({ userDid: did, organizationId }),
    onSuccess: () => {
      refetchMemberships();
      toast.success('User removed from organization');
    },
    onError: () => toast.error('Failed to remove user from organization'),
  });

  // Role mutations
  const assignRoleMutation = useMutation({
    mutationFn: (data: { domainId: string; roleId: string }) =>
      api.assignDomainRole({ userDid: did, ...data }),
    onSuccess: () => {
      refetchMemberships();
      setShowAddRoleModal(null);
      toast.success('Role assigned');
    },
    onError: () => toast.error('Failed to assign role'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (data: { domainId: string; roleId: string }) =>
      api.removeDomainRole({ userDid: did, ...data }),
    onSuccess: () => {
      refetchMemberships();
      toast.success('Role removed');
    },
    onError: () => toast.error('Failed to remove role'),
  });

  // Group mutations
  const addToGroupMutation = useMutation({
    mutationFn: (groupId: string) => api.addUserToGroup({ userDid: did, groupId }),
    onSuccess: () => {
      refetchMemberships();
      setShowAddGroupModal(null);
      toast.success('User added to group');
    },
    onError: () => toast.error('Failed to add user to group'),
  });

  const removeFromGroupMutation = useMutation({
    mutationFn: (groupId: string) => api.removeUserFromGroup({ userDid: did, groupId }),
    onSuccess: () => {
      refetchMemberships();
      toast.success('User removed from group');
    },
    onError: () => toast.error('Failed to remove user from group'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface rounded animate-pulse" />
        <div className="h-64 bg-surface rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-text-primary mb-2">User not found</h2>
        <Link href="/admin/users" className="text-accent hover:underline">
          Back to users
        </Link>
      </div>
    );
  }

  const { user, sanctions, recentVideos, reportCount } = data;
  const activeSanction = sanctions?.find(
    (s: any) => !s.expiresAt || new Date(s.expiresAt) > new Date()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-hover"
        >
          <BackIcon className="w-5 h-5 text-text-muted" />
        </button>
        <h1 className="text-2xl font-bold text-text-primary">User Details</h1>
      </div>

      {/* User Profile Card */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
            {user.avatar ? (
              <img src={user.avatar} alt={user.handle} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-2xl font-bold">
                {user.handle[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-text-primary">
                {user.displayName || user.handle}
              </h2>
              {user.verified && <VerifiedBadge />}
              {activeSanction && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${getSanctionColor(activeSanction.sanctionType)}`}>
                  {activeSanction.sanctionType}
                </span>
              )}
            </div>
            <p className="text-text-muted mb-3">@{user.handle}</p>
            {user.bio && <p className="text-text-secondary text-sm mb-4">{user.bio}</p>}
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-semibold text-text-primary">{formatCount(user.followerCount)}</span>
                <span className="text-text-muted ml-1">followers</span>
              </div>
              <div>
                <span className="font-semibold text-text-primary">{formatCount(user.followingCount)}</span>
                <span className="text-text-muted ml-1">following</span>
              </div>
              <div>
                <span className="font-semibold text-text-primary">{user.videoCount}</span>
                <span className="text-text-muted ml-1">videos</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => verifyMutation.mutate(!user.verified)}
              disabled={verifyMutation.isPending}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors text-sm"
            >
              {user.verified ? 'Remove Verification' : 'Verify User'}
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors text-sm"
            >
              Manage Password
            </button>
            <button
              onClick={() => setShowSanctionModal(true)}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-sm"
            >
              Issue Sanction
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'domains', label: 'Domains' },
            { id: 'organizations', label: 'Organizations' },
            { id: 'roles', label: 'Roles & Groups' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.label}
              {tab.id === 'domains' && memberships?.domains?.length ? (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-surface-hover rounded-full">
                  {memberships.domains.length}
                </span>
              ) : null}
              {tab.id === 'organizations' && memberships?.organizations?.length ? (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-surface-hover rounded-full">
                  {memberships.organizations.length}
                </span>
              ) : null}
              {tab.id === 'roles' && memberships?.groups?.length ? (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-surface-hover rounded-full">
                  {memberships.groups.length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats & Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-sm text-text-muted mb-1">Joined</p>
              <p className="text-text-primary font-medium">
                {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-sm text-text-muted mb-1">Reports Against</p>
              <p className={`font-medium ${reportCount > 0 ? 'text-red-500' : 'text-text-primary'}`}>
                {reportCount}
              </p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-sm text-text-muted mb-1">DID</p>
              <p className="text-text-primary font-mono text-xs truncate">{user.did}</p>
            </div>
          </div>

          {/* Sanction History */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Sanction History</h3>
            {sanctions?.length === 0 ? (
              <p className="text-text-muted text-sm">No sanctions on record</p>
            ) : (
              <div className="space-y-3">
                {sanctions?.map((sanction: any) => (
                  <div
                    key={sanction.id}
                    className="flex items-start justify-between p-3 bg-surface-hover rounded-lg"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getSanctionColor(sanction.sanctionType)}`}>
                          {sanction.sanctionType}
                        </span>
                        {sanction.expiresAt && new Date(sanction.expiresAt) < new Date() && (
                          <span className="text-xs text-text-muted">Expired</span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary">{sanction.reason}</p>
                    </div>
                    <span className="text-xs text-text-muted">
                      {new Date(sanction.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Videos */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Recent Videos</h3>
            {recentVideos?.length === 0 ? (
              <p className="text-text-muted text-sm">No videos</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {recentVideos?.map((video: any) => (
                  <div key={video.uri} className="relative aspect-[9/16] rounded-lg bg-surface-hover overflow-hidden">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VideoIcon className="w-8 h-8 text-text-muted" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-xs text-white">{formatCount(video.viewCount)} views</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'domains' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">Domain Memberships</h3>
            <button
              onClick={() => setShowAddDomainModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors text-sm"
            >
              Add to Domain
            </button>
          </div>

          {memberships?.domains?.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <DomainIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">Not a member of any domains</p>
            </div>
          ) : (
            <div className="space-y-3">
              {memberships?.domains?.map((dm) => (
                <div key={dm.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-text-primary">
                        {dm.domainDisplayName || dm.domainName}
                      </h4>
                      <p className="text-sm text-text-muted">{dm.domainName}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 text-xs bg-surface-hover rounded-full text-text-secondary">
                          {dm.role}
                        </span>
                        {dm.handle && (
                          <span className="text-xs text-text-muted">@{dm.handle}</span>
                        )}
                        {!dm.isActive && (
                          <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-500 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      {dm.roles?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {dm.roles.map((role) => (
                            <span
                              key={role.id}
                              className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full"
                            >
                              {role.displayName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowAddRoleModal(dm.domainId)}
                        className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-border rounded-lg transition-colors"
                      >
                        Add Role
                      </button>
                      <button
                        onClick={() => setShowAddGroupModal(dm.domainId)}
                        className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-border rounded-lg transition-colors"
                      >
                        Add to Group
                      </button>
                      <button
                        onClick={() => removeFromDomainMutation.mutate(dm.domainId)}
                        disabled={removeFromDomainMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'organizations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">Organization Memberships</h3>
            <button
              onClick={() => setShowAddOrgModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors text-sm"
            >
              Add to Organization
            </button>
          </div>

          {memberships?.organizations?.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <OrgIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">Not a member of any organizations</p>
            </div>
          ) : (
            <div className="space-y-3">
              {memberships?.organizations?.map((om) => (
                <div key={om.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {om.orgAvatar ? (
                        <img src={om.orgAvatar} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
                          <OrgIcon className="w-5 h-5 text-text-muted" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-medium text-text-primary">{om.orgName}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 text-xs bg-surface-hover rounded-full text-text-secondary capitalize">
                            {om.orgType}
                          </span>
                          <span className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full capitalize">
                            {om.role}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromOrgMutation.mutate(om.orgId)}
                      disabled={removeFromOrgMutation.isPending}
                      className="px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="space-y-6">
          {/* Roles by Domain */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Roles by Domain</h3>
            {memberships?.domains?.filter((dm) => dm.roles?.length > 0).length === 0 ? (
              <div className="bg-surface border border-border rounded-xl p-8 text-center">
                <RoleIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No roles assigned</p>
              </div>
            ) : (
              <div className="space-y-3">
                {memberships?.domains
                  ?.filter((dm) => dm.roles?.length > 0)
                  .map((dm) => (
                    <div key={dm.id} className="bg-surface border border-border rounded-xl p-4">
                      <h4 className="font-medium text-text-primary mb-3">
                        {dm.domainDisplayName || dm.domainName}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {dm.roles.map((role) => (
                          <div
                            key={role.id}
                            className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-lg"
                          >
                            <span className="text-sm text-accent">{role.displayName}</span>
                            <button
                              onClick={() =>
                                removeRoleMutation.mutate({ domainId: dm.domainId, roleId: role.id })
                              }
                              className="text-accent/60 hover:text-accent"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Groups */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Group Memberships</h3>
            {memberships?.groups?.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl p-8 text-center">
                <GroupIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">Not a member of any groups</p>
              </div>
            ) : (
              <div className="space-y-3">
                {memberships?.groups?.map((gm) => (
                  <div key={gm.id} className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-text-primary">{gm.groupName}</h4>
                        {gm.groupDescription && (
                          <p className="text-sm text-text-muted">{gm.groupDescription}</p>
                        )}
                        <p className="text-xs text-text-muted mt-1">Domain: {gm.domainName}</p>
                      </div>
                      <button
                        onClick={() => removeFromGroupMutation.mutate(gm.groupId)}
                        disabled={removeFromGroupMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showSanctionModal && (
        <SanctionModal
          onClose={() => setShowSanctionModal(false)}
          onSubmit={(data) => sanctionMutation.mutate(data)}
          isLoading={sanctionMutation.isPending}
        />
      )}

      {showPasswordModal && (
        <PasswordModal
          account={accountData?.account}
          onClose={() => setShowPasswordModal(false)}
          onSetPassword={(password) => setPasswordMutation.mutate(password)}
          onResetPassword={() => resetPasswordMutation.mutate()}
          onForceLogout={() => forceLogoutMutation.mutate()}
          isLoading={setPasswordMutation.isPending || resetPasswordMutation.isPending || forceLogoutMutation.isPending}
        />
      )}

      {showAddDomainModal && (
        <AddToDomainModal
          onClose={() => setShowAddDomainModal(false)}
          onSubmit={(data) => addToDomainMutation.mutate(data)}
          isLoading={addToDomainMutation.isPending}
          existingDomainIds={memberships?.domains?.map((d) => d.domainId) || []}
        />
      )}

      {showAddOrgModal && (
        <AddToOrgModal
          onClose={() => setShowAddOrgModal(false)}
          onSubmit={(data) => addToOrgMutation.mutate(data)}
          isLoading={addToOrgMutation.isPending}
          existingOrgIds={memberships?.organizations?.map((o) => o.orgId) || []}
        />
      )}

      {showAddRoleModal && (
        <AddRoleModal
          domainId={showAddRoleModal}
          onClose={() => setShowAddRoleModal(null)}
          onSubmit={(roleId) => assignRoleMutation.mutate({ domainId: showAddRoleModal, roleId })}
          isLoading={assignRoleMutation.isPending}
          existingRoleIds={
            memberships?.domains
              ?.find((d) => d.domainId === showAddRoleModal)
              ?.roles?.map((r) => r.id) || []
          }
        />
      )}

      {showAddGroupModal && (
        <AddToGroupModal
          domainId={showAddGroupModal}
          onClose={() => setShowAddGroupModal(null)}
          onSubmit={(groupId) => addToGroupMutation.mutate(groupId)}
          isLoading={addToGroupMutation.isPending}
          existingGroupIds={
            memberships?.groups
              ?.filter((g) => g.domainId === showAddGroupModal)
              ?.map((g) => g.groupId) || []
          }
        />
      )}
    </div>
  );
}

// ============================================
// Modal Components
// ============================================

function AddToDomainModal({
  onClose,
  onSubmit,
  isLoading,
  existingDomainIds,
}: {
  onClose: () => void;
  onSubmit: (data: { domainId: string; role?: string }) => void;
  isLoading: boolean;
  existingDomainIds: string[];
}) {
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [role, setRole] = useState('member');

  const { data: domainsData, isLoading: loadingDomains } = useQuery({
    queryKey: ['admin', 'domains', 'all', search],
    queryFn: () => api.getAllDomains({ q: search || undefined }),
  });

  const availableDomains = domainsData?.domains?.filter(
    (d) => !existingDomainIds.includes(d.id)
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add to Domain</h2>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted"
          />

          <div className="max-h-48 overflow-y-auto space-y-2">
            {loadingDomains ? (
              <div className="text-center text-text-muted py-4">Loading...</div>
            ) : availableDomains.length === 0 ? (
              <div className="text-center text-text-muted py-4">No available domains</div>
            ) : (
              availableDomains.map((domain) => (
                <button
                  key={domain.id}
                  onClick={() => setSelectedDomain(domain.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedDomain === domain.id
                      ? 'bg-accent/10 border border-accent'
                      : 'bg-surface-hover border border-transparent hover:border-border'
                  }`}
                >
                  <p className="font-medium text-text-primary">
                    {domain.displayName || domain.name}
                  </p>
                  <p className="text-sm text-text-muted">{domain.name}</p>
                </button>
              ))
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              <option value="member">Member</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedDomain && onSubmit({ domainId: selectedDomain, role })}
            disabled={isLoading || !selectedDomain}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddToOrgModal({
  onClose,
  onSubmit,
  isLoading,
  existingOrgIds,
}: {
  onClose: () => void;
  onSubmit: (data: { organizationId: string; role?: string }) => void;
  isLoading: boolean;
  existingOrgIds: string[];
}) {
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [role, setRole] = useState('member');

  const { data: orgsData, isLoading: loadingOrgs } = useQuery({
    queryKey: ['admin', 'orgs', 'all', search],
    queryFn: () => api.getAllOrganizations({ q: search || undefined }),
  });

  const availableOrgs = orgsData?.organizations?.filter(
    (o) => !existingOrgIds.includes(o.id)
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add to Organization</h2>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted"
          />

          <div className="max-h-48 overflow-y-auto space-y-2">
            {loadingOrgs ? (
              <div className="text-center text-text-muted py-4">Loading...</div>
            ) : availableOrgs.length === 0 ? (
              <div className="text-center text-text-muted py-4">No available organizations</div>
            ) : (
              availableOrgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors flex items-center gap-3 ${
                    selectedOrg === org.id
                      ? 'bg-accent/10 border border-accent'
                      : 'bg-surface-hover border border-transparent hover:border-border'
                  }`}
                >
                  {org.avatar ? (
                    <img src={org.avatar} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                      <OrgIcon className="w-4 h-4 text-text-muted" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-text-primary">{org.name}</p>
                    <p className="text-xs text-text-muted capitalize">{org.type}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              <option value="member">Member</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedOrg && onSubmit({ organizationId: selectedOrg, role })}
            disabled={isLoading || !selectedOrg}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddRoleModal({
  domainId,
  onClose,
  onSubmit,
  isLoading,
  existingRoleIds,
}: {
  domainId: string;
  onClose: () => void;
  onSubmit: (roleId: string) => void;
  isLoading: boolean;
  existingRoleIds: string[];
}) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const { data: rolesData, isLoading: loadingRoles } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.getDomainRoles(domainId),
  });

  const availableRoles = rolesData?.roles?.filter(
    (r) => !existingRoleIds.includes(r.id)
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Assign Role</h2>

        <div className="max-h-64 overflow-y-auto space-y-2">
          {loadingRoles ? (
            <div className="text-center text-text-muted py-4">Loading...</div>
          ) : availableRoles.length === 0 ? (
            <div className="text-center text-text-muted py-4">No available roles</div>
          ) : (
            availableRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedRole === role.id
                    ? 'bg-accent/10 border border-accent'
                    : 'bg-surface-hover border border-transparent hover:border-border'
                }`}
              >
                <p className="font-medium text-text-primary">{role.displayName}</p>
                {role.description && (
                  <p className="text-sm text-text-muted">{role.description}</p>
                )}
                {role.isSystem && (
                  <span className="text-xs text-accent">System Role</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedRole && onSubmit(selectedRole)}
            disabled={isLoading || !selectedRole}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddToGroupModal({
  domainId,
  onClose,
  onSubmit,
  isLoading,
  existingGroupIds,
}: {
  domainId: string;
  onClose: () => void;
  onSubmit: (groupId: string) => void;
  isLoading: boolean;
  existingGroupIds: string[];
}) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const { data: groupsData, isLoading: loadingGroups } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'groups'],
    queryFn: () => api.getDomainGroups(domainId),
  });

  const availableGroups = groupsData?.groups?.filter(
    (g) => !existingGroupIds.includes(g.id)
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add to Group</h2>

        <div className="max-h-64 overflow-y-auto space-y-2">
          {loadingGroups ? (
            <div className="text-center text-text-muted py-4">Loading...</div>
          ) : availableGroups.length === 0 ? (
            <div className="text-center text-text-muted py-4">No available groups</div>
          ) : (
            availableGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => setSelectedGroup(group.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedGroup === group.id
                    ? 'bg-accent/10 border border-accent'
                    : 'bg-surface-hover border border-transparent hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-text-primary">{group.name}</p>
                  <span className="text-xs text-text-muted">{group.memberCount} members</span>
                </div>
                {group.description && (
                  <p className="text-sm text-text-muted mt-1">{group.description}</p>
                )}
                {group.isDefault && (
                  <span className="text-xs text-accent">Default Group</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedGroup && onSubmit(selectedGroup)}
            disabled={isLoading || !selectedGroup}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordModal({
  account,
  onClose,
  onSetPassword,
  onResetPassword,
  onForceLogout,
  isLoading,
}: {
  account?: {
    did: string;
    handle: string;
    email: string | null;
    status: string;
    hasPassword: boolean;
    activeSessions: number;
    createdAt: string;
    updatedAt: string;
  };
  onClose: () => void;
  onSetPassword: (password: string) => void;
  onResetPassword: () => void;
  onForceLogout: () => void;
  isLoading: boolean;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const passwordsMatch = newPassword === confirmPassword;
  const passwordValid = newPassword.length >= 8;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Password Management</h2>

        {account && (
          <div className="mb-6 p-4 bg-surface rounded-lg">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-muted">Handle</p>
                <p className="text-text-primary font-medium">@{account.handle}</p>
              </div>
              <div>
                <p className="text-text-muted">Email</p>
                <p className="text-text-primary font-medium">{account.email || 'Not set'}</p>
              </div>
              <div>
                <p className="text-text-muted">Password Set</p>
                <p className={`font-medium ${account.hasPassword ? 'text-green-500' : 'text-orange-500'}`}>
                  {account.hasPassword ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Active Sessions</p>
                <p className="text-text-primary font-medium">{account.activeSessions}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-text-secondary">Set New Password</h3>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className={`w-full px-4 py-2 bg-surface border rounded-lg text-text-primary placeholder:text-text-muted ${
              confirmPassword && !passwordsMatch ? 'border-red-500' : 'border-border'
            }`}
          />
          {confirmPassword && !passwordsMatch && (
            <p className="text-red-500 text-xs">Passwords do not match</p>
          )}
          <button
            onClick={() => onSetPassword(newPassword)}
            disabled={isLoading || !passwordValid || !passwordsMatch}
            className="w-full py-2 bg-accent hover:bg-accent/90 text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Setting...' : 'Set Password'}
          </button>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-text-secondary">Quick Actions</h3>

          {!showConfirmReset ? (
            <button
              onClick={() => setShowConfirmReset(true)}
              disabled={isLoading}
              className="w-full py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 rounded-lg text-sm"
            >
              Generate Temporary Password
            </button>
          ) : (
            <div className="p-3 bg-orange-500/10 rounded-lg">
              <p className="text-orange-500 text-sm mb-2">
                This will generate a temporary password and invalidate all sessions. Are you sure?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirmReset(false)}
                  className="flex-1 py-1.5 bg-surface-hover text-text-primary rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onResetPassword();
                    setShowConfirmReset(false);
                  }}
                  disabled={isLoading}
                  className="flex-1 py-1.5 bg-orange-500 text-white rounded text-sm"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onForceLogout}
            disabled={isLoading || !account?.activeSessions}
            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm disabled:opacity-50"
          >
            Force Logout ({account?.activeSessions || 0} sessions)
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function SanctionModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: { sanctionType: 'warning' | 'mute' | 'suspend' | 'ban'; reason: string; expiresAt?: string }) => void;
  isLoading: boolean;
}) {
  const [sanctionType, setSanctionType] = useState<'warning' | 'mute' | 'suspend' | 'ban'>('warning');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');

  const handleSubmit = () => {
    let expiresAt: string | undefined;
    if (duration && sanctionType !== 'ban') {
      const days = parseInt(duration);
      if (!isNaN(days)) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }
    }
    onSubmit({ sanctionType, reason, expiresAt });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Issue Sanction</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(['warning', 'mute', 'suspend', 'ban'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setSanctionType(type)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors capitalize ${
                    sanctionType === type
                      ? getSanctionColor(type)
                      : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reason for this sanction..."
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted resize-none"
              rows={3}
            />
          </div>

          {sanctionType !== 'ban' && sanctionType !== 'warning' && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Duration (days)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Leave empty for permanent"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !reason}
            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Applying...' : 'Apply Sanction'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Helper Functions & Icons
// ============================================

function getSanctionColor(type: string): string {
  const colors: Record<string, string> = {
    warning: 'bg-yellow-500/10 text-yellow-500',
    mute: 'bg-orange-500/10 text-orange-500',
    suspend: 'bg-red-500/10 text-red-500',
    ban: 'bg-red-700/10 text-red-700',
  };
  return colors[type] || colors.warning;
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function DomainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function OrgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function RoleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
