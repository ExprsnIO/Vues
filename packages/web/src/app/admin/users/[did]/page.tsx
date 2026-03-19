'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { SuspendUserModal } from '@/components/admin/modals/SuspendUserModal';
import { BanUserModal } from '@/components/admin/modals/BanUserModal';
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
  const [activeModal, setActiveModal] = useState<'suspend' | 'ban' | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'moderation' | 'domains' | 'organizations' | 'roles' | 'certificates' | 'tokens' | 'invite-codes'>('overview');

  const [showIssueCertModal, setShowIssueCertModal] = useState(false);
  const [newCertType, setNewCertType] = useState<'client' | 'code_signing'>('client');
  const [newCertName, setNewCertName] = useState('');

  const [showCreateTokenModal, setShowCreateTokenModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScopes, setNewTokenScopes] = useState<string[]>(['read']);
  const [newTokenType, setNewTokenType] = useState<'personal' | 'service'>('personal');
  const [newTokenCertId, setNewTokenCertId] = useState('');
  const [newTokenExpiresIn, setNewTokenExpiresIn] = useState<number | ''>('');
  const [newTokenValue, setNewTokenValue] = useState('');

  const [showCreateInviteModal, setShowCreateInviteModal] = useState(false);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState<number | ''>(1);
  const [newInviteExpiresIn, setNewInviteExpiresIn] = useState<number | ''>('');
  const [newInviteName, setNewInviteName] = useState('');
  const [newInviteDescription, setNewInviteDescription] = useState('');
  const [newInviteCode, setNewInviteCode] = useState('');

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

  const { data: moderationHistory } = useQuery({
    queryKey: ['admin', 'user', 'moderation-history', did],
    queryFn: () => api.adminUsersModerationHistory({ userDid: did, limit: 50 }),
  });

  const { data: certsData, refetch: refetchCerts } = useQuery({
    queryKey: ['admin', 'user', 'certificates', did],
    queryFn: () => api.adminUserCertificates(did),
  });

  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['admin', 'user', 'sessions', did],
    queryFn: () => api.adminUserSessions(did),
  });

  const { data: inviteCodesData, refetch: refetchInviteCodes } = useQuery({
    queryKey: ['admin', 'user', 'invite-codes', did],
    queryFn: () => api.adminUserInviteCodes(did),
  });

  const revokeInviteCodeMutation = useMutation({
    mutationFn: (codeId: string) => api.adminUserInviteCodeRevoke(codeId),
    onSuccess: () => {
      refetchInviteCodes();
      toast.success('Invite code revoked');
    },
    onError: () => toast.error('Failed to revoke invite code'),
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'moderation-history', did] });
      setShowSanctionModal(false);
      toast.success('Sanction applied');
    },
    onError: () => toast.error('Failed to apply sanction'),
  });

  const unsuspendMutation = useMutation({
    mutationFn: () => api.adminUsersUnsuspend({ userDid: did }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', did] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'moderation-history', did] });
      toast.success('User unsuspended');
    },
    onError: () => toast.error('Failed to unsuspend user'),
  });

  const unbanMutation = useMutation({
    mutationFn: () => api.adminUsersUnban({ userDid: did }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', did] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'moderation-history', did] });
      toast.success('User unbanned');
    },
    onError: () => toast.error('Failed to unban user'),
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

  const revokeCertMutation = useMutation({
    mutationFn: ({ certId, reason }: { certId: string; reason: string }) =>
      api.adminUserCertificateRevoke(certId, reason),
    onSuccess: () => {
      refetchCerts();
      toast.success('Certificate revoked');
    },
    onError: () => toast.error('Failed to revoke certificate'),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.adminUserSessionRevoke(sessionId),
    onSuccess: () => {
      refetchSessions();
      toast.success('Session revoked');
    },
    onError: () => toast.error('Failed to revoke session'),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.adminUserTokenRevoke(tokenId),
    onSuccess: () => {
      refetchSessions();
      toast.success('Token revoked');
    },
    onError: () => toast.error('Failed to revoke token'),
  });

  const issueCertMutation = useMutation({
    mutationFn: (data: { type: 'client' | 'code_signing'; commonName?: string }) =>
      api.adminUserCertificateIssue({ did, ...data }),
    onSuccess: () => {
      refetchCerts();
      toast.success('Certificate issued successfully');
      setShowIssueCertModal(false);
      setNewCertName('');
      setNewCertType('client');
    },
    onError: () => toast.error('Failed to issue certificate'),
  });

  const createTokenMutation = useMutation({
    mutationFn: (data: { name: string; scopes: string[]; tokenType?: 'personal' | 'service'; certificateId?: string; expiresIn?: number }) =>
      api.adminUserTokenCreate({ did, ...data }),
    onSuccess: (result: any) => {
      refetchSessions();
      setNewTokenValue(result.token);
      toast.success('API token created');
    },
    onError: () => toast.error('Failed to create token'),
  });

  const createInviteCodeMutation = useMutation({
    mutationFn: (data: { maxUses?: number; expiresIn?: number; domainId?: string; metadata?: { name?: string; description?: string } }) =>
      api.adminUserInviteCodeCreate({ did, ...data }),
    onSuccess: (result: any) => {
      refetchInviteCodes();
      setNewInviteCode(result.inviteCode.code);
      toast.success('Invite code generated');
    },
    onError: () => toast.error('Failed to generate invite code'),
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
            {activeSanction?.sanctionType === 'suspend' ? (
              <button
                onClick={() => unsuspendMutation.mutate()}
                disabled={unsuspendMutation.isPending}
                className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors text-sm"
              >
                Unsuspend User
              </button>
            ) : (
              <button
                onClick={() => setActiveModal('suspend')}
                className="px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 rounded-lg transition-colors text-sm"
              >
                Suspend User
              </button>
            )}
            {activeSanction?.sanctionType === 'ban' ? (
              <button
                onClick={() => unbanMutation.mutate()}
                disabled={unbanMutation.isPending}
                className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors text-sm"
              >
                Unban User
              </button>
            ) : (
              <button
                onClick={() => setActiveModal('ban')}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-sm"
              >
                Ban User
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'moderation', label: 'Moderation History' },
            { id: 'certificates', label: 'Certificates' },
            { id: 'tokens', label: 'Sessions & Tokens' },
            { id: 'invite-codes', label: 'Invite Codes' },
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-sm text-text-muted mb-1">Identity Method</p>
              <div className="flex items-center gap-2">
                {user.did.startsWith('did:exprsn:') ? (
                  <>
                    <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V5l-9-4zm-1 13l-3-3 1.41-1.41L11 11.17l4.59-4.58L17 8l-6 6z" />
                    </svg>
                    <span className="text-accent font-medium">did:exprsn</span>
                  </>
                ) : user.did.startsWith('did:web:') ? (
                  <>
                    <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                    <span className="text-blue-400 font-medium">did:web</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                    <span className="text-blue-400 font-medium">did:plc</span>
                  </>
                )}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-sm text-text-muted mb-1">Rate Limit Tier</p>
              <p className="font-medium text-text-primary">
                {user.did.startsWith('did:exprsn:') ? (
                  <span className="text-accent">Exprsn (90/min)</span>
                ) : (
                  <span>User (60/min)</span>
                )}
              </p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-sm text-text-muted mb-1">Feed Boost</p>
              <p className="font-medium text-text-primary">
                {user.did.startsWith('did:exprsn:') ? (
                  <span className="text-accent">1.15x active</span>
                ) : (
                  <span className="text-text-muted">None</span>
                )}
              </p>
            </div>
          </div>

          {/* Credentials Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Certificates Card */}
            <button
              onClick={() => setActiveTab('certificates')}
              className="bg-surface border border-border rounded-xl p-5 text-left hover:border-accent/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <CertificateIcon className="w-5 h-5 text-purple-500" />
                </div>
                <h4 className="font-semibold text-text-primary group-hover:text-accent transition-colors">Certificates</h4>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary">
                  {certsData?.certificates?.length ?? 0}
                </span>
                <span className="text-sm text-text-muted">issued</span>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-text-muted">
                <span className="text-green-500">
                  {certsData?.certificates?.filter((c: any) => c.status === 'active').length ?? 0} active
                </span>
                {certsData?.didCertificate && (
                  <span className="text-accent">did:exprsn</span>
                )}
              </div>
            </button>

            {/* Tokens Card */}
            <button
              onClick={() => setActiveTab('tokens')}
              className="bg-surface border border-border rounded-xl p-5 text-left hover:border-accent/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <TokenIcon className="w-5 h-5 text-blue-500" />
                </div>
                <h4 className="font-semibold text-text-primary group-hover:text-accent transition-colors">Sessions & Tokens</h4>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary">
                  {(sessionsData?.sessions?.filter((s: any) => s.isActive).length ?? 0) + (sessionsData?.tokens?.filter((t: any) => t.status === 'active').length ?? 0)}
                </span>
                <span className="text-sm text-text-muted">active</span>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-text-muted">
                <span>{sessionsData?.sessions?.filter((s: any) => s.isActive).length ?? 0} sessions</span>
                <span>{sessionsData?.tokens?.filter((t: any) => t.status === 'active').length ?? 0} API tokens</span>
              </div>
            </button>

            {/* Invite Codes Card */}
            <button
              onClick={() => setActiveTab('invite-codes')}
              className="bg-surface border border-border rounded-xl p-5 text-left hover:border-accent/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <InviteCodeIcon className="w-5 h-5 text-green-500" />
                </div>
                <h4 className="font-semibold text-text-primary group-hover:text-accent transition-colors">Invite Codes</h4>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary">
                  {inviteCodesData?.inviteCodes?.length ?? 0}
                </span>
                <span className="text-sm text-text-muted">issued</span>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-text-muted">
                <span className="text-green-500">
                  {inviteCodesData?.inviteCodes?.filter((c: any) => c.status === 'active').length ?? 0} active
                </span>
                <span>
                  {inviteCodesData?.inviteCodes?.reduce((sum: number, c: any) => sum + c.usedCount, 0) ?? 0} uses
                </span>
              </div>
            </button>
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

      {activeTab === 'moderation' && (
        <div className="space-y-6">
          {/* Active Sanctions */}
          {(moderationHistory?.sanctions?.filter((s: any) => s.active)?.length ?? 0) > 0 && (
            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">Active Sanctions</h3>
              <div className="space-y-3">
                {moderationHistory?.sanctions
                  ?.filter((s: any) => s.active)
                  .map((sanction: any) => (
                    <div
                      key={sanction.id}
                      className="flex items-start justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-3 py-1 text-sm font-medium rounded-full ${getSanctionColor(sanction.sanctionType)}`}>
                            {sanction.sanctionType.toUpperCase()}
                          </span>
                          {sanction.expiresAt && (
                            <span className="text-xs text-text-muted">
                              Expires {new Date(sanction.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-text-secondary mb-1">{sanction.reason}</p>
                        <p className="text-xs text-text-muted">
                          Applied {new Date(sanction.createdAt).toLocaleDateString()} by {sanction.createdBy}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {sanction.sanctionType === 'suspend' && (
                          <button
                            onClick={() => unsuspendMutation.mutate()}
                            disabled={unsuspendMutation.isPending}
                            className="px-3 py-1.5 text-sm bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors"
                          >
                            Unsuspend
                          </button>
                        )}
                        {sanction.sanctionType === 'ban' && (
                          <button
                            onClick={() => unbanMutation.mutate()}
                            disabled={unbanMutation.isPending}
                            className="px-3 py-1.5 text-sm bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors"
                          >
                            Unban
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Full Moderation History */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                All Sanctions ({moderationHistory?.total || 0})
              </h3>
              <button
                onClick={() => setShowSanctionModal(true)}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-sm"
              >
                Issue New Sanction
              </button>
            </div>

            {!moderationHistory?.sanctions || moderationHistory.sanctions.length === 0 ? (
              <div className="text-center py-12">
                <ShieldIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No moderation history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {moderationHistory.sanctions.map((sanction: any) => (
                  <div
                    key={sanction.id}
                    className={`flex items-start justify-between p-4 rounded-lg border ${
                      sanction.active
                        ? 'bg-surface-hover border-border'
                        : 'bg-surface border-border/50 opacity-60'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getSanctionColor(sanction.sanctionType)}`}>
                          {sanction.sanctionType}
                        </span>
                        {!sanction.active && (
                          <span className="px-2 py-0.5 text-xs bg-gray-500/10 text-gray-500 rounded-full">
                            Expired/Removed
                          </span>
                        )}
                        {sanction.expiresAt && sanction.active && (
                          <span className="text-xs text-text-muted">
                            Expires {new Date(sanction.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary mb-1">{sanction.reason}</p>
                      <p className="text-xs text-text-muted">
                        {new Date(sanction.createdAt).toLocaleDateString()} by {sanction.createdBy}
                      </p>
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

      {/* Certificates Tab */}
      {activeTab === 'certificates' && (
        <div className="space-y-6">
          {/* did:exprsn Certificate */}
          {certsData?.didCertificate && (
            <div className="bg-surface border border-accent/20 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-accent/10 rounded-lg">
                  <ShieldCheckIcon className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">did:exprsn Identity Certificate</h3>
                  <p className="text-sm text-text-muted">Certificate-backed platform identity</p>
                </div>
                <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  certsData.didCertificate.status === 'active'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                }`}>
                  {certsData.didCertificate.status}
                </span>
              </div>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <dt className="text-text-muted">Type</dt>
                  <dd className="text-text-primary font-medium">{certsData.didCertificate.certificateType}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Created</dt>
                  <dd className="text-text-primary">{new Date(certsData.didCertificate.createdAt).toLocaleDateString()}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-text-muted">Public Key</dt>
                  <dd className="text-text-primary font-mono text-xs truncate">{certsData.didCertificate.publicKeyMultibase}</dd>
                </div>
              </dl>
              <div className="mt-4 p-3 bg-accent/5 rounded-lg">
                <p className="text-xs text-text-muted">
                  This identity enables 1.15x feed ranking boost, 90 req/min rate limit tier, and content signing capability.
                </p>
              </div>
            </div>
          )}

          {/* Entity Certificates */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">CA Entity Certificates</h3>
              <button
                onClick={() => setShowIssueCertModal(true)}
                className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent/90 transition-colors text-sm"
              >
                Issue Certificate
              </button>
            </div>
            {!certsData?.certificates?.length ? (
              <div className="text-center py-8">
                <CertificateIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No certificates issued</p>
              </div>
            ) : (
              <div className="space-y-3">
                {certsData.certificates.map((cert: any) => {
                  const isExpired = new Date(cert.notAfter) < new Date();
                  const isExpiringSoon = !isExpired && new Date(cert.notAfter) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  const linkedTokenCount = (certsData as any).tokensByCert?.[cert.id] ?? 0;
                  return (
                    <div key={cert.id} className="flex items-start gap-4 p-4 bg-surface-hover rounded-lg">
                      <div className={`p-2 rounded-lg ${
                        cert.certType === 'code_signing' ? 'bg-purple-500/10' :
                        cert.certType === 'client' ? 'bg-blue-500/10' : 'bg-green-500/10'
                      }`}>
                        {cert.certType === 'code_signing' ? (
                          <CodeSignIcon className="w-4 h-4 text-purple-500" />
                        ) : cert.certType === 'client' ? (
                          <UserCertIcon className="w-4 h-4 text-blue-500" />
                        ) : (
                          <ServerCertIcon className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-text-primary text-sm">{cert.commonName}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            cert.status === 'active' && !isExpired
                              ? 'bg-green-500/10 text-green-500'
                              : cert.status === 'revoked'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {cert.status === 'active' && isExpired ? 'expired' : cert.status}
                          </span>
                          <span className="px-2 py-0.5 text-xs bg-surface rounded-full text-text-muted">
                            {cert.certType.replace('_', ' ')}
                          </span>
                          {isExpiringSoon && (
                            <span className="px-2 py-0.5 text-xs bg-amber-500/10 text-amber-500 rounded-full">
                              expiring soon
                            </span>
                          )}
                          {linkedTokenCount > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded-full">
                              {linkedTokenCount} token{linkedTokenCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-text-muted mt-2">
                          <div>
                            <span className="block text-text-muted">Serial</span>
                            <span className="font-mono text-text-secondary truncate block">{cert.serialNumber}</span>
                          </div>
                          <div>
                            <span className="block text-text-muted">Fingerprint</span>
                            <span className="font-mono text-text-secondary truncate block">{cert.fingerprint}</span>
                          </div>
                          <div>
                            <span className="block text-text-muted">Valid from</span>
                            <span className="text-text-secondary">{new Date(cert.notBefore).toLocaleDateString()}</span>
                          </div>
                          <div>
                            <span className="block text-text-muted">Expires</span>
                            <span className={isExpiringSoon || isExpired ? 'text-amber-500 font-medium' : 'text-text-secondary'}>
                              {new Date(cert.notAfter).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      {cert.status === 'active' && !isExpired && (
                        <button
                          onClick={() => {
                            const cascadeMsg = linkedTokenCount > 0
                              ? `This will also revoke ${linkedTokenCount} active token${linkedTokenCount !== 1 ? 's' : ''} linked to this certificate.\n\n`
                              : '';
                            if (confirm(`${cascadeMsg}Revoke certificate "${cert.commonName}"? This cannot be undone.`)) {
                              revokeCertMutation.mutate(
                                { certId: cert.id, reason: 'Administrative revocation' },
                                {
                                  onSuccess: (result: any) => {
                                    refetchCerts();
                                    const n = result?.cascadedTokens ?? 0;
                                    if (n > 0) {
                                      toast.success(`Certificate revoked. ${n} associated token${n !== 1 ? 's' : ''} also revoked.`);
                                    } else {
                                      toast.success('Certificate revoked');
                                    }
                                  },
                                }
                              );
                            }
                          }}
                          disabled={revokeCertMutation.isPending}
                          className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions & Tokens Tab */}
      {activeTab === 'tokens' && (
        <div className="space-y-6">
          {/* Active Sessions */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Active Sessions</h3>
              <span className="text-sm text-text-muted">
                {sessionsData?.sessions?.filter((s: any) => s.isActive).length || 0} active
              </span>
            </div>
            {!sessionsData?.sessions?.length ? (
              <div className="text-center py-8">
                <SessionIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No active sessions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessionsData.sessions.map((session: any) => (
                  <div key={session.id} className="flex items-center gap-4 p-3 bg-surface-hover rounded-lg">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${session.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{session.tokenType}</span>
                        {session.ipAddress && (
                          <span className="text-xs text-text-muted font-mono">{session.ipAddress}</span>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-text-muted mt-0.5">
                        <span>Created {new Date(session.createdAt).toLocaleString()}</span>
                        {session.lastUsedAt && (
                          <span>Last used {new Date(session.lastUsedAt).toLocaleString()}</span>
                        )}
                        {session.expiresAt && (
                          <span>Expires {new Date(session.expiresAt).toLocaleString()}</span>
                        )}
                      </div>
                      {session.userAgent && (
                        <p className="text-xs text-text-muted mt-0.5 truncate">{session.userAgent}</p>
                      )}
                    </div>
                    {session.isActive && (
                      <button
                        onClick={() => revokeSessionMutation.mutate(session.id)}
                        disabled={revokeSessionMutation.isPending}
                        className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors flex-shrink-0"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* API Tokens */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">API Tokens</h3>
                <p className="text-sm text-text-muted mt-0.5">
                  {sessionsData?.tokens?.filter((t: any) => t.status === 'active').length || 0} active
                </p>
              </div>
              <button
                onClick={() => {
                  setNewTokenValue('');
                  setNewTokenName('');
                  setNewTokenScopes(['read']);
                  setNewTokenType('personal');
                  setNewTokenCertId('');
                  setNewTokenExpiresIn('');
                  setShowCreateTokenModal(true);
                }}
                className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent/90 transition-colors text-sm"
              >
                Create Token
              </button>
            </div>

            {newTokenValue && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm font-medium text-amber-500 mb-2">
                  Copy this token now. It will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-surface px-3 py-2 rounded border border-border text-text-primary break-all">
                    {newTokenValue}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newTokenValue);
                      toast.success('Copied!');
                    }}
                    className="flex-shrink-0 px-3 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-xs transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {!sessionsData?.tokens?.length ? (
              <div className="text-center py-8">
                <TokenIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No API tokens</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessionsData.tokens.map((token: any) => {
                  const linkedCert = certsData?.certificates?.find((c: any) => c.id === token.certificateId);
                  return (
                    <div key={token.id} className="flex items-start gap-4 p-3 bg-surface-hover rounded-lg">
                      <div className={`p-1.5 rounded-lg ${
                        token.status === 'active' ? 'bg-green-500/10' : 'bg-gray-500/10'
                      }`}>
                        <TokenIcon className={`w-4 h-4 ${
                          token.status === 'active' ? 'text-green-500' : 'text-gray-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-text-primary">{token.name}</span>
                          <span className="font-mono text-xs text-text-muted">{token.prefix}...</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            token.status === 'active'
                              ? 'bg-green-500/10 text-green-500'
                              : token.status === 'revoked'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {token.status}
                          </span>
                          {token.tokenType && (
                            <span className="px-2 py-0.5 text-xs bg-surface rounded-full text-text-muted capitalize">
                              {token.tokenType}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {token.scopes.map((scope: string) => (
                            <span key={scope} className="px-1.5 py-0.5 text-[10px] bg-surface rounded text-text-muted">
                              {scope}
                            </span>
                          ))}
                        </div>
                        {linkedCert && (
                          <p className="text-xs text-blue-400 mb-1">
                            Linked cert: {linkedCert.commonName}
                          </p>
                        )}
                        <div className="flex gap-4 text-xs text-text-muted">
                          <span>Created {new Date(token.createdAt).toLocaleDateString()}</span>
                          {token.lastUsedAt && (
                            <span>Last used {new Date(token.lastUsedAt).toLocaleDateString()}</span>
                          )}
                          <span>{token.usageCount} requests</span>
                          {token.expiresAt && (
                            <span>Expires {new Date(token.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {token.status === 'active' && (
                        <button
                          onClick={() => {
                            if (confirm(`Revoke token "${token.name}"?`)) {
                              revokeTokenMutation.mutate(token.id);
                            }
                          }}
                          disabled={revokeTokenMutation.isPending}
                          className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors flex-shrink-0"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite Codes Tab */}
      {activeTab === 'invite-codes' && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Invite Codes</h3>
              <button
                onClick={() => {
                  setNewInviteCode('');
                  setNewInviteName('');
                  setNewInviteDescription('');
                  setNewInviteMaxUses(1);
                  setNewInviteExpiresIn('');
                  setShowCreateInviteModal(true);
                }}
                className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent/90 transition-colors text-sm"
              >
                Generate Invite Code
              </button>
            </div>

            {newInviteCode && (
              <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm font-medium text-green-500 mb-2">New invite code generated</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-surface px-3 py-2 rounded border border-border text-text-primary tracking-widest">
                    {newInviteCode}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newInviteCode);
                      toast.success('Copied!');
                    }}
                    className="flex-shrink-0 px-3 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-xs transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {!inviteCodesData?.inviteCodes?.length ? (
              <div className="text-center py-8">
                <InviteCodeIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No invite codes issued by this user</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inviteCodesData.inviteCodes.map((code: any) => {
                  const maxUses = code.maxUses ?? null;
                  const usagePct = maxUses ? Math.min(100, Math.round((code.usedCount / maxUses) * 100)) : 0;
                  return (
                    <div key={code.id} className="flex items-start gap-4 p-4 bg-surface-hover rounded-lg">
                      <div className={`p-2 rounded-lg ${
                        code.status === 'active' ? 'bg-green-500/10' : 'bg-gray-500/10'
                      }`}>
                        <InviteCodeIcon className={`w-4 h-4 ${
                          code.status === 'active' ? 'text-green-500' : 'text-gray-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-medium text-text-primary">{code.code}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(code.code);
                              toast.success('Copied!');
                            }}
                            className="text-text-muted hover:text-text-primary transition-colors"
                            title="Copy code"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                            </svg>
                          </button>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            code.status === 'active'
                              ? 'bg-green-500/10 text-green-500'
                              : code.status === 'revoked'
                              ? 'bg-red-500/10 text-red-500'
                              : code.status === 'expired'
                              ? 'bg-yellow-500/10 text-yellow-500'
                              : 'bg-gray-500/10 text-gray-500'
                          }`}>
                            {code.status}
                          </span>
                          {code.domainId && (
                            <span className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full">
                              Domain-scoped
                            </span>
                          )}
                        </div>
                        {code.metadata?.name && (
                          <p className="text-sm text-text-secondary mb-1">{code.metadata.name}</p>
                        )}
                        {code.metadata?.description && (
                          <p className="text-xs text-text-muted mb-1.5">{code.metadata.description}</p>
                        )}

                        {/* Usage progress */}
                        <div className="mb-2">
                          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                            <span>
                              Used {code.usedCount}/{maxUses ?? '\u221E'}
                            </span>
                            {maxUses && (
                              <span>{usagePct}%</span>
                            )}
                          </div>
                          {maxUses && (
                            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  usagePct >= 100 ? 'bg-red-500' : usagePct >= 75 ? 'bg-amber-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${usagePct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex gap-4 text-xs text-text-muted">
                          <span>Created {new Date(code.createdAt).toLocaleDateString()}</span>
                          {code.expiresAt && (
                            <span>Expires {new Date(code.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                        {code.usedBy.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {code.usedBy.map((usedDid: string) => (
                              <span key={usedDid} className="px-1.5 py-0.5 text-[10px] bg-surface rounded text-text-muted font-mono">
                                {usedDid.length > 24 ? `${usedDid.slice(0, 12)}...${usedDid.slice(-8)}` : usedDid}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {code.status === 'active' && (
                        <button
                          onClick={() => {
                            if (confirm(`Revoke invite code "${code.code}"?`)) {
                              revokeInviteCodeMutation.mutate(code.id);
                            }
                          }}
                          disabled={revokeInviteCodeMutation.isPending}
                          className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors flex-shrink-0"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Certificate Modal */}
      {showIssueCertModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Issue Certificate</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">Certificate Type</label>
                <div className="flex gap-3">
                  {(['client', 'code_signing'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewCertType(type)}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                        newCertType === type
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'bg-surface-hover border-border text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {type === 'client' ? 'Client' : 'Code Signing'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-muted mt-1.5">
                  {newCertType === 'client'
                    ? 'Client certificates are used for user authentication.'
                    : 'Code signing certificates are used to sign content and verify authorship.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">
                  Common Name <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newCertName}
                  onChange={(e) => setNewCertName(e.target.value)}
                  placeholder={`Defaults to @${user.handle}`}
                  className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowIssueCertModal(false);
                  setNewCertName('');
                  setNewCertType('client');
                }}
                className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  issueCertMutation.mutate({
                    type: newCertType,
                    ...(newCertName ? { commonName: newCertName } : {}),
                  })
                }
                disabled={issueCertMutation.isPending}
                className="flex-1 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent/90 transition-colors text-sm disabled:opacity-50"
              >
                {issueCertMutation.isPending ? 'Issuing...' : 'Issue Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Token Modal */}
      {showCreateTokenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Create API Token</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">
                  Token Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="e.g. CI Deploy, Mobile App"
                  className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">Token Type</label>
                <div className="flex gap-3">
                  {(['personal', 'service'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewTokenType(type)}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        newTokenType === type
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'bg-surface-hover border-border text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">Scopes</label>
                <div className="grid grid-cols-3 gap-2">
                  {['read', 'write', 'admin', 'upload', 'stream'].map((scope) => (
                    <label
                      key={scope}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        newTokenScopes.includes(scope)
                          ? 'bg-accent/10 border-accent'
                          : 'bg-surface-hover border-border hover:border-accent/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newTokenScopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewTokenScopes((prev) => [...prev, scope]);
                          } else {
                            setNewTokenScopes((prev) => prev.filter((s) => s !== scope));
                          }
                        }}
                        className="sr-only"
                      />
                      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                        newTokenScopes.includes(scope) ? 'bg-accent border-accent' : 'border-border'
                      }`}>
                        {newTokenScopes.includes(scope) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-text-primary">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>
              {(certsData?.certificates?.filter((c: any) => c.status === 'active')?.length ?? 0) > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1.5">
                    Link to Certificate <span className="text-text-muted font-normal">(optional)</span>
                  </label>
                  <select
                    value={newTokenCertId}
                    onChange={(e) => setNewTokenCertId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">No certificate</option>
                    {certsData?.certificates
                      ?.filter((c: any) => c.status === 'active')
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.commonName} ({c.certType.replace('_', ' ')})
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">
                  Expiration <span className="text-text-muted font-normal">(days, optional)</span>
                </label>
                <input
                  type="number"
                  value={newTokenExpiresIn}
                  onChange={(e) => setNewTokenExpiresIn(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="Leave empty for no expiration"
                  min={1}
                  className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateTokenModal(false)}
                className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createTokenMutation.mutate({
                    name: newTokenName,
                    scopes: newTokenScopes,
                    tokenType: newTokenType,
                    ...(newTokenCertId ? { certificateId: newTokenCertId } : {}),
                    ...(newTokenExpiresIn !== '' ? { expiresIn: newTokenExpiresIn as number } : {}),
                  }, {
                    onSuccess: () => setShowCreateTokenModal(false),
                  })
                }
                disabled={createTokenMutation.isPending || !newTokenName.trim() || newTokenScopes.length === 0}
                className="flex-1 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent/90 transition-colors text-sm disabled:opacity-50"
              >
                {createTokenMutation.isPending ? 'Creating...' : 'Create Token'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Invite Code Modal */}
      {showCreateInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Generate Invite Code</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">
                  Name / Label <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newInviteName}
                  onChange={(e) => setNewInviteName(e.target.value)}
                  placeholder="e.g. Friend invite, Beta access"
                  className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">
                  Description <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newInviteDescription}
                  onChange={(e) => setNewInviteDescription(e.target.value)}
                  placeholder="Internal note about this invite"
                  className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">Max Uses</label>
                <input
                  type="number"
                  value={newInviteMaxUses}
                  onChange={(e) => setNewInviteMaxUses(e.target.value ? parseInt(e.target.value) : '')}
                  min={1}
                  placeholder="Default: 1"
                  className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">
                  Expiration <span className="text-text-muted font-normal">(days, optional)</span>
                </label>
                <input
                  type="number"
                  value={newInviteExpiresIn}
                  onChange={(e) => setNewInviteExpiresIn(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="Leave empty for no expiration"
                  min={1}
                  className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateInviteModal(false)}
                className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createInviteCodeMutation.mutate({
                    ...(newInviteMaxUses !== '' ? { maxUses: newInviteMaxUses as number } : {}),
                    ...(newInviteExpiresIn !== '' ? { expiresIn: newInviteExpiresIn as number } : {}),
                    ...(newInviteName || newInviteDescription
                      ? { metadata: { name: newInviteName || undefined, description: newInviteDescription || undefined } }
                      : {}),
                  }, {
                    onSuccess: () => setShowCreateInviteModal(false),
                  })
                }
                disabled={createInviteCodeMutation.isPending}
                className="flex-1 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent/90 transition-colors text-sm disabled:opacity-50"
              >
                {createInviteCodeMutation.isPending ? 'Generating...' : 'Generate Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <SuspendUserModal
        isOpen={activeModal === 'suspend'}
        onClose={() => setActiveModal(null)}
        user={{
          did: user.did,
          handle: user.handle,
          displayName: user.displayName,
        }}
      />

      <BanUserModal
        isOpen={activeModal === 'ban'}
        onClose={() => setActiveModal(null)}
        user={{
          did: user.did,
          handle: user.handle,
          displayName: user.displayName,
        }}
      />

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

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V5l-9-4zm-1 13l-3-3 1.41-1.41L11 11.17l4.59-4.58L17 8l-6 6z" />
    </svg>
  );
}

function CertificateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function CodeSignIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function UserCertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function ServerCertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function SessionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function TokenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function InviteCodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}
